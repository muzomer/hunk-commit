import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createGit } from "../src/git/repository";
import { reviewHasUncommittedWork } from "../src/review/provenance";
import { createTestGitRepository, hasGit, type TestGitRepository } from "./support/gitRepo";

/** Records what was asked, and answers with canned stdout. */
function fakeVcs(answers: Record<string, string>) {
  const asked: string[][] = [];

  return {
    asked,
    run: async (args: readonly string[]) => {
      asked.push([...args]);
      return answers[args.join(" ")] ?? "";
    },
  };
}

const git = { kind: "git", root: "/repo" } as const;
const jj = { kind: "jj", root: "/repo" } as const;

describe("reviewHasUncommittedWork", () => {
  test("sees a reviewed file that git reports as modified", async () => {
    const vcs = fakeVcs({ "diff --name-only HEAD": "src/a.ts\nsrc/b.ts\n" });

    expect(await reviewHasUncommittedWork(["src/b.ts"], git, vcs.run)).toBe(true);
  });

  test("counts an untracked file as uncommitted work", async () => {
    // The case a name-only diff alone would miss: a review whose only content
    // is a file git has never seen is still a review of the working copy.
    const vcs = fakeVcs({ "ls-files --others --exclude-standard": "new.ts\n" });

    expect(await reviewHasUncommittedWork(["new.ts"], git, vcs.run)).toBe(true);
  });

  test("refuses a review whose files are all committed", async () => {
    const vcs = fakeVcs({ "diff --name-only HEAD": "somewhere/else.ts\n" });

    expect(await reviewHasUncommittedWork(["src/a.ts"], git, vcs.run)).toBe(false);
  });

  test("refuses an empty review without asking the VCS anything", async () => {
    const vcs = fakeVcs({});

    expect(await reviewHasUncommittedWork([], git, vcs.run)).toBe(false);
    expect(vcs.asked).toEqual([]);
  });

  test("asks jj one question, since it tracks new files itself", async () => {
    const vcs = fakeVcs({ "diff --name-only": "src/a.ts\n" });

    expect(await reviewHasUncommittedWork(["src/a.ts"], jj, vcs.run)).toBe(true);
    expect(vcs.asked).toEqual([["diff", "--name-only"]]);
  });

  test("lets one uncommitted file carry the whole review", async () => {
    // Deliberate: the check is per review, not per file. A stale file inside a
    // working-copy review is what the staleness and agreement checks are for.
    const vcs = fakeVcs({ "diff --name-only HEAD": "dirty.ts\n" });

    expect(await reviewHasUncommittedWork(["committed.ts", "dirty.ts"], git, vcs.run)).toBe(true);
  });
});

describe("reviewHasUncommittedWork against a real repository", () => {
  let repository: TestGitRepository;
  let available = false;

  beforeAll(async () => {
    available = await hasGit();
    if (available) {
      repository = await createTestGitRepository();
    }
  });

  afterAll(async () => {
    await repository?.dispose();
  });

  test("refuses the clean checkout that every text check would pass", async () => {
    if (!available) {
      return;
    }

    // The one case content cannot catch: reviewing `HEAD~1 HEAD` with nothing
    // uncommitted. The new side is exactly what is on disk, so the patch
    // matches the file perfectly — and discarding it would edit the working
    // copy nobody asked to change.
    await repository.write("a.ts", "one\n");
    await repository.git("add", "a.ts");
    await repository.git("commit", "-qm", "first");
    await repository.write("a.ts", "two\n");
    await repository.git("commit", "-qam", "second");

    const run = createGit({ root: repository.root }).run;

    expect(await reviewHasUncommittedWork(["a.ts"], { kind: "git", root: repository.root }, run)).toBe(
      false,
    );

    await repository.write("a.ts", "three\n");

    expect(await reviewHasUncommittedWork(["a.ts"], { kind: "git", root: repository.root }, run)).toBe(
      true,
    );
  });
});
