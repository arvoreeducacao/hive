import { mkdirSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

const RC_BASH = `[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
__hive_rc_dir="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
if command -v starship >/dev/null 2>&1; then
  export STARSHIP_CONFIG="$__hive_rc_dir/starship.toml"
  eval "$(starship init bash)"
else
  __hive_prompt() {
    local status=$?
    if declare -F _direnv_hook >/dev/null 2>&1; then _direnv_hook; fi
    local branch=""
    branch=$(git branch --show-current 2>/dev/null)
    [ -n "$branch" ] && branch=" on $branch"
    PS1="\\[\\033[35m\\]hive\\[\\033[0m\\] \\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\[\\033[32m\\]\${branch}\\[\\033[0m\\] \\$ "
    return $status
  }
  PROMPT_COMMAND=__hive_prompt
fi
unset __hive_rc_dir
`;

const RC_ZSH = `[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"
if command -v starship >/dev/null 2>&1; then
  export STARSHIP_CONFIG="$ZDOTDIR/../starship.toml"
  eval "$(starship init zsh)"
else
  __hive_prompt() {
    local branch=$(git branch --show-current 2>/dev/null)
    [ -n "$branch" ] && branch=" on $branch"
    PROMPT="%F{magenta}hive%f %F{blue}%~%f%F{green}\${branch}%f %# "
  }
  precmd_functions+=(__hive_prompt)
fi
`;

const ZPROFILE = `[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"
`;

const STARSHIP_TOML = `format = "\${custom.hive}$directory$git_branch$git_status$nodejs$cmd_duration$line_break$character"
add_newline = true

[custom.hive]
command = "printf hive"
when = true
format = "[ $output ](bold purple)"

[directory]
style = "bold cyan"
truncation_length = 4
truncate_to_repo = true
format = "[$path]($style)[$read_only]($read_only_style) "

[git_branch]
style = "bold green"
format = "on [$symbol$branch]($style) "

[nodejs]
format = "via [$symbol$version]($style) "

[cmd_duration]
min_time = 500
format = "took [$duration]($style) "

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
`;

export function hiveShellRcDir(stateDir) {
  return join(stateDir, "shell");
}

export function writeHiveShellRc(stateDir, { mkdir = mkdirSync, write = writeFileSync } = {}) {
  const dir = hiveShellRcDir(stateDir);
  const zdot = join(dir, "zsh");
  mkdir(zdot, { recursive: true });
  write(join(dir, "rc.bash"), RC_BASH);
  write(join(dir, "starship.toml"), STARSHIP_TOML);
  write(join(zdot, ".zshrc"), RC_ZSH);
  write(join(zdot, ".zprofile"), ZPROFILE);
  return dir;
}

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const quote = (word) => {
  const one = String(word);
  return SAFE_WORD.test(one) ? one : `'${one.replace(/'/g, "'\\''")}'`;
};

/* the line runs in a POSIX shell wherever it was built, so its paths are spelled
   with / even when the machine that writes the script is a Windows runner */
export function hiveShellExec(shell, stateDir) {
  const name = String(shell || "bash").split("/").pop();
  const bin = quote(shell || "bash");
  const dir = stateDir ? posix.join(String(stateDir).replace(/\\/g, "/"), "shell") : "";
  if (!dir) return `exec ${bin} -l`;
  if (name === "zsh") {
    const zdot = quote(posix.join(dir, "zsh"));
    return `[ -d ${zdot} ] && ZDOTDIR=${zdot} exec ${bin} -l || exec ${bin} -l`;
  }
  if (name === "bash") {
    const rc = quote(posix.join(dir, "rc.bash"));
    return `[ -f ${rc} ] && exec bash --rcfile ${rc} -i || exec ${bin} -l`;
  }
  return `exec ${bin} -l`;
}
