"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Printer,
  FileSpreadsheet,
  PenLine,
  ShieldCheck,
  MapPin,
  Users,
  Coffee,
  History,
  NotebookPen,
} from "lucide-react";
import { aceitarEspelhoMes } from "@/modules/ponto/actions";
import type { EspelhoDetalhado, DiaEspelhoDetalhe, StatusDiaEspelho, EquipeAgoraItem } from "@/modules/ponto/queries";
import type { DisciplinaEscrevivel } from "@/modules/projetos/diario/queries";
import { DiarioEntradaDialog } from "@/components/projetos/diario-entrada-dialog";
import { EditarDiaDialog } from "@/components/ponto/editar-dia-dialog";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Usuario = { id: string; name: string };
type Projeto = { id: string; codigo: string; nome: string };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const STATUS_META: Record<StatusDiaEspelho, { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  ok: { tone: "success", label: "OK" },
  incompleto: { tone: "warning", label: "Incompleto" },
  falta: { tone: "danger", label: "Falta" },
  folga: { tone: "neutral", label: "Folga" },
  feriado: { tone: "info", label: "Feriado" },
  agendado: { tone: "neutral", label: "—" },
  ajustado: { tone: "info", label: "Ajustado" },
  contestado: { tone: "danger", label: "Contestado" },
};

function dataLabel(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function EquipeAgoraCard({ equipe }: { equipe: EquipeAgoraItem[] }) {
  return (
    <Card className="print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Quem está trabalhando agora
        </CardTitle>
        <CardDescription>{equipe.length} pessoa(s) com jornada aberta</CardDescription>
      </CardHeader>
      <CardContent>
        {equipe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém com jornada aberta no momento.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {equipe.map((e) => (
              <li
                key={e.userId}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm"
              >
                {e.estado === "trabalhando" ? (
                  <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden />
                ) : (
                  <Coffee className="size-3.5 text-warning" aria-hidden />
                )}
                <span>{e.nome}</span>
                {e.projeto && <span className="font-mono text-xs text-muted-foreground">{e.projeto}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaDia({
  dia,
  projetos,
  userIdAlvo,
  podeEditar,
  diarioPorProjeto,
}: {
  dia: DiaEspelhoDetalhe;
  projetos: Projeto[];
  userIdAlvo?: string;
  podeEditar: boolean;
  diarioPorProjeto: Record<string, DisciplinaEscrevivel[]>;
}) {
  const [aberto, setAberto] = useState(false);
  const primeiro = dia.descansos[0];
  const meta = STATUS_META[dia.status];
  const podeExpandir = dia.temMultiplosDescansos || dia.batidas.length > 0 || dia.ajustes.length > 0;
  // Dias futuros (agendados) não são editáveis.
  const editavel = podeEditar && dia.status !== "agendado";

  return (
    <>
      <tr className={dia.fimDeSemana ? "bg-muted/30" : undefined}>
        <td className="px-2 py-1.5 capitalize">
          <button
            type="button"
            onClick={() => podeExpandir && setAberto((v) => !v)}
            className="inline-flex items-center gap-1 text-left disabled:cursor-default"
            disabled={!podeExpandir}
          >
            {podeExpandir && (
              <ChevronDown className={`size-3 transition-transform ${aberto ? "rotate-180" : ""}`} />
            )}
            {dataLabel(dia.dia)}
          </button>
        </td>
        <td className="px-2 py-1.5 text-center font-mono">
          <span className={dia.atrasado ? "text-destructive" : ""} title={dia.atrasado ? `Atraso de ${dia.atrasoMin} min` : undefined}>
            {dia.entrada ?? "—"}
          </span>
        </td>
        <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{primeiro?.inicio ?? "—"}</td>
        <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
          {primeiro?.fim ?? "—"}
          {dia.temMultiplosDescansos && (
            <Badge variant="secondary" className="ml-1">+{dia.descansos.length - 1}</Badge>
          )}
        </td>
        <td className="px-2 py-1.5 text-center font-mono">{dia.saida ?? "—"}</td>
        <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
          {dia.descansoMin > 0 ? fmtHoras(dia.descansoMin) : "—"}
        </td>
        <td className="px-2 py-1.5 text-center font-mono font-medium">
          {dia.trabalhadoMin > 0 ? fmtHoras(dia.trabalhadoMin) : "—"}
        </td>
        <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
          {dia.devidasMin > 0 ? fmtHoras(dia.devidasMin) : "—"}
        </td>
        <td className="px-2 py-1.5 text-center font-mono">
          {dia.extrasMin > 0 ? <span className="text-success">{fmtHoras(dia.extrasMin)}</span> : "—"}
        </td>
        <td className="px-2 py-1.5 text-center">
          <span className="inline-flex items-center gap-1">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            {dia.ajustes.length > 0 && (
              <span
                role="img"
                aria-label={`Ajustado por ${dia.ajustes[0].editorNome} em ${formatarDataHora(dia.ajustes[0].em)}${dia.ajustes.length > 1 ? ` (${dia.ajustes.length} ajustes)` : ""} — Motivo: ${dia.ajustes[0].justificativa}`}
                title={`Ajustado por ${dia.ajustes[0].editorNome} em ${formatarDataHora(dia.ajustes[0].em)}${dia.ajustes.length > 1 ? ` (${dia.ajustes.length} ajustes)` : ""}\nMotivo: ${dia.ajustes[0].justificativa}`}
              >
                <History className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </span>
            )}
          </span>
        </td>
        <td className="px-2 py-1.5 text-center print:hidden">
          {editavel && (
            <EditarDiaDialog
              inicial={{ dia: dia.dia, entrada: dia.entrada, saida: dia.saida, descansos: dia.descansos }}
              projetos={projetos}
              userId={userIdAlvo}
            />
          )}
        </td>
      </tr>
      {aberto && (
        <tr className="bg-muted/20">
          <td colSpan={11} className="px-4 py-2">
            <div className="flex flex-col gap-2 text-xs">
              {dia.ajustes.length > 0 && (
                <div className="flex flex-col gap-1">
                  {dia.ajustes.length > 1 && (
                    <span className="font-medium text-info">
                      Histórico de ajustes ({dia.ajustes.length})
                    </span>
                  )}
                  {dia.ajustes.map((aj, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-1.5 rounded-sm border border-info/30 bg-info/5 px-2 py-1.5 text-info"
                    >
                      <History className="mt-0.5 size-3.5 shrink-0" />
                      <div>
                        <span className="font-medium">
                          {aj.proprio ? "Ajuste próprio" : `Ajustado por ${aj.editorNome}`} em{" "}
                          {formatarDataHora(aj.em)}
                        </span>
                        <p className="text-muted-foreground">Motivo: {aj.justificativa}</p>
                        <p className="font-mono text-muted-foreground">
                          {aj.antes} → {aj.depois}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {dia.descansos.length > 0 && (
                <div>
                  <span className="font-medium">Descansos:</span>{" "}
                  {dia.descansos.map((d, i) => (
                    <span key={i} className="font-mono text-muted-foreground">
                      {d.inicio}–{d.fim}{i < dia.descansos.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {dia.batidas.map((b) => {
                  const geo = b.geo as { lat: number; lng: number } | null;
                  return (
                    <div key={b.id} className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono">
                        {new Date(b.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>{b.tipo}</span>
                      {b.projeto && <span className="font-mono">{b.projeto}</span>}
                      {b.editada && <Badge variant="secondary">editada</Badge>}
                      {(b.tipo === "entrada" || b.tipo === "fim_descanso") &&
                        b.projetoId &&
                        diarioPorProjeto[b.projetoId] && (
                          <RegistrarDiarioBotao
                            projetoId={b.projetoId}
                            disciplinas={diarioPorProjeto[b.projetoId]}
                            dia={dia.dia}
                          />
                        )}
                      {geo && (
                        <a
                          href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-info hover:underline print:hidden"
                        >
                          <MapPin className="size-3" /> local
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Atalho "registrar no diário" por bloco de jornada com projeto marcado (só no próprio espelho). */
function RegistrarDiarioBotao({
  projetoId,
  disciplinas,
  dia,
}: {
  projetoId: string;
  disciplinas: DisciplinaEscrevivel[];
  dia: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-0.5 text-info hover:underline print:hidden"
        title="Registrar no diário do projeto"
      >
        <NotebookPen className="size-3" /> diário
      </button>
      <DiarioEntradaDialog
        open={open}
        onOpenChange={setOpen}
        disciplinas={disciplinas}
        projetoId={projetoId}
        dataInicial={dia}
        linkParaPainel
      />
    </>
  );
}

export function EspelhoView({
  detalhe,
  ano,
  mes,
  usuarios,
  usuarioSelecionadoId,
  equipe,
  souEuMesmo,
  projetos,
  podeEditar,
  diarioPorProjeto,
}: {
  detalhe: EspelhoDetalhado;
  ano: number;
  mes: number;
  usuarios: Usuario[] | null;
  usuarioSelecionadoId: string;
  equipe: EquipeAgoraItem[] | null;
  souEuMesmo: boolean;
  projetos: Projeto[];
  podeEditar: boolean;
  diarioPorProjeto: Record<string, DisciplinaEscrevivel[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Edição de terceiro passa o userId; edição própria não.
  const userIdAlvo = souEuMesmo ? undefined : usuarioSelecionadoId;

  function navegar(novoAno: number, novoMes: number, u = usuarioSelecionadoId) {
    const qs = new URLSearchParams({ a: String(novoAno), m: String(novoMes) });
    if (u) qs.set("u", u);
    router.push(`/ponto/espelho?${qs.toString()}`);
  }

  const mesAnterior = () => (mes === 1 ? navegar(ano - 1, 12) : navegar(ano, mes - 1));
  const mesProximo = () => (mes === 12 ? navegar(ano + 1, 1) : navegar(ano, mes + 1));

  function assinar() {
    startTransition(async () => {
      const r = await aceitarEspelhoMes({ ano, mes });
      if (r.ok) {
        toast.success("Espelho assinado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const baseNome = `espelho-${detalhe.nome.replace(/\s+/g, "-")}-${ano}-${String(mes).padStart(2, "0")}`;

  async function exportarXlsx() {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Espelho");
    ws.addRow(["Data", "Entrada", "S.Desc", "V.Desc", "Saída", "Descanso", "Trabalhado", "Devidas", "Extras", "Status"]).font = { bold: true };
    for (const d of detalhe.dias) {
      const p = d.descansos[0];
      ws.addRow([
        dataLabel(d.dia),
        d.entrada ?? "—",
        p?.inicio ?? "—",
        p?.fim ?? "—",
        d.saida ?? "—",
        d.descansoMin > 0 ? fmtHoras(d.descansoMin) : "—",
        d.trabalhadoMin > 0 ? fmtHoras(d.trabalhadoMin) : "—",
        d.devidasMin > 0 ? fmtHoras(d.devidasMin) : "—",
        d.extrasMin > 0 ? fmtHoras(d.extrasMin) : "—",
        STATUS_META[d.status].label,
      ]);
    }
    ws.columns.forEach((c) => { c.width = 13; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buf as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseNome}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Espelho de ponto</h1>
          <p className="text-sm text-muted-foreground">{detalhe.nome}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usuarios && (
            <Select value={usuarioSelecionadoId} onValueChange={(v) => v && navegar(ano, mes, v)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={mesAnterior} aria-label="Mês anterior">
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium capitalize">
              {MESES[mes - 1]} {ano}
            </span>
            <Button variant="outline" size="icon" onClick={mesProximo} aria-label="Próximo mês">
              <ChevronRight />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline">
                  <Download className="size-4" /> Exportar
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportarXlsx()}>
                <FileSpreadsheet className="size-4" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="size-4" /> Imprimir / PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {equipe && <EquipeAgoraCard equipe={equipe} />}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Trabalhado</CardDescription>
            <CardTitle className="text-xl">{fmtHoras(detalhe.totalMinutos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Esperado</CardDescription>
            <CardTitle className="text-xl text-muted-foreground">{fmtHoras(detalhe.esperadoMinutos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Saldo do mês</CardDescription>
            <CardTitle className={`text-xl ${detalhe.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
              {fmtHoras(detalhe.saldoMinutos)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Acumulado (banco)</CardDescription>
            <CardTitle className={`text-xl ${(detalhe.acumuladoMinutos ?? 0) < 0 ? "text-destructive" : ""}`}>
              {detalhe.acumuladoMinutos != null ? fmtHoras(detalhe.acumuladoMinutos) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Aceite mensal (S2) — só no próprio espelho de mês encerrado. */}
      {souEuMesmo && (detalhe.aceite || detalhe.podeAceitar) && (
        <Card className="print:hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            {detalhe.aceite ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <ShieldCheck className="size-4" />
                Espelho assinado em {new Date(detalhe.aceite.aceitoEm).toLocaleString("pt-BR")}
                <span className="font-mono text-xs text-muted-foreground">#{detalhe.aceite.hash.slice(0, 12)}</span>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Confira e assine o espelho de {MESES[mes - 1]} — o aceite fica registrado com data e hash.
                </p>
                <Button size="sm" onClick={assinar} disabled={pending} loading={pending}>
                  <PenLine className="size-4" /> Assinar espelho
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Data</th>
                <th className="px-2 py-2 text-center font-medium">Entrada</th>
                <th className="px-2 py-2 text-center font-medium">S.Desc</th>
                <th className="px-2 py-2 text-center font-medium">V.Desc</th>
                <th className="px-2 py-2 text-center font-medium">Saída</th>
                <th className="px-2 py-2 text-center font-medium">Descanso</th>
                <th className="px-2 py-2 text-center font-medium">Trabalhado</th>
                <th className="px-2 py-2 text-center font-medium">Devidas</th>
                <th className="px-2 py-2 text-center font-medium">Extras</th>
                <th className="px-2 py-2 text-center font-medium">Status</th>
                <th className="px-2 py-2 text-center font-medium print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {detalhe.dias.map((d) => (
                <LinhaDia
                  key={d.dia}
                  dia={d}
                  projetos={projetos}
                  userIdAlvo={userIdAlvo}
                  podeEditar={podeEditar}
                  diarioPorProjeto={diarioPorProjeto}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
