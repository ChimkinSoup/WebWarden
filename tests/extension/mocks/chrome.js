/** Minimal Chrome API mock for Vitest. */

export const chrome = {
  storage: {
    local: {
      /** @type {Record<string, unknown>} */
      _data: {},
      get(keys) {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: this._data[keys] });
        }
        return Promise.resolve({ ...this._data });
      },
      set(obj) {
        Object.assign(this._data, obj);
        return Promise.resolve();
      },
      clear() {
        this._data = {};
        return Promise.resolve();
      },
    },
    session: {
      /** @type {Record<string, unknown>} */
      _data: {},
      get(keys) {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: this._data[keys] });
        }
        return Promise.resolve({ ...this._data });
      },
      set(obj) {
        Object.assign(this._data, obj);
        return Promise.resolve();
      },
      remove(keys) {
        if (typeof keys === 'string') {
          delete this._data[keys];
        }
        return Promise.resolve();
      },
    },
  },
  alarms: {
    /** @type {Map<string, object>} */
    _alarms: new Map(),
    create(name, info) {
      this._alarms.set(name, info);
      return Promise.resolve();
    },
    clear(name) {
      this._alarms.delete(name);
      return Promise.resolve();
    },
  },
  notifications: {
    create() {
      return Promise.resolve();
    },
  },
  runtime: {
    id: 'test-extension-id',
    getURL(path) {
      return `chrome-extension://test-extension-id/${path}`;
    },
  },
  declarativeNetRequest: {
    async getDynamicRules() {
      return [];
    },
    async updateDynamicRules() {},
  },
};

export function resetChromeMocks() {
  chrome.storage.local._data = {};
  chrome.storage.session._data = {};
  chrome.alarms._alarms.clear();
}
