import { children, createRenderEffect, onCleanup } from "solid-js";

export function Into(props) {
  const nodes = children(() => props.children);
  createRenderEffect(() => {
    const host = props.host;
    const placed = nodes.toArray().filter((node) => node instanceof Node);
    if (!host) return;
    host.append(...placed);
    onCleanup(() => { for (const node of placed) node.remove(); });
  });
  return null;
}
