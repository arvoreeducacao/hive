const keepers = [];

function keepTerminalKeys(keeps) {
  if (!keepers.includes(keeps)) keepers.push(keeps);
}

const terminalKeepsKey = (event, action = "") => keepers.some((keeps) => keeps(event, action) === true);

function terminalNavKey(event, { mac }) {
  if (event.type !== "keydown" || event.altKey) return "";
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
    if (event.code === "PageUp") return "page-up";
    if (event.code === "PageDown") return "page-down";
  }
  if (mod && event.shiftKey && event.code === "Home") return "top";
  if (mod && event.shiftKey && event.code === "End") return "bottom";
  const selectAllShift = !mac;
  if (mod && event.code === "KeyA" && event.shiftKey === selectAllShift) return "select-all";
  return "";
}

export { keepTerminalKeys, terminalKeepsKey, terminalNavKey };
