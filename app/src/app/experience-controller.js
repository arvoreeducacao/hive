export const EXPERIENCES = ['current', 'experimental', 'raycast'];
export const EXPERIENCE_CLASS = { experimental: 'experience-next', raycast: 'experience-raycast' };
export const EXPERIENCE_BOOT_KEY = 'hive.experience';

const EXPERIENCE_STATE = {
  current: 'You are using the current Hive.',
  experimental: 'New Hive is active · experimental foundation',
  raycast: 'Hive in Raycast is active · experimental'
};

export function createExperienceController({ document, location, history, save, say = text => text, loadIcons = async () => ({}), storage = null }) {
  let wanted = 'current';
  let loaded = false;
  let pending = false;
  let error = '';
  let shown = document.body.classList.contains(EXPERIENCE_CLASS.raycast) ? 'raycast' : null;
  let iconsReady = Promise.resolve();
  let recovery = new URL(location.href).searchParams.get('experience') === 'current';
  const button = document.getElementById('experience-toggle');
  const status = document.getElementById('experience-state');
  const link = document.getElementById('experience-recovery');
  const raycastButton = document.getElementById('raycast-toggle');
  const raycastStatus = document.getElementById('raycast-state');
  let errorFor = '';
  const recoveryUrl = new URL(location.href);
  recoveryUrl.searchParams.set('experience', 'current');
  if (link) link.href = recoveryUrl.href;
  const originalIcons = new Map();
  let iconsLoading = null;

  function iconsFor(active) {
    if (!active) {
      for (const [id, [viewBox, body]] of originalIcons) {
        const symbol = document.getElementById(id);
        if (!symbol) continue;
        symbol.setAttribute('viewBox', viewBox);
        symbol.innerHTML = body;
      }
      originalIcons.clear();
      return iconsLoading || Promise.resolve();
    }
    iconsLoading ||= Promise.resolve().then(loadIcons).catch(() => ({}));
    return iconsLoading.then(icons => {
      if (!document.body.classList.contains('experience-next')) return;
      for (const [id, body] of Object.entries(icons || {})) {
        const symbol = document.getElementById(id);
        if (!symbol || symbol.tagName.toLowerCase() !== 'symbol' || originalIcons.has(id)) continue;
        originalIcons.set(id, [symbol.getAttribute('viewBox'), symbol.innerHTML]);
        symbol.setAttribute('viewBox', '0 0 24 24');
        symbol.innerHTML = body;
      }
    });
  }

  function recover(on) {
    recovery = on;
    const url = new URL(location.href);
    if (on) url.searchParams.set('experience', 'current');
    else url.searchParams.delete('experience');
    history.replaceState(history.state, '', url.href);
  }
  function remember() {
    if (!storage) return;
    try {
      if (wanted === 'raycast') storage.setItem(EXPERIENCE_BOOT_KEY, wanted);
      else storage.removeItem(EXPERIENCE_BOOT_KEY);
    } catch {}
  }
  function announce(active) {
    if (shown === active) return;
    const first = shown === null;
    const was = shown;
    shown = active;
    if (first && active === 'current') return;
    const View = document.defaultView;
    if (View?.CustomEvent) document.dispatchEvent(new View.CustomEvent('hive:experience', { detail: { experience: active, was: first ? 'current' : was } }));
  }
  function paint() {
    const active = loaded && !recovery ? wanted : 'current';
    if (loaded) for (const [one, name] of Object.entries(EXPERIENCE_CLASS)) document.body.classList.toggle(name, active === one);
    else document.body.classList.remove(EXPERIENCE_CLASS.experimental);
    iconsReady = iconsFor(active === 'experimental');
    if (button) {
      button.disabled = !loaded || pending;
      button.textContent = say(pending ? 'Saving…' : wanted === 'experimental' ? 'Return to current Hive' : 'Try new Hive');
    }
    if (raycastButton) {
      raycastButton.disabled = !loaded || pending;
      raycastButton.textContent = say(pending ? 'Saving…' : wanted === 'raycast' ? 'Return to current Hive' : 'Try Hive in Raycast');
    }
    const said = (mine, on) => (error && errorFor === mine ? error : !loaded ? 'Loading your preference…' : recovery ? 'Recovery mode: using the current Hive.' : on);
    if (status) status.textContent = say(said('experimental', EXPERIENCE_STATE[active]));
    if (raycastStatus) raycastStatus.textContent = say(said('raycast', active === 'raycast' ? EXPERIENCE_STATE.raycast : 'Hive in Raycast is off.'));
    if (loaded) announce(active);
  }
  function adopt(result) {
    if (pending || result?.error || !result?.config) return;
    wanted = EXPERIENCES.includes(result.config.experience) ? result.config.experience : 'current';
    loaded = true;
    remember();
    paint();
  }
  async function choose(next, from = next === 'current' ? (wanted === 'raycast' ? 'raycast' : 'experimental') : next) {
    if (!loaded || pending || !EXPERIENCES.includes(next)) return;
    if (next === wanted) {
      if (recovery && next !== 'current') { recover(false); paint(); }
      return;
    }
    error = '';
    errorFor = from;
    pending = true;
    if (next === 'current') recover(true);
    paint();
    try {
      const result = await save({ experience: next });
      if (result?.error || result?.refused || result?.config?.experience !== next) throw new Error('not saved');
      wanted = next;
      recover(false);
      remember();
    } catch {
      error = next === 'current'
        ? 'Current Hive restored in this window. The preference could not be saved; recovery mode remains on. Try again.'
        : 'The preference could not be saved. Nothing changed. Try again.';
    } finally {
      pending = false;
      paint();
    }
  }
  const toggle = () => choose(wanted === 'experimental' ? 'current' : 'experimental', 'experimental');
  const toggleRaycast = () => choose(wanted === 'raycast' ? 'current' : 'raycast', 'raycast');
  if (button) button.onclick = toggle;
  if (raycastButton) raycastButton.onclick = toggleRaycast;
  paint();
  return { adopt, toggle, toggleRaycast, choose, paint, icons: () => iconsReady, wanted: () => wanted };
}
