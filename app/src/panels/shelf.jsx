import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, FootParts, Icon, Loading } from "./window.jsx";

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

export const SHELF_THUMB_W = 1280;

function LivePage(props) {
  const [scale, setScale] = createSignal(0);
  let frame = null;
  let asked = 0;
  const fit = () => {
    cancelAnimationFrame(asked);
    asked = requestAnimationFrame(() => {
      const wide = frame?.parentElement?.clientWidth || 0;
      if (wide) setScale(wide / SHELF_THUMB_W);
    });
  };
  createEffect(on(() => props.fit, fit));
  window.addEventListener("resize", fit);
  onCleanup(() => {
    cancelAnimationFrame(asked);
    window.removeEventListener("resize", fit);
  });
  const ready = (event) => {
    event.currentTarget.dataset.ready = "yes";
    fit();
  };
  return (
    <iframe sandbox="allow-scripts" tabindex="-1" aria-hidden="true" src={props.src}
      style={{ transform: scale() ? `scale(${scale()})` : undefined }}
      ref={(el) => { frame = el; fit(); }} onLoad={ready} />
  );
}

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
  return (
    <button class="sh-card" data-shut={props.card.shut} title={props.card.hint}
      onClick={() => props.actions.open(props.card.slug, props.card.tab)}
      onPointerEnter={arm} onPointerLeave={disarm} onFocus={arm} onBlur={disarm}>
      <div class="sh-th">
        <Show when={props.card.thumb}>
          <Show when={props.card.thumb.img}>
            <img class="sh-img" src={props.card.thumb.img} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </Show>
          <Show when={live() && props.shown && props.card.thumb.src}>
            <LivePage src={props.card.thumb.src} fit={props.fit} />
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
          <For each={band.cards}>{(card) => <Card card={card} shown={props.model.shown} fit={props.fit} actions={props.actions} />}</For>
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
  return (
    <div class="sh-shot">
      <Show when={props.shot.img}><img class="sh-img" src={props.shot.img} alt="" aria-hidden="true" decoding="async" /></Show>
      <Show when={live() && props.shot.src}>
        <LivePage src={props.shot.src} fit={props.fit} />
      </Show>
      <span class="rc-badge mono sh-ver-say">{props.shot.say}</span>
    </div>
  );
}

function Preview(props) {
  const p = () => props.model.page;
  return (
    <Show when={p()} fallback={<Show when={props.model.empty}><Empty empty={props.model.empty} actions={props.actions} /></Show>}>
      <Show when={p().shot}><Shot shot={p().shot} fit={props.fit} actions={props.actions} /></Show>
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


export function PageChrome(props) {
  const pick = (go) => (ev) => { ev.stopPropagation(); go(); };
  return (
    <>
      <For each={props.model.tabs}>{(tab) => (
        <button class="sh-tab" aria-selected={tab.on ? "true" : "false"} on:click={pick(() => props.actions.tab(tab.name))}>{tab.name}<i>{tab.say}</i></button>
      )}</For>
      <div class="sh-vers">
        <For each={props.model.proposals}>{(one) => (
          <button class="sh-ver" aria-pressed={one.on ? "true" : "false"} title={one.hint} on:click={pick(() => props.actions.version(one.n))}>{one.say}</button>
        )}</For>
        <For each={props.model.versions}>{(one) => (
          <button class="sh-ver" aria-pressed={one.on ? "true" : "false"} title={one.hint} on:click={pick(() => props.actions.version(one.n))}>{one.say}</button>
        )}</For>
      </div>
    </>
  );
}

function Comment(props) {
  const c = () => props.comment;
  return (
    <article class="sh-c" data-id={c().id} data-done={c().done ? "yes" : "no"} data-reply={c().reply ? "yes" : undefined} data-hot={c().hot ? "yes" : undefined}>
      <div class="sh-ch">
        <Show when={c().n}><button type="button" class="sh-cn" title={c().goSay} onClick={() => props.actions.goto(c().id)}>{String(c().n)}</button></Show>
        <b>{c().who}</b><span>{c().when}</span>
      </div>
      <p>{c().text}</p>
      <div class="sh-ca">
        <Show when={!c().reply}>
          <button type="button" onClick={() => props.actions.reply(c().id)}>{c().replySay}</button>
          <button type="button" onClick={() => props.actions.settle(c().id, !c().done)}>{c().settleSay}</button>
        </Show>
        <Show when={c().by}><span class="sh-cby">{c().by}</span></Show>
      </div>
    </article>
  );
}

function Talk(props) {
  const t = () => props.talk;
  let box = null;
  createEffect(on(() => t().cleared, () => { if (box) box.value = ""; }, { defer: true }));
  const sendKeys = (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); props.actions.send(); }
  };
  return (
    <>
      <div class="sh-th"><b>{t().title}</b><span class="sh-tn">{t().count}</span><span class="grow" />
        <button type="button" class="btn sh-tpin" aria-pressed={t().pinning ? "true" : "false"} onClick={() => props.actions.pinning(!t().pinning)}>{t().pinSay}</button>
        <button type="button" class="btn sh-tagain" onClick={() => props.actions.again()}>{t().againSay}</button></div>
      <p class="sh-thint" hidden={!t().pinning}>{t().hint}</p>
      <div class="sh-tlist">
        <Show when={t().items.length} fallback={<p class="sh-tblank">{t().blank}</p>}>
          <For each={t().items}>{(comment) => <Comment comment={comment} actions={props.actions} />}</For>
        </Show>
      </div>
      <form class="sh-tform" onSubmit={(ev) => { ev.preventDefault(); props.actions.send(); }}>
        <div class="sh-tctx" hidden={!t().ctx}><span>{t().ctx}</span><button type="button" class="sh-tdrop" onClick={() => props.actions.drop()}>{t().dropSay}</button></div>
        <textarea rows="3" placeholder={t().placeholder} ref={(el) => { box = el; }} on:keydown={sendKeys} />
        <div class="sh-tsend"><span class="sh-tnote" hidden={!t().note}>{t().note}</span><button type="submit" class="btn" disabled={t().busy}>{t().sendSay}</button></div>
      </form>
    </>
  );
}

function View(props) {
  const v = () => props.view;
  return (
    <div class="sh-view" id="sh-view" data-no-t hidden={!v().shown}>
      <div class="sh-vh">
        <button class="sh-back" id="sh-back" aria-label="back to the shelf" onClick={() => props.actions.back()}>{"←"}</button>
        <b id="sh-vtitle">{v().title}</b>
        <span class="sh-lab" id="sh-vlab" data-state={v().lab.state} title={v().lab.title}>{v().lab.say}</span>
        <span class="sh-vwho" id="sh-vwho">{v().who}</span>
        <span class="sh-vacts">
          <button class="btn" id="sh-talk" aria-pressed={v().talk.open ? "true" : "false"} onClick={() => props.actions.talk()}>{v().talk.buttonSay}</button>
          <button class="btn" id="sh-seat" onClick={() => props.actions.seat()}>open in a seat</button>
          <button class="btn" id="sh-copy" onClick={() => props.actions.copy()}>copy link</button>
          <button class="btn" id="sh-gh" hidden={!v().github} style={{ display: v().github ? "" : "none" }} onClick={() => props.actions.github()}>see on GitHub</button>
          <button class="btn sh-ico" id="sh-wide" aria-pressed={v().wide ? "true" : "false"} title="full screen" aria-label="full screen" onClick={() => props.actions.wide()}><Icon id="i-expand" /></button>
        </span>
      </div>
      <div class="sh-tabs" id="sh-tabs"><PageChrome model={v().chrome} actions={props.actions.chrome} /></div>
      <div class="sh-main">
        <div class="sh-stage">
          <iframe id="sh-frame" sandbox="allow-scripts allow-popups" title="the page this team published" src={v().frame.src} data-here={v().frame.here}
            style={{ display: v().frame.away ? "none" : "" }} onLoad={() => props.actions.loaded()} />
          <Show when={v().web.made}>
            <webview class="sh-web" partition="persist:seat-browser" title={v().web.title} data-here={v().web.url} src={v().web.url} style={{ display: v().web.on ? "" : "none" }} />
          </Show>
          <button class="sh-exit" id="sh-narrow" hidden={!v().wide} onClick={() => props.actions.narrow()}>leave <kbd>esc</kbd></button>
        </div>
        <aside class="sh-side" id="sh-side" data-no-t hidden={!v().talk.open} aria-label="comments on this page"><Talk talk={v().talk} actions={props.actions.comments} /></aside>
      </div>
      <div class="sh-vf" id="sh-vf">{v().file}</div>
    </div>
  );
}

function ClassicShelf(props) {
  const m = () => props.model;
  return (
    <>
      <div class="sh-top">
        <h2>{m().words.shelf}</h2>
        <span class="sh-count" id="sh-count" data-no-t>{m().count}</span>
        <input id="sh-search" class="sh-search" spellcheck="false" autocomplete="off" placeholder={m().words.search} value={m().query}
          onInput={(ev) => props.actions.search(ev.currentTarget.value)} />
        <div class="sh-filters" id="sh-filters" data-no-t><Filters model={m().filters} actions={props.actions.filters} /></div>
      </div>
      <div class="sh-gal" id="sh-gal" data-no-t>
        <Show when={m().open}><Gallery model={m().gallery} fit={m().fit} actions={props.actions.gallery} /></Show>
      </div>
      <View view={m().view} actions={props.actions.view} />
    </>
  );
}

function WindowShelf(props) {
  const m = () => props.model;
  return (
    <>
      <header class="pw-head" data-no-t>
        <span class="pw-ico"><Icon id="i-book" /></span>
        <h2 class="pw-title">{m().words.shelf}</h2>
        <span id="sh-count" class="pw-count" data-no-t>{m().count}</span>
        <span class="pw-vsep" />
        <label class="pw-search"><Icon id="i-mag" /><input id="sh-search" class="sh-search" spellcheck="false" autocomplete="off" placeholder={m().words.find} aria-label={m().words.find}
          value={m().query} onInput={(ev) => props.actions.search(ev.currentTarget.value)} /></label>
        <div id="sh-filters" class="pw-drop" data-no-t><ShFilters model={m().filters} actions={props.actions.filters} /></div>
        <span class="pw-vsep" />
        <button type="button" class="pw-esc" id="sh-close" aria-label={m().words.close} title={m().words.close} onClick={() => props.actions.close()}>esc</button>
      </header>
      <div class="pw-body">
        <div id="sh-gal" class="pw-list" role="listbox" aria-label={m().words.list} data-no-t>
          <Show when={m().open}><ShGallery model={m().gallery} actions={props.actions.gallery} /></Show>
        </div>
        <div class="pw-detail sh-prev" id="sh-prev" data-no-t>
          <Show when={m().open}><Preview model={m().preview} fit={m().fit} actions={props.actions.preview} /></Show>
        </div>
        <View view={m().view} actions={props.actions.view} />
      </div>
      <footer class="pw-foot" id="sh-foot" data-no-t><FootParts model={m().foot} actions={props.actions.foot} /></footer>
    </>
  );
}

function ShelfScreen(props) {
  const m = () => props.model;
  return (
    <section id="shelf" hidden={!m().open} aria-label={m().words.label} classList={{ pw: m().raycast }} data-on={m().on} data-wide={m().wide}>
      <Show when={m().raycast} fallback={<ClassicShelf model={m()} actions={props.actions} />}>
        <WindowShelf model={m()} actions={props.actions} />
      </Show>
    </section>
  );
}

export const shelfViewClosed = () => ({
  shown: false, title: "", lab: { state: undefined, say: "", title: undefined }, who: "",
  chrome: { tabs: [], proposals: [], versions: [] },
  frame: { src: undefined, here: undefined, away: false },
  web: { made: false, url: "", on: false, title: "" },
  wide: false, github: true, file: "",
  talk: { open: false, buttonSay: "comments", title: "", count: "", pinning: false, pinSay: "", againSay: "", hint: "", items: [], blank: "", ctx: "", dropSay: "", placeholder: "", note: "", sendSay: "", busy: false, cleared: 0 }
});

export function mountShelf(host, extras) {
  return mountView(host, ShelfScreen, {
    open: false, raycast: false, on: "gallery", wide: "no", count: "", query: "", fit: 0,
    words: { shelf: "", search: "", find: "", close: "", list: "", label: "" },
    filters: { chips: [] }, gallery: { blank: null, bands: [], shown: false },
    preview: { page: null, empty: null }, foot: { icon: "i-book", title: "", trail: [], acts: [] },
    view: shelfViewClosed()
  }, extras);
}

export function mountPageChrome(host, extras) {
  return mountView(host, PageChrome, { tabs: [], proposals: [], versions: [] }, extras);
}
