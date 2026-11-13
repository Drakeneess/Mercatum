"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface WorkspaceModalProps {
  title: string;
  subtitle: string;
  health: number | null;
  inside: boolean;
  sightings: number;
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * A native modal dialog manages focus trapping and Escape semantics.
 * It is a view of the live world, not a pause menu or a new game session.
 */
export function WorkspaceModal({
  title, subtitle, health, inside, sightings, onRequestClose, children,
}: WorkspaceModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();

    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="workspace-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onRequestClose();
      }}
    >
      <div className="workspace-modal__surface">
        <header className="workspace-modal__header">
          <div className="workspace-modal__title">
            <span>{subtitle}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className={"workspace-modal__live" + (inside && sightings > 0 ? " workspace-modal__live--danger" : "")}
            role="status" aria-live="polite">
            <strong>{health === null ? "SIN DATOS" : "SALUD " + health + " / 100"}</strong>
            <span>{inside && sightings > 0
              ? sightings + " FIGURA(S) A LA VISTA — EL MUNDO SIGUE ACTIVO"
              : inside ? "DENTRO / EL MERCADO NO SE DETIENE" : "FUERA DEL PERÍMETRO"}</span>
          </div>
          <button ref={closeRef} type="button"
            className="workspace-modal__close"
            onClick={onRequestClose}
            aria-label={"Cerrar " + title}>
            <span aria-hidden="true">×</span> CERRAR
          </button>
        </header>
        <div className="workspace-modal__content">
          {children}
        </div>
        <div className="workspace-modal__footer">
          <span>DOCUMENTO CONSULTADO / SIN GARANTÍAS</span>
          <button type="button" onClick={onRequestClose}>VOLVER AL PLANO</button>
        </div>
      </div>
    </dialog>
  );
}
