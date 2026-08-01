"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, CalendarClock, RefreshCw } from "lucide-react";
import { fecharBancoMesEquipe, recalcularBancoHistorico } from "@/modules/rh/banco/actions";
import { fmtHoras } from "@/modules/ponto/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/utils";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtSaldo(min: number) {
  const sinal = min < 0 ? "−" : "+";
  return `${sinal}${fmtHoras(Math.abs(min))}`;
}

/** Último dia útil (seg–sex) do mês corrente — prazo de fechamento do banco de horas. */
function prazoFechamento(ref: Date) {
  const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

type Fechamento = { userId: string; nome: string; saldoMinutos: number; acumuladoMinutos: number; fechadoEm: string };
type Corrente = { userId: string; nome: string; trabalhadoMinutos: number; esperadoMinutos: number; saldoMinutos: number };

export function BancoHorasAdmin({
  ano,
  mes,
  fechamentos,
  corrente,
  anoCorrente,
  mesCorrente,
  inicioRecalculo,
}: {
  ano: number;
  mes: number;
  fechamentos: Fechamento[];
  /** Saldo ao vivo do mês CORRENTE (até hoje) — não depende de fechamento. */
  corrente: Corrente[];
  anoCorrente: number;
  mesCorrente: number;
  /** Mês mais antigo com fechamento gravado — início do recálculo em blocos. */
  inicioRecalculo: { ano: number; mes: number } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recalculando, startRecalculo] = useTransition();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = prazoFechamento(hoje);
  const diasRestantes = Math.round((prazo.getTime() - hoje.getTime()) / 86_400_000);
  const prazoLabel =
    diasRestantes < 0
      ? "prazo encerrado"
      : diasRestantes === 0
        ? "vence hoje"
        : diasRestantes === 1
          ? "falta 1 dia"
          : `faltam ${diasRestantes} dias`;
  const prazoUrgente = diasRestantes <= 2;

  function fechar() {
    start(async () => {
      const r = await fecharBancoMesEquipe({ ano, mes });
      if (r.ok) {
        toast.success(`Banco fechado para ${r.data.fechados} colaborador(es).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Recálculo em blocos: cada mês custa ~12 queries por colaborador, então a ação
  // limita a janela. O botão avança sozinho e avisa quando ainda falta histórico.
  const [proximoRecalculo, setProximoRecalculo] = useState(inicioRecalculo);

  function recalcular() {
    if (!proximoRecalculo) return;
    startRecalculo(async () => {
      const r = await recalcularBancoHistorico(proximoRecalculo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { meses, linhas, ate } = r.data;
      if (meses === 0 || !ate) {
        toast.success("Histórico já está recalculado.");
        setProximoRecalculo(inicioRecalculo);
      } else {
        const seguinte = ate.mes === 12 ? { ano: ate.ano + 1, mes: 1 } : { ano: ate.ano, mes: ate.mes + 1 };
        setProximoRecalculo(seguinte);
        toast.success(
          `${meses} mês(es) recalculado(s) até ${MESES[ate.mes - 1]}/${ate.ano} — ${linhas} linha(s). Clique de novo para continuar.`,
        );
      }
      router.refresh();
    });
  }

  // Saldo corrente por colaborador — chave para juntar com o fechado na tabela.
  const correntePorUser = new Map(corrente.map((c) => [c.userId, c]));
  // Colaborador sem fechamento (admitido depois, ou mês nunca fechado) ainda
  // precisa aparecer se tem saldo corrente.
  const linhas = [
    ...fechamentos.map((f) => ({ ...f, corrente: correntePorUser.get(f.userId) ?? null })),
    ...corrente
      .filter((c) => !fechamentos.some((f) => f.userId === c.userId))
      .map((c) => ({ userId: c.userId, nome: c.nome, saldoMinutos: null, acumuladoMinutos: null, corrente: c })),
  ].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Banco de horas</CardTitle>
            <CardDescription>
              Fechamento de {MESES[mes - 1]}/{ano} · saldo corrente de {MESES[mesCorrente - 1]}/{anoCorrente} ·
              vínculos CLT e estágio
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {proximoRecalculo && (
              <Button size="sm" variant="ghost" onClick={recalcular} disabled={recalculando}>
                <RefreshCw className="size-3.5" /> Recalcular histórico
              </Button>
            )}
            <Button size="sm" variant={fechamentos.length ? "outline" : "default"} onClick={fechar} disabled={pending}>
              <Clock className="size-3.5" /> {fechamentos.length ? "Refechar mês" : "Fechar mês"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={`mb-3 flex items-center gap-2 rounded-sm border px-3 py-2 text-xs ${
            prazoUrgente
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "bg-muted/40 text-muted-foreground"
          }`}
        >
          <CalendarClock className="size-3.5 shrink-0" />
          <span>
            Fechamento de <strong className="font-semibold">{MESES[mes - 1]}/{ano}</strong> até{" "}
            <strong className="font-semibold">{formatarData(prazo)}</strong> ({prazoLabel}).
          </span>
        </div>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum colaborador com vínculo CLT ou de estágio vigente no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="py-2">Colaborador</th>
                  <th className="py-2 text-right">Saldo {MESES[mes - 1]} (fechado)</th>
                  <th className="py-2 text-right">Saldo {MESES[mesCorrente - 1]} (até hoje)</th>
                  <th className="py-2 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l) => (
                  <tr key={l.userId}>
                    <td className="py-2">{l.nome}</td>
                    <td className={`py-2 text-right font-mono ${l.saldoMinutos === null ? "text-muted-foreground" : l.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
                      {l.saldoMinutos === null ? "não fechado" : fmtSaldo(l.saldoMinutos)}
                    </td>
                    <td className={`py-2 text-right font-mono ${!l.corrente ? "text-muted-foreground" : l.corrente.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
                      {l.corrente ? fmtSaldo(l.corrente.saldoMinutos) : "—"}
                    </td>
                    <td className={`py-2 text-right font-mono font-semibold ${l.acumuladoMinutos === null ? "text-muted-foreground" : l.acumuladoMinutos < 0 ? "text-destructive" : "text-success"}`}>
                      {l.acumuladoMinutos === null ? "—" : fmtSaldo(l.acumuladoMinutos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
