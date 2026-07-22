import { Router } from "express";
import {
  listStreams, createStream, updateStream, deleteStream,
  listSubjects, createSubject, updateSubject, deleteSubject,
  listTopics, createTopic, updateTopic, deleteTopic, moveTopic, listTopicItems,
  listItems, createItem,
  browseStreams, browseSubjects, browseTopics, browseItems, browseTopicItems,
  playQuiz, allSubjects, myItems, moveItem, updateItem,
} from "../controllers/practiceController.js";
import { protect, authorize, optionalAuth } from "../middleware/auth.js";

const router = Router();
// Content-management routes are shared by admins (platform content) and clients
// (their own private content) — every controller scopes results by owner.
const admin = [protect, authorize("admin", "client")];

// Student browse (visibility-filtered). Attempting an item reuses /tests/:id.
router.get("/browse/:kind/streams", optionalAuth, browseStreams);
router.get("/browse/:kind/streams/:streamId/subjects", optionalAuth, browseSubjects);
router.get("/browse/:kind/subjects/:subjectId/topics", optionalAuth, browseTopics); // My Quiz
router.get("/browse/:kind/subjects/:subjectId/items", optionalAuth, browseItems); // My Test Series
router.get("/browse/:kind/topics/:topicId/items", optionalAuth, browseTopicItems); // My Quiz

// Play a "My Quiz" practice quiz with immediate answer reveal (questions incl. answers).
router.get("/quiz/:id/play", protect, playQuiz);

// The caller's own practice items (client dashboard).
router.get("/my-items", ...admin, myItems);

// Admin — streams
router.get("/streams", ...admin, listStreams);
router.post("/streams", ...admin, createStream);
router.put("/streams/:id", ...admin, updateStream);
router.delete("/streams/:id", ...admin, deleteStream);
router.get("/streams/:streamId/subjects", ...admin, listSubjects);

// Admin — subjects
router.post("/subjects", ...admin, createSubject);
router.put("/subjects/:id", ...admin, updateSubject);
router.delete("/subjects/:id", ...admin, deleteSubject);
router.get("/subjects/:subjectId/items", ...admin, listItems); // My Test Series items
router.get("/subjects/:subjectId/topics", ...admin, listTopics); // My Quiz topics

// Admin — topics (My Quiz)
router.post("/topics", ...admin, createTopic);
router.put("/topics/:id", ...admin, updateTopic);
router.patch("/topics/:id/move", ...admin, moveTopic); // relocate a topic (+ its quizzes)
router.delete("/topics/:id", ...admin, deleteTopic);
router.get("/topics/:topicId/items", ...admin, listTopicItems); // My Quiz quizzes

// Admin — flat list of all practice subjects (for composing tests from practice)
router.get("/all-subjects", ...admin, allSubjects);

// Admin — items (practice test-series). Questions/visibility/attempt reuse /tests.
router.post("/items", ...admin, createItem);
router.patch("/items/:id/move", ...admin, moveItem); // relocate a practice item
router.patch("/items/:id", ...admin, updateItem); // update name / remembered AI topic

export default router;
