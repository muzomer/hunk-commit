import { describe, expect, test } from "bun:test";
import { autosquashCommand, fixupSubject } from "../src/git/fixup";
import { parseCommitChoices, RECENT_ARGS, UNPUSHED_ARGS } from "../src/git/history";

describe("fixupSubject", () => {
  test("points at the full hash, which cannot be ambiguous", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";

    // Git matches what follows "fixup! " against a title *or* a hash. Titles
    // repeat; two "wip" commits would be enough to misroute a fixup.
    expect(fixupSubject(sha)).toBe(`fixup! ${sha}`);
  });
});

describe("autosquashCommand", () => {
  const target = { sha: "abc", short: "abc123d", label: "", isRoot: false };

  test("names the commit before the target, which is what a rebase takes", () => {
    expect(autosquashCommand(target)).toBe("git rebase --autosquash --autostash abc123d^");
  });

  test("uses --root for the first commit, which has nothing before it", () => {
    expect(autosquashCommand({ ...target, isRoot: true })).toBe(
      "git rebase --autosquash --autostash --root",
    );
  });
});

describe("parseCommitChoices", () => {
  const output =
    "0123456789abcdef0123456789abcdef01234567\t0123456\t89abcdef\tfeat: add the thing\n" +
    "89abcdef0123456789abcdef0123456789abcdef\t89abcde\t\tfix: the other thing\n";

  test("reads each commit, showing the short hash and the subject", () => {
    expect(parseCommitChoices(output)).toEqual([
      {
        sha: "0123456789abcdef0123456789abcdef01234567",
        short: "0123456",
        label: "0123456  feat: add the thing",
        isRoot: false,
      },
      {
        // No parent hash: the first commit in the repository.
        sha: "89abcdef0123456789abcdef0123456789abcdef",
        short: "89abcde",
        label: "89abcde  fix: the other thing",
        isRoot: true,
      },
    ]);
  });

  test("keeps a commit whose subject is empty", () => {
    expect(parseCommitChoices("abc123def456\tabc123d\tparent\t\n")).toEqual([
      { sha: "abc123def456", short: "abc123d", label: "abc123d  ", isRoot: false },
    ]);
  });

  test("reads nothing out of nothing", () => {
    expect(parseCommitChoices("")).toEqual([]);
    expect(parseCommitChoices("\n\n")).toEqual([]);
  });

  test("asks for the unpushed commits, and falls back to recent ones", () => {
    // The distinction is the safety property: the first list can only contain
    // commits nobody else has, so the picker cannot offer a published commit.
    expect(UNPUSHED_ARGS).toContain("@{upstream}..HEAD");
    expect(RECENT_ARGS).toContain("HEAD");
    expect(RECENT_ARGS).not.toContain("@{upstream}..HEAD");
  });
});
