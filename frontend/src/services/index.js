import { api } from "../lib/api";

// ---- Auth ----
export const authService = {
  login: (email, password) => api.post("/auth/login", { email, password }, { auth: false }),
  register: (name, email, password, role, extra = {}) =>
    api.post("/auth/register", { name, email, password, ...(role ? { role } : {}), ...extra }, { auth: false }),
  // Client subscription plans + live price preview (coupon / referral).
  plans: () => api.get("/auth/plans", { auth: false }),
  validateOffer: (data) => api.post("/auth/validate-offer", data, { auth: false }),
  verifyOtp: (email, otp) => api.post("/auth/verify-otp", { email, otp }, { auth: false }),
  resendOtp: (email) => api.post("/auth/resend-otp", { email }, { auth: false }),
  google: (profile) => api.post("/auth/google", profile, { auth: false }),
  me: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }, { auth: false }),
};

// ---- Subjects / topics / sessions / questions ----
export const contentService = {
  // public reads
  streams: () => api.get("/streams"),
  subjectsByStream: (streamId) => api.get(`/streams/${streamId}/subjects`),
  subjects: () => api.get("/subjects"),
  topics: (subjectId) => api.get(`/subjects/${subjectId}/topics`),
  sessions: (topicId) => api.get(`/topics/${topicId}/sessions`),
  quizzes: (sessionId) => api.get(`/sessions/${sessionId}/quizzes`),
  quizQuestions: (quizId) => api.get(`/quizzes/${quizId}/questions`),
  questions: (sessionId) => api.get(`/sessions/${sessionId}/questions`),
  allQuestions: () => api.get("/questions"),
  moveQuiz: (id, data) => api.patch(`/quizzes/${id}/move`, data), // { session, copy }
  // streams (admin)
  createStream: (data) => api.post("/streams", data),
  updateStream: (id, data) => api.put(`/streams/${id}`, data),
  deleteStream: (id) => api.del(`/streams/${id}`),
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
  // scan questions for full-question duplicates. Accepts a subjectId string
  // (quiz subject) OR a params object { subject | practiceSubject | testSeries }.
  duplicates: (params) => {
    const p = typeof params === "string" ? { subject: params } : params || {};
    const qs = new URLSearchParams();
    if (p.subject && p.subject !== "all") qs.set("subject", p.subject);
    if (p.practiceSubject) qs.set("practiceSubject", p.practiceSubject);
    if (p.testSeries) qs.set("testSeries", p.testSeries);
    const s = qs.toString();
    return api.get(`/questions/duplicates${s ? `?${s}` : ""}`);
  },
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
  // Shared-link tracker (admin): all publicly shared quizzes/tests + completions.
  sharedLinks: () => api.get("/tests/admin/shared"),
  publicAttempts: (id) => api.get(`/tests/${id}/public-attempts`), // anonymous completions for one shared item
  get: (id) => api.get(`/tests/${id}`),
  submit: (id, answers, timeTaken) => api.post(`/tests/${id}/submit`, { answers, timeTaken }),
  // public share link — no account/login needed (auth header omitted)
  getPublic: (token) => api.get(`/tests/public/${token}`, { auth: false }),
  registerPublicView: (token) => api.post(`/tests/public/${token}/view`, {}, { auth: false }), // count an open
  submitPublic: (token, answers, timeTaken) => api.post(`/tests/public/${token}/submit`, { answers, timeTaken }, { auth: false }),
  togglePublicLink: (id, enable, expiresAt) => api.patch(`/tests/${id}/public-link`, { enable, ...(expiresAt !== undefined ? { expiresAt } : {}) }),
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
  // pull questions from the quiz/practice bank into a test
  populate: (id, plan) => api.post(`/tests/${id}/populate`, plan), // { quizPlan, practicePlan }
  // migration (admin)
  toTestSeries: (id, data) => api.patch(`/tests/${id}/to-test-series`, data), // { exam, post }
  toMyTest: (id, data) => api.patch(`/tests/${id}/to-my-test`, data), // { practiceStream, practiceSubject }
  moveTestSeries: (id, data) => api.patch(`/tests/${id}/move-series`, data), // { exam, post }
  toQuiz: (id, data) => api.patch(`/tests/${id}/to-quiz`, data), // { session }
  quizToMyQuiz: (id, data) => api.patch(`/tests/from-quiz/${id}/to-my-quiz`, data), // { practiceStream, practiceSubject, practiceTopic }
};

// ---- Practice Quizzes (My Quiz / My Test Series) ----
// Items are practice TestSeries, so questions/visibility/attempt reuse testService.
export const practiceService = {
  // student browse (kind = "quiz" | "test") — token sent if logged in (optionalAuth),
  // so students see items granted to them; guests see only public ones.
  streams: (kind) => api.get(`/practice/browse/${kind}/streams`),
  subjects: (kind, streamId) => api.get(`/practice/browse/${kind}/streams/${streamId}/subjects`),
  topics: (kind, subjectId) => api.get(`/practice/browse/${kind}/subjects/${subjectId}/topics`), // My Quiz
  items: (kind, subjectId) => api.get(`/practice/browse/${kind}/subjects/${subjectId}/items`), // My Test Series
  topicItems: (kind, topicId) => api.get(`/practice/browse/${kind}/topics/${topicId}/items`), // My Quiz
  // My Quiz play — full questions WITH answers for instant reveal (quiz-style)
  quizPlay: (id) => api.get(`/practice/quiz/${id}/play`),
  // The caller's own practice items (client dashboard) — flat quiz + test list
  myItems: () => api.get("/practice/my-items"),
  // flat list of all practice subjects (for composing a test from practice)
  allSubjects: () => api.get("/practice/all-subjects"),
  // admin — streams (kind-scoped so My Quiz & My Test Series stay separate)
  adminStreams: (kind) => api.get(`/practice/streams${kind ? `?kind=${kind}` : ""}`),
  createStream: (data) => api.post("/practice/streams", data),
  updateStream: (id, data) => api.put(`/practice/streams/${id}`, data),
  deleteStream: (id) => api.del(`/practice/streams/${id}`),
  // admin — subjects
  adminSubjects: (streamId) => api.get(`/practice/streams/${streamId}/subjects`),
  createSubject: (data) => api.post("/practice/subjects", data),
  updateSubject: (id, data) => api.put(`/practice/subjects/${id}`, data),
  deleteSubject: (id) => api.del(`/practice/subjects/${id}`),
  // admin — topics (My Quiz)
  adminTopics: (subjectId) => api.get(`/practice/subjects/${subjectId}/topics`),
  createTopic: (data) => api.post("/practice/topics", data),
  updateTopic: (id, data) => api.put(`/practice/topics/${id}`, data),
  moveTopic: (id, target) => api.patch(`/practice/topics/${id}/move`, target), // { subject } — move topic (+ its quizzes)
  deleteTopic: (id) => api.del(`/practice/topics/${id}`),
  // admin — items (practice test-series)
  adminItems: (subjectId, kind) => api.get(`/practice/subjects/${subjectId}/items${kind ? `?kind=${kind}` : ""}`),
  adminTopicItems: (topicId) => api.get(`/practice/topics/${topicId}/items`),
  createItem: (data) => api.post("/practice/items", data),
  moveItem: (id, target) => api.patch(`/practice/items/${id}/move`, target), // internal practice migration
};

// ---- CBT online exams (public name+email sign-in; emailed results; rankings) ----
export const cbtService = {
  // public (no login) — students take the exam and get results emailed
  getExam: (token) => api.get(`/cbt/exam/${token}`, { auth: false }),
  registerView: (token) => api.post(`/cbt/exam/${token}/view`, {}, { auth: false }),
  submit: (token, payload) => api.post(`/cbt/exam/${token}/submit`, payload, { auth: false }), // { name, email, answers, timeTaken }
  getResult: (resultToken) => api.get(`/cbt/result/${resultToken}`, { auth: false }),
  // admin
  exams: () => api.get("/cbt/admin/exams"),
  candidates: () => api.get("/cbt/admin/candidates"), // My Tests available to publish
  leaderboard: (id) => api.get(`/cbt/admin/${id}/leaderboard`),
  publish: (id, expiresAt) => api.patch(`/cbt/admin/${id}/publish`, expiresAt !== undefined ? { expiresAt } : {}),
  unpublish: (id) => api.patch(`/cbt/admin/${id}/unpublish`),
};

// ---- Dashboard / analytics ----
export const analyticsService = {
  dashboard: () => api.get("/me/dashboard"),
  leaderboard: () => api.get("/leaderboard"),
  stats: () => api.get("/stats", { auth: false }),
  adminAnalytics: () => api.get("/admin/analytics"),
  performance: () => api.get("/admin/performance"),
  userPerformance: (userId) => api.get(`/admin/performance/user/${userId}`),
  clearUserPerformance: (userId) => api.del(`/admin/performance/user/${userId}`),
  clearAllPerformance: () => api.del("/admin/performance"),
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

// ---- Study Material (Institution → Subject → Class → Files) ----
export const studyService = {
  institutions: () => api.get("/institutions"),
  subjects: (institutionId) => api.get(`/institutions/${institutionId}/subjects`),
  classes: (subjectId) => api.get(`/sm-subjects/${subjectId}/classes`),
  files: (classId) => api.get(`/sm-classes/${classId}/files`),
  createInstitution: (d) => api.post("/institutions", d),
  updateInstitution: (id, d) => api.put(`/institutions/${id}`, d),
  deleteInstitution: (id) => api.del(`/institutions/${id}`),
  createSubject: (d) => api.post("/sm-subjects", d),
  updateSubject: (id, d) => api.put(`/sm-subjects/${id}`, d),
  deleteSubject: (id) => api.del(`/sm-subjects/${id}`),
  createClass: (d) => api.post("/sm-classes", d),
  updateClass: (id, d) => api.put(`/sm-classes/${id}`, d),
  deleteClass: (id) => api.del(`/sm-classes/${id}`),
  createFile: (d) => api.post("/sm-files", d),
  updateFile: (id, d) => api.put(`/sm-files/${id}`, d),
  deleteFile: (id) => api.del(`/sm-files/${id}`),
};

// ---- Feedback ----
export const feedbackService = {
  send: (data) => api.post("/feedback", data),
  list: () => api.get("/feedback"),
  toggleRead: (id, read) => api.patch(`/feedback/${id}/read`, { read }),
  remove: (id) => api.del(`/feedback/${id}`),
};

// ---- Notice board (scrolling ticker) ----
export const noticeService = {
  list: () => api.get("/notices", { auth: false }), // active notices (public)
  listAll: () => api.get("/notices/all"), // admin
  create: (data) => api.post("/notices", data),
  update: (id, data) => api.put(`/notices/${id}`, data),
  remove: (id) => api.del(`/notices/${id}`),
};

// ---- Documents (standalone text store; PDF text extraction) ----
export const documentService = {
  list: () => api.get("/documents"), // lightweight list (no full content)
  get: (id) => api.get(`/documents/${id}`), // full document incl. text
  create: (data) => api.post("/documents", data), // { title, content, sourceName, pages }
  update: (id, data) => api.put(`/documents/${id}`, data),
  remove: (id) => api.del(`/documents/${id}`),
};

// ---- AI question generator (admin) ----
export const aiService = {
  status: (mode) => api.get(`/ai/status${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`),
  generate: (data) => api.post("/ai/generate", data), // returns { jobId, requested }
  job: (id) => api.get(`/ai/job/${id}`), // poll: { status, count, requested, questions? }
  extract: (data) => api.post("/ai/extract", data), // import questions from a URL/text → { questions }
  notes: (data) => api.post("/ai/notes", data), // generate study notes (Markdown) on a topic → { notes }
  extendExplanations: (data) => api.post("/ai/extend-explanations", data), // enrich all explanations in a quiz/test → { jobId, requested }
  extendOne: (data) => api.post("/ai/extend-explanation", data), // enrich ONE question's explanation → { explanation, optionExplanations }
  regenerate: (data) => api.post("/ai/regenerate-question", data), // analyse ONE question → rebuild options/answer → { options, correct, explanation }
  // Client AI access + pool selection (built-in vs own keys)
  access: () => api.get("/ai/access"), // { access, mode, allowInbuilt, allowSelf, ownKeys, inbuiltAvailable }
  setMode: (mode) => api.put("/ai/mode", { mode }), // "inbuilt" | "self"
  // AI-key management (owner-scoped: admin → platform keys, client → own keys)
  keys: {
    list: () => api.get("/ai/keys"),
    create: (data) => api.post("/ai/keys", data),
    bulkCreate: (data) => api.post("/ai/keys/bulk", data), // add many keys at once (shared preset)
    update: (id, data) => api.put(`/ai/keys/${id}`, data),
    remove: (id) => api.del(`/ai/keys/${id}`),
    test: (id) => api.post(`/ai/keys/${id}/test`),
    models: (id) => api.post(`/ai/keys/${id}/models`), // which models this key can use
    importEnv: () => api.post("/ai/keys/import"),
    testAll: () => api.post("/ai/keys/test-all"),
  },
};

// ---- File upload (Cloudinary) ----
export const uploadService = {
  file: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/upload", fd);
  },
};

// ---- Users (admin) ----
export const userService = {
  list: (search = "") => api.get(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  clients: (search = "") => api.get(`/users/clients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  create: (data) => api.post("/users", data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.del(`/users/${id}`),
  toggleStatus: (id) => api.patch(`/users/${id}/status`),
  updatePlan: (id, plan) => api.patch(`/users/${id}/plan`, { plan }),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),
  getAccess: (id) => api.get(`/users/${id}/access`),
  updateAccess: (id, data) => api.put(`/users/${id}/access`, data),
};

// ---- Discount coupons (admin) ----
export const couponService = {
  list: () => api.get("/coupons"),
  create: (data) => api.post("/coupons", data),
  update: (id, data) => api.put(`/coupons/${id}`, data),
  remove: (id) => api.del(`/coupons/${id}`),
};

// ---- Payments (Razorpay) ----
export const paymentService = {
  config: () => api.get("/payments/config", { auth: false }), // { enabled, keyId }
  createOrder: (data) => api.post("/payments/create-order", data, { auth: false }),
};

// ---- Subscription upgrade / renew (logged-in client, works when expired) ----
export const subscriptionService = {
  order: (data) => api.post("/subscriptions/order", data),
  activate: (data) => api.post("/subscriptions/activate", data),
};

// ---- Global metadata search (streams/subjects/topics/quizzes/tests) ----
// optionalAuth on the backend: an admin's token unlocks all metadata; guests
// and students see only public, published content.
export const searchService = {
  query: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
};
