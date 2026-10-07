import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createExperienceController } from '../src/app/experience-controller.js';
import { cleanExperience, cleanPatch } from '../lib/config.mjs';

function setup({ url = 'http://hive/', save = async patch => ({ config: patch }) } = {}) {
  const win = new Window({ url });
  win.document.body.innerHTML = '<button id="experience-toggle"></button><p id="experience-state"></p><a id="experience-recovery"></a><textarea>draft</textarea><div class="sv-attach">attachment</div>';
  const controller = createExperienceController({ document: win.document, location: win.location, history: win.history, save });
  const active = () => win.document.body.classList.contains('experience-next');
  return { win, controller, active };
}

test('missing/unknown experience stays current and invalid patches are rejected', () => {
  const errors = [];
  assert.equal(cleanExperience(undefined, 'file', errors), 'current');
  assert.equal(cleanExperience('future', 'file', errors), 'current');
  assert.equal(errors.length, 1);
  assert.equal(cleanPatch({ experience: false }).problems.length, 1);
  assert.deepEqual(cleanPatch({ experience: 'experimental' }), { clean: { experience: 'experimental' }, problems: [] });
});

test('toggle preserves draft, attachment, focus and performance classes, and survives a reload', async () => {
  let stored = {};
  const { win, controller, active } = setup({ save: async patch => ({ config: stored = { ...stored, ...patch } }) });
  controller.adopt({ config: {} });
  const draft = win.document.querySelector('textarea');
  const attachment = win.document.querySelector('.sv-attach');
  draft.value = 'Unsent text'; draft.focus(); draft.setSelectionRange(2, 4);
  win.document.body.classList.add('lean', 'look-dimension');
  await controller.toggle();
  assert.equal(active(), true);
  assert.equal(win.document.querySelector('textarea'), draft);
  assert.equal(win.document.querySelector('.sv-attach'), attachment);
  assert.equal(draft.value, 'Unsent text');
  assert.equal(win.document.activeElement, draft);
  assert.equal(draft.selectionStart, 2);
  assert.equal(win.document.body.classList.contains('lean'), true);
  assert.equal(win.document.body.classList.contains('look-dimension'), true);
  const reopened = setup(); reopened.controller.adopt({ config: stored });
  assert.equal(reopened.active(), true);
  await controller.toggle();
  assert.equal(active(), false);
  assert.deepEqual(stored, { experience: 'current' });
});

test('failed activation never enables the experiment; retry works', async () => {
  let fail = true;
  const { win, controller, active } = setup({ save: async patch => fail ? { refused: 'invalid' } : { config: patch } });
  controller.adopt({ config: {} });
  await controller.toggle();
  assert.equal(active(), false);
  assert.match(win.document.getElementById('experience-state').textContent, /could not be saved/);
  fail = false; await controller.toggle();
  assert.equal(active(), true);
});

test('failed return restores current immediately and retains a recovery URL across reload', async () => {
  const { win, controller, active } = setup({ url: 'http://hive/?foo=bar#chat', save: async () => { throw new Error('offline'); } });
  controller.adopt({ config: { experience: 'experimental' } });
  await controller.toggle();
  assert.equal(active(), false);
  assert.equal(new URL(win.location.href).searchParams.get('experience'), 'current');
  assert.equal(new URL(win.location.href).searchParams.get('foo'), 'bar');
  assert.equal(win.location.hash, '#chat');
  const reopened = setup({ url: win.location.href });
  reopened.controller.adopt({ config: { experience: 'experimental' } });
  assert.equal(reopened.active(), false);
  await reopened.controller.toggle();
  assert.equal(new URL(reopened.win.location.href).searchParams.has('experience'), false);
  assert.equal(reopened.active(), false);
});

test('pending writes cannot be duplicated or overwritten by a stale config reload', async () => {
  let finish, calls = 0;
  const { win, controller, active } = setup({ save: patch => { calls++; return new Promise(resolve => { finish = () => resolve({ config: patch }); }); } });
  controller.adopt({ config: {} });
  const pending = controller.toggle();
  await controller.toggle();
  controller.adopt({ config: { experience: 'current' } });
  assert.equal(calls, 1);
  assert.equal(win.document.getElementById('experience-toggle').disabled, true);
  finish(); await pending;
  assert.equal(active(), true);
});

test('icons swap to the pixel set while active and come back untouched on return', async () => {
  const win = new Window({ url: 'http://hive/' });
  win.document.body.innerHTML = '<button id="experience-toggle"></button><p id="experience-state"></p><svg><defs><symbol id="i-send" viewBox="0 0 16 16"><path d="M1 1h14" stroke="currentColor"/></symbol><symbol id="i-kept" viewBox="0 0 16 16"><circle r="4"/></symbol></defs></svg>';
  let loads = 0;
  const loadIcons = async () => { loads++; return { 'i-send': '<path fill="currentColor" stroke="none" d="M0 0h2v2H0z"/>', 'i-absent': '<path/>' }; };
  const controller = createExperienceController({ document: win.document, location: win.location, history: win.history, save: async patch => ({ config: patch }), loadIcons });
  const send = win.document.getElementById('i-send');
  const before = send.innerHTML;
  controller.adopt({ config: { experience: 'experimental' } });
  await controller.icons();
  assert.equal(send.getAttribute('viewBox'), '0 0 24 24');
  assert.match(send.innerHTML, /M0 0h2v2H0z/);
  assert.equal(win.document.getElementById('i-kept').getAttribute('viewBox'), '0 0 16 16');
  await controller.toggle();
  await controller.icons();
  assert.equal(send.getAttribute('viewBox'), '0 0 16 16');
  assert.equal(send.innerHTML, before);
  await controller.toggle();
  await controller.icons();
  assert.match(send.innerHTML, /M0 0h2v2H0z/);
  assert.equal(loads, 1);
});

test('a failed icon load leaves the current icons in place', async () => {
  const win = new Window({ url: 'http://hive/' });
  win.document.body.innerHTML = '<svg><defs><symbol id="i-send" viewBox="0 0 16 16"><path d="M1 1h14"/></symbol></defs></svg>';
  const controller = createExperienceController({ document: win.document, location: win.location, history: win.history, save: async patch => ({ config: patch }), loadIcons: async () => { throw new Error('offline'); } });
  controller.adopt({ config: { experience: 'experimental' } });
  await controller.icons();
  assert.equal(win.document.body.classList.contains('experience-next'), true);
  assert.equal(win.document.getElementById('i-send').getAttribute('viewBox'), '0 0 16 16');
});

test('every pixel icon is a filled path that ignores the sprite stroke', async () => {
  const { PIXEL_ICONS } = await import('../assets/pixel-icons.mjs');
  const ids = Object.keys(PIXEL_ICONS);
  assert.equal(ids.length, 69);
  for (const [id, body] of Object.entries(PIXEL_ICONS)) {
    assert.match(body, /^(<path fill="currentColor" stroke="none" [^>]*\/>\s?)+$/, id);
  }
});

test('the pixel x is the close cross, not the brand logo', async () => {
  const { PIXEL_ICONS } = await import('../assets/pixel-icons.mjs');
  assert.equal(PIXEL_ICONS['i-x'], PIXEL_ICONS['i-close']);
});
