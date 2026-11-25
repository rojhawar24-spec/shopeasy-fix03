import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const server = read('../src/server.js');
const database = read('../src/db.js');
const home = read('../views/home.ejs');
const branding = read('../views/admin/branding.ejs');
const adminSettings = read('../views/admin/settings.ejs');
const header = read('../views/partials/header.ejs');
const dashboard = read('../views/admin/dashboard.ejs');

test('only Manager has access to the role-protected storefront branding editor', () => {
  assert.match(server, /app\.get\('\/admin\/branding',requireManager/);
  assert.match(server, /app\.post\('\/admin\/branding',requireManager/);
  assert.match(server, /storefront_branding_updated/);
  assert.match(branding, /action="\/admin\/branding"/);
  assert.match(branding, /name="_csrf"/);
  assert.match(dashboard, /include\('\.\.\/partials\/admin-nav'\)/);
  const managerNav = read('../views/partials/admin-nav.ejs');
  assert.match(managerNav, /href="\/admin\/branding"/);
  assert.match(managerNav, /if\(user\?\.role===['"]manager['"]\)/);
});

test('brand copy is editable per locale and rendered from persisted settings, not hard-coded slogans', () => {
  for (const locale of ['en', 'ckb', 'ar', 'nl']) {
    for (const field of ['Eyebrow', 'Title', 'Accent', 'Description']) {
      assert.ok(branding.includes(`name="hero${field}_<%= language.code %>"`), `Missing ${field} field for ${locale}`);
    }
  }
  assert.match(server, /getSetting\(`hero_\$\{field\}_\$\{code\}`/);
  assert.match(home, /<%= heroEyebrow %>/);
  assert.match(home, /<%= heroTitle %>/);
  assert.match(home, /<%= heroAccent %>/);
  assert.match(home, /<%= heroDescription %>/);
  assert.doesNotMatch(home, /SMART SHOPPING · LESS FRICTION|Find the good stuff\.|Skip the noise\./);
});

test('brand copy defaults exist in English, Sorani, Arabic and Dutch', () => {
  const source = server.slice(server.indexOf('const BRANDING_DEFAULTS'), server.indexOf('async function loadBrandingFormData'));
  assert.match(source, /en: Object\.freeze/);
  assert.match(source, /ckb: Object\.freeze/);
  assert.match(source, /ar: Object\.freeze/);
  assert.match(source, /nl: Object\.freeze/);
  assert.match(source, /شتێک بدۆزەرەوە/);
  assert.match(source, /منتجات مميزة، واختيار أسهل/);
  assert.match(source, /MOOIE VONDSTEN, EENVOUDIG GEVONDEN/);
});

test('storefront copy writes are transactional and inputs are length-limited server-side', () => {
  assert.match(database, /export async function setSettings\(entries\)/);
  assert.match(database, /db\.transaction\('write'\)/);
  assert.match(database, /await tx\.commit\(\)/);
  assert.match(database, /await tx\.rollback\(\)/);
  assert.match(server, /const limits=\{eyebrow:80,title:90,accent:90,description:500\}/);
  assert.match(server, /raw\.length>limits\[field\]/);
});

test('legal and integration settings are Manager-only and store name is managed in one clear place', () => {
  assert.match(server, /app\.get\('\/admin\/settings',requireManager/);
  assert.match(server, /app\.post\('\/admin\/settings',requireManager/);
  assert.match(adminSettings, /href="\/admin\/branding"/);
  assert.doesNotMatch(adminSettings, /name="storeName"/);
  assert.match(adminSettings, /Enabled interface languages/);
  assert.match(adminSettings, /uiEnabledLocales\|\|\[\]\)\.map\(code=/);
  assert.match(read('../src/store-config.js'), /SUPPORTED_UI_LOCALES = Object\.freeze\(\['en', 'ckb', 'ar', 'nl', 'fr'\]\)/);
  assert.doesNotMatch(adminSettings, /Dutch is not yet available in this build/);
  assert.match(adminSettings, /locale.code==='nl'\?'Nl'/);
  assert.match(server, /privacyPolicyNl/);
});

test('SEO header has per-page descriptions, robots policy, social cards and configured HTTPS canonical URLs', () => {
  assert.match(server, /configuredBase\.protocol==='https:'/);
  assert.match(header, /name="description"/);
  assert.match(header, /locale === 'ckb'[\s\S]*locale === 'ar'/);
  assert.match(header, /الرئيسية/);
  assert.match(header, /سەرەکی/);
  assert.match(header, /name="robots"/);
  assert.match(header, /property="og:title"/);
  assert.match(header, /property="og:description"/);
  assert.match(header, /name="twitter:card"/);
  assert.match(header, /rel="canonical"/);
  assert.match(header, /noindex, nofollow/);
});
