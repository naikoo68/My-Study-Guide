# Voice server — "My own voice"

Clones your voice from a short recording and narrates videos in it. It runs on
**your own server**: recordings and audio never go to an outside company.

- Engine: [Chatterbox](https://github.com/resemble-ai/chatterbox) by Resemble AI, **MIT licence** (fine for a monetised channel).
  It adds an inaudible watermark to its audio (Resemble's "Perth"), which marks it as AI-made.
- CPU only, no GPU needed. Works on x86 and on ARM (Oracle Ampere).
- Used from **Admin → Voice Studio**: record, create, test, tune, then **Use as narrator**.
  You can also pick the engine "My own voice" under Social Media Auto Posting.

## What it needs

| | |
|---|---|
| RAM | **8 GB or more**. The model uses about 6 GB. Oracle Always Free **Ampere A1** gives up to 24 GB. The 1 GB "E2 Micro" is too small |
| Disk | About 6 GB (image + model) |
| Speed | About 0.6× real time on 8 x86 cores. One minute of speech takes roughly 1½–3 minutes to make. Videos render in the background, one narration at a time |

## Install (one click)

GitHub → **Actions → "Deploy voice server to Oracle VM" → Run workflow**.

The workflow does the following:
1. Checks the VM's RAM and stops if it is too small. Nothing is changed in that case.
2. Writes `VOICE_SERVER_URL=http://msg-voice:8000` and a random `VOICE_SERVER_TOKEN` into `backend/msg.env`.
3. Builds and starts the `msg-voice` container on the private Docker network `msg-net`. Voices and the model are kept in `~/msg-voice-data`.
4. Waits for the model download (about 2 GB, first time only).
5. Redeploys the backend so it picks up the new settings.

The voice server is not reachable from the internet. It listens only on the private
network and on `127.0.0.1:8020` for checks: `curl http://127.0.0.1:8020/health`.

Choose `turbo` (the default) or `standard` when you run the workflow:
- `turbo` is faster on a CPU. It understands tags like `[laugh]`, `[chuckle]` and `[sigh]` in the text.
- `standard` is slower, and adds "Emotion" and "Pace control" sliders.

## Good recordings

- 30–60 seconds in total, in a quiet room. Speak the way you want the videos to sound.
- Long pauses are cut automatically. Only the first 60 s of speech is used.
- Remove a take that has noise, music or coughs (Voice Studio → Recordings).

## Backups and multiple institutes

- Your voices are plain files in `~/msg-voice-data/voices/`. Back up that folder.
- Each institute (tenant) gets its own folder. Institutes never see or use each other's voices.

## API (for reference)

All calls need `Authorization: Bearer $VOICE_SERVER_TOKEN` and `X-Voice-Owner: <tenant>`.
`GET /health` · `GET/POST /voices` · `GET/PATCH/DELETE /voices/{id}` ·
`POST /voices/{id}/samples` · `GET/DELETE /voices/{id}/samples/{sid}` ·
`POST /v1/audio/speech` (OpenAI-style: `{ input, voice, response_format }`).
