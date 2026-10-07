import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createExperienceBehaviors } from '../src/app/experience-behaviors.js';
import { EXPERIENCE_BEHAVIORS, INFO_WIDTH_DEFAULT, THREAD_WIDTH_DEFAULT, cleanExperienceOff, cleanInfoHeight, cleanInfoWidth, cleanPaneWidth, cleanPatch, cleanThreadWidth } from '../lib/config.mjs';

function setup({ experience = true, tileWidth = 1200, tileHeight = 800, sideHeight = 500, mode = '', viewWidth = 1440 } = {}) {
  const win = new Window({ url: 'http://hive/', width: viewWidth });
  const { document } = win;
  document.body.innerHTML = `<article class="tile open ${mode}"><div class="side"></div><div class="well"></div><div class="x-split" tabindex="0"></div><div class="x-split-thread" tabindex="0"></div><div class="y-split" tabindex="0"></div><div class="x-split-pane" tabindex="0"></div></article>`;
  document.body.classList.toggle('experience-next', experience);
  const tile = document.querySelector('.tile');
  Object.defineProperty(tile, 'clientWidth', { get: () => tileWidth });
  Object.defineProperty(tile, 'clientHeight', { get: () => tileHeight });
  Object.defineProperty(document.querySelector('.side'), 'scrollHeight', { get: () => sideHeight });
  const saved = [];
  const behaviors = createExperienceBehaviors({ document, save: async patch => { saved.push(patch); return { config: patch }; } });
  const handle = document.querySelector('.x-split');
  const width = () => document.body.style.getPropertyValue('--x-info-width');
  const press = (el) => (name, extra = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }));
  const key = press(handle);
  const prop = name => document.body.style.getPropertyValue(name);
  return { win, document, tile, handle, behaviors, saved, width, key, press, prop };
}

const settle = win => new Promise(resolve => win.setTimeout(resolve, 450));

test('only the known behaviors can be switched off, and the column width stays in range', () => {
  const problems = [];
  assert.deepEqual(cleanExperienceOff(undefined, 'file', problems), []);
  assert.deepEqual(cleanExperienceOff(['imageZoom', 'imageZoom'], 'file', problems), ['imageZoom']);
  assert.deepEqual(cleanExperienceOff(['everything'], 'file', problems), []);
  assert.equal(cleanInfoWidth(undefined, 'file', problems), INFO_WIDTH_DEFAULT);
  assert.equal(cleanInfoWidth(520, 'file', problems), 520);
  assert.equal(cleanInfoWidth(90, 'file', problems), INFO_WIDTH_DEFAULT);
  assert.equal(cleanInfoWidth(400.5, 'file', problems), INFO_WIDTH_DEFAULT);
  assert.equal(problems.length, 3);
  assert.deepEqual(cleanPatch({ experienceOff: EXPERIENCE_BEHAVIORS, infoWidth: 300 }), { clean: { experienceOff: EXPERIENCE_BEHAVIORS, infoWidth: 300 }, problems: [] });
  assert.equal(cleanPatch({ infoWidth: '300' }).problems.length, 1);
});

test('a behavior is on only inside the new Hive and while it is not listed as off', () => {
  const { document, behaviors } = setup();
  behaviors.adopt({ config: { experienceOff: ['imageZoom'] } });
  assert.equal(behaviors.behaviorOn('imageZoom'), false);
  assert.equal(behaviors.behaviorOn('titleClick'), true);
  assert.equal(document.body.dataset.experienceOff, 'imageZoom');
  document.body.classList.remove('experience-next');
  assert.equal(behaviors.behaviorOn('titleClick'), false);
});

test('the saved width comes back from the config, and a missing one falls back to 380px', () => {
  const { behaviors, width } = setup();
  behaviors.adopt({ config: { infoWidth: 512 } });
  assert.equal(width(), '512px');
  behaviors.adopt({ config: {} });
  assert.equal(width(), '380px');
});

test('arrows move the column, stay inside the tile, and the last width is saved once', async () => {
  const { win, behaviors, key, width, saved, handle } = setup({ tileWidth: 900 });
  behaviors.adopt({ config: { infoWidth: 400 } });
  key('ArrowRight');
  key('ArrowRight', { shiftKey: true });
  assert.equal(width(), '450px');
  key('End');
  assert.equal(width(), '540px');
  assert.equal(handle.getAttribute('aria-valuemax'), '540');
  key('Home');
  assert.equal(width(), '240px');
  await settle(win);
  assert.deepEqual(saved, [{ infoWidth: 240, splitsLearned: true }]);
});

test('double-click puts the column back at 380px', async () => {
  const { win, behaviors, handle, width, saved } = setup();
  behaviors.adopt({ config: { infoWidth: 600 } });
  handle.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(width(), '380px');
  await settle(win);
  assert.deepEqual(saved, [{ infoWidth: 380, splitsLearned: true }]);
});

test('the handle does nothing when the behavior is off or the tile is not open', async () => {
  const off = setup();
  off.behaviors.adopt({ config: { infoWidth: 400, experienceOff: ['resizeInfo'] } });
  off.key('ArrowRight');
  assert.equal(off.width(), '400px');
  const closed = setup();
  closed.behaviors.adopt({ config: { infoWidth: 400 } });
  closed.tile.classList.remove('open');
  closed.key('ArrowRight');
  assert.equal(closed.width(), '400px');
  await settle(off.win);
  assert.deepEqual([...off.saved, ...closed.saved], []);
});

test('the new Hive text font applies only while the sans preference is the default one', () => {
  const { document, behaviors } = setup();
  const defaults = { font: { sans: 'system-ui, sans-serif' } };
  behaviors.adopt({ config: { font: { sans: 'system-ui, sans-serif' } }, defaults });
  assert.equal(document.body.dataset.fontDefault, 'true');
  behaviors.adopt({ config: { font: { sans: 'Inter, sans-serif' } }, defaults });
  assert.equal(document.body.dataset.fontDefault, 'false');
  behaviors.adopt({ config: { font: { sans: 'system-ui, sans-serif' } } });
  assert.equal(document.body.dataset.fontDefault, 'false');
});

test('the sizes of the thread and of the details height are cleaned like the column width', () => {
  const problems = [];
  assert.equal(cleanThreadWidth(undefined, 'file', problems), THREAD_WIDTH_DEFAULT);
  assert.equal(cleanThreadWidth(500, 'file', problems), 500);
  assert.equal(cleanThreadWidth(10, 'file', problems), THREAD_WIDTH_DEFAULT);
  assert.equal(cleanInfoHeight(undefined, 'file', problems), null);
  assert.equal(cleanInfoHeight(null, 'file', problems), null);
  assert.equal(cleanInfoHeight(220, 'file', problems), 220);
  assert.equal(cleanInfoHeight(12.5, 'file', problems), null);
  assert.equal(problems.length, 2);
  assert.deepEqual(cleanPatch({ infoHeight: null, threadWidth: 420, splitsLearned: true }), { clean: { infoHeight: null, threadWidth: 420, splitsLearned: true }, problems: [] });
});

test('the column resizes in the current Hive too, not only in the new one', () => {
  const { behaviors, key, width } = setup({ experience: false, tileWidth: 900 });
  behaviors.adopt({ config: { infoWidth: 400 } });
  key('ArrowRight');
  assert.equal(width(), '410px');
});

test('beside a pane the column keeps room for the chat next to it and leaves the pane at least 420px', () => {
  const { behaviors, key, width, handle } = setup({ tileWidth: 1280, mode: 'arting' });
  behaviors.adopt({ config: { infoWidth: 400 } });
  key('End');
  assert.equal(width(), '492px');
  key('Home');
  assert.equal(width(), '320px');
  assert.equal(handle.getAttribute('aria-valuemin'), '320');
});

test('on a narrow window the chat goes back under the details, so beside a pane the column only spares the pane', () => {
  const { behaviors, key, width, handle } = setup({ tileWidth: 1280, mode: 'arting', viewWidth: 800 });
  behaviors.adopt({ config: { infoWidth: 400 } });
  key('End');
  assert.equal(width(), '824px');
  key('Home');
  assert.equal(width(), '320px');
  assert.equal(handle.getAttribute('aria-valuemin'), '320');
});

test('the details height starts natural, stops above the chat floor, and double-click gives the natural height back', async () => {
  const { win, document, behaviors, press, prop, saved } = setup({ tileHeight: 800, sideHeight: 900, mode: 'arting' });
  behaviors.adopt({ config: { splitsLearned: true } });
  assert.equal(document.body.classList.contains('x-info-sized'), false);
  const y = document.querySelector('.y-split');
  const key = press(y);
  key('End');
  assert.equal(prop('--x-info-height'), '604px');
  assert.equal(document.body.classList.contains('x-info-sized'), true);
  key('Home');
  assert.equal(prop('--x-info-height'), '96px');
  y.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(prop('--x-info-height'), '');
  assert.equal(document.body.classList.contains('x-info-sized'), false);
  await settle(win);
  assert.deepEqual(saved, [{ infoHeight: null }]);
});

test('the details never grow past what they hold', () => {
  const { document, behaviors, press, prop } = setup({ tileHeight: 800, sideHeight: 300, mode: 'arting' });
  behaviors.adopt({ config: {} });
  press(document.querySelector('.y-split'))('End');
  assert.equal(prop('--x-info-height'), '300px');
});

test('the slack thread widens only while the chat keeps 320px', () => {
  const { document, behaviors, press, prop } = setup({ tileWidth: 1400, mode: 'threading' });
  behaviors.adopt({ config: { infoWidth: 380 } });
  const key = press(document.querySelector('.x-split-thread'));
  key('End');
  assert.equal(prop('--x-thread-width'), '652px');
  key('Home');
  assert.equal(prop('--x-thread-width'), '300px');
});

test('the hint on the handles goes away after the first resize, and the saved flag brings it back hidden', async () => {
  const { win, document, behaviors, key, saved } = setup({ tileWidth: 900 });
  behaviors.adopt({ config: {} });
  assert.equal(document.body.classList.contains('x-splits-learned'), false);
  key('ArrowRight');
  assert.equal(document.body.classList.contains('x-splits-learned'), true);
  await settle(win);
  assert.equal(saved[0].splitsLearned, true);
  behaviors.adopt({ config: { splitsLearned: true } });
  assert.equal(document.body.classList.contains('x-splits-learned'), true);
});

test('the browser pane widens while the chat keeps 320px, and the arrows follow the side it grows from', async () => {
  const { win, document, behaviors, press, prop, saved } = setup({ tileWidth: 1400, mode: 'arting' });
  behaviors.adopt({ config: { infoWidth: 380, splitsLearned: true } });
  const pane = document.querySelector('.x-split-pane');
  const key = press(pane);
  key('End');
  assert.equal(prop('--x-pane-width'), '700px');
  key('Home');
  assert.equal(prop('--x-pane-width'), '420px');
  key('ArrowLeft');
  assert.equal(prop('--x-pane-width'), '430px');
  key('ArrowRight');
  assert.equal(prop('--x-pane-width'), '420px');
  pane.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(prop('--x-pane-width'), '');
  await settle(win);
  assert.deepEqual(saved, [{ paneWidth: null }]);
});

test('the saved pane width comes back from the config and is cleaned like the other sizes', () => {
  const { behaviors, prop } = setup({ tileWidth: 1400, mode: 'arting' });
  behaviors.adopt({ config: { paneWidth: 520 } });
  assert.equal(prop('--x-pane-width'), '520px');
  const problems = [];
  assert.equal(cleanPaneWidth(undefined, 'file', problems), null);
  assert.equal(cleanPaneWidth(null, 'file', problems), null);
  assert.equal(cleanPaneWidth(640, 'file', problems), 640);
  assert.equal(cleanPaneWidth(100, 'file', problems), null);
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ paneWidth: 600 }), { clean: { paneWidth: 600 }, problems: [] });
});

test('in a new chat there is no details column, so the pane only spares the chat its 320px', () => {
  const { document, behaviors, press, prop } = setup({ tileWidth: 1200, mode: 'arting draft' });
  behaviors.adopt({ config: { infoWidth: 380 } });
  const key = press(document.querySelector('.x-split-pane'));
  key('End');
  assert.equal(prop('--x-pane-width'), '880px');
  key('Home');
  assert.equal(prop('--x-pane-width'), '420px');
});
