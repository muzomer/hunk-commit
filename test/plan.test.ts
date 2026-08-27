import { describe, expect, test } from "bun:test";
import { parseDocument } from "../src/patch/document";
import { parseFilePatch } from "../src/patch/parse";
import {
  disposeFile,
  rebuildOperation,
  requiresWorkingCopyCheck,
  revertOperations,
} from "../src/staging/plan";

const twoHunks = parseFilePatch(`--- a/f
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
`);

describe("disposeFile", () => {
  test("an unmarked file contributes nothing", () => {
    expect(disposeFile(twoHunks, undefined)).toEqual({ kind: "revert" });
    expect(disposeFile(twoHunks, { kind: "hunks", hunks: new Set() })).toEqual({ kind: "revert" });
  });

  test("a fully marked file needs no rewriting", () => {
    expect(disposeFile(twoHunks, { kind: "whole" })).toEqual({ kind: "leave" });
    expect(disposeFile(twoHunks, { kind: "hunks", hunks: new Set([0, 1]) })).toEqual({
      kind: "leave",
    });
  });

  test("a partly marked file is rebuilt from its marks", () => {
    expect(disposeFile(twoHunks, { kind: "hunks", hunks: new Set([1]) })).toEqual({
      kind: "rebuild",
      selected: new Set([1]),
    });
  });

  test("a binary file can only be marked whole", () => {
    const binary = parseFilePatch(`diff --git a/i.png b/i.png
Binary files a/i.png and b/i.png differ
`);

    expect(disposeFile(binary, { kind: "whole" })).toEqual({ kind: "leave" });
    expect(disposeFile(binary, undefined)).toEqual({ kind: "revert" });
  });
});

describe("revertOperations", () => {
  test("removes a file the change created", () => {
    const added = parseFilePatch(`diff --git a/n b/n
new file mode 100644
--- /dev/null
+++ b/n
@@ -0,0 +1,1 @@
+hi
`);

    expect(revertOperations(added)).toEqual([{ kind: "delete", path: "n" }]);
  });

  test("restores a modified or deleted file from the target's side", () => {
    expect(revertOperations(twoHunks)).toEqual([{ kind: "restore", path: "f" }]);
  });

  test("unwinds a rename at both paths", () => {
    const renamed = parseFilePatch(`diff --git a/old b/new
rename from old
rename to new
--- a/old
+++ b/new
@@ -1,1 +1,1 @@
-a
+b
`);

    expect(revertOperations(renamed)).toEqual([
      { kind: "delete", path: "new" },
      { kind: "restore", path: "old" },
    ]);
  });
});

describe("rebuildOperation", () => {
  test("writes the file carrying only the marked hunks", () => {
    const document = parseDocument("alpha\nBETA\ngamma\ndelta\nEPSILON\n");

    expect(rebuildOperation(twoHunks, document, new Set([0]))).toEqual({
      kind: "write",
      path: "f",
      content: "alpha\nBETA\ngamma\ndelta\nepsilon\n",
    });
  });
});

describe("requiresWorkingCopyCheck", () => {
  test("checks every file that contributes text", () => {
    expect(requiresWorkingCopyCheck({ kind: "leave" }, twoHunks)).toBe(true);
    expect(requiresWorkingCopyCheck({ kind: "rebuild", selected: new Set([0]) }, twoHunks)).toBe(
      true,
    );
  });

  test("skips a file the change deletes, which has no new side to read", () => {
    const deleted = parseFilePatch(`diff --git a/d b/d
deleted file mode 100644
--- a/d
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
`);

    expect(requiresWorkingCopyCheck({ kind: "leave" }, deleted)).toBe(false);
  });

  test("skips reverted files and files with no text hunks", () => {
    const binary = parseFilePatch(`diff --git a/i.png b/i.png
Binary files a/i.png and b/i.png differ
`);

    expect(requiresWorkingCopyCheck({ kind: "revert" }, twoHunks)).toBe(false);
    expect(requiresWorkingCopyCheck({ kind: "leave" }, binary)).toBe(false);
  });
});
