"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { getSocket } from "@/lib/chat-client";
import {
  buscarAvisosPendentes,
  confirmarLeituraAviso,
} from "@/modules/notificacoes/avisos/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Pendente = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  exigeConfirmacao: boolean;
  criadoEm: string | Date;
};

const POLL_MS = 30_000;

/**
 * Fila de avisos gerais que aparecem como modal bloqueante. Montado no layout
 * para todos os perfis. Busca pendentes no mount (cobre quem estava offline),
 * escuta o socket `aviso-novo` (ao vivo) e faz poll de segurança.
 */
export function AvisoProvider() {
  const [fila, setFila] = useState<Pendente[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const carregando = useRef(false);

  const carregar = useCallback(async () => {
    if (carregando.current) return;
    carregando.current = true;
    try {
      const pend = (await buscarAvisosPendentes()) as Pendente[];
      setFila((atual) => {
        const ids = new Set(atual.map((a) => a.avisoId));
        const novos = pend.filter((p) => !ids.has(p.avisoId));
        return novos.length ? [...atual, ...novos] : atual;
      });
    } finally {
      carregando.current = false;
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = setInterval(() => void carregar(), POLL_MS);
    const s = getSocket();
    const onNovo = () => void carregar();
    // Re-busca ao (re)conectar: cobre avisos emitidos enquanto o socket estava
    // caído ou ainda não conectado (o evento `aviso-novo` não é replayado).
    s.on("aviso-novo", onNovo);
    s.on("connect", onNovo);
    if (s.connected) void carregar();
    return () => {
      clearInterval(id);
      s.off("aviso-novo", onNovo);
      s.off("connect", onNovo);
    };
  }, [carregar]);

  const atual = fila[0];

  const confirmar = useCallback(async () => {
    if (!atual) return;
    setConfirmando(true);
    try {
      await confirmarLeituraAviso(atual.avisoId);
      setFila((f) => f.slice(1));
    } finally {
      setConfirmando(false);
    }
  }, [atual]);

  if (!atual) return null;

  return (
    <Dialog
      open
      onOpenChange={(aberto: boolean) => {
        // Bloqueante quando exige confirmação: ignora ESC/clique fora.
        if (!aberto && !atual.exigeConfirmacao) setFila((f) => f.slice(1));
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" /> {atual.titulo}
          </DialogTitle>
          {atual.corpo ? (
            <DialogDescription className="whitespace-pre-wrap">{atual.corpo}</DialogDescription>
          ) : null}
        </DialogHeader>
        {fila.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            +{fila.length - 1} outro(s) aviso(s) aguardando.
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={confirmar} disabled={confirmando}>
            {confirmando ? "Confirmando…" : "Li e entendi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
