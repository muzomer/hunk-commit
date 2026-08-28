import type { FilePatch } from "../patch/parse";
import type { FileMark } from "../staging/plan";

/** One painted line, in the shape Hunk's line highlighter contributes. */
export interface MarkHighlight {
  readonly side: "old" | "new";
  readonly line: number;
  readonly range: readonly [number, number];
}

/**
 * Paint every line of a marked hunk, but not all of them the same way.
 *
 * Two things are worth seeing and they are not the same thing: which lines are
 * about to move, and how far the hunk you marked reaches. Changed lines carry
 * the mark across their full width, because those are the lines that move.
 * Context lines carry it only in the first couple of columns — enough to draw
 * a continuous edge down the hunk, without claiming that a line which stays
 * put is going anywhere.
 *
 * Painting nothing at all on context lines was the first attempt, and it left
 * a marked hunk looking half-marked: a stripe of tinted lines with untinted
 * ones between them, which reads as a bug rather than as a boundary.
 *
 * A context line is addressed on both sides, since it exists on both and a
 * split layout renders it twice.
 *
 * Line lengths come from the patch rather than from the file, because a
 * Jujutsu review gives extensions no readable source document — the bundled jj
 * backend contributes no file-source reader. The patch carries the same text
 * the review is showing, so it is both sufficient and exact.
 *
 * One line cannot be painted at all: an empty one. Marks colour characters,
 * and a line with no characters offers none to colour, so a blank line inside
 * a marked hunk stays untinted however wide a range it is given.
 */
export function buildMarkHighlights(patch: FilePatch, mark: FileMark | undefined): MarkHighlight[] {
  if (!mark) {
    return [];
  }

  const highlights: MarkHighlight[] = [];
  /** Columns of a context line that carry the mark, drawing the hunk's edge. */
  const EDGE_WIDTH = 2;

  for (const hunk of patch.hunks) {
    if (mark.kind === "hunks" && !mark.hunks.has(hunk.index)) {
      continue;
    }

    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (const line of hunk.lines) {
      const range = [0, Math.max(line.text.length, 1)] as const;

      if (line.kind === "added") {
        highlights.push({ side: "new", line: newLine, range });
        newLine += 1;
      } else if (line.kind === "removed") {
        highlights.push({ side: "old", line: oldLine, range });
        oldLine += 1;
      } else {
        const edge = [0, Math.min(range[1], EDGE_WIDTH)] as const;
        highlights.push({ side: "old", line: oldLine, range: edge });
        highlights.push({ side: "new", line: newLine, range: edge });
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return highlights;
}
