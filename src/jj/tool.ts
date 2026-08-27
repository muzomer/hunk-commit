import { TOOL_NAME } from "./names";

/**
 * The `jj` side of the handshake: a throwaway merge tool, described in a
 * throwaway config file.
 *
 * `jj` substitutes `$left` and `$right` into a tool's `edit-args` when it
 * invokes it, which is the only channel through which anything learns where
 * the two directories are. Defining the tool in a `--config-file` rather than
 * the user's config keeps it scoped to the single command that uses it.
 */

/** Escape a string for a TOML basic string. */
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Render the merge-tool definition that points `jj` at the helper script. */
export function renderToolConfig(scriptPath: string, stageRoot: string): string {
  const args = ["$left", "$right", stageRoot].map(tomlString).join(", ");

  return [
    `[merge-tools.${TOOL_NAME}]`,
    `program = "sh"`,
    `edit-args = [${tomlString(scriptPath)}, ${args}]`,
    "",
  ].join("\n");
}

export class InvalidRevisionError extends Error {
  constructor(revision: string) {
    super(`${JSON.stringify(revision)} is not usable as a revision.`);
    this.name = "InvalidRevisionError";
  }
}

/**
 * Reject a revision that `jj` would read as an option rather than a revset.
 *
 * Arguments are passed as a list, never through a shell, so the only way a
 * revision can mean something other than a revision is by starting with a
 * dash. The target can come from a repository's own Hunk config, which the
 * extension API documents as untrusted, so it is checked rather than trusted.
 * Everything else a revset may contain is left alone — `jj` is the authority
 * on revset syntax, and it reports its own errors better than a guess here
 * would.
 */
export function assertUsableRevision(revision: string): void {
  if (revision === "" || revision.startsWith("-") || /[\n\r\0]/.test(revision)) {
    throw new InvalidRevisionError(revision);
  }
}

/** Build the `jj squash` invocation that moves the staged selection. */
export function buildSquashArgs(options: { configPath: string; into: string }): string[] {
  assertUsableRevision(options.into);

  return [
    "--config-file",
    options.configPath,
    "squash",
    "--interactive",
    "--tool",
    TOOL_NAME,
    "--into",
    options.into,
  ];
}
