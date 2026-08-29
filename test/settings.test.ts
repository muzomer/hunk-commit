import { describe, expect, test } from "bun:test";
import { readContextMarksSetting } from "../src/ui/settings";

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
