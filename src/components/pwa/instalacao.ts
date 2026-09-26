"use client";

/** O evento `beforeinstallprompt` do Chromium (fora do lib.dom do TypeScript). */
export type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let adiado: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();

/**
 * Guarda o evento assim que o navegador o dispara. Ele sai uma vez por carga de página, possivelmente
 * antes de a tela que mostra o convite montar — por isso a captura fica no layout, e não no convite.
 */
export function capturarInstalacao(): () => void {
  const aoOferecer = (e: Event) => {
    e.preventDefault();
    adiado = e as EventoInstalacao;
    ouvintes.forEach((f) => f());
  };
  const aoInstalar = () => {
    adiado = null;
    ouvintes.forEach((f) => f());
  };
  window.addEventListener("beforeinstallprompt", aoOferecer);
  window.addEventListener("appinstalled", aoInstalar);
  return () => {
    window.removeEventListener("beforeinstallprompt", aoOferecer);
    window.removeEventListener("appinstalled", aoInstalar);
  };
}

export function instalacaoDisponivel(): EventoInstalacao | null {
  return adiado;
}

export function aoMudarInstalacao(f: () => void): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

export function esperarInstalacao(): void {
  adiado = null;
  ouvintes.forEach((f) => f());
}

export function rodandoInstalado(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function ehIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
