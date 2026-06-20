"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Repeat } from "lucide-react";
import { baterPonto, trocarProjeto, encerrarJornada } from "@/modules/ponto/actions";
import { fecharRateioMes } from "@/modules/rh/rateio/actions";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none";
type Projeto = { id: string; codigo: string; nome: string };
type Espelho = {
  dias: { dia: string; minutos: number; sessoes: { inicio: string | Date; fim: string | Date | null; minutos: number; projeto: string | null }[] }[];
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
};

function Cronometro({ inicio }: { inicio: string | Date }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const base = new Date(inicio).getTime();
    const tick = () => setSeg(Math.floor((Date.now() - base) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [inicio]);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return (
    <span className="font-mono text-4xl font-bold tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

type Rateio = {
  porProjeto: { projeto: string; minutos: number; custo: number }[];
  semProjeto: number;
  custoTotal: number;
  fechado: boolean;
  fechadoEm: string | Date | null;
};

export function PontoView({
  aberta,
  projetos,
  espelho,
  rateio,
  ano,
  mes,
}: {
  aberta: { inicio: string | Date; projeto: { id: string; codigo: string; nome: string } | null } | null;
  projetos: Projeto[];
  espelho: Espelho;
  rateio: Rateio | null;
  ano: number;
  mes: number;
}) {
  const router = useRouter();
  const [projetoId, setProjetoId] = useState(aberta?.projeto?.id ?? NONE);
  const [busy, setBusy] = useState(false);

  async function acao(fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; data: unknown }>, msg: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        router.refresh();
      } else toast.error((r as { error: string }).error);
    } finally {
      setBusy(false);
    }
  }

  const proj = (id: string) => (id === NONE ? "" : id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Ponto</h2>
        <p className="text-sm text-muted-foreground">Registre sua jornada e troque de projeto sem perder tempo.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {aberta ? (
            <>
              <Cronometro inicio={aberta.inicio} />
              <p className="text-sm text-muted-foreground">
                {aberta.projeto ? `Trabalhando em ${aberta.projeto.codigo} · ${aberta.projeto.nome}` : "Sem projeto"}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Trocar para projeto…" />
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
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => acao(() => trocarProjeto({ projetoId: proj(projetoId) }), "Projeto trocado.")}
                >
                  <Repeat className="size-4" /> Trocar projeto
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => acao(() => encerrarJornada({}), "Jornada encerrada.")}
                >
                  <Square className="size-4" /> Encerrar
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="font-mono text-4xl font-bold text-muted-foreground">00:00:00</span>
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
                <Button
                  disabled={busy}
                  onClick={() => acao(() => baterPonto({ projetoId: proj(projetoId) }), "Jornada iniciada.")}
                >
                  <Play className="size-4" /> Iniciar jornada
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Trabalhado (mês)</CardDescription>
            <CardTitle className="text-2xl">{fmtHoras(espelho.totalMinutos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Esperado</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">{fmtHoras(espelho.esperadoMinutos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Saldo (banco)</CardDescription>
            <CardTitle className={`text-2xl ${espelho.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
              {fmtHoras(espelho.saldoMinutos)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Espelho do mês</CardTitle>
        </CardHeader>
        <CardContent>
          {espelho.dias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros este mês.</p>
          ) : (
            <ul className="divide-y text-sm">
              {espelho.dias.map((d) => (
                <li key={d.dia} className="flex items-center justify-between py-2">
                  <span>{new Date(d.dia).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                  <span className="font-mono">{fmtHoras(d.minutos)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {rateio && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Rateio de horas por projeto (equipe)</CardTitle>
                <CardDescription>
                  Mês atual · custo total {brl(rateio.custoTotal)}
                  {rateio.fechado && rateio.fechadoEm
                    ? ` · fechado em ${formatarData(rateio.fechadoEm)}`
                    : ""}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant={rateio.fechado ? "outline" : "default"}
                disabled={busy || rateio.porProjeto.length === 0}
                onClick={() =>
                  acao(
                    () => fecharRateioMes({ ano, mes }),
                    rateio.fechado ? "Rateio refechado." : "Rateio do mês fechado.",
                  )
                }
              >
                {rateio.fechado ? "Refechar mês" : "Fechar mês"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rateio.porProjeto.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem horas rateadas.</p>
            ) : (
              <ul className="divide-y text-sm">
                {rateio.porProjeto.map((r) => (
                  <li key={r.projeto} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{r.projeto}</span>
                    <span className="font-mono text-muted-foreground">{fmtHoras(r.minutos)}</span>
                    <span className="w-28 text-right font-mono">{brl(r.custo)}</span>
                  </li>
                ))}
                {rateio.semProjeto > 0 && (
                  <li className="flex items-center justify-between gap-3 py-2 text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">Sem projeto</span>
                    <span className="font-mono">{fmtHoras(rateio.semProjeto)}</span>
                    <span className="w-28 text-right font-mono">—</span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
