import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

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
import { notFound, errorHandler } from "./middleware/error.js";
import { isMailConfigured } from "./config/mailer.js";

const app = express();

// Security & parsing.
// Auth is stateless (JWT in the Authorization header, no cookies), so we can
// safely reflect any origin — this avoids CORS problems no matter which Vercel
// URL (production, preview or branch) the site is opened from.
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// Health check — also reports whether email (SMTP) is configured so you can
// verify your Render settings by visiting /api/health in a browser.
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "my-prep-mart-api", mailConfigured: isMailConfigured() })
);

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

// Errors
app.use(notFound);
app.use(errorHandler);

export default app;
