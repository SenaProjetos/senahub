"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Check, Pencil, Paperclip, MoreHorizontal, Search, Download, Printer, FileSpreadsheet, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import type { LancamentoItem, OpcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { baixarEmLote } from "@/modules/financeiro/lancamentos/actions";
import { LancamentoForm } from "./lancamento-form";
import { ConfirmarDialog } from "./confirmar-dialog";
import { LancamentoDetalheDialog } from "./lancamento-detalhe-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dt(d: string | Date | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}
function meioDia(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDias(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function venceEm(d: string | Date | null): "vencido" | "hoje" | "futuro" | null {
  if (!d) return null;
  const hoje = meioDia(new Date());
  const v = meioDia(new Date(d));
  if (v < hoje) return "vencido";
  if (v.getTime() === hoje.getTime()) return "hoje";
  return "futuro";
}
function parcela(desc: string): string | null {
  const m = desc.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

type Situacao = "pendente" | "agendado" | "aguardando";
type Modo = "todos" | "mes" | "30" | "60" | "90" | "vencidas" | "custom";

const NONE = "__none";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ContasPagarReceberView({
  itens,
  opcoes,
  tabInicial = "despesa",
  podeGerir = false,
}: {
  itens: LancamentoItem[];
  opcoes: OpcoesLancamento;
  tabInicial?: "despesa" | "receita";
  podeGerir?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<"despesa" | "receita">(tabInicial);
  const [modo, setModo] = useState<Modo>("todos");
  const [mesRef, setMesRef] = useState(() => meioDia(new Date()));
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [situacoes, setSituacoes] = useState<Set<Situacao>>(new Set());
  const [aging, setAging] = useState("");
  const [fornecedorId, setFornecedorId] = useState(NONE);
  const [clienteId, setClienteId] = useState(NONE);
  const [centroId, setCentroId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [projetoId, setProjetoId] = useState(NONE);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [agruparPor, setAgruparPor] = useState("");
  const [mostrarSaldo, setMostrarSaldo] = useState(false);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editar, setEditar] = useState<LancamentoItem | null>(null);
  const [detalhe, setDetalhe] = useState<LancamentoItem | null>(null);
  const [confirmar, setConfirmar] = useState<LancamentoItem | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);

  // top-level da categoria (sidebar "Contas")
  const topoDe = useMemo(() => {
    const byCodigo = new Map(opcoes.categorias.map((c) => [c.codigo, c.nome]));
    return (l: LancamentoItem) => {
      const cod = l.categoria?.codigo ?? "";
      return byCodigo.get(cod.split(".")[0]) ?? l.categoria?.nome ?? "Sem categoria";
    };
  }, [opcoes.categorias]);

  function situacaoDe(l: LancamentoItem): Situacao {
    if (l.status === "aguardando_aprovacao") return "aguardando";
    const s = venceEm(l.vencimento ?? l.data);
    return s === "vencido" || s === "hoje" ? "pendente" : "agendado";
  }

  function noPeriodo(l: LancamentoItem): boolean {
    const ref = l.vencimento ?? l.data;
    if (!ref) return modo === "todos";
    const d = meioDia(new Date(ref));
    const hoje = meioDia(new Date());
    switch (modo) {
      case "todos": return true;
      case "vencidas": return d < hoje;
      case "mes": return d.getFullYear() === mesRef.getFullYear() && d.getMonth() === mesRef.getMonth();
      case "30": return d >= hoje && d <= addDias(hoje, 30);
      case "60": return d >= hoje && d <= addDias(hoje, 60);
      case "90": return d >= hoje && d <= addDias(hoje, 90);
      case "custom":
        return (!de || d >= meioDia(new Date(de))) && (!ate || d <= meioDia(new Date(ate)));
    }
  }

  function noAging(l: LancamentoItem): boolean {
    if (!aging) return true;
    const ref = l.vencimento ?? l.data;
    const s = venceEm(ref);
    if (aging === "vencidas") return s === "vencido";
    if (aging === "hoje") return s === "hoje";
    const n = Number(aging);
    if (!ref) return false;
    const d = meioDia(new Date(ref));
    const hoje = meioDia(new Date());
    return d >= hoje && d <= addDias(hoje, n);
  }

  // filtros comuns (período/dimensões/busca/valor/situação), SEM tab e SEM exclusão de categoria
  function passaComum(l: LancamentoItem): boolean {
    if (!noPeriodo(l)) return false;
    if (!noAging(l)) return false;
    if (situacoes.size > 0 && !situacoes.has(situacaoDe(l))) return false;
    if (fornecedorId !== NONE && l.fornecedorId !== fornecedorId) return false;
    if (clienteId !== NONE && l.clienteId !== clienteId) return false;
    if (centroId !== NONE && l.centroId !== centroId) return false;
    if (formaId !== NONE && l.formaId !== formaId) return false;
    if (projetoId !== NONE && l.projetoId !== projetoId) return false;
    const v = Number(l.valor);
    if (valorMin && v < Number(valorMin)) return false;
    if (valorMax && v > Number(valorMax)) return false;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      const alvo = `${l.descricao} ${l.fornecedor?.nome ?? ""} ${l.cliente?.nome ?? ""} ${l.documentoFinanceiro?.numero ?? ""}`.toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  }

  // resumo do período: ambos os tipos (respeita período/filtros/exclusão de categoria)
  const resumo = useMemo(() => {
    let aPagar = 0;
    let aReceber = 0;
    for (const l of itens) {
      if (!passaComum(l)) continue;
      if (excluidas.has(topoDe(l))) continue;
      if (l.tipo === "despesa") aPagar += Number(l.valor);
      else aReceber += Number(l.valor);
    }
    return { aPagar, aReceber, resultado: aReceber - aPagar };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, modo, mesRef, de, ate, busca, situacoes, aging, fornecedorId, clienteId, centroId, formaId, projetoId, valorMin, valorMax, excluidas]);

  // sidebar "Contas" do tab atual (antes da exclusão), com totais
  const grupoContas = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of itens) {
      if (l.tipo !== tab) continue;
      if (!passaComum(l)) continue;
      const k = topoDe(l);
      m.set(k, (m.get(k) ?? 0) + Number(l.valor));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, tab, modo, mesRef, de, ate, busca, situacoes, aging, fornecedorId, clienteId, centroId, formaId, projetoId, valorMin, valorMax]);

  // lista final do tab (aplica exclusão de categoria)
  const lista = useMemo(() => {
    return itens
      .filter((l) => l.tipo === tab && passaComum(l) && !excluidas.has(topoDe(l)))
      .sort((a, b) => {
        const va = new Date(a.vencimento ?? a.data).getTime();
        const vb = new Date(b.vencimento ?? b.data).getTime();
        return va - vb;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, tab, modo, mesRef, de, ate, busca, situacoes, aging, fornecedorId, clienteId, centroId, formaId, projetoId, valorMin, valorMax, excluidas]);

  const totalLista = lista.reduce((s, l) => s + Number(l.valor), 0);

  // agrupamento com subtotais
  const grupos = useMemo(() => {
    if (!agruparPor) return null;
    const chave = (l: LancamentoItem): string => {
      if (agruparPor === "categoria") return topoDe(l);
      if (agruparPor === "fornecedor") return l.fornecedor?.nome ?? l.cliente?.nome ?? "Sem contato";
      if (agruparPor === "centro") return l.centro?.nome ?? "Sem centro";
      if (agruparPor === "mes") {
        const ref = l.vencimento ?? l.data;
        const d = new Date(ref);
        return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      }
      return "";
    };
    const m = new Map<string, LancamentoItem[]>();
    for (const l of lista) {
      const k = chave(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.entries()].map(([nome, items]) => ({
      nome,
      items,
      total: items.reduce((s, l) => s + Number(l.valor), 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, agruparPor]);

  const sinal = tab === "despesa" ? -1 : 1;

  function toggleSit(s: Situacao) {
    setSituacoes((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  }
  function toggleCat(nome: string) {
    setExcluidas((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome);
      else n.add(nome);
      return n;
    });
  }
  function toggleSel(id: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function limparSel() {
    setSelecionados(new Set());
  }

  function confirmarRapido(l: LancamentoItem) {
    if (l.status === "aguardando_aprovacao") {
      toast.error("Despesa aguardando aprovação.");
      return;
    }
    if (l.contaId) {
      start(async () => {
        const { confirmarLancamento } = await import("@/modules/financeiro/lancamentos/actions");
        const r = await confirmarLancamento({ id: l.id });
        if (r.ok) {
          toast.success(tab === "despesa" ? "Pago." : "Recebido.");
          router.refresh();
        } else toast.error(r.error);
      });
    } else {
      setConfirmar(l);
    }
  }

  function exportar(formato: "xlsx" | "csv") {
    const linhas = lista.map((l) => ({
      vencimento: dt(l.vencimento ?? l.data),
      descricao: l.descricao,
      categoria: `${l.categoria?.codigo ?? ""} ${l.categoria?.nome ?? ""}`.trim(),
      contato: l.fornecedor?.nome ?? l.cliente?.nome ?? "",
      conta: l.conta?.nome ?? "",
      centro: l.centro?.nome ?? "",
      situacao: situacaoDe(l),
      valor: sinal * Number(l.valor),
    }));
    start(async () => {
      const res = await fetch("/api/financeiro/contas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato, titulo: tab === "despesa" ? "Contas-a-pagar" : "Contas-a-receber", linhas }),
      });
      if (!res.ok) {
        toast.error("Falha ao exportar.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tab === "despesa" ? "contas-a-pagar" : "contas-a-receber"}.${formato}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function imprimir() {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const linhasHtml = lista
      .map(
        (l) => `<tr>
          <td>${dt(l.vencimento ?? l.data)}</td>
          <td>${l.descricao}</td>
          <td>${l.fornecedor?.nome ?? l.cliente?.nome ?? ""}</td>
          <td style="text-align:right">${brl(sinal * Number(l.valor))}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tab === "despesa" ? "Contas a pagar" : "Contas a receber"}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f3f3}tfoot td{font-weight:bold;border-top:2px solid #999}</style>
      </head><body>
      <h1>${tab === "despesa" ? "Contas a pagar" : "Contas a receber"}</h1>
      <p>${lista.length} lançamentos · gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Contato</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${linhasHtml}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${brl(sinal * totalLista)}</td></tr></tfoot></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function temFiltro() {
    return (
      modo !== "todos" || !!busca || situacoes.size > 0 || !!aging || fornecedorId !== NONE ||
      clienteId !== NONE || centroId !== NONE || formaId !== NONE || projetoId !== NONE ||
      !!valorMin || !!valorMax || excluidas.size > 0
    );
  }
  function limparFiltros() {
    setModo("todos"); setBusca(""); setSituacoes(new Set()); setAging("");
    setFornecedorId(NONE); setClienteId(NONE); setCentroId(NONE); setFormaId(NONE);
    setProjetoId(NONE); setValorMin(""); setValorMax(""); setExcluidas(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">Contas a pagar e receber</h2>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="size-4" /> Nova conta
        </Button>
      </div>

      {/* abas */}
      <div className="flex gap-1 border-b">
        {(["despesa", "receita"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); limparSel(); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "despesa" ? "A pagar" : "A receber"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* coluna esquerda */}
        <div className="space-y-4">
          <PeriodoCard
            modo={modo} setModo={setModo} mesRef={mesRef} setMesRef={setMesRef}
            de={de} setDe={setDe} ate={ate} setAte={setAte}
          />

          <Card>
            <CardContent className="space-y-1 py-4 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Resultado do período
              </p>
              <div className="flex justify-between"><span>A pagar</span><span className="font-mono text-destructive">{brl(-resumo.aPagar)}</span></div>
              <div className="flex justify-between"><span>A receber</span><span className="font-mono text-success">{brl(resumo.aReceber)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Resultado</span>
                <span className={`font-mono ${resumo.resultado < 0 ? "text-destructive" : "text-success"}`}>{brl(resumo.resultado)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Contas exibidas</span>
                <span className="text-muted-foreground">{tab === "despesa" ? "A pagar" : "A receber"}</span>
              </div>
              <ul className="space-y-1 text-sm">
                {grupoContas.length === 0 && <li className="text-muted-foreground">—</li>}
                {grupoContas.map(([nome, total]) => (
                  <li key={nome} className="flex items-center gap-2">
                    <input type="checkbox" checked={!excluidas.has(nome)} onChange={() => toggleCat(nome)} className="size-3.5" />
                    <span className="flex-1 truncate">{nome}</span>
                    <span className="font-mono text-xs">{brl(sinal * total)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span className="font-mono text-xs">{brl(sinal * totalLista)}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* coluna direita */}
        <div className="space-y-3">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-44">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição, contato, nº doc…" className="pl-8" />
            </div>
            <Button variant="outline" size="sm" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> XLSX</Button>
            <Button variant="outline" size="sm" onClick={() => exportar("csv")}><Download className="size-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={imprimir}><Printer className="size-4" /> PDF</Button>
          </div>

          {/* chips de situação */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([["pendente", "Pendentes", "bg-destructive"], ["agendado", "Agendados", "bg-warning"], ["aguardando", "Aguardando aprovação", "bg-muted-foreground"]] as const).map(
              ([s, label, cor]) => (
                <button
                  key={s}
                  onClick={() => toggleSit(s)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${situacoes.has(s) ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <span className={`size-2 rounded-full ${cor}`} /> {label}
                </button>
              ),
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Select value={agruparPor || NONE} onValueChange={(v) => setAgruparPor(v === NONE ? "" : (v ?? ""))}>
                <SelectTrigger size="sm" className="h-8 w-40"><SelectValue placeholder="Agrupar por" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem agrupamento</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                  <SelectItem value="fornecedor">Contato</SelectItem>
                  <SelectItem value="centro">Centro de custo</SelectItem>
                  <SelectItem value="mes">Mês de vencimento</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={mostrarSaldo} onChange={(e) => setMostrarSaldo(e.target.checked)} className="size-3.5" /> Saldo
              </label>
            </div>
          </div>

          {/* filtros de dimensão + faixa de valor */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {tab === "despesa" ? (
              <DimSelect label="Fornecedor" value={fornecedorId} onChange={setFornecedorId} options={opcoes.fornecedores} />
            ) : (
              <DimSelect label="Cliente" value={clienteId} onChange={setClienteId} options={opcoes.clientes} />
            )}
            <DimSelect label="Centro" value={centroId} onChange={setCentroId} options={opcoes.centros} />
            <DimSelect label="Forma" value={formaId} onChange={setFormaId} options={opcoes.formas} />
            <DimSelect label="Projeto" value={projetoId} onChange={setProjetoId} options={opcoes.projetos.map((p) => ({ id: p.id, nome: `${formatarCodigo(p.codigo)} ${p.nome}` }))} />
            <Input value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="Valor mín" type="number" className="h-8 w-24" />
            <Input value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="Valor máx" type="number" className="h-8 w-24" />
            {temFiltro() && (
              <Button variant="ghost" size="sm" onClick={limparFiltros}><X className="size-3.5" /> Limpar</Button>
            )}
          </div>

          {/* barra de seleção em lote */}
          {selecionados.size > 0 && (
            <div className="flex items-center justify-between rounded-sm border bg-muted/40 px-3 py-2 text-sm">
              <span>{selecionados.size} selecionado(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={limparSel}>Limpar</Button>
                <Button size="sm" onClick={() => setLoteOpen(true)}>
                  <Check className="size-3.5" /> {tab === "despesa" ? "Pagar" : "Receber"} selecionadas
                </Button>
              </div>
            </div>
          )}

          {/* lista */}
          <div ref={printRef} className="rounded-sm border">
            <div className="grid grid-cols-[28px_96px_1fr_140px_120px_140px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span />
              <span>Vencimento</span>
              <span>Descrição</span>
              <span>{tab === "despesa" ? "Fornecedor" : "Cliente"}</span>
              <span className="text-right">{mostrarSaldo ? "Saldo" : "Valor"}</span>
              <span />
            </div>
            {lista.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nada em aberto.</p>
            ) : grupos ? (
              grupos.map((g) => (
                <div key={g.nome}>
                  <div className="flex justify-between bg-muted/20 px-3 py-1.5 text-xs font-semibold">
                    <span>{g.nome}</span>
                    <span className="font-mono">{brl(sinal * g.total)}</span>
                  </div>
                  {g.items.map((l) => <LinhaConta key={l.id} l={l} />)}
                </div>
              ))
            ) : (
              renderComSaldo()
            )}
          </div>
          <p className="text-right text-sm text-muted-foreground">
            {lista.length} lançamentos · total <span className="font-mono">{brl(sinal * totalLista)}</span>
          </p>
        </div>
      </div>

      <LancamentoForm
        open={formOpen || !!editar}
        editar={editar}
        opcoes={opcoes}
        tipoInicial={tab}
        onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditar(null); } }}
      />
      <LancamentoDetalheDialog lancamento={detalhe} podeGerir={podeGerir} onClose={() => setDetalhe(null)} />
      <ConfirmarDialog lancamento={confirmar} onClose={() => setConfirmar(null)} contas={opcoes.contas} formas={opcoes.formas} />
      <LoteDialog
        open={loteOpen}
        onClose={() => setLoteOpen(false)}
        ids={[...selecionados]}
        contas={opcoes.contas}
        formas={opcoes.formas}
        tipo={tab}
        onDone={() => { limparSel(); router.refresh(); }}
      />
    </div>
  );

  // linha com saldo acumulado (sem agrupamento)
  function renderComSaldo() {
    let saldo = 0;
    return lista.map((l) => {
      saldo += sinal * Number(l.valor);
      return <LinhaConta key={l.id} l={l} saldo={mostrarSaldo ? saldo : undefined} />;
    });
  }

  function LinhaConta({ l, saldo }: { l: LancamentoItem; saldo?: number }) {
    const status = venceEm(l.vencimento ?? l.data);
    const sit = situacaoDe(l);
    const par = parcela(l.descricao);
    const cor = sit === "pendente" ? "bg-destructive" : sit === "agendado" ? "bg-warning" : "bg-muted-foreground";
    return (
      <div className="grid grid-cols-[28px_96px_1fr_140px_120px_140px] items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/20">
        <div className="flex items-center gap-1.5">
          <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} className="size-3.5" />
          <span className={`size-2 shrink-0 rounded-full ${cor}`} title={sit} />
        </div>
        <span className={`font-mono text-xs ${status === "vencido" ? "text-destructive" : status === "hoje" ? "text-warning" : ""}`}>
          {dt(l.vencimento ?? l.data)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{l.descricao}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {topoDe(l)}
            {par && <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">{par}</Badge>}
            {l.projeto && ` · ${formatarCodigo(l.projeto.codigo)}`}
          </span>
        </span>
        <span className="truncate text-xs text-muted-foreground">{l.fornecedor?.nome ?? l.cliente?.nome ?? "—"}</span>
        <span className={`text-right font-mono ${saldo != null ? (saldo < 0 ? "text-destructive" : "text-success") : ""}`}>
          {saldo != null ? brl(saldo) : brl(sinal * Number(l.valor))}
        </span>
        <span className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" disabled={l.status === "aguardando_aprovacao"} onClick={() => confirmarRapido(l)}>
            <Check className="size-3.5" /> {tab === "despesa" ? "Pagar" : "Receber"}
          </Button>
          {podeGerir && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Ações"><MoreHorizontal className="size-4" /></Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditar(l)}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDetalhe(l)}>
                  <Paperclip className="size-4" /> Anexos{l.anexos.length > 0 ? ` (${l.anexos.length})` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
    );
  }
}

function PeriodoCard({
  modo, setModo, mesRef, setMesRef, de, setDe, ate, setAte,
}: {
  modo: Modo; setModo: (m: Modo) => void; mesRef: Date; setMesRef: (d: Date) => void;
  de: string; setDe: (s: string) => void; ate: string; setAte: (s: string) => void;
}) {
  function mudaMes(delta: number) {
    const d = new Date(mesRef);
    d.setMonth(d.getMonth() + delta);
    setMesRef(meioDia(d));
  }
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        {modo === "mes" ? (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => mudaMes(-1)}><ChevronLeft className="size-4" /></Button>
            <span className="text-sm font-medium">{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</span>
            <Button variant="ghost" size="icon" onClick={() => mudaMes(1)}><ChevronRight className="size-4" /></Button>
          </div>
        ) : null}
        <Select value={modo} onValueChange={(v) => setModo((v ?? "todos") as Modo)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os pendentes</SelectItem>
            <SelectItem value="mes">Por mês</SelectItem>
            <SelectItem value="vencidas">Vencidas</SelectItem>
            <SelectItem value="30">Próximos 30 dias</SelectItem>
            <SelectItem value="60">Próximos 60 dias</SelectItem>
            <SelectItem value="90">Próximos 90 dias</SelectItem>
            <SelectItem value="custom">Período personalizado</SelectItem>
          </SelectContent>
        </Select>
        {modo === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DimSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; nome: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger size="sm" className="h-8 w-40"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{label}: todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LoteDialog({
  open, onClose, ids, contas, formas, tipo, onDone,
}: {
  open: boolean; onClose: () => void; ids: string[];
  contas: { id: string; nome: string }[]; formas: { id: string; nome: string }[];
  tipo: "despesa" | "receita"; onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [dataConf, setDataConf] = useState(hoje);

  function baixar() {
    start(async () => {
      const r = await baixarEmLote({
        ids,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        dataConfirmacao: dataConf,
      });
      if (r.ok) {
        toast.success(`${r.data.confirmados} confirmado(s)${r.data.ignorados ? `, ${r.data.ignorados} ignorado(s)` : ""}.`);
        onClose();
        onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === "despesa" ? "Pagar" : "Receber"} {ids.length} lançamento(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta bancária</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={baixar} disabled={pending}>{pending ? "Processando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
