import { For } from "solid-js";
import { mountView } from "../view.jsx";

function Options(props) {
  return <For each={props.model.options}>{(one) => <option value={one.value}>{one.label}</option>}</For>;
}

export function mountOptions(host) {
  return mountView(host, Options, { options: [] });
}
