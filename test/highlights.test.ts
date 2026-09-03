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
      { side: "old", line: 2, range: [0, 4], tone: "match" },
      { side: "new", line: 2, range: [0, 4], tone: "match" },
    ]);
  });

  test("draws a rail down the hunk when context marks are set to edge", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) }, "edge")).toEqual([
      { side: "old", line: 1, range: [0, 2], tone: "dim" },
      { side: "new", line: 1, range: [0, 2], tone: "dim" },
      { side: "old", line: 2, range: [0, 4], tone: "match" },
      { side: "new", line: 2, range: [0, 4], tone: "match" },
      { side: "old", line: 3, range: [0, 2], tone: "dim" },
      { side: "new", line: 3, range: [0, 2], tone: "dim" },
    ]);
  });

  test("paints context like the moving lines when set to full", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) }, "full")).toEqual([
      { side: "old", line: 1, range: [0, 5], tone: "dim" },
      { side: "new", line: 1, range: [0, 5], tone: "dim" },
      { side: "old", line: 2, range: [0, 4], tone: "match" },
      { side: "new", line: 2, range: [0, 4], tone: "match" },
      { side: "old", line: 3, range: [0, 5], tone: "dim" },
      { side: "new", line: 3, range: [0, 5], tone: "dim" },
    ]);
  });

  test("tracks line numbers across context when a hunk only adds", () => {
    expect(buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([1]) })).toEqual([
      { side: "new", line: 11, range: [0, 8], tone: "match" },
    ]);
  });

  test("paints every hunk of a whole-file mark", () => {
    expect(buildMarkHighlights(patch, { kind: "whole" })).toHaveLength(3);
  });

  test("separates the lines that move from the reach of the hunk", () => {
    const tones = new Set(
      buildMarkHighlights(patch, { kind: "hunks", hunks: new Set([0]) }, "full").map(
        (highlight) => `${highlight.tone}:${highlight.range[1]}`,
      ),
    );

    // The point of the split: whatever width context is given, it never
    // carries the tone that means "this is what will move".
    expect(tones).toEqual(new Set(["match:4", "dim:5"]));
  });

  test("gives an empty line a range even though nothing can paint it", () => {
    const withBlank = parseFilePatch(`--- a/f
+++ b/f
@@ -1,1 +1,2 @@
 alpha
+
`);

    expect(buildMarkHighlights(withBlank, { kind: "whole" })).toEqual([
      { side: "new", line: 2, range: [0, 1], tone: "match" },
    ]);
  });
});
