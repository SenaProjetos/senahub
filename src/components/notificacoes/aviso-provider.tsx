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
import { CorpoAviso } from "@/components/notificacoes/corpo-aviso";
import { cn } from "@/lib/utils";

type Pendente = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  temImagem: boolean;
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
      {/* flex + max-h: corpo/imagem rolam e o rodapé (confirmação) fica sempre visível.
          Com imagem o modal abre largo: comunicado ilustrado costuma ser infográfico com
          texto miúdo, que a 448px (`sm:max-w-md`) fica ilegível. */}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[85dvh] flex-col",
          atual.temImagem ? "sm:max-w-3xl" : "sm:max-w-md",
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" /> {atual.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {atual.corpo ? (
            /* `render={<div />}`: o corpo formatado tem <p>/<ul> dentro, e o <p> padrão da
               Description não pode aninhar bloco. Mantém o aria-describedby do diálogo. */
            <DialogDescription render={<div />}>
              <CorpoAviso corpo={atual.corpo} />
            </DialogDescription>
          ) : null}
          {atual.temImagem ? (
            /* Abre em aba nova no tamanho cheio — infográfico raramente cabe legível no modal. */
            <a
              href={`/api/avisos/${atual.avisoId}/imagem`}
              target="_blank"
              rel="noreferrer"
              title="Abrir a imagem em tamanho original"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/avisos/${atual.avisoId}/imagem`}
                alt="Imagem do aviso"
                className="w-full rounded-md object-contain"
              />
            </a>
          ) : null}
          {fila.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              +{fila.length - 1} outro(s) aviso(s) aguardando.
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button onClick={confirmar} disabled={confirmando}>
            {confirmando ? "Confirmando…" : "Li e entendi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
