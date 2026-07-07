import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { settingsService } from "../services";
import { applyTheme } from "../lib/theme";

const SettingsContext = createContext();

const DEFAULTS = {
  siteName: "My Study Guide",
  tagline: "Prepare Smart, Achieve More.",
  logoUrl: "",
  primaryColor: "#2563eb",
  accentColor: "#f97316",
  fontFamily: "Inter",
  navHeight: 64,
  navBrandSize: 18,
  navFontSize: 14,
  navFontWeight: "500",
  navFontFamily: "",
  navTextTransform: "none",
  defaultZoom: 80,
  watermarkEnabled: true,
  watermarkText: "",
  notifyOnNewContent: false,
  socialLinks: [],
  contacts: [],
  aboutHeading: "Built by educators, loved by toppers",
  aboutIntro:
    "My Study Guide started with one belief — that smart, structured practice beats endless cramming. We combine curated question banks with real-time analytics to help you study exactly what matters.",
  aboutValues: [
    { title: "Our Mission", desc: "Make high-quality exam preparation accessible and affordable for every student." },
    { title: "Our Vision", desc: "Become the most trusted self-study companion powered by data-driven learning." },
    { title: "Our Promise", desc: "Honest content, transparent analytics and relentless focus on student outcomes." },
  ],
  aboutStats: [
    { value: "1,20,000+", label: "Total Students" },
    { value: "8,500+", label: "Total Quizzes" },
    { value: "640+", label: "Total Test Series" },
  ],
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const cached = localStorage.getItem("msg-settings");
    return cached ? { ...DEFAULTS, ...JSON.parse(cached) } : DEFAULTS;
  });

  const apply = useCallback((s) => {
    setSettings(s);
    localStorage.setItem("msg-settings", JSON.stringify(s));
    applyTheme(s);
    document.title = `${s.siteName} — ${s.tagline}`;
  }, []);

  // Apply cached theme immediately, then refresh from the server.
  useEffect(() => {
    applyTheme(settings);
    document.title = `${settings.siteName} — ${settings.tagline}`;
    settingsService
      .get()
      .then((s) => apply({ ...DEFAULTS, ...s }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admin save
  const save = async (patch) => {
    const updated = await settingsService.update(patch);
    apply({ ...DEFAULTS, ...updated });
    return updated;
  };

  return (
    <SettingsContext.Provider value={{ settings, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  return useContext(SettingsContext);
}
