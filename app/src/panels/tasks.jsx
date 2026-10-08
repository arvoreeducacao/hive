import { For, Show } from "solid-js";
import { Raw } from "../raw.jsx";
import { mountView } from "../view.jsx";
import { Head, Icon, Keys } from "./window.jsx";

function Face(props) {
  return (
    <Show when={props.face?.kind === "dev"} fallback={
      <span class="tk-face" classList={{ sm: props.small }} style={{ "--c": props.face?.colour }} aria-hidden="true">{props.face?.letter}</span>
    }>
      <span class="tk-bicho" classList={{ sm: props.small }} aria-hidden="true"><Raw html={props.face.svg} /></span>
    </Show>
  );
}

function GroupIcon(props) {
  const icon = () => props.icon || {};
  return (
    <span class="tk-gi" classList={{ lg: props.large, sm: props.small, photo: icon().kind === "image" }} style={{ "--c": icon().colour }} aria-hidden="true">
      <Show when={icon().kind === "image"}><img src={icon().src} alt="" /></Show>
      <Show when={icon().kind === "icon"}><svg><use href={icon().sprite} /></svg></Show>
      <Show when={icon().kind === "letter"}>{icon().letter}</Show>
    </span>
  );
}

function Seat(props) {
  return (
    <span class="tk-seat">
      <span class="tk-dot" style={{ "--c": props.seat.colour }} aria-hidden="true"></span>
      <span class="tk-seat-name">{props.seat.name}</span>
      <span class="tk-state" style={{ color: props.seat.colour }}>{props.seat.state}</span>
    </span>
  );
}

function Links(props) {
  return (
    <For each={props.links}>{(link) => <a class="tk-link" href={link.href} target="_blank" rel="noreferrer">{link.say}</a>}</For>
  );
}

function Said(props) {
  return (
    <For each={props.parts}>{(bit) => (
      <Show when={bit.kind === "person" || bit.kind === "chat"} fallback={
        <Show when={bit.kind === "loose"} fallback={bit.text}><span class="tk-mention">{bit.text}</span></Show>
      }>
        <span class="tk-chip" classList={{ chat: bit.kind === "chat" }}><Face face={bit.face} small />{bit.text}</span>
      </Show>
    )}</For>
  );
}

function Row(props) {
  const row = () => props.row;
  return (
    <div class="tk-row" classList={{ done: row().done }} data-task={row().key}>
      <button class="tk-check" classList={{ on: row().done }} disabled={!row().canCheck}
        aria-label={row().checkSay} title={row().checkSay}
        onClick={() => props.actions.toggle(row().key, !row().done)}></button>
      <div class="tk-main" onClick={() => props.actions.open(row().key)}>
        <div class="tk-text">{row().text}</div>
        <div class="tk-meta">
          <Show when={row().owner}><Face face={row().owner.face} small /><b>{row().owner.name}</b></Show>
          <span>{row().said}</span>
          <Show when={row().seat}><Seat seat={row().seat} /></Show>
          <Show when={row().links.length}><Links links={row().links} /></Show>
          <Show when={row().talk}><span classList={{ "tk-hot": row().talkHot }}>{row().talk}</span></Show>
        </div>
      </div>
      <div class="tk-acts">
        <span class="tk-pill" data-who={row().who}><Show when={row().whoIcon}><GroupIcon icon={row().whoIcon} small /></Show>{row().whoSay}</span>
        <Show when={row().act}>
          <button class="tk-btn" classList={{ go: row().act.go }} onClick={() => props.actions[row().act.kind](row().key)}>{row().act.say}</button>
        </Show>
      </div>
    </div>
  );
}

function List(props) {
  const head = () => props.model.groupHead;
  return (
    <>
      <Show when={head()} fallback={<><h2>{props.model.title}</h2><p class="tk-hint">{props.model.hint}</p></>}>
        <div class="tk-ghead">
          <GroupIcon icon={head().icon} large />
          <div class="tk-gtext">
            <h2>{head().name}</h2>
            <div class="tk-gmeta"><For each={head().faces}>{(one) => <Face face={one.face} small />}</For><span>{head().meta}</span></div>
          </div>
          <button class="tk-btn" onClick={() => props.actions.editGroup(head().key)}>{head().editSay}</button>
        </div>
      </Show>
      <Show when={props.model.rows.length} fallback={
        <div class="tk-empty"><b>{props.model.empty.head}</b>{props.model.empty.say}</div>
      }>
        <div class="tk-list"><For each={props.model.rows}>{(row) => <Row row={row} actions={props.actions} />}</For></div>
      </Show>
    </>
  );
}

function Detail(props) {
  const d = () => props.model.detail;
  return (
    <>
      <button class="tk-crumb" onClick={() => props.actions.back()}>← {d().back}</button>
      <h2 class="tk-title">{d().text}</h2>
      <div class="tk-sub">{d().said}</div>
      <dl class="tk-kv">
        <dt>{d().whoLabel}</dt>
        <dd>
          <Show when={d().mine} fallback={<span class="tk-pill" data-who={d().who}>{d().whoSay}</span>}>
            <span class="tk-seg" role="radiogroup" aria-label={d().whoLabel}>
              <For each={d().whoOptions}>{(one) => (
                <button class="tk-btn" classList={{ on: one.on }} role="radio" aria-checked={one.on ? "true" : "false"}
                  onClick={() => props.actions.share(d().key, one.key)}>{one.say}</button>
              )}</For>
            </span>
          </Show>
          <span class="tk-muted">{d().whoHint}</span>
        </dd>
        <Show when={d().mine && d().who === "people"}>
          <dt></dt>
          <dd class="tk-people">
            <Show when={d().people.length} fallback={<span class="tk-muted">{d().nobody}</span>}>
              <For each={d().people}>{(one) => (
                <label class="tk-person">
                  <input type="checkbox" checked={one.on} onChange={(ev) => props.actions.person(d().key, one.key, ev.currentTarget.checked)} />
                  <Face face={one.face} />{one.key}
                </label>
              )}</For>
            </Show>
          </dd>
        </Show>
        <Show when={d().mine && d().who === "group"}>
          <dt></dt>
          <dd>
            <select class="tk-select" aria-label={d().whoLabel} onChange={(ev) => props.actions.pickGroup(d().key, ev.currentTarget.value)}>
              <For each={d().groups}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
            </select>
          </dd>
        </Show>
        <dt>{d().chatLabel}</dt>
        <dd>
          <Show when={d().seat} fallback={<span class="tk-muted">{d().noChat}</span>}><Seat seat={d().seat} /></Show>
          <Show when={d().openSay}><button class="tk-btn" onClick={() => props.actions.goto(d().seat.name)}>{d().openSay}</button></Show>
          <Show when={d().startSay}><button class="tk-btn go" onClick={() => props.actions.start(d().key)}>{d().startSay}</button></Show>
        </dd>
        <Show when={d().handTo}>
          <dt></dt>
          <dd>
            <select class="tk-select" aria-label={d().handTo.say} onChange={(ev) => props.actions.pickSeat(ev.currentTarget.value)}>
              <option value="">{d().handTo.pick}</option>
              <For each={d().handTo.seats}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
            </select>
            <button class="tk-btn" disabled={!d().handTo.ready} onClick={() => props.actions.assign(d().key)}>{d().handTo.say}</button>
          </dd>
        </Show>
        <Show when={d().links.length}>
          <dt>{d().backLabel}</dt>
          <dd><Links links={d().links} /></dd>
        </Show>
      </dl>
      <div class="tk-cap">{d().talkLabel}</div>
      <Show when={d().comments.length} fallback={<p class="tk-muted">{d().quiet}</p>}>
        <div class="tk-talk">
          <For each={d().comments}>{(one) => (
            <div class="tk-comment" classList={{ agent: one.agent }}>
              <Face face={one.face} />
              <div>
                <div class="tk-who"><b>{one.who}</b><Show when={one.agent}><span class="tk-tag">{one.agentSay}</span></Show><span class="tk-when">{one.when}</span></div>
                <div class="tk-said"><Said parts={one.parts} /></div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
      <Show when={d().removeSay}>
        <div class="tk-danger"><button class="tk-btn" onClick={() => props.actions.remove(d().key)}>{d().removeSay}</button></div>
      </Show>
    </>
  );
}

function GroupForm(props) {
  const f = () => props.model.form;
  let picker;
  return (
    <>
      <h2>{f().title}</h2>
      <label class="tk-field">
        <span class="tk-cap">{f().nameLabel}</span>
        <input class="tk-input" spellcheck="false" autocomplete="off" maxlength="40" value={f().name}
          onInput={(ev) => props.actions.formName(ev.currentTarget.value)} />
      </label>
      <div class="tk-field">
        <span class="tk-cap">{f().pictureLabel}</span>
        <div class="tk-pick">
          <For each={f().modes}>{(mode) => (
            <div class="tk-mode" classList={{ on: mode.on }} onClick={() => props.actions.formMode(mode.key)}>
              <span>{mode.say}</span>
              <Show when={mode.key === "image"}>
                <button type="button" class="tk-drop" onClick={(ev) => { ev.stopPropagation(); picker.click(); }}>
                  <Show when={f().imageSrc} fallback={f().dropSay}><img src={f().imageSrc} alt="" /><span>{f().dropSay}</span></Show>
                </button>
                <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={(ev) => { props.actions.formPicture(ev.currentTarget.files?.[0]); ev.currentTarget.value = ""; }} />
              </Show>
              <Show when={mode.key === "icon"}>
                <div class="tk-icons">
                  <For each={f().icons}>{(icon) => (
                    <button type="button" class="tk-icon" classList={{ on: icon.on }} aria-label={icon.key}
                      onClick={(ev) => { ev.stopPropagation(); props.actions.formIcon(icon.key); }}><svg><use href={icon.sprite} /></svg></button>
                  )}</For>
                </div>
                <div class="tk-swatches">
                  <For each={f().colours}>{(colour) => (
                    <button type="button" class="tk-swatch" classList={{ on: colour.on }} style={{ "--c": colour.css }} aria-label={colour.key}
                      onClick={(ev) => { ev.stopPropagation(); props.actions.formColour(colour.key); }}></button>
                  )}</For>
                </div>
              </Show>
              <Show when={mode.key === "letter"}>
                <GroupIcon icon={{ kind: "letter", letter: f().letter, colour: f().letterColour }} large />
              </Show>
            </div>
          )}</For>
        </div>
      </div>
      <div class="tk-field">
        <span class="tk-cap">{f().membersLabel}</span>
        <div class="tk-members">
          <For each={f().members}>{(one) => (
            <label class="tk-person">
              <input type="checkbox" checked={one.on} onChange={(ev) => props.actions.formMember(one.key, ev.currentTarget.checked)} />
              <Face face={one.face} />{one.say}
            </label>
          )}</For>
        </div>
      </div>
      <div class="tk-note">{f().warn}</div>
    </>
  );
}

function Mention(props) {
  const m = () => props.mention;
  const Item = (p) => (
    <button type="button" class="tk-aitem" classList={{ on: p.item.on }} onMouseDown={(ev) => { ev.preventDefault(); props.actions.mention(p.item.key); }}>
      <Face face={p.item.face} />
      <span class="tk-aname" classList={{ chat: p.item.kind === "chat" }}>{p.item.name}</span>
      <span class="tk-asub">{p.item.sub}</span>
    </button>
  );
  return (
    <div class="tk-ac" role="listbox">
      <Show when={m().people.length}><div class="tk-acap">{m().peopleSay}</div><For each={m().people}>{(item) => <Item item={item} />}</For></Show>
      <Show when={m().chats.length}><div class="tk-acap">{m().chatsSay}</div><For each={m().chats}>{(item) => <Item item={item} />}</For></Show>
      <div class="tk-afoot">{m().hint}</div>
    </div>
  );
}

function Tasks(props) {
  const m = () => props.model;
  return (
    <>
      <nav class="tk-nav" aria-label={m().navLabel}>
        <For each={m().nav}>{(one) => (
          <button type="button" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(one.key)}>
            <span>{one.say}</span><span class="tk-n" classList={{ hot: one.hot }}>{one.n}</span>
          </button>
        )}</For>
        <div class="tk-navcap">{m().groupsLabel}</div>
        <For each={m().groups}>{(one) => (
          <button type="button" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(`group:${one.key}`)}>
            <GroupIcon icon={one.icon} /><span>{one.say}</span><span class="tk-n" classList={{ hot: one.hot }}>{one.n}</span>
          </button>
        )}</For>
        <button type="button" class="tk-new" aria-current={m().newGroupOn ? "true" : "false"} onClick={() => props.actions.newGroup()}>{m().newGroupSay}</button>
        <Show when={m().people.length}>
          <div class="tk-navcap">{m().peopleLabel}</div>
          <For each={m().people}>{(one) => (
            <button type="button" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(`dev:${one.key}`)}>
              <Face face={one.face} /><span>{one.key}</span><span class="tk-n">{one.n}</span>
            </button>
          )}</For>
        </Show>
      </nav>
      <div class="tk-body">
        <Show when={m().note}><div class="tk-note" classList={{ bad: m().noteBad }}>{m().note}</div></Show>
        <Show when={m().view === "form" && m().form}><GroupForm model={m()} actions={props.actions} /></Show>
        <Show when={m().view === "detail" && m().detail}><Detail model={m()} actions={props.actions} /></Show>
        <Show when={m().view === "list"}><List model={m()} actions={props.actions} /></Show>
      </div>
      <Show when={m().foot.form} fallback={
        <form class="tk-foot" onSubmit={(ev) => { ev.preventDefault(); props.actions.submit(); }}>
          <Show when={m().foot.mention}><Mention mention={m().foot.mention} actions={props.actions} /></Show>
          <Show when={m().foot.confirm}>
            <div class="tk-confirm" role="alertdialog">
              <span>{m().foot.confirm.say}</span>
              <span class="tk-grow"></span>
              <Show when={m().foot.confirm.canShare}><button type="button" class="tk-btn go" onClick={() => props.actions.confirmShare(true)}>{m().foot.confirm.shareSay}</button></Show>
              <button type="button" class="tk-btn" onClick={() => props.actions.confirmShare(false)}>{m().foot.confirm.justSay}</button>
              <button type="button" class="tk-btn" onClick={() => props.actions.cancelConfirm()}>{m().foot.confirm.cancelSay}</button>
            </div>
          </Show>
          <input id="tk-in" class="tk-input" spellcheck="false" autocomplete="off" maxlength="2000"
            placeholder={m().foot.placeholder} aria-label={m().foot.placeholder} disabled={m().foot.busy}
            onInput={(ev) => props.actions.typed(ev.currentTarget)} onKeyDown={(ev) => props.actions.key(ev)}
            onBlur={() => setTimeout(() => props.actions.typed({ value: "", selectionStart: 0 }), 120)} />
          <Show when={m().foot.who}>
            <select class="tk-select" aria-label={m().foot.who.label} onChange={(ev) => props.actions.addWho(ev.currentTarget.value)}>
              <For each={m().foot.who.options}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
            </select>
          </Show>
          <button type="submit" class="tk-btn go" disabled={m().foot.busy}>{m().foot.send}</button>
          <button type="button" class="tk-btn" onClick={() => props.actions.close()}>{m().foot.close} <kbd>esc</kbd></button>
        </form>
      }>
        <div class="tk-foot">
          <span class="tk-grow"></span>
          <button type="button" class="tk-btn" onClick={() => props.actions.cancelForm()}>{m().form.cancelSay}</button>
          <button type="button" class="tk-btn go" disabled={m().foot.busy} onClick={() => props.actions.saveForm()}>{m().form.saveSay}</button>
        </div>
      </Show>
    </>
  );
}

function TkFace(props) {
  return (
    <Show when={props.face?.kind === "dev"} fallback={
      <span class="tk-face" classList={{ sm: props.small }} style={{ "--c": props.face?.colour }} aria-hidden="true">{props.face?.letter}</span>
    }>
      <span class="tk-bicho" classList={{ sm: props.small }} aria-hidden="true"><Raw html={props.face.svg} /></span>
    </Show>
  );
}

function TkGroupIcon(props) {
  const icon = () => props.icon || {};
  return (
    <span class="tk-gi" classList={{ lg: props.large, sm: props.small, photo: icon().kind === "image" }} style={{ "--c": icon().colour }} aria-hidden="true">
      <Show when={icon().kind === "image"}><img src={icon().src} alt="" /></Show>
      <Show when={icon().kind === "icon"}><svg><use href={icon().sprite} /></svg></Show>
      <Show when={icon().kind === "letter"}>{icon().letter}</Show>
    </span>
  );
}

function TkSeat(props) {
  return (
    <span class="tk-seat">
      <span class={`rc-dot ${props.seat.state || "idle"}`} aria-hidden="true"></span>
      <span class="tk-seat-name">{props.seat.name}</span>
      <span class="tk-state">{props.seat.label}</span>
    </span>
  );
}

function TkLinks(props) {
  return (
    <For each={props.links}>{(link) => <a class="tk-link" href={link.href} target="_blank" rel="noreferrer">{link.say}</a>}</For>
  );
}

function TkSaid(props) {
  return (
    <For each={props.parts}>{(bit) => (
      <Show when={bit.kind === "person" || bit.kind === "chat"} fallback={
        <Show when={bit.kind === "loose"} fallback={bit.text}><span class="tk-mention">{bit.text}</span></Show>
      }>
        <span class="tk-chip" classList={{ chat: bit.kind === "chat" }}><TkFace face={bit.face} small />{bit.text}</span>
      </Show>
    )}</For>
  );
}

function TkRow(props) {
  const row = () => props.row;
  return (
    <div class="pw-row tk-row" classList={{ done: row().done }} role="option" aria-selected={row().here ? "true" : "false"} data-task={row().key}
      title={row().text} onClick={() => props.actions.open(row().key)}>
      <button type="button" class="tk-check" classList={{ on: row().done }} disabled={!row().canCheck}
        aria-label={row().checkSay} title={row().checkSay}
        onClick={(ev) => { ev.stopPropagation(); props.actions.toggle(row().key, !row().done); }}><Show when={row().done}><Icon id="i-check" /></Show></button>
      <span class="pw-t tk-text">{row().text}</span>
      <span class="pw-acc">
        <Show when={row().talkCount}><span class="pw-st" classList={{ "tk-hot": row().talkHot }} title={row().talk}><Icon id="i-quote" />{row().talkCount}</span></Show>
        <Show when={row().seat} fallback={
          <Show when={row().done} fallback={<span class="pw-lab" data-who={row().who}>{row().whoSay}</span>}><span class="pw-m">{row().when}</span></Show>
        }><span class="pw-st"><span class={`rc-dot ${row().seat.state || "idle"}`} aria-hidden="true" />{row().seat.label}</span></Show>
      </span>
    </div>
  );
}

function TkList(props) {
  const head = () => props.model.groupHead;
  return (
    <div class="pw-list tk-list" role="listbox" aria-label={props.model.title}>
      <Show when={head()}>
        <div class="tk-ghead">
          <TkGroupIcon icon={head().icon} large />
          <div class="tk-gtext">
            <b>{head().name}</b>
            <div class="tk-gmeta"><For each={head().faces}>{(one) => <TkFace face={one.face} small />}</For><span>{head().meta}</span></div>
          </div>
          <button type="button" class="pw-act" onClick={() => props.actions.editGroup(head().key)}>{head().editSay}</button>
        </div>
      </Show>
      <Show when={props.model.rows.length} fallback={
        <div class="pw-empty tk-empty"><span class="pw-ico"><Icon id="i-list" /></span><h3>{props.model.empty.head}</h3><p>{props.model.empty.say}</p></div>
      }>
        <For each={props.model.groups_}>{(group) => (
          <>
            <div class="pw-sec">{group.say}<span class="n">{group.rows.length}</span></div>
            <For each={group.rows}>{(row) => <TkRow row={row} actions={props.actions} />}</For>
          </>
        )}</For>
      </Show>
    </div>
  );
}

function TkDetail(props) {
  const d = () => props.model.detail;
  return (
    <>
      <h2 class="pw-h1 tk-title">{d().text}</h2>
      <div class="pw-strip"><For each={d().strip}>{(bit) => <span>{bit}</span>}</For></div>
      <dl class="pw-kv tk-kv">
        <dt>{d().whoLabel}</dt>
        <dd>
          <Show when={d().mine} fallback={<span class="tk-pill" data-who={d().who}>{d().whoSay}</span>}>
            <span class="pw-tabs tk-seg" role="radiogroup" aria-label={d().whoLabel}>
              <For each={d().whoOptions}>{(one) => (
                <button type="button" class="pw-tab" role="radio" aria-checked={one.on ? "true" : "false"} aria-selected={one.on ? "true" : "false"}
                  onClick={() => props.actions.share(d().key, one.key)}>{one.say}</button>
              )}</For>
            </span>
          </Show>
          <span class="tk-muted">{d().whoHint}</span>
        </dd>
        <Show when={d().mine && d().who === "people"}>
          <dt></dt>
          <dd class="tk-people">
            <Show when={d().people.length} fallback={<span class="tk-muted">{d().nobody}</span>}>
              <For each={d().people}>{(one) => (
                <label class="tk-person">
                  <input type="checkbox" checked={one.on} onChange={(ev) => props.actions.person(d().key, one.key, ev.currentTarget.checked)} />
                  <TkFace face={one.face} />{one.key}
                </label>
              )}</For>
            </Show>
          </dd>
        </Show>
        <Show when={d().mine && d().who === "group"}>
          <dt></dt>
          <dd>
            <select class="tk-select" aria-label={d().whoLabel} onChange={(ev) => props.actions.pickGroup(d().key, ev.currentTarget.value)}>
              <For each={d().groups}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
            </select>
          </dd>
        </Show>
        <dt>{d().chatLabel}</dt>
        <dd>
          <Show when={d().seat} fallback={<span class="tk-muted">{d().noChat}</span>}><TkSeat seat={d().seat} /></Show>
          <Show when={d().openSay}><button type="button" class="tk-btn" onClick={() => props.actions.goto(d().seat.name)}>{d().openSay}</button></Show>
          <Show when={d().startSay}><button type="button" class="tk-btn" onClick={() => props.actions.start(d().key)}>{d().startSay}</button></Show>
        </dd>
        <Show when={d().handTo}>
          <dt></dt>
          <dd>
            <select class="tk-select" aria-label={d().handTo.say} onChange={(ev) => props.actions.pickSeat(ev.currentTarget.value)}>
              <option value="">{d().handTo.pick}</option>
              <For each={d().handTo.seats}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
            </select>
            <button class="tk-btn" disabled={!d().handTo.ready} onClick={() => props.actions.assign(d().key)}>{d().handTo.say}</button>
          </dd>
        </Show>
        <Show when={d().links.length}>
          <dt>{d().backLabel}</dt>
          <dd><TkLinks links={d().links} /></dd>
        </Show>
      </dl>
      <div class="pw-hr" />
      <div class="pw-cap">{d().talkLabel}<Show when={d().comments.length}>{` · ${d().comments.length}`}</Show></div>
      <Show when={d().comments.length} fallback={<p class="tk-muted">{d().quiet}</p>}>
        <div class="tk-talk">
          <For each={d().comments}>{(one) => (
            <div class="tk-comment" classList={{ agent: one.agent }}>
              <TkFace face={one.face} />
              <div>
                <div class="tk-who"><b>{one.who}</b><Show when={one.agent}><span class="rc-badge mono">{one.agentSay}</span></Show><span class="tk-when">{one.when}</span></div>
                <div class="tk-said"><TkSaid parts={one.parts} /></div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
      <form class="tk-say" onSubmit={(ev) => { ev.preventDefault(); props.actions.submit("comment"); }}>
        <Show when={props.model.say.mention}><TkMention mention={props.model.say.mention} actions={props.actions} /></Show>
        <Show when={props.model.say.confirm}><TkConfirm confirm={props.model.say.confirm} actions={props.actions} /></Show>
        <input id="tk-say" class="tk-input" spellcheck="false" autocomplete="off" maxlength="2000"
          placeholder={props.model.say.placeholder} aria-label={props.model.say.placeholder} disabled={props.model.say.busy}
          onInput={(ev) => props.actions.typed(ev.currentTarget)} onKeyDown={(ev) => props.actions.key(ev)}
          onBlur={() => setTimeout(() => props.actions.typed(null), 120)} />
        <button type="submit" class="pw-act" disabled={props.model.say.busy}>{props.model.say.send}<Keys keys={["↵"]} /></button>
      </form>
    </>
  );
}

function TkConfirm(props) {
  return (
    <div class="tk-confirm" role="alertdialog">
      <span>{props.confirm.say}</span>
      <span class="tk-grow"></span>
      <Show when={props.confirm.canShare}><button type="button" class="tk-btn go" onClick={() => props.actions.confirmShare(true)}>{props.confirm.shareSay}</button></Show>
      <button type="button" class="tk-btn" onClick={() => props.actions.confirmShare(false)}>{props.confirm.justSay}</button>
      <button type="button" class="tk-btn" onClick={() => props.actions.cancelConfirm()}>{props.confirm.cancelSay}</button>
    </div>
  );
}

function TkGroupForm(props) {
  const f = () => props.model.form;
  let picker;
  return (
    <>
      <h2>{f().title}</h2>
      <label class="tk-field">
        <span class="tk-cap">{f().nameLabel}</span>
        <input class="tk-input" spellcheck="false" autocomplete="off" maxlength="40" value={f().name}
          onInput={(ev) => props.actions.formName(ev.currentTarget.value)} />
      </label>
      <div class="tk-field">
        <span class="tk-cap">{f().pictureLabel}</span>
        <div class="tk-pick">
          <For each={f().modes}>{(mode) => (
            <div class="tk-mode" classList={{ on: mode.on }} onClick={() => props.actions.formMode(mode.key)}>
              <span>{mode.say}</span>
              <Show when={mode.key === "image"}>
                <button type="button" class="tk-drop" onClick={(ev) => { ev.stopPropagation(); picker.click(); }}>
                  <Show when={f().imageSrc} fallback={f().dropSay}><img src={f().imageSrc} alt="" /><span>{f().dropSay}</span></Show>
                </button>
                <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={(ev) => { props.actions.formPicture(ev.currentTarget.files?.[0]); ev.currentTarget.value = ""; }} />
              </Show>
              <Show when={mode.key === "icon"}>
                <div class="tk-icons">
                  <For each={f().icons}>{(icon) => (
                    <button type="button" class="tk-icon" classList={{ on: icon.on }} aria-label={icon.key}
                      onClick={(ev) => { ev.stopPropagation(); props.actions.formIcon(icon.key); }}><svg><use href={icon.sprite} /></svg></button>
                  )}</For>
                </div>
                <div class="tk-swatches">
                  <For each={f().colours}>{(colour) => (
                    <button type="button" class="tk-swatch" classList={{ on: colour.on }} style={{ "--c": colour.css }} aria-label={colour.key}
                      onClick={(ev) => { ev.stopPropagation(); props.actions.formColour(colour.key); }}></button>
                  )}</For>
                </div>
              </Show>
              <Show when={mode.key === "letter"}>
                <TkGroupIcon icon={{ kind: "letter", letter: f().letter, colour: f().letterColour }} large />
              </Show>
            </div>
          )}</For>
        </div>
      </div>
      <div class="tk-field">
        <span class="tk-cap">{f().membersLabel}</span>
        <div class="tk-members">
          <For each={f().members}>{(one) => (
            <label class="tk-person">
              <input type="checkbox" checked={one.on} onChange={(ev) => props.actions.formMember(one.key, ev.currentTarget.checked)} />
              <TkFace face={one.face} />{one.say}
            </label>
          )}</For>
        </div>
      </div>
      <div class="tk-note">{f().warn}</div>
    </>
  );
}

function TkMention(props) {
  const m = () => props.mention;
  const Item = (p) => (
    <button type="button" class="tk-aitem" classList={{ on: p.item.on }} onMouseDown={(ev) => { ev.preventDefault(); props.actions.mention(p.item.key); }}>
      <TkFace face={p.item.face} />
      <span class="tk-aname" classList={{ chat: p.item.kind === "chat" }}>{p.item.name}</span>
      <span class="tk-asub">{p.item.sub}</span>
    </button>
  );
  return (
    <div class="tk-ac" role="listbox">
      <Show when={m().people.length}><div class="tk-acap">{m().peopleSay}</div><For each={m().people}>{(item) => <Item item={item} />}</For></Show>
      <Show when={m().chats.length}><div class="tk-acap">{m().chatsSay}</div><For each={m().chats}>{(item) => <Item item={item} />}</For></Show>
      <div class="tk-afoot">{m().hint}</div>
    </div>
  );
}

function TasksWindow(props) {
  const m = () => props.model;
  return (
    <>
      <Head head={m().head} actions={props.actions} />
      <div class="pw-body three">
        <nav class="pw-nav tk-nav" aria-label={m().navLabel}>
          <For each={m().nav}>{(one) => (
            <button type="button" class="tk-ni" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(one.key)}>
              <Icon id={one.icon} /><span>{one.say}</span><span class="tk-n" classList={{ hot: one.hot }}>{one.n}</span>
            </button>
          )}</For>
          <div class="pw-sec">{m().groupsLabel}</div>
          <For each={m().groups}>{(one) => (
            <button type="button" class="tk-ni" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(`group:${one.key}`)}>
              <TkGroupIcon icon={one.icon} /><span>{one.say}</span><span class="tk-n" classList={{ hot: one.hot }}>{one.n}</span>
            </button>
          )}</For>
          <button type="button" class="tk-ni tk-new" aria-current={m().newGroupOn ? "true" : "false"} onClick={() => props.actions.newGroup()}><Icon id="i-plus" /><span>{m().newGroupSay}</span></button>
          <Show when={m().people.length}>
            <div class="pw-sec">{m().peopleLabel}</div>
            <For each={m().people}>{(one) => (
              <button type="button" class="tk-ni" aria-current={one.on ? "true" : "false"} onClick={() => props.actions.section(`dev:${one.key}`)}>
                <TkFace face={one.face} /><span>{one.key}</span><span class="tk-n">{one.n}</span>
              </button>
            )}</For>
          </Show>
        </nav>
        <TkList model={m()} actions={props.actions} />
        <div class="pw-detail tk-body">
          <Show when={m().note}><div class="tk-note" classList={{ bad: m().noteBad }}>{m().note}</div></Show>
          <Show when={m().view === "form" && m().form}><TkGroupForm model={m()} actions={props.actions} /></Show>
          <Show when={m().view === "detail" && m().detail}><TkDetail model={m()} actions={props.actions} /></Show>
          <Show when={m().view === "list"}><p class="tk-muted tk-pickone">{m().hint}</p></Show>
        </div>
      </div>
      <Show when={m().foot.form} fallback={
        <form class="pw-foot tk-foot" onSubmit={(ev) => { ev.preventDefault(); props.actions.submit("add"); }}>
          <Show when={m().foot.mention}><TkMention mention={m().foot.mention} actions={props.actions} /></Show>
          <label class="tk-compose">
            <Icon id="i-plus" />
            <input id="tk-in" spellcheck="false" autocomplete="off" maxlength="2000"
              placeholder={m().foot.placeholder} aria-label={m().foot.placeholder} disabled={m().foot.busy}
              onInput={(ev) => props.actions.typed(ev.currentTarget)} onKeyDown={(ev) => props.actions.key(ev)}
              onBlur={() => setTimeout(() => props.actions.typed(null), 120)} />
            <Keys keys={m().foot.noteKeys} />
          </label>
          <Show when={m().foot.who}>
            <label class="pw-drop">
              <select aria-label={m().foot.who.label} onChange={(ev) => props.actions.addWho(ev.currentTarget.value)}>
                <For each={m().foot.who.options}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
              </select>
            </label>
          </Show>
          <button type="submit" class="pw-go" disabled={m().foot.busy}>{m().foot.send}<Keys keys={["↵"]} /></button>
          <span class="pw-vsep" />
          <button type="button" class="pw-act" data-pw-more aria-haspopup="menu" onClick={() => props.actions.more()}>{m().foot.moreSay}<Keys keys={m().foot.moreKeys} /></button>
        </form>
      }>
        <div class="pw-foot tk-foot">
          <span class="pw-crumb"><Icon id="i-list" /><span>{m().head.title}</span><span aria-hidden="true">›</span><span class="pw-mono">{m().form.title}</span></span>
          <span class="pw-grow"></span>
          <button type="button" class="pw-act" onClick={() => props.actions.cancelForm()}>{m().form.cancelSay}<Keys keys={["esc"]} /></button>
          <button type="button" class="pw-go" disabled={m().foot.busy} onClick={() => props.actions.saveForm()}>{m().form.saveSay}<Keys keys={m().form.saveKeys} /></button>
        </div>
      </Show>
    </>
  );
}

function TasksPanel(props) {
  return <Show when={props.model.raycast} fallback={<Tasks model={props.model} actions={props.actions} />}><TasksWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountTasks(host, extras) {
  return mountView(host, TasksPanel, { key: "tasks", nav: [], groups: [], people: [], rows: [], empty: { head: "", say: "" }, foot: { placeholder: "", send: "", close: "" }, view: "list" }, extras, { lazy: true });
}
