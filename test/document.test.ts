import { describe, expect, test } from "bun:test";
import { parseDocument, renderDocument } from "../src/patch/document";

describe("document", () => {
  const roundTrips = ["", "a\n", "a", "a\nb\n", "a\nb", "a\n\n", "\n", "a\r\nb\r\n"];

  test.each(roundTrips)("round-trips %j", (text) => {
    expect(renderDocument(parseDocument(text))).toBe(text);
  });

  test("separates the final newline from line content", () => {
    expect(parseDocument("a\nb\n")).toEqual({ lines: ["a", "b"], endsWithNewline: true });
    expect(parseDocument("a\nb")).toEqual({ lines: ["a", "b"], endsWithNewline: false });
  });

  test("keeps carriage returns inside line content", () => {
    expect(parseDocument("a\r\n").lines).toEqual(["a\r"]);
  });

  test("represents a trailing blank line as an empty final line", () => {
    expect(parseDocument("a\n\n")).toEqual({ lines: ["a", ""], endsWithNewline: true });
  });
});
