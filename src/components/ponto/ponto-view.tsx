"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Repeat, Clock, Download, Info, CloudOff, FileSpreadsheet, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { baterPonto, trocarProjeto, encerrarJornada } from "@/modules/ponto/actions";
import { fecharRateioMes } from "@/modules/rh/rateio/actions";
import {
  contarPendentes,
  enfileirar,
  estaOffline,
  sincronizar,
  type TipoBatida,
} from "@/lib/ponto-offline";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const NONE = "__none";
type Projeto = { id: string; codigo: string; nome: string };
type Espelho = {
  dias: { dia: string; minutos: number; sessoes: { inicio: string | Date; fim: string | Date | null; minutos: number; projeto: string | null }[] }[];
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
};

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
  const [pendentes, setPendentes] = useState(0);

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

  /**
   * Bater/trocar/encerrar com suporte offline: se o dispositivo está offline,
   * enfileira a batida (otimista) sem tentar a rede. Se a action falhar por rede
   * (Promise rejeita), também enfileira. Erros de aplicação (ok:false) são exibidos.
   */
  async function acaoOffline(
    tipo: TipoBatida,
    fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; data: unknown }>,
    payload: { projetoId?: string },
    msg: string,
  ) {
    if (estaOffline()) {
      enfileirar(tipo, payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — batida salva e será enviada ao reconectar.");
      return;
    }
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        router.refresh();
      } else {
        toast.error((r as { error: string }).error);
      }
    } catch {
      // Falha de rede no meio do envio — guarda offline para reenviar depois.
      enfileirar(tipo, payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — batida salva e será enviada ao reconectar.");
    } finally {
      setBusy(false);
    }
  }

  /** Reenvia a fila de batidas pendentes e dá feedback ao usuário. */
  const sincronizarFila = useCallback(async () => {
    if (contarPendentes() === 0) return;
    const { sincronizados, falhas } = await sincronizar({
      bater: baterPonto,
      trocar: trocarProjeto,
      encerrar: encerrarJornada,
    });
    setPendentes(contarPendentes());
    if (sincronizados > 0) {
      toast.success(`${sincronizados} batida(s) sincronizada(s).`);
      router.refresh();
    }
    for (const f of falhas) toast.error(`Batida offline rejeitada: ${f}`);
  }, [router]);

  // No mount: reflete pendências e tenta sincronizar. Reage ao voltar a conexão.
  useEffect(() => {
    setPendentes(contarPendentes());
    void sincronizarFila();
    const onOnline = () => void sincronizarFila();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sincronizarFila]);

  const proj = (id: string) => (id === NONE ? "" : id);

  const linhas = gradeDoMes(ano, mes, espelho.dias);

  /** Matriz do espelho (cabeçalho + linhas) compartilhada pelo export CSV e XLSX. */
  function matrizExport(): { cabecalho: string[]; linhasExport: string[][] } {
    const cabecalho = ["Data", "Entrada", "Saída", "Horas", "Projeto", "Saldo"];
    const jornadaDia =
      espelho.dias.length > 0 ? espelho.esperadoMinutos / espelho.dias.length : 0;
    const linhasExport = linhas.map((l) => {
      const r = l.registro;
      if (!r) {
        return [dataPtBr(l.iso), "—", "—", "—", "—", "—"];
      }
      // Entrada = início da 1ª sessão; Saída = fim da última (— se ainda aberta).
      const primeira = r.sessoes[0];
      const ultima = r.sessoes[r.sessoes.length - 1];
      const entrada = primeira ? hhmm(primeira.inicio) : "—";
      const saida = ultima?.fim ? hhmm(ultima.fim) : "—";
      const projetos = [
        ...new Set(r.sessoes.map((s) => s.projeto).filter((p): p is string => !!p)),
      ].join(" / ");
      const saldoDia = jornadaDia > 0 && !l.fimDeSemana ? r.minutos - jornadaDia : r.minutos;
      return [
        dataPtBr(l.iso),
        entrada,
        saida,
        fmtHoras(r.minutos),
        projetos || "—",
        fmtHoras(Math.round(saldoDia)),
      ];
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
                  onClick={() =>
                    acaoOffline(
                      "trocar",
                      () => trocarProjeto({ projetoId: proj(projetoId) }),
                      { projetoId: proj(projetoId) },
                      "Projeto trocado.",
                    )
                  }
                >
                  <Repeat className="size-4" /> Trocar projeto
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => acaoOffline("encerrar", () => encerrarJornada({}), {}, "Jornada encerrada.")}
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
                  onClick={() =>
                    acaoOffline(
                      "bater",
                      () => baterPonto({ projetoId: proj(projetoId) }),
                      { projetoId: proj(projetoId) },
                      "Jornada iniciada.",
                    )
                  }
                >
                  <Play className="size-4" /> Iniciar jornada
                </Button>
              </div>
            </>
          )}
          {pendentes > 0 && (
            <button
              type="button"
              onClick={() => void sincronizarFila()}
              className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              title="Toque para tentar sincronizar agora"
            >
              <CloudOff className="size-4" />
              {pendentes} batida(s) pendente(s) offline · toque para sincronizar
            </button>
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
            <CardDescription className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em]">
              Saldo (banco)
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Como o banco de horas é calculado"
                      className="inline-flex text-muted-foreground hover:text-foreground"
                    >
                      <Info className="size-3" />
                    </button>
                  }
                />
                <TooltipContent>
                  Banco de horas = soma (horas trabalhadas − jornada prevista) de todos os dias.
                  Negativo = horas a compensar.
                </TooltipContent>
              </Tooltip>
            </CardDescription>
            <CardTitle className={`text-2xl ${espelho.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
              {fmtHoras(espelho.saldoMinutos)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Espelho do mês</CardTitle>
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
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {linhas.map((l) => {
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
