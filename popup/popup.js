// =============================================================================
// RAM Saver — Popup Script
// =============================================================================

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const globalToggle  = document.getElementById('global-toggle');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const statMb        = document.getElementById('stat-mb');
const statTabs      = document.getElementById('stat-tabs');
const timerSelect   = document.getElementById('timer-select');
const btnSuspendAll = document.getElementById('btn-suspend-all');
const btnSettings   = document.getElementById('btn-settings');
const btnWlDomain   = document.getElementById('btn-wl-domain');
const btnWlUrl      = document.getElementById('btn-wl-url');
const btnWlTab      = document.getElementById('btn-wl-tab');
const currentDomain = document.getElementById('current-tab-domain');
const toast         = document.getElementById('toast');
const tabsManagerCard   = document.getElementById('tabs-manager-card');
const tabsManagerHeader = document.getElementById('tabs-manager-header');
const tabsCountBadge    = document.getElementById('tabs-count-badge');
const tabSearchInput    = document.getElementById('tab-search-input');
const tabsList          = document.getElementById('tabs-list');
const tabsEmpty         = document.getElementById('tabs-empty');

// Current tab info (populated in loadCurrentTab)
let _currentTab = null;
let _currentHostname = '';
let _currentNormalizedUrl = '';
let _windowTabs = [];
let _filterQuery = '';

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------
function animateValue(el, from, to, duration = 500) {
  if (from === to) { el.textContent = to; return; }
  const start = performance.now();
  function update(now) {
    const elapsed = Math.min(now - start, duration);
    const ease = 1 - Math.pow(1 - elapsed / duration, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (elapsed < duration) requestAnimationFrame(update);
    else el.textContent = to;
  }
  requestAnimationFrame(update);
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
// Stats
// ---------------------------------------------------------------------------
let prevMb = 0, prevTabs = 0;
function updateStats(stats) {
  animateValue(statMb, prevMb, stats.sessionSavedMB, 600);
  animateValue(statTabs, prevTabs, stats.sessionSuspended, 600);
  prevMb = stats.sessionSavedMB;
  prevTabs = stats.sessionSuspended;
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (stats) updateStats(stats);
  });
}

// ---------------------------------------------------------------------------
// URL normalizer (mirror of service worker logic)
// ---------------------------------------------------------------------------
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch { return url; }
}

// ---------------------------------------------------------------------------
// Current tab — load and render whitelist buttons
// ---------------------------------------------------------------------------
async function loadCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) { currentTabRow.style.display = 'none'; return; }

    let hostname = '';
    try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}

    if (!hostname || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      currentTabRow.style.display = 'none';
      return;
    }

    _currentTab = tab;
    _currentHostname = hostname;
    _currentNormalizedUrl = normalizeUrl(tab.url);

    currentDomain.textContent = hostname;

    const { whitelist = [], whitelistUrls = [] } =
      await chrome.storage.sync.get(['whitelist', 'whitelistUrls']);

    // Domain button state
    const isDomainWL = whitelist.some(d => {
      const domain = d.toLowerCase().replace(/^www\./, '');
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });

    // URL button state
    const isUrlWL = whitelistUrls.some(u =>
      _currentNormalizedUrl === u || _currentNormalizedUrl.startsWith(u)
    );

    const { [`exempt_tab_${_currentTab.id}`]: isTabExempt = false } =
      await chrome.storage.session.get(`exempt_tab_${_currentTab.id}`);

    renderWlButton(btnWlDomain, isDomainWL, 'excludeDomain', 'currentTabWhitelistedDomain', 'wlDomainTitle');
    renderWlButton(btnWlUrl, isUrlWL, 'excludeUrl', 'currentTabWhitelistedUrl', 'wlUrlTitle');
    renderWlButton(btnWlTab, isTabExempt, 'excludeTab', 'currentTabWhitelistedTab', 'wlTabTitle');

    btnWlDomain.dataset.action = isDomainWL ? 'remove' : 'add';
    btnWlUrl.dataset.action = isUrlWL ? 'remove' : 'add';
    btnWlTab.dataset.action = isTabExempt ? 'remove' : 'add';

  } catch {
    currentTabRow.style.display = 'none';
  }
}

function renderWlButton(btn, isActive, labelKey, activeLabel, titleKey) {
  if (isActive) {
    btn.textContent = '✓ ' + I18n.t(activeLabel);
    btn.classList.add('active');
  } else {
    btn.textContent = '+ ' + I18n.t(labelKey);
    btn.classList.remove('active');
  }
  btn.title = I18n.t(titleKey);
}

// ---------------------------------------------------------------------------
// Whitelist domain button
// ---------------------------------------------------------------------------
btnWlDomain.addEventListener('click', async () => {
  if (!_currentHostname) return;
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  let updated;
  if (btnWlDomain.dataset.action === 'add') {
    updated = whitelist.includes(_currentHostname) ? whitelist : [...whitelist, _currentHostname];
  } else {
    updated = whitelist.filter(d => d !== _currentHostname);
  }
  await chrome.storage.sync.set({ whitelist: updated });
  await loadCurrentTab();
  showToast(btnWlDomain.dataset.action === 'add'
    ? `✓ ${_currentHostname} excluded`
    : `✓ ${_currentHostname} removed`);
});

// ---------------------------------------------------------------------------
// Whitelist URL button
// ---------------------------------------------------------------------------
btnWlUrl.addEventListener('click', async () => {
  if (!_currentNormalizedUrl) return;
  const { whitelistUrls = [] } = await chrome.storage.sync.get('whitelistUrls');
  let updated;
  if (btnWlUrl.dataset.action === 'add') {
    updated = whitelistUrls.includes(_currentNormalizedUrl)
      ? whitelistUrls
      : [...whitelistUrls, _currentNormalizedUrl];
  } else {
    updated = whitelistUrls.filter(u => u !== _currentNormalizedUrl);
  }
  await chrome.storage.sync.set({ whitelistUrls: updated });
  await loadCurrentTab();
  const shortUrl = _currentNormalizedUrl.replace(/^https?:\/\//, '').slice(0, 30);
  showToast(btnWlUrl.dataset.action === 'add'
    ? `✓ ${shortUrl}… excluded`
    : `✓ URL removed`);
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
  await loadCurrentTab();
  showToast(isAdding ? '✓ Tab protected' : '✓ Protection removed');
});

// ---------------------------------------------------------------------------
// Global toggle
// ---------------------------------------------------------------------------
globalToggle.addEventListener('change', async () => {
  const enabled = globalToggle.checked;
  await chrome.storage.sync.set({ enabled });
  updateStatusUI(enabled);
});

// ---------------------------------------------------------------------------
// Timer selector
// ---------------------------------------------------------------------------
timerSelect.addEventListener('change', async () => {
  await chrome.storage.sync.set({ thresholdMinutes: parseInt(timerSelect.value, 10) });
  showToast('✓ Timer updated');
});

// ---------------------------------------------------------------------------
// Suspend All
// ---------------------------------------------------------------------------
btnSuspendAll.addEventListener('click', () => {
  btnSuspendAll.disabled = true;
  btnSuspendAll.querySelector('span:last-child').textContent = '⏳ Suspending…';

  chrome.runtime.sendMessage({ action: 'suspendAll' }, (response) => {
    const count = response?.suspended ?? 0;
    showToast(count === 0
      ? '✓ No eligible tabs'
      : `✓ ${count} tab${count === 1 ? '' : 's'} suspended`);
    loadStats();
    loadWindowTabs();
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
  timerSelect.querySelectorAll('option[data-i18n]').forEach(opt => {
    const v = I18n.t(opt.getAttribute('data-i18n'));
    if (v) opt.textContent = v;
  });
}

// ---------------------------------------------------------------------------
// Window Tabs Manager
// ---------------------------------------------------------------------------
function isDomainWhitelistedHelper(url, whitelist) {
  if (!url || !whitelist?.length) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return whitelist.some(d => {
      const dom = d.toLowerCase().trim().replace(/^www\./, '');
      return hostname === dom || hostname.endsWith(`.${dom}`);
    });
  } catch { return false; }
}

function isUrlWhitelistedHelper(url, whitelistUrls) {
  if (!url || !whitelistUrls?.length) return false;
  const normalized = normalizeUrl(url);
  return whitelistUrls.some(u => normalized === u || normalized.startsWith(u));
}

function isSystemUrlHelper(url) {
  if (!url) return true;
  return ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://', 'view-source:']
    .some(p => url.startsWith(p));
}

async function loadWindowTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const { whitelist = [], whitelistUrls = [] } =
      await chrome.storage.sync.get(['whitelist', 'whitelistUrls']);
    const exemptData = await chrome.storage.session.get(tabs.map(t => `exempt_tab_${t.id}`));

    let suspendedCount = 0;
    _windowTabs = tabs.map(tab => {
      if (tab.discarded) suspendedCount++;

      let hostname = '';
      try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
      if (!hostname) hostname = tab.url || '';

      const isImmune = isDomainWhitelistedHelper(tab.url, whitelist) ||
                       isUrlWhitelistedHelper(tab.url, whitelistUrls) ||
                       Boolean(exemptData[`exempt_tab_${tab.id}`]) ||
                       isSystemUrlHelper(tab.url);

      let status = 'inactive';
      let statusClass = 'pill-inactive';
      let statusLabel = I18n.t('tabStatusInactive');

      if (tab.active) {
        status = 'active';
        statusClass = 'pill-active';
        statusLabel = I18n.t('tabStatusActive');
      } else if (tab.discarded) {
        status = 'suspended';
        statusClass = 'pill-suspended';
        statusLabel = I18n.t('tabStatusSuspended');
      } else if (isImmune) {
        status = 'immune';
        statusClass = 'pill-immune';
        statusLabel = I18n.t('tabStatusImmune');
      }

      return {
        id: tab.id,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        active: tab.active,
        discarded: tab.discarded,
        hostname,
        isImmune,
        status,
        statusClass,
        statusLabel
      };
    });

    if (tabsCountBadge) {
      tabsCountBadge.textContent = `${tabs.length} • ${suspendedCount} 💤`;
    }

    renderTabsList();
  } catch (err) {
    console.error('Error loading window tabs:', err);
  }
}

function renderTabsList() {
  if (!tabsList) return;
  tabsList.innerHTML = '';

  const q = _filterQuery.toLowerCase();
  const filtered = _windowTabs.filter(tab => {
    if (!q) return true;
    return tab.title.toLowerCase().includes(q) ||
           tab.hostname.toLowerCase().includes(q) ||
           tab.url.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    tabsEmpty?.classList.remove('hidden');
    return;
  }
  tabsEmpty?.classList.add('hidden');

  filtered.forEach(tab => {
    const item = document.createElement('div');
    item.className = tab.active ? 'tab-item active-tab' : 'tab-item';

    // Click row to switch to tab
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-tab-action')) return;
      await chrome.tabs.update(tab.id, { active: true });
      window.close();
    });

    // Left info
    const info = document.createElement('div');
    info.className = 'tab-info';

    const fav = document.createElement('img');
    fav.className = 'tab-favicon';
    fav.src = tab.favIconUrl || '../icons/icon16.png';
    fav.onerror = () => { fav.src = '../icons/icon16.png'; };
    info.appendChild(fav);

    const textWrap = document.createElement('div');
    textWrap.className = 'tab-text-wrap';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    title.title = tab.title;
    textWrap.appendChild(title);

    const domain = document.createElement('span');
    domain.className = 'tab-domain';
    domain.textContent = tab.hostname;
    textWrap.appendChild(domain);

    info.appendChild(textWrap);
    item.appendChild(info);

    // Right meta: status pill + quick action button
    const meta = document.createElement('div');
    meta.className = 'tab-meta';

    const pill = document.createElement('span');
    pill.className = `tab-status-pill ${tab.statusClass}`;
    pill.textContent = tab.statusLabel;
    meta.appendChild(pill);

    // Action button
    if (tab.discarded) {
      const btnWake = document.createElement('button');
      btnWake.type = 'button';
      btnWake.className = 'btn-tab-action';
      btnWake.title = I18n.t('actionWake');
      btnWake.textContent = '🔄';
      btnWake.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.tabs.update(tab.id, { active: true });
        window.close();
      });
      meta.appendChild(btnWake);
    } else if (!tab.active && !isSystemUrlHelper(tab.url)) {
      const btnSuspend = document.createElement('button');
      btnSuspend.type = 'button';
      btnSuspend.className = 'btn-tab-action';
      btnSuspend.title = I18n.t('actionSuspend');
      btnSuspend.textContent = '💤';
      btnSuspend.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnSuspend.disabled = true;
        btnSuspend.textContent = '⏳';
        chrome.runtime.sendMessage({ action: 'suspendTab', tabId: tab.id }, async () => {
          showToast('✓ Tab suspended');
          await loadStats();
          await loadWindowTabs();
        });
      });
      meta.appendChild(btnSuspend);
    }

    item.appendChild(meta);
    tabsList.appendChild(item);
  });
}

// Collapsible header toggle
tabsManagerHeader?.addEventListener('click', async () => {
  tabsManagerCard?.classList.toggle('collapsed');
  const isCollapsed = tabsManagerCard?.classList.contains('collapsed');
  await chrome.storage.local.set({ popupTabsCollapsed: isCollapsed });
});

// Search filter
tabSearchInput?.addEventListener('input', (e) => {
  _filterQuery = e.target.value.trim();
  renderTabsList();
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------
async function init() {
  await I18n.init();
  I18n.apply();
  applyTimerI18n();

  const { enabled = true, thresholdMinutes = 30 } =
    await chrome.storage.sync.get(['enabled', 'thresholdMinutes']);

  globalToggle.checked = enabled;
  updateStatusUI(enabled);

  const opt = timerSelect.querySelector(`option[value="${thresholdMinutes}"]`);
  if (opt) opt.selected = true;

  const { popupTabsCollapsed = false } = await chrome.storage.local.get('popupTabsCollapsed');
  if (popupTabsCollapsed) {
    tabsManagerCard?.classList.add('collapsed');
  }

  loadStats();
  loadCurrentTab();
  loadWindowTabs();
}

document.addEventListener('DOMContentLoaded', init);

