// =============================================================================
// RAM Saver — Options Page Script
// =============================================================================

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const optEnable        = document.getElementById('opt-enable');
const optTimer         = document.getElementById('opt-timer');
const timerDisplay     = document.getElementById('timer-display');
const optNoAudio       = document.getElementById('opt-no-audio');
const optNoPinned      = document.getElementById('opt-no-pinned');
const optSuspendMin    = document.getElementById('opt-suspend-minimize');
const optShowBadge     = document.getElementById('opt-show-badge');
const optLang          = document.getElementById('opt-lang');
const optLazy          = document.getElementById('opt-lazy');
const optTabLimit      = document.getElementById('opt-tab-limit');
const optTabLimitCount = document.getElementById('opt-tab-limit-count');
const tabLimitControl  = document.getElementById('tab-limit-control');
const optAggressive    = document.getElementById('opt-aggressive');
const domainInput      = document.getElementById('domain-input');
const btnAddDomain     = document.getElementById('btn-add-domain');
const domainError      = document.getElementById('domain-error');
const whitelistList    = document.getElementById('whitelist-list');
const whitelistEmpty   = document.getElementById('whitelist-empty');
const urlInput         = document.getElementById('url-input');
const btnAddUrl        = document.getElementById('btn-add-url');
const urlError         = document.getElementById('url-error');
const whitelistUrlList = document.getElementById('whitelist-url-list');
const whitelistUrlEmp  = document.getElementById('whitelist-url-empty');
const statTotalTabs    = document.getElementById('stat-total-tabs');
const statTotalMb      = document.getElementById('stat-total-mb');
const btnResetStats    = document.getElementById('btn-reset-stats');
const brandVersion     = document.getElementById('brand-version');
const aboutVersion     = document.getElementById('about-version');
const toast            = document.getElementById('toast');

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---------------------------------------------------------------------------
// Section navigation (SPA-like)
// ---------------------------------------------------------------------------
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

function showSection(id) {
  sections.forEach(s => s.classList.toggle('hidden', s.id !== id));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.section === id));
  if (id === 'stats') loadStats();
}

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

function handleHash() {
  const id = window.location.hash.replace('#', '') || 'general';
  if (document.getElementById(id)) showSection(id);
}
window.addEventListener('hashchange', handleHash);

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------
function updateSlider(val) {
  const min = parseInt(optTimer.min, 10);
  const max = parseInt(optTimer.max, 10);
  const pct = ((val - min) / (max - min)) * 100;
  optTimer.style.setProperty('--fill', `${pct}%`);
  timerDisplay.textContent = `${val} min`;
}

optTimer.addEventListener('input', () => {
  const val = parseInt(optTimer.value, 10);
  updateSlider(val);
});

optTimer.addEventListener('change', async () => {
  await chrome.storage.sync.set({ thresholdMinutes: parseInt(optTimer.value, 10) });
  showToast('✓ Timer updated');
});

// ---------------------------------------------------------------------------
// Apply i18n to select options
// ---------------------------------------------------------------------------
function applySelectI18n(selectEl) {
  selectEl.querySelectorAll('option[data-i18n]').forEach(opt => {
    const v = I18n.t(opt.getAttribute('data-i18n'));
    if (v && v !== opt.getAttribute('data-i18n')) opt.textContent = v;
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function isValidDomain(d) {
  const clean = d.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(clean);
}

function normalizeDomain(d) {
  return d.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
}

function isValidUrl(u) {
  try {
    const p = new URL(u.trim());
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch { return false; }
}

function normalizeUrl(u) {
  try {
    const p = new URL(u.trim());
    return `${p.origin}${p.pathname}`.replace(/\/$/, '');
  } catch { return u.trim(); }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Render: domain whitelist
// ---------------------------------------------------------------------------
function renderWhitelist(list) {
  whitelistList.innerHTML = '';
  if (!list?.length) { whitelistEmpty.classList.remove('hidden'); return; }
  whitelistEmpty.classList.add('hidden');
  list.forEach(domain => {
    const li = document.createElement('li');
    li.className = 'whitelist-item';
    li.innerHTML = `<span class="whitelist-domain">${escHtml(domain)}</span>
      <button class="btn-remove" data-domain="${escHtml(domain)}">✕</button>`;
    li.querySelector('.btn-remove').addEventListener('click', async () => {
      const { whitelist: wl = [] } = await chrome.storage.sync.get('whitelist');
      const updated = wl.filter(d => d !== domain);
      await chrome.storage.sync.set({ whitelist: updated });
      renderWhitelist(updated);
      showToast(`✓ ${domain} removed`);
    });
    whitelistList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Render: URL whitelist
// ---------------------------------------------------------------------------
function renderUrlWhitelist(urls) {
  whitelistUrlList.innerHTML = '';
  if (!urls?.length) { whitelistUrlEmp.classList.remove('hidden'); return; }
  whitelistUrlEmp.classList.add('hidden');
  urls.forEach(url => {
    const display = url.replace(/^https?:\/\//, '');
    const li = document.createElement('li');
    li.className = 'whitelist-item';
    li.innerHTML = `<span class="whitelist-domain url-entry" title="${escHtml(url)}">${escHtml(display)}</span>
      <button class="btn-remove">✕</button>`;
    li.querySelector('.btn-remove').addEventListener('click', async () => {
      const { whitelistUrls: wl = [] } = await chrome.storage.sync.get('whitelistUrls');
      const updated = wl.filter(u => u !== url);
      await chrome.storage.sync.set({ whitelistUrls: updated });
      renderUrlWhitelist(updated);
      showToast('✓ URL removed');
    });
    whitelistUrlList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Add domain
// ---------------------------------------------------------------------------
btnAddDomain.addEventListener('click', addDomain);
domainInput.addEventListener('keydown', e => { if (e.key === 'Enter') addDomain(); });

async function addDomain() {
  const raw = domainInput.value.trim();
  domainError.textContent = '';
  if (!raw) return;
  if (!isValidDomain(raw)) { domainError.textContent = I18n.t('invalidDomain'); return; }
  const domain = normalizeDomain(raw);
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  if (whitelist.some(d => d.toLowerCase() === domain)) {
    domainError.textContent = I18n.t('domainExists'); return;
  }
  const updated = [...whitelist, domain];
  await chrome.storage.sync.set({ whitelist: updated });
  domainInput.value = '';
  renderWhitelist(updated);
  showToast(`✓ ${domain} added`);
}

// ---------------------------------------------------------------------------
// Add URL
// ---------------------------------------------------------------------------
btnAddUrl.addEventListener('click', addUrl);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(); });

async function addUrl() {
  const raw = urlInput.value.trim();
  urlError.textContent = '';
  if (!raw) return;
  if (!isValidUrl(raw)) { urlError.textContent = I18n.t('invalidUrl'); return; }
  const normalized = normalizeUrl(raw);
  const { whitelistUrls = [] } = await chrome.storage.sync.get('whitelistUrls');
  if (whitelistUrls.some(u => u === normalized)) {
    urlError.textContent = I18n.t('urlExists'); return;
  }
  const updated = [...whitelistUrls, normalized];
  await chrome.storage.sync.set({ whitelistUrls: updated });
  urlInput.value = '';
  renderUrlWhitelist(updated);
  showToast('✓ URL added');
}

// ---------------------------------------------------------------------------
// Simple toggle factory
// ---------------------------------------------------------------------------
function makeToggle(el, key) {
  el.addEventListener('change', async () => {
    await chrome.storage.sync.set({ [key]: el.checked });
    showToast('✓ Saved');
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function loadStats() {
  const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
  statTotalTabs.textContent = totalSuspended.toLocaleString();
  statTotalMb.textContent = `${(totalSuspended * 60).toLocaleString()} MB`;
}

btnResetStats.addEventListener('click', async () => {
  if (!confirm('Reset all statistics? This cannot be undone.')) return;
  await chrome.storage.local.set({ totalSuspended: 0 });
  loadStats();
  showToast('✓ Statistics reset');
});

// ---------------------------------------------------------------------------
// Language selector
// ---------------------------------------------------------------------------
optLang.addEventListener('change', async () => {
  await chrome.storage.sync.set({ userLanguage: optLang.value });
  window.location.reload();
});

// ---------------------------------------------------------------------------
// Active tab limit — show/hide sub-control
// ---------------------------------------------------------------------------
function updateTabLimitVisibility() {
  tabLimitControl.classList.toggle('hidden', !optTabLimit.checked);
}

optTabLimit.addEventListener('change', async () => {
  await chrome.storage.sync.set({ activeTabLimit: optTabLimit.checked });
  updateTabLimitVisibility();
  showToast('✓ Saved');
});

optTabLimitCount.addEventListener('change', async () => {
  const count = Math.max(1, Math.min(100, parseInt(optTabLimitCount.value, 10) || 20));
  optTabLimitCount.value = count;
  await chrome.storage.sync.set({ activeTabLimitCount: count });
  showToast('✓ Saved');
});

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
function loadVersion() {
  const { version } = chrome.runtime.getManifest();
  const ver = `v${version}`;
  if (brandVersion) brandVersion.textContent = ver;
  if (aboutVersion) aboutVersion.textContent = `${I18n.t('aboutVersion')} ${ver}`;
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------
async function init() {
  await I18n.init();
  I18n.apply();
  applySelectI18n(optLang);
  document.title = I18n.t('settingsTitle');
  loadVersion();
  handleHash();

  const settings = await chrome.storage.sync.get([
    'enabled', 'thresholdMinutes', 'whitelist', 'whitelistUrls', 'userLanguage',
    'noSuspendAudio', 'noSuspendPinned', 'suspendOnMinimize', 'showBadge',
    'lazyLoadStartup', 'activeTabLimit', 'activeTabLimitCount', 'aggressiveMode'
  ]);

  optEnable.checked       = settings.enabled       ?? true;
  optNoAudio.checked      = settings.noSuspendAudio  ?? true;
  optNoPinned.checked     = settings.noSuspendPinned ?? true;
  optSuspendMin.checked   = settings.suspendOnMinimize ?? false;
  optShowBadge.checked    = settings.showBadge         ?? true;
  optLazy.checked         = settings.lazyLoadStartup  ?? true;
  optTabLimit.checked     = settings.activeTabLimit    ?? false;
  optTabLimitCount.value  = settings.activeTabLimitCount ?? 20;
  optAggressive.checked   = settings.aggressiveMode   ?? false;

  // Timer slider
  const mins = settings.thresholdMinutes ?? 30;
  optTimer.value = mins;
  updateSlider(mins);

  // Language
  const langOpt = optLang.querySelector(`option[value="${settings.userLanguage ?? 'auto'}"]`);
  if (langOpt) langOpt.selected = true;

  // Tab limit visibility
  updateTabLimitVisibility();

  // Wire up toggles
  makeToggle(optEnable, 'enabled');
  makeToggle(optNoAudio, 'noSuspendAudio');
  makeToggle(optNoPinned, 'noSuspendPinned');
  makeToggle(optSuspendMin, 'suspendOnMinimize');
  makeToggle(optShowBadge, 'showBadge');
  makeToggle(optLazy, 'lazyLoadStartup');
  makeToggle(optAggressive, 'aggressiveMode');

  renderWhitelist(settings.whitelist ?? []);
  renderUrlWhitelist(settings.whitelistUrls ?? []);
}

document.addEventListener('DOMContentLoaded', init);
