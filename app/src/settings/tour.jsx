import { Show } from "solid-js";
import { mountView } from "../view.jsx";

function TourPop(props) {
  return (
    <Show when={props.model.count}>
      <div class="n">{props.model.count}</div>
      <h4>{props.model.title}</h4>
      <p>{props.model.text}</p>
      <div class="ask">
        <Show when={props.model.thanks} fallback={
          <>
            <span>{props.model.asking}</span>
            <button data-helpful="yes" aria-label={props.model.yes}><svg aria-hidden="true"><use href="#i-thumb-up" /></svg></button>
            <button data-helpful="no" aria-label={props.model.no}><svg aria-hidden="true"><use href="#i-thumb-down" /></svg></button>
          </>
        }>
          <span class="thanks">{props.model.thanks}</span>
        </Show>
      </div>
      <div class="row">
        <Show when={props.model.back}><button class="btn" data-tour="back">{props.model.back}</button></Show>
        <button class="skip" data-tour="end">{props.model.skip}</button>
        <button class="go" data-tour="next">{props.model.next}</button>
      </div>
    </Show>
  );
}

export function mountTourPop(host) {
  return mountView(host, TourPop, { count: "", title: "", text: "", thanks: "", asking: "", yes: "", no: "", back: "", skip: "", next: "" });
}
