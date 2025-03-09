/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

import NotificationService from './notifications.js';
import SettingsService from './settings.js';
import { LocalSendClient } from './client.js';
import { FileServer } from './fileserver.js';
import { AcceptPolicy } from './enums.js';
import { createMulticastSocket, getLocalIpAddress } from './networking.js';
import { createPrivateKey, createCertificate } from './security.js';


const PROTOCOL_VERSION = '2.1';


const LocalSendGSIndicator = GObject.registerClass(
class LocalSendGSIndicator extends SystemIndicator {
  constructor(extension) {
    super();

    this.indicator = this._addIndicator();
    this.indicator.gicon = Gio.icon_new_for_string(`${extension.path}/resources/icon-symbolic.svg`);
    this.indicator.visible = false;
  }

  showIcon(show) {
    this.indicator.visible = show;
  }
});


const LocalSendGSQuickToggle = GObject.registerClass(
class LocalSendGSQuickToggle extends QuickToggle {
  constructor(extension) {
    super({
      title: 'LocalSendGS',
      toggleMode: true,
    });

    this.gicon = Gio.icon_new_for_string(`${extension.path}/resources/icon-symbolic.svg`);
  }
});


export default class LocalSendGSExtension extends Extension {
  enable() {
    this.localSendClient = null;
    this.socket = null;
    this.fileServer = null;
    this.dataAvailableSource = null;
    this.device = null;
    this.permissionNotification = null;
    this.progressNotification = null;

    this.settings = this.getSettings('org.gnome.shell.extensions.localsendgs');
    this.settings.set_boolean('extension-active', false);

    this.notificationService = new NotificationService({
      icon: `${this.path}/resources/icon-symbolic.svg`
    });
    this.settingsService = new SettingsService({ settings: this.settings });
    this.settingsService.clearAvailableDevices();

    if (this.settingsService.getStoragePath() === '') {
      this.settingsService.setStoragePath(
        GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)
      );
    }

    if (this.settingsService.getPin() === '') {
      let pin = '';

      while (pin.length < 6) {
        pin += Math.floor(Math.random() * 10)
      }

      this.settingsService.setPin(pin);
    }

    if (this.settingsService.getFingerprint() === '') {
      this.settingsService.setFingerprint(GLib.uuid_string_random());
    }

    this.toggle = new LocalSendGSQuickToggle(this);
    this.indicator = new LocalSendGSIndicator(this);
    this.indicator.quickSettingsItems.push(this.toggle);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this.indicator);

    this.settings.bind('extension-active', this.toggle, 'checked', Gio.SettingsBindFlags.DEFAULT);

    this.showIconHandlerId = this.settings.connect('changed::show-icon', (settings, _key) => {
      this.indicator.showIcon(this.toggle.checked && this.settings.get_boolean('show-icon'));
    });

    this.toggleCheckedHandlerId = this.toggle.connect('notify::checked', async () => {
      const isChecked = this.toggle.checked;

      this.indicator.showIcon(isChecked && this.settings.get_boolean('show-icon'));
      this.toggle.subtitle = null;

      try {
        this.toggle.checked ? await this.setup() : this.shutdown();

        if (isChecked && this.settingsService.getAcceptPolicy() === AcceptPolicy.FAVORITES_ONLY) {
          this.toggle.subtitle = _('Favorites only');
        }
      }
      catch(error) {
        print(`setting up LocalSendGS failed: ${error}`);
      }
    });

    this.toggle.checked = this.settingsService.getEnableOnLogin();
  }

  disable() {
    this.shutdown();
    this.settingsService.clearAvailableDevices();

    this.notificationService = null;
    this.settingsService = null;

    this.indicator.quickSettingsItems.forEach(item => item.destroy());
    this.indicator.destroy();
    this.indicator = null;

    this.settings.disconnect(this.showIconHandlerId);
    this.settings.disconnect(this.toggleCheckedHandlerId);
    this.settings = null;
    this.showIconHandlerId = null;
  }

  async setup() {
    print(`setup LocalSendGS`);

    await createPrivateKey({
      path: `${this.path}/resources/key.pem`,
      cancellable: null
    });

    await createCertificate({
      path: `${this.path}/resources/cert.pem`,
      key: `${this.path}/resources/key.pem`,
      template: `${this.path}/resources/cert-template.cfg`,
      cancellable: null
    });

    const ipAddress = await getLocalIpAddress();
    if (ipAddress === null) {
      print(`no ip address - set toggle back to inactive`);
      this.toggle.checked = false;
      return
    }

    this.device = {
      alias: this.settingsService.getAlias(),
      version: PROTOCOL_VERSION,
      deviceModel: "Linux",
      deviceType: "computer",
      fingerprint: this.settingsService.getFingerprint(),
      port: Number(this.settingsService.getFileServerPort()),
      protocol: "https",
      download: false,
      announce: true,
    }

    this.localSendClient = new LocalSendClient();

    this.fileServer = new FileServer({
      address: ipAddress,
      certificate: Gio.TlsCertificate.new_from_files(
        `${this.path}/resources/cert.pem`,
        `${this.path}/resources/key.pem`,
      ),
      settingsService: this.settingsService,
    });
    this.fileServer.connect('transfer-request', (...request) => this.onTransferRequest(...request));
    this.fileServer.connect('upload-progress', (server) => this.onUploadProgress(server));
    this.fileServer.connect('upload-canceled', (server) => this.onUploadCanceled(server));
    this.fileServer.connect('upload-finished', (server, fileCount) => this.onUploadFinished(server, fileCount));

    this.socket = createMulticastSocket({
      group: this.settingsService.getMulticastGroup(),
      port: this.settingsService.getMulticastPort(),
    });

    this.dataAvailableSource = this.socket.create_source(GLib.IOCondition.IN, null);
    this.dataAvailableSource.set_callback(() => this.onMulticastMessage());
    this.dataAvailableSource.attach(null);

    // introduce ourself to the multicast group,
    // so that other LocalSend clients can introduce themself in response
    print(`send introduction to multicast group`);
    this.socket.send_to(
      Gio.InetSocketAddress.new_from_string(
        this.settingsService.getMulticastGroup(),
        this.settingsService.getMulticastPort(),
      ),
      new TextEncoder().encode(JSON.stringify(this.device)),
      null,
    );
  }

  shutdown() {
    print(`shutdown LocalSendGS`);
    this.device = null;

    this.localSendClient?.destroy();
    this.localSendClient = null;

    this.dataAvailableSource?.destroy();
    this.dataAvailableSource = null;

    this.fileServer?.disconnect();
    this.fileServer = null;

    this.socket?.close();
    this.socket = null;

    this.permissionNotification?.destroy();
    this.permissionNotification = null;

    this.progressNotification?.destroy();
    this.progressNotification = null;
  }

  onMulticastMessage() {
    print(`new message in multicast group`);
    const [bytes, sender] = this.socket.receive_bytes_from(this.socket.get_available_bytes(), -1, null);
    const origin = sender.get_address().to_string();
    const device = JSON.parse(new TextDecoder().decode(bytes.toArray()));

    print(`discovered new device ${device.alias}`);
    print(JSON.stringify(device, null, 2))

    this.settingsService.addDiscoveredDevice({
      alias: device.alias,
      fingerprint: device.fingerprint,
      type: device.deviceType,
      model: device.deviceModel,
    });

    this.localSendClient.registerDeviceAt({
      address: origin,
      port: device.port,
      protocol: device.protocol,
      device: this.device,
    })
    .then(() => print(`registration successful`))
    .catch(e => print(`registering failed: ${e}`));

    return GLib.SOURCE_CONTINUE;
  }

  onTransferRequest(server, message, alias, fileCount, size) {
    print(`new transfer request from ${alias} (${fileCount} files, ${size} bytes)`);

    this.permissionNotification = this.notificationService.askForPermission({
      alias: alias,
      fileCount: fileCount,
      size: size,
      onAccept: () => {
        print(`user accepted the request`);
        server.accept(message);
        this.permissionNotification = null;
      },
      onDismiss: () => {
        print(`user rejected the request`);
        server.reject(message);
        this.permissionNotification = null;
      }
    });
  }

  onUploadProgress(server) {
    // this event can be triggered after a 'upload-canceled' event
    // to prevent that a new notification is shown in this case we also check if a session is available
    if (!this.progressNotification && server.hasSession()) {
      this.progressNotification = this.notificationService.notifyProgress({
        onCancel: () => {
          this.localSendClient.sendCancelRequest({
            address: server._uploadSession.sender.origin,
            port: server._uploadSession.sender.port,
            protocol: server._uploadSession.sender.protocol,
            sessionId: server._uploadSession.id,
          })
          .then(() => {
            this.progressNotification = null;

            server._uploadSession = null;
            server.emit('upload-canceled');
          })
          .catch(e => {
            this.progressNotification = null;
            print(`cancelling failed: ${e}`);
          });
        }
      });
    }
  }

  onUploadCanceled(server) {
    print(`upload canceled`);
    this.permissionNotification?.destroy();
    this.permissionNotification = null;

    this.progressNotification?.destroy();
    this.progressNotification = null;

    this.notificationService.notifyCancellation();
  }

  onUploadFinished(server, fileCount) {
    print(`upload finished`);
    this.progressNotification?.destroy();
    this.progressNotification = null;

    this.notificationService.notifySuccess({
      fileCount: fileCount,
      saveLocation: this.settingsService.getStoragePath()
    });
  }
}
