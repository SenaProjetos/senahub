"use client";

import Link from "next/link";
import { Clock, Download, Info, FileSpreadsheet, FileText, CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fecharRateioMes } from "@/modules/rh/rateio/actions";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fmtHoras } from "@/modules/ponto/format";
import { brl, formatarData } from "@/lib/utils";
import { RegistroPonto, type EstadoDiaProp, type AjustePendenteProp } from "@/components/ponto/registro-view";
import type { DisciplinaEscrevivel } from "@/modules/projetos/diario/queries";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

type Projeto = { id: string; codigo: string; nome: string };
type Espelho = {
  dias: { dia: string; minutos: number; sessoes: { inicio: string | Date; fim: string | Date | null; minutos: number; projeto: string | null }[] }[];
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  /** Esperado por dia (ISO → minutos) — base do filtro por período. */
  esperadoPorDia: Record<string, number>;
};

type Periodo = "dia" | "semana" | "mes";
const PERIODO_LABEL: Record<Periodo, string> = { dia: "hoje", semana: "semana", mes: "mês" };

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Intervalo [ini,fim] em ISO do período selecionado (semana = segunda a domingo de hoje). */
function rangePeriodo(periodo: Periodo, ano: number, mes: number): { ini: string; fim: string } {
  const hoje = new Date();
  const hojeIso = isoLocal(hoje);
  if (periodo === "dia") return { ini: hojeIso, fim: hojeIso };
  if (periodo === "mes") {
    const mm = String(mes).padStart(2, "0");
    const ultimo = new Date(ano, mes, 0).getDate();
    return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}` };
  }
  const dow = (hoje.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - dow);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { ini: isoLocal(seg), fim: isoLocal(dom) };
}

type EspelhoDia = Espelho["dias"][number];
type LinhaEspelho = {
  iso: string; // AAAA-MM-DD
  dia: number;
  fimDeSemana: boolean;
  registro: EspelhoDia | null;
};

/** Gera a grade completa do mês (1..último dia) e faz merge por data com os dias-com-registro. */
function gradeDoMes(ano: number, mes: number, dias: EspelhoDia[]): LinhaEspelho[] {
  const porData = new Map(dias.map((d) => [d.dia, d]));
  const ultimo = new Date(ano, mes, 0).getDate();
  const linhas: LinhaEspelho[] = [];
  for (let dia = 1; dia <= ultimo; dia++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const wd = new Date(ano, mes - 1, dia).getDay();
    linhas.push({
      iso,
      dia,
      fimDeSemana: wd === 0 || wd === 6,
      registro: porData.get(iso) ?? null,
    });
  }
  return linhas;
}

function hhmm(d: string | Date): string {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Escapa um campo para CSV (RFC 4180): aspas duplas se contiver `,`, `"`, `;` ou quebra de linha. */
function csvCampo(v: string): string {
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function dataPtBr(iso: string): string {
  // iso = AAAA-MM-DD; evita timezone montando data local.
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

type Rateio = {
  porProjeto: { projeto: string; minutos: number; custo: number }[];
  semProjeto: number;
  custoTotal: number;
  fechado: boolean;
  fechadoEm: string | Date | null;
};

export function PontoView({
  estadoDia,
  projetos,
  espelho,
  rateio,
  ano,
  mes,
  pendencias,
  diarioPorProjeto,
  controlaJornada,
}: {
  estadoDia: EstadoDiaProp;
  projetos: Projeto[];
  espelho: Espelho;
  rateio: Rateio | null;
  ano: number;
  mes: number;
  pendencias: AjustePendenteProp[];
  diarioPorProjeto: Record<string, DisciplinaEscrevivel[]>;
  /** Só CLT/estagiário têm controle de jornada (esperado/saldo); demais cargos são informativos. */
  controlaJornada: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /** Ação simples (usada pelo fechamento de rateio) — feedback + refresh. */
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

  const linhas = gradeDoMes(ano, mes, espelho.dias);

  // Filtro temporal do resumo (dia/semana/mês) — padrão semana.
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const { ini: pIni, fim: pFim } = rangePeriodo(periodo, ano, mes);
  const hojeIso = isoLocal(new Date());
  const linhasPeriodo = linhas.filter((l) => l.iso >= pIni && l.iso <= pFim);
  const trabalhadoPeriodo = linhasPeriodo.reduce((a, l) => a + (l.registro?.minutos ?? 0), 0);
  // Esperado só conta dias já decorridos (≤ hoje) — evita saldo negativo assustador.
  const esperadoPeriodo = linhasPeriodo.reduce(
    (a, l) => a + (l.iso <= hojeIso ? espelho.esperadoPorDia[l.iso] ?? 0 : 0),
    0,
  );
  const saldoPeriodo = trabalhadoPeriodo - esperadoPeriodo;

  /** Matriz do espelho (cabeçalho + linhas) compartilhada pelo export CSV e XLSX. */
  function matrizExport(): { cabecalho: string[]; linhasExport: string[][] } {
    const cabecalho = ["Data", "Entrada", "Saída", "Horas", "Projeto"];
    if (controlaJornada) cabecalho.push("Saldo");
    const jornadaDia =
      espelho.dias.length > 0 ? espelho.esperadoMinutos / espelho.dias.length : 0;
    const linhasExport = linhas.map((l) => {
      const r = l.registro;
      if (!r) {
        return controlaJornada
          ? [dataPtBr(l.iso), "—", "—", "—", "—", "—"]
          : [dataPtBr(l.iso), "—", "—", "—", "—"];
      }
      // Entrada = início da 1ª sessão; Saída = fim da última (— se ainda aberta).
      const primeira = r.sessoes[0];
      const ultima = r.sessoes[r.sessoes.length - 1];
      const entrada = primeira ? hhmm(primeira.inicio) : "—";
      const saida = ultima?.fim ? hhmm(ultima.fim) : "—";
      const projetos = [
        ...new Set(r.sessoes.map((s) => s.projeto).filter((p): p is string => !!p)),
      ].join(" / ");
      const linha = [dataPtBr(l.iso), entrada, saida, fmtHoras(r.minutos), projetos || "—"];
      if (controlaJornada) {
        const saldoDia = jornadaDia > 0 && !l.fimDeSemana ? r.minutos - jornadaDia : r.minutos;
        linha.push(fmtHoras(Math.round(saldoDia)));
      }
      return linha;
    });
    return { cabecalho, linhasExport };
  }

  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const baseNome = `espelho-ponto-${ano}-${String(mes).padStart(2, "0")}`;

  function exportarCsv() {
    const { cabecalho, linhasExport } = matrizExport();
    const conteudo = [cabecalho, ...linhasExport]
      .map((cols) => cols.map(csvCampo).join(";"))
      .join("\r\n");
    baixar(new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" }), `${baseNome}.csv`);
  }

  async function exportarXlsx() {
    const { cabecalho, linhasExport } = matrizExport();
    // Import dinâmico: mantém o exceljs fora do chunk principal (só carrega ao exportar).
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Espelho");
    ws.addRow(cabecalho).font = { bold: true };
    for (const r of linhasExport) ws.addRow(r);
    ws.columns.forEach((c) => { c.width = 14; });
    const buf = await wb.xlsx.writeBuffer();
    baixar(
      new Blob([buf as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${baseNome}.xlsx`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Ponto</h2>
        <p className="text-sm text-muted-foreground">
          Registre sua jornada: entrada, descansos e saída. Troque de projeto sem perder tempo.
        </p>
      </div>

      <RegistroPonto estadoDia={estadoDia} projetos={projetos} pendencias={pendencias} diarioPorProjeto={diarioPorProjeto} />

      {/* Filtro temporal do resumo — dia / semana (padrão) / mês. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Resumo</h3>
        <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Período do resumo">
          {(["dia", "semana", "mes"] as Periodo[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              aria-pressed={periodo === p}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                periodo === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "mes" ? "Mês" : p}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 ${controlaJornada ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Trabalhado ({PERIODO_LABEL[periodo]})
            </CardDescription>
            <CardTitle className="text-2xl">{fmtHoras(trabalhadoPeriodo)}</CardTitle>
          </CardHeader>
        </Card>
        {controlaJornada && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  Esperado ({PERIODO_LABEL[periodo]})
                </CardDescription>
                <CardTitle className="text-2xl text-muted-foreground">{fmtHoras(esperadoPeriodo)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em]">
                  Saldo ({PERIODO_LABEL[periodo]})
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Como o saldo é calculado"
                          className="inline-flex text-muted-foreground hover:text-foreground"
                        >
                          <Info className="size-3" />
                        </button>
                      }
                    />
                    <TooltipContent>
                      Saldo = horas trabalhadas − jornada prevista, contando só os dias já decorridos
                      (até hoje). Negativo = horas a compensar.
                    </TooltipContent>
                  </Tooltip>
                </CardDescription>
                <CardTitle className={`text-2xl ${saldoPeriodo < 0 ? "text-destructive" : "text-success"}`}>
                  {fmtHoras(saldoPeriodo)}
                </CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Espelho {periodo === "dia" ? "do dia" : periodo === "semana" ? "da semana" : "do mês"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" render={<Link href="/ponto/espelho" />}>
                <CalendarClock className="size-4" /> Espelho detalhado
              </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" aria-label="Exportar espelho">
                    <Download className="size-4" /> Exportar
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportarXlsx()}>
                  <FileSpreadsheet className="size-4" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportarCsv}>
                  <FileText className="size-4" /> CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {linhasPeriodo.map((l) => {
              const r = l.registro;
              return (
                <li
                  key={l.iso}
                  className={`flex items-center justify-between py-2 ${
                    l.fimDeSemana ? "text-muted-foreground" : ""
                  }`}
                >
                  <span className="capitalize">{dataPtBr(l.iso)}</span>
                  {r ? (
                    <span className="font-mono">{fmtHoras(r.minutos)}</span>
                  ) : (
                    <span className="font-mono text-muted-foreground">—</span>
                  )}
                </li>
              );
            })}
          </ul>
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
              <EmptyState icon={Clock} title="Sem horas rateadas." />
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
