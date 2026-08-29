import type { JjDestination } from "../jj/tool";
import type { ContextMarks } from "./highlights";

/**
 * The configured default destination for Jujutsu repositories.
 *
 * `"new"` extracts the marked hunks into a fresh revision, which rewrites
 * nothing that already exists. Anything else is read as a revset to squash
 * into, for the working style where `@` is scratch above the change being
 * built.
 */
export type TargetSetting = { kind: "new" } | { kind: "revision"; revset: string };

export const DEFAULT_TARGET: TargetSetting = { kind: "new" };

/**
 * Read the configured default target.
 *
 * Hunk layers this table user-first-then-repository, so the value can come
 * from the repository under review. It is treated as untrusted here — only the
 * shape is accepted at this point, and `assertUsableRevision` checks the
 * content before it reaches an argument list.
 */
export function readTargetSetting(
  config: Record<string, unknown>,
  log: (message: string) => void,
): TargetSetting {
  const configured = config.target;

  if (configured === undefined) {
    return DEFAULT_TARGET;
  }

  if (typeof configured !== "string" || configured.trim() === "") {
    log(
      `Ignoring [extension.hunk-commit] target: expected "new" or a revset, got ${typeof configured}`,
    );
    return DEFAULT_TARGET;
  }

  const revset = configured.trim();
  return revset === "new" ? { kind: "new" } : { kind: "revision", revset };
}

/** Turn a configured target into the destination a staging run uses. */
export function destinationFor(target: TargetSetting, message: string): JjDestination {
  return target.kind === "new" ? { kind: "new", message } : { kind: "revision", revset: target.revset };
}

const CONTEXT_MARKS: readonly ContextMarks[] = ["none", "edge", "full"];

export const DEFAULT_CONTEXT_MARKS: ContextMarks = "none";

/**
 * Read how much of a marked hunk's context lines should carry the mark.
 *
 * Taste rather than correctness, which is exactly why it is configurable: the
 * changed lines are marked either way.
 */
export function readContextMarksSetting(
  config: Record<string, unknown>,
  log: (message: string) => void,
): ContextMarks {
  const configured = config.context_marks;

  if (configured === undefined) {
    return DEFAULT_CONTEXT_MARKS;
  }

  if (typeof configured === "string" && (CONTEXT_MARKS as readonly string[]).includes(configured)) {
    return configured as ContextMarks;
  }

  log(
    `Ignoring [extension.hunk-commit] context_marks: expected ${CONTEXT_MARKS.join(", ")}, got ${JSON.stringify(configured)}`,
  );
  return DEFAULT_CONTEXT_MARKS;
}
