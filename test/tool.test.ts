import { describe, expect, test } from "bun:test";
import {
  assertUsableRevision,
  buildSquashArgs,
  InvalidRevisionError,
  renderToolConfig,
} from "../src/jj/tool";

describe("renderToolConfig", () => {
  test("points jj at the helper and passes both directories through", () => {
    expect(renderToolConfig("/stage/apply.sh", "/stage")).toBe(
      [
        "[merge-tools.hunk-jj-stage]",
        'program = "sh"',
        'edit-args = ["/stage/apply.sh", "$left", "$right", "/stage"]',
        "",
      ].join("\n"),
    );
  });

  test("escapes paths that would break the TOML string", () => {
    expect(renderToolConfig('/od"d/apply.sh', "/od\\d")).toContain(
      'edit-args = ["/od\\"d/apply.sh", "$left", "$right", "/od\\\\d"]',
    );
  });
});

describe("assertUsableRevision", () => {
  test.each(["@-", "@", "main", "xyzabc", "roots(mutable())", "@--"])("accepts %j", (revision) => {
    expect(() => assertUsableRevision(revision)).not.toThrow();
  });

  test.each(["", "--config=x", "-r", "a\nb"])("rejects %j", (revision) => {
    expect(() => assertUsableRevision(revision)).toThrow(InvalidRevisionError);
  });
});

describe("buildSquashArgs", () => {
  test("squashes interactively through the generated tool", () => {
    expect(buildSquashArgs({ configPath: "/tmp/tool.toml", into: "@-" })).toEqual([
      "--config-file",
      "/tmp/tool.toml",
      "squash",
      "--interactive",
      "--tool",
      "hunk-jj-stage",
      "--into",
      "@-",
    ]);
  });

  test("refuses a target that jj would read as an option", () => {
    expect(() => buildSquashArgs({ configPath: "/tmp/tool.toml", into: "--into=main" })).toThrow(
      InvalidRevisionError,
    );
  });
});
