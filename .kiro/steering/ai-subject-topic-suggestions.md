---
inclusion: always
---

# AI subject / topic auto-suggestion — no duplicates, complete coverage

The admin "auto search / suggest subjects" and "suggest topics" features (backend
`suggestSubjects` / `suggestTopics` in `backend/src/controllers/aiController.js`,
routes `/api/ai/suggest-subjects` and `/api/ai/suggest-topics`) MUST behave as
follows. Keep these guarantees whenever editing that code.

## 1. No duplicates and no near-duplicates
The returned list must never contain:
- exact/case/whitespace duplicates,
- synonyms of the same subject/topic (e.g. "Radiobiology" vs "Radiation Biology"), or
- a broader **combined/overlapping** wording listed alongside its parts
  (e.g. "Renaissance and Reformation" together with "The Renaissance" and
  "The Reformation"; "Contemporary History" and "Contemporary Global History";
  "The Enlightenment" and "Enlightenment Philosophy"; "Age of Revolutions" and
  "Atlantic Revolutions").

BUT genuinely distinct specializations must be kept separate — never merge
"Algebra" with "Linear Algebra", or "Physics" with "Modern Physics".

Enforcement layers (all three should stay in place):
- Prompt rules that spell this out with examples.
- An AI clean-up / canonicalization pass (`canonicalizeConcepts`) that removes
  semantic near-duplicates, since plain string matching cannot.
- Exact-normalized code-side de-dupe (`dedupeExact` / `normName` in
  `backend/src/utils/conceptDedupe.js`).

## 2. Exclude what already exists
The endpoints accept an optional `existing: string[]` (names/titles already under
the parent). The frontend (`AdminContent.jsx`, `MissingItemsModal.jsx`) passes it,
and the backend must exclude those names AND near-duplicates of them — so
re-running never re-suggests or duplicates existing content.

## 3. Return the complete set in one go
The user wants ALL subjects/topics at once, not a truncated list. Keep the token
budget high enough and parse defensively: if the JSON array is cut off, salvage
every complete object (`salvageObjects`) rather than dropping the tail.

## 4. Persisting saves must not create duplicates
`createTopic` (and `createSubject`) must skip creating an item whose normalized
name already exists under the same parent (Topics have no DB-level uniqueness, so
this app-level guard is the only protection).
