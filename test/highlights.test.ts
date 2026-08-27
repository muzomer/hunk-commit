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

  test("paints the changed lines of a marked hunk on the right side", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) })).toEqual([
      { side: "old", line: 2, range: [0, 4] },
      { side: "new", line: 2, range: [0, 4] },
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
});
