import { describe, expect, test } from "bun:test";
import {
  assertUsableRevision,
  buildStageArgs,
  describeDestination,
  InvalidRevisionError,
  renderToolConfig,
} from "../src/jj/tool";

describe("renderToolConfig", () => {
  test("points jj at the helper and passes both directories through", () => {
    expect(renderToolConfig("/stage/apply.sh", "/stage")).toBe(
      [
        "[merge-tools.hunk-stage]",
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

describe("buildStageArgs", () => {
  const configPath = "/tmp/tool.toml";

  test("splits a new revision out, with its description already supplied", () => {
    expect(
      buildStageArgs({ configPath, destination: { kind: "new", message: "extracted work" } }),
    ).toEqual([
      "--config-file",
      configPath,
      "split",
      "--interactive",
      "--tool",
      "hunk-stage",
      "--message=extracted work",
    ]);
  });

  test("squashes into an existing revision", () => {
    expect(buildStageArgs({ configPath, destination: { kind: "revision", revset: "@-" } })).toEqual([
      "--config-file",
      configPath,
      "squash",
      "--interactive",
      "--tool",
      "hunk-stage",
      "--into=@-",
    ]);
  });

  test("attaches values so neither can be read as an option", () => {
    const args = buildStageArgs({
      configPath,
      destination: { kind: "new", message: "--not-a-flag" },
    });

    expect(args).toContain("--message=--not-a-flag");
    expect(args).not.toContain("--not-a-flag");
  });

  test("refuses a revset that jj would read as an option", () => {
    expect(() =>
      buildStageArgs({ configPath, destination: { kind: "revision", revset: "--into=main" } }),
    ).toThrow(InvalidRevisionError);
  });
});

describe("describeDestination", () => {
  test("names each destination the way a sentence would", () => {
    expect(describeDestination({ kind: "new", message: "x" })).toBe("a new revision");
    expect(describeDestination({ kind: "revision", revset: "@-" })).toBe("@-");
  });
});
