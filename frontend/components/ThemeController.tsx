"use client";

import { useEffect } from "react";

const themeKey = "nova-theme";

export default function ThemeController() {
  useEffect(() => {
    const applyTheme = (light: boolean, button?: HTMLButtonElement) => {
      document.documentElement.classList.toggle("nova-light", light);
      if (button) {
        button.setAttribute("aria-pressed", String(light));
        button.title = light ? "Light theme enabled" : "Dark theme enabled";
      }
      try { localStorage.setItem(themeKey, light ? "light" : "dark"); } catch { /* Storage may be unavailable. */ }
    };

    try { applyTheme(localStorage.getItem(themeKey) === "light"); } catch { /* Use dark by default. */ }

    const toggleTheme = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(
        'button[title="Dark theme"], button[title="Dark theme enabled"], button[title="Light theme enabled"]',
      );
      if (!button) return;
      event.preventDefault();
      applyTheme(!document.documentElement.classList.contains("nova-light"), button);
    };

    document.addEventListener("click", toggleTheme);
    return () => document.removeEventListener("click", toggleTheme);
  }, []);

  return null;
}
