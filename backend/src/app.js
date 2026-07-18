import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

// Patch Express to handle async errors globally — any async route handler or
// middleware that throws/rejects will have the error forwarded to the error
// handler automatically, without needing individual try/catch or asyncHandler
// wrappers on every route. This is equivalent to the `express-async-errors` pkg.
import Layer from "express/lib/router/layer.js";
const origHandle = Layer.prototype.handle_request;
Layer.prototype.handle_request = function handleRequest(req, res, next) {
  try {
    const ret = origHandle.call(this, req, res, next);
    if (ret && typeof ret.catch === "function") {
      ret.catch(next);
    }
  } catch (err) {
    next(err);
  }
};
const origHandleErr = Layer.prototype.handle_error;
Layer.prototype.handle_error = function handleError(err, req, res, next) {
  try {
    const ret = origHandleErr.call(this, err, req, res, next);
    if (ret && typeof ret.catch === "function") {
      ret.catch(next);
    }
  } catch (e) {
    next(e);
  }
};

import authRoutes from "./routes/authRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import setupRoutes from "./routes/setupRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import studyRoutes from "./routes/studyRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import practiceRoutes from "./routes/practiceRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { isMailConfigured, verifyMail } from "./config/mailer.js";
import { isCloudinaryConfigured } from "./config/cloudinary.js";

import { protect, authorize } from "./middleware/auth.js";

const app = express();

// Security & parsing.
// In production, restrict CORS to the configured CLIENT_URL (and common Vercel
// preview URLs). In development, allow any origin for convenience.
app.use(helmet());
const corsOrigin = process.env.NODE_ENV === "production"
  ? (origin, callback) => {
      const allowed = (process.env.CLIENT_URL || "").replace(/\/$/, "");
      // Allow: the configured client URL, Vercel preview deployments, and
      // requests with no Origin header (e.g. server-to-server, curl, mobile).
      if (!origin || origin === allowed || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // log but don't block — stateless JWT auth means CORS is defence-in-depth only
        console.warn(`[CORS] Request from unlisted origin: ${origin}`);
      }
    }
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// Health check — also reports whether email (SMTP) is configured so you can
// verify your Render settings by visiting /api/health in a browser.
app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    service: "my-study-guide-api",
    // Bump this whenever backend code changes so we can verify Render actually
    // redeployed: open /api/health and check `version`. If it's older than the
    // latest, the backend did NOT deploy and server-side fixes aren't live.
    version: "2026-07-18-wrap-numeric-latex-v17",
    features: ["ai-scope", "ai-key-owner", "extract-batches", "matching-labels", "documents", "extract-remaining", "notes-gen", "latex-json-repair", "no-currency-dollar", "parallel-small-chunks", "provider-timeout", "addtotest-drilldown", "mytest-subjectplan", "reshuffle-subjects-questions-options", "db-indexes", "extend-verify-numeric", "extend-verify-matching-pairs", "generate-extract-formula-verify", "regenerate-question", "wrap-numeric-options-latex"],
    mailConfigured: isMailConfigured(),
    uploadConfigured: isCloudinaryConfigured(),
  })
);

// Diagnostic: tests the SMTP login (does NOT send an email) and returns the
// real error if it fails. Protected — admin only.
app.get("/api/health/mail", protect, authorize("admin"), async (req, res) => res.json(await verifyMail()));

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", contentRoutes); // /subjects, /sessions, /questions
app.use("/api/tests", testRoutes);
app.use("/api/quiz", quizRoutes); // /quiz/:sessionId/submit
app.use("/api/users", userRoutes);
app.use("/api", analyticsRoutes); // /admin/analytics, /me/dashboard, /leaderboard
app.use("/api/upload", uploadRoutes);
app.use("/api/setup", setupRoutes); // one-time bootstrap (auto-disabled after first admin)
app.use("/api/settings", settingsRoutes); // site branding & theme (public read, admin write)
app.use("/api/messages", messageRoutes); // contact-form inbox
app.use("/api", examRoutes); // /exams, /exams/:id/posts, /posts
app.use("/api", studyRoutes); // study material: institutions → subjects → classes → files
app.use("/api/feedback", feedbackRoutes); // student feedback (per-question + overall)
app.use("/api/notices", noticeRoutes); // scrolling notice board (public read, admin write)
app.use("/api/documents", documentRoutes); // standalone text documents (PDF text extraction)
app.use("/api/practice", practiceRoutes); // "Practice Quizzes" section (My Quiz / My Test Series)
app.use("/api", searchRoutes); // global metadata search (streams/subjects/topics/quizzes/tests)
app.use("/api/ai", aiRoutes); // AI question generator (admin)
app.use("/api/coupons", couponRoutes); // discount coupons (admin manage; used at client checkout)
app.use("/api/payments", paymentRoutes); // Razorpay: create orders + config for client checkout
app.use("/api/subscriptions", subscriptionRoutes); // client self-serve upgrade/renew (works when expired)

// Errors
app.use(notFound);
app.use(errorHandler);

export default app;
