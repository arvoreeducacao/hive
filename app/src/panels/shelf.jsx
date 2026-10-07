import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, Icon, Loading } from "./window.jsx";

function Filters(props) {
  return (
    <For each={props.model.chips}>{(chip) => (
      <button class="sh-f" aria-pressed={chip.on ? "true" : "false"} onClick={() => props.actions.pick(chip.key)}>
        {chip.say}<b>{chip.n}</b>
      </button>
    )}</For>
  );
}

export const LIVE_AFTER_MS = 300;

function Card(props) {
  const [live, setLive] = createSignal(false);
  let waking = 0;
  const arm = () => {
    clearTimeout(waking);
    waking = setTimeout(() => setLive(true), LIVE_AFTER_MS);
  };
  const disarm = () => {
    clearTimeout(waking);
    setLive(false);
  };
  createEffect(() => {
    if (!props.shown) disarm();
  });
  onCleanup(() => clearTimeout(waking));
  const ready = (event) => {
    event.currentTarget.dataset.ready = "yes";
    props.actions.fit?.();
  };
  return (
    <button class="sh-card" data-shut={props.card.shut} title={props.card.hint}
      onClick={() => props.actions.open(props.card.slug, props.card.tab)}
      onPointerEnter={arm} onPointerLeave={disarm} onFocus={arm} onBlur={disarm}>
      <div class="sh-th">
        <Show when={props.card.thumb}>
          <Show when={props.card.thumb.img}>
            <img class="sh-img" src={props.card.thumb.img} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </Show>
          <Show when={live() && props.shown}>
            <iframe sandbox="allow-scripts" tabindex="-1" aria-hidden="true" src={props.card.thumb.src}
              ref={() => props.actions.fit?.()} onLoad={ready} />
          </Show>
          <span class="sh-v">{props.card.thumb.say}</span>
        </Show>
      </div>
      <div class="sh-in">
        <div class="sh-head"><b>{props.card.title}</b><span class="sh-who">{props.card.owner}</span></div>
        <span class="sh-sub">{props.card.sub}</span>
        <div class="sh-row">
          <For each={props.card.chips}>{(chip) => <span class="sh-lab" data-state={chip.state} title={chip.label || undefined}>{chip.say}</span>}</For>
        </div>
      </div>
    </button>
  );
}

function Gallery(props) {
  return (
    <Show when={!props.model.blank} fallback={
      <Show when={props.model.blank.html} fallback={<p class="sh-blank">{props.model.blank.say}</p>}>
        <p class="sh-blank" innerHTML={props.model.blank.html} />
      </Show>
    }>
      <For each={props.model.bands}>{(band) => (
        <>
          <button class="sh-band" aria-expanded={band.open ? "true" : "false"} onClick={() => props.actions.fold(band.key)}>
            <i>{band.caret}</i><span>{band.say}</span><b>{band.count}</b>
          </button>
          <For each={band.cards}>{(card) => <Card card={card} shown={props.model.shown} actions={props.actions} />}</For>
        </>
      )}</For>
    </Show>
  );
}

function ShFilters(props) {
  return (
    <select aria-label={props.model.label} onChange={(ev) => props.actions.pick(ev.currentTarget.value)}>
      <For each={props.model.chips}>{(chip) => <option value={chip.key} selected={chip.on}>{chip.say} · {chip.n}</option>}</For>
    </select>
  );
}

function ShRow(props) {
  const r = () => props.row;
  return (
    <button type="button" class="pw-row sh-row" role="option" aria-selected={r().here ? "true" : "false"} data-slug={r().slug} data-shut={r().shut}
      title={r().hint} onClick={() => props.actions.pick(r().slug)} onDblClick={() => props.actions.open(r().slug, r().tab)}>
      <Icon id={r().icon} />
      <span class="pw-txt"><span class="pw-t">{r().title}</span><span class="pw-m">{r().meta}</span></span>
      <span class="pw-lab sh-lab" title={r().label || undefined}>{r().say}</span>
    </button>
  );
}

function ShGallery(props) {
  return (
    <Show when={!props.model.loading} fallback={<Loading say={props.model.loading} />}>
      <Show when={!props.model.blank} fallback={
        <Show when={props.model.blank.html} fallback={<p class="sh-blank">{props.model.blank.say}</p>}>
          <p class="sh-blank" innerHTML={props.model.blank.html} />
        </Show>
      }>
        <For each={props.model.bands}>{(band) => (
          <>
            <button type="button" class="pw-sec sh-band" aria-expanded={band.open ? "true" : "false"} onClick={() => props.actions.fold(band.key)}>
              <Icon id="i-chev" /><span>{band.say}</span><span class="n">{band.count}</span>
            </button>
            <For each={band.rows}>{(row) => <ShRow row={row} actions={props.actions} />}</For>
          </>
        )}</For>
      </Show>
    </Show>
  );
}

function Shot(props) {
  const [live, setLive] = createSignal(false);
  let waking = 0;
  createEffect(() => {
    const src = props.shot.src;
    clearTimeout(waking);
    setLive(false);
    if (src) waking = setTimeout(() => setLive(true), LIVE_AFTER_MS);
  });
  onCleanup(() => clearTimeout(waking));
  const ready = (event) => {
    event.currentTarget.dataset.ready = "yes";
    props.actions.fit?.();
  };
  return (
    <div class="sh-shot">
      <Show when={props.shot.img}><img class="sh-img" src={props.shot.img} alt="" aria-hidden="true" decoding="async" /></Show>
      <Show when={live() && props.shot.src}>
        <iframe sandbox="allow-scripts" tabindex="-1" aria-hidden="true" src={props.shot.src} ref={() => props.actions.fit?.()} onLoad={ready} />
      </Show>
      <span class="rc-badge mono sh-ver-say">{props.shot.say}</span>
    </div>
  );
}

function Preview(props) {
  const p = () => props.model.page;
  return (
    <Show when={p()} fallback={<Show when={props.model.empty}><Empty empty={props.model.empty} actions={props.actions} /></Show>}>
      <Show when={p().shot}><Shot shot={p().shot} actions={props.actions} /></Show>
      <h2 class="pw-h1">{p().title}</h2>
      <div class="pw-strip"><For each={p().strip}>{(bit) => <span>{bit}</span>}</For></div>
      <Show when={p().description}><p class="sh-desc">{p().description}</p></Show>
      <div class="sh-tabline">
        <div class="pw-tabs" role="tablist">
          <For each={p().tabs}>{(tab) => (
            <button type="button" class="pw-tab" role="tab" aria-selected={tab.on ? "true" : "false"} onClick={() => props.actions.tab(tab.key)}>{tab.say}<span class="n">{tab.ver}</span></button>
          )}</For>
        </div>
      </div>
      <dl class="pw-kv">
        <dt>{p().labelSay}</dt>
        <dd class="sh-trail">
          <For each={p().trail}>{(step, at) => (
            <><Show when={at()}><span class="sh-arrow" aria-hidden="true">→</span></Show><span class="pw-lab" classList={{ cur: step.on, off: !step.on }}>{step.say}</span></>
          )}</For>
          <Show when={p().loose}><span class="pw-lab cur" title={p().loose}>{p().loose}</span></Show>
        </dd>
        <Show when={p().link}>
          <dt>{p().linkSay}</dt>
          <dd><a class="pw-mono sh-link" href={p().link} target="_blank" rel="noreferrer">{p().linkShort}</a>
            <button type="button" class="pw-copy" aria-label={p().copySay} title={p().copySay} onClick={(ev) => props.actions.copy(ev.currentTarget, p().link)}><Icon id="i-copy" /></button></dd>
        </Show>
        <dt>{p().fileSay}</dt>
        <dd><span class="pw-mono">{p().file}</span></dd>
      </dl>
    </Show>
  );
}

function FiltersPanel(props) {
  return <Show when={props.model.raycast} fallback={<Filters model={props.model} actions={props.actions} />}><ShFilters model={props.model} actions={props.actions} /></Show>;
}

function GalleryPanel(props) {
  return <Show when={props.model.raycast} fallback={<Gallery model={props.model} actions={props.actions} />}><ShGallery model={props.model} actions={props.actions} /></Show>;
}

export function mountShelfFilters(host, extras) {
  return mountView(host, FiltersPanel, { chips: [] }, extras);
}

export function mountShelfGallery(host, extras) {
  return mountView(host, GalleryPanel, { blank: null, bands: [], shown: false }, extras);
}

export function mountShelfPreview(host, extras) {
  return mountView(host, Preview, { page: null, empty: null }, extras);
}
