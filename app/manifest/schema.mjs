
export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Workspace manifest",
  description:
    "Declares which skills and MCP servers apply to which repositories. It does not describe skills or MCP servers themselves — it only points at them.",
  type: "object",
  required: ["repos"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    repos: {
      description: "Repositories in the workspace, as org/name.",
      type: "array",
      items: { type: "string", pattern: "^[\\w.-]+/[\\w.-]+$" },
      uniqueItems: true,
    },
    skills: {
      description: "Skill name to the repositories it applies to.",
      type: "object",
      additionalProperties: { $ref: "#/definitions/scope" },
    },
    mcps: {
      description: "MCP server name to the repositories it is wired into.",
      type: "object",
      additionalProperties: { $ref: "#/definitions/scope" },
    },
    env: {
      description: "Repository to its env file, when it is not .env.",
      type: "object",
      additionalProperties: { type: "string" },
    },
    integrations: {
      type: "object",
      additionalProperties: false,
      properties: {
        branch: { type: "string", description: "Branch pattern, e.g. {task}-{slug}." },
        slack: { type: "string", description: "Slack channel id notified on delivery." },
      },
    },
  },
  definitions: {
    scope: {
      description:
        '"*" for every repository, one repository, a list, or {repo, path} to narrow it to a path.',
      oneOf: [
        { const: "*" },
        { $ref: "#/definitions/target" },
        { type: "array", items: { $ref: "#/definitions/target" }, minItems: 1 },
      ],
    },
    target: {
      oneOf: [
        { type: "string", minLength: 1, description: "Repository name." },
        {
          type: "object",
          required: ["repo", "path"],
          additionalProperties: false,
          properties: {
            repo: { type: "string" },
            path: { type: "string", description: "Glob relative to the repository root." },
          },
        },
      ],
    },
  },
};

/**
 * editor completar nome real em vez de texto livre. JSON Schema puro só expressa
 * isso como enum, por isso é construído e não escrito.
 *
 * @param {{ skills?: string[], mcps?: string[] }} available
 */
export function schemaWith(available) {
  const named = (names, base) =>
    names?.length ? { ...base, propertyNames: { enum: names } } : base;

  return {
    ...schema,
    properties: {
      ...schema.properties,
      skills: named(available.skills, schema.properties.skills),
      mcps: named(available.mcps, schema.properties.mcps),
    },
  };
}
