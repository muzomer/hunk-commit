import { describe, expect, test } from "bun:test";
import { DEFAULT_TARGET, readTargetSetting } from "../src/ui/settings";

describe("readTargetSetting", () => {
  const silent = () => undefined;

  test("defaults to the working copy's parent", () => {
    expect(readTargetSetting({}, silent)).toBe(DEFAULT_TARGET);
  });

  test("accepts a configured revset", () => {
    expect(readTargetSetting({ target: " main " }, silent)).toBe("main");
  });

  test("logs and falls back when the value is not a usable string", () => {
    const logged: string[] = [];

    expect(readTargetSetting({ target: 7 }, (message) => logged.push(message))).toBe(
      DEFAULT_TARGET,
    );
    expect(readTargetSetting({ target: "  " }, silent)).toBe(DEFAULT_TARGET);
    expect(logged).toHaveLength(1);
  });
});
