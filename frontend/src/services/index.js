import { api } from "../lib/api";

// ---- Auth ----
export const authService = {
  login: (email, password) => api.post("/auth/login", { email, password }, { auth: false }),
  register: (name, email, password) =>
    api.post("/auth/register", { name, email, password }, { auth: false }),
  google: (profile) => api.post("/auth/google", profile, { auth: false }),
  me: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }, { auth: false }),
};

// ---- Subjects / topics / sessions / questions ----
export const contentService = {
  // public reads
  subjects: () => api.get("/subjects"),
  topics: (subjectId) => api.get(`/subjects/${subjectId}/topics`),
  sessions: (topicId) => api.get(`/topics/${topicId}/sessions`),
  questions: (sessionId) => api.get(`/sessions/${sessionId}/questions`),
  allQuestions: () => api.get("/questions"),
  // subjects (admin)
  createSubject: (data) => api.post("/subjects", data),
  updateSubject: (id, data) => api.put(`/subjects/${id}`, data),
  deleteSubject: (id) => api.del(`/subjects/${id}`),
  // topics (admin)
  createTopic: (data) => api.post("/topics", data),
  updateTopic: (id, data) => api.put(`/topics/${id}`, data),
  deleteTopic: (id) => api.del(`/topics/${id}`),
  // sessions (admin)
  createSession: (data) => api.post("/sessions", data),
  updateSession: (id, data) => api.put(`/sessions/${id}`, data),
  deleteSession: (id) => api.del(`/sessions/${id}`),
  // questions (admin)
  createQuestion: (data) => api.post("/questions", data),
  updateQuestion: (id, data) => api.put(`/questions/${id}`, data),
  deleteQuestion: (id) => api.del(`/questions/${id}`),
  bulkQuestions: (questions) => api.post("/questions/bulk", { questions }),
};

// ---- Quiz ----
export const quizService = {
  submit: (sessionId, answers, timeTaken) =>
    api.post(`/quiz/${sessionId}/submit`, { answers, timeTaken }),
};

// ---- Test series ----
export const testService = {
  list: (category) => api.get(`/tests${category && category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`),
  adminList: () => api.get("/tests/admin/all"),
  get: (id) => api.get(`/tests/${id}`),
  submit: (id, answers, timeTaken) => api.post(`/tests/${id}/submit`, { answers, timeTaken }),
  // admin
  create: (data) => api.post("/tests", data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  togglePublish: (id) => api.patch(`/tests/${id}/publish`),
  remove: (id) => api.del(`/tests/${id}`),
};

// ---- Dashboard / analytics ----
export const analyticsService = {
  dashboard: () => api.get("/me/dashboard"),
  leaderboard: () => api.get("/leaderboard"),
  adminAnalytics: () => api.get("/admin/analytics"),
};

// ---- Site settings (branding & theme) ----
export const settingsService = {
  get: () => api.get("/settings", { auth: false }),
  update: (data) => api.put("/settings", data),
};

// ---- Contact messages ----
export const messageService = {
  send: (data) => api.post("/messages", data, { auth: false }),
  list: () => api.get("/messages"),
  unreadCount: () => api.get("/messages/unread-count"),
  toggleRead: (id, read) => api.patch(`/messages/${id}/read`, { read }),
  remove: (id) => api.del(`/messages/${id}`),
};

// ---- Users (admin) ----
export const userService = {
  list: (search = "") => api.get(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.del(`/users/${id}`),
  toggleStatus: (id) => api.patch(`/users/${id}/status`),
  updatePlan: (id, plan) => api.patch(`/users/${id}/plan`, { plan }),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),
};
