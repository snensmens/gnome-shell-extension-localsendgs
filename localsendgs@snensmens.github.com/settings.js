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
    this._settings.set_string('pin', pin);
  }

  getFingerprint() {
    return this._settings.get_string('fingerprint');
  }

  setFingerprint(fingerprint) {
    this._settings.set_string('fingerprint', fingerprint);
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

    return favorites.some(fav => fav.fingerprint === fingerprint);
  }

  addFavorite({ fingerprint, alias, type, model }) {
    const favorites = this._settings.get_value('favorites').deepUnpack();

    if (favorites.some(fav => fav.fingerprint === fingerprint)) {
      return
    }

    favorites.push({
      alias: alias,
      fingerprint: fingerprint,
      type: type,
      model: model
    });

    this._settings.set_value('favorites', GLib.Variant.new('aa{ss}', favorites));
  }

  removeFavorite(fingerprint) {
    const favorites = this._settings.get_value('favorites').deepUnpack();

    this._settings.set_value(
      'favorites',
      GLib.Variant.new(
        'aa{ss}',
        favorites.filter(fav => fav.fingerprint !== fingerprint)
      )
    );
  }

  getDiscoveredDevices() {
    return this._settings.get_value('discovered-devices').deepUnpack();
  }

  addDiscoveredDevice({alias, fingerprint, type, model}) {
    const devices = this.getDiscoveredDevices();

    if (devices.some(device => device.fingerprint === fingerprint)) {
      return
    }

    devices.push({
      alias: alias,
      fingerprint: fingerprint,
      type: type,
      model: model
    });

    this._settings.set_value('discovered-devices', new GLib.Variant('aa{ss}', devices));
  }

  clearAvailableDevices() {
    this._settings.set_value('discovered-devices', new GLib.Variant('aa{ss}', []));
  }

  getEnableOnLogin() {
    return this._settings.get_boolean('enable-on-login');
  }
}
