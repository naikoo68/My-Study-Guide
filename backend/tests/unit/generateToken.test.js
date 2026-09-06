import { describe, it, expect, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import generateToken from "../../src/utils/generateToken.js";

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-secret";
});
afterEach(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

describe("generateToken", () => {
  it("signs a token carrying the user id and token version", () => {
    const token = generateToken("user-123", 4);
    const decoded = jwt.verify(token, "unit-test-secret");
    expect(decoded.id).toBe("user-123");
    expect(decoded.tv).toBe(4);
  });

  it("defaults tokenVersion to 0 when omitted", () => {
    const decoded = jwt.verify(generateToken("user-1"), "unit-test-secret");
    expect(decoded.tv).toBe(0);
  });

  it("cannot be verified with the wrong secret", () => {
    const token = generateToken("user-1");
    expect(() => jwt.verify(token, "different-secret")).toThrow();
  });

  it("defaults to a ~4 day lifetime", () => {
    const decoded = jwt.verify(generateToken("u"), "unit-test-secret");
    expect(decoded.exp - decoded.iat).toBe(4 * 24 * 60 * 60);
  });

  it("honours JWT_EXPIRES_IN override", () => {
    process.env.JWT_EXPIRES_IN = "2h";
    const decoded = jwt.verify(generateToken("u"), "unit-test-secret");
    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60);
  });
});
