import type { FileMark } from "../staging/plan";

/**
 * What the reviewer has marked, for as long as one review generation lasts.
 *
 * Marks are positions in a diff — a file id and a hunk index — so they are
 * only meaningful against the review they were made in. The session clears
 * them whenever the review reloads rather than trying to carry them across,
 * because a hunk index that survives a reload can silently point at different
 * lines.
 */
export class MarkStore {
  private readonly marks = new Map<string, FileMark>();
  private readonly listeners = new Set<() => void>();

  /**
   * The marks as one immutable value, stable until they change.
   *
   * Two callers want different things from this and both are served by the
   * same object. A command captures the marks before opening a dialog and
   * needs them not to move underneath it; the pane re-reads them constantly
   * and needs to know cheaply whether anything happened. Rebuilding the map
   * on every read would break the second — a fresh object every time reads as
   * a change every time — so it is rebuilt only when a mark actually moves.
   */
  private cached: ReadonlyMap<string, FileMark> = new Map();

  /** Add or remove one hunk. Marking a hunk on a whole-file mark narrows it. */
  toggleHunk(fileId: string, hunkIndex: number, hunkCount: number): void {
    const current = this.marks.get(fileId);
    const hunks = new Set(
      current?.kind === "whole"
        ? Array.from({ length: hunkCount }, (_, index) => index)
        : (current?.hunks ?? []),
    );

    if (!hunks.delete(hunkIndex)) {
      hunks.add(hunkIndex);
    }

    this.set(fileId, hunks.size === 0 ? undefined : { kind: "hunks", hunks });
  }

  /**
   * Mark or unmark a whole file.
   *
   * This is the only way to mark a file Hunk shows no hunks for — a binary or
   * oversized file — so it is expressed as its own kind of mark rather than as
   * "every hunk".
   */
  toggleFile(fileId: string): void {
    this.set(fileId, this.marks.has(fileId) ? undefined : { kind: "whole" });
  }

  clear(): void {
    this.marks.clear();
    this.changed();
  }

  markFor(fileId: string): FileMark | undefined {
    return this.marks.get(fileId);
  }

  isMarked(fileId: string, hunkIndex: number): boolean {
    const mark = this.marks.get(fileId);
    return mark?.kind === "whole" || (mark?.hunks.has(hunkIndex) ?? false);
  }

  get isEmpty(): boolean {
    return this.marks.size === 0;
  }

  get markedFileCount(): number {
    return this.marks.size;
  }

  /** The marks, keyed by file id, for handing to staging. */
  snapshot(): ReadonlyMap<string, FileMark> {
    return this.cached;
  }

  /** Watch for changes, for a surface that paints the marked set. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(fileId: string, mark: FileMark | undefined): void {
    if (mark) {
      this.marks.set(fileId, mark);
    } else {
      this.marks.delete(fileId);
    }

    this.changed();
  }

  private changed(): void {
    this.cached = new Map(this.marks);

    for (const listener of this.listeners) {
      listener();
    }
  }
}
