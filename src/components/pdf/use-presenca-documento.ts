"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/chat-client";

export type UsuarioPresente = { userId: string; nome: string };

/**
 * Quem mais está olhando o MESMO documento agora (item 32) — só funciona sob `dev:server`/
 * prod (Socket.io não roda em `npm run dev` puro). Reusa o singleton do socket já usado pelo
 * chat (`getSocket`), room por `documentoId` (não `uploadId` — ver `lib/socket.ts`).
 * Transiente: entra ao montar, sai ao desmontar ou trocar de documento.
 */
export function usePresencaDocumento(documentoId: string | null): UsuarioPresente[] {
  const [outros, setOutros] = useState<UsuarioPresente[]>([]);

  useEffect(() => {
    setOutros([]);
    if (!documentoId) return;
    const socket = getSocket();
    socket.emit("entrar-documento", documentoId);

    function onInicial(p: { documentoId: string; usuarios: UsuarioPresente[] }) {
      if (p.documentoId === documentoId) setOutros(p.usuarios);
    }
    function onPresenca(p: { documentoId: string; userId: string; nome?: string; entrou: boolean }) {
      if (p.documentoId !== documentoId) return;
      setOutros((prev) => {
        if (p.entrou) {
          if (prev.some((u) => u.userId === p.userId)) return prev;
          return [...prev, { userId: p.userId, nome: p.nome ?? "—" }];
        }
        return prev.filter((u) => u.userId !== p.userId);
      });
    }

    socket.on("presenca-documento-inicial", onInicial);
    socket.on("presenca-documento", onPresenca);
    return () => {
      socket.emit("sair-documento", documentoId);
      socket.off("presenca-documento-inicial", onInicial);
      socket.off("presenca-documento", onPresenca);
    };
  }, [documentoId]);

  return outros;
}
