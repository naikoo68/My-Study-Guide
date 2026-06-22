import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Verifies the JWT from the Authorization header and attaches req.user.
export async function protect(req, res, next) {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    token = header.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    if (user.status === "blocked") {
      return res.status(403).json({ message: "Your account has been blocked" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
}

// Restricts a route to specific roles, e.g. admin(...roles).
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
}
