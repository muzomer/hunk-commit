import { hunkRange, parseFilePatch } from "../../src/patch/parse";
import type { ReviewedFile } from "../../src/staging/stage";
import { splitPatchByFile } from "./repo";

/**
 * Build the review Hunk would hand the extension for a working-copy diff.
 *
 * `hostHunks` mirrors what Hunk reports for each hunk, so the agreement check
 * in `stageMarkedHunks` runs against realistic input.
 */
export function reviewFromPatch(patchText: string): ReviewedFile[] {
  return splitPatchByFile(patchText).map((filePatch, index) => {
    const parsed = parseFilePatch(filePatch);

    return {
      id: `file-${index}`,
      path: parsed.path,
      patchText: filePatch,
      hostHunks: parsed.hunks.map((hunk) => ({
        index: hunk.index,
        newRange: hunkRange(hunk, "new"),
      })),
    };
  });
}
