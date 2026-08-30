import { describe, expect, test } from "bun:test";
import { unsafePathReason } from "../src/patch/paths";

describe("unsafePathReason", () => {
  test.each([
    "src/patch/paths.ts",
    "f.txt",
    "a/b/c/deep.ts",
    // `..` only counts as a whole segment; these are ordinary filenames.
    "src/..hidden",
    "src/weird..name.ts",
    "...",
  ])("allows %j", (path) => {
    expect(unsafePathReason(path)).toBeNull();
  });

  test.each([
    ["../outside.ts", "`..` segment"],
    ["a/../../outside.ts", "`..` segment"],
    ["src/../../../etc/cron.d/x", "`..` segment"],
    ["a/..", "`..` segment"],
    ["..", "`..` segment"],
    // A backslash is a separator here even on POSIX, so a Windows-shaped
    // escape cannot slip past the split.
    ["a\\..\\..\\outside.ts", "`..` segment"],
  ])("rejects %j as escaping", (path) => {
    expect(unsafePathReason(path)).toContain("outside the workspace");
  });

  test.each(["/etc/passwd", "\\\\server\\share\\x", "C:\\Windows\\x", "c:/Windows/x"])(
    "rejects %j as absolute",
    (path) => {
      expect(unsafePathReason(path)).toContain("absolute");
    },
  );

  test("rejects the empty path", () => {
    expect(unsafePathReason("")).toContain("does not name a file");
  });
});
