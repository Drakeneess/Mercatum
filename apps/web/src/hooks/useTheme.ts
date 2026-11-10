"use client";

import { useEffect, useRef, useState } from "react";

export type ThemeId = "oxide" | "phosphor" | "vigil";

const THEME_STORAGE_KEY = "mercatum.ui.theme";
export const THEMES: ReadonlyArray<{ id: ThemeId; name: string; description: string; tag: string }> = [
  { id: "oxide", name: "Libro de incidencias", description: "Fotocopias, humedad y tinta roja.", tag: "PAPEL" },
  { id: "phosphor", name: "Cinta de vigilancia", description: "Monitor viejo, imagen dañada.", tag: "VIDEO" },
  { id: "vigil", name: "Turno de cierre", description: "Recibos, fluorescentes y pasillos vacíos.", tag: "RECIBO" },
];

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}


export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>("oxide");
  const themeMenuRef = useRef<HTMLDetailsElement | null>(null);
  const activeTheme = THEMES.find((option) => option.id === theme)!;

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeId(storedTheme)) setTheme(storedTheme);
    } catch {
      // Private browsing can disable local storage; theme selection still works.
    }
  }, []);

  function selectTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    if (themeMenuRef.current) themeMenuRef.current.open = false;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The chosen theme remains active for the current page.
    }
  }
  return { theme, activeTheme, themeMenuRef, selectTheme };
}
