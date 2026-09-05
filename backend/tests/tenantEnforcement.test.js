import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guard test: tenant isolation is only auto-enforced when TENANT_ENFORCEMENT=on.
// The deployment env template (backend/msg.env.example, copied to the VM's
// msg.env) documents it as the required default. If someone removes/flips it,
// the whole cross-tenant guarantee silently disappears — so fail the build here.
describe("production tenant enforcement config", () => {
  it("msg.env.example keeps TENANT_ENFORCEMENT set to \"on\"", () => {
    const envPath = fileURLToPath(new URL("../msg.env.example", import.meta.url));
    const env = readFileSync(envPath, "utf8");

    // Match an uncommented:  TENANT_ENFORCEMENT=on
    const enforced = /^\s*TENANT_ENFORCEMENT\s*=\s*"?on"?\s*$/im.test(env);
    expect(
      enforced,
      "TENANT_ENFORCEMENT must be \"on\" in backend/msg.env.example — tenant isolation depends on it."
    ).toBe(true);
  });
});
