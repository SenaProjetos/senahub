"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Registra um page-view por mudança de rota (análise de uso, admin). Dado
 * interno de colaboradores; o servidor ignora clientes. Best-effort via
 * navigator.sendBeacon — não bloqueia nem atrasa a navegação.
 */
export function AcessoTracker() {
  const pathname = usePathname();
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === ultimo.current) return;
    ultimo.current = pathname;
    try {
      const blob = new Blob([JSON.stringify({ path: pathname })], { type: "application/json" });
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/uso/acesso", blob);
      } else {
        void fetch("/api/uso/acesso", { method: "POST", body: blob, keepalive: true });
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
