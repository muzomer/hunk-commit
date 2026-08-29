import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, chmod, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createGitBackend } from "../src/git/backend";
import { createGitCommitBackend, findCommitBlocker } from "../src/git/commit";
import { autosquashCommand, createGitFixupBackend } from "../src/git/fixup";
import { listFixupTargets } from "../src/git/history";
import { createGit } from "../src/git/repository";
import type { StagingBackend } from "../src/staging/backend";
import type { CommitChoice } from "../src/git/history";
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

async function run(
  marks: Record<string, FileMark>,
  backend: StagingBackend,
): Promise<StageOutcome> {
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
      backend,
      readWorkingCopyFile: (path) => readFile(join(repository.root, path), "utf8"),
    },
  );
}

const stage = (marks: Record<string, FileMark>) =>
  run(marks, createGitBackend({ git: createGit({ root: repository.root }) }));

const fixup = (marks: Record<string, FileMark>, target: CommitChoice) =>
  run(marks, createGitFixupBackend({ git: createGit({ root: repository.root }), target }));

const commit = (marks: Record<string, FileMark>, subject: string, body = "") =>
  run(
    marks,
    createGitCommitBackend({
      git: createGit({ root: repository.root }),
      message: { subject, body },
    }),
  );

const pathExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

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

/**
 * Committing, which is staging plus `git commit` — and the checks that keep
 * that second command from taking more than the reviewer marked.
 */
describeWithGit("committing", () => {
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

  test("commits only the marked hunk and leaves the rest uncommitted", async () => {
    const before = await repository.read("f.txt");

    const outcome = await commit({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, "feat: three");

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    expect(await repository.git("log", "-1", "--pretty=%s")).toBe("feat: three\n");
    expect(changedLines(await repository.git("show", "--format=", "HEAD"))).toBe(
      "-line 3\n+line 3 CHANGED",
    );

    // The second hunk is still uncommitted, and the file on disk is untouched.
    expect(changedLines(await repository.git("diff"))).toBe("-line 17\n+line 17 CHANGED");
    expect(await repository.read("f.txt")).toBe(before);
  });

  test("writes the description as the commit body, separated by a blank line", async () => {
    await commit({ "f.txt": { kind: "whole" } }, "feat: both", "because the review said so");

    expect(await repository.git("log", "-1", "--pretty=%B")).toBe(
      "feat: both\n\nbecause the review said so\n\n",
    );
  });

  test("refuses when something is already staged, which a commit would sweep in", async () => {
    await repository.write("other.txt", "unrelated\n");
    await repository.git("add", "other.txt");

    const blocker = await findCommitBlocker({
      git: createGit({ root: repository.root }),
      pathExists: pathExists,
    });

    expect(blocker).toBe("index-not-empty");
  });

  test("refuses while a rebase is half-finished", async () => {
    await repository.git("commit", "-qam", "second");
    await repository.git("commit", "-q", "--allow-empty", "-m", "third");

    // Accept the todo list, then fail an --exec so the rebase stops partway
    // and leaves its state directory behind — the situation being detected.
    await repository
      .git("-c", "core.editor=true", "rebase", "-i", "--exec", "false", "HEAD~2")
      .catch(() => undefined);

    const blocker = await findCommitBlocker({
      git: createGit({ root: repository.root }),
      pathExists: pathExists,
    });

    expect(blocker).toBe("operation-in-progress");
  });

  test("leaves nothing staged when a hook refuses the commit", async () => {
    const hook = join(repository.root, ".git", "hooks", "pre-commit");
    await Bun.write(hook, "#!/bin/sh\nexit 1\n");
    await chmod(hook, 0o755);

    const attempt = commit({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, "feat: refused");

    await expect(attempt).rejects.toThrow();

    // The rollback is the point: no commit, and an index as empty as before,
    // so pressing C again is not blocked by the failed attempt.
    expect(await repository.git("log", "-1", "--pretty=%s")).toBe("base\n");
    expect(await repository.git("diff", "--cached")).toBe("");
  });
});

/**
 * Fixups: a second commit that says where its contents belong, and the rebase
 * that later folds it in. The end-to-end test is the one that matters — a
 * fixup that autosquash does not pick up is worse than no fixup at all.
 */
describeWithGit("fixing up an existing commit", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.git("add", "-A");
    await repository.git("commit", "-qm", "base");

    await repository.write("g.txt", "second\n");
    await repository.git("add", "-A");
    await repository.git("commit", "-qm", "wip");

    await repository.write(
      "f.txt",
      numberedLines(20)
        .replace("line 3\n", "line 3 CHANGED\n")
        .replace("line 17\n", "line 17 CHANGED\n"),
    );
  });

  const targets = () => listFixupTargets(createGit({ root: repository.root }));

  test("offers the branch's commits, newest first", async () => {
    expect((await targets()).map((target) => target.label.split("  ")[1])).toEqual(["wip", "base"]);
  });

  test("adds a fixup on top without rewriting anything", async () => {
    const [, base] = await targets();
    const before = await repository.git("rev-parse", "HEAD");

    const outcome = await fixup({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, base!);

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    expect(await repository.git("log", "-1", "--pretty=%s")).toBe(`fixup! ${base!.sha}\n`);

    // The commit it points at, and everything after it, is untouched.
    expect(await repository.git("rev-parse", "HEAD~1")).toBe(before);
  });

  test("autosquash folds the fixup into the commit it names", async () => {
    const [wip] = await targets();

    await fixup({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, wip!);
    // The exact command the reviewer is told to run, unmarked hunks and all.
    await repository.git(...autosquashCommand(wip!).split(" ").slice(1));

    // Three commits went in, two come out, and the marked hunk is now part of
    // the commit the reviewer picked rather than a separate one.
    expect((await repository.git("log", "--pretty=%s")).split("\n").filter(Boolean)).toEqual([
      "wip",
      "base",
    ]);
    expect(changedLines(await repository.git("show", "--format=", "HEAD"))).toContain(
      "+line 3 CHANGED",
    );
  });

  test("marks the first commit as one that needs --root", async () => {
    const [wip, base] = await targets();

    expect(wip!.isRoot).toBe(false);
    expect(base!.isRoot).toBe(true);
  });

  test("leaves the unmarked hunk in the working tree", async () => {
    const [, base] = await targets();

    await fixup({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, base!);

    expect(changedLines(await repository.git("diff"))).toBe("-line 17\n+line 17 CHANGED");
    expect(await repository.git("diff", "--cached")).toBe("");
  });
});
