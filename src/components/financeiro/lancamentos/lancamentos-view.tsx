"use client";

import { useEffect, useMemo, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Check, Ban, Trash2, Paperclip, Pencil, MoreHorizontal, Search, Download, Printer,
  FileSpreadsheet, ChevronLeft, ChevronRight, X, ArrowLeftRight, Receipt,
} from "lucide-react";
import {
  cancelarLancamento, excluirLancamento, baixarEmLote,
} from "@/modules/financeiro/lancamentos/actions";
import type { LivroCaixaItem, OpcoesLancamento } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { LancamentoForm } from "./lancamento-form";
import { ConfirmarDialog } from "./confirmar-dialog";
import { LancamentoDetalheDialog } from "./lancamento-detalhe-dialog";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { brl, formatarData } from "@/lib/utils";

type Conta = { id: string; nome: string; saldoInicial: number };
type Situacao = "pendente" | "agendado" | "confirmado" | "conciliado" | "aguardando" | "cancelado";
type Modo = "todos" | "mes" | "semestre" | "ano" | "custom";

const NONE = "__none";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type ColKey = "data" | "descricao" | "categoria" | "valor" | "saldo";
const COLUNAS_DEF: { key: ColKey; label: string; right?: boolean }[] = [
  { key: "data", label: "Data" },
  { key: "descricao", label: "Descrição" },
  { key: "categoria", label: "Categoria / Conta" },
  { key: "valor", label: "Valor", right: true },
  { key: "saldo", label: "Saldo", right: true },
];
const LARGURAS_PADRAO: Record<ColKey, number> = { data: 90, descricao: 360, categoria: 200, valor: 130, saldo: 130 };
const COLS_LS = "livrocaixa-larguras";

const SIT_META: Record<Situacao, { label: string; cor: string }> = {
  pendente: { label: "Pendentes", cor: "bg-destructive" },
  agendado: { label: "Agendados", cor: "bg-warning" },
  confirmado: { label: "Confirmados", cor: "bg-success" },
  conciliado: { label: "Conciliados", cor: "bg-info" },
  aguardando: { label: "Aguardando aprovação", cor: "bg-violet-500" },
  cancelado: { label: "Cancelados", cor: "bg-muted-foreground" },
};

function dt(d: string | Date | null) {
  return d ? formatarData(d) : "—";
}
function meioDia(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function ehTransferencia(topo: string) {
  return normalize(topo).includes("transferencia");
}
function parcela(desc: string): string | null {
  const m = desc.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}
function venceEm(d: string | Date | null): "vencido" | "hoje" | "futuro" | null {
  if (!d) return null;
  const hoje = meioDia(new Date());
  const v = meioDia(new Date(d));
  if (v < hoje) return "vencido";
  if (v.getTime() === hoje.getTime()) return "hoje";
  return "futuro";
}

export function LancamentosView({
  itens,
  contas,
  opcoes,
  exigeSenhaExclusao = false,
  modelosDoc = [],
  defaultProjetoId,
  defaultFormOpen = false,
}: {
  itens: LivroCaixaItem[];
  contas: Conta[];
  opcoes: OpcoesLancamento;
  exigeSenhaExclusao?: boolean;
  modelosDoc?: { id: string; nome: string }[];
  defaultProjetoId?: string;
  defaultFormOpen?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  const [modo, setModo] = useState<Modo>("todos");
  const [ref, setRef] = useState(() => meioDia(new Date()));
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [situacoes, setSituacoes] = useState<Set<Situacao>>(new Set());
  const [contasSel, setContasSel] = useState<Set<string>>(() => new Set(contas.map((c) => c.id)));
  const [categoriaId, setCategoriaId] = useState(NONE);
  const [centroId, setCentroId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [projetoId, setProjetoId] = useState(defaultProjetoId ?? NONE);
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [agruparPor, setAgruparPor] = useState("");

  const [larguras, setLarguras] = useState<Record<ColKey, number>>(LARGURAS_PADRAO);
  useEffect(() => {
    try {
      const s = localStorage.getItem(COLS_LS);
      if (s) setLarguras({ ...LARGURAS_PADRAO, ...JSON.parse(s) });
    } catch { /* ignora */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(COLS_LS, JSON.stringify(larguras)); } catch { /* ignora */ }
  }, [larguras]);

  const template = `28px ${larguras.data}px ${larguras.descricao}px ${larguras.categoria}px ${larguras.valor}px ${larguras.saldo}px 40px`;
  const totalLargura = 68 + larguras.data + larguras.descricao + larguras.categoria + larguras.valor + larguras.saldo;

  function iniciarResize(key: ColKey, e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = larguras[key];
    const move = (ev: PointerEvent) => {
      const w = Math.max(60, startW + (ev.clientX - startX));
      setLarguras((p) => ({ ...p, [key]: w }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const resetCol = (key: ColKey) => setLarguras((p) => ({ ...p, [key]: LARGURAS_PADRAO[key] }));

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(defaultFormOpen);
  const [editar, setEditar] = useState<LivroCaixaItem | null>(null);
  const [confirmar, setConfirmar] = useState<LivroCaixaItem | null>(null);
  const [detalhe, setDetalhe] = useState<LivroCaixaItem | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);

  const topoDe = useMemo(() => {
    const byCodigo = new Map(opcoes.categorias.map((c) => [c.codigo, c.nome]));
    return (l: LivroCaixaItem) => {
      const cod = l.categoria?.codigo ?? "";
      return byCodigo.get(cod.split(".")[0]) ?? l.categoria?.nome ?? "Sem categoria";
    };
  }, [opcoes.categorias]);

  // Parcela "i/n" derivada do grupo de recorrência (independe do texto da descrição).
  const parcelaPorId = useMemo(() => {
    const grupos = new Map<string, LivroCaixaItem[]>();
    for (const l of itens) {
      if (!l.recorrenciaGrupo) continue;
      const arr = grupos.get(l.recorrenciaGrupo) ?? [];
      arr.push(l);
      grupos.set(l.recorrenciaGrupo, arr);
    }
    const info = new Map<string, string>();
    for (const arr of grupos.values()) {
      if (arr.length < 2) continue;
      const ordenado = [...arr].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      ordenado.forEach((l, i) => info.set(l.id, `${i + 1}/${ordenado.length}`));
    }
    return info;
  }, [itens]);

  // período → [inicio, fim] (null = aberto)
  const [inicio, fim] = useMemo<[Date | null, Date | null]>(() => {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    switch (modo) {
      case "todos": return [null, null];
      case "mes": return [new Date(y, m, 1), new Date(y, m + 1, 0)];
      case "semestre": {
        const s = m < 6 ? 0 : 6;
        return [new Date(y, s, 1), new Date(y, s + 6, 0)];
      }
      case "ano": return [new Date(y, 0, 1), new Date(y, 11, 31)];
      case "custom": return [de ? meioDia(new Date(de)) : null, ate ? meioDia(new Date(ate)) : null];
    }
  }, [modo, ref, de, ate]);

  function situacaoDe(l: LivroCaixaItem): Situacao {
    if (l.status === "cancelado") return "cancelado";
    if (l.status === "aguardando_aprovacao") return "aguardando";
    if (l.status === "confirmado") return l.conciliado ? "conciliado" : "confirmado";
    return venceEm(l.vencimento ?? l.data) === "futuro" ? "agendado" : "pendente";
  }
  function ledgerDate(l: LivroCaixaItem): Date {
    return meioDia(new Date(l.data));
  }
  function signed(l: LivroCaixaItem): number {
    const v = Number(l.valorEfetivo ?? l.valor);
    return l.tipo === "receita" ? v : -v;
  }
  function noPeriodo(l: LivroCaixaItem): boolean {
    const d = ledgerDate(l);
    if (inicio && d < inicio) return false;
    if (fim && d > fim) return false;
    return true;
  }

  // filtros (sem período e sem seleção de conta) p/ saldo e painel
  function passaFiltros(l: LivroCaixaItem): boolean {
    const sit = situacaoDe(l);
    if (situacoes.size > 0) {
      if (!situacoes.has(sit)) return false;
    } else if (sit === "cancelado") {
      return false; // cancelados ocultos por padrão
    }
    if (categoriaId !== NONE && l.categoria?.codigo.split(".")[0] !== categoriaId) return false;
    if (centroId !== NONE && l.centroId !== centroId) return false;
    if (formaId !== NONE && l.formaId !== formaId) return false;
    if (projetoId !== NONE && l.projetoId !== projetoId) return false;
    const v = Math.abs(Number(l.valorEfetivo ?? l.valor));
    if (valorMin && v < Number(valorMin)) return false;
    if (valorMax && v > Number(valorMax)) return false;
    if (busca.trim()) {
      const q = normalize(busca);
      const alvo = normalize(`${l.descricao} ${l.fornecedor?.nome ?? ""} ${l.cliente?.nome ?? ""} ${l.documentoFinanceiro?.numero ?? ""}`);
      if (!alvo.includes(q)) return false;
    }
    return true;
  }
  function naContaSel(l: LivroCaixaItem): boolean {
    if (contasSel.size === contas.length) return true; // todas
    if (!l.contaId) return true; // sem conta entra em qualquer seleção
    return contasSel.has(l.contaId);
  }

  // lista final (período + filtros + conta), ordenada por data
  const lista = useMemo(() => {
    return itens
      .filter((l) => noPeriodo(l) && passaFiltros(l) && naContaSel(l))
      .sort((a, b) => ledgerDate(a).getTime() - ledgerDate(b).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, modo, ref, de, ate, busca, situacoes, categoriaId, centroId, formaId, projetoId, valorMin, valorMax, contasSel]);

  // saldo anterior projetado (das contas selecionadas) antes do início
  const saldoAnterior = useMemo(() => {
    let s = 0;
    for (const c of contas) if (contasSel.has(c.id)) s += c.saldoInicial;
    if (inicio) {
      for (const l of itens) {
        if (l.status === "cancelado") continue;
        if (!naContaSel(l)) continue;
        if (ledgerDate(l) < inicio) s += signed(l);
      }
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, contas, contasSel, inicio]);

  // painel por conta: Confirmado e Projetado (saldo ao fim do período)
  const painelContas = useMemo(() => {
    const conf = new Map<string, number>();
    const proj = new Map<string, number>();
    for (const c of contas) {
      conf.set(c.id, c.saldoInicial);
      proj.set(c.id, c.saldoInicial);
    }
    for (const l of itens) {
      if (!l.contaId || !conf.has(l.contaId)) continue;
      if (l.status === "cancelado") continue;
      if (fim && ledgerDate(l) > fim) continue;
      const s = signed(l);
      proj.set(l.contaId, (proj.get(l.contaId) ?? 0) + s);
      if (l.status === "confirmado") conf.set(l.contaId, (conf.get(l.contaId) ?? 0) + s);
    }
    return contas.map((c) => ({ ...c, confirmado: conf.get(c.id) ?? 0, projetado: proj.get(c.id) ?? 0 }));
  }, [itens, contas, fim]);

  const totalPainel = painelContas.reduce(
    (acc, c) => {
      if (contasSel.has(c.id)) {
        acc.confirmado += c.confirmado;
        acc.projetado += c.projetado;
      }
      return acc;
    },
    { confirmado: 0, projetado: 0 },
  );

  // Resultados do período (Entradas/Saídas com transferências separadas)
  const resultados = useMemo(() => {
    let receitas = 0, transfEnt = 0, despesas = 0, transfSai = 0;
    for (const l of lista) {
      const transf = ehTransferencia(topoDe(l));
      const v = Math.abs(Number(l.valorEfetivo ?? l.valor));
      if (l.tipo === "receita") {
        if (transf) transfEnt += v; else receitas += v;
      } else {
        if (transf) transfSai += v; else despesas += v;
      }
    }
    const entradas = receitas + transfEnt;
    const saidas = despesas + transfSai;
    return { receitas, transfEnt, despesas, transfSai, entradas, saidas, resultado: entradas - saidas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista]);

  // agrupamento
  const grupos = useMemo(() => {
    if (!agruparPor) return null;
    const chave = (l: LivroCaixaItem): string => {
      if (agruparPor === "categoria") return topoDe(l);
      if (agruparPor === "conta") return l.conta?.nome ?? "Sem conta";
      if (agruparPor === "centro") return l.centro?.nome ?? "Sem centro";
      if (agruparPor === "situacao") return SIT_META[situacaoDe(l)].label;
      if (agruparPor === "mes") {
        const d = ledgerDate(l);
        return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      }
      return "";
    };
    const m = new Map<string, LivroCaixaItem[]>();
    for (const l of lista) {
      const k = chave(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.entries()].map(([nome, items]) => ({
      nome,
      items,
      total: items.reduce((s, l) => s + signed(l), 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, agruparPor]);

  function toggleSit(s: Situacao) {
    setSituacoes((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  }
  function toggleConta(id: string) {
    setContasSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSel(id: string) {
    setSelecionados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const limparSel = () => setSelecionados(new Set());

  function cancelar(id: string) {
    start(async () => {
      const r = await cancelarLancamento({ id });
      if (r.ok) { toast.success("Cancelado."); router.refresh(); } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    let senha: string | undefined;
    if (exigeSenhaExclusao) {
      const s = window.prompt("Senha para excluir o lançamento:");
      if (s == null) return;
      senha = s;
    }
    start(async () => {
      const r = await excluirLancamento({ id, senha });
      if (r.ok) { toast.success("Excluído."); router.refresh(); } else toast.error(r.error);
    });
  }

  function exportar(formato: "xlsx" | "csv") {
    const linhas = lista.map((l) => ({
      vencimento: dt(l.data),
      descricao: l.descricao,
      categoria: `${l.categoria?.codigo ?? ""} ${l.categoria?.nome ?? ""}`.trim(),
      contato: l.fornecedor?.nome ?? l.cliente?.nome ?? "",
      conta: l.conta?.nome ?? "",
      centro: l.centro?.nome ?? "",
      situacao: SIT_META[situacaoDe(l)].label,
      valor: signed(l),
    }));
    start(async () => {
      const res = await fetch("/api/financeiro/contas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato, titulo: "Lancamentos-de-caixa", linhas }),
      });
      if (!res.ok) { toast.error("Falha ao exportar."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lancamentos-de-caixa.${formato}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function imprimir() {
    const win = window.open("", "_blank", "width=1000,height=720");
    if (!win) return;
    let saldo = saldoAnterior;
    const linhasHtml = lista
      .map((l) => {
        saldo += signed(l);
        return `<tr><td>${dt(l.data)}</td><td>${l.descricao}</td><td>${l.conta?.nome ?? ""}</td>
          <td style="text-align:right">${brl(signed(l))}</td><td style="text-align:right">${brl(saldo)}</td></tr>`;
      })
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lançamentos de caixa</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f3f3}</style>
      </head><body><h1>Lançamentos de caixa</h1>
      <p>${lista.length} lançamentos · saldo anterior ${brl(saldoAnterior)} · gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <table><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th></tr></thead>
      <tbody>${linhasHtml}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function temFiltro() {
    return modo !== "todos" || !!busca || situacoes.size > 0 || categoriaId !== NONE ||
      centroId !== NONE || formaId !== NONE || projetoId !== NONE || !!valorMin || !!valorMax ||
      contasSel.size !== contas.length;
  }
  function limparFiltros() {
    setModo("todos"); setBusca(""); setSituacoes(new Set()); setCategoriaId(NONE);
    setCentroId(NONE); setFormaId(NONE); setProjetoId(NONE); setValorMin(""); setValorMax("");
    setContasSel(new Set(contas.map((c) => c.id)));
  }

  // categorias top-level p/ filtro
  const categoriasTopo = useMemo(
    () => opcoes.categorias.filter((c) => !c.codigo.includes(".")).map((c) => ({ id: c.codigo, nome: `${c.codigo} ${c.nome}` })),
    [opcoes.categorias],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">Lançamentos de caixa</h2>
        <Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Novo lançamento</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* coluna esquerda */}
        <div className="space-y-4">
          <PeriodoCard modo={modo} setModo={setModo} refData={ref} setRef={setRef} de={de} setDe={setDe} ate={ate} setAte={setAte} />

          <Card>
            <CardContent className="py-4">
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium text-muted-foreground">
                <span>Contas</span><span className="text-right">Confirmado</span><span className="text-right">Projetado</span>
              </div>
              <ul className="space-y-1 text-sm">
                {painelContas.map((c) => (
                  <li key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                    <label className="flex items-center gap-1.5 truncate">
                      <input type="checkbox" checked={contasSel.has(c.id)} onChange={() => toggleConta(c.id)} className="size-3.5" />
                      <span className="truncate">{c.nome}</span>
                    </label>
                    <span className={`text-right font-mono text-xs ${c.confirmado < 0 ? "text-destructive" : ""}`}>{brl(c.confirmado)}</span>
                    <span className={`text-right font-mono text-xs ${c.projetado < 0 ? "text-destructive" : ""}`}>{brl(c.projetado)}</span>
                  </li>
                ))}
                <li className="grid grid-cols-[1fr_auto_auto] gap-2 border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span className={`text-right font-mono text-xs ${totalPainel.confirmado < 0 ? "text-destructive" : ""}`}>{brl(totalPainel.confirmado)}</span>
                  <span className={`text-right font-mono text-xs ${totalPainel.projetado < 0 ? "text-destructive" : ""}`}>{brl(totalPainel.projetado)}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 py-4 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Resultados (R$) · período</p>
              <Linha rotulo="Entradas" valor={resultados.entradas} bold cor="text-success" />
              <Linha rotulo="Receitas" valor={resultados.receitas} sub />
              <Linha rotulo="Transferências" valor={resultados.transfEnt} sub />
              <Linha rotulo="Saídas" valor={-resultados.saidas} bold cor="text-destructive" />
              <Linha rotulo="Despesas" valor={-resultados.despesas} sub />
              <Linha rotulo="Transferências" valor={-resultados.transfSai} sub />
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Resultado</span>
                <span className={`font-mono ${resultados.resultado < 0 ? "text-destructive" : "text-success"}`}>{brl(resultados.resultado)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* coluna direita */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 flex-1">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição, contato, nº doc…" className="pl-8" />
            </div>
            <Button variant="outline" size="sm" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> XLSX</Button>
            <Button variant="outline" size="sm" onClick={() => exportar("csv")}><Download className="size-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={imprimir}><Printer className="size-4" /> PDF</Button>
            <GerarDocumentoButton
              modelos={modelosDoc}
              paramId="mes"
              valor={`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(Object.keys(SIT_META) as Situacao[]).map((s) => (
              <button
                key={s}
                onClick={() => toggleSit(s)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${situacoes.has(s) ? "border-primary bg-primary/10" : "border-border"}`}
              >
                <span className={`size-2 rounded-full ${SIT_META[s].cor}`} /> {SIT_META[s].label}
              </button>
            ))}
            <div className="ml-auto">
              <Select value={agruparPor || NONE} onValueChange={(v) => setAgruparPor(v === NONE ? "" : (v ?? ""))}>
                <SelectTrigger size="sm" className="h-8 w-40"><SelectValue placeholder="Agrupar por" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem agrupamento</SelectItem>
                  <SelectItem value="categoria">Categoria</SelectItem>
                  <SelectItem value="conta">Conta</SelectItem>
                  <SelectItem value="centro">Centro de custo</SelectItem>
                  <SelectItem value="situacao">Situação</SelectItem>
                  <SelectItem value="mes">Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <DimSelect label="Categoria" value={categoriaId} onChange={setCategoriaId} options={categoriasTopo} />
            <DimSelect label="Centro" value={centroId} onChange={setCentroId} options={opcoes.centros} />
            <DimSelect label="Forma" value={formaId} onChange={setFormaId} options={opcoes.formas} />
            <DimSelect label="Projeto" value={projetoId} onChange={setProjetoId} options={opcoes.projetos.map((p) => ({ id: p.id, nome: `${formatarCodigo(p.codigo)} ${p.nome}` }))} />
            <Input value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="Valor mín" type="number" className="h-8 w-24" />
            <Input value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="Valor máx" type="number" className="h-8 w-24" />
            {temFiltro() && <Button variant="ghost" size="sm" onClick={limparFiltros}><X className="size-3.5" /> Limpar</Button>}
          </div>

          {selecionados.size > 0 && (
            <div className="flex items-center justify-between rounded-sm border bg-muted/40 px-3 py-2 text-sm">
              <span>{selecionados.size} selecionado(s)</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={limparSel}>Limpar</Button>
                <Button size="sm" onClick={() => setLoteOpen(true)}><Check className="size-3.5" /> Baixar selecionadas</Button>
              </div>
            </div>
          )}

          {/* lista */}
          <div className="overflow-x-auto rounded-sm border">
            <div style={{ width: totalLargura }}>
              <div className="grid gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: template }}>
                <span />
                {COLUNAS_DEF.map((c) => (
                  <span key={c.key} className={`relative ${c.right ? "text-right" : ""}`}>
                    {c.label}
                    <span
                      onPointerDown={(e) => iniciarResize(c.key, e)}
                      onDoubleClick={() => resetCol(c.key)}
                      title="Arraste para redimensionar · duplo-clique para redefinir"
                      className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize select-none hover:bg-primary/30"
                    />
                  </span>
                ))}
                <span />
              </div>
              <div className="grid items-center gap-2 border-b bg-muted/10 px-3 py-1.5 text-xs" style={{ gridTemplateColumns: template }}>
                <span /><span /><span className="font-medium text-muted-foreground">Saldo anterior</span><span />
                <span /><span className={`text-right font-mono ${saldoAnterior < 0 ? "text-destructive" : "text-success"}`}>{brl(saldoAnterior)}</span><span />
              </div>
              {lista.length === 0 ? (
                <EmptyState icon={Receipt} title="Nenhum lançamento no filtro." />
              ) : grupos ? (
                grupos.map((g) => (
                  <div key={g.nome}>
                    <div className="flex justify-between bg-muted/20 px-3 py-1.5 text-xs font-semibold">
                      <span>{g.nome}</span>
                      <span className={`font-mono ${g.total < 0 ? "text-destructive" : "text-success"}`}>{brl(g.total)}</span>
                    </div>
                    {g.items.map((l) => <LinhaLanc key={l.id} l={l} />)}
                  </div>
                ))
              ) : (
                renderComSaldo()
              )}
            </div>
          </div>
          <p className="text-right text-sm text-muted-foreground">{lista.length} lançamentos</p>
        </div>
      </div>

      <LancamentoForm
        open={formOpen || !!editar}
        editar={editar}
        opcoes={opcoes}
        onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditar(null); } }}
      />
      <ConfirmarDialog lancamento={confirmar} onClose={() => setConfirmar(null)} contas={opcoes.contas} formas={opcoes.formas} />
      <LancamentoDetalheDialog lancamento={detalhe} podeGerir onClose={() => setDetalhe(null)} />
      <LoteDialog
        open={loteOpen} onClose={() => setLoteOpen(false)} ids={[...selecionados]}
        contas={opcoes.contas} formas={opcoes.formas}
        onDone={() => { limparSel(); router.refresh(); }}
      />
    </div>
  );

  function renderComSaldo() {
    let saldo = saldoAnterior;
    return lista.map((l) => {
      saldo += signed(l);
      return <LinhaLanc key={l.id} l={l} saldo={saldo} />;
    });
  }

  function LinhaLanc({ l, saldo }: { l: LivroCaixaItem; saldo?: number }) {
    const sit = situacaoDe(l);
    const par = parcela(l.descricao) ?? parcelaPorId.get(l.id) ?? null;
    const transf = ehTransferencia(topoDe(l));
    const s = signed(l);
    return (
      <div className={`grid items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/20 ${l.status === "cancelado" ? "opacity-50" : ""}`} style={{ gridTemplateColumns: template }}>
        <div className="flex items-center gap-1.5">
          <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} className="size-3.5" />
          <span className={`size-2 shrink-0 rounded-full ${SIT_META[sit].cor}`} title={SIT_META[sit].label} />
        </div>
        <span className="font-mono text-xs">{dt(l.data)}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 truncate font-medium">
            {transf && <ArrowLeftRight className="size-3 shrink-0 text-muted-foreground" />}
            {l.descricao}
            {par && <Badge variant="outline" className="px-1 py-0 text-[10px]">{par}</Badge>}
          </span>
          {l.projeto && <span className="block truncate text-xs text-muted-foreground">{formatarCodigo(l.projeto.codigo)} · {l.projeto.nome}</span>}
          {l.tags.length > 0 && (
            <span className="flex flex-wrap gap-1 pt-0.5">
              {l.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="px-1 py-0 text-[10px] text-muted-foreground">{t}</Badge>
              ))}
            </span>
          )}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {topoDe(l)}{l.conta && ` · ${l.conta.nome}`}
        </span>
        <span className={`text-right font-mono ${l.tipo === "receita" ? "text-success" : ""}`}>
          {s >= 0 ? "+" : ""}{brl(s)}
        </span>
        <span className={`text-right font-mono text-xs ${saldo != null ? (saldo < 0 ? "text-destructive" : "text-muted-foreground") : "text-muted-foreground/40"}`}>
          {saldo != null ? brl(saldo) : "—"}
        </span>
        <span className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Ações"><MoreHorizontal className="size-4" /></Button>} />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetalhe(l)}>
                <Paperclip className="size-4" /> Detalhes{l.anexos.length > 0 ? ` (${l.anexos.length})` : ""}
              </DropdownMenuItem>
              {l.status !== "cancelado" && (
                <DropdownMenuItem onClick={() => setEditar(l)}><Pencil className="size-4" /> Editar</DropdownMenuItem>
              )}
              {l.status === "previsto" && (
                <DropdownMenuItem onClick={() => setConfirmar(l)}><Check className="size-4" /> Confirmar</DropdownMenuItem>
              )}
              {l.status !== "cancelado" && (
                <>
                  <DropdownMenuItem onClick={() => cancelar(l.id)}><Ban className="size-4" /> Cancelar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => excluir(l.id)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    );
  }
}

function Linha({ rotulo, valor, sub, bold, cor }: { rotulo: string; valor: number; sub?: boolean; bold?: boolean; cor?: string }) {
  return (
    <div className={`flex justify-between ${sub ? "pl-3 text-muted-foreground" : ""} ${bold ? "font-medium" : ""}`}>
      <span>{rotulo}</span>
      <span className={`font-mono ${bold && cor ? cor : ""}`}>{brl(valor)}</span>
    </div>
  );
}

function PeriodoCard({
  modo, setModo, refData, setRef, de, setDe, ate, setAte,
}: {
  modo: Modo; setModo: (m: Modo) => void; refData: Date; setRef: (d: Date) => void;
  de: string; setDe: (s: string) => void; ate: string; setAte: (s: string) => void;
}) {
  function desloca(meses: number) {
    const d = new Date(refData);
    d.setMonth(d.getMonth() + meses);
    setRef(meioDia(d));
  }
  const passo = modo === "ano" ? 12 : modo === "semestre" ? 6 : 1;
  const rotulo = (() => {
    const y = refData.getFullYear();
    const m = refData.getMonth();
    if (modo === "mes") return `${MESES[m]} ${y}`;
    if (modo === "semestre") return m < 6 ? `jan - jun ${y}` : `jul - dez ${y}`;
    if (modo === "ano") return `${y}`;
    return "";
  })();
  const temNav = modo === "mes" || modo === "semestre" || modo === "ano";

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        {temNav && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => desloca(-passo)}><ChevronLeft className="size-4" /></Button>
            <span className="text-sm font-medium">{rotulo}</span>
            <Button variant="ghost" size="icon" onClick={() => desloca(passo)}><ChevronRight className="size-4" /></Button>
          </div>
        )}
        <Select value={modo} onValueChange={(v) => setModo((v ?? "todos") as Modo)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo o período</SelectItem>
            <SelectItem value="mes">Por mês</SelectItem>
            <SelectItem value="semestre">Por semestre</SelectItem>
            <SelectItem value="ano">Por ano</SelectItem>
            <SelectItem value="custom">Período personalizado</SelectItem>
          </SelectContent>
        </Select>
        {modo === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DimSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; nome: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger size="sm" className="h-8 w-40"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{label}: todos</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function LoteDialog({
  open, onClose, ids, contas, formas, onDone,
}: {
  open: boolean; onClose: () => void; ids: string[];
  contas: { id: string; nome: string }[]; formas: { id: string; nome: string }[]; onDone: () => void;
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
        onClose(); onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Baixar {ids.length} lançamento(s)</DialogTitle></DialogHeader>
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
          <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={baixar} disabled={pending}>{pending ? "Processando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
