export const TITLE_INSTRUCTIONS_CEILING = 2000;
export const TITLE_PROJECTS_CEILING = 60;
export const TITLE_PROJECT_NAME_CEILING = 100;

export const noTitleInstructions = () => ({ all: "", projects: {} });

const withoutTrailingSlash = (path) => String(path || "").replace(/\/+$/, "");

const holds = (tree, cwd) => {
  const root = withoutTrailingSlash(tree?.path);
  return !!root && !!cwd && (cwd === root || cwd.startsWith(`${root}/`));
};

export function projectOfChat(session) {
  if (!session) return "";
  const cwd = withoutTrailingSlash(session.cwd);
  const trees = Array.isArray(session.trees) ? session.trees.filter((one) => one?.repo) : [];
  const tree = trees.find((one) => holds(one, cwd)) || trees[0];
  return String(tree?.repo || cwd.split("/").filter(Boolean).pop() || "");
}

export function titleInstructionsFor(instructions, project = "") {
  const own = project ? String(instructions?.projects?.[project] || "").trim() : "";
  return own || String(instructions?.all || "").trim();
}
