import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createJjBackend } from "../src/jj/backend";
import type { JjDestination } from "../src/jj/tool";
import { createJj } from "../src/jj/repository";
import type { FileMark } from "../src/staging/plan";
import { stageMarkedHunks, type StageOutcome } from "../src/staging/stage";
import { createTestRepository, hasJujutsu, type TestRepository } from "./support/repo";
import { reviewFromPatch } from "./support/review";

/**
 * These tests drive a real `jj` binary against a real workspace. They are the
 * only place the whole path is exercised: marks in, `jj` operation out, with
 * the helper script and jj's own diff-editor protocol in between.
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

/** Stage `marks` into `@-`, using the working copy's current diff as the review. */
async function stage(
  marks: Record<string, FileMark>,
  destination: JjDestination = { kind: "revision", revset: "@-" },
): Promise<StageOutcome> {
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

  return stageMarkedHunks(
    { files, marks: marksById },
    {
      backend: createJjBackend({ jj: createJj({ root: repository.root }), destination }),
      readWorkingCopyFile: (path) => readFile(join(repository.root, path), "utf8"),
    },
  );
}

const changedLines = (patch: string) =>
  patch
    .split("\n")
    .filter((line) => /^[+-](?!\+\+|--)/.test(line))
    .join("\n");

describeWithJj("staging part of a file", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.jj("commit", "-m", "base");

    const edited = numberedLines(20)
      .replace("line 3\n", "line 3 CHANGED\n")
      .replace("line 17\n", "line 17 CHANGED\n");
    await repository.write("f.txt", edited);
  });

  test("moves only the marked hunk and leaves the working copy file untouched", async () => {
    const before = await repository.read("f.txt");
    expect((await repository.jj("diff", "--git")).match(/^@@/gm)).toHaveLength(2);

    const outcome = await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    expect(changedLines(await repository.jj("diff", "--git", "-r", "@-"))).toContain(
      "+line 3 CHANGED",
    );
    expect(changedLines(await repository.jj("diff", "--git", "-r", "@-"))).not.toContain(
      "line 17 CHANGED",
    );
    expect(changedLines(await repository.jj("diff", "--git"))).toBe(
      "-line 17\n+line 17 CHANGED",
    );

    // The point of staging: ownership moved, the file on disk did not.
    expect(await repository.read("f.txt")).toBe(before);
  });

  test("moves everything when every hunk is marked", async () => {
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([0, 1]) } });

    expect(await repository.jj("diff", "--git")).toBe("");
    const target = await repository.jj("diff", "--git", "-r", "@-");
    expect(target).toContain("line 3 CHANGED");
    expect(target).toContain("line 17 CHANGED");
  });

  test("leaves the repository alone when the working copy moved on", async () => {
    const files = reviewFromPatch(await repository.jj("diff", "--git"));
    await repository.write("f.txt", numberedLines(20).replace("line 3\n", "line 3 EDITED\n"));
    const workingCopyBefore = await repository.jj("diff", "--git");

    const outcome = await stageMarkedHunks(
      {
        files,
        marks: new Map([[files[0]!.id, { kind: "hunks", hunks: new Set([0]) }]]),
      },
      {
        backend: createJjBackend({ jj: createJj({ root: repository.root }), destination: { kind: "revision", revset: "@-" } }),
        readWorkingCopyFile: (path) => readFile(join(repository.root, path), "utf8"),
      },
    );

    expect(outcome.kind).toBe("stale");
    expect(await repository.jj("diff", "--git")).toBe(workingCopyBefore);
  });
});

describeWithJj("staging whole-file changes", () => {
  test("an unmarked new file stays in the working copy", async () => {
    await repository.write("kept.txt", "kept\n");
    await repository.jj("commit", "-m", "base");
    await repository.write("added.txt", "new file\n");
    await repository.write("kept.txt", "kept and changed\n");

    await stage({ "kept.txt": { kind: "whole" } });

    expect(await repository.jj("diff", "--git", "-r", "@-")).not.toContain("added.txt");
    expect(await repository.jj("diff", "--git")).toContain("added.txt");
    expect(await repository.read("added.txt")).toBe("new file\n");
  });

  test("a marked new file moves whole", async () => {
    await repository.write("kept.txt", "kept\n");
    await repository.jj("commit", "-m", "base");
    await repository.write("added.txt", "new file\n");

    await stage({ "added.txt": { kind: "whole" } });

    expect(await repository.jj("diff", "--git", "-r", "@-")).toContain("added.txt");
    expect(await repository.jj("diff", "--git")).toBe("");
    expect(await repository.read("added.txt")).toBe("new file\n");
  });

  test("an unmarked deletion stays in the working copy", async () => {
    await repository.write("doomed.txt", "bye\n");
    await repository.write("other.txt", "a\n");
    await repository.jj("commit", "-m", "base");
    await repository.write("other.txt", "b\n");
    await rm(join(repository.root, "doomed.txt"));

    await stage({ "other.txt": { kind: "whole" } });

    // The deletion did not move: the target still has the file, and removing
    // it is still the working copy's pending change.
    expect(await repository.jj("file", "list", "-r", "@-")).toContain("doomed.txt");
    expect(await repository.jj("diff", "--git")).toContain("doomed.txt");
  });

  test("a marked deletion moves to the target", async () => {
    await repository.write("doomed.txt", "bye\n");
    await repository.jj("commit", "-m", "base");
    await rm(join(repository.root, "doomed.txt"));

    await stage({ "doomed.txt": { kind: "whole" } });

    expect(await repository.jj("file", "list", "-r", "@-")).not.toContain("doomed.txt");
    expect(await repository.jj("diff", "--git")).toBe("");
  });

  test("an unmarked rename stays in the working copy", async () => {
    await repository.write("before.txt", "content\n");
    await repository.write("other.txt", "a\n");
    await repository.jj("commit", "-m", "base");
    await rm(join(repository.root, "before.txt"));
    await repository.write("after.txt", "content\n");
    await repository.write("other.txt", "b\n");

    await stage({ "other.txt": { kind: "whole" } });

    const target = await repository.jj("file", "list", "-r", "@-");
    expect(target).toContain("before.txt");
    expect(target).not.toContain("after.txt");
    expect(await repository.read("after.txt")).toBe("content\n");
  });

  test("an unmarked binary file stays in the working copy", async () => {
    await repository.jj("commit", "-m", "base");
    await Bun.write(join(repository.root, "blob.bin"), new Uint8Array([0, 1, 2, 0, 255]));
    await repository.write("text.txt", "hello\n");

    await stage({ "text.txt": { kind: "whole" } });

    expect(await repository.jj("diff", "--git", "-r", "@-")).not.toContain("blob.bin");
    expect(await repository.jj("diff", "--git")).toContain("blob.bin");
  });
});

describeWithJj("extracting a new revision", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.jj("commit", "-m", "base");

    await repository.write(
      "f.txt",
      numberedLines(20)
        .replace("line 3\n", "line 3 CHANGED\n")
        .replace("line 17\n", "line 17 CHANGED\n"),
    );
    await repository.jj("describe", "-m", "work in progress");
  });

  /** Descriptions from `@` down to the base, bracketed so empty ones still show. */
  const descriptions = async () =>
    (
      await repository.jj(
        "log",
        "--no-graph",
        "-T",
        '"[" ++ description.first_line() ++ "]\n"',
        "-r",
        "::@ ~ root()",
      )
    )
      .split("\n")
      .filter(Boolean);

  test("puts the marked hunks in a new revision below the working copy", async () => {
    const before = await repository.read("f.txt");

    const outcome = await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, {
      kind: "new",
      message: "extracted hunk",
    });

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    expect(await descriptions()).toEqual(["[work in progress]", "[extracted hunk]", "[base]"]);

    // The new revision holds only what was marked; the rest is still in @.
    expect(changedLines(await repository.jj("diff", "--git", "-r", "@-"))).toBe(
      "-line 3\n+line 3 CHANGED",
    );
    expect(changedLines(await repository.jj("diff", "--git"))).toBe(
      "-line 17\n+line 17 CHANGED",
    );
    expect(await repository.read("f.txt")).toBe(before);
  });

  test("rewrites no existing revision", async () => {
    const baseBefore = await repository.jj("log", "--no-graph", "-T", "commit_id", "-r", "@--");

    await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } }, {
      kind: "new",
      message: "extracted hunk",
    });

    // Splitting inserts a revision; the change it was split out of is the only
    // one rewritten, so everything below is untouched.
    expect(await repository.jj("log", "--no-graph", "-T", "commit_id", "-r", "@---")).toBe(
      baseBefore,
    );
  });

  test("accepts an empty description without opening an editor", async () => {
    await stage({ "f.txt": { kind: "hunks", hunks: new Set([1]) } }, { kind: "new", message: "" });

    expect(await descriptions()).toEqual(["[work in progress]", "[]", "[base]"]);
  });
});

describeWithJj("refusing to stage nothing", () => {
  beforeEach(async () => {
    await repository.write("f.txt", numberedLines(20));
    await repository.jj("commit", "-m", "base");
    await repository.write("f.txt", numberedLines(20).replace("line 3\n", "line 3 CHANGED\n"));
  });

  test("creates no revision when the marks are gone by staging time", async () => {
    const before = await repository.jj("log", "--no-graph", "-T", 'commit_id ++ "\n"', "-r", "::@");

    // What a reload between marking and staging leaves behind: a review with
    // files but no marks. Splitting on that would answer with an empty
    // revision, which is indistinguishable from staging that lost its marks.
    const outcome = await stage({});

    expect(outcome).toEqual({ kind: "nothing-staged" });
    expect(await repository.jj("log", "--no-graph", "-T", 'commit_id ++ "\n"', "-r", "::@")).toBe(
      before,
    );
    expect(changedLines(await repository.jj("diff", "--git"))).toBe(
      "-line 3\n+line 3 CHANGED",
    );
  });

  test("refuses the same way when extracting a new revision", async () => {
    const outcome = await stage({}, { kind: "new", message: "would be empty" });

    expect(outcome).toEqual({ kind: "nothing-staged" });
    expect(await repository.jj("log", "--no-graph", "-T", 'description.first_line()')).not.toContain(
      "would be empty",
    );
  });
});

describeWithJj("a hunk containing a blank added line", () => {
  test("stages the blank line too, though nothing can paint it", async () => {
    await repository.write("f.txt", "alpha\nbravo\ncharlie\n");
    await repository.jj("commit", "-m", "base");
    // A blank line and a real one, added together as one hunk.
    await repository.write("f.txt", "alpha\nbravo\n\nadded line\ncharlie\n");

    const outcome = await stage({ "f.txt": { kind: "hunks", hunks: new Set([0]) } });

    expect(outcome).toEqual({ kind: "staged", files: 1, hunks: 1 });
    // Both added lines moved: the blank one is part of the hunk that was marked.
    expect(await repository.jj("file", "show", "-r", "@-", "f.txt")).toBe(
      "alpha\nbravo\n\nadded line\ncharlie\n",
    );
    expect(await repository.jj("diff", "--git")).toBe("");
  });
});
