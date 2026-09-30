import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Users, Plus, Pencil, Trash2, Loader2, ArrowLeft, ChevronRight, Check, X, Send, CalendarClock } from "lucide-react";
import { socialProfileService } from "../../services";
import { setActiveSocialProfile } from "../../lib/api";
import { ScopedSettingsProvider } from "../../context/SettingsContext";
import { Facebook, Instagram, Youtube as YtIcon } from "../../components/ui/SocialIcons";
import AdminFacebook from "./AdminFacebook";

// Cross-posting: other people whose OWN Facebook Page, Instagram, YouTube and
// Telegram you post to, using ALL your content. Each user gets the full Social
// Media Auto Posting screen, starting empty, saved only for that user.

function Badge({ on, Icon, label }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${on ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
      <Icon className="h-3 w-3" /> {label}{on ? " ✓" : ""}
    </span>
  );
}

function ProfileList() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  const load = () => socialProfileService.list().then((r) => setList(r?.profiles || [])).catch((e) => { setList([]); setErr(e.message); });
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy("add"); setErr("");
    try { await socialProfileService.create(name.trim()); setName(""); setAdding(false); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const rename = async (id) => {
    if (!editName.trim()) return;
    setBusy(id); setErr("");
    try { await socialProfileService.rename(id, editName.trim()); setEditId(""); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? Their saved accounts and all ${p.schedules} of their schedules are removed. Nothing is deleted from their Facebook, Instagram, YouTube or Telegram.`)) return;
    setBusy(p.id); setErr("");
    try { await socialProfileService.remove(p.id); await load(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Users className="h-6 w-6 text-brand-600" /> Cross-posting</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Post your content to <b>other people's</b> social accounts. Add a user, then open them to connect <b>their own</b> Facebook Page,
          Instagram, YouTube channel and Telegram and set up their schedules — every Social Media Auto Posting option, starting empty and saved only for that user.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Users {list ? `(${list.length})` : ""}</p>
          {!adding && <button type="button" onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> Add user</button>}
        </div>
        {adding && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="User's name, e.g. Rahul Sharma" />
            <button type="button" onClick={add} disabled={busy === "add" || !name.trim()} className="btn-primary">
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add
            </button>
            <button type="button" onClick={() => { setAdding(false); setName(""); }} className="btn-outline"><X className="h-4 w-4" /></button>
          </div>
        )}
        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

        <div className="mt-4 space-y-2">
          {list === null && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
          {list?.length === 0 && <p className="text-sm text-slate-400">No users yet — click <b>Add user</b>.</p>}
          {(list || []).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                {editId === p.id ? (
                  <div className="flex gap-2">
                    <input className="input min-w-0 flex-1" autoFocus maxLength={80} value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(p.id); }} />
                    <button type="button" onClick={() => rename(p.id)} disabled={busy === p.id} className="btn-primary !px-3"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEditId("")} className="btn-outline !px-3"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <p className="font-semibold">{p.name}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge on={p.facebook} Icon={Facebook} label="Facebook" />
                  <Badge on={p.instagram} Icon={Instagram} label="Instagram" />
                  <Badge on={p.youtube} Icon={YtIcon} label={p.youtubeChannel ? `YouTube · ${p.youtubeChannel}` : "YouTube"} />
                  <Badge on={p.telegram} Icon={Send} label="Telegram" />
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800"><CalendarClock className="h-3 w-3" /> {p.schedules} schedule{p.schedules === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { setEditId(p.id); setEditName(p.name); }} title="Rename" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(p)} disabled={busy === p.id} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-900/20">{busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                <Link to={`/admin/cross-posting/${p.id}`} className="btn-primary !py-1.5">Open <ChevronRight className="h-4 w-4" /></Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// One user's own Social Media Auto Posting screen.
function ProfileWorkspace({ id }) {
  // Point every social request at this user BEFORE the screen renders (its
  // children fetch on mount — before this component's own effects run), and
  // back to the main account on leave. The parent keys this by id.
  useState(() => { setActiveSocialProfile(id); return id; });
  const [name, setName] = useState("");
  useEffect(() => {
    setActiveSocialProfile(id);
    socialProfileService.list().then((r) => setName((r?.profiles || []).find((p) => p.id === id)?.name || "")).catch(() => {});
    return () => { setActiveSocialProfile(""); };
  }, [id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 dark:border-brand-900/50 dark:bg-brand-900/20">
        <Link to="/admin/cross-posting" className="btn-outline !py-1.5"><ArrowLeft className="h-4 w-4" /> All users</Link>
        <p className="text-sm">
          Editing <b>{name || "this user"}</b> — everything here (accounts, schedules, comments, templates…) is saved <b>only for this user</b>
          and posts to <b>their</b> accounts. Your own Social Media Auto Posting is not changed.
        </p>
      </div>
      <ScopedSettingsProvider key={id}>
        <AdminFacebook key={id} />
      </ScopedSettingsProvider>
    </div>
  );
}

export default function AdminCrossPosting() {
  const { profileId } = useParams();
  return /^[a-f0-9]{24}$/i.test(profileId || "") ? <ProfileWorkspace key={profileId} id={profileId} /> : <ProfileList />;
}
