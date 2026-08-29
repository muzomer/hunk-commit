import { createGitBackend } from "./backend";
import type { CommitMessage } from "../staging/message";
import type { StagingBackend } from "../staging/backend";
import type { Git } from "./repository";

/**
 * Commit the marked hunks in a git repository.
 *
 * Committing is staging plus one more command, so this wraps the index backend
 * rather than reimplementing it: the marked hunks land in the index exactly as
 * `S` would put them there, and then `git commit` turns them into a commit.
 *
 * That extra command is why committing asks more of the repository than
 * staging does. `git commit` commits *the whole index*, not the patch just
 * applied, so anything already staged would ride along silently — and a
 * half-finished rebase makes "the current commit" mean something the reviewer
 * did not intend. Both are checked before anything is written.
 */

/** Why this repository cannot be committed to right now. */
export type CommitBlocker =
  /** Something is staged already, and `git commit` would sweep it in. */
  | "index-not-empty"
  /** A rebase, merge, cherry-pick, or revert is half-finished. */
  | "operation-in-progress";

/** What the checks need: git itself, and a way to look for git's state files. */
export interface CommitPreconditions {
  readonly git: Git;
  /** True when the path exists. Injected so the checks stay testable. */
  pathExists(path: string): Promise<boolean>;
}

/**
 * The files git leaves behind while an operation is only half-applied.
 *
 * `rebase-merge` and `rebase-apply` are directories, the rest are files;
 * existence is the signal either way.
 */
const IN_PROGRESS_MARKERS = [
  "rebase-merge",
  "rebase-apply",
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
] as const;

/**
 * Find what stands in the way of committing, or null when nothing does.
 *
 * Returns a reason rather than throwing, and a code rather than a sentence, so
 * every word the reviewer reads still lives in `src/ui/messages.ts`.
 */
export async function findCommitBlocker(
  preconditions: CommitPreconditions,
): Promise<CommitBlocker | null> {
  const gitDir = (await preconditions.git.run(["rev-parse", "--absolute-git-dir"])).trim();

  for (const marker of IN_PROGRESS_MARKERS) {
    if (await preconditions.pathExists(`${gitDir}/${marker}`)) {
      return "operation-in-progress";
    }
  }

  // `--name-only` reports the paths that differ between HEAD and the index, so
  // no output means nothing is staged. Asking this way rather than with
  // `--quiet` keeps a non-empty index from arriving as a thrown error.
  const staged = await preconditions.git.run(["diff", "--cached", "--name-only"]);
  return staged.trim() === "" ? null : "index-not-empty";
}

/**
 * Turn a message into `git commit` arguments.
 *
 * Passing the body as a second `-m` lets git join the two with the blank line
 * a commit message needs, instead of this code having to build that shape.
 */
export function commitMessageArgs(message: CommitMessage): string[] {
  return message.body === "" ? ["-m", message.subject] : ["-m", message.subject, "-m", message.body];
}

/**
 * Stage the entries, then commit exactly them.
 *
 * The rollback is what makes this safe to retry: the caller has already
 * established that the index was empty, so if `git commit` fails — a rejecting
 * `pre-commit` hook, most often — `git reset` restores precisely the state
 * from before. Without it a failed commit would leave the marked hunks staged,
 * and the next attempt would trip the index check with no explanation.
 *
 * Exported because a fixup is the same two steps under a different message.
 */
export function createCommittingBackend(options: {
  git: Git;
  commitArgs: readonly string[];
  destination: string;
}): StagingBackend {
  const index = createGitBackend({ git: options.git });

  return {
    destination: options.destination,

    async stage(entries) {
      await index.stage(entries);

      try {
        await options.git.run(["commit", ...options.commitArgs]);
      } catch (error) {
        await options.git.run(["reset"]);
        throw error;
      }
    },
  };
}

/** Commit the marked hunks as a new commit on the current branch. */
export function createGitCommitBackend(options: { git: Git; message: CommitMessage }): StagingBackend {
  return createCommittingBackend({
    git: options.git,
    commitArgs: commitMessageArgs(options.message),
    destination: "a new commit",
  });
}
