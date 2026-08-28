import type { FilePatch } from "../patch/parse";
import type { FileMark } from "../staging/plan";

/** How much of a marked hunk's context lines carries the mark. */
export type ContextMarks = "none" | "edge" | "full";

/** One painted line, in the shape Hunk's line highlighter contributes. */
export interface MarkHighlight {
  readonly side: "old" | "new";
  readonly line: number;
  readonly range: readonly [number, number];
}

/**
 * Paint the lines of a marked hunk.
 *
 * Changed lines always carry the mark across their full width: those are the
 * lines that move, and they are what marking is about.
 *
 * Context lines are a judgement call, so they are a setting. Marking them says
 * how far the hunk reaches, which is real information — but a hunk carries up
 * to three lines of context on each side, so it also makes the marked region
 * look considerably larger than what will actually move. `"none"` is the
 * default for that reason; `"edge"` draws a thin rail down the hunk, and
 * `"full"` paints context exactly like the lines that move.
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
export function buildMarkHighlights(
  patch: FilePatch,
  mark: FileMark | undefined,
  contextMarks: ContextMarks = "none",
): MarkHighlight[] {
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
        if (contextMarks !== "none") {
          const width = contextMarks === "edge" ? Math.min(range[1], EDGE_WIDTH) : range[1];
          const contextRange = [0, width] as const;
          highlights.push({ side: "old", line: oldLine, range: contextRange });
          highlights.push({ side: "new", line: newLine, range: contextRange });
        }
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return highlights;
}
