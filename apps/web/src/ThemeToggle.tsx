import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  applyTheme,
  chooseTheme,
  currentTheme,
  isTheme,
  systemTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from "./theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const update = () => setTheme(currentTheme());
    const media = typeof matchMedia === "function"
      ? matchMedia("(prefers-color-scheme: dark)")
      : null;
    const followSystem = () => {
      if (!isTheme(document.documentElement.dataset.themePreference)) {
        applyTheme(systemTheme());
      }
    };
    const syncPreference = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      if (isTheme(event.newValue)) {
        document.documentElement.dataset.themePreference = event.newValue;
        applyTheme(event.newValue);
      } else {
        delete document.documentElement.dataset.themePreference;
        applyTheme(systemTheme());
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, update);
    window.addEventListener("storage", syncPreference);
    media?.addEventListener("change", followSystem);
    update();
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, update);
      window.removeEventListener("storage", syncPreference);
      media?.removeEventListener("change", followSystem);
    };
  }, []);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      aria-label="Dark theme"
      aria-pressed={dark}
      title={`Switch to ${dark ? "light" : "dark"} theme`}
      onClick={() => chooseTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
