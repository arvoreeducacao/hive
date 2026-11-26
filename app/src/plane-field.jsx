import { For, Show, createEffect, createRenderEffect, createRoot, on } from "solid-js";
import { insert } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import { mountView } from "./view.jsx";

const boxStyle = (one) => ({ left: `${one.x}px`, top: `${one.y}px`, width: `${one.w}px`, height: `${one.h}px` });

function PlaneArea(props) {
  let name;
  const area = () => props.area;
  const box = (
    <div class="parea" classList={{ picked: area().picked, holding: area().holding }} data-thing={area().id} style={boxStyle(area())}>
      <div
        class="pa-name"
        ref={name}
        spellcheck="false"
        data-empty={area().emptySay}
        title={area().nameTitle}
        on:blur={() => {
          name.contentEditable = "false";
          props.actions.nameArea(area().id, name.textContent);
        }}
        on:dblclick={(ev) => {
          ev.stopPropagation();
          name.contentEditable = "plaintext-only";
          name.focus();
          getSelection()?.selectAllChildren(name);
        }}
        on:keydown={(ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); name.blur(); }
          if (ev.key === "Escape") { name.textContent = area().name; name.blur(); }
          ev.stopPropagation();
        }}
      ></div>
      <span class="pa-grip" title={area().gripSay}></span>
    </div>
  );
  createRenderEffect(() => {
    const said = area().name;
    if (document.activeElement !== name && name.textContent !== said) name.textContent = said;
  });
  createEffect(on(() => area().write, (asked) => {
    if (!asked) return;
    name.contentEditable = "plaintext-only";
    name.focus();
    if (area().selectAll) getSelection()?.selectAllChildren(name);
  }));
  return box;
}

function PlaneNote(props) {
  let body;
  const note = () => props.note;
  const box = (
    <div class="pnote" classList={{ picked: note().picked, holding: note().holding }} data-thing={note().id} data-tint={note().tint} style={boxStyle(note())}>
      <div
        class="pn-body"
        ref={body}
        spellcheck="false"
        data-empty={note().emptySay}
        on:blur={() => {
          body.contentEditable = "false";
          props.actions.writeNote(note().id, body.innerText);
        }}
        on:dblclick={(ev) => {
          ev.stopPropagation();
          body.contentEditable = "plaintext-only";
          body.focus();
        }}
        on:keydown={(ev) => {
          ev.stopPropagation();
          if (ev.key === "Escape") { ev.preventDefault(); body.blur(); }
        }}
      ></div>
      <span class="pa-grip" title={note().gripSay}></span>
    </div>
  );
  createRenderEffect(() => {
    const said = note().text;
    if (document.activeElement !== body && body.innerText !== said) body.innerText = said;
  });
  createEffect(on(() => note().write, (asked) => {
    if (!asked) return;
    body.contentEditable = "plaintext-only";
    body.focus();
  }));
  return box;
}

export function mountPlaneThings(plane, world, actions) {
  const [model, setModel] = createStore({ key: "plane-things", armed: "", areas: [], notes: [], draw: null });
  const wires = world.querySelector("#plane-wires");
  let stop = null;
  const draw = () => createRoot((dispose) => {
    createRenderEffect(() => { plane.classList.toggle("drawing", !!model.armed); });
    insert(world, () => <For each={model.areas}>{(area) => <PlaneArea area={area} actions={actions} />}</For>, wires);
    insert(world, () => (
      <>
        <For each={model.notes}>{(note) => <PlaneNote note={note} actions={actions} />}</For>
        <Show when={model.draw}>{(drawn) => <div class="pdraw" style={boxStyle(drawn())}></div>}</Show>
      </>
    ), null);
    return dispose;
  });
  return {
    show(next) {
      setModel(reconcile(next, { key: "key" }));
      stop ||= draw();
    },
    place(id, box) {
      setModel("areas", (one) => one.id === id, box);
      setModel("notes", (one) => one.id === id, box);
    },
    drawAt(box) {
      if (model.draw) setModel("draw", box);
    },
    dispose() {
      stop?.();
      stop = null;
    }
  };
}

function PlaneHud(props) {
  const hud = () => props.model;
  return (
    <>
      <button id="plane-out" aria-label="zoom out" onClick={() => props.actions.zoom(0.8)}>−</button>
      <span class="k" id="plane-k">{hud().k}</span>
      <button id="plane-in" aria-label="zoom in" onClick={() => props.actions.zoom(1.25)}>+</button>
      <button id="plane-fit" onClick={() => props.actions.fit()}>{hud().fit}</button>
      <button id="plane-tidy" onClick={() => props.actions.tidy()}>{hud().tidy}</button>
      <button id="plane-area" classList={{ armed: hud().armed === "area" }} onClick={() => props.actions.arm("area")}>{hud().area}</button>
      <button id="plane-note" classList={{ armed: hud().armed === "note" }} onClick={() => props.actions.arm("note")}>{hud().note}</button>
      <span class="sep"></span>
      <button id="plane-undo" disabled={!hud().canUndo} onClick={() => props.actions.undo()}>
        {hud().undo}<Show when={hud().undoKey}><span class="rc-key">{hud().undoKey}</span></Show>
      </button>
    </>
  );
}

export function mountPlaneHud(host, actions) {
  return mountView(host, PlaneHud, { key: "plane-hud", k: "100%", fit: "fit", tidy: "tidy", area: "+ area", note: "+ note", undo: "undo", undoKey: "", armed: "", canUndo: false }, { actions });
}

function PlaneEmpty(props) {
  const empty = () => props.model;
  createRenderEffect(() => { props.host.hidden = !empty().shown; });
  return (
    <Show when={empty().said}>
      <Show when={empty().raycast} fallback={<><b>{empty().title}</b><span>{empty().say}</span></>}>
        <span class="pe-icon"><svg aria-hidden="true"><use href="#i-grid" /></svg></span>
        <b>{empty().title}</b>
        <span>{empty().say}</span>
        <span class="pe-acts">
          <button type="button" class="pe-new" onClick={(ev) => props.actions.newChat(ev)}>{empty().newSay}<span class="rc-key">{empty().newKey}</span></button>
          <button type="button" class="pe-back" onClick={() => props.actions.back()}>{empty().backSay}<span class="rc-key">esc</span></button>
        </span>
      </Show>
    </Show>
  );
}

export function mountPlaneEmpty(host, actions) {
  return mountView(host, PlaneEmpty, { key: "plane-empty", shown: false, said: false, raycast: false, title: "", say: "", newSay: "", newKey: "", backSay: "" }, { actions, host });
}

function PlaneSaid(props) {
  const said = () => props.model;
  createRenderEffect(() => { props.host.hidden = !said().shown; });
  return (
    <>
      <b>{said().text}</b>
      <Show when={said().undoable}><button onClick={() => props.actions.undo()}>{said().undoSay}</button></Show>
    </>
  );
}

export function mountPlaneSaid(host, actions) {
  return mountView(host, PlaneSaid, { key: "plane-said", shown: false, text: "", undoable: false, undoSay: "" }, { actions, host });
}

function PlaneTop(props) {
  const top = () => props.model;
  return (
    <Show when={top().raycast}>
      <div id="plane-top" data-no-t>
        <span class="pt-name"><svg aria-hidden="true"><use href="#i-grid" /></svg><b id="plane-title">{top().title}</b><span id="plane-count">{top().count}</span></span>
        <button id="plane-back" type="button" onClick={() => props.actions.back()}><span class="rc-key">esc</span>{top().backSay}<span class="rc-key">{top().backKey}</span></button>
      </div>
    </Show>
  );
}

export function mountPlaneTop(plane, before, actions) {
  const [model, setModel] = createStore({ key: "plane-top", raycast: false, title: "", count: "", backSay: "", backKey: "" });
  const stop = createRoot((dispose) => {
    insert(plane, () => <PlaneTop model={model} actions={actions} />, before);
    return dispose;
  });
  return {
    show(next) { setModel(reconcile(next, { key: "key" })); },
    dispose: stop
  };
}
