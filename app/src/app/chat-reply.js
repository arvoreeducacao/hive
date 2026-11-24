import { phrase } from "./core.js";
import { svRunText } from "./structured-seats.js";

const takesMessage = (e) => !!e?.quotes && !(e.mirror && e.host?.classList.contains("sv-cold"));

function replyTo(e, answer) {
  if (!takesMessage(e)) return false;
  const said = svRunText(answer).trim();
  if (!said) return false;
  e.quotes.add(said, phrase("what it answered"));
  e.host.querySelector(".sv-composer textarea")?.focus();
  return true;
}

function paintReplyButton(e, answer) {
  const stamp = answer?.querySelector(":scope > .sv-stamp");
  if (!stamp) return;
  let button = stamp.querySelector(":scope > .st-reply");
  if (!answer.classList.contains("sv-msg") || !answer.textContent.trim()) return void button?.remove();
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "st-reply";
    button.title = phrase("Reply");
    button.setAttribute("aria-label", phrase("Reply to this response"));
    button.innerHTML = `<svg aria-hidden="true"><use href="#i-reply"/></svg>`;
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      replyTo(e, answer);
    });
    stamp.append(button);
  }
  button.disabled = !takesMessage(e);
}

export { paintReplyButton, replyTo, takesMessage };
