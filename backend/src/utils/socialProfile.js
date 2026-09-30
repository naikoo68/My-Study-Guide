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
