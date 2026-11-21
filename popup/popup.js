// =============================================================================
// RAM Saver — Popup Script
// =============================================================================

const {
  DEFAULT_SETTINGS,
  RAM_PER_TAB_MB,
  normalizeUrl,
  extractHostname,
  isSystemUrl,
  compileWhitelist,
  findMatchingDomain,
  findMatchingUrl,
  isTabImmune
} = globalThis.RamSaverUtils;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const globalToggle      = document.getElementById('global-toggle');
const statusDot         = document.getElementById('status-dot');
const statusText        = document.getElementById('status-text');
const statMb            = document.getElementById('stat-mb');
const statTabs          = document.getElementById('stat-tabs');
const timerSelect       = document.getElementById('timer-select');
const btnSuspendAll     = document.getElementById('btn-suspend-all');
const btnSettings       = document.getElementById('btn-settings');
const btnWlDomain       = document.getElementById('btn-wl-domain');
const btnWlUrl          = document.getElementById('btn-wl-url');
const btnWlTab          = document.getElementById('btn-wl-tab');
const currentDomain     = document.getElementById('current-tab-domain');
const currentTabRow     = document.getElementById('current-tab-row');
const toast             = document.getElementById('toast');
const tabsManagerCard   = document.getElementById('tabs-manager-card');
const tabsManagerHeader = document.getElementById('tabs-manager-header');
const tabsCountBadge    = document.getElementById('tabs-count-badge');
const tabSearchInput    = document.getElementById('tab-search-input');
const tabsList          = document.getElementById('tabs-list');
const tabsEmpty         = document.getElementById('tabs-empty');

// Cached popup state
let _settings = { ...DEFAULT_SETTINGS };
let _compiledWhitelist = compileWhitelist([], []);
let _currentTab = null;
let _currentHostname = '';
let _currentNormalizedUrl = '';
let _rawWindowTabs = [];
let _windowTabs = [];
let _filterQuery = '';
let _isCollapsed = false;
let _tabsRendered = false;

// ---------------------------------------------------------------------------
// Animated counter (cancels in-flight animations & respects reduced motion)
// ---------------------------------------------------------------------------
const activeAnimations = new WeakMap();
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function animateValue(el, from, to, duration = 500) {
  const prevRaf = activeAnimations.get(el);
  if (prevRaf !== undefined) {
    cancelAnimationFrame(prevRaf);
    activeAnimations.delete(el);
  }

  if (from === to || prefersReducedMotion) {
    el.textContent = to;
    return;
  }

  const start = performance.now();
  function update(now) {
    const elapsed = Math.min(now - start, duration);
    const ease = 1 - Math.pow(1 - elapsed / duration, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (elapsed < duration) {
      activeAnimations.set(el, requestAnimationFrame(update));
    } else {
      el.textContent = to;
      activeAnimations.delete(el);
    }
  }
  activeAnimations.set(el, requestAnimationFrame(update));
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---------------------------------------------------------------------------
// Status UI
// ---------------------------------------------------------------------------
function updateStatusUI(enabled) {
  statusDot.className = enabled ? 'status-dot active' : 'status-dot';
  statusText.textContent = I18n.t(enabled ? 'toggleEnabled' : 'toggleDisabled');
  btnSuspendAll.disabled = !enabled;
}

// ---------------------------------------------------------------------------
// Stats (queried directly without waking up the Service Worker)
// ---------------------------------------------------------------------------
let prevMb = 0;
let prevTabs = 0;
function updateStats(stats) {
  animateValue(statMb, prevMb, stats.sessionSavedMB, 600);
  animateValue(statTabs, prevTabs, stats.sessionSuspended, 600);
  prevMb = stats.sessionSavedMB;
  prevTabs = stats.sessionSuspended;
}

// ---------------------------------------------------------------------------
// Current tab quick-whitelist row
// ---------------------------------------------------------------------------
function renderWlButton(btn, isActive, labelKey, activeLabel, titleKey) {
  if (isActive) {
    btn.textContent = `✓ ${I18n.t(activeLabel)}`;
    btn.classList.add('active');
  } else {
    btn.textContent = `+ ${I18n.t(labelKey)}`;
    btn.classList.remove('active');
  }
  btn.title = I18n.t(titleKey);
}

function renderCurrentTabRow(activeTab, exemptData) {
  if (!currentTabRow) return;
  if (!activeTab || !activeTab.url || isSystemUrl(activeTab.url)) {
    currentTabRow.style.display = 'none';
    _currentTab = null;
    _currentHostname = '';
    _currentNormalizedUrl = '';
    return;
  }

  const hostname = extractHostname(activeTab.url);
  if (!hostname) {
    currentTabRow.style.display = 'none';
    _currentTab = null;
    _currentHostname = '';
    _currentNormalizedUrl = '';
    return;
  }

  currentTabRow.style.display = 'flex';
  _currentTab = activeTab;
  _currentHostname = hostname;
  _currentNormalizedUrl = normalizeUrl(activeTab.url);
  currentDomain.textContent = hostname;

  const matchedDomain = findMatchingDomain(activeTab.url, _compiledWhitelist);
  const isDomainWL = matchedDomain !== null;

  const matchedUrl = findMatchingUrl(activeTab.url, _compiledWhitelist);
  const isUrlWL = matchedUrl !== null;

  const isTabExempt = Boolean(exemptData[`exempt_tab_${activeTab.id}`]);

  renderWlButton(btnWlDomain, isDomainWL, 'excludeDomain', 'currentTabWhitelistedDomain', 'wlDomainTitle');
  renderWlButton(btnWlUrl, isUrlWL, 'excludeUrl', 'currentTabWhitelistedUrl', 'wlUrlTitle');
  renderWlButton(btnWlTab, isTabExempt, 'excludeTab', 'currentTabWhitelistedTab', 'wlTabTitle');

  btnWlDomain.dataset.action = isDomainWL ? 'remove' : 'add';
  btnWlDomain.dataset.matchedEntry = matchedDomain || '';
  btnWlUrl.dataset.action = isUrlWL ? 'remove' : 'add';
  btnWlUrl.dataset.matchedEntry = matchedUrl || '';
  btnWlTab.dataset.action = isTabExempt ? 'remove' : 'add';
}

// ---------------------------------------------------------------------------
// Window Tabs Manager (DocumentFragment + Event Delegation + Zero-alloc Filter)
// ---------------------------------------------------------------------------
function updateTabsCountBadge(tabs) {
  if (!tabsCountBadge) return;
  let suspendedCount = 0;
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].discarded) suspendedCount++;
  }
  tabsCountBadge.textContent = `${tabs.length} • ${suspendedCount} 💤`;
}

function buildWindowTabsDOM(tabs, exemptData) {
  if (!tabsList) return;

  const labelActive = I18n.t('tabStatusActive');
  const labelSuspended = I18n.t('tabStatusSuspended');
  const labelImmune = I18n.t('tabStatusImmune');
  const labelInactive = I18n.t('tabStatusInactive');
  const labelUntitled = I18n.t('untitledTab');
  const labelWake = I18n.t('actionWake');
  const labelSuspend = I18n.t('actionSuspend');

  const fragment = document.createDocumentFragment();
  _windowTabs = new Array(tabs.length);

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const hostname = extractHostname(tab.url) || tab.url || '';
    const isExempt = Boolean(exemptData[`exempt_tab_${tab.id}`]);
    const immune = isTabImmune(tab, _settings, isExempt, _compiledWhitelist);

    let statusClass = 'pill-inactive';
    let statusLabel = labelInactive;
    if (tab.active) {
      statusClass = 'pill-active';
      statusLabel = labelActive;
    } else if (tab.discarded) {
      statusClass = 'pill-suspended';
      statusLabel = labelSuspended;
    } else if (immune) {
      statusClass = 'pill-immune';
      statusLabel = labelImmune;
    }

    const titleText = tab.title || labelUntitled;
    const urlText = tab.url || '';

    const item = document.createElement('div');
    item.className = tab.active ? 'tab-item active-tab' : 'tab-item';
    item.dataset.tabId = String(tab.id);
    item.dataset.discarded = tab.discarded ? 'true' : 'false';

    // Left info
    const info = document.createElement('div');
    info.className = 'tab-info';

    const fav = document.createElement('img');
    fav.className = 'tab-favicon';
    fav.loading = 'lazy';
    fav.decoding = 'async';
    fav.src = tab.favIconUrl || '../icons/icon16.png';
    fav.onerror = () => {
      fav.onerror = null;
      fav.src = '../icons/icon16.png';
    };
    info.appendChild(fav);

    const textWrap = document.createElement('div');
    textWrap.className = 'tab-text-wrap';

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = titleText;
    titleEl.title = titleText;
    textWrap.appendChild(titleEl);

    const domainEl = document.createElement('span');
    domainEl.className = 'tab-domain';
    domainEl.textContent = hostname;
    textWrap.appendChild(domainEl);

    info.appendChild(textWrap);
    item.appendChild(info);

    // Right meta: status pill + quick action button
    const meta = document.createElement('div');
    meta.className = 'tab-meta';

    const pill = document.createElement('span');
    pill.className = `tab-status-pill ${statusClass}`;
    pill.textContent = statusLabel;
    meta.appendChild(pill);

    if (tab.discarded) {
      const btnWake = document.createElement('button');
      btnWake.type = 'button';
      btnWake.className = 'btn-tab-action';
      btnWake.dataset.action = 'wake';
      btnWake.title = labelWake;
      btnWake.setAttribute('aria-label', labelWake);
      btnWake.textContent = '🔄';
      meta.appendChild(btnWake);
    } else if (!tab.active && !isSystemUrl(tab.url)) {
      const btnSuspend = document.createElement('button');
      btnSuspend.type = 'button';
      btnSuspend.className = 'btn-tab-action';
      btnSuspend.dataset.action = 'suspend';
      btnSuspend.title = labelSuspend;
      btnSuspend.setAttribute('aria-label', labelSuspend);
      btnSuspend.textContent = '💤';
      meta.appendChild(btnSuspend);
    }

    item.appendChild(meta);
    fragment.appendChild(item);

    _windowTabs[i] = {
      el: item,
      searchText: `${titleText}\n${hostname}\n${urlText}`.toLowerCase()
    };
  }

  tabsList.replaceChildren(fragment);
  _tabsRendered = true;
  applyTabsFilter();
}

function applyTabsFilter() {
  if (!_tabsRendered) return;
  const q = _filterQuery.toLowerCase();
  let visibleCount = 0;

  for (let i = 0; i < _windowTabs.length; i++) {
    const entry = _windowTabs[i];
    const matches = !q || entry.searchText.includes(q);
    entry.el.classList.toggle('hidden', !matches);
    if (matches) visibleCount++;
  }

  tabsEmpty?.classList.toggle('hidden', visibleCount > 0);
}

/**
 * Refreshes current tab whitelist state, window tabs drawer (if expanded),
 * and optionally session stats in a single batched pass.
 */
async function refreshTabState({ reloadSettings = false, reloadStats = false } = {}) {
  try {
    const [windowTabs, settings, discardedTabs] = await Promise.all([
      chrome.tabs.query({ currentWindow: true }),
      reloadSettings ? chrome.storage.sync.get(DEFAULT_SETTINGS) : Promise.resolve(_settings),
      reloadStats ? chrome.tabs.query({ discarded: true }) : Promise.resolve(null)
    ]);

    _rawWindowTabs = windowTabs;
    if (reloadSettings) {
      _settings = settings;
      _compiledWhitelist = compileWhitelist(settings.whitelist, settings.whitelistUrls);
    }

    if (discardedTabs) {
      updateStats({
        sessionSuspended: discardedTabs.length,
        sessionSavedMB: discardedTabs.length * RAM_PER_TAB_MB
      });
    }

    const activeTab = windowTabs.find((t) => t.active) || null;
    updateTabsCountBadge(windowTabs);

    const exemptKeys = _isCollapsed
      ? (activeTab ? [`exempt_tab_${activeTab.id}`] : [])
      : windowTabs.map((t) => `exempt_tab_${t.id}`);
    const exemptData = exemptKeys.length > 0
      ? await chrome.storage.session.get(exemptKeys)
      : {};

    renderCurrentTabRow(activeTab, exemptData);

    if (!_isCollapsed) {
      buildWindowTabsDOM(windowTabs, exemptData);
    } else {
      _tabsRendered = false;
    }
  } catch (err) {
    console.error('Error refreshing tabs state:', err);
  }
}

// Single delegated click listener for all tab rows and action buttons
tabsList?.addEventListener('click', async (e) => {
  const item = e.target.closest('.tab-item');
  if (!item) return;

  const tabId = Number(item.dataset.tabId);
  if (!tabId) return;

  const actionBtn = e.target.closest('.btn-tab-action');
  if (actionBtn) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    if (action === 'wake') {
      await chrome.tabs.update(tabId, { active: true });
      try { await chrome.tabs.reload(tabId); } catch { /* ignore */ }
      window.close();
    } else if (action === 'suspend') {
      actionBtn.disabled = true;
      actionBtn.textContent = '⏳';
      chrome.runtime.sendMessage({ action: 'suspendTab', tabId }, async () => {
        showToast(I18n.t('toastTabSuspended'));
        await refreshTabState({ reloadStats: true });
      });
    }
    return;
  }

  const isDiscarded = item.dataset.discarded === 'true';
  await chrome.tabs.update(tabId, { active: true });
  if (isDiscarded) {
    try { await chrome.tabs.reload(tabId); } catch { /* ignore */ }
  }
  window.close();
});

// ---------------------------------------------------------------------------
// Whitelist domain button
// ---------------------------------------------------------------------------
btnWlDomain.addEventListener('click', async () => {
  if (!_currentHostname) return;
  const isAdding = btnWlDomain.dataset.action === 'add';
  const targetDomain = btnWlDomain.dataset.matchedEntry || _currentHostname;
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');

  let updated;
  if (isAdding) {
    updated = whitelist.some((d) => d.toLowerCase() === _currentHostname)
      ? whitelist
      : [...whitelist, _currentHostname];
  } else {
    updated = whitelist.filter((d) => d !== targetDomain && d.toLowerCase() !== _currentHostname);
  }

  await chrome.storage.sync.set({ whitelist: updated });
  _settings.whitelist = updated;
  _compiledWhitelist = compileWhitelist(_settings.whitelist, _settings.whitelistUrls);
  await refreshTabState();
  showToast(I18n.t(isAdding ? 'toastDomainExcluded' : 'toastDomainRemoved', {
    domain: isAdding ? _currentHostname : targetDomain
  }));
});

// ---------------------------------------------------------------------------
// Whitelist URL button
// ---------------------------------------------------------------------------
btnWlUrl.addEventListener('click', async () => {
  if (!_currentNormalizedUrl) return;
  const isAdding = btnWlUrl.dataset.action === 'add';
  const targetUrl = btnWlUrl.dataset.matchedEntry || _currentNormalizedUrl;
  const { whitelistUrls = [] } = await chrome.storage.sync.get('whitelistUrls');

  let updated;
  if (isAdding) {
    updated = whitelistUrls.includes(_currentNormalizedUrl)
      ? whitelistUrls
      : [...whitelistUrls, _currentNormalizedUrl];
  } else {
    updated = whitelistUrls.filter((u) => u !== targetUrl && u !== _currentNormalizedUrl);
  }

  await chrome.storage.sync.set({ whitelistUrls: updated });
  _settings.whitelistUrls = updated;
  _compiledWhitelist = compileWhitelist(_settings.whitelist, _settings.whitelistUrls);
  await refreshTabState();
  const shortUrl = _currentNormalizedUrl.replace(/^https?:\/\//, '').slice(0, 30);
  showToast(isAdding
    ? I18n.t('toastUrlExcluded', { url: shortUrl })
    : I18n.t('toastUrlRemoved'));
});

// ---------------------------------------------------------------------------
// Whitelist Tab button (session immunity)
// ---------------------------------------------------------------------------
btnWlTab.addEventListener('click', async () => {
  if (!_currentTab?.id) return;
  const key = `exempt_tab_${_currentTab.id}`;
  const isAdding = btnWlTab.dataset.action === 'add';
  if (isAdding) {
    await chrome.storage.session.set({ [key]: true });
  } else {
    await chrome.storage.session.remove(key);
  }
  await refreshTabState();
  showToast(I18n.t(isAdding ? 'toastTabProtected' : 'toastProtectionRemoved'));
});

// ---------------------------------------------------------------------------
// Global toggle
// ---------------------------------------------------------------------------
globalToggle.addEventListener('change', async () => {
  const enabled = globalToggle.checked;
  _settings.enabled = enabled;
  await chrome.storage.sync.set({ enabled });
  updateStatusUI(enabled);
});

// ---------------------------------------------------------------------------
// Timer selector
// ---------------------------------------------------------------------------
timerSelect.addEventListener('change', async () => {
  const thresholdMinutes = parseInt(timerSelect.value, 10);
  _settings.thresholdMinutes = thresholdMinutes;
  await chrome.storage.sync.set({ thresholdMinutes });
  showToast(I18n.t('toastTimerUpdated'));
});

// ---------------------------------------------------------------------------
// Suspend All
// ---------------------------------------------------------------------------
btnSuspendAll.addEventListener('click', () => {
  btnSuspendAll.disabled = true;
  btnSuspendAll.querySelector('span:last-child').textContent = I18n.t('suspendingStatus');

  chrome.runtime.sendMessage({ action: 'suspendAll' }, async (response) => {
    const count = !chrome.runtime.lastError ? (response?.suspended ?? 0) : 0;
    if (count === 0) {
      showToast(I18n.t('toastNoEligibleTabs'));
    } else if (count === 1) {
      showToast(I18n.t('toastOneTabSuspended'));
    } else {
      showToast(I18n.t('toastManyTabsSuspended', { count }));
    }
    await refreshTabState({ reloadStats: true });
    btnSuspendAll.querySelector('span:last-child').textContent = I18n.t('suspendAll');
    btnSuspendAll.disabled = !globalToggle.checked;
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
btnSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Apply i18n to timer options
// ---------------------------------------------------------------------------
function applyTimerI18n() {
  timerSelect.querySelectorAll('option[data-i18n]').forEach((opt) => {
    const v = I18n.t(opt.getAttribute('data-i18n'));
    if (v) opt.textContent = v;
  });
}

// ---------------------------------------------------------------------------
// Collapsible Window Tabs Manager toggle
// ---------------------------------------------------------------------------
async function toggleTabsManager() {
  tabsManagerCard?.classList.toggle('collapsed');
  _isCollapsed = Boolean(tabsManagerCard?.classList.contains('collapsed'));
  tabsManagerHeader?.setAttribute('aria-expanded', String(!_isCollapsed));
  chrome.storage.local.set({ popupTabsCollapsed: _isCollapsed }).catch(() => {});

  if (!_isCollapsed && !_tabsRendered) {
    const tabs = _rawWindowTabs.length > 0
      ? _rawWindowTabs
      : await chrome.tabs.query({ currentWindow: true });
    const exemptKeys = tabs.map((t) => `exempt_tab_${t.id}`);
    const exemptData = exemptKeys.length > 0
      ? await chrome.storage.session.get(exemptKeys)
      : {};
    buildWindowTabsDOM(tabs, exemptData);
  }
}

tabsManagerHeader?.addEventListener('click', toggleTabsManager);
tabsManagerHeader?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleTabsManager();
  }
});

// Instant in-memory search filter (zero DOM churn)
tabSearchInput?.addEventListener('input', (e) => {
  _filterQuery = e.target.value.trim();
  applyTabsFilter();
});

// ---------------------------------------------------------------------------
// Initialize (2 parallel phases, zero Service Worker wake-up)
// ---------------------------------------------------------------------------
async function init() {
  // Phase 1: Parallel read of settings, local UI state, current window tabs, and discarded count
  const [settings, { popupTabsCollapsed = false }, windowTabs, discardedTabs] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_SETTINGS),
    chrome.storage.local.get('popupTabsCollapsed'),
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabs.query({ discarded: true })
  ]);

  _settings = settings;
  _compiledWhitelist = compileWhitelist(settings.whitelist, settings.whitelistUrls);
  _rawWindowTabs = windowTabs;
  _isCollapsed = Boolean(popupTabsCollapsed);

  if (_isCollapsed) {
    tabsManagerCard?.classList.add('collapsed');
    tabsManagerHeader?.setAttribute('aria-expanded', 'false');
  }

  const activeTab = windowTabs.find((t) => t.active) || null;
  const exemptKeys = _isCollapsed
    ? (activeTab ? [`exempt_tab_${activeTab.id}`] : [])
    : windowTabs.map((t) => `exempt_tab_${t.id}`);

  // Phase 2: Parallel load of locale JSON + session exemptions
  const [, exemptData] = await Promise.all([
    I18n.init(settings.userLanguage),
    exemptKeys.length > 0 ? chrome.storage.session.get(exemptKeys) : Promise.resolve({})
  ]);

  I18n.apply();
  applyTimerI18n();

  globalToggle.checked = settings.enabled;
  updateStatusUI(settings.enabled);

  const thresholdMinutes = settings.thresholdMinutes;
  let opt = timerSelect.querySelector(`option[value="${thresholdMinutes}"]`);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = String(thresholdMinutes);
    opt.textContent = I18n.t('minutesShort', { min: thresholdMinutes });
    timerSelect.appendChild(opt);
  }
  opt.selected = true;

  updateStats({
    sessionSuspended: discardedTabs.length,
    sessionSavedMB: discardedTabs.length * RAM_PER_TAB_MB
  });

  renderCurrentTabRow(activeTab, exemptData);
  updateTabsCountBadge(windowTabs);

  if (!_isCollapsed) {
    buildWindowTabsDOM(windowTabs, exemptData);
  }
}

document.addEventListener('DOMContentLoaded', init);
