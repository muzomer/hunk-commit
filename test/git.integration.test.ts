import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createGitBackend } from "../src/git/backend";
import { createGit } from "../src/git/repository";
import type { FileMark } from "../src/staging/plan";
import { stageMarkedHunks, type StageOutcome } from "../src/staging/stage";
import { createTestGitRepository, hasGit, type TestGitRepository } from "./support/gitRepo";
import { reviewFromPatch } from "./support/review";

/**
 * The git path, driven against a real repository.
 *
 * `hunk diff` in a git repository is a bare `git diff` — the working tree
 * against the index — so these tests always build the review from that, the
 * same way the extension does.
 */

const describeWithGit = (await hasGit()) ? describe : describe.skip;

let repository: TestGitRepository;

const numberedLines = (count: number) =>
  `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n")}\n`;

beforeEach(async () => {
  repository = await createTestGitRepository();
});

afterEach(async () => {
  await repository.dispose();
});

async function stage(marks: Record<string, FileMark>): Promise<StageOutcome> {
  const files = reviewFromPatch(await repository.git("diff"));
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

  return stageMarkedHunks(
    { files, marks: marksById },
    {
      backend: createGitBackend({ git: createGit({ root: repository.root }) }),
      readWorkingCopyFile: (path) => readFile(join(repository.root, path), "utf8"),
    },
  );
}

const changedLines = (patch: string) =>
  patch
    .split("\n")
    .filter((line) => /^[+-](?!\+\+|--)/.test(line))
    .join("\n");

describeWithGit("staging part of a file", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.git("add", "-A");
    await repository.git("commit", "-qm", "base");

    await repository.write(
      "f.txt",
      numberedLines(20)
        .replace("line 3\n", "line 3 CHANGED\n")
        .replace("line 17\n", "line 17 CHANGED\n"),
    );
  });

  test("stages only the marked hunk and leaves the file on disk alone", async () => {
    const before = await repository.read("f.txt");
    expect((await repository.git("diff")).match(/^@@/gm)).toHaveLength(2);

    const outcome = await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    expect(changedLines(await repository.git("diff", "--cached"))).toBe(
      "-line 3\n+line 3 CHANGED",
    );
    expect(changedLines(await repository.git("diff"))).toBe("-line 17\n+line 17 CHANGED");
    expect(await repository.read("f.txt")).toBe(before);
  });

  test("stages a later hunk, whose position the dropped one shifted", async () => {
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([1]) } });

    expect(changedLines(await repository.git("diff", "--cached"))).toBe(
      "-line 17\n+line 17 CHANGED",
    );
    expect(changedLines(await repository.git("diff"))).toBe("-line 3\n+line 3 CHANGED");
  });

  test("composes with content staged earlier", async () => {
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });

    // The second review saw only the remaining hunk, so both are staged now
    // and nothing is left unstaged.
    expect(await repository.git("diff")).toBe("");
    const staged = changedLines(await repository.git("diff", "--cached"));
    expect(staged).toContain("+line 3 CHANGED");
    expect(staged).toContain("+line 17 CHANGED");
  });

  test("stages the whole file when every hunk is marked", async () => {
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([0, 1]) } });

    expect(await repository.git("diff")).toBe("");
  });

  test("stages nothing when the working copy moved on", async () => {
    const files = reviewFromPatch(await repository.git("diff"));
    await repository.write("f.txt", numberedLines(20).replace("line 3\n", "line 3 EDITED\n"));

    const outcome = await stageMarkedHunks(
      { files, marks: new Map([[files[0]!.id, { kind: "hunks", hunks: new Set([0]) }]]) },
      {
        backend: createGitBackend({ git: createGit({ root: repository.root }) }),
        readWorkingCopyFile: (path) => readFile(join(repository.root, path), "utf8"),
      },
    );

    expect(outcome.kind).toBe("stale");
    expect(await repository.git("diff", "--cached")).toBe("");
  });
});

describeWithGit("staging whole-file changes", () => {
  beforeEach(async () => {
    await repository.write("base.txt", "base\n");
    await repository.git("add", "-A");
    await repository.git("commit", "-qm", "base");
  });

  test("stages a new file, and leaves an unmarked one untracked", async () => {
    await repository.write("added.txt", "new\n");
    await repository.write("ignored.txt", "also new\n");
    await repository.git("add", "-N", "added.txt", "ignored.txt");

    await stage({ "added.txt": { kind: "whole" } });

    expect(await repository.git("diff", "--cached", "--name-only")).toBe("added.txt\n");
  });

  test("stages a deletion", async () => {
    await rm(join(repository.root, "base.txt"));

    await stage({ "base.txt": { kind: "whole" } });

    expect(await repository.git("diff", "--cached", "--name-status")).toBe("D\tbase.txt\n");
    expect(await repository.git("diff")).toBe("");
  });

  test("stages a binary file, which has no hunks to mark", async () => {
    await Bun.write(join(repository.root, "blob.bin"), new Uint8Array([0, 1, 2, 0, 255]));
    await repository.git("add", "-N", "blob.bin");

    await stage({ "blob.bin": { kind: "whole" } });

    expect(await repository.git("diff", "--cached", "--name-only")).toBe("blob.bin\n");
    expect(await repository.git("diff")).toBe("");
  });

  test("refuses a review with nothing marked, and stages nothing", async () => {
    await repository.write("base.txt", "changed\n");

    const outcome = await stage({});

    expect(outcome).toEqual({ kind: "nothing-staged" });
    expect(await repository.git("diff", "--cached")).toBe("");
    expect(changedLines(await repository.git("diff"))).toBe("-base\n+changed");
  });
});
