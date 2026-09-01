import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, readlink, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { discardMarkedHunks, type DiscardOutcome } from "../src/discard/discard";
import { createWorkingCopyEnvironment } from "../src/discard/workingCopy";
import type { FileMark } from "../src/staging/plan";
import { createTestRepository, hasJujutsu, type TestRepository } from "./support/repo";
import { reviewFromPatch } from "./support/review";

/**
 * Discarding, driven against a real Jujutsu workspace.
 *
 * The last test is the one that matters most: the confirmation dialog promises
 * that a discard in jj is recoverable, and a promise made to someone about
 * their unsaved work should be checked rather than believed.
 */

const describeWithJj = (await hasJujutsu()) ? describe : describe.skip;

let repository: TestRepository;

const numberedLines = (count: number) =>
  `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n")}\n`;

beforeEach(async () => {
  repository = await createTestRepository();
});

afterEach(async () => {
  await repository.dispose();
});

async function discard(marks: Record<string, FileMark>): Promise<DiscardOutcome> {
  const files = reviewFromPatch(await repository.jj("diff", "--git"));
  const byPath = new Map(files.map((file) => [file.path, file.id]));
  const marksById = new Map(
    Object.entries(marks).map(([path, mark]) => {
      const id = byPath.get(path);
      if (!id) {
        throw new Error(`No reviewed file at ${path}; review has ${[...byPath.keys()].join(", ")}`);
      }
      return [id, mark] as const;
    }),
  );

  // The environment the extension itself builds, not a copy of it: a copy
  // would keep passing while the real one wrote through a symlink.
  return discardMarkedHunks(
    { files, marks: marksById },
    createWorkingCopyEnvironment(repository.root),
  );
}

describeWithJj("discarding part of a file", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.jj("commit", "-m", "base");
    await repository.write(
      "f.txt",
      numberedLines(20)
        .replace("line 3\n", "line 3 CHANGED\n")
        .replace("line 17\n", "line 17 CHANGED\n"),
    );
  });

  test("reverts the marked hunk and keeps the rest", async () => {
    const outcome = await discard({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });

    expect(outcome).toEqual({ kind: "discarded", files: 1, hunks: 1 });
    expect(await repository.read("f.txt")).toBe(
      numberedLines(20).replace("line 17\n", "line 17 CHANGED\n"),
    );
  });

  test("reverts the file completely when every hunk is marked", async () => {
    await discard({ "f.txt": { kind: "whole" } });

    expect(await repository.read("f.txt")).toBe(numberedLines(20));
    expect(await repository.jj("diff", "--git")).toBe("");
  });

  test("leaves an unmarked file alone and reports that nothing went", async () => {
    const before = await repository.read("f.txt");

    expect(await discard({})).toEqual({ kind: "nothing-discarded" });
    expect(await repository.read("f.txt")).toBe(before);
  });

  test("refuses when the working copy moved on, without writing", async () => {
    const files = reviewFromPatch(await repository.jj("diff", "--git"));
    await repository.write("f.txt", numberedLines(20).replace("line 3\n", "line 3 EDITED\n"));
    const before = await repository.read("f.txt");

    const resolve = (path: string) => join(repository.root, path);
    const outcome = await discardMarkedHunks(
      { files, marks: new Map([[files[0]!.id, { kind: "hunks", hunks: new Set([0]) }]]) },
      {
        readWorkingCopyFile: (path) => readFile(resolve(path), "utf8"),
        writeWorkingCopyFile: () => Promise.reject(new Error("must not write")),
        removeWorkingCopyFile: () => Promise.reject(new Error("must not remove")),
      },
    );

    expect(outcome.kind).toBe("stale");
    expect(await repository.read("f.txt")).toBe(before);
  });
});

describeWithJj("discarding whole-file changes", () => {
  beforeEach(async () => {
    await repository.write("base.txt", "base\n");
    await repository.jj("commit", "-m", "base");
  });

  test("removes a file the change created", async () => {
    await repository.write("added.txt", "brand new\n");

    await discard({ "added.txt": { kind: "whole" } });

    expect(await repository.jj("diff", "--git")).toBe("");
    expect(repository.read("added.txt")).rejects.toThrow();
  });

  test("brings back a file the change deleted", async () => {
    await rm(join(repository.root, "base.txt"));

    await discard({ "base.txt": { kind: "whole" } });

    expect(await repository.read("base.txt")).toBe("base\n");
    expect(await repository.jj("diff", "--git")).toBe("");
  });

  test("refuses a binary file, which the patch does not record", async () => {
    await Bun.write(join(repository.root, "blob.bin"), new Uint8Array([0, 1, 2, 0, 255]));

    const outcome = await discard({ "blob.bin": { kind: "whole" } });

    expect(outcome).toMatchObject({ kind: "unsupported", path: "blob.bin" });
    expect(await repository.jj("diff", "--git")).toContain("blob.bin");
  });
});

describeWithJj("a symbolic link", () => {
  /**
   * Git and jj both store a symlink as a file whose content is its target, so
   * one reaches the review looking like an ordinary one-line text file. What
   * makes it dangerous is the destination, not the patch: a write at that path
   * lands wherever the link points, which can be anywhere on the machine.
   */
  beforeEach(async () => {
    await repository.write("secret.txt", "do not touch\n");
    await symlink(join(repository.root, "secret.txt"), join(repository.root, "link"));
    await repository.jj("commit", "-m", "base");

    await rm(join(repository.root, "link"));
    await symlink(join(repository.root, "elsewhere.txt"), join(repository.root, "link"));
  });

  test("is refused rather than rebuilt from its target text", async () => {
    const outcome = await discard({ link: { kind: "whole" } });

    expect(outcome).toMatchObject({ kind: "unsupported-type", path: "link" });
  });

  test("leaves the file it points at untouched", async () => {
    await discard({ link: { kind: "whole" } });

    expect(await repository.read("secret.txt")).toBe("do not touch\n");
    expect(await readlink(join(repository.root, "link"))).toBe(
      join(repository.root, "elsewhere.txt"),
    );
  });
});

describeWithJj("what the confirmation promises", () => {
  test("a discard in jj really is recoverable with jj undo", async () => {
    await repository.write("f.txt", numberedLines(6));
    await repository.jj("commit", "-m", "base");
    const precious = numberedLines(6).replace("line 3\n", "line 3 PRECIOUS WORK\n");
    await repository.write("f.txt", precious);

    // Loading the review snapshots the working copy into the operation log,
    // which is exactly what makes the next step reversible.
    await discard({ "f.txt": { kind: "whole" } });
    expect(await repository.read("f.txt")).toBe(numberedLines(6));

    await repository.jj("undo");

    expect(await repository.read("f.txt")).toBe(precious);
  });
});
