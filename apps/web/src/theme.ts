export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "safeslackforce-theme";
export const THEME_CHANGE_EVENT = "safeslackforce:theme-change";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function currentTheme(): Theme {
  const value =
    typeof document !== "undefined"
      ? document.documentElement.dataset.theme
      : undefined;
  return isTheme(value) ? value : (readStoredTheme() ?? systemTheme());
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#100f0e" : "#f5f7f4");
  window.dispatchEvent(
    new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }),
  );
}

export function chooseTheme(theme: Theme): void {
  // Keep the choice for this page even when private browsing blocks storage.
  document.documentElement.dataset.themePreference = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Applying a theme never depends on permission to persist it.
  }
  applyTheme(theme);
}

export function initializeTheme(): void {
  const preferred = readStoredTheme();
  if (preferred) document.documentElement.dataset.themePreference = preferred;
  applyTheme(preferred ?? systemTheme());
}
