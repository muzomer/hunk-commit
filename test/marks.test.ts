import { describe, expect, test } from "bun:test";
import { MarkStore } from "../src/ui/marks";

describe("MarkStore", () => {
  test("starts empty", () => {
    expect(new MarkStore().isEmpty).toBe(true);
  });

  test("toggles one hunk on and off", () => {
    const marks = new MarkStore();

    marks.toggleHunk("f", 1, 3);
    expect(marks.markFor("f")).toEqual({ kind: "hunks", hunks: new Set([1]) });
    expect(marks.isMarked("f", 1)).toBe(true);
    expect(marks.isMarked("f", 0)).toBe(false);

    marks.toggleHunk("f", 1, 3);
    expect(marks.markFor("f")).toBeUndefined();
    expect(marks.isEmpty).toBe(true);
  });

  test("accumulates hunks within a file", () => {
    const marks = new MarkStore();

    marks.toggleHunk("f", 0, 3);
    marks.toggleHunk("f", 2, 3);

    expect(marks.markFor("f")).toEqual({ kind: "hunks", hunks: new Set([0, 2]) });
    expect(marks.markedFileCount).toBe(1);
  });

  test("unmarking one hunk of a whole-file mark leaves the rest marked", () => {
    const marks = new MarkStore();

    marks.toggleFile("f");
    marks.toggleHunk("f", 1, 3);

    expect(marks.markFor("f")).toEqual({ kind: "hunks", hunks: new Set([0, 2]) });
  });

  test("toggles a whole file, including one with no hunks", () => {
    const marks = new MarkStore();

    marks.toggleFile("image.png");
    expect(marks.markFor("image.png")).toEqual({ kind: "whole" });
    expect(marks.isMarked("image.png", 0)).toBe(true);

    marks.toggleFile("image.png");
    expect(marks.isEmpty).toBe(true);
  });

  test("hands staging an independent copy", () => {
    const marks = new MarkStore();
    marks.toggleHunk("f", 0, 1);

    const snapshot = marks.snapshot();
    marks.clear();

    expect(snapshot.size).toBe(1);
    expect(marks.isEmpty).toBe(true);
  });
});
