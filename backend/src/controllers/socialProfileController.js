// Cross-posting USERS: other people whose own Facebook Page, Instagram, YouTube
// and Telegram the admin posts to (see utils/socialProfile.js). Each user is a
// separate Settings document that starts EMPTY; the admin panel edits it with
// the normal Social Media Auto Posting screen via the X-Social-Profile header.
import mongoose from "mongoose";
import Settings from "../models/Settings.js";
import FbSchedule from "../models/FbSchedule.js";
import { SOCIAL_KEY_PREFIX } from "../utils/socialProfile.js";

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
