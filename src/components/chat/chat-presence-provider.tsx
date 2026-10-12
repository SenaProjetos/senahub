"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aoPushSemSocket, aoReconectar, getSocket, tocarSom } from "@/lib/chat-client";
import { decidirAlerta } from "@/lib/chat-badge-store";
import { ChatBadgeContext } from "@/components/chat/chat-badge-context";
import { origemMensagem } from "@/modules/chat/nome-canal";
import { textoParaPreview } from "@/modules/chat/formatacao";

type MensagemEvento = {
  canalId: string;
  conteudo: string;
  autor: { id: string; name: string };
  /** Tipo + nome exibido do canal (`origemDoCanal`); ausente só se o canal sumiu. */
  origem?: { tipo: string; nome: string } | null;
};

/**
 * Mantém um único socket vivo em todas as telas do dashboard, ouve mensagens
 * novas (som/toast/badge) mesmo fora da tela de chat, e expõe o total de não
 * lidas para a navegação. Montado no layout apenas para perfis de chat.
 */
export function ChatPresenceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [total, setTotal] = useState(0);

  const meIdRef = useRef<string | null>(null);
  const somChatRef = useRef(true);
  const statusRef = useRef<string>("disponivel");
  const chatAtivoRef = useRef(false);
  const silenciadosRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarTotal = useCallback(() => {
    fetch("/api/chat/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        meIdRef.current = d.meId;
        somChatRef.current = d.somChat !== false;
        statusRef.current = d.chatStatus ?? "disponivel";
        silenciadosRef.current = new Set<string>(d.silenciados ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {});
  }, []);

  /** Re-busca com debounce para absorver rajadas de mensagens. */
  const refetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(buscarTotal, 400);
  }, [buscarTotal]);

  const setChatAtivo = useCallback((ativo: boolean) => {
    chatAtivoRef.current = ativo;
  }, []);

  useEffect(() => {
    buscarTotal();
    const s = getSocket();

    function onMensagem(p: MensagemEvento) {
      const { tocarSom: som, mostrarToast } = decidirAlerta({
        ehMinha: meIdRef.current !== null && p.autor.id === meIdRef.current,
        chatAtivo: chatAtivoRef.current,
        somHabilitado: somChatRef.current,
        emReuniao: statusRef.current === "reuniao",
        canalSilenciado: silenciadosRef.current.has(p.canalId),
      });
      if (som) tocarSom();
      if (mostrarToast) {
        const previa = p.conteudo ? textoParaPreview(p.conteudo).slice(0, 120) : "📎 Anexo";
        toast(p.autor.name, {
          // Diz de onde veio (privado × grupo/canal) antes do texto.
          description: p.origem ? (
            <>
              <span className="block text-xs font-medium text-muted-foreground">
                {origemMensagem(p.origem.tipo, p.origem.nome)}
              </span>
              <span className="block">{previa}</span>
            </>
          ) : (
            previa
          ),
          action: {
            label: "Abrir",
            onClick: () => router.push(`/chat?c=${p.canalId}`),
          },
        });
      }
      refetch();
    }
    function onLidoProprio() {
      refetch();
    }
    function onStatusProprio(p: { status: string }) {
      statusRef.current = p.status;
    }
    // C3-2: fui adicionado a um canal novo (ex.: entrei numa equipe de projeto).
    // Entra no room ao vivo mesmo estando fora da tela de chat e atualiza o badge.
    function onNovoCanal(p: { canalId: string }) {
      s.emit("entrar-canal", p.canalId);
      refetch();
    }

    s.on("mensagem", onMensagem);
    s.on("chat-lido-proprio", onLidoProprio);
    s.on("status-proprio", onStatusProprio);
    s.on("entrar-canal-novo", onNovoCanal);
    // O que chegou com o socket fora do ar não é reenviado: o badge rebusca ao reconectar
    // e quando um push de mensagem chega sem o socket ter entregado a mensagem.
    const pararReconexao = aoReconectar(refetch);
    const pararPush = aoPushSemSocket(refetch);
    return () => {
      s.off("mensagem", onMensagem);
      s.off("chat-lido-proprio", onLidoProprio);
      s.off("status-proprio", onStatusProprio);
      s.off("entrar-canal-novo", onNovoCanal);
      pararReconexao();
      pararPush();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buscarTotal, refetch, router]);

  return (
    <ChatBadgeContext.Provider value={{ total, refetch, setChatAtivo }}>
      {children}
    </ChatBadgeContext.Provider>
  );
}
