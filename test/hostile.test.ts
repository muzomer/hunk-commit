import { describe, expect, test } from "bun:test";
import { discardMarkedHunks } from "../src/discard/discard";
import { createStageDirectory } from "../src/jj/stageDirectory";
import type { FileMark } from "../src/staging/plan";
import { stageMarkedHunks } from "../src/staging/stage";
import { reviewFromPatch } from "./support/review";

/**
 * Patches that name a file no diff of a working copy could name.
 *
 * git will not emit these for a tracked file, which is exactly why they are
 * worth testing: nothing else in the suite would notice if the checks that
 * refuse them were removed, and the paths reach `writeFile` and `rm` directly.
 */

/** A patch whose only file sits at `path`. */
function patchNaming(path: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1,1 +1,1 @@",
    "-before",
    "+after",
    "",
  ].join("\n");
}

/** A patch that renames `from` to a perfectly ordinary path. */
function patchRenamingFrom(from: string): string {
  return [
    "diff --git a/safe.txt b/safe.txt",
    "similarity index 90%",
    `rename from ${from}`,
    "rename to safe.txt",
    `--- a/${from}`,
    "+++ b/safe.txt",
    "@@ -1,1 +1,1 @@",
    "-before",
    "+after",
    "",
  ].join("\n");
}

const ESCAPING = "../../outside.txt";
const WHOLE: FileMark = { kind: "whole" };

/** Stage one patch, recording anything the operation tried to touch. */
async function stage(patchText: string) {
  const touched: string[] = [];
  const files = reviewFromPatch(patchText);

  const outcome = await stageMarkedHunks(
    { files, marks: new Map(files.map((file) => [file.id, WHOLE])) },
    {
      backend: {
        destination: "the index",
        stage: async () => {
          touched.push("staged");
        },
      },
      readWorkingCopyFile: async (path) => {
        touched.push(`read ${path}`);
        return "after\n";
      },
    },
  );

  return { outcome, touched };
}

/** Discard one patch, recording anything the operation tried to touch. */
async function discard(patchText: string) {
  const touched: string[] = [];
  const files = reviewFromPatch(patchText);

  const outcome = await discardMarkedHunks(
    { files, marks: new Map(files.map((file) => [file.id, WHOLE])) },
    {
      readWorkingCopyFile: async (path) => {
        touched.push(`read ${path}`);
        return "after\n";
      },
      writeWorkingCopyFile: async (path) => {
        touched.push(`write ${path}`);
      },
      removeWorkingCopyFile: async (path) => {
        touched.push(`remove ${path}`);
      },
    },
  );

  return { outcome, touched };
}

describe("a patch naming a path outside the workspace", () => {
  test.each([
    ["a `..` path", patchNaming(ESCAPING)],
    ["an absolute path", patchNaming("/etc/cron.d/x")],
    ["a rename away from a `..` path", patchRenamingFrom(ESCAPING)],
  ])("is refused before staging touches anything: %s", async (_name, patchText) => {
    const { outcome, touched } = await stage(patchText);

    expect(outcome.kind).toBe("unsafe-path");
    expect(touched).toEqual([]);
  });

  test.each([
    ["a `..` path", patchNaming(ESCAPING)],
    ["an absolute path", patchNaming("/etc/cron.d/x")],
    ["a rename away from a `..` path", patchRenamingFrom(ESCAPING)],
  ])("is refused before discarding touches anything: %s", async (_name, patchText) => {
    const { outcome, touched } = await discard(patchText);

    expect(outcome.kind).toBe("unsafe-path");
    expect(touched).toEqual([]);
  });

  test("names the offending path, not the file it was disguised as", async () => {
    const { outcome } = await discard(patchRenamingFrom(ESCAPING));

    expect(outcome).toMatchObject({ kind: "unsafe-path", path: ESCAPING });
  });

  test("is refused a second time at the boundary in front of the shell", async () => {
    // The chokepoint above already refuses this, so reaching the staging
    // directory with such a path takes a bug. It still must not be written.
    const attempt = createStageDirectory([
      { kind: "write", path: ESCAPING, content: "after\n" },
    ]);

    await expect(attempt).rejects.toThrow(/outside the workspace/);
  });
});

describe("an ordinary patch", () => {
  test("still stages", async () => {
    const { outcome, touched } = await stage(patchNaming("src/f.txt"));

    expect(outcome.kind).toBe("staged");
    expect(touched).toContain("staged");
  });

  test("still discards", async () => {
    const { outcome, touched } = await discard(patchNaming("src/f.txt"));

    expect(outcome.kind).toBe("discarded");
    expect(touched).toContain("write src/f.txt");
  });
});
