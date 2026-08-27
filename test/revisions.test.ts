import { describe, expect, test } from "bun:test";
import { parseRevisionChoices } from "../src/jj/revisions";

describe("parseRevisionChoices", () => {
  test("reads change ids and descriptions", () => {
    expect(parseRevisionChoices("nyktqzlq\tsecond change\nxmsymmus\tfirst change\n")).toEqual([
      { revision: "nyktqzlq", label: "nyktqzlq  second change" },
      { revision: "xmsymmus", label: "xmsymmus  first change" },
    ]);
  });

  test("keeps a revision with no description", () => {
    expect(parseRevisionChoices("abc\t(no description set)\n")[0]).toEqual({
      revision: "abc",
      label: "abc  (no description set)",
    });
  });

  test("ignores blank output", () => {
    expect(parseRevisionChoices("\n")).toEqual([]);
  });
});
