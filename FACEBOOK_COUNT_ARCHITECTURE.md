# Facebook Publication Count — Architecture & Reconciliation

This document explains how the application counts Facebook publications, why the
UI once showed **"Lifetime posts published: 2"** next to **"Our records: 3"**,
and what the Meta Graph API number (e.g. **25**) actually represents.

> **TL;DR** – The application's authoritative Facebook count is the number of
> posts *this application* successfully published, stored in our permanent
> publication **ledger** (`FbPost`). The Meta API number is a *remote, external*
> figure that also includes posts made outside this application. They are
> **different metrics** and must never be conflated.

---

## 1. The authoritative application metric

> **"Facebook posts successfully published by this application"**

- **Source of truth:** the `FbPost` ledger — one row per successful publication,
  keyed by Meta's own returned post id.
- **Single authoritative function:** `countFacebookPosts(tenantId, pageId)` in
  `backend/src/config/facebook.js`. Every UI number that means "how many posts
  did we publish" resolves through this one function. There is **no** second
  independent counter.
- A row is written **only** when a publication is genuinely successful:
  - the Meta API call returned success (`ok === true`), **and**
  - Meta returned a **real post id**, **and**
  - it is stamped with the correct **tenant** and **Facebook Page**, and stored
    with `published` status.
- Instagram successes are **never** passed into the Facebook collector, so
  Instagram can never inflate the Facebook count.

### `FbSchedule.postCount` is NOT this metric
`FbSchedule.postCount` is a **schedule / pool progress counter** ("X of Y posted"
for a given schedule). It is incremented by the scheduler in `runScheduleOnce`
and is intentionally *separate* from the lifetime publication count. It must
never be used for:

- lifetime Facebook publication count,
- Facebook published total,
- Facebook Page total.

It is retained because the scheduler needs it.

---

## 2. Why "Lifetime posts published" was 2 while "Our records" was 3

Both figures are backed by the **exact same** query — `countFacebookPosts(...)`
→ `FbPost.countDocuments({ tenantId, pageId })`. There was **no** second data
source and **no** backend disagreement.

The gap was a **frontend staleness bug** in `AdminFacebook.jsx` (`FbLedgerStats`):

| Field | When it was fetched |
|---|---|
| Lifetime posts published (`stats.lifetime`) | **once, on component mount** — never refreshed |
| Our records (`rec.ours` → `applicationCount`) | **freshly**, each time *Reconcile* is clicked |

So immediately after a new publication (ledger 2 → 3), the mounted panel still
displayed its stale snapshot of `2`, while *Reconcile* read the live `3`.

**Fix:** the lifetime figure now adopts the freshly-read authoritative count
after a reconcile (and the recent list is refreshed), so both always show the
same live number. Both continue to read the one authoritative ledger.

---

## 3. What the Meta Graph API number (25) actually is

The reconciliation calls one Meta Graph API endpoint (`getFacebookPublishedCount`
in `backend/src/config/facebook.js`). The exact request:

| Property | Value |
|---|---|
| **Endpoint** | `GET https://graph.facebook.com/{version}/{page-id}/published_posts` |
| **API version** | `cfg.version` — from the `fbGraphVersion` setting, **default `v21.0`** |
| **Query params** | `limit=1`, `summary=total_count`, `access_token={page token}` |
| **Requested fields** | none beyond the summary — only `summary.total_count` is read |
| **Page ID** | the connected Page (`Settings.fbPageId`) |
| **Access token** | the resolved **Page** access token (`resolvePageToken`) |
| **Pagination** | **none** — a single request; `limit=1` fetches one item and the aggregate comes from `summary.total_count` |
| **Filtering** | none applied by us |
| **Content types included** | the Page's **`published_posts`** edge: all posts *published by the Page* (status updates, photos, links, videos), **regardless of who/what published them** |
| **Number of pages fetched** | **1** |

### Why 25 ≠ 3
`published_posts.summary.total_count` is the Page's own count of **everything the
Page has ever published** — including posts created **manually** or by **other
tools**, historical posts predating this application, and post types this
application never creates. Our application published only 3 of them, so the
remote number is legitimately larger.

Because it is a **summary total** (not an enumerated, filtered collection of the
posts *we* made), it is **NOT** an authoritative measure of "posts published by
this application." Code inspection confirms it is *not* a complete, app-scoped
collection — hence the UI label:

- Old: ~~"Facebook reports"~~
- New: **"Remote posts found by Meta API"** (clearly a remote/external figure).

> The Meta API fetching implementation is **unchanged** by this work — this
> section documents the *existing* request per the investigation requirement.

---

## 4. Native Facebook Page UI count (e.g. 58) — separate and out of scope

Facebook's own Page UI "posts" number is a **Meta-controlled UI metric**. This
application **cannot** and does **not** attempt to set or override it. If the
Page UI shows 58 while this application has published a different number of
visible posts, that is expected:

- **Facebook Page UI count** = Meta/Facebook-controlled UI metric.
- **Application count** = our publication ledger (`FbPost`) — the authoritative
  count of posts *this application* published.

These are **separate metrics** and are not expected to match. No change to
Oracle/DB, React, Node.js, or the Meta request can (or should) alter Facebook's
native Page counter.

---

## 5. Reconciliation is diagnostic only

`GET /api/facebook/reconcile` never modifies the application publication count.
It reports:

| Field | Meaning |
|---|---|
| `applicationCount` | authoritative ledger count (`countFacebookPosts`) |
| `remoteApiCount` | Meta `published_posts.summary.total_count` (or `null` if unavailable) |
| `remoteOnly` | posts on Meta not matched in our ledger (`null` when it cannot be determined from the summary-only endpoint) |
| `ledgerOnly` | ledger posts not seen remotely (`null` when it cannot be determined from the summary-only endpoint) |
| `drift` | `remoteApiCount - applicationCount` (or `null`) — informational |
| `status` | `in_sync` \| `drift_detected` \| `remote_unavailable` |
| `lastReconciledAt` | ISO timestamp of this reconciliation run |
| `remoteCountKind` | identifies the remote figure as the summary total, not an app-scoped collection |

Reconciliation must **not**:
- change our publication count to the remote number,
- import unmatched remote records,
- treat the remote number as the Page's authoritative lifetime post count.

> `remoteOnly` / `ledgerOnly` are reported as `null` today because the current
> Meta request returns only an aggregate `summary.total_count`, not an enumerated
> list of remote post ids. Computing exact set differences would require a new,
> paginated id-fetch, which is intentionally **not** part of this change.

---

## 6. Idempotency & data safety

- The ledger stays on the existing database — **no migration, no reset, no record
  deletion.**
- Idempotency: a repeat of the same publication (retry, callback, re-processing)
  **never** creates a second row. `recordFbPublications` upserts with
  `$setOnInsert` keyed by the Meta post id, and the model enforces a unique index
  on `{ tenantId, facebookPostId }`. Because a Meta post id is unique to one
  Page, `tenantId + pageId + metaPostId` can likewise never produce a duplicate.
