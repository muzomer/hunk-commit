import { describe, expect, test } from "bun:test";
import { parseFilePatch } from "../src/patch/parse";
import { disposeFile, requiresWorkingCopyCheck } from "../src/staging/plan";

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
