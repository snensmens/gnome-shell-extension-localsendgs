import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';


export default class NotificationService {
  constructor({icon}) {
    this.icon = icon;
    this._notificationSource = null;
  }

  askForPermission({alias, fileCount, size, onAccept, onDismiss}) {
    // convert size from bytes to a better readable unit
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const exp = Math.floor(Math.log(size) / Math.log(1024));
    const preferredUnit = Math.min(exp , units.length);
    const prettyFileSize = (''+(size / Math.pow(1024, exp)).toFixed(1)).replace('.0', '');

    const notification = this._createNotification({
      title: _('New file share request'),
      body: ngettext(
        '%s wants to send %d file (%f %s)',
        '%s wants to send %d files (%f %s)',
        fileCount
      ).format(alias, fileCount, prettyFileSize, units[preferredUnit]),
      iconName: 'emblem-shared-symbolic',
    });

    /*
      the destroy signal only tells us that the notification was closed by the user,
      but not in what context. we keep track of it here.
    */
    let wasHandledByAction = false;

    notification.addAction(_('Reject'), () => {
      wasHandledByAction = true;
      onDismiss();
    });
    notification.addAction(_('Accept'), () => {
      wasHandledByAction = true;
      onAccept();
    });
    notification.connect('destroy', (_, reason) => {
      if (!wasHandledByAction) {
        onDismiss();
      }
    });

    return notification;
  }

  notifySuccess({fileCount, saveLocation}) {
    const notification = this._createNotification({
      title: _(`Success`),
      body: ngettext(
        'Saved %d file',
        'Saved %d files',
        fileCount
      ).format(fileCount),
      iconName: 'folder-download-symbolic',
    });

    notification.connect('activated', (_) => {
      Gio.Subprocess.new(['xdg-open', saveLocation], null);
    });

    notification.addAction(_(`Show in Files`), () => {
      Gio.Subprocess.new(['xdg-open', saveLocation], null);
    });

    return notification;
  }

  notifyProgress({onCancel}) {
    const notification = this._createNotification({
      title: _(`Transferring`),
      body: _(`Files are being transferred`),
      iconName: 'network-transmit-symbolic',
    });

    notification.addAction(_(`Cancel`), () => {
      onCancel();
    });

    return notification;
  }

  notifyCancellation() {
    return this._createNotification({
      title: _(`Transfer canceled`),
      body: _(`The sender has canceled the transfer`),
      iconName: 'process-stop-symbolic',
    });
  }

  _createNotification({title, body, iconName}) {
    const notification = new MessageTray.Notification({
        source: this._getNotificationSource(),
        title: title,
        body: body,
        iconName: iconName,
        urgency: MessageTray.Urgency.HIGH,
    });

    MessageTray.getSystemSource().addNotification(notification);

    return notification;
  }

  _getNotificationSource() {
    if (!this._notificationSource) {
        const notificationPolicy = new NotificationLocalSendGSPolicy();

        this._notificationSource = new MessageTray.Source({
            title: 'LocalSendGS',
            icon: Gio.icon_new_for_string(`${this.icon}`),
            policy: notificationPolicy,
        });

        // Reset the notification source if it's destroyed
        this._notificationSource.connect('destroy', _source => {
            this._notificationSource = null;
        });
        Main.messageTray.add(this._notificationSource);
    }

    return this._notificationSource;
  }
}


export const NotificationLocalSendGSPolicy = GObject.registerClass(
class NotificationLocalSendGSPolicy extends MessageTray.NotificationPolicy {
  _init() {
      super._init();
  }

  get enable() {
    return true;
  }

  get showBanners() {
    return true;
  }

  get forceExpanded() {
    return true;
  }
});
