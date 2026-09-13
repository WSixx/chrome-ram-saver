// =============================================================================
// tests/unit/i18n.test.js
// Unit tests validating localization integrity and parity across en, pt_BR, es
// =============================================================================

const en = require('../../_locales/en/messages.json');
const ptBR = require('../../_locales/pt_BR/messages.json');
const es = require('../../_locales/es/messages.json');

describe('i18n localization integrity', () => {
  const enKeys = Object.keys(en).sort();
  const ptKeys = Object.keys(ptBR).sort();
  const esKeys = Object.keys(es).sort();

  test('all locale files have translation keys', () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(ptKeys.length).toBeGreaterThan(0);
    expect(esKeys.length).toBeGreaterThan(0);
  });

  test('every key has a valid, non-empty "message" property', () => {
    const checkMessages = (_localeName, data) => {
      for (const [_key, val] of Object.entries(data)) {
        expect(val).toBeDefined();
        expect(typeof val.message).toBe('string');
        expect(val.message.trim().length).toBeGreaterThan(0);
      }
    };
    checkMessages('en', en);
    checkMessages('pt_BR', ptBR);
    checkMessages('es', es);
  });

  test('pt_BR contains all keys defined in en', () => {
    const missingInPt = enKeys.filter(k => !ptKeys.includes(k));
    expect(missingInPt).toEqual([]);
  });

  test('es contains all keys defined in en', () => {
    const missingInEs = enKeys.filter(k => !esKeys.includes(k));
    expect(missingInEs).toEqual([]);
  });

  test('en contains all keys defined in pt_BR (no orphan keys)', () => {
    const orphanInPt = ptKeys.filter(k => !enKeys.includes(k));
    expect(orphanInPt).toEqual([]);
  });

  test('en contains all keys defined in es (no orphan keys)', () => {
    const orphanInEs = esKeys.filter(k => !enKeys.includes(k));
    expect(orphanInEs).toEqual([]);
  });

  test('all locales have the exact same total count of keys', () => {
    expect(ptKeys.length).toBe(enKeys.length);
    expect(esKeys.length).toBe(enKeys.length);
  });
});
