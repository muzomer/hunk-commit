import type { Git } from "./repository";

/**
 * The commits a reviewer may put marked hunks into.
 *
 * Only commits that have not been pushed are offered. Rewriting a commit that
 * someone else may already have is the one genuinely dangerous thing this
 * extension could do, so the danger is removed by not listing it: the picker
 * cannot offer what it must not touch, and no warning dialog has to exist.
 */
export interface CommitChoice {
  /** The full hash, which is what the fixup message points at. */
  readonly sha: string;
  /** The abbreviated hash, which is what the reviewer reads. */
  readonly short: string;
  /** What the picker shows. */
  readonly label: string;
  /** True for a commit with no parent, which rebases differently. */
  readonly isRoot: boolean;
}

const SEPARATOR = "\t";

// `%P` is empty for a root commit, which is the one commit `<sha>^` cannot
// name — the difference decides which rebase the reviewer is told to run.
const FORMAT = ["%H", "%h", "%P", "%s"].join(SEPARATOR);

/** Commits on this branch that the upstream does not have yet. */
export const UNPUSHED_ARGS = ["log", "--format=" + FORMAT, "--max-count=20", "@{upstream}..HEAD"];

/**
 * The last commits on this branch, used when there is no upstream at all.
 *
 * A branch that was never pushed has nothing published to protect, so the
 * recent history is safe to offer. `--max-count` keeps the picker readable
 * rather than complete; anything older is better reached from a terminal.
 */
export const RECENT_ARGS = ["log", "--format=" + FORMAT, "--max-count=20", "HEAD"];

/** Parse the `git log` output produced by the argument lists above. */
export function parseCommitChoices(output: string): CommitChoice[] {
  return output
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [sha, short = "", parents = "", subject = ""] = line.split(SEPARATOR);
      if (!sha || !short) {
        return [];
      }

      return [{ sha, short, label: `${short}  ${subject}`, isRoot: parents.trim() === "" }];
    });
}

/**
 * List the commits worth offering, falling back when there is no upstream.
 *
 * `@{upstream}` fails rather than resolving when the branch tracks nothing, or
 * when HEAD is detached, which is why the fallback is reached through a catch:
 * git is the authority on whether the reference exists, and asking it first
 * would be the same question twice.
 */
export async function listFixupTargets(git: Git): Promise<CommitChoice[]> {
  try {
    return parseCommitChoices(await git.run(UNPUSHED_ARGS));
  } catch {
    return parseCommitChoices(await git.run(RECENT_ARGS));
  }
}
