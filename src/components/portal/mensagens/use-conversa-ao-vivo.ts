"use client";

import { useEffect, useRef } from "react";
import { aoReconectar, getSocket } from "@/lib/chat-client";

/** Mesmo nome de `EVENTO_CONVERSA` (`modules/portal/mensagens/avisos.ts`, server-only): payload `{ projetoId }`. */
const EVENTO_CONVERSA = "portal-conversa";
/** Sem Socket.io no ar (`npm run dev`, queda), a conversa aberta confere sozinha neste intervalo. */
const INTERVALO_SEM_SOCKET_MS = 20_000;

/**
 * Mantém a conversa aberta em dia: o servidor avisa `portal-conversa` (só o id do projeto, nunca o texto) e a tela
 * rebusca. Na reconexão rebusca também (o socket.io não reenvia o que se perdeu). Sem socket conectado, confere a cada
 * 20 s, e só com a aba visível.
 */
export function useConversaAoVivo(p: { projetoId: string; carregar: () => Promise<void> }): void {
  const carregar = useRef(p.carregar);
  useEffect(() => {
    carregar.current = p.carregar;
  });

  const { projetoId } = p;
  useEffect(() => {
    const s = getSocket();
    const aoEvento = (payload: { projetoId?: string } | undefined) => {
      if (payload?.projetoId === projetoId) void carregar.current();
    };
    s.on(EVENTO_CONVERSA, aoEvento);
    const pararReconexao = aoReconectar(() => void carregar.current());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !s.connected) void carregar.current();
    }, INTERVALO_SEM_SOCKET_MS);
    return () => {
      s.off(EVENTO_CONVERSA, aoEvento);
      pararReconexao();
      clearInterval(timer);
    };
  }, [projetoId]);
}
