"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/chat-client";
import type { MensagemDTO } from "@/modules/portal/mensagens/queries";
import { novasDoOutroLado } from "@/modules/portal/mensagens/mesclar";
import { EVENTO_CONVERSA } from "@/modules/portal/mensagens/regras";

/** Sem Socket.io no ar (`npm run dev`, queda), a conversa aberta confere sozinha neste intervalo. */
const INTERVALO_SEM_SOCKET_MS = 20_000;
/** Por quanto tempo o anúncio de mensagem nova fica na região viva (depois ela se esvazia para o próximo). */
const DURACAO_ANUNCIO_MS = 5_000;

/**
 * Mantém a conversa aberta em dia: o servidor avisa `portal-conversa` (só o id do projeto, nunca o texto) e a tela
 * rebusca. A CADA conexão do socket — a primeira inclusive — rebusca também: o socket.io não reenvia o que se perdeu,
 * e uma mensagem emitida entre o render do servidor e a primeira conexão só chegaria na próxima (mesma regra do
 * `AvisoProvider`). Sem socket conectado, confere a cada 20 s, e só com a aba visível.
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
    const aoConectar = () => void carregar.current();
    s.on(EVENTO_CONVERSA, aoEvento);
    s.on("connect", aoConectar);
    // Já conectado ao montar: o "connect" não vem de novo, e o que foi emitido antes deste ouvinte se perdeu.
    if (s.connected) void carregar.current();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !s.connected) void carregar.current();
    }, INTERVALO_SEM_SOCKET_MS);
    return () => {
      s.off(EVENTO_CONVERSA, aoEvento);
      s.off("connect", aoConectar);
      clearInterval(timer);
    };
  }, [projetoId]);
}

/**
 * Texto para a região viva (`role="status"`) quando chegam mensagens do outro lado por recarga — o leitor de tela não
 * vê a lista mudar. Vazio no resto do tempo. A primeira carga não é anunciada; "Ver anteriores" também não.
 */
export function useAnuncioDeNovas(
  mensagens: readonly MensagemDTO[],
  meuLado: MensagemDTO["lado"],
  doOutroLado: string,
): string {
  const ultima = mensagens.at(-1)?.criadaEm ?? null;
  // "" = conversa vazia ao abrir: a primeira mensagem do outro lado já é novidade.
  const conhecidaAte = useRef<string>(ultima ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anuncio, setAnuncio] = useState("");

  useEffect(() => {
    if (ultima === null || ultima <= conhecidaAte.current) return;
    const n = novasDoOutroLado(mensagens, meuLado, conhecidaAte.current);
    conhecidaAte.current = ultima;
    if (n === 0) return;
    setAnuncio(n === 1 ? `Nova mensagem ${doOutroLado}.` : `${n} novas mensagens ${doOutroLado}.`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnuncio(""), DURACAO_ANUNCIO_MS);
  }, [ultima, mensagens, meuLado, doOutroLado]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return anuncio;
}
