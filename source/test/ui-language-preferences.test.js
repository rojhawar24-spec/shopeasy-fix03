import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORTED_UI_LOCALES,
  normalizeEnabledUiLocales,
  getUiLanguagePreferences
} from '../src/store-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('enabled UI locales are parsed, validated, deduplicated and never become empty', () => {
  assert.deepEqual(normalizeEnabledUiLocales('["en","ckb","en","unknown"]'), ['en', 'ckb']);
  assert.deepEqual(normalizeEnabledUiLocales(['ar', 'ckb', 'ar']), ['ar', 'ckb']);
  assert.deepEqual(normalizeEnabledUiLocales('[]'), [...SUPPORTED_UI_LOCALES]);
  assert.deepEqual(normalizeEnabledUiLocales('invalid'), [...SUPPORTED_UI_LOCALES]);
});

test('default UI locale must always be one of the enabled locales', () => {
  assert.deepEqual(getUiLanguagePreferences('ckb', '["en","ckb"]'), {
    defaultLocale: 'ckb', enabledLocales: ['en', 'ckb']
  });
  assert.deepEqual(getUiLanguagePreferences('ar', '["en","ckb"]'), {
    defaultLocale: 'en', enabledLocales: ['en', 'ckb']
  });
  assert.deepEqual(getUiLanguagePreferences('unsupported', '["ar"]'), {
    defaultLocale: 'ar', enabledLocales: ['ar']
  });
});

test('storefront and Manager settings use persisted language availability', () => {
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'views/admin/settings.ejs'), 'utf8');
  const header = fs.readFileSync(path.join(root, 'views/partials/header.ejs'), 'utf8');
  assert.match(server, /getSetting\('ui_default_locale'/);
  assert.match(server, /getSetting\('ui_enabled_locales'/);
  assert.match(server, /preferences\.enabledLocales\.includes\(requested\)/);
  assert.match(server, /ui_default_locale:uiDefaultLocale/);
  assert.match(server, /ui_enabled_locales:JSON\.stringify\(uiEnabledLocales\)/);
  assert.match(settings, /name="uiDefaultLocale"/);
  assert.match(settings, /name="enabledUiLocales"/);
  assert.match(settings, /uiLanguagesSubmitted/);
  assert.match(header, /availableUiLocales/);
});
