import GLib from 'gi://GLib';


export default class SettingsService {
  constructor({settings}) {
    this._settings = settings;
  }

  getAlias() {
    return this._settings.get_string('alias');
  }

  getStoragePath() {
    return this._settings.get_string('storage-path');
  }

  setStoragePath(path) {
    this._settings.set_string('storage-path', path);
  }

  getFileServerPort() {
    return this._settings.get_string('fileserver-port');
  }

  getAcceptPolicy() {
    return this._settings.get_int('accept-policy');
  }

  getPinPolicy() {
    return this._settings.get_int('pin-policy');
  }

  getQuickSavePolicy() {
    return this._settings.get_int('quick-save-policy');
  }

  getPin() {
    return this._settings.get_string('pin');
  }

  setPin(pin) {
    return this._settings.set_string('pin', pin);
  }

  getMulticastGroup() {
    return this._settings.get_string('mc-address');
  }

  getMulticastPort() {
    return this._settings.get_string('mc-port');
  }

  getFavorites() {
    return this._settings.get_value('favorites').deepUnpack();
  }

  isFavorite(fingerprint) {
      const favorites = this.getFavorites();

      return favorites[fingerprint] !== undefined;
  }

  addFavorite({fingerprint, alias}) {
      const favorites = this._settings.get_value('favorites').deepUnpack();
      favorites[fingerprint] = alias;

      this._settings.set_value('favorites', GLib.Variant.new('a{ss}', favorites));
  }

  removeFavorite({fingerprint}) {
      const favorites = this._settings.get_value('favorites').deepUnpack();
      delete favorites[fingerprint];

      this._settings.set_value('favorites', GLib.Variant.new('a{ss}', favorites));
  }

  getAvailableDevices() {
      return this._settings.get_value('discovered-devices').deepUnpack();
  }

  addAvailableDevice({alias, fingerprint}) {
      const devices = this.getAvailableDevices();
      devices[fingerprint] = alias;

      this._settings.set_value('discovered-devices', new GLib.Variant('a{ss}', devices));
  }
}
