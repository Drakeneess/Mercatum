"use client";

import type { RefObject } from "react";
import type { Connection } from "../hooks/useMercatumRoom";
import { THEMES, type ThemeId } from "../hooks/useTheme";

type ThemeOption = (typeof THEMES)[number];
interface MarketHeaderProps {
  activeTheme: ThemeOption;
  theme: ThemeId;
  menuRef: RefObject<HTMLDetailsElement | null>;
  onThemeChange: (theme: ThemeId) => void;
  connection: Connection;
  hasBuild: boolean;
}

export function MarketHeader({ activeTheme, theme, menuRef, onThemeChange, connection, hasBuild }: MarketHeaderProps) {
  return (
    <>
      <header className="masthead">
        <div className="masthead-serial">
          <span>AVISO Nº 001 / DOCUMENTO EN MAL ESTADO</span>
          <span>SE DESCONOCE EL ORIGEN DEL EDIFICIO</span>
        </div>
        <div className="masthead-main">
          <div className="title-block">
            <span className="title-overline">ESTO NO ES UN DESTINO TURÍSTICO.</span>
            <div className="brand-name" aria-label="Mercatum">MERCATUM<span className="brand-slash" aria-hidden="true">/</span></div>
            <span className="title-under">EL MERCADO ESTÁ ABIERTO. <b>NO SABEMOS POR QUÉ.</b></span>
          </div>
          <div className="masthead-controls">
            <details className="theme-picker" ref={menuRef}>
              <summary className="theme-trigger" aria-label={"Elegir tema visual, actual: " + activeTheme.name}>
                <span className="theme-trigger-number">[ 03 ]</span>
                <span className="theme-trigger-label">CAMBIAR SOPORTE</span>
                <strong>{activeTheme.name}</strong>
                <span className="theme-trigger-arrow" aria-hidden="true">▼</span>
              </summary>
              <div className="theme-dropdown">
                <div className="theme-dropdown-heading">TRES VERSIONES DEL MISMO EXPEDIENTE</div>
                <div className="theme-options" role="group" aria-label="Temas visuales">
                  {THEMES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onThemeChange(option.id)}
                      aria-pressed={theme === option.id}
                      className={"theme-option" + (theme === option.id ? " theme-option--active" : "")}
                    >
                      <span className={"theme-swatch theme-swatch--" + option.id} aria-hidden="true">{option.tag}</span>
                      <span className="theme-option-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
                      <span className="theme-option-mark" aria-hidden="true">{theme === option.id ? "✕" : "—"}</span>
                    </button>
                  ))}
                </div>
                <div className="theme-dropdown-foot">LA ELECCIÓN SE CONSERVA EN ESTE NAVEGADOR.</div>
              </div>
            </details>
            <div className={"connection-chip connection-chip--" + connection} aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              <span>{!hasBuild ? "SIN REGISTRO DE ENTRADA" : connection === "online" ? "CONEXIÓN ESTABLECIDA" : connection === "connecting" ? "INTENTANDO CONTACTO" : "SEÑAL PERDIDA"}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="warning-banner" aria-label="Advertencia">
        <span className="warning-cross" aria-hidden="true">✕</span>
        <strong>NO ENTRE SIN TENER UNA RAZÓN.</strong>
        <span>LAS OFERTAS NO COMPENSAN TODAS LAS PÉRDIDAS.</span>
        <span className="warning-count">01 // 01</span>
      </div>


    </>
  );
}
