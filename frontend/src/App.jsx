import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";

import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

import QuizHome from "./pages/quiz/QuizHome";
import SubjectTopics from "./pages/quiz/SubjectTopics";
import TopicSessions from "./pages/quiz/TopicSessions";
import QuizPlay from "./pages/quiz/QuizPlay";
import QuizResult from "./pages/quiz/QuizResult";

import TestSeries from "./pages/testseries/TestSeries";
import TestAttempt from "./pages/testseries/TestAttempt";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";

import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminContent from "./pages/admin/AdminContent";
import AdminTests from "./pages/admin/AdminTests";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCustomization from "./pages/admin/AdminCustomization";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },
      { path: "/contact", element: <Contact /> },

      { path: "/quiz", element: <QuizHome /> },
      { path: "/quiz/:subjectId", element: <SubjectTopics /> },
      { path: "/quiz/:subjectId/:topicId", element: <TopicSessions /> },
      { path: "/quiz/:subjectId/:topicId/:sessionId", element: <QuizPlay /> },
      { path: "/quiz/:subjectId/:topicId/:sessionId/result", element: <QuizResult /> },

      { path: "/test-series", element: <TestSeries /> },

      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },
      { path: "/forgot-password", element: <ForgotPassword /> },

      {
        path: "/dashboard",
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
    ],
  },

  // Full-screen test interface (outside main layout)
  {
    path: "/test-series/:testId/attempt",
    element: (
      <ProtectedRoute>
        <TestAttempt />
      </ProtectedRoute>
    ),
  },

  // Admin (separate shell)
  { path: "/admin/login", element: <AdminLogin /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute role="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "content", element: <AdminContent /> },
      { path: "tests", element: <AdminTests /> },
      { path: "users", element: <AdminUsers /> },
      { path: "customization", element: <AdminCustomization /> },
    ],
  },

  { path: "*", element: <NotFound /> },
]);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
