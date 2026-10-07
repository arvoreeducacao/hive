import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";

function Chip(props) {
  return (
    <Show when={!props.chip.html} fallback={
      <span class="c lent" title={props.chip.title} data-take={props.chip.take} innerHTML={props.chip.html}
        onClick={(ev) => { ev.stopPropagation(); props.actions.takeBack(props.chip.take); }} />
    }>
      <span class={`c ${props.chip.cls}`} title={props.chip.title} data-memory={props.chip.memory || undefined}
        onClick={props.chip.memory ? (ev) => { ev.stopPropagation(); props.actions.memory(props.chip.memory, ev.currentTarget); } : undefined}>
        <Show when={props.chip.icon}><svg aria-hidden="true"><use href={props.chip.icon} /></svg></Show>
        <Show when={props.chip.memory}><i class="mdot" aria-hidden="true" /></Show>
        <span class="tx">{props.chip.text}</span>
        <Show when={props.chip.twig}><b>{props.chip.twig}</b></Show>
      </span>
    </Show>
  );
}

function HeadChip(props) {
  return (
    <span class={`c ${props.chip.cls}`} title={props.chip.title} data-copy={props.chip.copy || undefined} data-memory={props.chip.memory || undefined}
      onClick={(ev) => {
        if (props.chip.memory) { ev.stopPropagation(); props.actions.memory(props.chip.memory, ev.currentTarget); return; }
        if (!props.chip.copy) return;
        ev.stopPropagation();
        props.actions.copy(props.chip.copy, ev.currentTarget);
      }}>
      <Show when={props.chip.icon}><svg aria-hidden="true"><use href={props.chip.icon} /></svg></Show>
      <Show when={props.chip.memory}><i class="mdot" aria-hidden="true" /></Show>
      <span class="tx">{props.chip.text}</span>
    </span>
  );
}

function StateDot(props) {
  return (
    <Show when={props.dot === "failed"} fallback={<span class={`rc-dot t-dot ${props.dot}`} aria-hidden="true" />}>
      <svg class="t-dot failed" aria-hidden="true"><use href="#i-warn" /></svg>
    </Show>
  );
}

function PrAct(props) {
  return (
    <button class="t-act" classList={{ warn: props.act.tone === "warn", ready: props.act.tone === "ready", busy: props.act.busy }}
      disabled={props.act.busy} aria-busy={props.act.busy ? "true" : undefined}
      data-act={props.act.act} data-key={props.act.pr} data-check={props.act.check}
      onClick={(ev) => { ev.stopPropagation(); props.actions.prAct(props.act.pr, props.act.act, props.act.check, ev.currentTarget); }}>
      <Show when={props.act.busy}><i class="spinner" aria-hidden="true" /></Show>{props.act.label}
    </button>
  );
}

function PrCard(props) {
  return (
    <div class="t-pr" classList={{ bad: props.card.bad, landed: props.card.landed, here: props.card.here }} data-key={props.card.key}
      onClick={(ev) => { ev.stopPropagation(); props.actions.goToPr(props.card.key); }}>
      <span class="l1">
        <span class="num"><svg aria-hidden="true"><use href="#i-pr" /></svg><span class="repo">{props.card.repo}</span>#{props.card.number}</span>
        <Show when={props.card.scale}>
          <span class="scale"><span class="a">{props.card.scale.added}</span> <span class="d">{props.card.scale.gone}</span></span>
        </Show>
        <Show when={props.card.says}><span class="st" data-tone={props.card.tone} title={props.card.says}>{props.card.says}</span></Show>
      </span>
      <span class="subject">{props.card.subject}</span>
      <Show when={props.card.acts.length}>
        <div class="acts"><For each={props.card.acts}>{(act) => <PrAct act={act} actions={props.actions} />}</For></div>
      </Show>
    </div>
  );
}

function ThreadCard(props) {
  return (
    <div class="t-slack" classList={{ fresh: props.card.fresh, here: props.card.here }} data-key={props.card.key} data-link={props.card.link}
      onClick={(ev) => { ev.stopPropagation(); props.actions.openThread(props.card.key); }}>
      <span class="l1">
        <span class="chan"><svg aria-hidden="true"><use href={props.card.glyph} /></svg><span>{props.card.channel}</span></span>
        <Show when={props.card.opener}><span class="who">{props.card.opener}</span></Show>
        <span class="n" classList={{ quiet: !props.card.fresh }}>{props.card.news}</span>
      </span>
      <Show when={props.card.error}><span class="gone">{props.card.error}</span></Show>
      <Show when={props.card.stale}><span class="gone">{props.card.stale}</span></Show>
      <Show when={props.card.asked}><span class="ask">{props.card.asked}</span></Show>
      <Show when={props.card.last}>
        <span class="last"><b>{props.card.last.who}</b><span>{props.card.last.said}</span></span>
      </Show>
    </div>
  );
}

function PageCard(props) {
  return (
    <div class="t-art" classList={{ here: props.card.here }} data-key={props.card.key}
      onClick={(ev) => { ev.stopPropagation(); props.actions.openPage(props.card.key); }}>
      <span class="l1">
        <span class="face">{"◆"}</span>
        <span class="name">{props.card.name}</span>
        <span class="ver">{props.card.version}</span>
        <span class="st">{props.card.open}</span>
      </span>
      <span class="subject">{props.card.subject}</span>
    </div>
  );
}

function More(props) {
  return (
    <Show when={props.said}>
      <div class="t-more" onClick={(ev) => { ev.stopPropagation(); props.actions.openSeat(); }}>{props.said}</div>
    </Show>
  );
}

function Side(props) {
  return (
    <>
      <div class="t-head">
        <div class="t-grip" role="button" tabindex="0" aria-label={props.model.tags.grip}
          onClick={(ev) => { ev.stopPropagation(); props.actions.expand(); }}
          onKeyDown={(ev) => { if (ev.key !== "Enter" && ev.key !== " ") return; ev.preventDefault(); ev.stopPropagation(); props.actions.expand(); }}><i /></div>
        <Show when={props.model.raycast}><StateDot dot={props.model.dot} /></Show>
        <div class="t-ident">
          <span class={`t-place ${props.model.place.cls}`} title={props.model.place.title}><svg aria-hidden="true"><use href={props.model.place.icon} /></svg></span>
          <div class="t-name" on:click={(ev) => props.actions.titleClick?.(ev)} onDblClick={(ev) => { ev.stopPropagation(); props.actions.rename(); }} />
          <div class="t-sub" classList={{ "of-errand": props.model.sub.ofErrand }} title={props.model.sub.hint}>{props.model.sub.text}</div>
        </div>
        <Show when={props.model.raycast}>
          <span class="t-say" classList={{ hi: props.model.dot === "needs" }} title={props.model.label}>{props.model.say}</span>
          <span class="t-hchips">
            <For each={props.model.heads}>{(chip) => <HeadChip chip={chip} actions={props.actions} />}</For>
            <span class="t-live" hidden={!props.model.live.on} title={props.model.live.title}><svg aria-hidden="true"><use href="#i-agent" /></svg><b>{props.model.live.count}</b><span class="tx">{props.model.live.age}</span></span>
            <button class="t-canopy" hidden title={props.model.tags.canopy}><svg aria-hidden="true"><use href="#i-screen" /></svg><span /><i /></button>
            <button class="t-device" hidden title={props.model.tags.device}><svg aria-hidden="true"><use href="#i-phone" /></svg><span /><i /></button>
            <button class="t-page" hidden title={props.model.tags.page}><svg aria-hidden="true"><use href="#i-browser" /></svg><span /></button>
          </span>
        </Show>
        <span class="t-tags">
          <span class="acct" hidden={!props.model.account} title={props.model.accountHint}>{props.model.account}</span>
          <span class="where" data-where={props.model.where}><svg aria-hidden="true"><use href={props.model.whereIcon} /></svg><span class="where-txt">{props.model.where}</span></span>
          <button class="t-web" title={props.model.tags.web} aria-label={props.model.tags.web}
            onClick={(ev) => { ev.stopPropagation(); props.actions.browser(); }}><svg aria-hidden="true"><use href="#i-browser" /></svg></button>
          <button class="t-phone" title={props.model.tags.phone} aria-label={props.model.tags.phone}
            onClick={(ev) => { ev.stopPropagation(); props.actions.phone(); }}><svg aria-hidden="true"><use href="#i-phone" /></svg></button>
          <button class="t-edit" title={props.model.tags.edit} aria-label={props.model.tags.editShort}
            onClick={(ev) => { ev.stopPropagation(); props.actions.rename(); }}><svg aria-hidden="true"><use href="#i-pen" /></svg></button>
          <button class="t-home" hidden={!props.model.tags.home} title={props.model.tags.home} aria-label={props.model.tags.home}
            onClick={(ev) => { ev.stopPropagation(); props.actions.giveBack(); }}><svg aria-hidden="true"><use href="#i-grid" /></svg></button>
          <button class="t-fold" title={props.model.tags.fold} aria-label={props.model.tags.fold} aria-pressed="false"
            onClick={(ev) => { ev.stopPropagation(); props.actions.fold(); }}><svg aria-hidden="true"><use href="#i-minus" /></svg></button>
          <button class="t-min" title={props.model.tags.min} aria-label={props.model.tags.min}
            onClick={(ev) => { ev.stopPropagation(); props.actions.back(); }}><svg aria-hidden="true"><use href="#i-minus" /></svg></button>
          <button class="t-close" title={props.model.tags.close} aria-label={props.model.tags.close}
            onClick={(ev) => { ev.stopPropagation(); props.actions.close(ev.currentTarget.getBoundingClientRect()); }}><svg aria-hidden="true"><use href="#i-close" /></svg></button>
        </span>
        <Show when={props.model.raycast}><span class="rc-key t-key" hidden={!props.model.key} title={props.model.keyHint}>{props.model.key}</span></Show>
      </div>
      <Show when={!props.model.raycast}>
      <div class="t-state">
        <span class="t-pill"><svg class="gl" aria-hidden="true"><use href={props.model.glyph} /></svg><span class="label">{props.model.label}</span></span>
        <Show when={props.model.using}>{(using) => (
          <span class="t-using" data-kind={using().kind}><svg aria-hidden="true"><use href={using().icon} /></svg><span class="label">{using().text}</span></span>
        )}</Show>
        <span class="t-live" hidden={!props.model.live.on} title={props.model.live.title}><svg aria-hidden="true"><use href="#i-clock" /></svg><b>{props.model.live.badge}</b></span>
        <button class="t-canopy" hidden title={props.model.tags.canopy}><svg aria-hidden="true"><use href="#i-screen" /></svg><span /><i /></button>
        <button class="t-device" hidden title={props.model.tags.device}><svg aria-hidden="true"><use href="#i-phone" /></svg><span /><i /></button>
        <button class="t-page" hidden title={props.model.tags.page}><svg aria-hidden="true"><use href="#i-browser" /></svg><span /></button>
        <span class="when">{props.model.when}</span>
        <span class="t-where"><Show when={props.model.whereChip}>{(chip) => <Chip chip={chip()} actions={props.actions} />}</Show></span>
      </div>
      </Show>
      <button class="t-shot" hidden title={props.model.tags.canopy}><img alt="" /><span /></button>
      <div class="t-chips"><For each={props.model.chips}>{(chip) => <Chip chip={chip} actions={props.actions} />}</For></div>
      <p class="summary" classList={{ empty: props.model.summary.empty }}>{props.model.summary.text}</p>
      <div class="t-slack-wrap" data-heading={props.model.sections.threads}>
        <For each={props.model.threads.cards}>{(card) => <ThreadCard card={card} actions={props.actions} />}</For>
        <More said={props.model.threads.more} actions={props.actions} />
      </div>
      <div class="t-pr-wrap" data-heading={props.model.sections.prs}>
        <For each={props.model.prs.cards}>{(card) => <PrCard card={card} actions={props.actions} />}</For>
        <More said={props.model.prs.more} actions={props.actions} />
      </div>
      <div class="t-art-wrap" data-heading={props.model.sections.pages}>
        <For each={props.model.pages.cards}>{(card) => <PageCard card={card} actions={props.actions} />}</For>
        <More said={props.model.pages.more} actions={props.actions} />
      </div>
      <div class="actions">
        <button class="btn b-back" onClick={(ev) => { ev.stopPropagation(); props.actions.back(); }}>{props.model.acts.back}</button>
        <button class="btn b-reconnect" onClick={(ev) => { ev.stopPropagation(); props.actions.reconnect(); }}>{props.model.acts.reconnect}</button>
        <button class="btn b-kill" onClick={(ev) => { ev.stopPropagation(); props.actions.close(ev.currentTarget.getBoundingClientRect()); }}>{props.model.acts.kill}</button>
      </div>
    </>
  );
}

function JobSide(props) {
  return (
    <>
      <div class="t-head">
        <Show when={props.model.raycast}><StateDot dot={props.model.dot} /></Show>
        <div class="t-ident"><div class="t-name">{props.model.name}</div><div class="t-sub">{props.model.sub}</div></div>
        <Show when={props.model.raycast}><span class="t-say" title={props.model.label}>{props.model.say}</span></Show>
        <span class="where" data-where={props.model.where}><svg aria-hidden="true"><use href={props.model.whereIcon} /></svg><span class="where-txt">{props.model.where}</span></span>
      </div>
      <Show when={!props.model.raycast}>
      <div class="t-state">
        <span class="t-pill"><svg class="gl" aria-hidden="true"><use href={props.model.glyph} /></svg><span class="label">{props.model.label}</span></span>
        <span class="when">{props.model.when}</span>
      </div>
      </Show>
      <div class="t-chips"><For each={props.model.chips}>{(chip) => <Chip chip={chip} actions={props.actions} />}</For></div>
      <p class="summary" classList={{ empty: props.model.summary.empty }}>{props.model.summary.text}</p>
    </>
  );
}

function EditorBar(props) {
  return (
    <>
      <div class="ed-tabs">
        <For each={props.model.tabs}>{(tab) => (
          <span class="ed-tab" classList={{ on: tab.on }} data-at={tab.at} title={tab.hint}
            onClick={(ev) => { ev.stopPropagation(); props.actions.pickTab(tab.at); }}>
            <span class="nm">{tab.name}</span>
            <Show when={tab.dirty} fallback={
              <i class="ed-tab-x" onClick={(ev) => { ev.stopPropagation(); props.actions.closeTab(tab.at); }}><svg aria-hidden="true"><use href="#i-close" /></svg></i>
            }><i class="ed-dot" /></Show>
          </span>
        )}</For>
      </div>
      <div class="ed-acts">
        <button class="ghost ed-save" classList={{ on: props.model.dirty }} title={props.model.saveHint}
          onClick={(ev) => { ev.stopPropagation(); props.actions.save(); }}>{props.model.save}</button>
        <button class="ghost ed-close" title={props.model.closeHint} aria-label={props.model.closeHint}
          onClick={(ev) => { ev.stopPropagation(); props.actions.close(); }}><svg aria-hidden="true"><use href="#i-close" /></svg></button>
      </div>
    </>
  );
}

function Dotted(props) {
  return (
    <For each={props.parts}>{(part, at) => (
      <>
        <Show when={at()}><i class="dot">{"·"}</i></Show>
        <span classList={{ un: part.un }}>{part.text}</span>
      </>
    )}</For>
  );
}

function EditorStatus(props) {
  return (
    <>
      <span class="ed-where"><Dotted parts={props.model.where} /></span>
      <span class="ed-at"><Dotted parts={props.model.at} /></span>
      <span class="ed-said">{props.model.said}</span>
    </>
  );
}

function WallRow(props) {
  return (
    <button type="button" class="wall-row" classList={{ sel: props.first }} data-act={props.row.act} data-name={props.row.name} data-where={props.row.where}>
      <span class="wall-ic"><svg aria-hidden="true"><use href={`#${props.row.icon || "i-clock"}`} /></svg></span>
      <span class="wall-t">{props.row.title || props.row.name}</span>
      <span class="wall-s">{props.row.say}</span>
      <Show when={props.row.note}><span class="wall-note">{props.row.note}</span></Show>
      <For each={props.row.keys || []}>{(one) => <span class="rc-key">{one}</span>}</For>
    </button>
  );
}

function Wall(props) {
  return (
    <>
      <span class="wall-mark" innerHTML={props.model.mark} />
      <h2>{props.model.head}</h2>
      <p class="wall-lead">{props.model.lead}</p>
      <div class="wall-card">
        <For each={props.model.rows}>{(row, i) => <WallRow row={row} first={i() === 0} />}</For>
        <Show when={props.model.parked.length}>
          <div class="wall-sec"><span>{props.model.parkedHead}</span><span class="wall-keys"><For each={props.model.parkedKeys}>{(one) => <span class="rc-key">{one}</span>}</For></span></div>
          <For each={props.model.parked}>{(row) => <WallRow row={row} />}</For>
        </Show>
      </div>
      <span class="wall-server">{props.model.server}</span>
    </>
  );
}

function Blank(props) {
  return (
    <Show when={!props.model.rows} fallback={<Wall model={props.model} />}>
      <h2>{props.model.head}</h2>
      <div>{props.model.server} {"·"} {props.model.nothing} <code>{props.model.home}</code></div>
      <code>{props.model.opens}</code>
    </Show>
  );
}

export function mountTileSide(host, initial, actions) {
  return mountView(host, Side, initial, { actions });
}

export function mountJobSide(host, initial) {
  return mountView(host, JobSide, initial, {});
}

export function mountFileSide(el, initial, actions) {
  const bar = mountView(el.querySelector(".ed-bar"), EditorBar, initial.bar, { actions });
  const status = mountView(el.querySelector(".ed-status"), EditorStatus, initial.status, {});
  return {
    show(model) { bar.show(model.bar); status.show(model.status); },
    dispose() { bar.dispose(); status.dispose(); }
  };
}

export function mountBlank(host, initial) {
  return mountView(host, Blank, initial, {});
}
