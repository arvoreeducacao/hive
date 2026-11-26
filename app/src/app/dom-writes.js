function putHidden(el, hidden) {
  if (el.hidden !== !!hidden) el.hidden = !!hidden;
}

function putAttr(el, name, value) {
  const want = String(value);
  if (el.getAttribute(name) !== want) el.setAttribute(name, want);
}

function putTitle(el, value) {
  if (el.title !== value) el.title = value;
}

function putData(el, key, value) {
  if (el.dataset[key] !== value) el.dataset[key] = value;
}

function putText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function putDisabled(el, disabled) {
  if (el.disabled !== !!disabled) el.disabled = !!disabled;
}

function dropClass(el, name) {
  if (el.classList.contains(name)) el.classList.remove(name);
}

export { dropClass, putAttr, putData, putDisabled, putHidden, putText, putTitle };
