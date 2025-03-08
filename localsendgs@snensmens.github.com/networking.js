import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import GObject from 'gi://GObject';

Gio._promisify(Gio.File.prototype, "replace_contents_async", "replace_contents_finish");
Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");


export const TransferState = {
    OPEN: 0,
    FINISHED: 1,
};

export const AcceptPolicy = {
    EVERYONE: 0,
    FAVORITES_ONLY: 1,
};

export const QuickSavePolicy = {
    NEVER: 0,
    FAVORITES_ONLY: 1,
    ALWAYS: 2,
};

export const PinPolicy = {
    NEVER: 0,
    IF_NOT_FAVORITE: 1,
    ALWAYS: 2,
};

export const VisibilityPolicy = {
    EVERYONE: 0,
    FAVORITES_ONLY: 1,
};


export async function getLocalIpAddress() {
  const proc = new Gio.Subprocess({
    argv: ["hostname", "-I"],
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
  });
  proc.init(null);

  try {
    const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

    if (proc.get_exit_status() == 0) {
        return stdout.split(" ")[0]
    }
    else {
        throw stderr.trim();
    }
  } catch (e) {
    console.error(`fetching local ip address failed: ${e}`);
  }

  return null
}


export function createMulticastSocket({group, port}) {
  print(`creating new multicast socket (group: ${group}, port: ${port})`);

  const socket = Gio.Socket.new(Gio.SocketFamily.IPV4, Gio.SocketType.DATAGRAM, Gio.SocketProtocol.UDP);
  socket.set_option(1, 2, 1); // enable reusing address bindings at socket level
  socket.set_blocking(false);
  socket.set_multicast_loopback(false); // we dont want to receive our own messages
  socket.bind(
    new Gio.InetSocketAddress({ address: Gio.InetAddress.new_any(Gio.SocketFamily.IPV4), port: port }),
    true
  );
  socket.join_multicast_group(Gio.InetAddress.new_from_string(group), false, null);

  return socket;
}


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
    this._uploadSession = null;

    this.set_tls_certificate(certificate);

    this.add_handler("/api/localsend/v2/prepare-upload", (server, msg, _path, query) => {
      this._prepareUpload({message: msg, query: query});
    });

    this.add_handler("/api/localsend/v2/upload", (_server, msg, _path, query) => {
      this._handleUpload({message: msg, query: query}).catch(console.error);
    });

    this.add_handler("/api/localsend/v2/cancel", (_server, msg, _path, query) => {
      this._handleCancellation({message: msg, query: query});
    });

    this.connect("request-started", (_, msg) => {
      msg.connect("got-chunk", (_, chunk) => {
        if (msg.get_uri().to_string().includes('/api/localsend/v2/upload?')) {
          this.emit('upload-progress');

          //this._uploadSession.receivedBytes += chunk.get_size();
          //const progress = this._uploadSession.receivedBytes / this._uploadSession.totalSize;
        }
      });
    });

    this.listen(
      Gio.InetSocketAddress.new_from_string(address, this._port),
      Soup.ServerListenOptions.HTTPS
    );
  }

  acceptTransfer(message) {
    message.get_response_body().append(JSON.stringify(
      this._createResponseForUploadRequest(this._uploadSession)
    ));
    message.set_status(Soup.Status.OK, null);
    message.unpause();
  }

  rejectTransfer(message) {
    this._uploadSession = null;

    message.set_status(Soup.Status.FORBIDDEN, null);
    message.unpause();
  }

  hasSession() {
    return this._uploadSession !== null;
  }

  _prepareUpload({message, query}) {
    // refuse to prepare a new upload when a session is alread present
    if (this._uploadSession !== null) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    try {
      const uploadRequest = JSON.parse(new TextDecoder().decode(message.get_request_body().data));
      const isFavorite = this._settingsService.isFavorite(uploadRequest?.info?.fingerprint);

      if (this._acceptPolicy === AcceptPolicy.FAVORITES_ONLY && !isFavorite) {
        message.set_status(Soup.Status.FORBIDDEN, null);
        return
      }

      if ((this._pinPolicy === PinPolicy.ALWAYS || (this._pinPolicy === PinPolicy.IF_NOT_FAVORITE && !isFavorite))
          && this._pin !== query?.pin) {

        message.set_status(Soup.Status.UNAUTHORIZED, null);
        return
      }

      this._setSessionFromUploadRequest(message.get_remote_host(), uploadRequest);

      if (this._quickSavePolicy === QuickSavePolicy.ALWAYS ||
        (this._quickSavePolicy === QuickSavePolicy.FAVORITES_ONLY && isFavorite)) {

        message.get_response_body().append(JSON.stringify(
          this._createResponseForUploadRequest(this._uploadSession)
        ));

        message.set_status(Soup.Status.OK, null);
        return
      }

      message.pause();
      this.emit('transfer-request',
        message,
        this._uploadSession.sender.alias,
        this._uploadSession.files.length,
        this._uploadSession.totalSize
      );
    }
    catch (error) {
      this._uploadSession = null;

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
    if (!this._uploadSession) {
      message.set_status(Soup.Status.NOT_FOUND, null);
      return
    }

    // block upload requests from other localSend clients
    if (query.sessionId !== this._uploadSession.id) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    for (const file of this._uploadSession.files) {
      if (file.id === query.fileId && file.token === query.token) {
        if (file.state === TransferState.FINISHED) {
          message.set_status(Soup.Status.NO_CONTENT, null);
          return
        }

        const targetFile = Gio.File.new_for_path(`${this._storagePath}/${file.fileName}`);
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
        if (this._uploadSession.files.every(f => f.state === TransferState.FINISHED)) {
          this.emit('upload-finished', this._uploadSession.files.length);
          this._uploadSession = null;
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
    if (query && (query.sessionId !== this._uploadSession.id)) {
      message.set_status(Soup.Status.CONFLICT, null);
      return
    }

    if(this._uploadSession) {
      this.emit('upload-canceled');
    }

    this._uploadSession = null;
    message.set_status(Soup.Status.OK, null);
  }

  _setSessionFromUploadRequest(origin, uploadRequest) {
    if (!uploadRequest.info.alias || !uploadRequest.info.version ||
        !uploadRequest.info.fingerprint || !uploadRequest.info.port ||
        !uploadRequest.info.protocol || !uploadRequest.files
    ) {
      throw new SyntaxError();
    }

    const session = {
      id: GLib.uuid_string_random(),
      sender: {
        ...uploadRequest.info,
        origin: origin,
      },
      files: [],
      totalSize: 0,
      receivedBytes: 0,
    };

    session.sender.deviceModel = uploadRequest.info.deviceModel ?? null;
    session.sender.deviceType = uploadRequest.info.deviceType ?? null;
    session.sender.download = uploadRequest.info.download ?? false;

    for (const id in uploadRequest.files) {
      const file = uploadRequest.files[id]

      if (!file.id || !file.fileName || !file.fileType || !file.size) {
        throw new SyntaxError();
      }

      session.files.push({
        ...file,
        token: GLib.uuid_string_random(),
        state: TransferState.OPEN,
      });

      session.totalSize += file.size;
    }

    this._uploadSession = session;
  }

  _createResponseForUploadRequest(uploadSession) {
    const response = {
      sessionId: uploadSession.id,
      files: {}
    };

    for(const file of uploadSession.files) {
      response.files[file.id] = file.token;
    }

    return response;
  }
});
