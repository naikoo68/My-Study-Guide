import { Router } from "express";
import { youtubeStatus, saveYoutubeSettings, youtubeConnect, youtubeCallback, youtubeDisconnect, youtubeTest, startLongVideo, listLongVideos, longVideoStatus, youtubeUploadToken, youtubePlaylists, youtubeCreatePlaylist, youtubeThumbnailPreview, youtubeFinishUpload } from "../controllers/youtubeController.js";
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
router.post("/long-video", ...admin, startLongVideo);
router.get("/long-video", ...admin, listLongVideos);
router.get("/long-video/:id", ...admin, longVideoStatus);
// … and your own video files, uploaded from the browser straight to YouTube.
router.post("/upload-token", ...admin, youtubeUploadToken);
// Playlists ("folders") and the long-video thumbnail template.
router.get("/playlists", ...admin, youtubePlaylists);
router.post("/playlists", ...admin, youtubeCreatePlaylist);
router.post("/thumbnail-preview", ...admin, youtubeThumbnailPreview);
router.post("/videos/:videoId/finish", ...admin, youtubeFinishUpload);
// PUBLIC — Google redirects the browser here; protected by the signed `state`.
router.get("/oauth/callback", youtubeCallback);

export default router;
