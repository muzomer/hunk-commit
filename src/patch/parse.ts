/**
 * A minimal parser for the single-file git-format patches Hunk hands to
 * extensions (`ExtensionDiffFile.patch`, produced by `jj diff --git`).
 *
 * Hunk already parses these patches for rendering, and reports each hunk's
 * index and line spans. We parse them again because rendering summaries are
 * not enough to *rebuild* a file: that needs each hunk's actual lines. The two
 * parses are cross-checked before anything is written — see `agreesWithHost`.
 */

export type PatchLineKind = "context" | "added" | "removed";

export interface PatchLine {
  readonly kind: PatchLineKind;
  /** Line content with the diff marker stripped and no trailing newline. */
  readonly text: string;
  /** True when `\ No newline at end of file` followed this line. */
  readonly noNewlineAtEof: boolean;
}

export interface PatchHunk {
  readonly index: number;
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly PatchLine[];
}

export type FileChangeKind = "added" | "deleted" | "renamed" | "modified";

export interface FilePatch {
  /** The file's new-side path, or its old path when the file was deleted. */
  readonly path: string;
  /** The old path, present only for a rename. */
  readonly previousPath?: string;
  readonly change: FileChangeKind;
  /** True when the patch carries no usable text hunks because the file is binary. */
  readonly binary: boolean;
  readonly hunks: readonly PatchHunk[];
}

export class PatchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchParseError";
  }
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const DEV_NULL = "/dev/null";

/** Strip git's `a/` or `b/` prefix from a `---`/`+++` path. */
function stripPathPrefix(value: string): string {
  if (value === DEV_NULL) {
    return DEV_NULL;
  }
  return value.startsWith("a/") || value.startsWith("b/") ? value.slice(2) : value;
}

interface Header {
  oldPath: string;
  newPath: string;
  /** Paths recovered from the `diff --git` line, used when there are no `---`/`+++` lines. */
  gitLinePaths?: { old: string; new: string };
  renamedFrom?: string;
  renamedTo?: string;
  explicitChange?: "added" | "deleted";
  binary: boolean;
  /** Index of the first line that is not part of the header. */
  bodyStart: number;
}

/**
 * Recover both paths from a `diff --git a/x b/y` line.
 *
 * Only a fallback: a binary patch carries no `---`/`+++` lines, and this is the
 * one place the paths still appear. The form is ambiguous for paths containing
 * " b/", so prefer a split where both sides agree — the overwhelmingly common
 * case, since only a rename makes them differ.
 */
function parseGitLinePaths(rest: string): { old: string; new: string } | undefined {
  const candidates: { old: string; new: string }[] = [];

  for (let index = rest.indexOf(" b/"); index !== -1; index = rest.indexOf(" b/", index + 1)) {
    if (!rest.startsWith("a/")) {
      break;
    }
    candidates.push({ old: rest.slice(2, index), new: rest.slice(index + 3) });
  }

  return candidates.find((candidate) => candidate.old === candidate.new) ?? candidates[0];
}

function parseHeader(lines: readonly string[]): Header {
  const header: Header = { oldPath: "", newPath: "", binary: false, bodyStart: lines.length };

  for (const [index, line] of lines.entries()) {
    if (HUNK_HEADER.test(line)) {
      header.bodyStart = index;
      break;
    }

    if (line.startsWith("diff --git ")) {
      header.gitLinePaths = parseGitLinePaths(line.slice("diff --git ".length));
    } else if (line.startsWith("--- ")) {
      header.oldPath = stripPathPrefix(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      header.newPath = stripPathPrefix(line.slice(4));
    } else if (line.startsWith("rename from ")) {
      header.renamedFrom = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      header.renamedTo = line.slice("rename to ".length);
    } else if (line.startsWith("new file mode")) {
      header.explicitChange = "added";
    } else if (line.startsWith("deleted file mode")) {
      header.explicitChange = "deleted";
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      header.binary = true;
    }
  }

  return header;
}

function resolvePaths(header: Header): Pick<FilePatch, "path" | "previousPath" | "change"> {
  const renamed = header.renamedFrom !== undefined && header.renamedTo !== undefined;
  const oldPath = header.oldPath || header.gitLinePaths?.old || "";
  const newPath = header.newPath || header.gitLinePaths?.new || "";
  const path = renamed
    ? header.renamedTo!
    : newPath !== DEV_NULL && newPath !== ""
      ? newPath
      : oldPath;

  const change: FileChangeKind = header.explicitChange
    ? header.explicitChange
    : renamed
      ? "renamed"
      : oldPath === DEV_NULL
        ? "added"
        : newPath === DEV_NULL
          ? "deleted"
          : "modified";

  return renamed ? { path, previousPath: header.renamedFrom, change } : { path, change };
}

/**
 * Read one hunk's body, consuming exactly the line counts its header declares.
 *
 * Counting rather than pattern-matching is what keeps an empty context line
 * (which some emitters write as `""` rather than `" "`) from being mistaken for
 * the end of the hunk.
 */
function parseHunkBody(
  lines: readonly string[],
  start: number,
  oldCount: number,
  newCount: number,
): { lines: PatchLine[]; next: number } {
  const body: PatchLine[] = [];
  let remainingOld = oldCount;
  let remainingNew = newCount;
  let cursor = start;

  while ((remainingOld > 0 || remainingNew > 0) && cursor < lines.length) {
    const line = lines[cursor] ?? "";
    cursor += 1;

    const marker = line.slice(0, 1);
    const text = line.slice(1);

    if (marker === "+") {
      body.push({ kind: "added", text, noNewlineAtEof: false });
      remainingNew -= 1;
    } else if (marker === "-") {
      body.push({ kind: "removed", text, noNewlineAtEof: false });
      remainingOld -= 1;
    } else if (marker === " " || line === "") {
      body.push({ kind: "context", text, noNewlineAtEof: false });
      remainingOld -= 1;
      remainingNew -= 1;
    } else if (marker === "\\") {
      markPreviousLineWithoutNewline(body);
    } else {
      throw new PatchParseError(`Unexpected line in hunk body: ${JSON.stringify(line)}`);
    }
  }

  // A `\ No newline` marker for the hunk's last line sits past the counted lines.
  if (cursor < lines.length && (lines[cursor] ?? "").startsWith("\\")) {
    markPreviousLineWithoutNewline(body);
    cursor += 1;
  }

  if (remainingOld > 0 || remainingNew > 0) {
    throw new PatchParseError("Hunk body ended before its declared line counts were satisfied");
  }

  return { lines: body, next: cursor };
}

function markPreviousLineWithoutNewline(body: PatchLine[]): void {
  const previous = body[body.length - 1];
  if (previous) {
    body[body.length - 1] = { ...previous, noNewlineAtEof: true };
  }
}

/** Parse one file's patch text. Throws `PatchParseError` on anything unrecognised. */
export function parseFilePatch(patchText: string): FilePatch {
  const lines = patchText.split("\n");
  const header = parseHeader(lines);
  const hunks: PatchHunk[] = [];

  let cursor = header.bodyStart;
  while (cursor < lines.length) {
    const match = HUNK_HEADER.exec(lines[cursor] ?? "");
    if (!match) {
      cursor += 1;
      continue;
    }

    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);

    const body = parseHunkBody(lines, cursor + 1, oldCount, newCount);
    hunks.push({ index: hunks.length, oldStart, oldCount, newStart, newCount, lines: body.lines });
    cursor = body.next;
  }

  return { ...resolvePaths(header), binary: header.binary, hunks };
}

/** One hunk's inclusive line span on one side, using Hunk's own convention. */
export function hunkRange(hunk: PatchHunk, side: "old" | "new"): [number, number] {
  const start = side === "new" ? hunk.newStart : hunk.oldStart;
  const count = side === "new" ? hunk.newCount : hunk.oldCount;
  return [start, start + Math.max(count, 1) - 1];
}

/** The lines this hunk expects to find on one side of the diff. */
export function hunkSideLines(hunk: PatchHunk, side: "old" | "new"): string[] {
  const excluded: PatchLineKind = side === "new" ? "removed" : "added";
  return hunk.lines.filter((line) => line.kind !== excluded).map((line) => line.text);
}

/** True when a hunk's last line on one side drops the file's trailing newline. */
export function hunkDropsFinalNewline(hunk: PatchHunk, side: "old" | "new"): boolean {
  const excluded: PatchLineKind = side === "new" ? "removed" : "added";
  const sideLines = hunk.lines.filter((line) => line.kind !== excluded);
  return sideLines[sideLines.length - 1]?.noNewlineAtEof ?? false;
}
