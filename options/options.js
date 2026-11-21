// =============================================================================
// RAM Saver — Options Page Script
// =============================================================================

const {
  DEFAULT_SETTINGS,
  RAM_PER_TAB_MB,
  isValidDomain,
  normalizeDomain,
  isValidUrl,
  normalizeUrl
} = globalThis.RamSaverUtils;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const optEnable              = document.getElementById('opt-enable');
const optTimer               = document.getElementById('opt-timer');
const timerDisplay           = document.getElementById('timer-display');
const optNoAudio             = document.getElementById('opt-no-audio');
const optNoPinned            = document.getElementById('opt-no-pinned');
const optNoForms             = document.getElementById('opt-no-forms');
const optNoGrouped           = document.getElementById('opt-no-grouped');
const optSuspendMin          = document.getElementById('opt-suspend-minimize');
const optShowBadge           = document.getElementById('opt-show-badge');
const optMarkTitle           = document.getElementById('opt-mark-title');
const optLang                = document.getElementById('opt-lang');
const optLazy                = document.getElementById('opt-lazy');
const optTabLimit            = document.getElementById('opt-tab-limit');
const optTabLimitCount       = document.getElementById('opt-tab-limit-count');
const tabLimitControl        = document.getElementById('tab-limit-control');
const optAggressive          = document.getElementById('opt-aggressive');
const domainInput            = document.getElementById('domain-input');
const btnAddDomain           = document.getElementById('btn-add-domain');
const domainError            = document.getElementById('domain-error');
const whitelistList          = document.getElementById('whitelist-list');
const whitelistEmpty         = document.getElementById('whitelist-empty');
const urlInput               = document.getElementById('url-input');
const btnAddUrl              = document.getElementById('btn-add-url');
const urlError               = document.getElementById('url-error');
const whitelistUrlList       = document.getElementById('whitelist-url-list');
const whitelistUrlEmp        = document.getElementById('whitelist-url-empty');
const statTotalTabs          = document.getElementById('stat-total-tabs');
const statTotalMb            = document.getElementById('stat-total-mb');
const statsEstimationNote    = document.getElementById('stats-estimation-note');
const btnResetStats          = document.getElementById('btn-reset-stats');
const brandVersion           = document.getElementById('brand-version');
const aboutVersion           = document.getElementById('about-version');
const shortcutSuspendCurrent = document.getElementById('shortcut-suspend-current');
const shortcutSuspendOthers  = document.getElementById('shortcut-suspend-others');
const toast                  = document.getElementById('toast');

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

function showSection(id, updateHash = true) {
  sections.forEach((s) => s.classList.toggle('hidden', s.id !== id));
  navItems.forEach((n) => n.classList.toggle('active', n.dataset.section === id));
  if (updateHash && window.location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
  }
  if (id === 'stats') loadStats();
}

navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

function handleHash() {
  const id = window.location.hash.replace('#', '') || 'general';
  if (document.getElementById(id)) showSection(id, false);
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
  timerDisplay.textContent = I18n.t('minutesShort', { min: val });
}

optTimer.addEventListener('input', () => {
  const val = parseInt(optTimer.value, 10);
  updateSlider(val);
});

optTimer.addEventListener('change', async () => {
  await chrome.storage.sync.set({ thresholdMinutes: parseInt(optTimer.value, 10) });
  showToast(I18n.t('toastTimerUpdated'));
});

// ---------------------------------------------------------------------------
// Apply i18n to select options
// ---------------------------------------------------------------------------
function applySelectI18n(selectEl) {
  selectEl.querySelectorAll('option[data-i18n]').forEach((opt) => {
    const key = opt.getAttribute('data-i18n');
    const v = I18n.t(key);
    if (v && v !== key) opt.textContent = v;
  });
}

// ---------------------------------------------------------------------------
// Render: domain whitelist (DocumentFragment + Event Delegation)
// ---------------------------------------------------------------------------
function renderWhitelist(list) {
  if (!list?.length) {
    whitelistList.replaceChildren();
    whitelistEmpty.classList.remove('hidden');
    return;
  }
  whitelistEmpty.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const domain = list[i];
    const li = document.createElement('li');
    li.className = 'whitelist-item';

    const span = document.createElement('span');
    span.className = 'whitelist-domain';
    span.textContent = domain;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-remove';
    btn.dataset.value = domain;
    btn.textContent = '✕';
    btn.setAttribute('aria-label', I18n.t('removeItemLabel', { item: domain }));

    li.appendChild(span);
    li.appendChild(btn);
    fragment.appendChild(li);
  }
  whitelistList.replaceChildren(fragment);
}

whitelistList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-remove');
  if (!btn) return;
  const domain = btn.dataset.value;
  if (!domain) return;

  const { whitelist: wl = [] } = await chrome.storage.sync.get('whitelist');
  const updated = wl.filter((d) => d !== domain);
  await chrome.storage.sync.set({ whitelist: updated });
  renderWhitelist(updated);
  showToast(I18n.t('toastDomainRemoved', { domain }));
});

// ---------------------------------------------------------------------------
// Render: URL whitelist (DocumentFragment + Event Delegation)
// ---------------------------------------------------------------------------
function renderUrlWhitelist(urls) {
  if (!urls?.length) {
    whitelistUrlList.replaceChildren();
    whitelistUrlEmp.classList.remove('hidden');
    return;
  }
  whitelistUrlEmp.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const display = url.replace(/^https?:\/\//, '');
    const li = document.createElement('li');
    li.className = 'whitelist-item';

    const span = document.createElement('span');
    span.className = 'whitelist-domain url-entry';
    span.title = url;
    span.textContent = display;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-remove';
    btn.dataset.value = url;
    btn.textContent = '✕';
    btn.setAttribute('aria-label', I18n.t('removeItemLabel', { item: display }));

    li.appendChild(span);
    li.appendChild(btn);
    fragment.appendChild(li);
  }
  whitelistUrlList.replaceChildren(fragment);
}

whitelistUrlList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-remove');
  if (!btn) return;
  const url = btn.dataset.value;
  if (!url) return;

  const { whitelistUrls: wl = [] } = await chrome.storage.sync.get('whitelistUrls');
  const updated = wl.filter((u) => u !== url);
  await chrome.storage.sync.set({ whitelistUrls: updated });
  renderUrlWhitelist(updated);
  showToast(I18n.t('toastUrlRemoved'));
});

// ---------------------------------------------------------------------------
// Add domain
// ---------------------------------------------------------------------------
btnAddDomain.addEventListener('click', addDomain);
domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDomain(); });

async function addDomain() {
  const raw = domainInput.value.trim();
  domainError.textContent = '';
  if (!raw) return;
  if (!isValidDomain(raw)) { domainError.textContent = I18n.t('invalidDomain'); return; }
  const domain = normalizeDomain(raw);
  const { whitelist = [] } = await chrome.storage.sync.get('whitelist');
  if (whitelist.some((d) => d.toLowerCase() === domain)) {
    domainError.textContent = I18n.t('domainExists'); return;
  }
  const updated = [...whitelist, domain];
  await chrome.storage.sync.set({ whitelist: updated });
  domainInput.value = '';
  renderWhitelist(updated);
  showToast(I18n.t('toastDomainAdded', { domain }));
}

// ---------------------------------------------------------------------------
// Add URL
// ---------------------------------------------------------------------------
btnAddUrl.addEventListener('click', addUrl);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addUrl(); });

async function addUrl() {
  const raw = urlInput.value.trim();
  urlError.textContent = '';
  if (!raw) return;
  if (!isValidUrl(raw)) { urlError.textContent = I18n.t('invalidUrl'); return; }
  const normalized = normalizeUrl(raw);
  const { whitelistUrls = [] } = await chrome.storage.sync.get('whitelistUrls');
  if (whitelistUrls.some((u) => normalizeUrl(u) === normalized)) {
    urlError.textContent = I18n.t('urlExists'); return;
  }
  const updated = [...whitelistUrls, normalized];
  await chrome.storage.sync.set({ whitelistUrls: updated });
  urlInput.value = '';
  renderUrlWhitelist(updated);
  showToast(I18n.t('toastUrlAdded'));
}

// ---------------------------------------------------------------------------
// Simple toggle factory
// ---------------------------------------------------------------------------
function makeToggle(el, key) {
  el.addEventListener('change', async () => {
    await chrome.storage.sync.set({ [key]: el.checked });
    showToast(I18n.t('toastSaved'));
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function loadStats() {
  const { totalSuspended = 0 } = await chrome.storage.local.get('totalSuspended');
  statTotalTabs.textContent = totalSuspended.toLocaleString();
  statTotalMb.textContent = `${(totalSuspended * RAM_PER_TAB_MB).toLocaleString()} MB`;
}

btnResetStats.addEventListener('click', async () => {
  if (!confirm(I18n.t('confirmResetStats'))) return;
  await chrome.storage.local.set({ totalSuspended: 0 });
  loadStats();
  showToast(I18n.t('toastStatsReset'));
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
  showToast(I18n.t('toastSaved'));
});

optTabLimitCount.addEventListener('change', async () => {
  const count = Math.max(1, Math.min(100, parseInt(optTabLimitCount.value, 10) || 20));
  optTabLimitCount.value = count;
  await chrome.storage.sync.set({ activeTabLimitCount: count });
  showToast(I18n.t('toastSaved'));
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts display (live from Chrome)
// ---------------------------------------------------------------------------
function renderShortcuts(commands) {
  if (!commands) return;
  const byName = new Map(commands.map((c) => [c.name, c.shortcut]));
  if (shortcutSuspendCurrent) {
    shortcutSuspendCurrent.textContent = byName.get('suspend-current-tab') || I18n.t('shortcutNotSet');
  }
  if (shortcutSuspendOthers) {
    shortcutSuspendOthers.textContent = byName.get('suspend-other-tabs') || I18n.t('shortcutNotSet');
  }
}

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
// Initialize (parallelized settings + commands, single sync.get)
// ---------------------------------------------------------------------------
async function init() {
  const [settings, commands] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_SETTINGS),
    chrome.commands?.getAll ? chrome.commands.getAll().catch(() => null) : Promise.resolve(null)
  ]);

  await I18n.init(settings.userLanguage);
  I18n.apply();
  applySelectI18n(optLang);
  document.title = I18n.t('settingsTitle');
  if (statsEstimationNote) {
    statsEstimationNote.textContent = I18n.t('statsEstimationNote', { mb: RAM_PER_TAB_MB });
  }
  loadVersion();
  renderShortcuts(commands);
  handleHash();

  optEnable.checked       = settings.enabled;
  optNoAudio.checked      = settings.noSuspendAudio;
  optNoPinned.checked     = settings.noSuspendPinned;
  optNoForms.checked      = settings.noSuspendForms;
  optNoGrouped.checked    = settings.noSuspendGrouped;
  optSuspendMin.checked   = settings.suspendOnMinimize;
  optShowBadge.checked    = settings.showBadge;
  optMarkTitle.checked    = settings.markSuspendedTitle;
  optLazy.checked         = settings.lazyLoadStartup;
  optTabLimit.checked     = settings.activeTabLimit;
  optTabLimitCount.value  = settings.activeTabLimitCount;
  optAggressive.checked   = settings.aggressiveMode;

  // Timer slider
  const mins = settings.thresholdMinutes;
  optTimer.value = mins;
  updateSlider(mins);

  // Language
  const langOpt = optLang.querySelector(`option[value="${settings.userLanguage}"]`);
  if (langOpt) langOpt.selected = true;

  // Tab limit visibility
  updateTabLimitVisibility();

  // Wire up toggles
  makeToggle(optEnable, 'enabled');
  makeToggle(optNoAudio, 'noSuspendAudio');
  makeToggle(optNoPinned, 'noSuspendPinned');
  makeToggle(optNoForms, 'noSuspendForms');
  makeToggle(optNoGrouped, 'noSuspendGrouped');
  makeToggle(optSuspendMin, 'suspendOnMinimize');
  makeToggle(optShowBadge, 'showBadge');
  makeToggle(optMarkTitle, 'markSuspendedTitle');
  makeToggle(optLazy, 'lazyLoadStartup');
  makeToggle(optAggressive, 'aggressiveMode');

  renderWhitelist(settings.whitelist);
  renderUrlWhitelist(settings.whitelistUrls);

  // Configure shortcuts button
  document.getElementById('btn-configure-shortcuts')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

document.addEventListener('DOMContentLoaded', init);
