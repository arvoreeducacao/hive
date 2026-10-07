import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function FacePicker(props) {
  return (
    <For each={props.rows}>{(row) => (
      <div>
        <p class="cap">{row.cap}</p>
        <div class="opts">
          <For each={row.opts}>{(opt) => (
            <button
              type="button"
              class="opt"
              classList={{ taken: opt.taken }}
              data-w="face-set"
              data-part={row.part}
              data-value={opt.value}
              title={opt.title}
              aria-pressed={String(opt.worn)}
              attr:aria-disabled={opt.taken ? "true" : undefined}
              innerHTML={opt.svg}
            ></button>
          )}</For>
        </div>
      </div>
    )}</For>
  );
}

function Picker(props) {
  return <FacePicker rows={props.model.rows} />;
}

function Gate(props) {
  return (
    <Show when={props.model.rows.length}>
      <div class="fg-page">
        <span class="fg-mug av-alive" innerHTML={props.model.mug}></span>
        <div class="fg-say">
          <h2>{props.model.head}</h2>
          <p>{props.model.say}</p>
        </div>
        <div class="fg-pick facepick"><FacePicker rows={props.model.rows} /></div>
        <div class="fg-act">
          <button type="button" class="btn go" data-fg="keep">{props.model.keep}</button>
          <button type="button" class="btn" data-fg="roll">{props.model.roll}</button>
        </div>
        <Show when={props.model.bad}><p class="fg-bad">{props.model.bad}</p></Show>
      </div>
    </Show>
  );
}

function FaceSheet(props) {
  return (
    <Show when={props.model.rows.length}>
      <div class="fs-top">
        <span class="fs-mug av-alive" innerHTML={props.model.mug}></span>
        <div class="fs-say"><b>{props.model.head}</b><span>{props.model.say}</span></div>
      </div>
      <div class="facepick"><FacePicker rows={props.model.rows} /></div>
      <div class="fs-act">
        <button type="button" data-fs="roll">{props.model.roll}</button>
        <button type="button" data-fs="strip">{props.model.strip}</button>
        <button type="button" class="go" data-fs="done">{props.model.done}</button>
      </div>
    </Show>
  );
}

export function mountFacePicker(host) {
  return mountView(host, Picker, { rows: [] });
}

export function mountGate(host) {
  return mountView(host, Gate, { rows: [], mug: "", head: "", say: "", keep: "", roll: "", bad: "" });
}

export function mountFaceSheet(host) {
  return mountView(host, FaceSheet, { rows: [], mug: "", head: "", say: "", roll: "", strip: "", done: "" });
}
