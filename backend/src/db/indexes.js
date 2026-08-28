// ---------------------------------------------------------------------------
// GSI (Global Secondary Index) registry for DynamoDB.
//
// Each entry lists the single-field equality lookups that are hot enough to
// deserve an index, so the ODM can Query them directly instead of scanning the
// whole table. Chosen from the app's real access patterns (biggest tables:
// Question ~57k rows, TestSeries, Attempt, User).
//
// Index naming convention: `gsi_<field>`. Partition key = that field's value
// (stored as a string). Only equality lookups (`field: value`) use the index;
// everything else still works via Scan.
// ---------------------------------------------------------------------------

export const MODEL_INDEXES = {
  // The 57k-row table — index every parent it's fetched by.
  Question: ["quiz", "session", "subject", "testSeries", "owner"],
  TestSeries: ["owner", "practiceSubject", "practiceStream", "exam", "post"],
  Attempt: ["user", "testSeries", "quiz"],
  PublicAttempt: ["testSeries", "user"],
  CbtAttempt: ["testSeries", "user"],
  CbtRegistration: ["testSeries", "user"],
  User: ["email", "referralCode"],
  Quiz: ["session", "subject"],
  Session: ["topic", "subject"],
  Topic: ["subject"],
  Subject: ["stream"],
  ExamPost: ["exam"],
  PracticeSubject: ["stream", "owner"],
  PracticeTopic: ["subject", "owner"],
  SmSubject: ["institution"],
  SmClass: ["institution", "subject"],
  SmFile: ["smClass", "subject", "institution"],
  ContentShare: ["owner", "toUser"],
  Feedback: ["questionId", "user"],
  Document: ["createdBy"],
};

export const indexNameForField = (field) => `gsi_${field}`;

// Fields that are indexed for a given model (empty array if none).
export const indexedFields = (modelName) => MODEL_INDEXES[modelName] || [];
