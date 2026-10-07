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

test('raycast is a third choice of the experience preference, and current stays the default', () => {
  const problems = [];
  assert.deepEqual(EXPERIENCE_CHOICES, ['current', 'experimental', 'raycast']);
  assert.equal(EXPERIENCE_DEFAULT, 'current');
  assert.equal(cleanExperience('raycast', 'file', problems), 'raycast');
  assert.equal(cleanExperience(undefined, 'file', problems), 'current');
  assert.equal(cleanExperience('Raycast', 'file', problems), 'current');
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ experience: 'raycast' }), { clean: { experience: 'raycast' }, problems: [] });
});

test('a config without experience wears nothing, writes nothing and announces nothing', () => {
  const { win, controller, classes, text, events } = setup();
  assert.deepEqual(classes(), []);
  controller.adopt({ config: {} });
  assert.deepEqual(classes(), []);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), null);
  assert.deepEqual(events, []);
  assert.equal(text('experience-state'), 'You are using the current Hive.');
  assert.equal(text('experience-toggle'), 'Try new Hive');
  assert.equal(text('raycast-state'), 'Hive in Raycast is off.');
  assert.equal(text('raycast-toggle'), 'Try Hive in Raycast');
});

test('the Raycast button wears only experience-raycast, remembers it for the boot and announces it', async () => {
  let stored = {};
  const { win, controller, classes, text, events } = setup({ save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: {} });
  win.document.getElementById('raycast-toggle').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(stored, { experience: 'raycast' });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), 'raycast');
  assert.deepEqual(events, [{ experience: 'raycast', was: 'current' }]);
  assert.equal(text('raycast-state'), 'Hive in Raycast is active · experimental');
  assert.equal(text('raycast-toggle'), 'Return to current Hive');
  assert.equal(text('experience-toggle'), 'Try new Hive');
  await controller.toggleRaycast();
  assert.deepEqual(classes(), []);
  assert.deepEqual(stored, { experience: 'current' });
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), null);
  assert.equal(text('raycast-toggle'), 'Try Hive in Raycast');
});

test('the two experiments share one key: turning one on turns the other off', async () => {
  let stored = {};
  const { controller, classes, text, events } = setup({ save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: { experience: 'raycast' } });
  await controller.toggle();
  assert.deepEqual(stored, { experience: 'experimental' });
  assert.deepEqual(classes(), ['experience-next']);
  assert.deepEqual(events.at(-1), { experience: 'experimental', was: 'raycast' });
  assert.equal(text('raycast-state'), 'Hive in Raycast is off.');
  await controller.toggleRaycast();
  assert.deepEqual(stored, { experience: 'raycast' });
  assert.deepEqual(classes(), ['experience-raycast']);
  assert.equal(text('experience-toggle'), 'Try new Hive');
});

test('the recovery address turns any experience off, raycast included', () => {
  const { controller, classes, text } = setup({ url: 'http://hive/?experience=current' });
  controller.adopt({ config: { experience: 'raycast' } });
  assert.deepEqual(classes(), []);
  assert.equal(text('raycast-state'), 'Recovery mode: using the current Hive.');
  assert.equal(text('raycast-toggle'), 'Return to current Hive');
});

test('returning from raycast in recovery writes current and drops the recovery address', async () => {
  let stored = { experience: 'raycast' };
  const { controller, classes, win } = setup({ url: 'http://hive/?experience=current', save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: stored });
  await controller.toggleRaycast();
  assert.deepEqual(stored, { experience: 'current' });
  assert.deepEqual(classes(), []);
  assert.equal(new URL(win.location.href).searchParams.has('experience'), false);
});

test('a failed save to raycast changes nothing', async () => {
  const { controller, classes, win, text } = setup({ save: async () => ({ refused: 'invalid' }) });
  controller.adopt({ config: {} });
  await controller.toggleRaycast();
  assert.deepEqual(classes(), []);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), null);
  assert.match(text('raycast-state'), /could not be saved/);
  assert.equal(text('experience-state'), 'You are using the current Hive.');
});

test('the class the boot put on stays until the config answers, and leaves if the config says current', () => {
  const { win, controller, classes, events } = setup({ boot: 'raycast' });
  win.document.body.classList.add('experience-raycast');
  const again = createExperienceController({ document: win.document, location: win.location, history: win.history, save: async patch => ({ config: patch }), storage: win.localStorage });
  assert.deepEqual(classes(), ['experience-raycast']);
  again.adopt({ config: { experience: 'current' } });
  assert.deepEqual(classes(), []);
  assert.equal(win.localStorage.getItem(EXPERIENCE_BOOT_KEY), null);
  assert.deepEqual(events.at(-1), { experience: 'current', was: 'raycast' });
  controller.paint();
});

function bootScript() {
  const start = html.indexOf('<body>');
  const script = html.slice(html.indexOf('<script>', start) + 8, html.indexOf('</script>', start));
  return script;
}

test('the boot wears raycast before the first paint only when this machine chose it and recovery is off', () => {
  for (const [stored, url, on] of [[null, 'http://hive/', false], ['raycast', 'http://hive/', true], ['raycast', 'http://hive/?experience=current', false], ['experimental', 'http://hive/', false]]) {
    const win = new Window({ url });
    if (stored) win.localStorage.setItem(EXPERIENCE_BOOT_KEY, stored);
    win.eval(bootScript());
    assert.equal(win.document.body.classList.contains('experience-raycast'), on, `${stored} ${url}`);
  }
});

test('the Experimental settings keep the button of New Hive and give Hive in Raycast one of its own, in both languages', () => {
  assert.match(pane, /id="experience-toggle"/);
  assert.match(pane, /id="raycast-toggle"/);
  assert.match(pane, /id="raycast-state" role="status"/);
  assert.ok(pane.indexOf('id="experience-toggle"') < pane.indexOf('id="raycast-toggle"'));
  for (const text of ['Hive in Raycast', "João's experiment: the Raycast look, with keycaps, a calm palette and structures you can switch for the whole screen. Turning it on turns New Hive off.", 'Try Hive in Raycast', 'Hive in Raycast is off.', 'Hive in Raycast is active · experimental']) assert.ok(PT_BR[text], text);
});
