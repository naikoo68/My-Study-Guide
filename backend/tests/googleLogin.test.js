process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
import { describe, it, expect, vi, beforeEach } from "vitest";

const users = new Map();
vi.mock("../src/models/User.js", () => {
  const mk = (d) => ({ ...d, _id: d._id || `u${users.size + 1}`, tokenVersion: 0, save: vi.fn(async function () { users.set(this.email, this); return this; }) });
  return { default: {
    findOne: vi.fn(async ({ email }) => users.get(email) || null),
    create: vi.fn(async (d) => { const u = mk(d); users.set(u.email, u); return u; }),
  } };
});
vi.mock("../src/models/Settings.js", () => ({ default: { find: () => ({ select: () => ({ lean: async () => [{ googleClientId: "site-client.apps.googleusercontent.com" }] }) }) } }));
vi.mock("../src/utils/notify.js", () => ({ notifyNewUser: vi.fn() }));
vi.mock("../src/middleware/auth.js", () => ({ tenantSuspended: async () => false, SUSPENDED_INSTITUTE_MESSAGE: "suspended" }));

const { googleLogin, BUILTIN_GOOGLE_CLIENT_ID } = await import("../src/controllers/authController.js");
const res = () => { const r = { code: 200 }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const google = (payload, ok = true) => { globalThis.fetch = vi.fn(async () => ({ ok, json: async () => payload })); };
const tok = (over = {}) => ({ aud: BUILTIN_GOOGLE_CLIENT_ID, iss: "https://accounts.google.com", email: "Student@Gmail.com", email_verified: "true", name: "A Student", sub: "g-1", picture: "p.jpg", ...over });

beforeEach(() => { users.clear(); delete process.env.GOOGLE_CLIENT_ID; });

describe("Sign in with Google", () => {
  it("first time = sign-up, even with GOOGLE_CLIENT_ID not set on the server", async () => {
    google(tok());
    const r = res(); await googleLogin({ body: { credential: "t" } }, r);
    expect(r.code).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(users.get("student@gmail.com")).toMatchObject({ googleId: "g-1", isEmailVerified: true, name: "A Student" });
  });
  it("accepts the site's own Client ID (Admin settings) and a GOOGLE_CLIENT_ID list", async () => {
    google(tok({ aud: "site-client.apps.googleusercontent.com" }));
    let r = res(); await googleLogin({ body: { credential: "t" } }, r); expect(r.code).toBe(200);
    process.env.GOOGLE_CLIENT_ID = "a.apps.googleusercontent.com, b.apps.googleusercontent.com";
    google(tok({ aud: "b.apps.googleusercontent.com" }));
    r = res(); await googleLogin({ body: { credential: "t" } }, r); expect(r.code).toBe(200);
  });
  it("refuses a token made for someone else's app", async () => {
    google(tok({ aud: "evil.apps.googleusercontent.com" }));
    const r = res(); await googleLogin({ body: { credential: "t" } }, r);
    expect(r.code).toBe(401);
  });
  it("refuses an unverified Google email and a bad token", async () => {
    google(tok({ email_verified: "false" }));
    let r = res(); await googleLogin({ body: { credential: "t" } }, r); expect(r.code).toBe(401);
    google({}, false);
    r = res(); await googleLogin({ body: { credential: "bad" } }, r); expect(r.code).toBe(401);
  });
  it("an existing unverified email account logs in and becomes verified", async () => {
    users.set("student@gmail.com", { _id: "u9", email: "student@gmail.com", isEmailVerified: false, tokenVersion: 0, save: vi.fn(async () => {}) });
    google(tok());
    const r = res(); await googleLogin({ body: { credential: "t" } }, r);
    expect(r.code).toBe(200);
    expect(users.get("student@gmail.com")).toMatchObject({ isEmailVerified: true, googleId: "g-1" });
  });
  it("a blocked account is refused", async () => {
    users.set("student@gmail.com", { _id: "u9", email: "student@gmail.com", status: "blocked", save: vi.fn() });
    google(tok());
    const r = res(); await googleLogin({ body: { credential: "t" } }, r);
    expect(r.code).toBe(403);
  });
});
