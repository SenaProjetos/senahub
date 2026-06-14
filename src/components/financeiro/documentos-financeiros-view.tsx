"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Download, ListPlus, FileText } from "lucide-react";
import {
  criarDocumentoFinanceiro,
  excluirDocumentoFinanceiro,
  gerarParcelasDoDocumento,
} from "@/modules/financeiro/documentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TIPOS = [
  { v: "nf_entrada", l: "NF de entrada" },
  { v: "nf_servico", l: "NF de serviço" },
  { v: "contrato", l: "Contrato" },
  { v: "proposta", l: "Proposta" },
  { v: "medicao", l: "Medição" },
] as const;
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.v, t.l]));

type Doc = {
  id: string;
  tipo: string;
  numero: string | null;
  dataEmissao: string | null;
  valorDocumento: number | null;
  fornecedor: string | null;
  cliente: string | null;
  observacao: string | null;
  arquivoNome: string | null;
  temArquivo: boolean;
  lancamentos: number;
  totalVinculado: number;
};
type Opcoes = {
  fornecedores: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  categorias: { id: string; codigo: string; nome: string; tipo: string }[];
  contas: { id: string; nome: string }[];
  propostas: { id: string; label: string }[];
  medicoes: { id: string; label: string }[];
};

export function DocumentosFinanceirosView({
  docs,
  opcoes,
  podeGerir,
}: {
  docs: Doc[];
  opcoes: Opcoes;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    tipo: "nf_entrada",
    numero: "",
    dataEmissao: "",
    valor: "",
    fornecedorId: NONE,
    clienteId: NONE,
    referenciaId: NONE,
    observacao: "",
  });

  const ehReferencia = form.tipo === "proposta" || form.tipo === "medicao";
  const refs = form.tipo === "proposta" ? opcoes.propostas : form.tipo === "medicao" ? opcoes.medicoes : [];

  // Parcelas
  const [parcelasDoc, setParcelasDoc] = useState<Doc | null>(null);
  const [pf, setPf] = useState({ tipoLancamento: "despesa", categoriaId: NONE, contaId: NONE, parcelas: "1", primeiroVencimento: "", valorTotal: "", descricao: "" });

  async function salvarNovo() {
    setBusy(true);
    try {
      let meta: { caminho: string; nomeArquivo: string; mime: string } | undefined;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/financeiro/documentos", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Falha no upload.");
        meta = j;
      }
      const r = await criarDocumentoFinanceiro({
        tipo: form.tipo as "nf_entrada" | "nf_servico" | "contrato" | "proposta" | "medicao",
        numero: form.numero,
        dataEmissao: form.dataEmissao,
        valorDocumento: form.valor ? Number(form.valor) : undefined,
        fornecedorId: form.fornecedorId === NONE ? "" : form.fornecedorId,
        clienteId: form.clienteId === NONE ? "" : form.clienteId,
        referenciaId: form.referenciaId === NONE ? "" : form.referenciaId,
        observacao: form.observacao,
        meta,
      });
      if (r.ok) {
        toast.success("Documento criado.");
        setNovo(false);
        setForm({ tipo: "nf_entrada", numero: "", dataEmissao: "", valor: "", fornecedorId: NONE, clienteId: NONE, referenciaId: NONE, observacao: "" });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function abrirParcelas(d: Doc) {
    setPf({
      tipoLancamento: d.tipo === "nf_entrada" || d.tipo === "nf_servico" || d.tipo === "contrato" ? "despesa" : "receita",
      categoriaId: NONE,
      contaId: NONE,
      parcelas: "1",
      primeiroVencimento: d.dataEmissao ?? "",
      valorTotal: d.valorDocumento != null ? String(d.valorDocumento) : "",
      descricao: "",
    });
    setParcelasDoc(d);
  }

  function gerarParcelas() {
    if (!parcelasDoc || pf.categoriaId === NONE || !pf.primeiroVencimento || !pf.valorTotal) {
      toast.error("Categoria, vencimento e valor são obrigatórios.");
      return;
    }
    start(async () => {
      const r = await gerarParcelasDoDocumento({
        documentoId: parcelasDoc.id,
        tipoLancamento: pf.tipoLancamento as "receita" | "despesa",
        categoriaId: pf.categoriaId,
        contaId: pf.contaId === NONE ? "" : pf.contaId,
        parcelas: Number(pf.parcelas) || 1,
        primeiroVencimento: pf.primeiroVencimento,
        valorTotal: Number(pf.valorTotal),
        descricao: pf.descricao,
      });
      if (r.ok) {
        toast.success(`${r.data.criados} lançamento(s) gerado(s).`);
        setParcelasDoc(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirDocumentoFinanceiro({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const catsFiltradas = opcoes.categorias.filter((c) => c.tipo === pf.tipoLancamento);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Documentos financeiros</h2>
          <p className="text-sm text-muted-foreground">
            NF, contratos, propostas e medições como origem das movimentações. Gere parcelas vinculadas.
          </p>
        </div>
        {podeGerir && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="size-3.5" /> Documento
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum documento financeiro.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Tipo / Número</th>
                  <th className="px-4 py-2">Emissão</th>
                  <th className="px-4 py-2">Origem</th>
                  <th className="px-4 py-2 text-right">Valor doc.</th>
                  <th className="px-4 py-2 text-right">Lançamentos</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <Badge variant="outline">{TIPO_LABEL[d.tipo] ?? d.tipo}</Badge>
                      {d.numero && <span className="ml-2 font-mono text-xs">{d.numero}</span>}
                      {d.temArquivo && <FileText className="ml-1 inline size-3 text-muted-foreground" />}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {d.dataEmissao ? new Date(d.dataEmissao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{d.fornecedor ?? d.cliente ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{d.valorDocumento != null ? brl(d.valorDocumento) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {d.lancamentos > 0 ? `${d.lancamentos} · ${brl(d.totalVinculado)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {d.temArquivo && (
                        <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/financeiro/documentos/${d.id}/download`} />}>
                          <Download className="size-3.5" />
                        </Button>
                      )}
                      {podeGerir && (
                        <>
                          <Button size="icon" variant="ghost" aria-label="Gerar parcelas" onClick={() => abrirParcelas(d)}>
                            <ListPlus className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Excluir" disabled={pending} onClick={() => excluir(d.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Novo documento */}
      <Dialog open={novo} onOpenChange={(o) => !o && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo documento financeiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v ?? "nf_entrada", referenciaId: NONE })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
              </div>
            </div>

            {ehReferencia && (
              <div className="space-y-1.5">
                <Label>{form.tipo === "proposta" ? "Proposta" : "Medição"} de origem</Label>
                <Select value={form.referenciaId} onValueChange={(v) => setForm({ ...form, referenciaId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {refs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Emissão</Label>
                <Input type="date" value={form.dataEmissao} onChange={(e) => setForm({ ...form, dataEmissao: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={form.fornecedorId} onValueChange={(v) => setForm({ ...form, fornecedorId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={form.clienteId} onValueChange={(v) => setForm({ ...form, clienteId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Arquivo (opcional)</Label>
              <Input ref={fileRef} type="file" />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerar parcelas */}
      <Dialog open={!!parcelasDoc} onOpenChange={(o) => !o && setParcelasDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar parcelas (lançamentos)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={pf.tipoLancamento} onValueChange={(v) => setPf({ ...pf, tipoLancamento: v ?? "despesa", categoriaId: NONE })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="despesa">Despesa</SelectItem>
                    <SelectItem value="receita">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={pf.categoriaId} onValueChange={(v) => setPf({ ...pf, categoriaId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {catsFiltradas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.codigo} · {c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input type="number" min="1" max="120" value={pf.parcelas} onChange={(e) => setPf({ ...pf, parcelas: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>1º vencimento</Label>
                <Input type="date" value={pf.primeiroVencimento} onChange={(e) => setPf({ ...pf, primeiroVencimento: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor total (R$)</Label>
                <Input type="number" step="0.01" value={pf.valorTotal} onChange={(e) => setPf({ ...pf, valorTotal: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Conta (opcional)</Label>
                <Select value={pf.contaId} onValueChange={(v) => setPf({ ...pf, contaId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input value={pf.descricao} onChange={(e) => setPf({ ...pf, descricao: e.target.value })} placeholder="Usa o documento se vazio" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParcelasDoc(null)}>Cancelar</Button>
            <Button onClick={gerarParcelas} disabled={pending}>{pending ? "Gerando…" : "Gerar lançamentos"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
