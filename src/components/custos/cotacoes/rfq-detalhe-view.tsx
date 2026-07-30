"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { adicionarAnexoProposta, removerAnexoProposta } from "@/modules/custos/cotacoes/actions";
import { STATUS_RFQ_LABEL, STATUS_RFQ_TONE, STATUS_CONVITE_LABEL, STATUS_PROPOSTA_LABEL, STATUS_PROPOSTA_TONE } from "@/modules/custos/cotacoes/status";
import { ConvidarFornecedoresDialog } from "./convidar-fornecedores-dialog";
import { RegistrarPropostaDialog } from "./registrar-proposta-dialog";
import { EscolherVencedorDialog } from "./escolher-vencedor-dialog";

type ItemRfq = { id: string; descricao: string; quantidade: number; unidade: string; insumoId: string | null };
type Convite = { id: string; fornecedorId: string; fornecedorNome: string; status: string; convidadoEm: Date; respondidoEm: Date | null };
type PropostaItem = { id: string; rfqItemId: string; precoUnitario: number; observacao: string | null };
type Anexo = { id: string; nome: string; mime: string; tamanho: number };
type Proposta = {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  status: string;
  frete: number;
  impostosInclusos: boolean;
  impostosValor: number | null;
  prazoEntregaDias: number | null;
  validadeAte: Date | null;
  condicoesPagamento: string | null;
  observacoes: string | null;
  justificativaEscolha: string | null;
  escolhidoPorNome: string | null;
  escolhidoEm: Date | null;
  criadoPorNome: string;
  createdAt: Date;
  itens: PropostaItem[];
  anexos: Anexo[];
};
type Rfq = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prazoResposta: Date | null;
  orcamentoTitulo: string | null;
  criadoPorNome: string;
  createdAt: Date;
  itens: ItemRfq[];
  convites: Convite[];
  propostas: Proposta[];
};
type ComparacaoLinha = {
  propostaId: string;
  fornecedorNome: string;
  totalComparavel: number;
  itensFaltando: string[];
  prazoEntregaDias: number | null;
  validadeAte: Date | null;
  avaliacaoFornecedor: number | null;
  status: string;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RfqDetalheView({ rfq, comparacao }: { rfq: Rfq; comparacao: ComparacaoLinha[] }) {
  const podeRegistrarProposta = rfq.status === "aberta";
  const fornecedoresComProposta = new Set(rfq.propostas.map((p) => p.fornecedorId));
  const fornecedoresConvidados = rfq.convites
    .filter((c) => !fornecedoresComProposta.has(c.fornecedorId))
    .map((c) => ({ id: c.fornecedorId, nome: c.fornecedorNome }));
  const itensParaDialog = rfq.itens.map((i) => ({ id: i.id, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">{rfq.titulo}</h2>
            <StatusBadge tone={STATUS_RFQ_TONE[rfq.status] ?? "neutral"}>{STATUS_RFQ_LABEL[rfq.status] ?? rfq.status}</StatusBadge>
          </div>
          {rfq.descricao && <p className="text-sm text-muted-foreground">{rfq.descricao}</p>}
          <p className="text-xs text-muted-foreground">
            {rfq.orcamentoTitulo ? `Obra: ${rfq.orcamentoTitulo} · ` : "Compra avulsa · "}
            Criada por {rfq.criadoPorNome} em {formatarData(rfq.createdAt)}
            {rfq.prazoResposta && <> · Prazo de resposta: {formatarData(rfq.prazoResposta)}</>}
          </p>
        </div>
        <Button variant="outline" render={<Link href="/custos/cotacoes" />}>
          Voltar
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Itens a cotar</h3>
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Unidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfq.itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.descricao}</TableCell>
                  <TableCell className="text-right font-mono">{i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                  <TableCell>{i.unidade}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Fornecedores convidados</h3>
          {rfq.status !== "encerrada" && rfq.status !== "cancelada" && <ConvidarFornecedoresDialog rfqId={rfq.id} />}
        </div>
        {rfq.convites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fornecedor convidado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rfq.convites.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs">
                {c.fornecedorNome}
                <span className="text-muted-foreground">— {STATUS_CONVITE_LABEL[c.status] ?? c.status}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {comparacao.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Comparação (ordenado por total comparável)</h3>
          <div className="rounded-sm border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Total comparável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead>Itens faltando</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparacao.map((c, i) => (
                  <TableRow key={c.propostaId}>
                    <TableCell className="font-mono text-xs">{i + 1}º</TableCell>
                    <TableCell className="font-medium">{c.fornecedorNome}</TableCell>
                    <TableCell className="text-right font-mono">{brl(c.totalComparavel)}</TableCell>
                    <TableCell>{c.prazoEntregaDias != null ? `${c.prazoEntregaDias}d` : "—"}</TableCell>
                    <TableCell>{c.validadeAte ? formatarData(c.validadeAte) : "—"}</TableCell>
                    <TableCell>{c.avaliacaoFornecedor != null ? `${c.avaliacaoFornecedor.toFixed(1)}/5` : "—"}</TableCell>
                    <TableCell className={c.itensFaltando.length > 0 ? "text-warning" : "text-muted-foreground"}>
                      {c.itensFaltando.length > 0 ? `${c.itensFaltando.length} item(ns)` : "completa"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS_PROPOSTA_TONE[c.status] ?? "neutral"}>{STATUS_PROPOSTA_LABEL[c.status] ?? c.status}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Propostas registradas</h3>
          {podeRegistrarProposta && fornecedoresConvidados.length > 0 && (
            <RegistrarPropostaDialog rfqId={rfq.id} itens={itensParaDialog} fornecedores={fornecedoresConvidados} />
          )}
        </div>
        {rfq.propostas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta registrada ainda.</p>
        ) : (
          <ul className="divide-y rounded-sm border">
            {rfq.propostas.map((p) => (
              <PropostaRow key={p.id} proposta={p} itensRfq={rfq.itens} podeEscolher={p.status === "recebida" && rfq.status === "aberta"} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PropostaRow({ proposta: p, itensRfq, podeEscolher }: { proposta: Proposta; itensRfq: ItemRfq[]; podeEscolher: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const descricaoPorItem = new Map(itensRfq.map((i) => [i.id, i.descricao]));
  const quantidadePorItem = new Map(itensRfq.map((i) => [i.id, i.quantidade]));

  // Preço unitário × quantidade — nunca a soma crua dos preços unitários (mistura unidades/quantidades
  // diferentes e não bate com o `totalComparavel` da tabela de comparação, que já faz essa conta certo).
  const totalItens = p.itens.reduce((soma, it) => soma + it.precoUnitario * (quantidadePorItem.get(it.rfqItemId) ?? 0), 0);

  async function enviarAnexo() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/custos/cotacoes/anexo", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarAnexoProposta({ propostaId: p.id, meta });
      if (r.ok) {
        toast.success("Anexo enviado.");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }
  function removerAnexo(id: string) {
    start(async () => {
      const r = await removerAnexoProposta({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className="p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setAberto(!aberto)}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
            {p.fornecedorNome}
            <StatusBadge tone={STATUS_PROPOSTA_TONE[p.status] ?? "neutral"}>{STATUS_PROPOSTA_LABEL[p.status] ?? p.status}</StatusBadge>
          </p>
          <p className="pl-5 text-xs text-muted-foreground">
            {p.itens.length} item(ns) cotado(s) · soma dos itens: {brl(totalItens)} · registrado por {p.criadoPorNome} em{" "}
            {formatarDataHora(p.createdAt)}
          </p>
        </button>
        {podeEscolher && <EscolherVencedorDialog propostaId={p.id} fornecedorNome={p.fornecedorNome} />}
      </div>

      {aberto && (
        <div className="mt-2 space-y-3 border-t pt-2">
          <div className="rounded-sm border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço unitário</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.itens.map((it) => {
                  const qtd = quantidadePorItem.get(it.rfqItemId) ?? 0;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{descricaoPorItem.get(it.rfqItemId) ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{brl(it.precoUnitario)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{brl(it.precoUnitario * qtd)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Frete: {brl(p.frete)}</span>
            <span>Impostos: {p.impostosInclusos ? "inclusos no preço" : `não inclusos${p.impostosValor != null ? ` (${brl(p.impostosValor)})` : ""}`}</span>
            {p.prazoEntregaDias != null && <span>Prazo: {p.prazoEntregaDias}d</span>}
            {p.validadeAte && <span>Validade: {formatarData(p.validadeAte)}</span>}
            {p.condicoesPagamento && <span>Pagamento: {p.condicoesPagamento}</span>}
          </p>
          {p.observacoes && <p className="text-xs text-muted-foreground">Obs.: {p.observacoes}</p>}
          {p.status === "vencedora" && p.justificativaEscolha && (
            <p className="rounded-sm border border-success/30 bg-success/5 p-2 text-xs">
              Escolhida por {p.escolhidoPorNome} em {p.escolhidoEm ? formatarData(p.escolhidoEm) : ""}: {p.justificativaEscolha}
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Anexos</p>
            {p.anexos.length > 0 && (
              <ul className="divide-y text-xs">
                {p.anexos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-1">
                    <a href={`/api/custos/cotacoes/anexo/${a.id}`} className="flex items-center gap-1 hover:underline">
                      <Paperclip className="size-3" /> {a.nome}
                    </a>
                    <button onClick={() => removerAnexo(a.id)} disabled={pending} aria-label="Remover anexo" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="text-xs" />
              <Button size="sm" variant="outline" onClick={enviarAnexo} disabled={enviando}>
                {enviando ? "Enviando…" : "Anexar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
