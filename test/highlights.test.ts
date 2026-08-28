import { describe, expect, test } from "bun:test";
import { parseFilePatch } from "../src/patch/parse";
import { buildMarkHighlights } from "../src/ui/highlights";

const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
@@ -10,2 +10,3 @@
 delta
+inserted
 epsilon
`);

describe("buildMarkHighlights", () => {
  test("paints nothing for an unmarked file", () => {
    expect(buildMarkHighlights(patch, undefined)).toEqual([]);
  });

  test("paints changed lines fully and context lines only at the edge", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) })).toEqual([
      // "alpha" — context, so an edge mark on both sides.
      { side: "old", line: 1, range: [0, 2] },
      { side: "new", line: 1, range: [0, 2] },
      // "beta" / "BETA" — the lines that actually move, marked full width.
      { side: "old", line: 2, range: [0, 4] },
      { side: "new", line: 2, range: [0, 4] },
      { side: "old", line: 3, range: [0, 2] },
      { side: "new", line: 3, range: [0, 2] },
    ]);
  });

  test("tracks line numbers across context when a hunk only adds", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([1]) })).toEqual([
      { side: "old", line: 10, range: [0, 2] },
      { side: "new", line: 10, range: [0, 2] },
      { side: "new", line: 11, range: [0, 8] },
      { side: "old", line: 11, range: [0, 2] },
      { side: "new", line: 12, range: [0, 2] },
    ]);
  });

  test("paints every hunk of a whole-file mark", () => {
    expect(buildMarkHighlights(patch, { kind: "whole" })).toHaveLength(11);
  });

  test("gives an empty line a range even though nothing can paint it", () => {
    const withBlank = parseFilePatch(`--- a/f
+++ b/f
@@ -1,1 +1,2 @@
 alpha
+
`);

    expect(buildMarkHighlights(withBlank, { kind: "whole" })).toEqual([
      { side: "old", line: 1, range: [0, 2] },
      { side: "new", line: 1, range: [0, 2] },
      { side: "new", line: 2, range: [0, 1] },
    ]);
  });
});
