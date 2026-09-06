import { describe, it, expect } from "vitest";
import {
  NOT_DELETED,
  ONLY_DELETED,
  softDeletePatch,
  restorePatch,
} from "../../src/utils/softDelete.js";

describe("soft-delete query fragments", () => {
  it("NOT_DELETED matches live + legacy (missing field) via $ne:true", () => {
    expect(NOT_DELETED).toEqual({ deleted: { $ne: true } });
  });

  it("ONLY_DELETED matches recycled documents", () => {
    expect(ONLY_DELETED).toEqual({ deleted: true });
  });
});

describe("softDeletePatch", () => {
  it("flags deleted with a Date timestamp", () => {
    const patch = softDeletePatch();
    expect(patch.deleted).toBe(true);
    expect(patch.deletedAt).toBeInstanceOf(Date);
  });

  it("returns a fresh object each call (new timestamp)", async () => {
    const a = softDeletePatch();
    await new Promise((r) => setTimeout(r, 2));
    const b = softDeletePatch();
    expect(a).not.toBe(b);
    expect(b.deletedAt.getTime()).toBeGreaterThanOrEqual(a.deletedAt.getTime());
  });
});

describe("restorePatch", () => {
  it("clears the deleted flags", () => {
    expect(restorePatch()).toEqual({ deleted: false, deletedAt: null });
  });
});
