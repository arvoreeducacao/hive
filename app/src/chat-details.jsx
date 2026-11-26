import { For, Show, createRoot, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { lucide } from "./app/lucide.js";
import { Raw } from "./raw.jsx";
import { mountView } from "./view.jsx";

const Icon = (props) => <Raw html={lucide(props.name, props.class)} />;

function Row(props) {
  const body = () => (
    <>
      <Icon name={props.icon} class="cd-i" />
      <span class="cd-label">{props.label}</span>
      {props.children}
    </>
  );
  return (
    <Show when={props.act} fallback={<div class="cd-row cd-still" title={props.title || undefined}>{body()}</div>}>
      <button type="button" class="cd-row" data-act={props.act} data-url={props.url} title={props.title || undefined}>{body()}</button>
    </Show>
  );
}

function CopyButton(props) {
  return (
    <button type="button" class="cd-ib" data-act={props.copy.act} aria-label={props.copy.label} title={props.copy.title}>
      <Icon name={props.copy.icon} />
    </button>
  );
}

function Workspace(props) {
  const w = () => props.workspace;
  const folder = () => <Row icon={w().folder.icon} label={w().folder.label} title={w().folder.title} />;
  return (
    <>
      <Row icon={w().machine.icon} label={w().machine.label} title={w().machine.title} />
      <Show when={w().copy} fallback={folder()}>
        <div class="cd-line">{folder()}<CopyButton copy={w().copy} /></div>
      </Show>
    </>
  );
}

function Opener(props) {
  const o = () => props.opener;
  return (
    <div class="cd-open">
      <button type="button" class="cd-open-main" data-act="cd-open" title={o().title}>
        <Icon name="external" class="cd-i" />
        <span>{o().said}</span>
      </button>
      <button type="button" class="cd-open-pick" data-act="cd-open-menu" aria-haspopup="menu" aria-expanded={o().open ? "true" : "false"} aria-label={o().pick}>
        <Icon name="chevronDown" />
      </button>
      <Show when={o().open}>
        <div class="cd-pop" role="menu">
          <For each={o().apps}>
            {(app) => (
              <button type="button" role="menuitemradio" aria-checked={app.best ? "true" : "false"} class="cd-pop-i" data-act="cd-open-with" data-app={app.id}>
                <span>{app.name}</span>
                <Show when={app.best}><kbd>{o().keys}</kbd></Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Pull(props) {
  const p = () => props.pr;
  return (
    <button type="button" class={`cd-row cd-pr pr-${p().state}`} data-act="cd-pr" data-pr={p().key} title={p().title}>
      <Icon name={p().icon} class="cd-i" />
      <span class="cd-label">{p().label}</span>
      <Show when={p().flag}><Icon name={p().flag.icon} class={p().flag.class} /></Show>
    </button>
  );
}

function ChangesEnd(props) {
  return (
    <Show when={props.end}>
      <Show when={props.end.clean === undefined} fallback={<span class="cd-end cd-muted">{props.end.clean}</span>}>
        <span class="cd-end cd-stat"><span class="add">+{props.end.added}</span> <span class="del">−{props.end.removed}</span></span>
      </Show>
    </Show>
  );
}

function Version(props) {
  const v = () => props.version;
  return (
    <>
      <Show when={v().branch}>
        <div class="cd-line">
          <Row icon="branch" label={v().branch.label} title={v().branch.label} />
          <CopyButton copy={v().branch.copy} />
        </div>
      </Show>
      <For each={v().prs}>{(pr) => <Pull pr={pr} />}</For>
      <Show when={v().changes}>
        <Row icon="diff" label={v().changes.label} act="cd-diff" title={v().changes.title}><ChangesEnd end={v().changes.end} /></Row>
      </Show>
    </>
  );
}

function Server(props) {
  const s = () => props.server;
  return (
    <div class="cd-line">
      <Row icon="globe" label={s().label} act="cd-server-open" url={s().url} title={s().title} />
      <button type="button" class="cd-ib cd-stop" data-act="cd-server-stop" data-pid={s().pid} aria-label={s().stop} title={s().stopTitle}>
        <Icon name="stop" />
      </button>
    </div>
  );
}

function Usage(props) {
  const u = () => props.usage;
  return (
    <div class="cd-uses">
      <Show when={u().none} fallback={
        <For each={u().windows}>
          {(one) => (
            <button type="button" class={one.heat ? `cd-use ${one.heat}` : "cd-use"} data-act="cd-usage" aria-label={one.said} title={one.title}>
              <span class="cd-use-l">{one.label}</span>
              <span class="cd-use-bar" attr:style={`--used:${one.used}%`}><i></i></span>
              <span class="cd-use-v">{one.used}%</span>
            </button>
          )}
        </For>
      }>
        <button type="button" class="cd-use" data-act="cd-usage" title={u().none.title}>
          <span class="cd-use-l">{u().none.label}</span>
          <span class="cd-use-v cd-wide">{u().none.value}</span>
        </button>
      </Show>
    </div>
  );
}

function ItemsMenu(props) {
  const m = () => props.menu;
  return (
    <div ref={props.ref} class="cd-pop cd-ctx" role="menu" aria-label={m().label} style={props.spot()}>
      <For each={m().copies}>
        {(copy) => (
          <button type="button" role="menuitem" class="cd-pop-i" data-act={copy.act}>
            <span class="cd-tick" aria-hidden="true"></span>
            <span>{copy.label}</span>
            <Show when={copy.done}><Icon name="check" /></Show>
          </button>
        )}
      </For>
      <hr />
      <div class="cd-pop-h">{m().head}</div>
      <For each={m().checks}>
        {(item) => (
          <button type="button" role="menuitemcheckbox" aria-checked={item.on ? "true" : "false"} class="cd-pop-i" data-act="cd-item" data-item={item.id}>
            <span class="cd-tick" aria-hidden="true"><Show when={item.on}><Icon name="check" /></Show></span>
            <span>{item.label}</span>
          </button>
        )}
      </For>
      <hr />
      <button type="button" role="menuitem" class="cd-pop-i" data-act="cd-items-reset" aria-disabled={m().reset.disabled ? "true" : undefined}>
        <span class="cd-tick" aria-hidden="true"></span>
        <span>{m().reset.label}</span>
      </button>
    </div>
  );
}

function hitOf(node) {
  const hit = node.closest("[data-act]");
  if (!hit) return null;
  const box = hit.getBoundingClientRect();
  const { act, item, app, pr, url, pid } = hit.dataset;
  return { act, item, app, pr, url, pid, box: { left: box.left, bottom: box.bottom }, inMenu: !!hit.closest(".cd-ctx") };
}

function ChatDetails(props) {
  const m = props.model;
  let root;
  const click = (ev) => {
    ev.stopPropagation();
    props.actions.click(hitOf(ev.target));
  };
  const menu = (ev) => {
    const selection = window.getSelection?.();
    if (ev.target.closest?.("input, textarea, a[href]") || (selection && !selection.isCollapsed && root.contains(selection.anchorNode))) return;
    ev.preventDefault();
    ev.stopPropagation();
    props.actions.menu(ev.clientX, ev.clientY);
  };
  return (
    <div ref={root} class="cd-card" role="dialog" aria-label={m.label} tabIndex={-1} style={props.spot()} on:click={click} on:contextmenu={menu}>
      <Show when={m.workspace || m.opener}>
        <section class="cd-sec" aria-label={m.sections.workspace}>
          <Show when={m.workspace}><Workspace workspace={m.workspace} /></Show>
          <Show when={m.opener}><Opener opener={m.opener} /></Show>
        </section>
      </Show>
      <Show when={m.version}>
        <section class="cd-sec" aria-label={m.sections.version}><Version version={m.version} /></section>
      </Show>
      <Show when={m.servers.length}>
        <section class="cd-sec" aria-label={m.sections.servers}>
          <For each={m.servers}>{(server) => <Server server={server} />}</For>
        </section>
      </Show>
      <Show when={m.usage}>
        <section class="cd-sec" aria-label={m.sections.usage}><Usage usage={m.usage} /></section>
      </Show>
      <Show when={m.empty}>
        <section class="cd-sec">
          <button type="button" class="cd-row" data-act="cd-items">
            <Icon name="settings" class="cd-i" />
            <span class="cd-label">{m.empty}</span>
          </button>
        </section>
      </Show>
      <Show when={m.trouble}><p class="cd-trouble" role="alert">{m.trouble}</p></Show>
      <Show when={m.menu}><ItemsMenu menu={m.menu} ref={props.menuRef} spot={props.menuSpot} /></Show>
    </div>
  );
}

const firstOf = (root, selector) => root?.querySelector(selector) || null;

export function chatDetailsView(initial, actions) {
  const [model, setModel] = createStore(initial);
  const [spot, setSpot] = createSignal({});
  const [menuSpot, setMenuSpot] = createSignal({});
  let el;
  let menuEl;
  let dispose;
  const menuPlace = () => {
    const at = model.menu?.at;
    if (!at) return;
    const left = Math.round(at.x);
    const top = Math.round(at.y);
    setMenuSpot({ left: `${left}px`, top: `${top}px` });
    if (!menuEl?.isConnected) return;
    const room = menuEl.getBoundingClientRect();
    const next = { left: `${left}px`, top: `${top}px` };
    if (room.right > window.innerWidth - 8) next.left = `${Math.max(8, window.innerWidth - room.width - 8)}px`;
    if (room.bottom > window.innerHeight - 8) next.top = `${Math.max(8, window.innerHeight - room.height - 8)}px`;
    setMenuSpot(next);
  };
  createRoot((done) => {
    dispose = done;
    el = <ChatDetails model={model} actions={actions} spot={spot} menuSpot={menuSpot} menuRef={(node) => { menuEl = node; }} />;
  });
  document.body.append(el);
  return {
    el,
    show(next) {
      setModel(reconcile(next, { key: "key" }));
    },
    place(anchor) {
      const box = anchor?.getBoundingClientRect() || { right: window.innerWidth - 16, bottom: 56 };
      const width = el.offsetWidth || 280;
      setSpot({ left: `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`, top: `${Math.min(box.bottom + 6, window.innerHeight - 80)}px` });
      menuPlace();
    },
    owns: (node) => el.contains(node),
    holdsFocus: () => el.contains(document.activeElement),
    box: () => el.getBoundingClientRect(),
    focusCard: (options) => el.focus(options),
    focusPop: () => firstOf(el, ".cd-pop .cd-pop-i")?.focus(),
    focusItemsMenu: () => firstOf(el, ".cd-ctx .cd-pop-i")?.focus(),
    focusPicker: () => (firstOf(el, '[aria-expanded="false"][aria-haspopup="menu"]') || el).focus(),
    step(event, inMenu) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const all = [...el.querySelectorAll(inMenu ? ".cd-pop .cd-pop-i" : "button")];
      const at = all.indexOf(document.activeElement);
      const next = all[(at + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    },
    close() {
      dispose();
      el.remove();
    }
  };
}

function UsageSwitch(props) {
  return (
    <button class="ghost flip" classList={{ on: props.model.on }} id="btn-details-usage" type="button" aria-pressed={props.model.on ? "true" : "false"} data-no-t on:click={(ev) => { ev.stopPropagation(); props.flip(); }}>
      {props.model.said}
    </button>
  );
}

export const mountDetailsSwitch = (host, initial, flip) => mountView(host, UsageSwitch, initial, { flip });
