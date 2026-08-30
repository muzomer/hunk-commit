/**
 * Whether a path recovered from a patch may be acted on.
 *
 * Every path this extension reads, writes, or deletes is parsed out of patch
 * text, and the places it lands — `join(workspace.root, path)` when
 * discarding, and the staging directory jj's diff editor reads back — all
 * normalise `..` rather than confining it. `join("/repo", "../../etc/x")` is
 * `/etc/x`, not an error. So containment has to be established before the
 * join, never by it.
 *
 * Refusing costs nothing, because no working copy can describe what this
 * rejects: git and jj both emit repo-root-relative paths from any directory,
 * and git's one cwd-relative mode (`--relative`) omits files outside the cwd
 * rather than reaching them with `..`.
 */

/**
 * Read a path the way both POSIX and Windows would.
 *
 * Patches carry `/`, but a patch can be authored anywhere, and this runs on
 * either platform — so a backslash is treated as a separator rather than
 * assumed to be part of a filename. That is stricter than POSIX, where a
 * backslash is a legal character, and deliberately so: the paths it costs are
 * ones no diff of a working copy produces.
 */
function segments(path: string): readonly string[] {
  return path.split(/[/\\]/);
}

/**
 * Why this path must not be touched, or null when it is safe.
 *
 * A reason rather than a boolean, so the refusal can say which rule the path
 * broke — the reviewer sees a hostile-looking path and deserves to know what
 * was wrong with it.
 */
export function unsafePathReason(path: string): string | null {
  if (path === "") {
    return "the patch does not name a file";
  }

  // Checked by hand rather than with `isAbsolute`, which answers for the
  // platform this happens to run on: `C:\x` is not absolute to a Mac, and a
  // patch does not stop being a Windows patch when it is read on one.
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) {
    return "it is an absolute path";
  }

  if (segments(path).includes("..")) {
    return "it points outside the workspace with a `..` segment";
  }

  return null;
}
