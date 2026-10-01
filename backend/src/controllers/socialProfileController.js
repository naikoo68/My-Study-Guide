// Cross-posting USERS: other people whose own Facebook Page, Instagram, YouTube
// and Telegram the admin posts to (see utils/socialProfile.js). Each user is a
// separate Settings document that starts EMPTY; the admin panel edits it with
// the normal Social Media Auto Posting screen via the X-Social-Profile header.
import mongoose from "mongoose";
import Settings from "../models/Settings.js";
import FbSchedule from "../models/FbSchedule.js";
import FbPost from "../models/FbPost.js";
import { SOCIAL_KEY_PREFIX, runAsSocialProfile, scheduleProfileFilter } from "../utils/socialProfile.js";
import { getFacebookConfig } from "../config/facebook.js";

// Everything social starts blank for a new user — no credentials, no comments,
// no templates, music, watermarks, hashtags or links copied from the main account.
export function emptySocialProfile(name) {
  return {
    key: `${SOCIAL_KEY_PREFIX}${new mongoose.Types.ObjectId().toString()}`,
    socialProfile: true,
    profileName: String(name || "").trim().slice(0, 80),
    siteName: String(name || "").trim().slice(0, 80),
    fbEnabled: false, fbPageId: "", fbPageAccessToken: "", igEnabled: false, igUserId: "",
    tgEnabled: false, tgBotToken: "", tgChatId: "",
    ytEnabled: false, ytClientId: "", ytClientSecret: "", ytRefreshToken: "", ytChannelId: "", ytChannelTitle: "",
    fbExtraTargets: [], fbReelAudios: [], fbAutoCommentEnabled: false, fbAutoComment: "", fbAutoComments: [],
    fbAutoCommentMentions: [], igAutoComments: [], fbDefaultHashtags: "", socialLinks: [],
    fbSelfieWatermarkUrl: "", fbFlashcardTemplateUrl: "",
  };
}

const view = async (s) => ({
  id: String(s._id),
  name: s.profileName || "Unnamed user",
  facebook: !!(s.fbPageId && s.fbPageAccessToken),
  instagram: !!(s.igEnabled && s.fbPageId && s.fbPageAccessToken),
  youtube: !!s.ytRefreshToken, youtubeChannel: s.ytChannelTitle || "",
  telegram: !!(s.tgBotToken && s.tgChatId),
  schedules: await FbSchedule.countDocuments({ profileId: String(s._id) }).catch(() => 0),
  createdAt: s.createdAt,
});

// GET /api/social-profiles
export async function listProfiles(req, res) {
  // One-time clean-up of users copied before personal details were excluded.
  try {
    const cfg = await runAsSocialProfile("", () => getFacebookConfig()).catch(() => null);
    const main = cfg?.settingsId ? await Settings.findById(cfg.settingsId).lean() : null;
    if (main && !main.socialProfile) {
      for (const d of await Settings.find({ socialProfile: true })) {
        const posted = await FbPost.countDocuments({ profileId: String(d._id) }).catch(() => 1);
        if (cleanCopiedPersonal(d, main, { postedCount: posted })) await d.save().catch(() => {});
      }
    }
  } catch { /* never block the list */ }
  const docs = await Settings.find({ socialProfile: true })
    .select("profileName fbPageId fbPageAccessToken igEnabled ytRefreshToken ytChannelTitle tgBotToken tgChatId createdAt")
    .sort({ createdAt: 1 }).lean();
  res.json({ profiles: await Promise.all(docs.map(view)) });
}

// POST /api/social-profiles { name }
export async function createProfile(req, res) {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Enter the user's name." });
  const doc = new Settings(emptySocialProfile(name));
  await doc.save();
  res.status(201).json({ profile: await view(doc.toObject()) });
}

// PUT /api/social-profiles/:id { name }
export async function renameProfile(req, res) {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ message: "Enter the user's name." });
  const doc = await Settings.findOne({ _id: req.params.id, socialProfile: true });
  if (!doc) return res.status(404).json({ message: "User not found." });
  doc.profileName = name;
  await doc.save();
  res.json({ profile: await view(doc.toObject()) });
}

// DELETE /api/social-profiles/:id — removes the user, their saved credentials
// and ALL their schedules (the main account is untouched).
export async function deleteProfile(req, res) {
  const doc = await Settings.findOne({ _id: req.params.id, socialProfile: true }).select("_id").lean();
  if (!doc) return res.status(404).json({ message: "User not found." });
  await FbSchedule.deleteMany({ profileId: String(doc._id) });
  await Settings.deleteOne({ _id: doc._id, socialProfile: true });
  res.json({ ok: true });
}

// Fields that belong to ONE person's accounts (or to the document itself) and
// are therefore never copied: their Facebook Page + token, Instagram, Telegram
// bot/channel, extra Pages, their YouTube connection / channel / playlists.
// The Google OAuth Client ID + secret ARE copied — it's your own Google Cloud
// app, which every user signs in through (add them as test users there).
const NOT_COPIED = new Set([
  "_id", "__v", "key", "tenantId", "socialProfile", "profileName", "createdAt", "updatedAt",
  "fbEnabled", "fbPageId", "fbPageAccessToken", "fbExtraTargets", "igEnabled", "igUserId",
  "tgEnabled", "tgBotToken", "tgChatId",
  "ytEnabled", "ytRefreshToken", "ytChannelId", "ytChannelTitle", "ytConnectedAt", "ytScopes",
  "ytShortsPlaylistId", "ytShortsPlaylistTitle", "ytLongPlaylistId", "ytLongPlaylistTitle",
  "fbAutoCommentIndex", "audioIndex",
  // Personal details & history — your own links, @handles, contact email and
  // post numbering stay yours; the user starts counting from 1.
  "socialLinks", "fbAutoCommentMentions", "fbNotifyEmail", "contacts",
  "fbPostSerial", "fbPostSerialFacebook", "fbPostSerialInstagram",
  // Video branding is the user's OWN (their channel name / logo, not ours).
  "videoBrandName", "videoBrandLogoUrl", "videoBrandWebsite", "videoBrandColor",
]);
export const copyableSettings = (main) => Object.fromEntries(Object.entries(main || {}).filter(([k]) => !NOT_COPIED.has(k)));

// A schedule copied for a user starts FRESH: nothing posted yet, and no
// playlist (playlists belong to the main channel — the user's own default is used).
export function copyScheduleFor(sch, profileId) {
  const { _id, __v, createdAt, updatedAt, tenantId, ...rest } = sch || {};
  void __v; void createdAt; void updatedAt; void tenantId;
  const lv = rest.longVideo && typeof rest.longVideo === "object" ? rest.longVideo : null;
  return {
    ...rest,
    profileId: String(profileId),
    copiedFrom: String(_id),
    lastSlot: "", lastRunAt: null, lastResult: "", postCount: 0, ytPostCount: 0, postedQuestionIds: [],
    completedAt: null, slideshowStatus: "", slideshowError: "",
    ytPlaylistId: "", ytPlaylistTitle: "",
    ...(lv ? { longVideo: { ...lv, part: 0, postedCount: 0, quizId: "", quizIdx: 0, nextStart: Number(lv.options?.start) || 1, playlist: "" } } : {}),
  };
}

// Personal details that an EARLIER version of "Copy everything" copied: blank
// them when they are still exactly the main account's (a value the user set
// themselves is kept), and restart post numbering when the user hasn't posted.
const PERSONAL = ["socialLinks", "fbAutoCommentMentions", "fbNotifyEmail", "contacts"];
const SERIALS = ["fbPostSerial", "fbPostSerialFacebook", "fbPostSerialInstagram"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function cleanCopiedPersonal(doc, main, { postedCount = null } = {}) {
  let changed = false;
  for (const k of PERSONAL) {
    const v = doc.get ? doc.get(k) : doc[k];
    const empty = Array.isArray(v) ? v.length === 0 : !v;
    if (!empty && same(v && v.toObject ? v.toObject() : v, main?.[k])) {
      doc.set(k, Array.isArray(v) ? [] : ""); changed = true;
    }
  }
  if (postedCount === 0) {
    for (const k of SERIALS) {
      if ((Number(doc.get(k)) || 0) > 0 && Number(doc.get(k)) === Number(main?.[k])) { doc.set(k, 0); changed = true; }
    }
  }
  return changed;
}

// POST /api/social-profiles/:id/copy-from-main { schedules?: boolean }
// Copies EVERYTHING from your own Social Media Auto Posting to this user —
// comments, templates, slide texts, thumbnail, watermarks, music, hashtags,
// narration, links… — except their account connections (see NOT_COPIED).
// With schedules=true your schedules are copied too (starting fresh, same
// on/off state); a schedule copied before is not copied again.
export async function copyFromMain(req, res) {
  const doc = await Settings.findOne({ _id: req.params.id, socialProfile: true });
  if (!doc) return res.status(404).json({ message: "User not found." });
  const cfg = await runAsSocialProfile("", () => getFacebookConfig());
  const main = cfg?.settingsId ? await Settings.findById(cfg.settingsId).lean() : null;
  if (!main || main.socialProfile) return res.status(404).json({ message: "Your Social Media Auto Posting settings were not found." });
  const data = copyableSettings(main);
  doc.set(data);
  cleanCopiedPersonal(doc, main);
  for (const k of Object.keys(data)) doc.markModified(k);
  await doc.save();

  let copied = 0, skipped = 0;
  if (req.body?.schedules) {
    const mine = await runAsSocialProfile("", () => FbSchedule.find(scheduleProfileFilter("")).lean());
    const already = new Set((await FbSchedule.find({ profileId: String(doc._id) }).select("copiedFrom").lean()).map((s) => s.copiedFrom).filter(Boolean));
    for (const s of mine) {
      if (already.has(String(s._id))) { skipped += 1; continue; }
      await FbSchedule.create(copyScheduleFor(s, doc._id));
      copied += 1;
    }
  }
  res.json({ ok: true, schedulesCopied: copied, schedulesSkipped: skipped, profile: await view(doc.toObject()) });
}
