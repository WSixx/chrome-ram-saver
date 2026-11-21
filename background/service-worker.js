// =============================================================================
// RAM Saver — Service Worker (Background)
// Manifest V3 | Vanilla JS | Zero dependencies
// =============================================================================

importScripts('../utils/shared.js');

const {
  ALARM_NAME,
  RAM_PER_TAB_MB,
  DEFAULT_SETTINGS,
  isSystemUrl,
  isTabEligible
} = globalThis.RamSaverUtils;

const SUPPORTED_LOCALES = ['en', 'pt_BR', 'es'];
const SUSPEND_BATCH_SIZE = 5;
const FAVICON_ACK_TIMEOUT_MS = 800;

let isSuspending = false;

// ---------------------------------------------------------------------------
// Form data detection (protect unsubmitted inputs)
// ---------------------------------------------------------------------------
async function hasUnsavedFormData(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const inputs = document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea'
        );
        for (const input of inputs) {
          if (input.value && input.value.trim().length > 0 && input.value !== input.defaultValue) {
            return true;
          }
        }
        const editables = document.querySelectorAll('[contenteditable="true"]');
        for (const el of editables) {
          if (el.innerText && el.innerText.trim().length > 0) {
            return true;
          }
        }
        return false;
      }
    });
    return results?.[0]?.result === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tab suspended indicators (💤 title + grayscale favicon)
// ---------------------------------------------------------------------------
async function markTabTitleSuspended(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (!document.title.startsWith('💤 ')) {
          document.title = `💤 ${document.title}`;
        }
      }
    });
  } catch {
    // Ignore restricted/uninjectable tabs
  }
}

async function grayscaleTabFavicon(tabId) {
  let timer = null;
  let onUpdate = null;

  try {
    const suspendedIconUrl = chrome.runtime.getURL('icons/suspended16.png');
    const suspendedIcon32Url = chrome.runtime.getURL('icons/suspended32.png');

    // Listen for Chrome to acknowledge the favicon change
    const faviconAcknowledged = new Promise((resolve) => {
      onUpdate = (id, changeInfo) => {
        if (id === tabId && changeInfo.favIconUrl) {
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdate);
      timer = setTimeout(() => resolve(false), FAVICON_ACK_TIMEOUT_MS);
    });

    // Execute in MAIN world — Chrome's internal favicon observer
    // only picks up DOM mutations from the page's main JS context
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [suspendedIconUrl, suspendedIcon32Url],
      func: (iconUrl, icon32Url) => {
        document.querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
        ).forEach((el) => el.remove());

        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = iconUrl;
        document.head.appendChild(link);

        const link32 = document.createElement('link');
        link32.rel = 'icon';
        link32.type = 'image/png';
        link32.sizes = '32x32';
        link32.href = icon32Url;
        document.head.appendChild(link32);
      }
    });

    await faviconAcknowledged;
  } catch {
    // Ignore restricted/uninjectable tabs
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (onUpdate) chrome.tabs.onUpdated.removeListener(onUpdate);
  }
}

/**
 * Applies visual suspended indicators (in parallel) and discards the tab.
 * Returns true if the tab was successfully discarded.
 */
async function discardTab(tabId, settings) {
  const prepTasks = [grayscaleTabFavicon(tabId)];
  if (settings.markSuspendedTitle) {
    prepTasks.push(markTabTitleSuspended(tabId));
  }
  await Promise.allSettled(prepTasks);

  try {
    await chrome.tabs.discard(tabId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Discards a list of eligible tabs in bounded concurrent batches.
 */
async function suspendTabsInBatches(tabs, settings, checkForms = false) {
  let newlySuspended = 0;

  for (let i = 0; i < tabs.length; i += SUSPEND_BATCH_SIZE) {
    const batch = tabs.slice(i, i + SUSPEND_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (tab) => {
        if (checkForms && settings.noSuspendForms) {
          const hasForm = await hasUnsavedFormData(tab.id);
          if (hasForm) return false;
        }
        return discardTab(tab.id, settings);
      })
    );

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value === true) {
        newlySuspended++;
      }
    }
  }

  return newlySuspended;
}

async function incrementTotalSuspended(count) {
  if (count <= 0) return;
  const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
  await chrome.storage.local.set({ totalSuspended: totalSuspended + count });
}

// ---------------------------------------------------------------------------
// Badge management
// ---------------------------------------------------------------------------
async function updateBadge() {
  try {
    const { showBadge = true } = await chrome.storage.sync.get('showBadge');
    if (!showBadge) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter((t) => t.discarded).length;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
  } catch {
    // Ignore transient badge update errors
  }
}

// ---------------------------------------------------------------------------
// Alarm management
// ---------------------------------------------------------------------------
async function setupAlarm() {
  const { aggressiveMode = false } = await chrome.storage.sync.get('aggressiveMode');
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: aggressiveMode ? 0.5 : 1
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) toSet[key] = val;
  }
  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);

  const { totalSuspended } = await chrome.storage.local.get('totalSuspended');
  if (totalSuspended === undefined) await chrome.storage.local.set({ totalSuspended: 0 });

  await setupAlarm();
  await setupContextMenus();

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const activityMap = {};
  for (const tab of tabs) {
    activityMap[`tab_${tab.id}`] = tab.active ? now : now - 60000;
  }
  await chrome.storage.session.set(activityMap);
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
  await setupContextMenus();

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled || !settings.lazyLoadStartup) {
    await updateBadge();
    return;
  }

  // Discard all eligible non-active tabs on startup
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const eligibleTabs = tabs.filter((tab) =>
    isTabEligible(tab, settings, now, now, true, false, false).eligible
  );

  const newlySuspended = await suspendTabsInBatches(eligibleTabs, settings, false);
  await incrementTotalSuspended(newlySuspended);
  await updateBadge();
});

// ---------------------------------------------------------------------------
// Tab Activity Tracking
// ---------------------------------------------------------------------------
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await chrome.storage.session.set({ [`tab_${tabId}`]: Date.now() });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    await chrome.storage.session.set({ [`tab_${tabId}`]: Date.now() });
  }
  if (changeInfo.discarded !== undefined || changeInfo.status === 'complete') {
    updateBadge();
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const now = Date.now();
  await chrome.storage.session.set({ [`tab_${tab.id}`]: now });

  // Active tab limit enforcement
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled || !settings.activeTabLimit) return;

  const allTabs = await chrome.tabs.query({});
  const activeTabs = allTabs.filter((t) => !t.discarded);
  if (activeTabs.length <= settings.activeTabLimitCount) return;

  const activityData = await chrome.storage.session.get(allTabs.map((t) => `tab_${t.id}`));
  const exemptData = await chrome.storage.session.get(allTabs.map((t) => `exempt_tab_${t.id}`));

  const candidates = activeTabs
    .filter((t) =>
      isTabEligible(t, settings, 0, now, true, Boolean(exemptData[`exempt_tab_${t.id}`]), false).eligible
    )
    .sort((a, b) => {
      const aTime = activityData[`tab_${a.id}`] ?? 0;
      const bTime = activityData[`tab_${b.id}`] ?? 0;
      return aTime - bTime; // oldest first
    });

  for (const candidate of candidates) {
    if (settings.noSuspendForms) {
      const hasForm = await hasUnsavedFormData(candidate.id);
      if (hasForm) continue;
    }
    const discarded = await discardTab(candidate.id, settings);
    if (discarded) {
      await incrementTotalSuspended(1);
      break;
    }
  }
  await updateBadge();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session.remove([`tab_${tabId}`, `exempt_tab_${tabId}`]);
  updateBadge();
});

// ---------------------------------------------------------------------------
// Suspend on window minimize
// ---------------------------------------------------------------------------
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) return;

  const { suspendOnMinimize = false, enabled = true } =
    await chrome.storage.sync.get(['suspendOnMinimize', 'enabled']);

  if (!suspendOnMinimize || !enabled) return;

  try {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const allMinimized = windows.length > 0 && windows.every((w) => w.state === 'minimized');
    if (allMinimized) {
      await suspendInactiveTabs(true);
    }
  } catch {
    // Ignore transient window query errors
  }
});

// ---------------------------------------------------------------------------
// Storage change listener (update alarm, badge, or context menus)
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.aggressiveMode) setupAlarm();
    if (changes.showBadge) updateBadge();
    if (changes.userLanguage) setupContextMenus();
  }
});

// ---------------------------------------------------------------------------
// Core: Suspend eligible inactive tabs
// ---------------------------------------------------------------------------
async function suspendInactiveTabs(forceAll = false) {
  if (isSuspending) return { suspended: 0 };
  isSuspending = true;

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    if (!settings.enabled && !forceAll) return { suspended: 0 };

    const now = Date.now();
    const tabs = await chrome.tabs.query({});
    const activityData = await chrome.storage.session.get(tabs.map((t) => `tab_${t.id}`));
    const exemptData = await chrome.storage.session.get(tabs.map((t) => `exempt_tab_${t.id}`));

    const missingActivity = {};
    const eligibleTabs = [];

    for (const tab of tabs) {
      let lastActive = activityData[`tab_${tab.id}`];
      if (lastActive === undefined) {
        // Give newly tracked tabs (e.g. after SW/extension reload) a grace period
        lastActive = now;
        missingActivity[`tab_${tab.id}`] = now;
      }

      const isExempt = Boolean(exemptData[`exempt_tab_${tab.id}`]);
      const check = isTabEligible(tab, settings, lastActive, now, forceAll, isExempt, false);
      if (check.eligible) {
        eligibleTabs.push(tab);
      }
    }

    if (Object.keys(missingActivity).length > 0) {
      await chrome.storage.session.set(missingActivity);
    }

    const newlySuspended = await suspendTabsInBatches(eligibleTabs, settings, true);
    await incrementTotalSuspended(newlySuspended);
    await updateBadge();

    return { suspended: newlySuspended };
  } finally {
    isSuspending = false;
  }
}

// ---------------------------------------------------------------------------
// Alarm handler
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) suspendInactiveTabs();
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'suspendAll') {
    suspendInactiveTabs(true)
      .then(sendResponse)
      .catch((err) => sendResponse({ suspended: 0, error: err?.message }));
    return true;
  }
  if (message.action === 'getStats') {
    getStats()
      .then(sendResponse)
      .catch((err) => sendResponse({ sessionSuspended: 0, sessionSavedMB: 0, totalSuspended: 0, totalSavedMB: 0, error: err?.message }));
    return true;
  }
  if (message.action === 'updateBadge') {
    updateBadge()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message }));
    return true;
  }
  if (message.action === 'suspendTab') {
    chrome.tabs.get(message.tabId)
      .then((tab) => (tab ? suspendSingleTab(tab) : null))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message }));
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function getStats() {
  const tabs = await chrome.tabs.query({});
  const discarded = tabs.filter((t) => t.discarded).length;
  const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
  return {
    sessionSuspended: discarded,
    sessionSavedMB: discarded * RAM_PER_TAB_MB,
    totalSuspended,
    totalSavedMB: totalSuspended * RAM_PER_TAB_MB
  };
}

// ---------------------------------------------------------------------------
// Manual Tab Suspension (Context Menu & Keyboard Shortcuts)
// ---------------------------------------------------------------------------
async function suspendSingleTab(tab) {
  if (!tab || !tab.id || tab.discarded || isSystemUrl(tab.url)) return;

  // If tab is active in its window, switch to an adjacent tab before discarding
  if (tab.active) {
    const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
    const otherTabs = windowTabs.filter((t) => t.id !== tab.id);
    if (otherTabs.length === 0) return; // Cannot discard the only tab in a window

    const nextTab = otherTabs.find((t) => t.index === tab.index + 1) ||
                    otherTabs.find((t) => t.index === tab.index - 1) ||
                    otherTabs[0];
    await chrome.tabs.update(nextTab.id, { active: true });
  }

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const discarded = await discardTab(tab.id, settings);
  if (discarded) {
    await incrementTotalSuspended(1);
    await updateBadge();
  }
}

async function suspendOtherTabsInWindow(windowId, activeTabId) {
  const tabs = await chrome.tabs.query({ windowId });
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const exemptData = await chrome.storage.session.get(tabs.map((t) => `exempt_tab_${t.id}`));
  const now = Date.now();

  const eligibleTabs = tabs.filter((tab) => {
    if (tab.id === activeTabId) return false;
    const isExempt = Boolean(exemptData[`exempt_tab_${tab.id}`]);
    return isTabEligible(tab, settings, now, now, true, isExempt, false).eligible;
  });

  const newlySuspended = await suspendTabsInBatches(eligibleTabs, settings, true);
  if (newlySuspended > 0) {
    await incrementTotalSuspended(newlySuspended);
    await updateBadge();
  }
}

async function whitelistCurrentDomain(tab) {
  if (!tab?.url || isSystemUrl(tab.url)) return;
  try {
    const hostname = new URL(tab.url).hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname) return;
    const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
    if (!whitelist.includes(hostname)) {
      whitelist.push(hostname);
      await chrome.storage.sync.set({ whitelist });
    }
  } catch {
    // Ignore invalid URLs
  }
}

// ---------------------------------------------------------------------------
// Context Menus (localized according to userLanguage setting)
// ---------------------------------------------------------------------------
async function loadLocaleMessages() {
  try {
    const { userLanguage = 'auto' } = await chrome.storage.sync.get('userLanguage');
    let lang = userLanguage;
    if (lang === 'auto') {
      const ui = (chrome.i18n.getUILanguage?.() || 'en').toLowerCase();
      if (ui.startsWith('pt')) lang = 'pt_BR';
      else if (ui.startsWith('es')) lang = 'es';
      else lang = 'en';
    }
    if (!SUPPORTED_LOCALES.includes(lang)) lang = 'en';
    const resp = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    return await resp.json();
  } catch {
    return null;
  }
}

async function setupContextMenus() {
  if (!chrome.contextMenus) return;
  const messages = await loadLocaleMessages();
  const msg = (key, fallback) => messages?.[key]?.message || chrome.i18n.getMessage(key) || fallback;

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ram-saver-root',
      title: msg('appName', 'RAM Saver'),
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      parentId: 'ram-saver-root',
      id: 'suspend-current-tab',
      title: msg('menuSuspendCurrent', 'Suspend this tab'),
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      parentId: 'ram-saver-root',
      id: 'suspend-other-tabs',
      title: msg('menuSuspendOthers', 'Suspend other tabs in this window'),
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      parentId: 'ram-saver-root',
      id: 'separator-1',
      type: 'separator',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      parentId: 'ram-saver-root',
      id: 'whitelist-domain',
      title: msg('menuWhitelistDomain', 'Never suspend this site'),
      contexts: ['page', 'action']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!targetTab) return;

  if (info.menuItemId === 'suspend-current-tab') {
    await suspendSingleTab(targetTab);
  } else if (info.menuItemId === 'suspend-other-tabs') {
    await suspendOtherTabsInWindow(targetTab.windowId, targetTab.id);
  } else if (info.menuItemId === 'whitelist-domain') {
    await whitelistCurrentDomain(targetTab);
  }
});

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return;

  if (command === 'suspend-current-tab') {
    await suspendSingleTab(activeTab);
  } else if (command === 'suspend-other-tabs') {
    await suspendOtherTabsInWindow(activeTab.windowId, activeTab.id);
  }
});
