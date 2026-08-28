import { writeSelectedHunks } from "../patch/write";
import type { StagedEntry, StagingBackend } from "../staging/backend";
import type { Git } from "./repository";

/**
 * Stage into the git index.
 *
 * Git already has the concept this extension is named for, so the mapping is
 * direct — and simpler than Jujutsu's, in one telling way: a file nobody
 * marked needs no instruction at all. "Not staged" is git's default state,
 * whereas a Jujutsu revision has to be told what stays behind.
 *
 * Two paths, chosen per file:
 *
 * - A whole file goes through `git add`, which handles binaries, renames, and
 *   mode changes natively rather than through a patch.
 * - Part of a file goes through `git apply --cached` with a patch carrying
 *   only the marked hunks. `hunk diff` shows the working tree against the
 *   index, so that patch applies exactly where it was measured, and composes
 *   with whatever was staged before.
 */
export function createGitBackend(options: { git: Git }): StagingBackend {
  return {
    destination: "the index",

    async stage(entries) {
      const wholeFilePaths = entries
        .filter((entry) => entry.disposition.kind === "leave")
        .map((entry) => entry.patch.path);

      const patches = entries.flatMap((entry) =>
        entry.disposition.kind === "rebuild"
          ? (writeSelectedHunks(entry.patch, entry.disposition.selected) ?? [])
          : [],
      );

      if (wholeFilePaths.length > 0) {
        await options.git.run(["add", "--", ...wholeFilePaths]);
      }

      for (const patch of patches) {
        await options.git.run(["apply", "--cached", "-"], patch);
      }
    },
  };
}
