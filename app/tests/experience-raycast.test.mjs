import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createExperienceController, EXPERIENCE_BOOT_KEY } from '../src/app/experience-controller.js';
import { cleanExperience, cleanPatch, EXPERIENCE_CHOICES, EXPERIENCE_DEFAULT } from '../lib/config.mjs';
import { PT_BR } from '../assets/i18n.mjs';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const pane = html.slice(html.indexOf('<section class="pref-pane" data-pane="experimental"'), html.indexOf('</section>', html.indexOf('<section class="pref-pane" data-pane="experimental"')));

function setup({ url = 'http://hive/', save = async patch => ({ config: patch }), boot = '' } = {}) {
  const win = new Window({ url });
  if (boot) win.localStorage.setItem(EXPERIENCE_BOOT_KEY, boot);
  win.document.body.innerHTML = `${pane}<textarea>draft</textarea>`;
  const events = [];
  win.document.addEventListener('hive:experience', event => events.push(event.detail));
  const controller = createExperienceController({ document: win.document, location: win.location, history: win.history, save, storage: win.localStorage });
  const classes = () => ['experience-next', 'experience-raycast'].filter(name => win.document.body.classList.contains(name));
  const text = id => win.document.getElementById(id).textContent;
  return { win, controller, classes, text, events };
}

test('raycast is the base of the experience preference, and the old current Hive opens in it', () => {
  const problems = [];
  assert.deepEqual(EXPERIENCE_CHOICES, ['raycast', 'experimental']);
  assert.equal(EXPERIENCE_DEFAULT, 'raycast');
  assert.equal(cleanExperience('raycast', 'file', problems), 'raycast');
  assert.equal(cleanExperience(undefined, 'file', problems), 'raycast');
  assert.equal(cleanExperience('current', 'file', problems), 'raycast');
  assert.equal(problems.length, 0);
  assert.equal(cleanExperience('Raycast', 'file', problems), 'raycast');
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ experience: 'raycast' }), { clean: { experience: 'raycast' }, problems: [] });
  assert.deepEqual(cleanPatch({ experience: 'current' }), { clean: { experience: 'raycast' }, problems: [] });
});

test('a config without experience wears raycast, remembers it for the boot and announces nothing', () => {
  const { win, controller, classes, text, events } = setup();
  controller.adopt({ config: {} });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'raycast');
  assert.deepEqual(events, []);
  assert.equal(text('experience-state'), 'New Hive is off.');
  assert.equal(text('experience-toggle'), 'Try new Hive');
});

test('a config that still says current opens in raycast', () => {
  const { controller, classes, text } = setup();
  controller.adopt({ config: { experience: 'current' } });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(text('experience-state'), 'New Hive is off.');
});

test('New Hive is the only experiment: trying it leaves raycast, and leaving it comes back to raycast', async () => {
  let stored = {};
  const { win, controller, classes, text, events } = setup({ save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: { experience: 'raycast' } });
  await controller.toggle();
  assert.deepEqual(stored, { experience: 'experimental' });
  assert.deepEqual(classes(), ['experience-next']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'experimental');
  assert.deepEqual(events.at(-1), { experience: 'experimental', was: 'raycast' });
  assert.equal(text('experience-toggle'), 'Leave New Hive');
  await controller.toggle();
  assert.deepEqual(stored, { experience: 'raycast' });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'raycast');
  assert.deepEqual(events.at(-1), { experience: 'raycast', was: 'experimental' });
  assert.equal(text('experience-toggle'), 'Try new Hive');
});

test('the recovery address turns New Hive off and keeps raycast, and the old address still works', () => {
  for (const url of ['http://hive/?experience=raycast', 'http://hive/?experience=current']) {
    const { controller, classes, text } = setup({ url });
    controller.adopt({ config: { experience: 'experimental' } });
    assert.deepEqual(classes(), ['experience-raycast'], url);
    assert.equal(text('experience-state'), 'Recovery mode: New Hive is off in this window.');
    assert.equal(text('experience-toggle'), 'Leave New Hive');
  }
});

test('leaving New Hive from recovery writes raycast and drops the recovery address', async () => {
  let stored = { experience: 'experimental' };
  const { controller, classes, win } = setup({ url: 'http://hive/?experience=raycast', save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: stored });
  await controller.toggle();
  assert.deepEqual(stored, { experience: 'raycast' });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(new URL(win.location.href).searchParams.has('experience'), false);
});

test('a failed save to New Hive changes nothing', async () => {
  const { controller, classes, win, text } = setup({ save: async () => ({ refused: 'invalid' }) });
  controller.adopt({ config: {} });
  await controller.toggle();
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'raycast');
  assert.match(text('experience-state'), /could not be saved/);
});

test('the class the boot put on stays until the config answers, and leaves only for New Hive', () => {
  const { win, controller, classes, events } = setup({ boot: 'raycast' });
  win.document.body.classList.add('experience-raycast');
  const again = createExperienceController({ document: win.document, location: win.location, history: win.history, save: async patch => ({ config: patch }), storage: win.localStorage });
  assert.deepEqual(classes(), ['experience-raycast']);
  again.adopt({ config: { experience: 'experimental' } });
  assert.deepEqual(classes(), ['experience-next']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'experimental');
  assert.deepEqual(events.at(-1), { experience: 'experimental', was: 'raycast' });
  controller.paint();
});

function bootScript() {
  const start = html.indexOf('<body>');
  const script = html.slice(html.indexOf('<script>', start) + 8, html.indexOf('</script>', start));
  return script;
}

test('the boot wears raycast before the first paint unless this machine is on New Hive outside recovery', () => {
  for (const [stored, url, on] of [[null, 'http://hive/', true], ['raycast', 'http://hive/', true], ['experimental', 'http://hive/', false], ['experimental', 'http://hive/?experience=raycast', true], ['experimental', 'http://hive/?experience=current', true]]) {
    const win = new Window({ url });
    if (stored) win.localStorage.setItem(EXPERIENCE_BOOT_KEY, stored);
    win.eval(bootScript());
    assert.equal(win.document.body.classList.contains('experience-raycast'), on, `${stored} ${url}`);
  }
});

test('the Experiments settings carry only New Hive, with no way back to the old Hive, in both languages', () => {
  assert.match(pane, /id="experience-toggle"/);
  assert.doesNotMatch(pane, /raycast-toggle|raycast-state|Hive in Raycast|current Hive|experience=current/);
  assert.match(pane, /href="\?experience=raycast"/);
  for (const text of ['Leave New Hive', 'New Hive is off.', 'Recovery mode: New Hive is off in this window.', 'Open Hive without New Hive', 'New Hive is off in this window. The preference could not be saved; recovery mode remains on. Try again.']) assert.ok(PT_BR[text], text);
});
