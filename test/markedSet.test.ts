import { describe, expect, test } from "bun:test";
import { fitPath, markedFiles } from "../src/ui/markedSet";

const files = [
  { id: "1", path: "src/a.ts", hunks: [{}, {}, {}] },
  { id: "2", path: "src/b.ts", hunks: [{}, {}] },
  { id: "3", path: "logo.png" },
];

describe("markedFiles", () => {
  test("lists nothing when nothing is marked", () => {
    expect(markedFiles(files, new Map())).toEqual([]);
  });

  test("reports how many hunks each marked file carries", () => {
    const marked = markedFiles(
      files,
      new Map([["1", { kind: "hunks", hunks: new Set([0, 2]) }]]),
    );

    expect(marked).toEqual([{ fileId: "1", path: "src/a.ts", hunks: 2, whole: false }]);
  });

  test("counts a whole-file mark as every hunk of the file", () => {
    const marked = markedFiles(files, new Map([["2", { kind: "whole" }]]));

    expect(marked).toEqual([{ fileId: "2", path: "src/b.ts", hunks: 2, whole: true }]);
  });

  test("counts a file with no hunks as one, since it can only be marked whole", () => {
    // Binary and oversized files: Hunk shows no hunks to mark, so X is the
    // only way to include them and "0 hunks" would misreport a real choice.
    const marked = markedFiles(files, new Map([["3", { kind: "whole" }]]));

    expect(marked[0]).toMatchObject({ path: "logo.png", hunks: 1, whole: true });
  });

  test("follows review order, not the order the marks were made", () => {
    const marks = new Map<string, { kind: "whole" }>([
      ["2", { kind: "whole" }],
      ["1", { kind: "whole" }],
    ]);

    expect(markedFiles(files, marks).map((file) => file.path)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("ignores a mark whose file left the review", () => {
    expect(markedFiles(files, new Map([["gone", { kind: "whole" }]]))).toEqual([]);
  });
});

describe("fitPath", () => {
  test("leaves a path that already fits", () => {
    expect(fitPath("src/a.ts", 20)).toBe("src/a.ts");
  });

  test("keeps the end of a path too long to show", () => {
    // The end identifies the file; a path cut at the front would read as a
    // real relative path that does not exist.
    expect(fitPath("very/deep/nested/file.ts", 12)).toBe("…ted/file.ts");
  });

  test("never returns more characters than it was given", () => {
    for (const width of [2, 5, 8, 13]) {
      expect(fitPath("very/deep/nested/file.ts", width).length).toBe(width);
    }
  });
});
