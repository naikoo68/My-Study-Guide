import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Compass className="h-16 w-16 text-brand-500" />
      <h1 className="mt-6 text-6xl font-extrabold">404</h1>
      <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
        Oops! The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="btn-primary mt-8">
        <Home className="h-4 w-4" /> Back to Home
      </Link>
    </div>
  );
}
