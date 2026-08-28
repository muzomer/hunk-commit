import type { JjDestination } from "../jj/tool";

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
      `Ignoring [extension.hunk-stage] target: expected "new" or a revset, got ${typeof configured}`,
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
