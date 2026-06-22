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
import uploadRoutes from "./routes/uploadRoutes.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok", service: "my-prep-mart-api" }));

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", contentRoutes); // /subjects, /sessions, /questions
app.use("/api/tests", testRoutes);
app.use("/api/users", userRoutes);
app.use("/api", analyticsRoutes); // /admin/analytics, /me/dashboard, /leaderboard
app.use("/api/upload", uploadRoutes);

// Errors
app.use(notFound);
app.use(errorHandler);

export default app;
