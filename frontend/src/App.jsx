import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SettingsProvider } from "./context/SettingsContext";
import { AuthProvider } from "./context/AuthContext";
import { ZoomProvider } from "./context/ZoomContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import ContentProtection from "./components/ui/ContentProtection";
import Layout from "./components/layout/Layout";
import { Loading } from "./components/ui/AsyncState";

// Pages are loaded on demand (code-splitting) so the first visit only downloads
// the code it actually needs, instead of the whole app in one large bundle.
const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

const QuizHome = lazy(() => import("./pages/quiz/QuizHome"));
const SubjectTopics = lazy(() => import("./pages/quiz/SubjectTopics"));
const TopicSessions = lazy(() => import("./pages/quiz/TopicSessions"));
const SessionQuizzes = lazy(() => import("./pages/quiz/SessionQuizzes"));
const QuizPlay = lazy(() => import("./pages/quiz/QuizPlay"));
const QuizResult = lazy(() => import("./pages/quiz/QuizResult"));

const StudyHome = lazy(() => import("./pages/study/StudyHome"));
const StudySubjects = lazy(() => import("./pages/study/StudySubjects"));
const StudyClasses = lazy(() => import("./pages/study/StudyClasses"));
const StudyFiles = lazy(() => import("./pages/study/StudyFiles"));

const TestExams = lazy(() => import("./pages/testseries/TestExams"));
const ExamPosts = lazy(() => import("./pages/testseries/ExamPosts"));
const PostTests = lazy(() => import("./pages/testseries/PostTests"));
const TestAttempt = lazy(() => import("./pages/testseries/TestAttempt"));

const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminTests = lazy(() => import("./pages/admin/AdminTests"));
const AdminStudyMaterial = lazy(() => import("./pages/admin/AdminStudyMaterial"));
const AdminFeedback = lazy(() => import("./pages/admin/AdminFeedback"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminCustomization = lazy(() => import("./pages/admin/AdminCustomization"));
const AdminNotices = lazy(() => import("./pages/admin/AdminNotices"));

// Wraps a lazily-loaded page in a Suspense boundary with a loading fallback.
const S = (Comp) => (
  <Suspense fallback={<div className="container-page"><Loading label="Loading…" /></div>}>
    <Comp />
  </Suspense>
);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: S(Home) },
      { path: "/about", element: S(About) },
      { path: "/contact", element: S(Contact) },

      { path: "/quiz", element: S(QuizHome) },
      { path: "/quiz/:subjectId", element: S(SubjectTopics) },
      { path: "/quiz/:subjectId/:topicId", element: S(TopicSessions) },
      { path: "/quiz/:subjectId/:topicId/:sessionId", element: S(SessionQuizzes) },
      { path: "/quiz/:subjectId/:topicId/:sessionId/:quizId", element: S(QuizPlay) },
      { path: "/quiz/:subjectId/:topicId/:sessionId/:quizId/result", element: S(QuizResult) },

      { path: "/test-series", element: S(TestExams) },
      { path: "/test-series/:examId", element: S(ExamPosts) },
      { path: "/test-series/:examId/:postId", element: S(PostTests) },

      { path: "/study", element: S(StudyHome) },
      { path: "/study/:institutionId", element: S(StudySubjects) },
      { path: "/study/:institutionId/:subjectId", element: S(StudyClasses) },
      { path: "/study/:institutionId/:subjectId/:classId", element: S(StudyFiles) },

      { path: "/login", element: S(Login) },
      { path: "/register", element: S(Register) },
      { path: "/forgot-password", element: S(ForgotPassword) },

      {
        path: "/dashboard",
        element: <ProtectedRoute>{S(Dashboard)}</ProtectedRoute>,
      },
    ],
  },

  // Full-screen test interface (outside main layout)
  {
    path: "/test-series/attempt/:testId",
    element: <ProtectedRoute>{S(TestAttempt)}</ProtectedRoute>,
  },

  // Admin (separate shell)
  { path: "/admin/login", element: S(AdminLogin) },
  {
    path: "/admin",
    element: (
      <ProtectedRoute role="admin">
        {S(AdminLayout)}
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: S(AdminDashboard) },
      { path: "content", element: S(AdminContent) },
      { path: "tests", element: S(AdminTests) },
      { path: "study", element: S(AdminStudyMaterial) },
      { path: "feedback", element: S(AdminFeedback) },
      { path: "users", element: S(AdminUsers) },
      { path: "messages", element: S(AdminMessages) },
      { path: "notices", element: S(AdminNotices) },
      { path: "customization", element: S(AdminCustomization) },
    ],
  },

  { path: "*", element: S(NotFound) },
]);

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <ZoomProvider>
            <ContentProtection />
            <RouterProvider router={router} />
          </ZoomProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
