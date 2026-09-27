"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import type { CanalListItem } from "@/modules/chat/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Bootstrap = {
  canais: CanalListItem[];
  usuarios: { id: string; name: string; role: string; chatStatus: string }[];
  meId: string;
  status: string;
  somChat: boolean;
  mostrarRecibos: boolean;
};

/** Evento que o ícone de chat da barra do topo dispara para abrir a janelinha de conversa. */
export const ABRIR_CHAT = "senahub:abrir-chat";

/**
 * Janelinha de conversa aberta pelo ícone de chat da barra do topo (sem botão flutuante: ele cobria
 * a última coluna das tabelas). Dados carregados sob demanda (não pesam a navegação).
 */
export function FloatingChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const aoPedir = () => void abrir();
    window.addEventListener(ABRIR_CHAT, aoPedir);
    return () => window.removeEventListener(ABRIR_CHAT, aoPedir);
  });

  // Na própria tela de chat o widget é redundante (e evita 2 instâncias no socket).
  if (pathname?.startsWith("/chat")) return null;

  async function abrir() {
    setOpen(true);
    if (!data && !carregando) {
      setCarregando(true);
      try {
        const res = await fetch("/api/chat/bootstrap");
        if (res.ok) setData(await res.json());
      } finally {
        setCarregando(false);
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[85vh] w-[min(1000px,96vw)] max-w-none overflow-hidden p-3 sm:max-w-[min(1000px,96vw)]">
          <DialogHeader className="sr-only">
            <DialogTitle>Chat</DialogTitle>
          </DialogHeader>
          {data ? (
            <ChatView
              canais={data.canais}
              usuarios={data.usuarios}
              meId={data.meId}
              status={data.status}
              somChat={data.somChat}
              mostrarRecibos={data.mostrarRecibos}
              alturaClasse="h-[calc(85vh-2rem)]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {carregando ? "Carregando chat…" : "—"}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
