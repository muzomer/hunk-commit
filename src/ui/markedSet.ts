import type { FileMark } from "../staging/plan";

/** One file of the review that carries at least one mark. */
export interface MarkedFile {
  readonly fileId: string;
  readonly path: string;
  /** Marked hunks, or every hunk when the whole file is marked. */
  readonly hunks: number;
  readonly whole: boolean;
  /**
   * True for the file the review cursor is in.
   *
   * A long marked list is read against a diff that is scrolled somewhere
   * inside it, and without this the two have nothing in common to look at:
   * the list says what is marked, the diff says where you are, and neither
   * says which row of the list you are standing on.
   */
  readonly current: boolean;
}

/** A file of the review, as summarising the marked set needs to see it. */
export interface SummarisableFile {
  readonly id: string;
  readonly path: string;
  readonly hunks?: readonly unknown[];
}

/**
 * The marked set, in review order.
 *
 * Review order rather than mark order: the list is read against the diff
 * beside it, so it has to agree with what scrolling would show. Remembering
 * the order marks were made in would be a second, invisible ordering nobody
 * asked about.
 *
 * A whole-file mark reports its file's hunk count, falling back to one for the
 * files that have no hunks to count — binary and oversized ones, which can
 * only ever be marked whole.
 */
export function markedFiles(
  files: readonly SummarisableFile[],
  marks: ReadonlyMap<string, FileMark>,
  currentFileId: string | null = null,
): MarkedFile[] {
  const marked: MarkedFile[] = [];

  for (const file of files) {
    const mark = marks.get(file.id);
    if (!mark) {
      continue;
    }

    marked.push({
      fileId: file.id,
      path: file.path,
      hunks: mark.kind === "whole" ? Math.max(file.hunks?.length ?? 0, 1) : mark.hunks.size,
      whole: mark.kind === "whole",
      current: file.id === currentFileId,
    });
  }

  return marked;
}

/**
 * Shorten a path to fit a pane, keeping the end.
 *
 * The end is what identifies a file — `…/ui/markedSet.ts` still reads as one
 * file, while a path cut at the front does not. An ellipsis says the front was
 * dropped rather than leaving a plausible-looking relative path that is not
 * the file's real one.
 */
export function fitPath(path: string, width: number): string {
  if (width <= 1 || path.length <= width) {
    return path;
  }

  return `…${path.slice(-(width - 1))}`;
}
