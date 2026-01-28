export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type ColorTheme = "tangerine" | "ocean" | "forest" | "sunset" | "lavender" | "slate";

const STORAGE_KEY = "clawdbot-theme";
const COLOR_THEME_KEY = "clawdbot-color-theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

export function getSavedTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "system";
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }
  return "system";
}

export function saveTheme(mode: ThemeMode): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, mode);
}

export function getSavedColorTheme(): ColorTheme {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "tangerine";
  }
  const saved = localStorage.getItem(COLOR_THEME_KEY);
  if (saved === "tangerine" || saved === "ocean" || saved === "forest" || 
      saved === "sunset" || saved === "lavender" || saved === "slate") {
    return saved;
  }
  return "tangerine";
}

export function saveColorTheme(colorTheme: ColorTheme): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(COLOR_THEME_KEY, colorTheme);
}

export function applyColorTheme(colorTheme: ColorTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-color-theme", colorTheme);
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  
  // Update meta theme-color for mobile browsers
  updateMetaThemeColor(resolved);
}

function updateMetaThemeColor(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  
  if (!metaThemeColor) {
    metaThemeColor = document.createElement("meta");
    metaThemeColor.setAttribute("name", "theme-color");
    document.head.appendChild(metaThemeColor);
  }

  // Muted backgrounds from design system
  const color = theme === "light" ? "#FAFAF9" : "#1A1816";
  metaThemeColor.setAttribute("content", color);
}

export function initTheme(): ThemeMode {
  const saved = getSavedTheme();
  const colorTheme = getSavedColorTheme();
  applyTheme(saved);
  applyColorTheme(colorTheme);
  
  // Watch for system theme changes
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      const current = getSavedTheme();
      if (current === "system") {
        applyTheme("system");
      }
    });
  }
  
  return saved;
}

export const COLOR_THEMES: Record<ColorTheme, { name: string; preview: string }> = {
  tangerine: { name: "Tangerine", preview: "#FF9F40" },
  ocean: { name: "Ocean", preview: "#0EA5E9" },
  forest: { name: "Forest", preview: "#10B981" },
  sunset: { name: "Sunset", preview: "#F43F5E" },
  lavender: { name: "Lavender", preview: "#A78BFA" },
  slate: { name: "Slate", preview: "#64748B" },
};
