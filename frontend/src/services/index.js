import { api } from "../lib/api";

// ---- Auth ----
export const authService = {
  login: (email, password) => api.post("/auth/login", { email, password }, { auth: false }),
  register: (name, email, password) =>
    api.post("/auth/register", { name, email, password }, { auth: false }),
  verifyOtp: (email, otp) => api.post("/auth/verify-otp", { email, otp }, { auth: false }),
  resendOtp: (email) => api.post("/auth/resend-otp", { email }, { auth: false }),
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
  quizzes: (sessionId) => api.get(`/sessions/${sessionId}/quizzes`),
  quizQuestions: (quizId) => api.get(`/quizzes/${quizId}/questions`),
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
  // quizzes (admin)
  createQuiz: (data) => api.post("/quizzes", data),
  updateQuiz: (id, data) => api.put(`/quizzes/${id}`, data),
  deleteQuiz: (id) => api.del(`/quizzes/${id}`),
  // questions (admin)
  createQuestion: (data) => api.post("/questions", data),
  updateQuestion: (id, data) => api.put(`/questions/${id}`, data),
  deleteQuestion: (id) => api.del(`/questions/${id}`),
  // bulk upload: context merged into each question (subject/session/quiz/testSeries)
  bulkQuestions: (questions, context) => api.post("/questions/bulk", { questions, context }),
};

// ---- Quiz ----
export const quizService = {
  submit: (quizId, answers, timeTaken) =>
    api.post(`/quiz/${quizId}/submit`, { answers, timeTaken }),
};

// ---- Test series ----
export const testService = {
  // list accepts { post, category, exam } filters
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.post) q.set("post", params.post);
    if (params.exam) q.set("exam", params.exam);
    if (params.category && params.category !== "All") q.set("category", params.category);
    const s = q.toString();
    return api.get(`/tests${s ? `?${s}` : ""}`);
  },
  adminList: (postId) => api.get(`/tests/admin/all${postId ? `?post=${postId}` : ""}`),
  get: (id) => api.get(`/tests/${id}`),
  submit: (id, answers, timeTaken) => api.post(`/tests/${id}/submit`, { answers, timeTaken }),
  // admin
  create: (data) => api.post("/tests", data),
  update: (id, data) => api.put(`/tests/${id}`, data),
  togglePublish: (id) => api.patch(`/tests/${id}/publish`),
  remove: (id) => api.del(`/tests/${id}`),
  getAccess: (id) => api.get(`/tests/${id}/access`),
  updateAccess: (id, data) => api.put(`/tests/${id}/access`, data),
  // manual question management for a test series
  getQuestions: (id) => api.get(`/tests/${id}/questions`),
  addQuestion: (id, data) => api.post(`/tests/${id}/questions`, data),
  deleteQuestion: (id, qid) => api.del(`/tests/${id}/questions/${qid}`),
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
  send: (data) => api.post("/messages", data), // requires login (sends JWT)
  list: () => api.get("/messages"),
  unreadCount: () => api.get("/messages/unread-count"),
  toggleRead: (id, read) => api.patch(`/messages/${id}/read`, { read }),
  remove: (id) => api.del(`/messages/${id}`),
};

// ---- Exams & Posts (test-series hierarchy) ----
export const examService = {
  exams: () => api.get("/exams"),
  posts: (examId) => api.get(`/exams/${examId}/posts`),
  createExam: (data) => api.post("/exams", data),
  updateExam: (id, data) => api.put(`/exams/${id}`, data),
  deleteExam: (id) => api.del(`/exams/${id}`),
  createPost: (data) => api.post("/posts", data),
  updatePost: (id, data) => api.put(`/posts/${id}`, data),
  deletePost: (id) => api.del(`/posts/${id}`),
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
  getAccess: (id) => api.get(`/users/${id}/access`),
  updateAccess: (id, data) => api.put(`/users/${id}/access`, data),
};
