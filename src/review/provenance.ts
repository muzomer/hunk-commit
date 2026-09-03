import type { Workspace } from "../workspace";

/** Runs one VCS command and returns its stdout. */
export type RunVcs = (args: readonly string[]) => Promise<string>;

/**
 * The paths the workspace currently reports as uncommitted.
 *
 * Untracked files count: a working-copy review includes them, so a review of
 * nothing but a new file is still a review of uncommitted work. Jujutsu needs
 * no equivalent question — it tracks new files into `@` on its own, so its
 * diff already names them.
 */
async function uncommittedPaths(workspace: Workspace, run: RunVcs): Promise<Set<string>> {
  const queries =
    workspace.kind === "jj"
      ? [["diff", "--name-only"]]
      : [
          ["diff", "--name-only", "HEAD"],
          ["ls-files", "--others", "--exclude-standard"],
        ];

  const outputs = await Promise.all(queries.map((args) => run(args)));

  return new Set(
    outputs
      .flatMap((output) => output.split("\n"))
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

/**
 * True when the review on screen contains uncommitted work.
 *
 * Every command here rewrites the working copy or reads it as the source of a
 * commit, so all of them assume the diff describes work that has not landed
 * yet. Hunk does not promise that: `hunk show` reviews a commit, and
 * `hunk diff <from> <to>` compares two revisions, and neither has a working
 * copy behind it.
 *
 * Usually that is caught anyway, further in, because the patch will not match
 * what is on disk. The case that survives is a clean checkout: reviewing
 * `HEAD~1 HEAD` there, the new side *is* what the files say, so every text
 * check agrees and `D` edits the working copy — reverting lines the reviewer
 * asked only to look at. The text is not lost, since the commit still holds
 * it, but nobody asked for the edit, and an unnoticed one rides along into
 * the next commit and undoes part of an earlier one. Content alone cannot
 * tell a working copy from history that agrees with it, so this asks the VCS
 * instead.
 *
 * Deliberately coarse. One question for the whole review, not one per file:
 * a review holding any uncommitted change is a working-copy review, and the
 * existing staleness and agreement checks are what catch a stale file inside
 * it. The narrow answer would be to match the reviewed hunks against the
 * working-copy diff, which means matching patches against a second source of
 * truth to defend a case those checks already reach.
 */
export async function reviewHasUncommittedWork(
  reviewedPaths: readonly string[],
  workspace: Workspace,
  run: RunVcs,
): Promise<boolean> {
  if (reviewedPaths.length === 0) {
    return false;
  }

  const uncommitted = await uncommittedPaths(workspace, run);

  return reviewedPaths.some((path) => uncommitted.has(path));
}
