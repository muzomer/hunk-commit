/** The revision staged hunks move into when the reviewer does not pick one. */
export const DEFAULT_TARGET = "@-";

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
): string {
  const configured = config.target;

  if (configured === undefined) {
    return DEFAULT_TARGET;
  }

  if (typeof configured !== "string" || configured.trim() === "") {
    log(`Ignoring [extension.hunk-stage] target: expected a revset string, got ${typeof configured}`);
    return DEFAULT_TARGET;
  }

  return configured.trim();
}
