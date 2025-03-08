import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import SettingsService from './settings.js';


export default class LocalSendGSPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.settings = this.getSettings();
        this.settingsService = new SettingsService({
          settings: this.settings
        });

        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            iconName: 'org.gnome.Settings-symbolic',
        });
        window.add(generalPage);

        const disclaimer = new Adw.PreferencesGroup({
          title: _('Not all settings are available while the extension is active'),
          description: _('Turn it off in the Quick Settings to access all settings'),
          cssClasses: ['warning'],
        })
        generalPage.add(disclaimer);
        this.settings.bind('extension-active', disclaimer, 'visible',
          Gio.SettingsBindFlags.DEFAULT);

        // General Settings
        const generalGroup = new Adw.PreferencesGroup({ title: _('General') });
        generalPage.add(generalGroup);
        this.settings.bind('extension-active', generalGroup, 'sensitive',
          Gio.SettingsBindFlags.DEFAULT|Gio.SettingsBindFlags.INVERT_BOOLEAN);

        const aliasRow = new Adw.EntryRow({ title: _('Alias') });
        generalGroup.add(aliasRow);

        const saveLocationRow = new Adw.ActionRow({
            title: _('Save folder'),
            css_classes: ['property'],
        });
        generalGroup.add(saveLocationRow);

        const chooseDirectoryButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            iconName: 'folder-open-symbolic',
            cssClasses: ["flat"],
        });
        chooseDirectoryButton.connect('clicked', (..._) => {
            const dialog = new Gtk.FileDialog();
            dialog.select_folder(window, null, (_, result) => {
                const file = dialog.select_folder_finish(result);
                this.settings.set_string('storage-path', file.get_path());
            });
        });
        saveLocationRow.add_suffix(chooseDirectoryButton);


        // Extension related Settings
        const extensionGroup = new Adw.PreferencesGroup({ title: _('Extension') });
        generalPage.add(extensionGroup);

        const showIconRow = new Adw.SwitchRow({ title: _('Show icon in topbar when enabled') });
        extensionGroup.add(showIconRow);


        // Receiving related Settings
        const receiveGroup = new Adw.PreferencesGroup({ title: _('Receiving') });
        generalPage.add(receiveGroup);
        this.settings.bind('extension-active', receiveGroup, 'sensitive',
          Gio.SettingsBindFlags.DEFAULT|Gio.SettingsBindFlags.INVERT_BOOLEAN);

        const quickSavePolicyRow = new Adw.ComboRow({
            title: _('QuickSave'),
            subtitle: _('Accept incoming files without asking'),
            model: Gtk.StringList.new([
              _('never'),
              _('favorits only'),
              _('always')
            ]),
        });
        receiveGroup.add(quickSavePolicyRow);


        // Security related Settings
        const securityGroup = new Adw.PreferencesGroup({ title: _('Security') });
        generalPage.add(securityGroup);
        this.settings.bind('extension-active', securityGroup, 'sensitive',
          Gio.SettingsBindFlags.DEFAULT|Gio.SettingsBindFlags.INVERT_BOOLEAN);

        const pinPolicyRow = new Adw.ComboRow({
            title: _('Require PIN to receive files'),
            model: Gtk.StringList.new([
              _('never'),
              _('if not a favourite'),
              _('always')
            ]),
        });
        securityGroup.add(pinPolicyRow);

        const pinRow = new Adw.EntryRow({ title: _('PIN') });
        securityGroup.add(pinRow);

        const acceptPolicyRow = new Adw.ComboRow({
            title: _('Allow sending files for'),
            model: Gtk.StringList.new([
              _('everyone'),
              _('favorites')
            ]),
        });
        securityGroup.add(acceptPolicyRow);

        // Advanced Settings
        const advancedMulitcastGroup = new Adw.PreferencesGroup({
            title: _('Advanced'),
            description: _('Onyl change this values if you know what you are doing'),
        });
        generalPage.add(advancedMulitcastGroup);
        this.settings.bind('extension-active', advancedMulitcastGroup, 'sensitive',
          Gio.SettingsBindFlags.DEFAULT|Gio.SettingsBindFlags.INVERT_BOOLEAN);

        const multicastAddressRow = new Adw.EntryRow({ title: _('Multicast group') });
        advancedMulitcastGroup.add(multicastAddressRow);

        const multicastPortRow = new Adw.EntryRow({ title: _('Multicast port') });
        advancedMulitcastGroup.add(multicastPortRow);

        const advancedServerGroup = new Adw.PreferencesGroup();
        generalPage.add(advancedServerGroup);
        this.settings.bind('extension-active', advancedServerGroup, 'sensitive',
          Gio.SettingsBindFlags.DEFAULT|Gio.SettingsBindFlags.INVERT_BOOLEAN);

        const serverPortRow = new Adw.EntryRow({ title: _('Fileserver-port') });
        advancedServerGroup.add(serverPortRow);


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

        this.settings.bind('alias', aliasRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('storage-path', saveLocationRow, 'subtitle', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('show-icon', showIconRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('quick-save-policy', quickSavePolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('pin-policy', pinPolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('pin', pinRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('accept-policy', acceptPolicyRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('mc-address', multicastAddressRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('mc-port', multicastPortRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('fileserver-port', serverPortRow, 'text', Gio.SettingsBindFlags.DEFAULT);

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
