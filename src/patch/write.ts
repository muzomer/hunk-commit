import { hunkSideLines, type FilePatch, type PatchHunk, type PatchLine } from "./parse";

/**
 * Writing a patch back out with only some of its hunks.
 *
 * This is the git-shaped projection of a selection. Where Jujutsu wants whole
 * files (it compares trees), git wants a patch it can apply to the index, so
 * the same marks are expressed by *keeping* hunks rather than by reverting the
 * others.
 *
 * The file's original header lines are re-emitted verbatim, so modes, blob
 * hashes, and rename records survive untouched.
 */

const MARKER: Record<PatchLine["kind"], string> = {
  context: " ",
  added: "+",
  removed: "-",
};

const NO_NEWLINE_MARKER = "\\ No newline at end of file";

function renderHunkHeader(hunk: PatchHunk, newStart: number): string {
  const oldSpan = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`;
  const newSpan = hunk.newCount === 1 ? `${newStart}` : `${newStart},${hunk.newCount}`;
  return `@@ -${oldSpan} +${newSpan} @@${hunk.heading}`;
}

function renderHunkBody(hunk: PatchHunk): string[] {
  return hunk.lines.flatMap((line) =>
    line.noNewlineAtEof
      ? [`${MARKER[line.kind]}${line.text}`, NO_NEWLINE_MARKER]
      : [`${MARKER[line.kind]}${line.text}`],
  );
}

/** How many lines a hunk adds to the file it applies to. */
function lineDelta(hunk: PatchHunk): number {
  return hunkSideLines(hunk, "new").length - hunkSideLines(hunk, "old").length;
}

/**
 * Render a patch carrying only the selected hunks.
 *
 * Dropping a hunk shifts every later hunk's position in the *new* file, so
 * new-side starts are renumbered by the running delta of what was left out.
 * `git apply` would tolerate stale numbers — it locates hunks by their old-side
 * position and context — but a patch that describes a file it does not
 * produce is a patch nothing else can trust.
 *
 * Returns null when nothing is selected, because an empty patch is not a
 * smaller patch: it is no work at all.
 */
export function writeSelectedHunks(
  patch: FilePatch,
  selected: ReadonlySet<number>,
): string | null {
  const lines = [...patch.headerLines];
  let hasSelection = false;
  let droppedDelta = 0;

  for (const hunk of patch.hunks) {
    if (!selected.has(hunk.index)) {
      droppedDelta += lineDelta(hunk);
      continue;
    }

    hasSelection = true;
    lines.push(renderHunkHeader(hunk, hunk.newStart - droppedDelta), ...renderHunkBody(hunk));
  }

  return hasSelection ? `${lines.join("\n")}\n` : null;
}
