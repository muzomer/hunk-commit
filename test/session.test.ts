import { describe, expect, test } from "bun:test";
import { ReviewSession } from "../src/ui/session";

/** A reviewed file in the shape Hunk hands to extensions. */
const file = (id: string, hunks: number) =>
  ({
    id,
    path: `${id}.ts`,
    patch: "",
    stats: { additions: 0, deletions: 0 },
    metadata: {},
    agent: null,
    hunks: Array.from({ length: hunks }, (_, index) => ({ index, header: "" })),
  }) as never;

describe("selectionFor", () => {
  test("uses the marks when there are any, ignoring the cursor", () => {
    const session = new ReviewSession();
    session.reload([file("a", 3)]);
    session.marks.toggleHunk("a", 2, 3);

    expect(session.selectionFor({ fileId: "a", hunkIndex: 0 })).toEqual({
      source: "marks",
      marks: new Map([["a", { kind: "hunks", hunks: new Set([2]) }]]),
    });
  });

  test("falls back to the hunk under the cursor when nothing is marked", () => {
    const session = new ReviewSession();
    session.reload([file("a", 3)]);

    expect(session.selectionFor({ fileId: "a", hunkIndex: 1 })).toEqual({
      source: "cursor",
      marks: new Map([["a", { kind: "hunks", hunks: new Set([1]) }]]),
    });
  });

  test("has nothing to offer with no marks and no cursor hunk", () => {
    const session = new ReviewSession();
    session.reload([file("a", 3)]);

    expect(session.selectionFor(null)).toBeNull();
  });

  test("leaves the mark store untouched when the cursor answers", () => {
    const session = new ReviewSession();
    session.reload([file("a", 3)]);

    session.selectionFor({ fileId: "a", hunkIndex: 1 });

    expect(session.marks.isEmpty).toBe(true);
  });

  test("summarises whichever selection it is given", () => {
    const session = new ReviewSession();
    session.reload([file("a", 3), file("b", 2)]);

    const cursor = session.selectionFor({ fileId: "b", hunkIndex: 0 })!;
    expect(session.summarise(cursor.marks)).toEqual({ files: 1, hunks: 1 });

    session.marks.toggleFile("a");
    const marks = session.selectionFor({ fileId: "b", hunkIndex: 0 })!;
    expect(session.summarise(marks.marks)).toEqual({ files: 1, hunks: 3 });
  });
});
