import { createMemo } from "solid-js";

export function Raw(props) {
  return createMemo(() => {
    const box = document.createElement("template");
    box.innerHTML = props.html || "";
    return [...box.content.childNodes];
  });
}
