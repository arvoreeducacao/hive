import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { cleanExperience, cleanPatch, EXPERIENCE_CHOICES, EXPERIENCE_DEFAULT } from '../lib/config.mjs';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('raycast is the only experience, and the retired current and experimental open in it', () => {
  const problems = [];
  assert.deepEqual(EXPERIENCE_CHOICES, ['raycast']);
  assert.equal(EXPERIENCE_DEFAULT, 'raycast');
  for (const said of ['raycast', undefined, 'current', 'experimental']) assert.equal(cleanExperience(said, 'file', problems), 'raycast');
  assert.equal(problems.length, 0);
  assert.equal(cleanExperience('Raycast', 'file', problems), 'raycast');
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ experience: 'raycast' }), { clean: { experience: 'raycast' }, problems: [] });
  assert.deepEqual(cleanPatch({ experience: 'experimental' }), { clean: { experience: 'raycast' }, problems: [] });
});

function bootScript() {
  const start = html.indexOf('<body>');
  return html.slice(html.indexOf('<script>', start) + 8, html.indexOf('</script>', start));
}

test('the boot wears raycast before the first paint, whatever this machine remembers', () => {
  for (const [stored, url] of [[null, 'http://hive/'], ['experimental', 'http://hive/'], ['experimental', 'http://hive/?experience=raycast']]) {
    const win = new Window({ url });
    if (stored) win.localStorage.setItem('hive.experience', stored);
    win.eval(bootScript());
    assert.equal(win.document.body.classList.contains('experience-raycast'), true, `${stored} ${url}`);
  }
});

test('settings have no Experiments pane and no way to turn the New Hive on', () => {
  assert.doesNotMatch(html, /data-pane="experimental"|experience-toggle|Try new Hive|New Hive/);
});
