export const PIN_SHIM_MARK = "data-hive-shelf-pins";
export const PIN_CHANNEL = "hive-shelf";

export const PIN_SHIM = String.raw`(function () {
  if (window.parent === window) return;
  var CHANNEL = "hive-shelf";
  var pins = [];
  var pinning = false;
  var style = document.createElement("style");
  style.textContent = ".hv-pin{position:absolute;z-index:2147483000;box-sizing:border-box;width:24px;height:24px;margin:-24px 0 0 -3px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#CD694A;border:2px solid #FFFDF9;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;display:grid;place-items:center;font:700 10px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#FFFDF9;pointer-events:auto}.hv-pin>i{transform:rotate(45deg);font-style:normal}.hv-pin[data-done=yes]{background:#7A756C}.hv-pin[data-hot=yes]{outline:4px solid rgba(205,105,74,.45);outline-offset:2px}html[data-hive-pinning],html[data-hive-pinning] *{cursor:crosshair!important}";
  document.documentElement.appendChild(style);

  function tell(message) {
    message.hive = CHANNEL;
    try { window.parent.postMessage(message, "*"); } catch (err) {}
  }
  function frames() {
    return Array.prototype.slice.call(document.querySelectorAll(".frame[id]"));
  }
  function nameOf(frame) {
    var label = frame.querySelector(".frame-label");
    return frame.getAttribute("data-name") || (label ? label.textContent.trim() : "") || frame.id;
  }
  function hostOf(pin) {
    return pin.frame ? document.getElementById(pin.frame) : document.body;
  }
  function draw() {
    Array.prototype.forEach.call(document.querySelectorAll(".hv-pin"), function (old) { old.parentNode.removeChild(old); });
    pins.forEach(function (pin) {
      var host = hostOf(pin);
      if (!host) return;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      var mark = document.createElement("button");
      mark.className = "hv-pin";
      mark.type = "button";
      mark.setAttribute("data-id", pin.id);
      mark.setAttribute("data-done", pin.done ? "yes" : "no");
      mark.setAttribute("aria-label", "comment " + pin.n);
      mark.style.left = (pin.x * 100) + "%";
      mark.style.top = (pin.y * 100) + "%";
      var n = document.createElement("i");
      n.textContent = String(pin.n);
      mark.appendChild(n);
      mark.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        tell({ type: "open", id: pin.id });
      });
      host.appendChild(mark);
    });
  }
  function flash(id) {
    var mark = document.querySelector('.hv-pin[data-id="' + id + '"]');
    if (!mark) return;
    mark.setAttribute("data-hot", "yes");
    setTimeout(function () { mark.removeAttribute("data-hot"); }, 1800);
  }
  function goTo(id) {
    var pin = pins.filter(function (one) { return one.id === id; })[0];
    if (!pin) return;
    var host = hostOf(pin);
    if (!host) return;
    var label = pin.frame ? document.querySelector('.frame-label[data-goto="' + pin.frame + '"]') : null;
    if (label) label.click();
    else if (host !== document.body) host.scrollIntoView({ block: "center", inline: "center" });
    else window.scrollTo({ top: pin.y * document.documentElement.scrollHeight - window.innerHeight / 2 });
    flash(id);
  }
  function place(ev) {
    var target = ev.target && ev.target.nodeType === 1 ? ev.target : document.body;
    if (target.closest && target.closest(".hv-pin")) return;
    ev.preventDefault();
    ev.stopPropagation();
    var frame = target.closest ? target.closest(".frame[id]") : null;
    var host = frame || document.body;
    var box = host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    tell({
      type: "pin",
      frame: frame ? frame.id : "",
      name: frame ? nameOf(frame) : "",
      x: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height))
    });
    setPinning(false);
  }
  function swallow(ev) {
    if (ev.target && ev.target.closest && ev.target.closest(".hv-pin")) return;
    ev.stopPropagation();
  }
  function setPinning(on) {
    pinning = !!on;
    if (pinning) document.documentElement.setAttribute("data-hive-pinning", "yes");
    else document.documentElement.removeAttribute("data-hive-pinning");
  }
  window.addEventListener("click", function (ev) { if (pinning) place(ev); }, true);
  window.addEventListener("pointerdown", function (ev) { if (pinning) swallow(ev); }, true);
  window.addEventListener("mousedown", function (ev) { if (pinning) swallow(ev); }, true);
  window.addEventListener("message", function (ev) {
    var said = ev.data;
    if (!said || said.hive !== CHANNEL) return;
    if (said.type === "pins") { pins = Array.isArray(said.pins) ? said.pins : []; draw(); }
    else if (said.type === "pin-mode") setPinning(said.on);
    else if (said.type === "goto") goTo(String(said.id || ""));
  });
  tell({ type: "hello", frames: frames().map(function (frame) { return { id: frame.id, name: nameOf(frame) }; }) });
})();`;

export function withPinShim(html) {
  const page = String(html || "");
  if (page.includes(PIN_SHIM_MARK)) return page;
  const tag = `<script ${PIN_SHIM_MARK}>${PIN_SHIM}</script>`;
  const body = page.search(/<\/body\s*>/i);
  return body >= 0 ? `${page.slice(0, body)}${tag}${page.slice(body)}` : `${page}\n${tag}`;
}
