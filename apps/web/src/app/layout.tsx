import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./styles/masthead.css";
import "./styles/paper.css";
import "./styles/map.css";
import "./styles/evidence.css";
import "./styles/variants.css";
import "./styles/responsive.css";
import "./styles/character.css";
import "./styles/expedition.css";
import "./styles/threat.css";
import "./styles/commerce.css";

export const metadata: Metadata = {
  title: "Mercatum | Registro de incursiones",
  description: "Prototipo de exploración hexagonal multijugador de Mercatum.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
