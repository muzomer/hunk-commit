import type { Document } from "../patch/document";
import { renderDocument } from "../patch/document";
import type { FilePatch } from "../patch/parse";
import { keepOnlySelectedHunks } from "../patch/select";

/**
 * Turning marks into instructions for the tree `jj` reads changes back from.
 *
 * `jj` hands a diff editor two directories: `$left` holds the target's current
 * content and `$right` holds everything the source revision changed. Whatever
 * `$right` contains when the editor exits is what moves. So `$right` already
 * describes "stage everything", and staging a subset means editing it down.
 *
 * Each file therefore needs one of three answers, and nothing else:
 */
export type FileDisposition =
  /** Everything this file changed moves. `$right` is already correct. */
  | { readonly kind: "leave" }
  /** Nothing this file changed moves. `$right` must be reset to `$left`. */
  | { readonly kind: "revert" }
  /** Part of this file moves. `$right` must be rewritten from the marks. */
  | { readonly kind: "rebuild"; readonly selected: ReadonlySet<number> };

/** What the reviewer marked on one file. */
export type FileMark =
  /** The whole file, including one Hunk cannot show as hunks (binary, too large). */
  | { readonly kind: "whole" }
  | { readonly kind: "hunks"; readonly hunks: ReadonlySet<number> };

/** One edit the helper script applies to `$right`. */
export type StageOperation =
  /** Replace the file's content, preserving the mode `$right` already has. */
  | { readonly kind: "write"; readonly path: string; readonly content: string }
  /** Remove the file, so a change that created it stays behind. */
  | { readonly kind: "delete"; readonly path: string }
  /** Copy the file back from `$left`, mode included. */
  | { readonly kind: "restore"; readonly path: string };

/** Decide what happens to one reviewed file. */
export function disposeFile(patch: FilePatch, mark: FileMark | undefined): FileDisposition {
  if (mark?.kind === "whole") {
    return { kind: "leave" };
  }

  const selected = mark?.kind === "hunks" ? mark.hunks : new Set<number>();
  if (selected.size === 0) {
    return { kind: "revert" };
  }

  // A file whose every hunk is marked needs no rewriting, and saying so keeps
  // binary and oversized files — which have no hunks to mark — out of the
  // rebuild path entirely.
  return selected.size === patch.hunks.length ? { kind: "leave" } : { kind: "rebuild", selected };
}

/**
 * Undo a file's whole contribution to the change.
 *
 * A rename is the one case needing two operations: its content sits at the new
 * path in `$right` and at the old path in `$left`, so leaving it behind means
 * removing one and restoring the other.
 */
export function revertOperations(patch: FilePatch): StageOperation[] {
  if (patch.change === "added") {
    return [{ kind: "delete", path: patch.path }];
  }

  if (patch.change === "renamed" && patch.previousPath !== undefined) {
    return [
      { kind: "delete", path: patch.path },
      { kind: "restore", path: patch.previousPath },
    ];
  }

  return [{ kind: "restore", path: patch.path }];
}

/**
 * Rewrite a partially marked file.
 *
 * A partially marked rename keeps its new path: the rename travels with the
 * hunks that were marked, and the hunks that were not stay behind as edits to
 * the renamed file.
 */
export function rebuildOperation(
  patch: FilePatch,
  document: Document,
  selected: ReadonlySet<number>,
): StageOperation {
  const rebuilt = keepOnlySelectedHunks(document, patch.hunks, selected);
  return { kind: "write", path: patch.path, content: renderDocument(rebuilt) };
}

/**
 * True when staging must read this file and check it against the patch.
 *
 * Every file that contributes something needs the check, not just the ones
 * being rewritten: a file left alone moves whatever `jj` snapshots at staging
 * time, which is only what the reviewer saw if the working copy has not moved
 * since. A file that contributes nothing is reverted wholesale and is correct
 * however stale it is, and a file with no text hunks (binary, oversized) has
 * nothing to check against. Neither has a file the change deletes: there is no
 * new side left on disk to read, and leaving a deletion alone is what `jj`
 * snapshots either way.
 */
export function requiresWorkingCopyCheck(
  disposition: FileDisposition,
  patch: FilePatch,
): boolean {
  return disposition.kind !== "revert" && patch.hunks.length > 0 && patch.change !== "deleted";
}
