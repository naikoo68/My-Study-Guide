import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// Gates routes that require an authenticated user.
// `role` optionally restricts to a specific role (e.g. "admin"),
// redirecting unauthorized visitors to the appropriate login page.
export default function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  const location = useLocation();
  const loginPath = role === "admin" ? "/admin/login" : "/login";

  if (!user || (role && user.role !== role)) {
    return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
  }
  return children;
}
