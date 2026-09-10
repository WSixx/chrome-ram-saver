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
const currentDomain = document.getElementById('current-tab-domain');
const currentTabRow = document.getElementById('current-tab-row');
const toast         = document.getElementById('toast');

// Current tab info (populated in loadCurrentTab)
let _currentTab = null;
let _currentHostname = '';
let _currentNormalizedUrl = '';

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

    renderWlButton(btnWlDomain, isDomainWL, 'excludeDomain', 'currentTabWhitelistedDomain', 'wlDomainTitle');
    renderWlButton(btnWlUrl, isUrlWL, 'excludeUrl', 'currentTabWhitelistedUrl', 'wlUrlTitle');

    btnWlDomain.dataset.action = isDomainWL ? 'remove' : 'add';
    btnWlUrl.dataset.action = isUrlWL ? 'remove' : 'add';

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

  loadStats();
  loadCurrentTab();
}

document.addEventListener('DOMContentLoaded', init);
