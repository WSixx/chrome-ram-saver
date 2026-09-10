// =============================================================================
// RAM Saver — Service Worker (Background)
// Manifest V3 | Vanilla JS | Zero dependencies
// =============================================================================

const ALARM_NAME        = 'ram-saver-check';
const RAM_PER_TAB_MB    = 60;
const SYSTEM_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://',
  'about:', 'devtools://', 'view-source:'
];

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  enabled: true,
  thresholdMinutes: 30,
  whitelist: [],
  whitelistUrls: [],
  userLanguage: 'auto',
  // Behavior toggles
  noSuspendAudio: true,
  noSuspendPinned: true,
  suspendOnMinimize: false,
  // Advanced
  lazyLoadStartup: true,
  activeTabLimit: false,
  activeTabLimitCount: 20,
  aggressiveMode: false,
  // Badge
  showBadge: true
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeUrl(url) {
  try { const u = new URL(url); return `${u.origin}${u.pathname}`; }
  catch { return url; }
}

function isDomainWhitelisted(url, whitelist) {
  if (!url || !whitelist?.length) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return whitelist.some(d => {
      const dom = d.toLowerCase().trim().replace(/^www\./, '');
      return hostname === dom || hostname.endsWith(`.${dom}`);
    });
  } catch { return false; }
}

function isUrlWhitelisted(url, whitelistUrls) {
  if (!url || !whitelistUrls?.length) return false;
  const normalized = normalizeUrl(url);
  return whitelistUrls.some(u => normalized === u || normalized.startsWith(u));
}

function isSystemUrl(url) {
  if (!url) return true;
  return SYSTEM_URL_PREFIXES.some(p => url.startsWith(p));
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
    const count = tabs.filter(t => t.discarded).length;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
  } catch {}
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

  const { lazyLoadStartup = true } = await chrome.storage.sync.get('lazyLoadStartup');
  if (!lazyLoadStartup) return;

  // Discard all non-active, non-pinned, non-audible tabs on startup
  const tabs = await chrome.tabs.query({});
  const { whitelist = [], whitelistUrls = [], noSuspendAudio = true, noSuspendPinned = true } =
    await chrome.storage.sync.get(['whitelist', 'whitelistUrls', 'noSuspendAudio', 'noSuspendPinned']);

  for (const tab of tabs) {
    if (tab.active || tab.discarded) continue;
    if (noSuspendPinned && tab.pinned) continue;
    if (noSuspendAudio && tab.audible) continue;
    if (isSystemUrl(tab.url)) continue;
    if (isDomainWhitelisted(tab.url, whitelist)) continue;
    if (isUrlWhitelisted(tab.url, whitelistUrls)) continue;
    try { await chrome.tabs.discard(tab.id); } catch {}
  }
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
  await chrome.storage.session.set({ [`tab_${tab.id}`]: Date.now() });

  // Active tab limit enforcement
  const { activeTabLimit = false, activeTabLimitCount = 20, noSuspendPinned = true, noSuspendAudio = true } =
    await chrome.storage.sync.get(['activeTabLimit', 'activeTabLimitCount', 'noSuspendPinned', 'noSuspendAudio']);

  if (!activeTabLimit) return;

  const allTabs = await chrome.tabs.query({});
  const activeTabs = allTabs.filter(t => !t.discarded);

  if (activeTabs.length <= activeTabLimitCount) return;

  // Find LRU eligible tab to suspend
  const activityData = await chrome.storage.session.get(allTabs.map(t => `tab_${t.id}`));
  const exemptData = await chrome.storage.session.get(allTabs.map(t => `exempt_tab_${t.id}`));
  const eligible = activeTabs
    .filter(t => !t.active && !isSystemUrl(t.url) && t.url !== 'about:blank' && !exemptData[`exempt_tab_${t.id}`])
    .filter(t => !(noSuspendPinned && t.pinned))
    .filter(t => !(noSuspendAudio && t.audible))
    .sort((a, b) => {
      const aTime = activityData[`tab_${a.id}`] ?? 0;
      const bTime = activityData[`tab_${b.id}`] ?? 0;
      return aTime - bTime; // oldest first
    });

  if (eligible.length > 0) {
    try { await chrome.tabs.discard(eligible[0].id); } catch {}
  }
  updateBadge();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.session.remove([`tab_${tabId}`, `exempt_tab_${tabId}`]);
  updateBadge();
});

// ---------------------------------------------------------------------------
// Suspend on window minimize / focus lost
// ---------------------------------------------------------------------------
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) return;

  const { suspendOnMinimize = false, enabled = true } =
    await chrome.storage.sync.get(['suspendOnMinimize', 'enabled']);

  if (!suspendOnMinimize || !enabled) return;

  await suspendInactiveTabs(true);
});

// ---------------------------------------------------------------------------
// Storage change listener (update alarm if aggressiveMode changes)
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.aggressiveMode) setupAlarm();
    if (changes.showBadge) updateBadge();
  }
});

// ---------------------------------------------------------------------------
// Core: Suspend eligible inactive tabs
// ---------------------------------------------------------------------------
async function suspendInactiveTabs(forceAll = false) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.enabled && !forceAll) return { suspended: 0 };

  // Aggressive mode: cap threshold at 5 minutes
  const effectiveThreshold = settings.aggressiveMode
    ? Math.min(settings.thresholdMinutes, 5)
    : settings.thresholdMinutes;

  const thresholdMs = effectiveThreshold * 60 * 1000;
  const now = Date.now();

  const tabs = await chrome.tabs.query({});
  const activityData = await chrome.storage.session.get(tabs.map(t => `tab_${t.id}`));
  const exemptData = await chrome.storage.session.get(tabs.map(t => `exempt_tab_${t.id}`));

  let newlySuspended = 0;

  for (const tab of tabs) {
    if (tab.active) continue;
    if (tab.discarded) continue;
    if (exemptData[`exempt_tab_${tab.id}`]) continue;
    if (settings.noSuspendPinned && tab.pinned) continue;
    if (settings.noSuspendAudio && tab.audible) continue;
    if (isSystemUrl(tab.url)) continue;
    if (!tab.url || tab.url === 'about:blank') continue;
    if (isDomainWhitelisted(tab.url, settings.whitelist)) continue;
    if (isUrlWhitelisted(tab.url, settings.whitelistUrls)) continue;

    const lastActive = activityData[`tab_${tab.id}`] ?? (now - thresholdMs - 1);
    if (forceAll || (now - lastActive) >= thresholdMs) {
      try { await chrome.tabs.discard(tab.id); newlySuspended++; } catch {}
    }
  }

  if (newlySuspended > 0) {
    const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
    await chrome.storage.local.set({ totalSuspended: totalSuspended + newlySuspended });
  }

  await updateBadge();

  return { suspended: newlySuspended };
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
    suspendInactiveTabs(true).then(sendResponse);
    return true;
  }
  if (message.action === 'getStats') {
    getStats().then(sendResponse);
    return true;
  }
  if (message.action === 'updateBadge') {
    updateBadge().then(sendResponse);
    return true;
  }
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function getStats() {
  const tabs = await chrome.tabs.query({});
  const discarded = tabs.filter(t => t.discarded).length;
  const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
  return {
    sessionSuspended: discarded,
    sessionSavedMB: discarded * RAM_PER_TAB_MB,
    totalSuspended,
    totalSavedMB: totalSuspended * RAM_PER_TAB_MB
  };
}
