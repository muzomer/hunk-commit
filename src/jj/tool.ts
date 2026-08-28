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

/**
 * Where marked hunks land in a Jujutsu repository.
 *
 * Jujutsu has no index, so there is no single obvious answer — and the two
 * that make sense correspond to jj's two working styles. Extracting into a new
 * revision is the `git add -p` shape: nothing that already exists is
 * rewritten, and the rest of the change stays in `@`. Squashing into an
 * existing revision suits the style where `@` is scratch space above the
 * change being built.
 */
export type JjDestination =
  | { readonly kind: "new"; readonly message: string }
  | { readonly kind: "revision"; readonly revset: string };

/** How a destination reads in a sentence. */
export function describeDestination(destination: JjDestination): string {
  return destination.kind === "new" ? "a new revision" : destination.revset;
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

/**
 * Build the `jj` invocation that moves the staged selection.
 *
 * Both commands drive the same diff editor over the same two directories, so
 * the selection this extension prepares means the same thing to either one —
 * only where the result lands differs.
 *
 * Values are attached with `=` rather than passed as separate arguments, so no
 * description or revset can be read as an option however it begins.
 */
export function buildStageArgs(options: {
  configPath: string;
  destination: JjDestination;
}): string[] {
  const common = ["--config-file", options.configPath];
  const tool = ["--interactive", "--tool", TOOL_NAME];

  if (options.destination.kind === "new") {
    // `--message` is what keeps jj from opening an editor for the description,
    // which would fight Hunk for the terminal.
    return [...common, "split", ...tool, `--message=${options.destination.message}`];
  }

  assertUsableRevision(options.destination.revset);
  return [...common, "squash", ...tool, `--into=${options.destination.revset}`];
}
