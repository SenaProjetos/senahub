"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { baterPonto, trocarProjeto, encerrarJornada } from "@/modules/ponto/actions";
import { Button } from "@/components/ui/button";

function formatarTempo(ms: number): string {
  const tot = Math.floor(ms / 1000);
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

interface Props {
  projetoId: string;
  /** Sessão aberta no momento do SSR. */
  sessaoAtiva: { id: string; projetoId: string | null; inicio: Date } | null;
}

export function CronometroProjeto({ projetoId, sessaoAtiva }: Props) {
  const router = useRouter();
  const [sessao, setSessao] = useState(sessaoAtiva);
  const [agora, setAgora] = useState(Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!sessao || sessao.projetoId !== projetoId) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessao, projetoId]);

  const nesteProj = sessao?.projetoId === projetoId;
  const emOutro = sessao && !nesteProj;

  function iniciar() {
    const agora = new Date();
    start(async () => {
      if (emOutro) {
        const r = await trocarProjeto({ projetoId });
        if (r.ok) {
          setSessao({ id: "local", projetoId, inicio: agora });
          setAgora(Date.now());
          toast.success("Projeto alterado.");
          router.refresh();
        } else toast.error(r.error);
      } else {
        const r = await baterPonto({ projetoId });
        if (r.ok) {
          setSessao({ id: r.data.id, projetoId, inicio: agora });
          setAgora(Date.now());
          toast.success("Cronômetro iniciado.");
        } else toast.error(r.error);
      }
    });
  }

  function parar() {
    start(async () => {
      const r = await encerrarJornada({});
      if (r.ok) {
        setSessao(null);
        toast.success("Jornada encerrada.");
      } else toast.error(r.error);
    });
  }

  const elapsed = sessao ? agora - new Date(sessao.inicio).getTime() : 0;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
      {nesteProj ? (
        <>
          <span className="animate-pulse size-2 rounded-full bg-success" aria-hidden />
          <span className="font-mono tabular-nums text-success">{formatarTempo(elapsed)}</span>
          <span className="text-muted-foreground">em andamento</span>
          <Button size="sm" variant="ghost" onClick={parar} disabled={pending} className="ml-1 h-6 px-2 text-xs">
            <Square className="size-3" /> Parar
          </Button>
        </>
      ) : emOutro ? (
        <>
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          <span className="text-muted-foreground text-xs">Em outro projeto</span>
          <Button size="sm" variant="ghost" onClick={iniciar} disabled={pending} className="ml-1 h-6 px-2 text-xs">
            <Play className="size-3" /> Mudar para cá
          </Button>
        </>
      ) : (
        <>
          <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden />
          <span className="text-muted-foreground text-xs">Cronômetro parado</span>
          <Button size="sm" variant="ghost" onClick={iniciar} disabled={pending} className="ml-1 h-6 px-2 text-xs">
            <Play className="size-3" /> Iniciar
          </Button>
        </>
      )}
    </div>
  );
}
