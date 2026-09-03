import { describe, expect, test } from "bun:test";
import { HUNK_EXTENSION_API_VERSION } from "hunkdiff/extension";
import manifest from "../package.json";

describe("package.json", () => {
  test("declares the API generation of the Hunk it is installed beside", () => {
    // Drift here is silent: the host only refuses an extension declaring a
    // generation HIGHER than its own, so a dependency bump that leaves
    // `apiVersion` behind keeps loading and keeps working — right up until
    // someone reaches for an API the declaration does not claim. A caret
    // range means the bump arrives on its own, so this is what notices.
    expect(manifest.hunk.apiVersion).toBe(HUNK_EXTENSION_API_VERSION);
  });

  test("points Hunk at the entry file this repository actually has", () => {
    expect(manifest.hunk.extensions).toEqual(["./index.ts"]);
  });
});
