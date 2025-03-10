import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import SettingsService from './settings.js';

Gio._promisify(Gtk.FileDialog.prototype, 'select_folder', 'select_folder_finish');


export default class LocalSendGSPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this.settings = this.getSettings();
    this.settingsService = new SettingsService({ settings: this.settings });

    const generalPage = new GeneralSettingsPage(window, this.settings);
    window.add(generalPage);

    const favoritesPage = new FavoritesPage(this.settings);
    window.add(favoritesPage);
  }
}


const GeneralSettingsPage = GObject.registerClass({
  GTypeName: 'GeneralSettingsPage',
  Template: GLib.uri_resolve_relative(
    import.meta.url, './resources/ui/settings-page-general.ui',
    GLib.UriFlags.NONE
  ),
  InternalChildren: [
    'disclaimer',
    'generalGroup',
    'aliasRow',
    'saveLocationRow',
    'extensionGroup',
    'showIconRow',
    'enableOnLoginRow',
    'receiveGroup',
    'quickSavePolicyRow',
    'securityGroup',
    'pinPolicyRow',
    'pinRow',
    'acceptPolicyRow',
    'advancedMulitcastGroup',
    'multicastAddressRow',
    'multicastPortRow',
    'advancedServerGroup',
    'serverPortRow',
    'loggingRow',
  ],
},
class GeneralSettingsPage extends Adw.PreferencesPage {
  constructor(window, settings) {
    super({});
    this.window = window;
    this.settings = settings;

    this.settings.bind('extension-active', this._disclaimer, 'visible', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('extension-active', this._generalGroup, 'sensitive', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('extension-active', this._receiveGroup, 'sensitive', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('extension-active', this._securityGroup, 'sensitive', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('extension-active', this._advancedMulitcastGroup, 'sensitive', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);
    this.settings.bind('extension-active', this._advancedServerGroup, 'sensitive', Gio.SettingsBindFlags.DEFAULT | Gio.SettingsBindFlags.INVERT_BOOLEAN);

    this.settings.bind('alias', this._aliasRow, 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('storage-path', this._saveLocationRow, 'subtitle', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('show-icon', this._showIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('enable-on-login', this._enableOnLoginRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('quick-save-policy', this._quickSavePolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('pin-policy', this._pinPolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('pin', this._pinRow, 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('accept-policy', this._acceptPolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('mc-address', this._multicastAddressRow, 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('mc-port', this._multicastPortRow, 'text', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('fileserver-port', this._serverPortRow, 'text', Gio.SettingsBindFlags.DEFAULT);
  }

  onChangeFolderClicked() {
    new Gtk.FileDialog()
      .select_folder(this.window, null)
      .then(file => this.settings.set_string('storage-path', file.get_path()))
      .catch(e => print(e))
  }
});


const FavoritesPage = GObject.registerClass({
  GTypeName: 'FavoritesPage',
  Template: GLib.uri_resolve_relative(
    import.meta.url, './resources/ui/settings-page-favorites.ui',
    GLib.UriFlags.NONE
  ),
  InternalChildren: [
    'favoritesGroup',
    'favoritesList',
    'discoveredDevicesGroup',
    'availableDevicesList',
  ],
},
class FavoritesPage extends Adw.PreferencesPage {
  constructor(settings) {
    super({});
    this.settings = settings;
    this.settingsService = new SettingsService({ settings: this.settings });

    this.settings.connect('changed::favorites', () => this.loadFavorites());
    this.settings.connect('changed::discovered-devices', () => this.loadDiscoveredDevices());

    this.loadFavorites();
    this.loadDiscoveredDevices();
  }

  loadFavorites() {
    this._favoritesList.remove_all();
    this._favoritesList.visible = false;

    this.settingsService.getFavorites().forEach((fav) => {
      this._favoritesList.visible = true;

      const entry = new DeviceEntry({
        device: fav,
        button: {
          iconName: 'user-trash-symbolic',
          tooltipText: _('Remove from favorites'),
          style: 'destructive-action',
          onClicked: () => {
            this.settingsService.removeFavorite(fav.fingerprint);
            this.loadDiscoveredDevices();
          }
        }
      });

      this._favoritesList.append(entry);
    });
  }

  loadDiscoveredDevices() {
    this._availableDevicesList.remove_all();
    this._availableDevicesList.visible = false;

    this.settingsService.getDiscoveredDevices().forEach((device) => {
      this._availableDevicesList.visible = true;

      const entry = new DeviceEntry({
        device: device,
        button: this.settingsService.isFavorite(device.fingerprint) ? null : {
          iconName: 'emblem-favorite-symbolic',
          tooltipText: _('Add to favorites'),
          style: 'accent',
          onClicked: () => {
            this.settingsService.addFavorite(device);
            this.loadDiscoveredDevices();
          }
        }
      });

      this._availableDevicesList.append(entry);
    });
  }
});


const DeviceEntry = GObject.registerClass({
  GTypeName: 'DeviceEntry',
  Template: GLib.uri_resolve_relative(
    import.meta.url, './resources/ui/settings-device-entry.ui',
    GLib.UriFlags.NONE
  ),
  InternalChildren: [
    'icon',
    'button'
  ]
},
class DeviceEntry extends Adw.ActionRow {
  constructor({ device, button }) {
    super({
      title: device.alias,
      subtitle: device.model ?? ''
    });

    this._icon.iconName = this.getIconForDevice({
      type: device.type,
      model: device.model
    });

    if (button) {
      this._button.visible = true;
      this._button.iconName = button.iconName;
      this._button.tooltipText = button.tooltipText;
      this._button.add_css_class(button.style);
      this._button.connect('clicked', () => button.onClicked());
    }
  }

  getIconForDevice({type, model}) {
    if (model === 'iPhone') {
      return 'phone-apple-iphone-symbolic';
    }
    if (model === 'iPad') {
      return 'tablet-symbolic';
    }
    if (type === 'mobile') {
      return 'phone-symbolic';
    }
    if (type === 'server' || type === 'headless') {
      return 'folder-shell-symbolic';
    }

    return 'computer-symbolic';
  }
});
