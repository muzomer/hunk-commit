import type { ContextMarks } from "./highlights";

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
