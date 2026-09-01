/**
 * Which file types this extension can rebuild.
 *
 * Every path here is reconstructed the same way: take the working copy's text,
 * apply or revert the marked hunks, write the text back. That is only correct
 * for a regular file. Git stores a symlink as a file whose content is its
 * target, and a submodule as a file whose content is a commit id, so both
 * arrive as ordinary-looking text hunks and neither survives being written
 * back as text — a symlink would either be followed to wherever it points or
 * flattened into a regular file, and a submodule is not a file at all.
 *
 * The alternative to refusing is teaching the whole pipeline about file types,
 * which is a much larger change for cases a reviewer meets rarely. Refusing is
 * the honest answer: this cannot rebuild them, so it declines to try.
 */

/** The modes a patch may name: a regular file, executable or not. */
const REGULAR_MODES = new Set(["100644", "100755"]);

const MODE_NAMES: Readonly<Record<string, string>> = {
  "120000": "a symbolic link",
  "160000": "a submodule",
  "040000": "a directory",
  "040755": "a directory",
};

/**
 * Why the file this patch describes cannot be rebuilt, or null when it can.
 *
 * An allowlist rather than a list of known-bad modes: a mode nobody here has
 * seen is a mode nobody here has reasoned about, and the failure mode of
 * guessing wrong is writing the wrong thing to disk.
 */
export function unsupportedModeReason(modes: readonly string[]): string | null {
  for (const mode of modes) {
    if (REGULAR_MODES.has(mode)) {
      continue;
    }

    const name = MODE_NAMES[mode];
    return name === undefined
      ? `it has an unrecognised file mode (${mode})`
      : `it is ${name}, which hunks cannot describe`;
  }

  return null;
}
