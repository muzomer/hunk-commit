import { describe, expect, test } from "bun:test";
import { parseDocument } from "../src/patch/document";
import { parseFilePatch } from "../src/patch/parse";
import { operationsFor, revertOperations } from "../src/jj/operations";

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

describe("operationsFor", () => {
  const document = parseDocument("alpha\nBETA\ngamma\ndelta\nEPSILON\n");

  test("writes a partly marked file carrying only its marked hunks", () => {
    expect(
      operationsFor({
        patch: twoHunks,
        disposition: { kind: "rebuild", selected: new Set([0]) },
        document,
      }),
    ).toEqual([{ kind: "write", path: "f", content: "alpha\nBETA\ngamma\ndelta\nepsilon\n" }]);
  });

  test("leaves a fully marked file alone", () => {
    expect(operationsFor({ patch: twoHunks, disposition: { kind: "leave" }, document })).toEqual([]);
  });

  test("reverts an unmarked file", () => {
    expect(operationsFor({ patch: twoHunks, disposition: { kind: "revert" } })).toEqual([
      { kind: "restore", path: "f" },
    ]);
  });
});

