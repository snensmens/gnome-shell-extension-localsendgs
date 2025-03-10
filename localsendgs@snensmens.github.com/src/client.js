import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, "send_and_read_async", "send_and_read_finish");


export class LocalSendClient {
  constructor() {
    print(`creating new LocalSendClient`)
    this._session = new Soup.Session();
  }

  async registerDeviceAt({address, port, protocol, device}) {
    const registerEndpoint = `${protocol}://${address}:${port}/api/localsend/v2/register`;
    print(`register self at ${registerEndpoint} with ${JSON.stringify(device)}`);

    await this._sendPostRequest({
      endpoint: registerEndpoint,
      requestBody: JSON.stringify(device),
    });
  }

  async sendCancelRequest({ address, port, protocol, sessionId }) {
    const cancelEndpoint = `${protocol}://${address}:${port}/api/localsend/v2/cancel?sessionId=${sessionId}`;
    print(`sending cancel request to ${cancelEndpoint}`);

    await this._sendPostRequest({ endpoint: cancelEndpoint });
  }

  async _sendPostRequest({ endpoint, requestBody }) {
    const message = Soup.Message.new("POST", endpoint);
    message.connect("accept-certificate", (_message, _certificat,_tlsErrors) => true);

    if (requestBody) {
      message.set_request_body_from_bytes(
        "application/json",
        GLib.Bytes.new(new TextEncoder().encode(requestBody))
      );
    }

    const response = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

    if (message.get_status() !== Soup.Status.OK) {
      throw `${message.get_status()} ${message.get_reason_phrase()}`;
    }

    return response;
  }

  destroy() {
    this._session.abort();
    this._session = null;
  }
}
