"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Repeat } from "lucide-react";
import {
  abrirApontamentoAction,
  trocarApontamentoAction,
  fecharApontamentoAction,
} from "@/modules/ponto/apontamento-actions";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none";

type Projeto = { id: string; codigo: string; nome: string };
type ApontamentoAberto = { id: string; projetoId: string | null; inicio: string | Date; projeto: { codigo: string; nome: string } | null };

/** Cronômetro ao vivo do apontamento aberto. */
function useDecorrido(inicio: string | Date | null): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!inicio) {
      setMs(0);
      return;
    }
    const ancora = new Date(inicio).getTime();
    const tick = () => setMs(Date.now() - ancora);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inicio]);
  return ms;
}

function Relogio({ ms }: { ms: number }) {
  const tot = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  return (
    <span className="font-mono text-4xl font-bold tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

/**
 * Apontamento de horas — para quem NÃO controla jornada (PJ/freelancer). Sem cronômetro de
 * jornada, sem geolocalização, sem vocabulário de ponto: só "estou trabalhando em X" /
 * "parei". Alimenta o mesmo rateio de sempre (ver modules/ponto/apontamento.ts).
 */
export function ApontamentoHoras({
  aberto,
  hojeMin,
  projetos,
}: {
  aberto: ApontamentoAberto | null;
  hojeMin: number;
  projetos: Projeto[];
}) {
  const router = useRouter();
  const [projetoId, setProjetoId] = useState(aberto?.projetoId ?? NONE);
  const [pending, start] = useTransition();
  const decorrido = useDecorrido(aberto?.inicio ?? null);

  const proj = (id: string) => (id === NONE ? undefined : id);

  function iniciar() {
    start(async () => {
      const r = await abrirApontamentoAction({ projetoId: proj(projetoId) });
      if (r.ok) {
        toast.success("Apontamento iniciado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function trocar() {
    start(async () => {
      const r = await trocarApontamentoAction({ projetoId: proj(projetoId) });
      if (r.ok) {
        toast.success("Projeto trocado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function encerrar() {
    start(async () => {
      const r = await fecharApontamentoAction({});
      if (r.ok) {
        toast.success("Apontamento encerrado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-6">
        <p className="text-center text-xs text-muted-foreground">
          Registro de horas por projeto — alimenta o rateio. Não é controle de jornada.
        </p>

        <div className="flex flex-col items-center gap-2">
          <Relogio ms={decorrido} />
          <p className="text-xs text-muted-foreground">
            {aberto
              ? `Em andamento${aberto.projeto ? ` · ${formatarCodigo(aberto.projeto.codigo)} ${aberto.projeto.nome}` : ""}`
              : "Parado"}
            {" · "}Hoje: {fmtHoras(hojeMin)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Projeto (opcional)…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem projeto</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatarCodigo(p.codigo)} · {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {aberto && (
            <Button variant="outline" disabled={pending} onClick={trocar}>
              <Repeat className="size-4" /> Trocar projeto
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          {aberto ? (
            <Button variant="destructive" disabled={pending} onClick={encerrar}>
              <Square className="size-4" /> Encerrar apontamento
            </Button>
          ) : (
            <Button disabled={pending} onClick={iniciar}>
              <Play className="size-4" /> Iniciar apontamento
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
