import { describe, it, expect } from 'vitest';
import {
  trackedSiteUrlPatterns,
  redirectTabIfBlocked,
  buildTimeUpBlockedUrl,
  collectTrackedTabIds,
  redirectTabsWithExhaustedTime,
  rememberBlockedTabReturnUrl,
  restoreBlockedTabsAfterEmergencyPause,
  DEFAULT_NEW_TAB_URL,
} from '../../extension/lib/tab-redirect.js';
import { createDefaultSettings, MS } from '../../extension/lib/constants.js';
import { chrome, resetChromeMocks } from './mocks/chrome.js';

describe('tab-redirect', () => {
  it('builds blocked page urls', () => {
    const url = buildTimeUpBlockedUrl('default', 'youtube.com', {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
    });
    expect(url).toContain('blocked/blocked.html');
    expect(url).toContain('category=default');
    expect(url).toContain('domain=youtube.com');
  });

  it('creates url patterns for tracked sites', () => {
    const settings = createDefaultSettings();
    const patterns = trackedSiteUrlPatterns(settings);
    expect(patterns).toContain('*://*.youtube.com/*');
    expect(patterns).toContain('*://youtube.com/*');
  });

  it('redirects tabs with exhausted category time', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;

    let updatedUrl = '';
    const tabsApi = {
      get: async () => ({ id: 1, url: 'https://www.youtube.com/watch?v=abc' }),
      update: async (_id, info) => {
        updatedUrl = info.url;
      },
    };

    const redirected = await redirectTabIfBlocked(1, settings, tabsApi, {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
    });

    expect(redirected).toBe(true);
    expect(updatedUrl).toContain('blocked/blocked.html');
  });

  it('does not redirect tabs with remaining time', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = MS.HOUR;

    let updated = false;
    const tabsApi = {
      get: async () => ({ id: 1, url: 'https://www.youtube.com/watch?v=abc' }),
      update: async () => {
        updated = true;
      },
    };

    const redirected = await redirectTabIfBlocked(1, settings, tabsApi, {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
    });

    expect(redirected).toBe(false);
    expect(updated).toBe(false);
  });

  it('finds tracked tabs via url patterns when bulk tab.url is missing', async () => {
    const settings = createDefaultSettings();
    const tabsApi = {
      query: async (queryInfo) => {
        if (queryInfo.url) {
          return [{ id: 7, url: 'https://www.youtube.com/watch?v=abc' }];
        }
        return [{ id: 7 }];
      },
      get: async () => ({ id: 7, url: 'https://www.youtube.com/watch?v=abc' }),
    };

    const ids = await collectTrackedTabIds(settings, tabsApi);
    expect(ids).toContain(7);
  });

  it('redirects all tracked tabs with exhausted time', async () => {
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;

    const updated = [];
    const tabsApi = {
      query: async (queryInfo) => {
        if (queryInfo.url?.includes('youtube.com')) {
          return [{ id: 1 }, { id: 2 }];
        }
        return [{ id: 1 }, { id: 2 }];
      },
      get: async (id) => ({
        id,
        url: id === 1
          ? 'https://www.youtube.com/watch?v=a'
          : 'https://www.youtube.com/watch?v=b',
      }),
      update: async (id, info) => {
        updated.push({ id, url: info.url });
      },
    };

    await redirectTabsWithExhaustedTime(settings, tabsApi, {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
    });

    expect(updated).toHaveLength(2);
  });

  it('stores the pre-block url when redirecting an open tab', async () => {
    resetChromeMocks();
    const settings = createDefaultSettings();
    settings.categories[0].remainingMs = 0;

    const tabsApi = {
      get: async () => ({ id: 1, url: 'https://www.youtube.com/watch?v=abc' }),
      update: async () => {},
    };

    await redirectTabIfBlocked(1, settings, tabsApi, {
      getURL(path) {
        return `chrome-extension://test/${path}`;
      },
    }, chrome.storage.session);

    const stored = await chrome.storage.session.get('webwarden_blocked_tab_returns');
    expect(stored.webwarden_blocked_tab_returns['1']).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('restores saved urls and uses a new tab page when none was saved', async () => {
    resetChromeMocks();
    await chrome.storage.session.set({
      webwarden_blocked_tab_returns: {
        1: 'https://www.youtube.com/watch?v=abc',
      },
    });

    const updated = [];
    const tabsApi = {
      query: async () => ([
        {
          id: 1,
          url: 'chrome-extension://test/blocked/blocked.html?category=default&reason=time-up&domain=youtube.com',
        },
        {
          id: 2,
          url: 'chrome-extension://test/blocked/blocked.html?category=default&reason=time-up&domain=youtube.com',
        },
      ]),
      update: async (id, info) => {
        updated.push({ id, url: info.url });
      },
    };

    const restored = await restoreBlockedTabsAfterEmergencyPause('default', tabsApi, {
      getURL(path) {
        return `chrome-extension://test/${path || ''}`;
      },
    }, chrome.storage.session);

    expect(restored).toHaveLength(2);
    expect(updated[0]).toEqual({ id: 1, url: 'https://www.youtube.com/watch?v=abc' });
    expect(updated[1]).toEqual({ id: 2, url: DEFAULT_NEW_TAB_URL });
  });
});
