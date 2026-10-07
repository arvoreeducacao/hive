function commandTray(onChange) {
  let held = "";
  return {
    name: () => held,
    count: () => (held ? 1 : 0),
    set(name) {
      const next = String(name || "");
      if (next === held) return;
      held = next;
      onChange();
    },
    clear() {
      if (!held) return;
      held = "";
      onChange();
    }
  };
}

export { commandTray };
