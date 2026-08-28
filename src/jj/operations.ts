import { renderDocument } from "../patch/document";
import type { FilePatch } from "../patch/parse";
import { keepOnlySelectedHunks } from "../patch/select";
import type { StagedEntry } from "../staging/backend";

/**
 * Turning dispositions into edits to the tree `jj` reads changes back from.
 *
 * `jj` hands a diff editor two directories: `$left` holds the target's current
 * content and `$right` holds everything the source revision changed. Whatever
 * `$right` contains when the editor exits is what moves. So `$right` already
 * describes "stage everything", and staging a subset means editing it down —
 * which is why a file that contributes *nothing* still needs an instruction.
 */
export type StageOperation =
  /** Replace the file's content, preserving the mode `$right` already has. */
  | { readonly kind: "write"; readonly path: string; readonly content: string }
  /** Remove the file, so a change that created it stays behind. */
  | { readonly kind: "delete"; readonly path: string }
  /** Copy the file back from `$left`, mode included. */
  | { readonly kind: "restore"; readonly path: string };

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
 * Every edit one checked entry implies.
 *
 * A partially marked rename keeps its new path: the rename travels with the
 * hunks that were marked, and the hunks that were not stay behind as edits to
 * the renamed file.
 */
export function operationsFor(entry: StagedEntry): StageOperation[] {
  if (entry.disposition.kind === "revert") {
    return revertOperations(entry.patch);
  }

  if (entry.disposition.kind === "leave" || !entry.document) {
    return [];
  }

  const rebuilt = keepOnlySelectedHunks(
    entry.document,
    entry.patch.hunks,
    entry.disposition.selected,
  );

  return [{ kind: "write", path: entry.patch.path, content: renderDocument(rebuilt) }];
}
