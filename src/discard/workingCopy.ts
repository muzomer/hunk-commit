import { constants as fsConstants } from "node:fs";
import { mkdir, readFile, rm, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DiscardEnvironment } from "./discard";

/**
 * The working copy, as discarding sees it.
 *
 * Lives here rather than inline at the call site so the guarantees below are
 * the ones the tests exercise. An environment assembled separately in a test
 * would pass while the real one wrote through a symlink.
 */
export function createWorkingCopyEnvironment(root: string): DiscardEnvironment {
  const resolve = (path: string) => join(root, path);

  return {
    readWorkingCopyFile: (path) => readFile(resolve(path), "utf8"),
    writeWorkingCopyFile: async (path, content) => {
      await mkdir(dirname(resolve(path)), { recursive: true });
      await writeContainedFile(resolve(path), content);
    },
    // `rm` unlinks the name it is given; unlike a write, it never follows a
    // symlink to its target.
    removeWorkingCopyFile: (path) => rm(resolve(path), { force: true }),
  };
}

/**
 * Write a file, refusing to follow a symbolic link at the destination.
 *
 * `checkReviewedFile` already turns away a patch that declares a symlink, so
 * reaching one here means the working copy and the patch disagree — the file
 * was replaced between the diff and this write. `O_NOFOLLOW` makes that
 * disagreement an error (`ELOOP`) instead of a write to wherever the link
 * points, which the path check cannot prevent: that establishes the *path*
 * stays inside the workspace, and a symlink is about where the *destination*
 * leads.
 */
async function writeContainedFile(absolutePath: string, content: string): Promise<void> {
  const handle = await open(
    absolutePath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
  );

  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}
