import mermaid from "mermaid";

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

let theme = "";
let line = Promise.resolve();
let made = 0;

export function renderDiagram(source, dark) {
  const turn = line.then(async () => {
    const wanted = dark ? "dark" : "neutral";
    if (theme !== wanted) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: wanted, fontFamily: FONT, themeVariables: { fontFamily: FONT, fontSize: "13px" } });
      theme = wanted;
    }
    const id = `md-mermaid-${++made}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  line = turn.catch(() => {});
  return turn;
}
