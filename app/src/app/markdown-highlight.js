import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import nginx from "highlight.js/lib/languages/nginx";
import protobuf from "highlight.js/lib/languages/protobuf";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("erlang", erlang);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerAliases(["hcl", "tf", "terraform", "toml", "env", "dotenv", "gitignore"], { languageName: "ini" });
hljs.registerAliases(["zsh", "fish", "console", "shellsession", "sh-session"], { languageName: "bash" });
hljs.registerAliases(["jsonc", "json5"], { languageName: "json" });
hljs.registerAliases(["vue", "svelte", "svg"], { languageName: "xml" });
hljs.registerAliases(["mjs", "cjs", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["tsx", "mts", "cts"], { languageName: "typescript" });
hljs.registerAliases(["heex", "eex", "exs"], { languageName: "elixir" });

export function highlightCode(code, lang) {
  const language = String(lang || "").toLowerCase();
  if (!hljs.getLanguage(language)) return null;
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
