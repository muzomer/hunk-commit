import { describe, expect, test } from "bun:test";
import { destinationFor, DEFAULT_TARGET, readTargetSetting } from "../src/ui/settings";

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
