import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('market profile switch updates the visible launch checklist without saving', () => {
  const view = read('views/admin/settings.ejs');
  const app = read('public/js/app.js');
  assert.match(view, /data-launch-check-profile="standard"/);
  assert.match(view, /data-launch-check-profile="simplified_cod"/);
  assert.match(view, /standardLaunchChecks/);
  assert.match(view, /simplifiedLaunchChecks/);
  assert.match(app, /querySelectorAll\('\[data-launch-check-profile\]'\)/);
  assert.match(app, /checklist\.hidden = checklist\.dataset\.launchCheckProfile !== mode/);
  assert.match(app, /This is a preview only, not persisted readiness/);
  assert.match(view, /not saving settings/i);
});
