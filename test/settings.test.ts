import { describe, expect, test } from "bun:test";
import {
  destinationFor,
  DEFAULT_TARGET,
  readContextMarksSetting,
  readTargetSetting,
} from "../src/ui/settings";

describe("readTargetSetting", () => {
  const silent = () => undefined;

  test("defaults to extracting a new revision", () => {
    expect(readTargetSetting({}, silent)).toEqual({ kind: "new" });
    expect(DEFAULT_TARGET).toEqual({ kind: "new" });
  });

  test('reads "new" as the new-revision destination', () => {
    expect(readTargetSetting({ target: "new" }, silent)).toEqual({ kind: "new" });
  });

  test("reads anything else as a revset to squash into", () => {
    expect(readTargetSetting({ target: " @- " }, silent)).toEqual({
      kind: "revision",
      revset: "@-",
    });
  });

  test("logs and falls back when the value is not a usable string", () => {
    const logged: string[] = [];

    expect(readTargetSetting({ target: 7 }, (message) => logged.push(message))).toEqual({
      kind: "new",
    });
    expect(readTargetSetting({ target: "  " }, silent)).toEqual({ kind: "new" });
    expect(logged).toHaveLength(1);
  });
});

describe("destinationFor", () => {
  test("carries the description into a new revision", () => {
    expect(destinationFor({ kind: "new" }, "extracted work")).toEqual({
      kind: "new",
      message: "extracted work",
    });
  });

  test("ignores the description when squashing into an existing revision", () => {
    expect(destinationFor({ kind: "revision", revset: "@-" }, "unused")).toEqual({
      kind: "revision",
      revset: "@-",
    });
  });
});

describe("readContextMarksSetting", () => {
  const silent = () => undefined;

  test("marks only the moving lines by default", () => {
    expect(readContextMarksSetting({}, silent)).toBe("none");
  });

  test.each(["none", "edge", "full"] as const)("accepts %j", (value) => {
    expect(readContextMarksSetting({ context_marks: value }, silent)).toBe(value);
  });

  test("logs and falls back on anything else", () => {
    const logged: string[] = [];

    expect(readContextMarksSetting({ context_marks: "loud" }, (m) => logged.push(m))).toBe("none");
    expect(logged[0]).toContain("none, edge, full");
  });
});
