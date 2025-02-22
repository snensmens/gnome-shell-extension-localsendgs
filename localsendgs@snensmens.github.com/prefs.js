import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import SettingsService from './settings.js';


export default class LocalSendGSPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.settings = this.getSettings();
        this.settingsService = new SettingsService({
          settings: this.settings
        })

        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            iconName: 'org.gnome.Settings-symbolic',
        });
        window.add(generalPage);

        // General Settings
        const generalGroup = new Adw.PreferencesGroup({ title: 'General' });
        generalPage.add(generalGroup);

        const aliasRow = new Adw.EntryRow({ title: 'Alias' });
        generalGroup.add(aliasRow);

        const saveLocationRow = new Adw.ActionRow({
            title: 'Save folder',
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
        const extensionGroup = new Adw.PreferencesGroup({ title: 'Extension' });
        generalPage.add(extensionGroup);

        const showIconRow = new Adw.SwitchRow({ title: 'Show icon in topbar when enabled' });
        extensionGroup.add(showIconRow);


        // Receiving related Settings
        const receiveGroup = new Adw.PreferencesGroup({ title: 'Receiving' });
        generalPage.add(receiveGroup);

        const quickSavePolicyRow = new Adw.ComboRow({
            title: 'QuickSave',
            subtitle: 'Accept incoming files without asking',
            model: Gtk.StringList.new([
              'never',
              'favorits only',
              'always'
            ]),
        });
        receiveGroup.add(quickSavePolicyRow);


        // Security related Settings
        const securityGroup = new Adw.PreferencesGroup({ title: 'Security' });
        generalPage.add(securityGroup);

        const pinPolicyRow = new Adw.ComboRow({
            title: 'Require PIN to receive files',
            model: Gtk.StringList.new([
              'never',
              'if not a favourite',
              'always'
            ]),
        });
        securityGroup.add(pinPolicyRow);

        const pinRow = new Adw.EntryRow({ title: 'PIN' });
        securityGroup.add(pinRow);

        const acceptPolicyRow = new Adw.ComboRow({
            title: 'Allow sending files for',
            model: Gtk.StringList.new([
              'everyone',
              'favorites'
            ]),
        });
        securityGroup.add(acceptPolicyRow);

        // Advanced Settings
        const advancedMulitcastGroup = new Adw.PreferencesGroup({
            title: 'Advanced',
            description: 'Onyl change this values if you know what you are doing',
        });
        generalPage.add(advancedMulitcastGroup);

        const multicastAddressRow = new Adw.EntryRow({ title: 'Multicast group' });
        advancedMulitcastGroup.add(multicastAddressRow);

        const multicastPortRow = new Adw.EntryRow({ title: 'Multicast port' });
        advancedMulitcastGroup.add(multicastPortRow);

        const advancedServerGroup = new Adw.PreferencesGroup();
        generalPage.add(advancedServerGroup);

        const serverPortRow = new Adw.EntryRow({ title: 'Fileserver-port' });
        advancedServerGroup.add(serverPortRow);


        const favoritesPage = new Adw.PreferencesPage({
            title: 'Favorites',
            iconName: 'emblem-favorite-symbolic'
        });
        window.add(favoritesPage);

        const favoritesGroup = new Adw.PreferencesGroup({ title: 'Favorites' });
        favoritesPage.add(favoritesGroup);

        const favoritesList = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list'],
            visible: false,
        });
        favoritesGroup.add(favoritesList);

        let discoveredDevicesGroup = new Adw.PreferencesGroup({ title: 'Discovered devices' });
        favoritesPage.add(discoveredDevicesGroup);

        const availableDevicesList = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
            cssClasses: ['boxed-list'],
            visible: false,
        });
        discoveredDevicesGroup.add(availableDevicesList);


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
            this.loadDiscoveredDevices(availableDevicesList);
        });

        this.loadFavorites(favoritesList);
        this.loadDiscoveredDevices(availableDevicesList);
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
              tooltipText: 'Remove from favorites',
              valign: Gtk.Align.CENTER,
              cssClasses: ['circular', 'error', 'flat']
          });
          removeButton.connect('clicked', (..._) => {
              this.settingsService.removeFavorite({fingerprint: fingerprint});
          });

          row.add_suffix(removeButton);
          favoritesList.append(row);
      }
    }

    loadDiscoveredDevices(availableDevicesList) {
        availableDevicesList.remove_all();
        availableDevicesList.visible = false;

        const devices = this.settingsService.getAvailableDevices();
        for (const [fingerprint, alias] of Object.entries(devices)) {
            availableDevicesList.visible = true;

            const row = new Adw.ActionRow({ title: alias });

            const favoritesButton = new Gtk.Button({
                iconName: 'emblem-favorite-symbolic',
                tooltipText: 'Add to favorites',
                valign: Gtk.Align.CENTER,
                cssClasses: ['circular', 'accent', 'flat']
            })
            favoritesButton.connect('clicked', (..._) => {
                this.settingsService.addFavorite({fingerprint: fingerprint, alias: alias});
            });

            row.add_suffix(favoritesButton);

            availableDevicesList.append(row);
        };
    }
}
