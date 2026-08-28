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

  test("marks only the lines that move by default", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) })).toEqual([
      { side: "old", line: 2, range: [0, 4] },
      { side: "new", line: 2, range: [0, 4] },
    ]);
  });

  test("draws a rail down the hunk when context marks are set to edge", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) }, "edge")).toEqual([
      { side: "old", line: 1, range: [0, 2] },
      { side: "new", line: 1, range: [0, 2] },
      { side: "old", line: 2, range: [0, 4] },
      { side: "new", line: 2, range: [0, 4] },
      { side: "old", line: 3, range: [0, 2] },
      { side: "new", line: 3, range: [0, 2] },
    ]);
  });

  test("paints context like the moving lines when set to full", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) }, "full")).toEqual([
      { side: "old", line: 1, range: [0, 5] },
      { side: "new", line: 1, range: [0, 5] },
      { side: "old", line: 2, range: [0, 4] },
      { side: "new", line: 2, range: [0, 4] },
      { side: "old", line: 3, range: [0, 5] },
      { side: "new", line: 3, range: [0, 5] },
    ]);
  });

  test("tracks line numbers across context when a hunk only adds", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([1]) })).toEqual([
      { side: "new", line: 11, range: [0, 8] },
    ]);
  });

  test("paints every hunk of a whole-file mark", () => {
    expect(buildMarkHighlights(patch, { kind: "whole" })).toHaveLength(3);
  });

  test("gives an empty line a range even though nothing can paint it", () => {
    const withBlank = parseFilePatch(`--- a/f
+++ b/f
@@ -1,1 +1,2 @@
 alpha
+
`);

    expect(buildMarkHighlights(withBlank, { kind: "whole" })).toEqual([
      { side: "new", line: 2, range: [0, 1] },
    ]);
  });
});
