import type { FilePatch } from "../patch/parse";

/**
 * What the marks mean for one file, in terms every backend shares.
 *
 * Three answers cover everything, whether the destination is git's index or a
 * Jujutsu revision: all of this file goes, none of it goes, or some of it does
 * and the file has to be rebuilt from the marks.
 */
export type FileDisposition =
  /** Everything this file changed moves, exactly as it stands. */
  | { readonly kind: "leave" }
  /** Nothing this file changed moves. */
  | { readonly kind: "revert" }
  /** Part of it moves, named by the hunks that were marked. */
  | { readonly kind: "rebuild"; readonly selected: ReadonlySet<number> };

/** What the reviewer marked on one file. */
export type FileMark =
  /** The whole file, including one Hunk cannot show as hunks (binary, too large). */
  | { readonly kind: "whole" }
  | { readonly kind: "hunks"; readonly hunks: ReadonlySet<number> };

/** Decide what happens to one reviewed file. */
export function disposeFile(patch: FilePatch, mark: FileMark | undefined): FileDisposition {
  if (mark?.kind === "whole") {
    return { kind: "leave" };
  }

  const selected = mark?.kind === "hunks" ? mark.hunks : new Set<number>();
  if (selected.size === 0) {
    return { kind: "revert" };
  }

  // A file whose every hunk is marked needs no rebuilding, and saying so keeps
  // binary and oversized files — which have no hunks to mark — out of the
  // rebuild path entirely.
  return selected.size === patch.hunks.length ? { kind: "leave" } : { kind: "rebuild", selected };
}

/**
 * True when staging must read this file and check it against the patch.
 *
 * Every file that contributes something needs the check, not just the ones
 * being rewritten: a file left alone stages whatever is on disk at staging
 * time, which is only what the reviewer saw if the working copy has not moved
 * since. A file that contributes nothing needs no check — leaving it behind is
 * correct however stale it is — and a file with no text hunks (binary,
 * oversized) has nothing to check against. Neither has a file the change
 * deletes: there is no new side left on disk to read.
 */
export function requiresWorkingCopyCheck(
  disposition: FileDisposition,
  patch: FilePatch,
): boolean {
  return disposition.kind !== "revert" && patch.hunks.length > 0 && patch.change !== "deleted";
}
