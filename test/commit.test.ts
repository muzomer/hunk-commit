import { describe, expect, test } from "bun:test";
import {
  commitMessageArgs,
  createCommittingBackend,
  findCommitBlocker,
} from "../src/git/commit";
import { joinCommitMessage } from "../src/staging/message";
import type { Git } from "../src/git/repository";

/** A `git` that answers from a table and records what it was asked. */
function fakeGit(options: {
  responses?: Record<string, string>;
  fails?: string;
}): Git & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    async run(args) {
      calls.push([...args]);
      const key = args.join(" ");
      if (options.fails !== undefined && key.startsWith(options.fails)) {
        throw new Error("the pre-commit hook refused");
      }
      return options.responses?.[key] ?? "";
    },
  };
}

const GIT_DIR = "rev-parse --absolute-git-dir";

describe("findCommitBlocker", () => {
  test("finds nothing wrong with a clean repository", async () => {
    const git = fakeGit({ responses: { [GIT_DIR]: "/repo/.git\n" } });

    expect(await findCommitBlocker({ git, pathExists: async () => false })).toBeNull();
  });

  test("reports a non-empty index, which git commit would sweep in", async () => {
    const git = fakeGit({
      responses: { [GIT_DIR]: "/repo/.git\n", "diff --cached --name-only": "other.txt\n" },
    });

    expect(await findCommitBlocker({ git, pathExists: async () => false })).toBe("index-not-empty");
  });

  test("reports a half-finished operation, whichever marker git left", async () => {
    for (const marker of ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"]) {
      const git = fakeGit({ responses: { [GIT_DIR]: "/repo/.git\n" } });

      const blocker = await findCommitBlocker({
        git,
        pathExists: async (path) => path === `/repo/.git/${marker}`,
      });

      expect(blocker).toBe("operation-in-progress");
    }
  });

  test("names the half-finished operation first, as the more urgent of the two", async () => {
    const git = fakeGit({
      responses: { [GIT_DIR]: "/repo/.git\n", "diff --cached --name-only": "other.txt\n" },
    });

    const blocker = await findCommitBlocker({ git, pathExists: async () => true });

    expect(blocker).toBe("operation-in-progress");
  });
});

describe("commit messages", () => {
  test("passes a description as a second -m, so git inserts the blank line", () => {
    expect(commitMessageArgs({ subject: "feat: x", body: "why" })).toEqual([
      "-m",
      "feat: x",
      "-m",
      "why",
    ]);
  });

  test("omits the second -m when there is no description", () => {
    expect(commitMessageArgs({ subject: "feat: x", body: "" })).toEqual(["-m", "feat: x"]);
  });

  test("joins the two parts for jj, which takes one string", () => {
    expect(joinCommitMessage({ subject: "feat: x", body: "why" })).toBe("feat: x\n\nwhy");
    expect(joinCommitMessage({ subject: "feat: x", body: "" })).toBe("feat: x");
  });
});

describe("createCommittingBackend", () => {
  const entries = [] as const;

  test("commits after staging", async () => {
    const git = fakeGit({});

    await createCommittingBackend({
      git,
      commitArgs: ["-m", "feat: x"],
      destination: "a new commit",
    }).stage(entries);

    expect(git.calls).toEqual([["commit", "-m", "feat: x"]]);
  });

  test("unstages again when the commit is refused, and reports the refusal", async () => {
    const git = fakeGit({ fails: "commit" });

    const backend = createCommittingBackend({
      git,
      commitArgs: ["-m", "feat: x"],
      destination: "a new commit",
    });

    await expect(backend.stage(entries)).rejects.toThrow("the pre-commit hook refused");

    // The index was empty before this ran — the caller checked — so a bare
    // reset puts it back exactly, leaving nothing half-staged behind.
    expect(git.calls.at(-1)).toEqual(["reset"]);
  });
});
