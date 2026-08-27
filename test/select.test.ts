import { describe, expect, test } from "bun:test";
import { parseDocument, renderDocument } from "../src/patch/document";
import { parseFilePatch } from "../src/patch/parse";
import { findStaleHunk, keepOnlySelectedHunks } from "../src/patch/select";

/** Rebuild `newText` keeping only `selected`, the way the extension does. */
function keep(newText: string, patchText: string, selected: number[]): string {
  const { hunks } = parseFilePatch(patchText);
  return renderDocument(keepOnlySelectedHunks(parseDocument(newText), hunks, new Set(selected)));
}

const OLD_TEXT = "alpha\nbeta\ngamma\ndelta\nepsilon\n";
const NEW_TEXT = "alpha\nBETA\ngamma\ndelta\nEPSILON\n";
const TWO_HUNKS = `--- a/f
+++ b/f
@@ -1,3 +1,3 @@
 alpha
-beta
+BETA
 gamma
@@ -4,2 +4,2 @@
 delta
-epsilon
+EPSILON
`;

describe("keepOnlySelectedHunks", () => {
  test("selecting every hunk leaves the file untouched", () => {
    expect(keep(NEW_TEXT, TWO_HUNKS, [0, 1])).toBe(NEW_TEXT);
  });

  test("selecting no hunk reverts the file completely", () => {
    expect(keep(NEW_TEXT, TWO_HUNKS, [])).toBe(OLD_TEXT);
  });

  test("keeps the selected hunk and reverts the other", () => {
    expect(keep(NEW_TEXT, TWO_HUNKS, [0])).toBe("alpha\nBETA\ngamma\ndelta\nepsilon\n");
    expect(keep(NEW_TEXT, TWO_HUNKS, [1])).toBe("alpha\nbeta\ngamma\ndelta\nEPSILON\n");
  });

  test("reverting an earlier hunk does not disturb a later one", () => {
    const shrinking = `--- a/f
+++ b/f
@@ -1,3 +1,1 @@
-a
-b
 c
@@ -6,1 +4,1 @@
-f
+F
`;
    // Reverting the first hunk grows the file by two lines; the second hunk's
    // own line numbers stay valid because reverts run from the bottom up.
    expect(keep("c\nd\ne\nF\n", shrinking, [0])).toBe("c\nd\ne\nf\n");
    expect(keep("c\nd\ne\nF\n", shrinking, [1])).toBe("a\nb\nc\nd\ne\nF\n");
  });

  test("restores lines removed by a zero-context deletion hunk", () => {
    const deletion = `--- a/f
+++ b/f
@@ -2,2 +1,0 @@
-b
-c
`;
    expect(keep("a\nd\n", deletion, [])).toBe("a\nb\nc\nd\n");
    expect(keep("a\nd\n", deletion, [0])).toBe("a\nd\n");
  });

  test("restores a missing trailing newline when reverting the last hunk", () => {
    const appended = `--- a/f
+++ b/f
@@ -1,2 +1,3 @@
 one
-two
\\ No newline at end of file
+two
+three
`;
    expect(keep("one\ntwo\nthree\n", appended, [])).toBe("one\ntwo");
    expect(keep("one\ntwo\nthree\n", appended, [0])).toBe("one\ntwo\nthree\n");
  });

  test("reverts a whole added file back to empty", () => {
    const added = `--- /dev/null
+++ b/f
@@ -0,0 +1,2 @@
+one
+two
`;
    expect(keep("one\ntwo\n", added, [])).toBe("");
  });
});

describe("findStaleHunk", () => {
  const { hunks } = parseFilePatch(TWO_HUNKS);

  test("accepts a document the patch still describes", () => {
    expect(findStaleHunk(parseDocument(NEW_TEXT), hunks)).toBeNull();
  });

  test("reports the first hunk whose lines moved on", () => {
    const edited = parseDocument("alpha\nBETA\ngamma\ndelta\nEPSILON!\n");

    expect(findStaleHunk(edited, hunks)).toEqual({
      hunkIndex: 1,
      line: 5,
      expected: "EPSILON",
      found: "EPSILON!",
    });
  });

  test("reports a document that lost lines entirely", () => {
    expect(findStaleHunk(parseDocument("alpha\n"), hunks)).toMatchObject({
      hunkIndex: 0,
      found: undefined,
    });
  });
});
