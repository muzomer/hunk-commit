import { describe, expect, test } from "bun:test";
import {
  hunkDropsFinalNewline,
  hunkRange,
  hunkSideLines,
  parseFilePatch,
  PatchParseError,
} from "../src/patch/parse";

const modified = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

describe("parseFilePatch", () => {
  test("reads paths, change kind, and hunk geometry", () => {
    const patch = parseFilePatch(modified);

    expect(patch).toMatchObject({ path: "src/app.ts", change: "modified", binary: false });
    expect(patch.hunks).toHaveLength(1);
    expect(patch.hunks[0]).toMatchObject({
      index: 0,
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 4,
    });
  });

  test("classifies every body line", () => {
    const [hunk] = parseFilePatch(modified).hunks;

    expect(hunk!.lines.map((line) => [line.kind, line.text])).toEqual([
      ["context", "const a = 1;"],
      ["removed", "const b = 2;"],
      ["added", "const b = 3;"],
      ["added", "const c = 4;"],
      ["context", "const d = 5;"],
    ]);
  });

  test("projects each side's lines", () => {
    const [hunk] = parseFilePatch(modified).hunks;

    expect(hunkSideLines(hunk!, "old")).toEqual(["const a = 1;", "const b = 2;", "const d = 5;"]);
    expect(hunkSideLines(hunk!, "new")).toEqual([
      "const a = 1;",
      "const b = 3;",
      "const c = 4;",
      "const d = 5;",
    ]);
  });

  test("reports inclusive spans the way Hunk does, including empty sides", () => {
    const [hunk] = parseFilePatch(modified).hunks;
    expect(hunkRange(hunk!, "new")).toEqual([1, 4]);

    const deletion = parseFilePatch(`--- a/f
+++ b/f
@@ -5,3 +4,0 @@
-one
-two
-three
`);
    expect(hunkRange(deletion.hunks[0]!, "new")).toEqual([4, 4]);
    expect(deletion.hunks[0]!.newCount).toBe(0);
  });

  test("defaults an omitted count to one", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -7 +7 @@
-old
+new
`);
    expect(patch.hunks[0]).toMatchObject({ oldStart: 7, oldCount: 1, newStart: 7, newCount: 1 });
  });

  test("indexes hunks in patch order", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,1 +1,1 @@
-a
+A
@@ -9,1 +9,1 @@
-b
+B
`);
    expect(patch.hunks.map((hunk) => hunk.index)).toEqual([0, 1]);
    expect(patch.hunks[1]!.newStart).toBe(9);
  });

  test("attaches a no-newline marker to the line it follows", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,2 +1,2 @@
 keep
-tail
\\ No newline at end of file
+tail!
\\ No newline at end of file
`);
    const [hunk] = patch.hunks;

    expect(hunkDropsFinalNewline(hunk!, "old")).toBe(true);
    expect(hunkDropsFinalNewline(hunk!, "new")).toBe(true);
    expect(hunkSideLines(hunk!, "new")).toEqual(["keep", "tail!"]);
  });

  test("treats a bare empty line as empty context", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,3 +1,3 @@
 a

-b
+B
`);
    expect(hunkSideLines(patch.hunks[0]!, "new")).toEqual(["a", "", "B"]);
  });

  test("keeps carriage returns in line content", () => {
    const patch = parseFilePatch(`--- a/f
+++ b/f
@@ -1,1 +1,1 @@
-a\r
+b\r
`);
    expect(hunkSideLines(patch.hunks[0]!, "new")).toEqual(["b\r"]);
  });

  test("recognises additions, deletions, renames, and binaries", () => {
    expect(
      parseFilePatch(`diff --git a/n b/n
new file mode 100644
--- /dev/null
+++ b/n
@@ -0,0 +1,1 @@
+hi
`),
    ).toMatchObject({ path: "n", change: "added" });

    expect(
      parseFilePatch(`diff --git a/d b/d
deleted file mode 100644
--- a/d
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
`),
    ).toMatchObject({ path: "d", change: "deleted" });

    expect(
      parseFilePatch(`diff --git a/old b/new
similarity index 90%
rename from old
rename to new
--- a/old
+++ b/new
@@ -1,1 +1,1 @@
-a
+b
`),
    ).toMatchObject({ path: "new", previousPath: "old", change: "renamed" });

    expect(
      parseFilePatch(`diff --git a/img.png b/img.png
index 111..222 100644
Binary files a/img.png and b/img.png differ
`),
    ).toMatchObject({ path: "img.png", binary: true, hunks: [] });
  });

  test("handles a path containing spaces", () => {
    expect(
      parseFilePatch(`diff --git a/my file.txt b/my file.txt
--- a/my file.txt
+++ b/my file.txt
@@ -1,1 +1,1 @@
-a
+b
`).path,
    ).toBe("my file.txt");
  });

  test("rejects a truncated hunk body", () => {
    expect(() =>
      parseFilePatch(`--- a/f
+++ b/f
@@ -1,5 +1,5 @@
 a
`),
    ).toThrow(PatchParseError);
  });
});
