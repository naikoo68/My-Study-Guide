import { Router } from "express";
import { youtubeStatus, saveYoutubeSettings, youtubeConnect, youtubeCallback, youtubeDisconnect, youtubeTest, startLongVideo, listLongVideos, longVideoStatus, youtubeUploadToken, youtubePlaylists, youtubeCreatePlaylist, youtubeThumbnailPreview, youtubeFinishUpload, longVideoQuestionCount, saveLongVideoDefaults, youtubeSlideTextPreview, startLongVideoPreview, longVideoPreviewStatus, youtubeNarrationPreview, youtubeFontFile, publishLongVideoPreview, retryLongVideo, longVideoTopicQuizzes, longVideoQueue, stopLongVideo } from "../controllers/youtubeController.js";
import { protect, authorize } from "../middleware/auth.js";

// YouTube auto-post connection (admin). Posting itself happens through the
// Facebook schedules (toYoutube) — see config/facebook.js + config/youtube.js.
const router = Router();
const admin = [protect, authorize("admin")];

router.get("/status", ...admin, youtubeStatus);
router.put("/settings", ...admin, saveYoutubeSettings);
router.post("/connect", ...admin, youtubeConnect);
router.post("/disconnect", ...admin, youtubeDisconnect);
router.post("/test", ...admin, youtubeTest);
// Long videos: auto-made full-topic quiz video (background job) …
router.post("/long-video/count", ...admin, longVideoQuestionCount);
router.post("/long-video/topic-quizzes", ...admin, longVideoTopicQuizzes);
router.put("/long-video/defaults", ...admin, saveLongVideoDefaults);
router.post("/long-video/preview", ...admin, startLongVideoPreview);
router.get("/long-video/preview/:id", ...admin, longVideoPreviewStatus);
router.post("/long-video/preview/:id/publish", ...admin, publishLongVideoPreview);
router.post("/long-video", ...admin, startLongVideo);
router.get("/long-video", ...admin, listLongVideos);
// The render queue (what's being made now + what's waiting) and Stop.
// Declared before "/long-video/:id" so "queue" isn't read as a job id.
router.get("/long-video/queue", ...admin, longVideoQueue);
router.post("/long-video/:id/stop", ...admin, stopLongVideo);
router.get("/long-video/:id", ...admin, longVideoStatus);
router.post("/long-video/:id/retry", ...admin, retryLongVideo);
// … and your own video files, uploaded from the browser straight to YouTube.
router.post("/upload-token", ...admin, youtubeUploadToken);
// Playlists ("folders") and the long-video thumbnail template.
router.get("/playlists", ...admin, youtubePlaylists);
router.post("/playlists", ...admin, youtubeCreatePlaylist);
router.post("/thumbnail-preview", ...admin, youtubeThumbnailPreview);
router.post("/slide-text-preview", ...admin, youtubeSlideTextPreview);
router.post("/narration-preview", ...admin, youtubeNarrationPreview);
router.post("/videos/:videoId/finish", ...admin, youtubeFinishUpload);
// PUBLIC — Google redirects the browser here; protected by the signed `state`.
router.get("/oauth/callback", youtubeCallback);
// PUBLIC — bundled fonts for the editor's instant slide / thumbnail preview.
router.get("/fonts/:key", youtubeFontFile);

export default router;
