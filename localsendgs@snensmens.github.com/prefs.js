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

        const favoritesPage = new Adw.PreferencesPage({
            title: _('Favorites'),
            iconName: 'emblem-favorite-symbolic'
        });
        window.add(favoritesPage);

        const favoritesGroup = new Adw.PreferencesGroup({ title: _('Favorites') });
        favoritesPage.add(favoritesGroup);

        const favoritesList = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list'],
            visible: false,
        });
        favoritesGroup.add(favoritesList);

        let discoveredDevicesGroup = new Adw.PreferencesGroup({ title: _('Discovered devices') });
        favoritesPage.add(discoveredDevicesGroup);

        this.availableDevicesList = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list'],
            visible: false,
        });
        discoveredDevicesGroup.add(this.availableDevicesList);

        this.settings.connect('changed::favorites', (..._) => {
            this.loadFavorites(favoritesList);
        });

        this.settings.connect('changed::discovered-devices', (..._) => {
            this.loadDiscoveredDevices();
        });

        this.loadFavorites(favoritesList);
        this.loadDiscoveredDevices();
    }

    loadFavorites(favoritesList) {
      favoritesList.remove_all();
      favoritesList.visible = false;

      const favorites = this.settings.get_value('favorites').deepUnpack();
      for (const [fingerprint, alias] of Object.entries(favorites)) {
          favoritesList.visible = true;

          const row = new Adw.ActionRow({ title: alias });

          const removeButton = new Gtk.Button({
              iconName: 'user-trash-symbolic',
              tooltipText: _('Remove from favorites'),
              valign: Gtk.Align.CENTER,
              cssClasses: ['circular', 'error', 'flat']
          });
          removeButton.connect('clicked', (..._) => {
              this.settingsService.removeFavorite({fingerprint: fingerprint});
              this.loadDiscoveredDevices();
          });

          row.add_suffix(removeButton);
          favoritesList.append(row);
      }
    }

    loadDiscoveredDevices() {
        this.availableDevicesList.remove_all();
        this.availableDevicesList.visible = false;

        const devices = this.settingsService.getAvailableDevices();
        for (const [fingerprint, alias] of Object.entries(devices)) {
            this.availableDevicesList.visible = true;

            const row = new Adw.ActionRow({ title: alias });

            if (!this.settingsService.isFavorite(fingerprint)) {
              const favoritesButton = new Gtk.Button({
                  iconName: 'emblem-favorite-symbolic',
                  tooltipText: _('Add to favorites'),
                  valign: Gtk.Align.CENTER,
                  cssClasses: ['circular', 'accent', 'flat']
              })

              favoritesButton.connect('clicked', (button) => {
                  this.settingsService.addFavorite({fingerprint: fingerprint, alias: alias});
                  button.set_visible(false);
              });

              row.add_suffix(favoritesButton);
            }

            this.availableDevicesList.append(row);
        };
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
