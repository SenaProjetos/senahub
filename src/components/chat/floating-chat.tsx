"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { ChatView } from "@/components/chat/chat-view";
import type { CanalListItem } from "@/modules/chat/queries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Usuario = { id: string; name: string; role: string; chatStatus: string };

export function FloatingChat({
  canais,
  usuarios,
  meId,
  status,
  somChat,
  mostrarRecibos,
}: {
  canais: CanalListItem[];
  usuarios: Usuario[];
  meId: string;
  status: string;
  somChat: boolean;
  mostrarRecibos: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Na própria tela de chat o widget é redundante (e evita 2 instâncias no socket).
  if (pathname?.startsWith("/chat")) return null;

  const naoLidas = canais.reduce((s, c) => s + (c.naoLidas ?? 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir chat"
        className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 lg:bottom-6"
      >
        <MessageSquare className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[88vh] w-[min(1000px,96vw)] max-w-none overflow-hidden p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Chat</DialogTitle>
          </DialogHeader>
          {open && (
            <ChatView
              canais={canais}
              usuarios={usuarios}
              meId={meId}
              status={status}
              somChat={somChat}
              mostrarRecibos={mostrarRecibos}
              alturaClasse="h-full"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
