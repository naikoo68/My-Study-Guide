import { describe, it, expect, beforeEach, vi } from "vitest";

// Publishing credentials and auto-comment behavior must come from the SAME
// Settings row. A bare {key:"site"} read can pick a null/shared or other-tenant
// row and silently disable comments even while publication succeeds.

const exactLean = vi.fn();
const fallbackLean = vi.fn();
const findById = vi.fn(() => ({ lean: exactLean }));
const findOne = vi.fn(() => ({ lean: fallbackLean }));

vi.mock("../../src/models/Settings.js", () => ({
  default: { findById, findOne, updateOne: vi.fn() },
}));

const { getFacebookConfig, getFacebookSiteForConfig } = await import("../../src/config/facebook.js");

beforeEach(() => {
  exactLean.mockReset();
  fallbackLean.mockReset();
  findById.mockClear();
  findOne.mockClear();
});

describe("Facebook settings resolution", () => {
  it("carries the exact Settings id that supplied Page credentials", async () => {
    const settings = {
      _id: "settings-tenant-a",
      fbEnabled: true,
      fbPageId: "PAGE_A",
      fbPageAccessToken: "TOKEN_A",
      fbAutoCommentEnabled: true,
    };
    fallbackLean.mockResolvedValue(settings);

    const cfg = await getFacebookConfig({ tenantId: "tenant-a" });
    expect(cfg.settingsId).toBe("settings-tenant-a");
    expect(cfg.pageId).toBe("PAGE_A");
  });

  it("loads the exact credential Settings row instead of a different bare site row", async () => {
    const exact = {
      _id: "settings-tenant-a",
      fbAutoCommentEnabled: true,
      fbAutoComments: ["Correct tenant comment"],
    };
    exactLean.mockResolvedValue(exact);
    fallbackLean.mockResolvedValue({
      _id: "settings-null",
      fbAutoCommentEnabled: false,
      fbAutoComments: [],
    });

    const site = await getFacebookSiteForConfig({ settingsId: "settings-tenant-a" });
    expect(findById).toHaveBeenCalledWith("settings-tenant-a");
    expect(site).toEqual(exact);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("keeps a backward-compatible fallback when a direct test config has no settingsId", async () => {
    const fallback = { _id: "legacy", fbAutoCommentEnabled: true };
    fallbackLean.mockResolvedValue(fallback);
    await expect(getFacebookSiteForConfig({})).resolves.toEqual(fallback);
    expect(findOne).toHaveBeenCalledWith({ key: "site" });
  });
});
