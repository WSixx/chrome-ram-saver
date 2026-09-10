'use strict';
// =============================================================================
// RAM Saver — Custom i18n Utility
// Supports: en, pt_BR, es + auto-detection
// =============================================================================
(function () {
  const SUPPORTED = ['en', 'pt_BR', 'es'];

  const I18n = {
    _messages: {},
    _lang: 'en',

    async init() {
      let lang = 'en';
      try {
        const { userLanguage = 'auto' } = await chrome.storage.sync.get('userLanguage');
        if (userLanguage === 'auto') {
          const ui = (navigator.language || 'en').toLowerCase();
          if (ui.startsWith('pt')) lang = 'pt_BR';
          else if (ui.startsWith('es')) lang = 'es';
          else lang = 'en';
        } else {
          lang = SUPPORTED.includes(userLanguage) ? userLanguage : 'en';
        }
      } catch { lang = 'en'; }

      this._lang = lang;

      try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const resp = await fetch(url);
        this._messages = await resp.json();
      } catch {
        try {
          const url = chrome.runtime.getURL('_locales/en/messages.json');
          const resp = await fetch(url);
          this._messages = await resp.json();
        } catch { this._messages = {}; }
      }
    },

    t(key) {
      return this._messages[key]?.message ?? chrome.i18n.getMessage(key) ?? key;
    },

    apply() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const v = this.t(el.getAttribute('data-i18n'));
        if (v) el.textContent = v;
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const v = this.t(el.getAttribute('data-i18n-placeholder'));
        if (v) el.placeholder = v;
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const v = this.t(el.getAttribute('data-i18n-title'));
        if (v) el.title = v;
      });
    }
  };

  window.I18n = I18n;
})();
