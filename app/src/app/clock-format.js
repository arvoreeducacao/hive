const TIME_FORMATS = ["system", "12h", "24h"];

let format = "system";

const chooseTimeFormat = (said) => {
  format = TIME_FORMATS.includes(said) ? said : "system";
  return format;
};

const timeFormatOf = () => format;

function clockOptions(options = {}) {
  if (format === "system") return options;
  const { hour12, hourCycle, ...rest } = options;
  return { ...rest, hourCycle: format === "12h" ? "h12" : "h23" };
}

const pad = (n) => String(n).padStart(2, "0");

function clockHM(date) {
  if (format !== "12h") return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hourCycle: "h12" });
}

export { TIME_FORMATS, chooseTimeFormat, clockHM, clockOptions, timeFormatOf };
