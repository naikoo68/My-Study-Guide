// Catalog of institute-facing admin features the super-admin can turn on/off
// per institute (from the Institutes console). The `key` matches the `feature`
// tag on the matching sidebar nav item in AdminLayout. Dashboard, Customization
// and User Manual are intentionally NOT here — every institute always keeps
// those (their home, their branding, and the help docs).
export const INSTITUTE_FEATURES = [
  { key: "content", label: "Content (Quizzes & Questions)" },
  { key: "tests", label: "Test Series" },
  { key: "practice", label: "My Practice" },
  { key: "previousPapers", label: "Previous Papers" },
  { key: "checker", label: "Question Checker" },
  { key: "shared", label: "Shared Links" },
  { key: "cbt", label: "Online Exams" },
  { key: "study", label: "Study Material" },
  { key: "documents", label: "Documents" },
  { key: "notes", label: "Handwritten Notes" },
  { key: "pdfBuilder", label: "PDF Builder" },
  { key: "resume", label: "Resume Builder" },
  { key: "users", label: "Users / Students (& their subscriptions)" },
  { key: "clients", label: "Clients (& their subscriptions)" },
  { key: "plans", label: "Plans (subscription pricing)" },
  { key: "coupons", label: "Coupons (discount codes)" },
  { key: "performance", label: "Performance" },
  { key: "feedback", label: "Feedback" },
  { key: "reviews", label: "Reviews" },
  { key: "messages", label: "Messages" },
  { key: "notices", label: "Notice Board" },
  { key: "aiGenerator", label: "AI Generator" },
  { key: "visualize", label: "Visualization Studio" },
  { key: "aiKeys", label: "AI Keys (APIs)" },
];

// A feature is enabled unless the institute's map explicitly sets it to false.
export const featureEnabled = (features, key) => !key || !features || features[key] !== false;
