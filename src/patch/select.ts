import type { Document } from "./document";
import { hunkDropsFinalNewline, hunkSideLines, type PatchHunk } from "./parse";

/**
 * Rebuilding a file from a subset of its hunks.
 *
 * Staging a hunk never edits it: the file on disk already contains every
 * change, so keeping a subset means *reverting* the hunks that were not
 * chosen. Each revert replaces a hunk's new-side lines with its old-side
 * lines, which is exact line arithmetic — the patch and the file share one
 * coordinate system, so there is no fuzz, no context search, and no re-diff.
 */

/** One hunk whose new-side lines are not where the patch says they are. */
export interface StaleHunk {
  readonly hunkIndex: number;
  readonly line: number;
  readonly expected: string;
  readonly found: string | undefined;
}

/** Where a hunk's new-side lines begin, as a zero-based index into the document. */
function spliceIndex(hunk: PatchHunk): number {
  // A hunk that adds nothing reports the line it sits *after*, not a line it covers.
  return hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
}

/**
 * Find the first hunk that no longer matches the document, or null when the
 * whole patch still describes it.
 *
 * This is the guard the whole extension rests on. Hunk reviews a snapshot,
 * while `jj` snapshots the working copy on every command, so between marking a
 * hunk and staging it the file may have moved on. Verifying every hunk — not
 * just the ones being reverted — means a stale *selected* hunk is caught too:
 * that one would otherwise move content the reviewer never saw.
 */
export function findStaleHunk(document: Document, hunks: readonly PatchHunk[]): StaleHunk | null {
  for (const hunk of hunks) {
    const start = spliceIndex(hunk);
    const expected = hunkSideLines(hunk, "new");

    for (const [offset, line] of expected.entries()) {
      const found = document.lines[start + offset];
      if (found !== line) {
        return { hunkIndex: hunk.index, line: start + offset + 1, expected: line, found };
      }
    }
  }

  return null;
}

/**
 * Rebuild the file so it carries only the selected hunks.
 *
 * Reverts run from the end of the file backwards so that each splice leaves
 * the line numbers of everything above it — every hunk not yet processed —
 * untouched.
 *
 * Callers must pass a document that `findStaleHunk` accepts; this function
 * trusts the coordinates it is given.
 */
export function keepOnlySelectedHunks(
  document: Document,
  hunks: readonly PatchHunk[],
  selected: ReadonlySet<number>,
): Document {
  const lines = [...document.lines];
  const originalLineCount = document.lines.length;
  let endsWithNewline = document.endsWithNewline;

  const reverted = hunks
    .filter((hunk) => !selected.has(hunk.index))
    .sort((left, right) => spliceIndex(right) - spliceIndex(left));

  for (const hunk of reverted) {
    const start = spliceIndex(hunk);

    if (start + hunk.newCount === originalLineCount) {
      endsWithNewline = !hunkDropsFinalNewline(hunk, "old");
    }

    lines.splice(start, hunk.newCount, ...hunkSideLines(hunk, "old"));
  }

  return { lines, endsWithNewline: lines.length === 0 ? false : endsWithNewline };
}
