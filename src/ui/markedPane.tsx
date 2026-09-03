import { useSyncExternalStore } from "react";
import type { ExtensionPaneProps } from "hunkdiff/extension";
import type { MarkStore } from "./marks";
import { fitPath, markedFiles } from "./markedSet";

/**
 * The marked set, listed beside the review.
 *
 * What it is for: marks are otherwise visible only as amber inside the diff,
 * so a reviewer who marked hunks in three files eleven screens apart cannot
 * see the set they are about to commit without scrolling back through all of
 * it. The confirmation dialog counts the set but cannot name it.
 *
 * State lives in the MarkStore, not here. Panes unmount when closed, so a
 * component holding the marks would lose them the moment the pane was hidden
 * — `useSyncExternalStore` reads the same store the commands write to, and
 * the store hands back a snapshot whose identity only changes when a mark
 * does.
 */
export function createMarkedPane(marks: MarkStore) {
  return function MarkedPane({ files, width, theme }: ExtensionPaneProps) {
    const snapshot = useSyncExternalStore(
      (listener) => marks.subscribe(listener),
      () => marks.snapshot(),
    );

    const marked = markedFiles(files, snapshot);
    const hunks = marked.reduce((total, file) => total + file.hunks, 0);

    if (marked.length === 0) {
      return (
        <box padding={1}>
          <text fg={theme.muted}>Nothing marked.</text>
          <text fg={theme.muted}>Press x on a hunk, or X for a file.</text>
        </box>
      );
    }

    return (
      <box padding={1}>
        <text fg={theme.accent}>
          {hunks} {hunks === 1 ? "hunk" : "hunks"} in {marked.length}{" "}
          {marked.length === 1 ? "file" : "files"}
        </text>
        {marked.map((file) => (
          <text key={file.fileId} fg={theme.text}>
            {/* The count is what the reviewer is checking, so it leads. A
                whole-file mark says so rather than showing a number that
                would be indistinguishable from marking every hunk by hand. */}
            {file.whole ? "all" : String(file.hunks).padStart(3)}{" "}
            {fitPath(file.path, Math.max(width - 8, 8))}
          </text>
        ))}
      </box>
    );
  };
}
