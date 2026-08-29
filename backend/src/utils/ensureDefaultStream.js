import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import { NOT_DELETED } from "./softDelete.js";

// Legacy rescue migration: gives a home to any subject that has NO stream (all
// content created before streams existed). It ONLY acts when such orphan
// subjects actually exist — so a default "JKSSB" stream is NEVER auto-recreated
// once every subject already belongs to a stream. Previously this ran on every
// boot and re-created JKSSB whenever it was missing, which meant an admin who
// deleted JKSSB saw it reappear after the next restart/redeploy. Idempotent and
// safe to run on every boot.
export async function ensureDefaultStream() {
  try {
    // Subjects with no stream (and not in the Recycle Bin) — the only thing that
    // needs a default stream. If there are none, do nothing.
    const orphanFilter = { $or: [{ stream: { $exists: false } }, { stream: null }], ...NOT_DELETED };
    const orphans = await Subject.countDocuments(orphanFilter);
    if (!orphans) return; // nothing to rescue → don't (re)create JKSSB

    // Reuse a LIVE (non-deleted) JKSSB if present; otherwise create one to hold
    // the orphan subjects. We never resurrect a soft-deleted JKSSB.
    let stream = await Stream.findOne({ slug: "jkssb", ...NOT_DELETED });
    if (!stream) {
      stream = await Stream.create({
        name: "JKSSB",
        slug: "jkssb",
        icon: "GraduationCap",
        color: "from-blue-500 to-indigo-600",
        description: "Jammu & Kashmir Services Selection Board",
        order: 0,
      });
      console.log("✔ Created default stream: JKSSB (to hold subjects that had no stream)");
    }
    const { modifiedCount } = await Subject.updateMany(orphanFilter, { $set: { stream: stream._id } });
    if (modifiedCount) console.log(`📚 Moved ${modifiedCount} stream-less subject(s) into the JKSSB stream.`);
  } catch (err) {
    console.error("Default-stream migration skipped:", err.message);
  }
}
