import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guard test: tenant isolation is only auto-enforced when TENANT_ENFORCEMENT=on.
// The live deployment sets it in render.yaml. If someone removes/flips it, the
// whole cross-tenant guarantee silently disappears — so fail the build here.
describe("production tenant enforcement config", () => {
  it("render.yaml keeps TENANT_ENFORCEMENT set to \"on\"", () => {
    const renderYamlPath = fileURLToPath(new URL("../../render.yaml", import.meta.url));
    const yaml = readFileSync(renderYamlPath, "utf8");

    // Match:  - key: TENANT_ENFORCEMENT  \n  value: "on"
    const enforced = /key:\s*TENANT_ENFORCEMENT[\s\S]{0,80}?value:\s*"?on"?/i.test(yaml);
    expect(
      enforced,
      "TENANT_ENFORCEMENT must be \"on\" in render.yaml — tenant isolation depends on it."
    ).toBe(true);
  });
});
