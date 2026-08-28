import { describe, expect, test } from "bun:test";
import { parseFilePatch } from "../src/patch/parse";
import { writeSelectedHunks } from "../src/patch/write";

const twoHunks = parseFilePatch(`diff --git a/f.txt b/f.txt
index 1111111..2222222 100644
--- a/f.txt
+++ b/f.txt
@@ -2,1 +2,3 @@ context heading
 b
+NEW1
+NEW2
@@ -15,1 +17,1 @@
-old
+new
`);

describe("writeSelectedHunks", () => {
  test("keeps the original header verbatim", () => {
    const written = writeSelectedHunks(twoHunks, new Set([0]))!;

    expect(written.split("\n").slice(0, 4)).toEqual([
      "diff --git a/f.txt b/f.txt",
      "index 1111111..2222222 100644",
      "--- a/f.txt",
      "+++ b/f.txt",
    ]);
  });

  test("emits only the selected hunk", () => {
    expect(writeSelectedHunks(twoHunks, new Set([1]))).toContain("-old\n+new\n");
    expect(writeSelectedHunks(twoHunks, new Set([1]))).not.toContain("NEW1");
  });

  test("renumbers later hunks by what was dropped", () => {
    // Dropping the first hunk removes two added lines, so the second hunk's
    // new-side start moves from 17 to 15.
    expect(writeSelectedHunks(twoHunks, new Set([1]))).toContain("@@ -15 +15 @@");
    expect(writeSelectedHunks(twoHunks, new Set([0, 1]))).toContain("@@ -15 +17 @@");
  });

  test("leaves earlier hunks unmoved", () => {
    expect(writeSelectedHunks(twoHunks, new Set([0]))).toContain("@@ -2 +2,3 @@ context heading");
  });

  test("round-trips a patch when everything is selected", () => {
    const all = new Set(twoHunks.hunks.map((hunk) => hunk.index));

    expect(writeSelectedHunks(twoHunks, all)).toBe(`diff --git a/f.txt b/f.txt
index 1111111..2222222 100644
--- a/f.txt
+++ b/f.txt
@@ -2 +2,3 @@ context heading
 b
+NEW1
+NEW2
@@ -15 +17 @@
-old
+new
`);
  });

  test("preserves a no-newline marker", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,2 +1,2 @@
 one
-two
\\ No newline at end of file
+two!
\\ No newline at end of file
`);

    expect(writeSelectedHunks(patch, new Set([0]))).toBe(`--- a/f
+++ b/f
@@ -1,2 +1,2 @@
 one
-two
\\ No newline at end of file
+two!
\\ No newline at end of file
`);
  });

  test("returns null when nothing is selected", () => {
    expect(writeSelectedHunks(twoHunks, new Set())).toBeNull();
  });
});
