import { Link } from "react-router-dom";
import { GraduationCap, Mail } from "lucide-react";
import {
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
} from "../ui/SocialIcons";

const socials = [
  { Icon: Facebook, label: "Facebook" },
  { Icon: Twitter, label: "Twitter" },
  { Icon: Instagram, label: "Instagram" },
  { Icon: Linkedin, label: "LinkedIn" },
  { Icon: Youtube, label: "YouTube" },
];

const columns = [
  {
    title: "Product",
    links: [
      { label: "Quizzes", to: "/quiz" },
      { label: "Test Series", to: "/test-series" },
      { label: "Dashboard", to: "/dashboard" },
      { label: "Leaderboard", to: "/dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "Admin", to: "/admin" },
      { label: "Login", to: "/login" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", to: "/contact" },
      { label: "Privacy Policy", to: "/about" },
      { label: "Terms of Service", to: "/about" },
      { label: "FAQ", to: "/about" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold">
                My Prep<span className="text-accent-500">Mart</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Prepare smart, achieve more. Subject-wise quizzes, full-length test
              series, instant results and performance analytics — all in one place.
            </p>
            <div className="mt-5 flex gap-3">
              {socials.map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-brand-600 hover:text-white dark:bg-slate-800 dark:text-slate-400"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
          <p>© {new Date().getFullYear()} My Prep Mart. All rights reserved.</p>
          <a
            href="mailto:hello@myprepmart.com"
            className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Mail className="h-4 w-4" /> hello@myprepmart.com
          </a>
        </div>
      </div>
    </footer>
  );
}
