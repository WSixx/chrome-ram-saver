// =============================================================================
// RAM Saver — Service Worker (Background)
// Manifest V3 | Vanilla JS | Zero dependencies
// =============================================================================

importScripts('../utils/shared.js');

const {
  ALARM_NAME,
  RAM_PER_TAB_MB,
  MIN_ALARM_DELAY_MS,
  DIRTY_FORM_COOLDOWN_MS,
  DEFAULT_SETTINGS,
  extractHostname,
  isSystemUrl,
  compileWhitelist,
  isTabEligible,
  computeNextCheckDelayMs
} = globalThis.RamSaverUtils;

const SUPPORTED_LOCALES = ['en', 'pt_BR', 'es'];
const SUSPEND_CONCURRENCY = 5;
const FAVICON_ACK_TIMEOUT_MS = 800;
const BADGE_DEBOUNCE_MS = 150;
const SESSION_REMOVE_DEBOUNCE_MS = 50;
const ALARM_RESCHEDULE_DEBOUNCE_MS = 400;
const BADGE_BG_COLOR = '#2563EB';

const SUSPENDED_ICON_16_URL = chrome.runtime.getURL('icons/suspended16.png');
const SUSPENDED_ICON_32_URL = chrome.runtime.getURL('icons/suspended32.png');

let isSuspending = false;
let hasPrunedSessionThisLifetime = false;

// In-memory settings & compiled whitelist cache (kept in sync via storage.onChanged)
let cachedSettings = null;
let compiledWhitelist = null;
let settingsLoadPromise = null;
let settingsVersion = 0;

// Badge debounce & deduplication state
let badgeTimer = null;
let lastBadgeText = null;
let badgeColorInitialized = false;

// Alarm reschedule debounce (for bursty immunity changes)
let alarmRescheduleTimer = null;

// Serialized lifetime counter write queue
let statsWriteChain = Promise.resolve();

// Pending favicon acknowledgments: tabId -> { resolve, timer }
const pendingFaviconAcks = new Map();
// Cooldown cache for tabs with unsaved forms: tabId -> expiresAtMs
const dirtyFormCache = new Map();
// In-flight tab discards to prevent duplicate concurrent operations
const discardingTabIds = new Set();
// Last active tab per window so inactivity starts when leaving a tab
const activeTabByWindow = new Map();
// Micro-batched session storage removals on tab-close bursts
const pendingSessionRemovals = new Set();
let sessionRemovalTimer = null;

// ---------------------------------------------------------------------------
// Settings cache (zero IPC while Service Worker is warm)
// ---------------------------------------------------------------------------
async function getSettings() {
  if (cachedSettings) return cachedSettings;
  if (!settingsLoadPromise) {
    const versionAtStart = settingsVersion;
    settingsLoadPromise = chrome.storage.sync
      .get(DEFAULT_SETTINGS)
      .then((settings) => {
        if (versionAtStart === settingsVersion) {
          cachedSettings = settings;
          compiledWhitelist = compileWhitelist(settings.whitelist, settings.whitelistUrls);
        }
        settingsLoadPromise = null;
        return cachedSettings || settings;
      })
      .catch((err) => {
        settingsLoadPromise = null;
        throw err;
      });
  }
  return settingsLoadPromise;
}

// ---------------------------------------------------------------------------
// Micro-batched session storage cleanup & orphan garbage collection
// ---------------------------------------------------------------------------
function flushSessionRemovals() {
  sessionRemovalTimer = null;
  if (pendingSessionRemovals.size === 0) return;
  const keys = Array.from(pendingSessionRemovals);
  pendingSessionRemovals.clear();
  chrome.storage.session.remove(keys).catch(() => {});
}

function queueSessionRemoval(keys) {
  for (let i = 0; i < keys.length; i++) {
    pendingSessionRemovals.add(keys[i]);
  }
  if (sessionRemovalTimer === null) {
    sessionRemovalTimer = setTimeout(flushSessionRemovals, SESSION_REMOVE_DEBOUNCE_MS);
  }
}

async function pruneOrphanedSessionKeys() {
  try {
    const [allTabs, allWindows, sessionData] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getAll({}),
      chrome.storage.session.get(null)
    ]);

    const validTabIds = new Set();
    for (let i = 0; i < allTabs.length; i++) {
      validTabIds.add(allTabs[i].id);
    }
    const validWindowIds = new Set();
    for (let i = 0; i < allWindows.length; i++) {
      validWindowIds.add(allWindows[i].id);
    }

    const staleKeys = [];
    for (const key of Object.keys(sessionData)) {
      if (key.startsWith('tab_')) {
        const id = Number(key.slice(4));
        if (!validTabIds.has(id)) staleKeys.push(key);
      } else if (key.startsWith('exempt_tab_')) {
        const id = Number(key.slice(11));
        if (!validTabIds.has(id)) staleKeys.push(key);
      } else if (key.startsWith('active_win_')) {
        const id = Number(key.slice(11));
        if (!validWindowIds.has(id)) staleKeys.push(key);
      }
    }

    if (staleKeys.length > 0) {
      await chrome.storage.session.remove(staleKeys);
    }
  } catch {
    // Ignore transient pruning errors
  }
}

function pruneExpiredDirtyForms(nowMs) {
  for (const [tabId, expiresAt] of dirtyFormCache.entries()) {
    if (expiresAt <= nowMs) {
      dirtyFormCache.delete(tabId);
    }
  }
}

// ---------------------------------------------------------------------------
// Single-injection preparation (form detection + 💤 title + grayscale favicon)
// and tab discard
// ---------------------------------------------------------------------------
function resolveFaviconAck(tabId, acknowledged) {
  const entry = pendingFaviconAcks.get(tabId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingFaviconAcks.delete(tabId);
  entry.resolve(acknowledged);
}

function createFaviconAckWaiter(tabId) {
  resolveFaviconAck(tabId, false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingFaviconAcks.delete(tabId);
      resolve(false);
    }, FAVICON_ACK_TIMEOUT_MS);
    pendingFaviconAcks.set(tabId, { resolve, timer });
  });
}

/**
 * Checks unsaved forms (optional), applies visual suspended indicators in a single
 * MAIN-world injection, waits for Chrome's favicon acknowledgment when applicable,
 * and discards the tab.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {object} settings
 * @param {boolean} [checkForms=false]
 * @param {boolean} [bypassDirtyCache=false]
 * @returns {Promise<{ discarded: boolean, dirtyForm: boolean }>}
 */
async function prepareAndDiscardTab(tab, settings, checkForms = false, bypassDirtyCache = false) {
  const tabId = tab?.id;
  if (!tabId || discardingTabIds.has(tabId)) {
    return { discarded: false, dirtyForm: false };
  }

  const shouldCheckForms = Boolean(checkForms && settings.noSuspendForms);
  if (shouldCheckForms && !bypassDirtyCache) {
    const dirtyUntil = dirtyFormCache.get(tabId);
    if (dirtyUntil !== undefined && dirtyUntil > Date.now()) {
      return { discarded: false, dirtyForm: true };
    }
  }

  discardingTabIds.add(tabId);
  const alreadyHasSuspendedIcon =
    tab.favIconUrl === SUSPENDED_ICON_16_URL || tab.favIconUrl === SUSPENDED_ICON_32_URL;
  let faviconAcknowledged = null;

  try {
    if (!alreadyHasSuspendedIcon) {
      faviconAcknowledged = createFaviconAckWaiter(tabId);
    }

    let scriptResult = null;
    try {
      // Single MAIN-world injection avoids creating a throwaway ISOLATED V8 context
      // right before discarding the renderer process, and lets Chrome's favicon
      // observer pick up <link> mutations from the main JS context.
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [
          shouldCheckForms,
          Boolean(settings.markSuspendedTitle),
          alreadyHasSuspendedIcon,
          SUSPENDED_ICON_16_URL,
          SUSPENDED_ICON_32_URL
        ],
        func: (detectForms, markTitle, skipFavicon, iconUrl, icon32Url) => {
          if (detectForms) {
            const inputs = document.querySelectorAll(
              'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea'
            );
            for (const input of inputs) {
              if (
                input.value !== input.defaultValue &&
                input.value &&
                input.value.trim().length > 0
              ) {
                return { aborted: true, faviconChanged: false };
              }
            }
            const editables = document.querySelectorAll('[contenteditable="true"]');
            for (const el of editables) {
              // Fast path avoids synchronous layout/reflow via innerText on empty nodes
              if (
                el.textContent &&
                el.textContent.trim().length > 0 &&
                el.innerText &&
                el.innerText.trim().length > 0
              ) {
                return { aborted: true, faviconChanged: false };
              }
            }
          }

          if (markTitle && !document.title.startsWith('💤 ')) {
            document.title = `💤 ${document.title}`;
          }

          let faviconChanged = false;
          if (!skipFavicon && document.head) {
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
            faviconChanged = true;
          }

          return { aborted: false, faviconChanged };
        }
      });
      scriptResult = results?.[0]?.result ?? null;
    } catch {
      // Restricted/uninjectable tab — proceed directly to discard
      resolveFaviconAck(tabId, false);
    }

    if (scriptResult?.aborted) {
      resolveFaviconAck(tabId, false);
      dirtyFormCache.set(tabId, Date.now() + DIRTY_FORM_COOLDOWN_MS);
      return { discarded: false, dirtyForm: true };
    }

    if (faviconAcknowledged) {
      if (scriptResult?.faviconChanged) {
        await faviconAcknowledged;
      } else {
        resolveFaviconAck(tabId, false);
      }
    }

    try {
      await chrome.tabs.discard(tabId);
      dirtyFormCache.delete(tabId);
      return { discarded: true, dirtyForm: false };
    } catch {
      return { discarded: false, dirtyForm: false };
    }
  } finally {
    resolveFaviconAck(tabId, false);
    discardingTabIds.delete(tabId);
  }
}

/**
 * Discards eligible tabs using a bounded concurrency worker pool (avoids
 * head-of-line blocking when a single slow tab hits the favicon ack timeout).
 */
async function suspendTabsWithPool(tabs, settings, checkForms = false, bypassDirtyCache = false) {
  if (!tabs.length) {
    return { suspended: 0, discardedIds: new Set() };
  }

  let nextIndex = 0;
  let suspended = 0;
  const discardedIds = new Set();
  const workerCount = Math.min(SUSPEND_CONCURRENCY, tabs.length);

  async function worker() {
    while (nextIndex < tabs.length) {
      const tab = tabs[nextIndex++];
      const result = await prepareAndDiscardTab(tab, settings, checkForms, bypassDirtyCache);
      if (result.discarded) {
        suspended++;
        discardedIds.add(tab.id);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { suspended, discardedIds };
}

function incrementTotalSuspended(count) {
  if (count <= 0) return Promise.resolve();
  statsWriteChain = statsWriteChain
    .then(async () => {
      const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
      await chrome.storage.local.set({ totalSuspended: totalSuspended + count });
    })
    .catch(() => {});
  return statsWriteChain;
}

// ---------------------------------------------------------------------------
// Badge management (debounced + deduplicated)
// ---------------------------------------------------------------------------
function scheduleBadgeUpdate() {
  if (cachedSettings && !cachedSettings.showBadge && lastBadgeText === '') {
    return;
  }
  if (badgeTimer !== null) return;
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    updateBadge();
  }, BADGE_DEBOUNCE_MS);
}

async function updateBadge() {
  if (badgeTimer !== null) {
    clearTimeout(badgeTimer);
    badgeTimer = null;
  }
  try {
    const settings = await getSettings();
    if (!settings.showBadge) {
      if (lastBadgeText !== '') {
        await chrome.action.setBadgeText({ text: '' });
        lastBadgeText = '';
      }
      return;
    }
    const discardedTabs = await chrome.tabs.query({ discarded: true });
    const count = discardedTabs.length;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    if (text !== lastBadgeText) {
      await chrome.action.setBadgeText({ text });
      lastBadgeText = text;
    }
    if (text && !badgeColorInitialized) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BG_COLOR });
      badgeColorInitialized = true;
    }
  } catch {
    // Ignore transient badge update errors
  }
}

// ---------------------------------------------------------------------------
// Adaptive alarm management (allows MV3 Service Worker to sleep when idle)
// ---------------------------------------------------------------------------
async function scheduleAlarmDelay(delayMs) {
  if (delayMs === null || delayMs === undefined) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }
  const clampedDelay = Math.max(MIN_ALARM_DELAY_MS, delayMs);
  await chrome.alarms.create(ALARM_NAME, {
    when: Date.now() + clampedDelay
  });
}

function scheduleAlarmRecompute() {
  if (alarmRescheduleTimer !== null) return;
  alarmRescheduleTimer = setTimeout(() => {
    alarmRescheduleTimer = null;
    setupAlarm().catch(() => {});
  }, ALARM_RESCHEDULE_DEBOUNCE_MS);
}

async function setupAlarm() {
  if (alarmRescheduleTimer !== null) {
    clearTimeout(alarmRescheduleTimer);
    alarmRescheduleTimer = null;
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  const now = Date.now();
  pruneExpiredDirtyForms(now);

  const tabs = await chrome.tabs.query({ discarded: false });
  const keys = [];
  for (let i = 0; i < tabs.length; i++) {
    const id = tabs[i].id;
    keys.push(`tab_${id}`, `exempt_tab_${id}`);
  }
  const sessionData = keys.length > 0 ? await chrome.storage.session.get(keys) : {};
  const delayMs = computeNextCheckDelayMs(
    tabs,
    settings,
    sessionData,
    sessionData,
    now,
    dirtyFormCache,
    compiledWhitelist
  );
  await scheduleAlarmDelay(delayMs);
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

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const activityMap = {};
  for (const tab of tabs) {
    activityMap[`tab_${tab.id}`] = tab.active ? now : now - 60000;
    if (tab.active && tab.windowId !== undefined) {
      activeTabByWindow.set(tab.windowId, tab.id);
      activityMap[`active_win_${tab.windowId}`] = tab.id;
    }
  }
  await chrome.storage.session.set(activityMap);

  await Promise.all([setupAlarm(), setupContextMenus(), updateBadge()]);
});

chrome.runtime.onStartup.addListener(async () => {
  const [settings] = await Promise.all([
    getSettings(),
    setupContextMenus(),
    pruneOrphanedSessionKeys()
  ]);
  hasPrunedSessionThisLifetime = true;

  if (!settings.enabled || !settings.lazyLoadStartup) {
    await Promise.all([setupAlarm(), updateBadge()]);
    return;
  }

  // Discard all eligible non-active tabs on startup
  const tabs = await chrome.tabs.query({ discarded: false });
  const now = Date.now();
  const eligibleTabs = tabs.filter((tab) =>
    isTabEligible(tab, settings, now, now, true, false, false, compiledWhitelist).eligible
  );

  const { suspended } = await suspendTabsWithPool(eligibleTabs, settings, false, false);
  await incrementTotalSuspended(suspended);
  await Promise.all([setupAlarm(), updateBadge()]);
});

// ---------------------------------------------------------------------------
// Tab Activity Tracking
// ---------------------------------------------------------------------------
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const now = Date.now();
  dirtyFormCache.delete(tabId);

  let prevTabId = activeTabByWindow.get(windowId);
  if (prevTabId === undefined) {
    try {
      const stored = await chrome.storage.session.get(`active_win_${windowId}`);
      prevTabId = stored[`active_win_${windowId}`];
    } catch {
      prevTabId = undefined;
    }
  }

  activeTabByWindow.set(windowId, tabId);
  const updates = {
    [`tab_${tabId}`]: now,
    [`active_win_${windowId}`]: tabId
  };
  if (prevTabId !== undefined && prevTabId !== tabId) {
    // Mark when the previously active tab actually became inactive
    updates[`tab_${prevTabId}`] = now;
  }

  await chrome.storage.session.set(updates);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.favIconUrl && pendingFaviconAcks.has(tabId)) {
    resolveFaviconAck(tabId, true);
  }
  if (changeInfo.status === 'complete') {
    dirtyFormCache.delete(tabId);
    chrome.storage.session.set({ [`tab_${tabId}`]: Date.now() }).catch(() => {});
    scheduleBadgeUpdate();
  } else if (changeInfo.discarded !== undefined) {
    scheduleBadgeUpdate();
  }
  if (
    changeInfo.audible === false ||
    changeInfo.pinned === false ||
    changeInfo.groupId === -1
  ) {
    scheduleAlarmRecompute();
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const now = Date.now();
  const sessionWrite = chrome.storage.session.set({ [`tab_${tab.id}`]: now });

  const settings = await getSettings();
  await sessionWrite;
  if (!settings.enabled || !settings.activeTabLimit) return;

  const activeTabs = await chrome.tabs.query({ discarded: false });
  if (activeTabs.length <= settings.activeTabLimitCount) return;

  const keys = [];
  for (let i = 0; i < activeTabs.length; i++) {
    const id = activeTabs[i].id;
    keys.push(`tab_${id}`, `exempt_tab_${id}`);
  }
  const sessionData = await chrome.storage.session.get(keys);

  const candidates = activeTabs
    .filter((t) =>
      t.id !== tab.id &&
      !discardingTabIds.has(t.id) &&
      isTabEligible(
        t,
        settings,
        0,
        now,
        true,
        Boolean(sessionData[`exempt_tab_${t.id}`]),
        false,
        compiledWhitelist
      ).eligible
    )
    .sort((a, b) => {
      const aTime = sessionData[`tab_${a.id}`] ?? 0;
      const bTime = sessionData[`tab_${b.id}`] ?? 0;
      return aTime - bTime; // oldest first
    });

  for (const candidate of candidates) {
    const { discarded } = await prepareAndDiscardTab(candidate, settings, true, false);
    if (discarded) {
      await incrementTotalSuspended(1);
      scheduleBadgeUpdate();
      break;
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  resolveFaviconAck(tabId, false);
  dirtyFormCache.delete(tabId);
  if (removeInfo && activeTabByWindow.get(removeInfo.windowId) === tabId) {
    activeTabByWindow.delete(removeInfo.windowId);
  }
  queueSessionRemoval([`tab_${tabId}`, `exempt_tab_${tabId}`]);
  scheduleBadgeUpdate();
});

chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  resolveFaviconAck(removedTabId, false);
  dirtyFormCache.delete(removedTabId);

  try {
    const oldTabKey = `tab_${removedTabId}`;
    const oldExemptKey = `exempt_tab_${removedTabId}`;
    const data = await chrome.storage.session.get([oldTabKey, oldExemptKey]);
    const toSet = {};
    if (data[oldExemptKey]) {
      toSet[`exempt_tab_${addedTabId}`] = true;
    }
    if (data[oldTabKey] !== undefined) {
      toSet[`tab_${addedTabId}`] = data[oldTabKey];
    }
    if (Object.keys(toSet).length > 0) {
      await chrome.storage.session.set(toSet);
    }
    queueSessionRemoval([oldTabKey, oldExemptKey]);
  } catch {
    // Ignore transient session storage errors
  }

  for (const [winId, activeId] of activeTabByWindow.entries()) {
    if (activeId === removedTabId) {
      activeTabByWindow.set(winId, addedTabId);
      chrome.storage.session.set({ [`active_win_${winId}`]: addedTabId }).catch(() => {});
      break;
    }
  }

  scheduleBadgeUpdate();
});

chrome.windows.onRemoved.addListener((windowId) => {
  activeTabByWindow.delete(windowId);
  queueSessionRemoval([`active_win_${windowId}`]);
});

// ---------------------------------------------------------------------------
// Suspend on window minimize
// ---------------------------------------------------------------------------
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) return;

  const settings = cachedSettings || (await getSettings());
  if (!settings.suspendOnMinimize || !settings.enabled) return;

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
// Storage change listener (sync cache, alarm, badge, context menus)
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  settingsVersion++;
  if (cachedSettings) {
    for (const [key, { newValue }] of Object.entries(changes)) {
      cachedSettings[key] = newValue !== undefined ? newValue : DEFAULT_SETTINGS[key];
    }
    if (changes.whitelist || changes.whitelistUrls) {
      compiledWhitelist = compileWhitelist(
        cachedSettings.whitelist,
        cachedSettings.whitelistUrls
      );
    }
  } else {
    settingsLoadPromise = null;
  }

  if (
    changes.enabled ||
    changes.aggressiveMode ||
    changes.thresholdMinutes ||
    changes.whitelist ||
    changes.whitelistUrls ||
    changes.noSuspendAudio ||
    changes.noSuspendPinned ||
    changes.noSuspendForms ||
    changes.noSuspendGrouped
  ) {
    setupAlarm().catch(() => {});
  }
  if (changes.showBadge) updateBadge();
  if (changes.userLanguage) setupContextMenus();
});

// ---------------------------------------------------------------------------
// Core: Suspend eligible inactive tabs
// ---------------------------------------------------------------------------
async function suspendInactiveTabs(forceAll = false) {
  if (isSuspending) return { suspended: 0 };
  isSuspending = true;

  try {
    const settings = await getSettings();
    if (!settings.enabled && !forceAll) {
      await scheduleAlarmDelay(null);
      return { suspended: 0 };
    }

    const now = Date.now();
    pruneExpiredDirtyForms(now);

    const tabs = await chrome.tabs.query({ discarded: false });
    const keys = [];
    for (let i = 0; i < tabs.length; i++) {
      const id = tabs[i].id;
      keys.push(`tab_${id}`, `exempt_tab_${id}`);
    }
    const sessionData = keys.length > 0 ? await chrome.storage.session.get(keys) : {};

    const missingActivity = {};
    const eligibleTabs = [];

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const tabKey = `tab_${tab.id}`;
      let lastActive = sessionData[tabKey];
      if (lastActive === undefined) {
        // Give newly tracked tabs (e.g. after SW/extension reload) a grace period
        lastActive = now;
        sessionData[tabKey] = now;
        missingActivity[tabKey] = now;
      }

      const isExempt = Boolean(sessionData[`exempt_tab_${tab.id}`]);
      const check = isTabEligible(
        tab,
        settings,
        lastActive,
        now,
        forceAll,
        isExempt,
        false,
        compiledWhitelist
      );
      if (check.eligible) {
        eligibleTabs.push(tab);
      }
    }

    if (Object.keys(missingActivity).length > 0) {
      await chrome.storage.session.set(missingActivity);
    }

    const { suspended, discardedIds } = await suspendTabsWithPool(
      eligibleTabs,
      settings,
      true,
      forceAll
    );

    if (suspended > 0) {
      await incrementTotalSuspended(suspended);
      await updateBadge();
    }

    // Schedule next adaptive check excluding tabs we just discarded
    const remainingTabs = discardedIds.size > 0
      ? tabs.filter((t) => !discardedIds.has(t.id))
      : tabs;
    const nextDelayMs = computeNextCheckDelayMs(
      remainingTabs,
      settings,
      sessionData,
      sessionData,
      Date.now(),
      dirtyFormCache,
      compiledWhitelist
    );
    await scheduleAlarmDelay(nextDelayMs);

    if (!hasPrunedSessionThisLifetime) {
      hasPrunedSessionThisLifetime = true;
      pruneOrphanedSessionKeys();
    }

    return { suspended };
  } finally {
    isSuspending = false;
  }
}

// ---------------------------------------------------------------------------
// Alarm handler
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) suspendInactiveTabs(false);
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
      .catch((err) => sendResponse({
        sessionSuspended: 0,
        sessionSavedMB: 0,
        totalSuspended: 0,
        totalSavedMB: 0,
        error: err?.message
      }));
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
  const [discardedTabs, { totalSuspended = 0 }] = await Promise.all([
    chrome.tabs.query({ discarded: true }),
    chrome.storage.local.get('totalSuspended')
  ]);
  const discarded = discardedTabs.length;
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

  const settings = await getSettings();
  const { discarded } = await prepareAndDiscardTab(tab, settings, false, true);
  if (discarded) {
    await incrementTotalSuspended(1);
    await updateBadge();
  }
}

async function suspendOtherTabsInWindow(windowId, activeTabId) {
  const [tabs, settings] = await Promise.all([
    chrome.tabs.query({ windowId, discarded: false }),
    getSettings()
  ]);
  const exemptKeys = tabs.map((t) => `exempt_tab_${t.id}`);
  const exemptData = exemptKeys.length > 0 ? await chrome.storage.session.get(exemptKeys) : {};
  const now = Date.now();

  const eligibleTabs = tabs.filter((tab) => {
    if (tab.id === activeTabId) return false;
    const isExempt = Boolean(exemptData[`exempt_tab_${tab.id}`]);
    return isTabEligible(tab, settings, now, now, true, isExempt, false, compiledWhitelist).eligible;
  });

  const { suspended } = await suspendTabsWithPool(eligibleTabs, settings, true, true);
  if (suspended > 0) {
    await incrementTotalSuspended(suspended);
    await updateBadge();
  }
}

async function whitelistCurrentDomain(tab) {
  if (!tab?.url || isSystemUrl(tab.url)) return;
  const hostname = extractHostname(tab.url);
  if (!hostname) return;
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  if (!whitelist.includes(hostname)) {
    whitelist.push(hostname);
    await chrome.storage.sync.set({ whitelist });
  }
}

// ---------------------------------------------------------------------------
// Context Menus (localized according to userLanguage setting)
// ---------------------------------------------------------------------------
async function loadLocaleMessages() {
  try {
    const { userLanguage = 'auto' } = await getSettings();
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
