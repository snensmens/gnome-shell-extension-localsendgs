import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';

import { AcceptPolicy, PinPolicy, QuickSavePolicy, TransferState } from './enums.js';

Gio._promisify(Gio.File.prototype, "replace_contents_async", "replace_contents_finish");


export const FileServer = GObject.registerClass({
  Signals: {
    'transfer-request': {
      // [Soup.ServerMessage, requester alias, number of files, size in bytes]
      param_types: [GObject.TYPE_OBJECT, GObject.TYPE_STRING, GObject.TYPE_INT, GObject.TYPE_INT],
    },
    'upload-progress': {},
    'upload-canceled': {},
    'upload-finished': {
      // [number of files]
      param_types: [GObject.TYPE_INT]
    },
  },
},
class FileServer extends Soup.Server {
  constructor({address, certificate, settingsService}) {
    print(`creating new FileServer`);

    super();
    this._port = settingsService.getFileServerPort();
    this._storagePath = settingsService.getStoragePath();
    this._acceptPolicy = settingsService.getAcceptPolicy();
    this._pinPolicy = settingsService.getPinPolicy();
    this._quickSavePolicy = settingsService.getQuickSavePolicy();
    this._pin = settingsService.getPin();
    this._settingsService = settingsService;
    this.session = null;

    this.set_tls_certificate(certificate);

    this.add_handler("/api/localsend/v2/prepare-upload", (server, msg, path, query) => {
      this._prepareUpload({message: msg, query: query});
    });

    this.add_handler("/api/localsend/v2/upload", (server, msg, path, query) => {
      this._handleUpload({message: msg, query: query}).catch(console.error);
    });

    this.add_handler("/api/localsend/v2/cancel", (server, msg, path, query) => {
      this._handleCancellation({message: msg, query: query});
    });

    this.connect("request-started", (_, msg) => {
      msg.connect("got-chunk", (_, chunk) => {
        if (msg.get_uri().to_string().includes('/api/localsend/v2/upload?')) {
          this.emit('upload-progress');

          //this.session.receivedBytes += chunk.get_size();
          //const progress = this.session.receivedBytes / this.session.totalSize;
        }
      });
    });

    this.listen(
      Gio.InetSocketAddress.new_from_string(address, this._port),
      Soup.ServerListenOptions.HTTPS
    );
  }

  accept(message) {
    message.get_response_body().append( new UploadResponse(this.session).toString() );
    message.set_status(Soup.Status.OK, null);
    message.unpause();
  }

  reject(message) {
    this.session = null;

    message.set_status(Soup.Status.FORBIDDEN, null);
    message.unpause();
  }

  hasSession() {
    return this.session !== null;
  }

  _prepareUpload({message, query}) {
    // refuse to prepare a new upload when a session is alread present
    if (this.session !== null) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    try {
      const uploadRequest = JSON.parse(new TextDecoder().decode(message.get_request_body().data));
      const isFavorite = this._settingsService.isFavorite(uploadRequest?.info?.fingerprint);

      if (!AcceptPolicy.doesAccept(this._acceptPolicy, isFavorite)) {
        message.set_status(Soup.Status.FORBIDDEN, null);
        return
      }

      if (PinPolicy.requiresPin(this._pinPolicy, isFavorite) && this._pin !== query?.pin) {
        message.set_status(Soup.Status.UNAUTHORIZED, null);
        return
      }

      this._setSessionFromUploadRequest(message.get_remote_host(), uploadRequest);

      if (QuickSavePolicy.allowsQuickSave(this._quickSavePolicy, isFavorite)) {
        message.get_response_body().append( new UploadResponse(this.session).toString() );
        message.set_status(Soup.Status.OK, null);
        return
      }

      message.pause();
      this.emit('transfer-request',
        message,
        this.session.sender.alias,
        this.session.files.length,
        this.session.totalSize
      );
    }
    catch (error) {
      this.session = null;

      if (error instanceof SyntaxError) {
        message.set_status(Soup.Status.BAD_REQUEST, null);
        return
      }

      print(`preparing upload failed: ${error}`);
      message.set_status(Soup.Status.INTERNAL_SERVER_ERROR, null);
      return
    }
  }

  async _handleUpload({message, query}) {
    // this parameters are required and have to be present
    if (!query?.sessionId || !query?.fileId || !query?.token) {
      message.set_status(Soup.Status.BAD_REQUEST, null);
      return
    }

    // a session must be present in order to upload files
    if (!this.hasSession()) {
      message.set_status(Soup.Status.NOT_FOUND, null);
      return
    }

    // block upload requests from other localSend clients
    if (query.sessionId !== this.session.id) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    for (const file of this.session.files) {
      if (file.id === query.fileId && file.token === query.token) {
        if (file.state === TransferState.FINISHED) {
          message.set_status(Soup.Status.NO_CONTENT, null);
          return
        }

        const targetFile = Gio.File.new_for_path(`${this._storagePath}/${file.name}`);
        message.pause();

        // TODO: this loads the whole response to RAM an then creates a new file from that.
        // This can be a problem when receiving very large files.
        // Alternative: directly write the chunks to a file
        await targetFile.replace_contents_async(
          message.get_request_body().data,
          null,
          false,
          Gio.FileCreateFlags.NONE,
          null,
        );

        file.state = TransferState.FINISHED;

        message.set_status(Soup.Status.OK , null);
        message.unpause();

        // localSend doesnt tell us when all uploads are done
        // we have to check it ourself after every upload
        if (this.session.files.every(f => f.state === TransferState.FINISHED)) {
          this.emit('upload-finished', this.session.files.length);
          this.session = null;
        }

        return
      }
    }

    // refuse the upload requeset because the requested file to upload is either:
    // - not part of the session
    // - was send with an invalid token
    message.set_status(Soup.Status.FORBIDDEN , null);
  }

  _handleCancellation({message, query}) {
    // block cancel requests from other localSend clients
    if (query?.sessionId !== this.session.id) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    if(this.hasSession()) {
      this.emit('upload-canceled');
    }

    this.session = null;
    message.set_status(Soup.Status.OK, null);
  }

  _setSessionFromUploadRequest(origin, uploadRequest) {
    this.session = new Session({
      alias: uploadRequest.info.alias,
      deviceType: uploadRequest.info.deviceType,
      fingerprint: uploadRequest.info.fingerprint,
      port: uploadRequest.info.port,
      origin: origin
    });

    for (const id in uploadRequest.files) {
      this.session.addFile({
        id: uploadRequest.files[id].id,
        name: uploadRequest.files[id].fileName,
        type: uploadRequest.files[id].fileType,
        size: uploadRequest.files[id].size,
      });
    }
  }
});


class Session {
  constructor({ alias, deviceType, fingerprint, port, origin }) {
    this.id = GLib.uuid_string_random();
    this.sender = {
      alias: alias,
      deviceType: deviceType,
      fingerprint: fingerprint,
      port: port,
      origin: origin
    };
    this.files = [];
    this.totalSize = 0;
    this.receivedBytes = 0;
  }

  addFile({ id, name, type, size }) {
    this.files.push({
      id: id,
      name: name,
      type: type,
      size: size,
      token: GLib.uuid_string_random(),
      state: TransferState.OPEN,
    });

    this.totalSize += size;
  }

  toString() {
    return JSON.stringify(this);
  }
}


class UploadResponse {
  constructor(session) {
    this.sessionId = session.id;
    this.files = {};

    for(const file of session.files) {
      this.files[file.id] = file.token;
    }
  }

  toString() {
    return JSON.stringify(this);
  }
}
