// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../ThemeToggle";
import { currentTheme, initializeTheme, THEME_STORAGE_KEY } from "../theme";

let container: HTMLDivElement;
let root: Root;
let media: EventTarget & { matches: boolean };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  initializeTheme();
  await act(async () => root.render(<ThemeToggle />));
}

function toggle() {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Dark theme"]')!;
}

async function changeSystem(dark: boolean) {
  await act(async () => {
    media.matches = dark;
    media.dispatchEvent(new Event("change"));
  });
}

describe("workspace appearance", () => {
  it("restores an explicit theme before rendering and persists a new choice", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    await mount();
    expect(currentTheme()).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(toggle().textContent).toBe("Light mode");

    await act(async () => toggle().click());
    expect(currentTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    await changeSystem(true);
    expect(currentTheme()).toBe("light");
  });

  it("follows the system until a user makes a choice, ignoring invalid saved values", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "unknown-theme");
    media.matches = true;
    await mount();
    expect(currentTheme()).toBe("dark");
    await changeSystem(false);
    expect(currentTheme()).toBe("light");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");

    await act(async () => toggle().click());
    await changeSystem(false);
    expect(currentTheme()).toBe("dark");
  });

  it("keeps toggling and honors the current choice when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    await mount();
    await act(async () => toggle().click());
    expect(currentTheme()).toBe("dark");
    await changeSystem(false);
    expect(currentTheme()).toBe("dark");
    await act(async () => toggle().click());
    expect(currentTheme()).toBe("light");
  });

  it("synchronizes another tab's preference and returns to system appearance after removal", async () => {
    await mount();
    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: THEME_STORAGE_KEY,
      newValue: "dark",
    })));
    expect(currentTheme()).toBe("dark");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");

    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: THEME_STORAGE_KEY,
      newValue: null,
    })));
    expect(currentTheme()).toBe("light");
    await changeSystem(true);
    expect(currentTheme()).toBe("dark");
  });

  it("removes system and cross-tab subscriptions when the toggle unmounts", async () => {
    await mount();
    await act(async () => root.render(null));
    await changeSystem(true);
    window.dispatchEvent(new StorageEvent("storage", {
      key: THEME_STORAGE_KEY,
      newValue: "dark",
    }));
    expect(currentTheme()).toBe("light");
  });
});
