// Cross-posting USERS ("social profiles"). Each one is another person whose
// own Facebook Page / Instagram / YouTube / Telegram the admin posts to. A
// profile is stored as its OWN Settings document (socialProfile: true, key
// "social:<id>", same tenant), so every Social Media Auto Posting option — credentials, comments,
// watermarks, templates, music, playlists — exists per person and starts empty.
// Its schedules are FbSchedule rows with `profileId` = that document's _id.
//
// The admin panel picks a profile with the `X-Social-Profile` header (only on
// /api/settings, /api/facebook and /api/youtube). While it is set, the social
// settings resolvers (settingsController.getOrCreate*, getFacebookConfig,
// socialSettingsFilter) read and write THAT profile instead of the main site.
import { AsyncLocalStorage } from "node:async_hooks";

export const socialProfileStore = new AsyncLocalStorage();
export const SOCIAL_KEY_PREFIX = "social:";
export const isSocialProfileKey = (k) => String(k || "").startsWith(SOCIAL_KEY_PREFIX);
const ID_RE = /^[a-f0-9]{24}$/i;

// The profile this request / scheduler run works for ("" = the main account).
export function activeSocialProfileId() {
  return socialProfileStore.getStore()?.profileId || "";
}

// Run `fn` as a profile ("" / null = the main account).
export function runAsSocialProfile(profileId, fn) {
  return socialProfileStore.run({ profileId: profileId && ID_RE.test(String(profileId)) ? String(profileId) : "" }, fn);
}

// Express middleware: honour the header. Invalid ids are ignored (main account).
export function socialProfileMiddleware(req, res, next) {
  const id = String(req.get?.("x-social-profile") || "").trim();
  if (!ID_RE.test(id)) return runAsSocialProfile("", next);
  req.socialProfileId = id;
  return runAsSocialProfile(id, next);
}

// Mongo filter for the settings doc the social code should read: the active
// profile's doc, else the main site doc.
export function socialSettingsFilter() {
  const pid = activeSocialProfileId();
  return pid ? { _id: pid, socialProfile: true } : { key: "site" };
}

// FbSchedule filter for "this account's schedules". Main-account rows have no
// profileId (old rows) or "".
export function scheduleProfileFilter(profileId = activeSocialProfileId()) {
  return profileId ? { profileId: String(profileId) } : { profileId: { $in: [null, ""] } };
}

// Rows saved BEFORE cross-posting existed have NO profileId field. MongoDB's
// `{ profileId: { $in: [null, ""] } }` matches a missing field, but the Oracle
// MongoDB-compatible API (used in production) does NOT — so every old schedule
// and post record vanished from the main account (list, scheduler, history).
// Stamp them with "" once so the filter matches on every engine. Engine-agnostic
// (plain find + update by _id), idempotent, and memoized per process.
let backfillPromise = null;
export function ensureProfileIdBackfill({ force = false } = {}) {
  if (force) backfillPromise = null;
  if (!backfillPromise) {
    backfillPromise = (async () => {
      const { runUnscoped } = await import("./tenantContext.js");
      const models = [(await import("../models/FbSchedule.js")).default, (await import("../models/FbPost.js")).default];
      let fixed = 0;
      for (const M of models) {
        const rows = await runUnscoped(() => M.find({}).select("_id profileId").lean());
        const ids = (rows || []).filter((r) => typeof r.profileId !== "string").map((r) => r._id);
        for (let i = 0; i < ids.length; i += 500) {
          await runUnscoped(() => M.updateMany({ _id: { $in: ids.slice(i, i + 500) } }, { $set: { profileId: "" } }));
        }
        fixed += ids.length;
      }
      if (fixed) console.log(`[cross-posting] stamped profileId on ${fixed} older schedule/post row(s).`);
      return fixed;
    })().catch((e) => { backfillPromise = null; console.warn(`[cross-posting] profileId backfill failed: ${e?.message || e}`); return 0; });
  }
  return backfillPromise;
}
