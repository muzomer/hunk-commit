import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Which version control system a review sits in, and where its root is. */
export interface Workspace {
  readonly kind: "jj" | "git";
  readonly root: string;
}

/**
 * Find the workspace containing a directory.
 *
 * The nearest checkout wins, and Jujutsu wins a tie. That mirrors how Hunk
 * itself picks a backend: a colocated repository carries both `.jj` and
 * `.git`, and there the working copy Hunk is showing is the Jujutsu one, so
 * staging has to agree with the diff on screen.
 */
export function detectWorkspace(startDirectory: string): Workspace | null {
  let current = resolve(startDirectory);

  for (;;) {
    if (existsSync(join(current, ".jj"))) {
      return { kind: "jj", root: current };
    }

    if (existsSync(join(current, ".git"))) {
      return { kind: "git", root: current };
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
