"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
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

/** Chat flutuante em todas as telas. Dados carregados sob demanda (não pesam a navegação). */
export function FloatingChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [carregando, setCarregando] = useState(false);

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
      <button
        type="button"
        onClick={abrir}
        aria-label="Abrir chat"
        className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 lg:bottom-6"
      >
        <MessageSquare className="size-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[88vh] w-[min(1000px,96vw)] max-w-none overflow-hidden p-3">
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
              alturaClasse="h-full"
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
