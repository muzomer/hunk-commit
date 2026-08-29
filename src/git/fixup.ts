import { createCommittingBackend } from "./commit";
import type { CommitChoice } from "./history";
import type { StagingBackend } from "../staging/backend";
import type { Git } from "./repository";

/**
 * Put marked hunks into a commit that already exists — later.
 *
 * Git cannot move changes into an older commit without rewriting every commit
 * after it, and a rewrite that stops on a conflict would strand the reviewer
 * in a half-finished rebase inside a diff viewer. So this writes a `fixup!`
 * commit instead: an ordinary commit on top, marking where its contents
 * belong. History is untouched until the reviewer runs the rebase themselves,
 * at a moment they chose.
 */

/**
 * The message that tells `--autosquash` where these changes belong.
 *
 * Git matches what follows `fixup! ` against a commit's *title or its hash*,
 * and `git commit --fixup` writes the title. The hash is used here instead,
 * because titles repeat — two `wip` commits in one branch are enough to send
 * the fixup to the wrong place — and a full hash cannot be ambiguous.
 */
export function fixupSubject(sha: string): string {
  return `fixup! ${sha}`;
}

/**
 * The command that folds the fixups in, ready to be read out to the reviewer.
 *
 * A rebase is named by the commit *before* the one being changed, which the
 * root commit does not have — `--root` is how git says "from the beginning".
 *
 * `--autostash` is not a flourish: a fixup is usually made from a review that
 * still has unmarked hunks in it, and a rebase refuses to start on a dirty
 * working tree. Without it the command offered here would simply fail for the
 * reviewer who most needs it.
 */
export function autosquashCommand(target: CommitChoice): string {
  return `git rebase --autosquash --autostash ${target.isRoot ? "--root" : `${target.short}^`}`;
}

/** Commit the marked hunks as a `fixup!` for one existing commit. */
export function createGitFixupBackend(options: { git: Git; target: CommitChoice }): StagingBackend {
  return createCommittingBackend({
    git: options.git,
    commitArgs: ["-m", fixupSubject(options.target.sha)],
    destination: options.target.short,
  });
}
