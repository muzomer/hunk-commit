import type { FilePatch } from "../patch/parse";
import type { FileMark } from "../staging/plan";

/** One painted line, in the shape Hunk's line highlighter contributes. */
export interface MarkHighlight {
  readonly side: "old" | "new";
  readonly line: number;
  readonly range: readonly [number, number];
}

/**
 * Paint the changed lines of every marked hunk.
 *
 * Line lengths come from the patch rather than from the file, because a
 * Jujutsu review gives extensions no readable source document — the bundled jj
 * backend contributes no file-source reader. The patch carries the same text
 * the review is showing, so it is both sufficient and exact.
 *
 * Only changed lines are painted. Marking a hunk covers its context lines too,
 * but painting those would blur where one hunk ends and the next begins.
 */
export function buildMarkHighlights(patch: FilePatch, mark: FileMark | undefined): MarkHighlight[] {
  if (!mark) {
    return [];
  }

  const highlights: MarkHighlight[] = [];

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
        oldLine += 1;
        newLine += 1;
      }
    }
  }

  return highlights;
}
