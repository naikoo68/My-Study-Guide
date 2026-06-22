import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext();

// Demo auth layer. In production these methods call the backend
// (POST /api/auth/login, /register, etc.) and store a JWT.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("mpm-user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem("mpm-user", JSON.stringify(user));
    else localStorage.removeItem("mpm-user");
  }, [user]);

  const login = ({ email, name, role = "student" }) => {
    const profile = {
      name: name || email.split("@")[0],
      email,
      role,
      avatar: (name || email).slice(0, 2).toUpperCase(),
      joined: "2026",
      streak: 7,
    };
    setUser(profile);
    return profile;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
