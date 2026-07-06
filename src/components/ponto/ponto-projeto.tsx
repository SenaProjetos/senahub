"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Repeat, LogOut, Clock } from "lucide-react";
import { trocarProjeto } from "@/modules/ponto/actions";
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
  /** Sessão de trabalho aberta no momento do SSR (existe só quando o usuário está trabalhando). */
  sessaoAtiva: { id: string; projetoId: string | null; inicio: Date } | null;
}

/**
 * Widget de ponto por projeto (ficha do projeto). Diferente da v1: NÃO inicia
 * nem encerra a jornada — a jornada (entrada/saída) é registrada só em /ponto.
 * Aqui o usuário apenas direciona a jornada aberta para este projeto ("Trabalhar
 * aqui") ou sai dele ("Sair do projeto" → jornada segue sem projeto). Só a fatia
 * de rateio muda; o total do dia não é afetado.
 */
export function PontoProjeto({ projetoId, sessaoAtiva }: Props) {
  const router = useRouter();
  const [sessao, setSessao] = useState(sessaoAtiva);
  const [agora, setAgora] = useState(Date.now());
  const [pending, start] = useTransition();

  const nesteProj = sessao?.projetoId === projetoId;

  useEffect(() => {
    if (!sessao || !nesteProj) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessao, nesteProj]);

  function trabalharAqui() {
    const inicio = new Date();
    start(async () => {
      const r = await trocarProjeto({ projetoId });
      if (r.ok) {
        setSessao({ id: "local", projetoId, inicio });
        setAgora(Date.now());
        toast.success("Trabalhando neste projeto.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function sairDoProjeto() {
    start(async () => {
      const r = await trocarProjeto({ projetoId: "" });
      if (r.ok) {
        setSessao((s) => (s ? { ...s, projetoId: null } : s));
        toast.success("Você saiu do projeto (jornada segue aberta).");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const elapsed = sessao && nesteProj ? agora - new Date(sessao.inicio).getTime() : 0;

  // Sem sessão aberta = sem jornada de trabalho ativa. O widget só direciona a
  // jornada; iniciar/encerrar é no /ponto.
  if (!sessao) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
        <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden />
        <span className="text-xs text-muted-foreground">Sem jornada aberta</span>
        <Button
          size="sm"
          variant="ghost"
          render={<Link href="/ponto" />}
          className="ml-1 h-6 px-2 text-xs"
        >
          <Clock className="size-3" /> Bater ponto
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        nesteProj ? "border-success/40 bg-success/5" : "bg-card"
      }`}
    >
      {nesteProj ? (
        <>
          <span className="animate-pulse size-2.5 rounded-full bg-success" aria-hidden />
          <span className="font-mono text-base font-semibold tabular-nums text-success">
            {formatarTempo(elapsed)}
          </span>
          <span className="text-muted-foreground">neste projeto</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={sairDoProjeto}
            disabled={pending}
            className="ml-1 h-6 px-2 text-xs"
          >
            <LogOut className="size-3" /> Sair do projeto
          </Button>
        </>
      ) : (
        <>
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          <span className="text-xs text-muted-foreground">Trabalhando em outro projeto</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={trabalharAqui}
            disabled={pending}
            className="ml-1 h-6 px-2 text-xs"
          >
            <Repeat className="size-3" /> Trabalhar aqui
          </Button>
        </>
      )}
    </div>
  );
}
