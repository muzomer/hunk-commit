import { parseDocument, renderDocument, type Document } from "../patch/document";
import type { FilePatch } from "../patch/parse";
import { keepOnlySelectedHunks } from "../patch/select";
import { checkReviewedFile, isRefusal, type ReviewedFile, type ReviewRefusal } from "../review/check";
import { countMarkedHunks } from "../staging/stage";
import type { FileMark } from "../staging/plan";

/**
 * Throwing marked hunks away instead of staging them.
 *
 * The arithmetic is the same one staging uses, run the other way round.
 * Staging keeps the marked hunks and reverts the rest; discarding reverts the
 * marked hunks and keeps the rest — which is `keepOnlySelectedHunks` called
 * with the complement of the marks, and no new patch logic at all.
 *
 * What is emphatically not the same is the consequence. Staging moves a change
 * between places that both still have it. Discarding deletes work that may
 * exist nowhere else: recoverable in Jujutsu, whose operation log has already
 * snapshotted the working copy by the time a review is on screen, and
 * unrecoverable in git, which keeps no record of uncommitted text. Callers are
 * expected to have said so, in those words, before calling this.
 */

/** One edit discarding makes to the working copy. */
export type DiscardEdit =
  | { readonly kind: "write"; readonly path: string; readonly content: string }
  | { readonly kind: "remove"; readonly path: string };

export interface DiscardRequest {
  readonly files: readonly ReviewedFile[];
  /** Marks by file id. Files absent from the map keep their changes. */
  readonly marks: ReadonlyMap<string, FileMark>;
}

export interface DiscardEnvironment {
  readWorkingCopyFile(path: string): Promise<string>;
  writeWorkingCopyFile(path: string, content: string): Promise<void>;
  removeWorkingCopyFile(path: string): Promise<void>;
}

export type DiscardOutcome =
  | { readonly kind: "discarded"; readonly files: number; readonly hunks: number }
  | ReviewRefusal
  /** Nothing is marked, so there is nothing to throw away. */
  | { readonly kind: "nothing-discarded" }
  /** A file whose change cannot be undone from the patch alone. */
  | { readonly kind: "unsupported"; readonly path: string; readonly detail: string };

/** The hunks a file keeps when the marked ones are thrown away. */
function keptHunks(patch: FilePatch, mark: FileMark | undefined): ReadonlySet<number> {
  const discarded =
    mark?.kind === "whole"
      ? new Set(patch.hunks.map((hunk) => hunk.index))
      : (mark?.hunks ?? new Set<number>());

  return new Set(patch.hunks.map((hunk) => hunk.index).filter((index) => !discarded.has(index)));
}

/**
 * The edits one file needs, or a reason it cannot be undone here.
 *
 * A file the change created disappears entirely when its whole change goes; a
 * file the change deleted comes back, rebuilt from the patch's own record of
 * what it held; and a rename walks backwards to the path it came from. Every
 * other file is simply rewritten.
 */
function editsFor(
  patch: FilePatch,
  document: Document,
  mark: FileMark | undefined,
): DiscardEdit[] | { detail: string } {
  if (patch.hunks.length === 0) {
    return {
      detail: "it has no text hunks, so the patch does not record what it held before",
    };
  }

  const kept = keptHunks(patch, mark);
  const rebuilt = renderDocument(keepOnlySelectedHunks(document, patch.hunks, kept));
  const discardedEverything = kept.size === 0;

  if (patch.change === "added" && discardedEverything) {
    return [{ kind: "remove", path: patch.path }];
  }

  if (patch.change === "renamed" && patch.previousPath !== undefined && discardedEverything) {
    return [
      { kind: "remove", path: patch.path },
      { kind: "write", path: patch.previousPath, content: rebuilt },
    ];
  }

  return [{ kind: "write", path: patch.path, content: rebuilt }];
}

/**
 * Throw the marked hunks away.
 *
 * Every file is checked before any file is written, so a refusal means the
 * working copy was never touched. Once writing starts it is not a transaction:
 * an error partway through leaves earlier files already reverted, which is
 * why the checks are exhaustive first.
 */
export async function discardMarkedHunks(
  request: DiscardRequest,
  environment: DiscardEnvironment,
): Promise<DiscardOutcome> {
  const edits: DiscardEdit[] = [];
  const discarded = { files: 0, hunks: 0 };

  for (const file of request.files) {
    const mark = request.marks.get(file.id);
    if (!mark) {
      continue;
    }

    const checked = await checkReviewedFile(file, mark, environment.readWorkingCopyFile);
    if (isRefusal(checked)) {
      return checked;
    }

    // A deleted file has no text on disk; the empty document is what the patch
    // describes, and reverting its hunks is what brings the file back.
    const document =
      checked.document ??
      parseDocument(
        checked.patch.change === "deleted"
          ? ""
          : await environment.readWorkingCopyFile(checked.patch.path),
      );

    const planned = editsFor(checked.patch, document, mark);
    if (!Array.isArray(planned)) {
      return { kind: "unsupported", path: checked.patch.path, detail: planned.detail };
    }

    edits.push(...planned);
    discarded.files += 1;
    discarded.hunks += countMarkedHunks(checked.patch, mark);
  }

  if (edits.length === 0) {
    return { kind: "nothing-discarded" };
  }

  for (const edit of edits) {
    if (edit.kind === "remove") {
      await environment.removeWorkingCopyFile(edit.path);
    } else {
      await environment.writeWorkingCopyFile(edit.path, edit.content);
    }
  }

  return { kind: "discarded", ...discarded };
}
