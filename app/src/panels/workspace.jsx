import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Repos(props) {
  return (
    <div class="ws-repos">
      <For each={props.repos}>{(r) => (
        <div class={`ws-repo ${r.shape}`} title={r.why || undefined}>
          <b>{r.name}</b>
          <Show when={r.tech}><span class="tech">{r.tech}</span></Show>
          <span class="mark" innerHTML={r.mark} />
          <Show when={r.retry}><button class="retry" data-retry={r.entry}>{r.retry}</button></Show>
        </div>
      )}</For>
      <Show when={props.more}><button class="ws-repo more" data-show="repos">{props.more}</button></Show>
    </div>
  );
}

function Chips(props) {
  return (
    <div class="ws-chips">
      <Show when={props.items.length} fallback={<span class="sub">{props.empty}</span>}>
        <For each={props.items}>{(c) => <span class={`ws-chip ${c.shape}${c.scoped ? " scoped" : ""}`} innerHTML={c.html} />}</For>
      </Show>
      <Show when={props.more}><button class="ws-chip more" data-show={props.kind}>{props.more}</button></Show>
    </div>
  );
}

function FixPreview(props) {
  return (
    <div class="ws-add ws-fix-preview">
      <div class="head"><b>{props.plan.head}</b><span class="sum">{props.plan.sum}</span></div>
      <For each={props.plan.items}>{(item) => (
        <div class="ws-fix-item">
          <div class="ws-fix-head">{item.head}<Show when={item.error}><span class="field-err">{item.error}</span></Show></div>
          <div class="ws-files">
            <For each={item.files}>{(f) => (
              <>
                <div class={`ws-file ${f.shape}`}><span class="verdict">{f.verdict}</span><span class="name">{f.file}</span><span class="say">{f.say}</span></div>
                <Show when={f.excerpt}><pre class="ws-excerpt">{f.excerpt}</pre></Show>
                <Show when={f.choices.length}>
                  <div class="ws-choice">{f.ask}
                    <For each={f.choices}>{(c) => <button class={c.on ? "on" : ""} data-block={c.key} data-file={f.file}>{c.say}</button>}</For>
                  </div>
                </Show>
              </>
            )}</For>
          </div>
        </div>
      )}</For>
      <p class="sub">{props.plan.note}</p>
      <Show when={props.fix.error}><p class="field-err">{props.fix.error}</p></Show>
      <div class="acts">
        <button class="ghost" id="ws-fix-cancel">{props.fix.cancelSay}</button>
        <button class="btn" id="ws-fix-apply" disabled={props.fix.busy || !props.plan.canApply}>{props.fix.busy ? "…" : props.fix.applySay}</button>
      </div>
    </div>
  );
}

function Attention(props) {
  return (
    <div class={`card ws-attention${props.model.count ? "" : " calm"}`}>
      <h3>{props.model.title} <span class={`tag${props.model.count ? " bad" : " good"}`}>{props.model.count || "ok"}</span>
        <Show when={props.model.fixAll}><button class="ghost ws-plus ws-fix-all" data-fix="all">{props.model.fixAll}</button></Show></h3>
      <Show when={props.model.line}><div class="line">{props.model.line}</div></Show>
      <Show when={props.model.said}><p class="line ws-said">{props.model.said}</p></Show>
      <Show when={props.model.fix?.plan} fallback={
        <Show when={props.model.fix?.error && !props.model.fix?.plan}><p class="field-err">{props.model.fix.error}</p></Show>
      }>
        <FixPreview plan={props.model.fix.plan} fix={props.model.fix} />
      </Show>
      <Show when={props.model.rows.length && !props.model.fix?.plan}>
        <div class="ws-rows">
          <For each={props.model.rows}>{(r) => (
            <div class={`ws-row${r.live ? " live" : ""}`}>
              <span class="type">{r.type}</span>
              <span class="say">{r.say}</span>
              <button class="ws-fix" data-fix={r.what} data-name={r.name} data-scope={r.scope || ""} disabled={props.model.fix?.busy}>{props.model.fix?.busy && props.model.fix.what === r.what && (props.model.fix.name || "") === r.name ? "…" : r.act}</button>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  );
}

function Preview(props) {
  return (
    <>
      <div class="head"><b>{props.plan.head}</b><span class="sum">{props.plan.sum}</span></div>
      <div class="ws-files">
        <For each={props.plan.files}>{(f) => (
          <>
            <div class={`ws-file ${f.shape}`}><span class="verdict">{f.verdict}</span><span class="name">{f.file}</span><span class="say">{f.say}</span></div>
            <Show when={f.excerpt}><pre class="ws-excerpt">{f.excerpt}</pre></Show>
            <Show when={f.missing}><span class="miss">{f.missing}</span></Show>
            <Show when={f.choices.length}>
              <div class="ws-choice">{f.ask}
                <For each={f.choices}>{(c) => <button class={c.on ? "on" : ""} data-block={c.key} data-file={f.file}>{c.say}</button>}</For>
              </div>
            </Show>
          </>
        )}</For>
      </div>
      <p class="sub">{props.plan.note}</p>
      <Show when={props.add.error}><p class="field-err">{props.add.error}</p></Show>
      <div class="acts">
        <button class="ghost" id="ws-add-back">{props.add.backSay}</button>
        <button class="btn" id="ws-add-apply" disabled={props.add.busy || !props.plan.canApply}>{props.add.busy ? "…" : props.add.applySay}</button>
      </div>
    </>
  );
}

function Field(props) {
  return (
    <>
      <label for={props.id}>{props.label}</label>
      <input id={props.id} spellcheck="false" autocomplete="off" placeholder={props.placeholder} attr:value={props.value} disabled={props.busy} data-field={props.field} />
    </>
  );
}

function AddItem(props) {
  return (
    <div class="ws-add">
      <Show when={props.add.plan} fallback={
        <>
          <Show when={props.add.kinds}>
            <div class="ws-choice">
              <For each={props.add.kinds}>{(k) => <button class={k.on ? "on" : ""} data-kind={k.key}>{k.say}</button>}</For>
            </div>
          </Show>
          <For each={props.add.fields}>{(f) => <Field id={f.id} field={f.field} label={f.label} placeholder={f.placeholder} value={f.value} busy={props.add.busy} />}</For>
          <p class="sub">{props.add.note}</p>
          <Show when={props.add.error}><p class="field-err">{props.add.error}</p></Show>
          <div class="acts">
            <button class="ghost" id="ws-add-cancel">{props.add.cancelSay}</button>
            <button class="btn" id="ws-add-plan" disabled={props.add.busy}>{props.add.busy ? "…" : props.add.planSay}</button>
          </div>
        </>
      }>
        <Preview plan={props.add.plan} add={props.add} />
      </Show>
    </div>
  );
}

function AddRepo(props) {
  return (
    <div class="ws-add">
      <Show when={props.add.plan} fallback={
        <>
          <label for="ws-repo-in">{props.add.label}</label>
          <input id="ws-repo-in" spellcheck="false" autocomplete="off" placeholder={props.add.placeholder} attr:value={props.add.typed} disabled={props.add.busy} />
          <Show when={props.add.where}><div class="line">{props.add.where}</div></Show>
          <p class="sub">{props.add.note}</p>
          <Show when={props.add.error}><p class="field-err">{props.add.error}</p></Show>
          <div class="acts">
            <button class="ghost" id="ws-add-cancel">{props.add.cancelSay}</button>
            <button class="btn" id="ws-add-plan" disabled={props.add.busy}>{props.add.busy ? "…" : props.add.planSay}</button>
          </div>
        </>
      }>
        <Preview plan={props.add.plan} add={props.add} />
      </Show>
    </div>
  );
}

function Top(props) {
  return (
    <div class="pod-top">
      <h2>{props.top.title}</h2>
      <span class="when">{props.top.hub}</span>
      <span class="top-acts">
        <button class="btn" id="ws-refresh">{props.top.refresh}</button>
        <button class="ghost" id="ws-close">{props.top.closeSay} <kbd>esc</kbd></button>
      </span>
    </div>
  );
}

function Workspace(props) {
  return (
    <Show when={props.model.top} fallback={
      <>
        <div class="pod-top"><h2>{props.model.title}</h2></div>
        <p class="sub">{props.model.note}</p>
      </>
    }>
      <Top top={props.model.top} />
      <Show when={props.model.state === "none"}>
        <p class="sub">{props.model.said}</p>
        <div class="card"><h3>{props.model.reposTitle} <span class="tag">{props.model.reposCount}</span></h3>
          <Repos repos={props.model.repos} /></div>
      </Show>
      <Show when={props.model.state === "unreadable"}>
        <div class="card"><h3>{props.model.brokeTitle}</h3>
          <div class="line">{props.model.path}</div>
          <p class="sub">{props.model.said}</p></div>
        <div class="card"><h3>{props.model.reposTitle} <span class="tag">{props.model.reposCount}</span></h3>
          <Repos repos={props.model.repos} /></div>
      </Show>
      <Show when={props.model.state === "read"}>
        <div class="pod-hero">
          <span class="dot"></span>
          <div><b>{props.model.name}</b><div class="sub">{props.model.path}</div></div>
        </div>
        <Show when={props.model.attention}><Attention model={props.model.attention} /></Show>
        <Show when={props.model.issues.length}>
          <div class="card"><h3>{props.model.issuesTitle} <span class="tag">{props.model.issues.length}</span></h3>
            <For each={props.model.issues}>{(i) => <div class="line"><code>{i.path}</code> — {i.message}</div>}</For></div>
        </Show>
        <div class="card"><h3>{props.model.reposTitle} <span class="tag">{props.model.declared}</span>
            <Show when={!props.model.add}><button class="ghost ws-plus" id="ws-add">{props.model.addSay}</button></Show></h3>
          <div class="line">{props.model.counts}</div>
          <Show when={props.model.add?.what === "repo"}><AddRepo add={props.model.add} /></Show>
          <Repos repos={props.model.repos} more={props.model.reposMore} /></div>
        <div class="ws-pair">
        <div class="card"><h3>{props.model.skillsTitle} <span class="tag">{props.model.skillsCount}</span>
            <Show when={!props.model.add}><button class="ghost ws-plus" id="ws-add-skill">{props.model.addSay}</button></Show></h3>
          <div class="line">{props.model.skillsLine}</div>
          <Show when={props.model.add?.what === "skill"}><AddItem add={props.model.add} /></Show>
          <Show when={props.model.addSaid}><p class="line ws-said">{props.model.addSaid}</p></Show>
          <Chips items={props.model.skills} more={props.model.skillsMore} kind="skills" empty={props.model.noneDeclared} />
          <p class="sub">{props.model.skillsLegend}</p></div>
        <div class="card"><h3>{props.model.mcpsTitle} <span class="tag">{props.model.mcpsCount}</span>
            <Show when={!props.model.add}><button class="ghost ws-plus" id="ws-add-mcp">{props.model.addSay}</button></Show></h3>
          <div class="line">{props.model.mcpsLine}</div>
          <Show when={props.model.add?.what === "mcp"}><AddItem add={props.model.add} /></Show>
          <Show when={props.model.mcpSaid}><p class="line ws-said">{props.model.mcpSaid}</p></Show>
          <Chips items={props.model.mcps} more={props.model.mcpsMore} kind="mcps" empty={props.model.noneDeclared} />
          <p class="sub" innerHTML={props.model.legend} /></div>
        </div>
      </Show>
    </Show>
  );
}

export function mountWorkspace(host) {
  return mountView(host, Workspace, { top: null, title: "", note: "" }, {}, { lazy: true });
}
