"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Receipt, Trash2 } from "lucide-react";
import {
  definirCondicaoPagamento,
  faturarParcelaEntrega,
  salvarCobrancaPorEntrega,
} from "@/modules/juridico/actions";
import { valoresDasParcelas } from "@/modules/juridico/contrato/parcelas-entrega";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NA_ASSINATURA = "__assinatura";
/** Parcela cujo marco foi apagado: fica sem data até alguém escolher de novo. */
const SEM_MARCO = "__sem_marco";

export type ParcelaEntregaTela = {
  id: string;
  descricao: string;
  percentual: number;
  naAssinatura: boolean;
  marcoId: string | null;
  /** Linha no financeiro: `previsao` (projeção do cronograma), `previsto` (faturada), `confirmado` (recebida). */
  lancamento: { status: string; valor: number; vencimento: string | null } | null;
};

export type CobrancaContrato = {
  id: string;
  valor: number | null;
  statusContrato: string | null;
  formaCobranca: "por_data" | "por_entrega";
  parcelas: number | null;
  primeiroVencimento: string | null;
  parcelasEntrega: ParcelaEntregaTela[];
  /** Marcos da EAP do projeto do contrato (vazio sem projeto ou sem cronograma). */
  marcos: { id: string; nome: string }[];
  /** Plano de pagamento da proposta de origem, para trazer de lá. */
  planoProposta: { descricao: string; percentual: number }[];
  temProjeto: boolean;
};

type Linha = { chave: string; id?: string; descricao: string; percentual: string; marcoId: string };

const paraLinha = (p: ParcelaEntregaTela): Linha => ({
  chave: p.id,
  id: p.id,
  descricao: p.descricao,
  percentual: String(p.percentual),
  marcoId: p.naAssinatura ? NA_ASSINATURA : (p.marcoId ?? SEM_MARCO),
});

/** Situação da parcela no financeiro, em palavras. */
function situacao(l: ParcelaEntregaTela["lancamento"]): { texto: string; tom: string } {
  if (!l) return { texto: "sem previsão", tom: "text-muted-foreground" };
  const venc = l.vencimento ? formatarData(l.vencimento) : "—";
  if (l.status === "previsao") return { texto: `previsão ${venc}`, tom: "text-muted-foreground" };
  if (l.status === "previsto") return { texto: `faturada · vence ${venc}`, tom: "text-warning" };
  if (l.status === "confirmado") return { texto: "recebida", tom: "text-success" };
  if (l.status === "cancelado") return { texto: "cobrança cancelada", tom: "text-destructive" };
  return { texto: l.status, tom: "text-muted-foreground" };
}

/**
 * Condição de pagamento do contrato de cliente (Fase G + F7.3 — D15): POR DATA (parcelas mensais
 * a partir do 1º vencimento, geradas na assinatura) ou POR ENTREGA (percentuais ligados a marcos
 * da EAP). Nunca os dois.
 *
 * Por entrega, cada parcela ainda não faturada é uma PREVISÃO no fluxo de caixa, com a data do
 * marco (cronograma aprovado) — e o financeiro a FATURA daqui quando a entrega acontece.
 */
export function CondicaoPagamento({ doc, podeFaturar }: { doc: CobrancaContrato; podeFaturar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"por_data" | "por_entrega">(doc.formaCobranca);
  const [form, setForm] = useState({ parcelas: "", primeiroVencimento: "" });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [faturando, setFaturando] = useState<{ parcelaId: string; vencimento: string } | null>(null);

  const algumaFaturada = doc.parcelasEntrega.some((p) => p.lancamento && p.lancamento.status !== "previsao");
  const assinado = doc.statusContrato === "assinado" || doc.statusContrato === "vencido";

  function abrir() {
    setModo(doc.formaCobranca);
    setForm({
      parcelas: doc.parcelas != null ? String(doc.parcelas) : "",
      primeiroVencimento: doc.primeiroVencimento ? doc.primeiroVencimento.slice(0, 10) : "",
    });
    setLinhas(doc.parcelasEntrega.map(paraLinha));
    setFaturando(null);
    setAberto(true);
  }

  // Valores pela MESMA regra da previsão e do faturamento — o que a tela mostra é o que será cobrado.
  const numeros = linhas.map((l) => ({ descricao: l.descricao || "—", percentual: Number(l.percentual.replace(",", ".")) }));
  const calculo = valoresDasParcelas(doc.valor, numeros);

  function salvarPorData() {
    const n = form.parcelas ? Number(form.parcelas) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1)) return toast.error("Número de parcelas inválido.");
    if (n !== null && !form.primeiroVencimento) return toast.error("Informe o vencimento da primeira parcela.");
    start(async () => {
      const r = await definirCondicaoPagamento({ id: doc.id, parcelas: n, primeiroVencimento: form.primeiroVencimento });
      if (r.ok) {
        toast.success("Condição de pagamento salva.");
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvarPorEntrega() {
    for (const l of numeros) {
      if (!Number.isFinite(l.percentual) || l.percentual <= 0) return toast.error("Cada parcela precisa de um percentual maior que 0%.");
    }
    if (linhas.some((l) => !l.descricao.trim())) return toast.error("Descreva cada parcela (ex.: Entrega do projeto básico).");
    if (linhas.some((l) => l.marcoId === SEM_MARCO)) {
      return toast.error('Há parcela cujo marco foi apagado — escolha outro marco ou "Na assinatura".');
    }
    start(async () => {
      const r = await salvarCobrancaPorEntrega({
        id: doc.id,
        parcelas: linhas.map((l, i) => ({
          id: l.id,
          descricao: l.descricao.trim(),
          percentual: numeros[i].percentual,
          marcoId: l.marcoId === NA_ASSINATURA ? null : l.marcoId,
        })),
      });
      if (r.ok) {
        toast.success(calculo.ok ? "Plano por entrega salvo." : `Plano salvo como rascunho: ${calculo.motivo}`);
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function faturar() {
    if (!faturando) return;
    if (!faturando.vencimento) return toast.error("Informe o vencimento da cobrança.");
    start(async () => {
      const r = await faturarParcelaEntrega({ parcelaId: faturando.parcelaId, vencimento: faturando.vencimento });
      if (r.ok) {
        toast.success(`Parcela faturada: ${brl(r.data.valor)} a receber.`);
        setFaturando(null);
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const editavel = !algumaFaturada;
  const trazerDaProposta = () =>
    setLinhas(
      doc.planoProposta.map((p, i) => ({
        chave: `novo-${i}-${Date.now()}`,
        descricao: p.descricao,
        percentual: String(p.percentual),
        marcoId: NA_ASSINATURA,
      })),
    );

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}>
        <Receipt className="size-3.5" /> Pagamento
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Condição de pagamento</DialogTitle>
            <DialogDescription>
              Valor do contrato: {doc.valor != null ? brl(doc.valor) : "não definido"}. Um jeito só por contrato.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="inline-flex rounded-sm border p-0.5 text-xs" role="radiogroup" aria-label="Forma de cobrança">
              {(["por_data", "por_entrega"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modo === m}
                  onClick={() => setModo(m)}
                  className={`rounded-sm px-3 py-1 ${modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {m === "por_data" ? "Por data" : "Por entrega (marcos)"}
                </button>
              ))}
            </div>

            {modo === "por_data" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Parcelas</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.parcelas}
                      onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>1º vencimento</Label>
                    <Input
                      type="date"
                      value={form.primeiroVencimento}
                      onChange={(e) => setForm({ ...form, primeiroVencimento: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  As parcelas são criadas no financeiro quando o contrato for <strong>assinado</strong> — não agora.
                </p>
              </>
            ) : (
              <>
                {!doc.temProjeto && (
                  <p className="rounded-sm border border-dashed px-3 py-2 text-xs text-warning">
                    Contrato sem projeto: só dá para cobrar &ldquo;na assinatura&rdquo;. Ligue um projeto para usar os marcos
                    do cronograma.
                  </p>
                )}
                {linhas.length === 0 ? (
                  <p className="rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Nenhuma parcela. Adicione abaixo{doc.planoProposta.length > 0 ? " ou traga o plano da proposta" : ""}.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-sm border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5">Parcela</th>
                          <th className="px-2 py-1.5">%</th>
                          <th className="px-2 py-1.5">Quando</th>
                          <th className="px-2 py-1.5 text-right">Valor</th>
                          <th className="px-2 py-1.5">Situação</th>
                          <th className="px-2 py-1.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {linhas.map((l, i) => {
                          const salva = l.id ? doc.parcelasEntrega.find((p) => p.id === l.id) : undefined;
                          const s = situacao(salva?.lancamento ?? null);
                          const faturavel =
                            podeFaturar &&
                            assinado &&
                            salva != null &&
                            (salva.lancamento == null || salva.lancamento.status === "previsao" || salva.lancamento.status === "cancelado");
                          return (
                            <tr key={l.chave}>
                              <td className="px-2 py-1.5">
                                <Input
                                  value={l.descricao}
                                  disabled={!editavel || pending}
                                  onChange={(e) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, descricao: e.target.value } : x)))}
                                  className="h-8 text-xs"
                                  aria-label="Descrição da parcela"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={l.percentual}
                                  disabled={!editavel || pending}
                                  onChange={(e) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, percentual: e.target.value } : x)))}
                                  className="h-8 w-20 text-xs"
                                  aria-label="Percentual"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Select
                                  value={l.marcoId}
                                  disabled={!editavel || pending}
                                  onValueChange={(v) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, marcoId: v ?? NA_ASSINATURA } : x)))}
                                >
                                  <SelectTrigger className="h-8 w-44 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {l.marcoId === SEM_MARCO && (
                                      <SelectItem value={SEM_MARCO} className="text-xs text-warning">
                                        Marco apagado — escolha
                                      </SelectItem>
                                    )}
                                    <SelectItem value={NA_ASSINATURA} className="text-xs">
                                      Na assinatura
                                    </SelectItem>
                                    {doc.marcos.map((m) => (
                                      <SelectItem key={m.id} value={m.id} className="text-xs">
                                        {m.nome}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs">
                                {calculo.ok ? brl(calculo.valores[i]) : "—"}
                              </td>
                              <td className={`whitespace-nowrap px-2 py-1.5 text-xs ${s.tom}`}>{s.texto}</td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right">
                                {faturavel && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={pending}
                                    onClick={() =>
                                      setFaturando({
                                        parcelaId: salva.id,
                                        vencimento: salva.lancamento?.vencimento?.slice(0, 10) ?? new Date().toLocaleDateString("en-CA"),
                                      })
                                    }
                                  >
                                    Faturar
                                  </Button>
                                )}
                                {editavel && (
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="Remover parcela"
                                    disabled={pending}
                                    onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {faturando && (
                  <div className="flex flex-wrap items-end gap-2 rounded-sm border border-primary/40 bg-primary/5 p-2">
                    <div className="space-y-1">
                      <Label htmlFor="venc-fatura" className="text-xs">
                        Vencimento da cobrança
                      </Label>
                      <Input
                        id="venc-fatura"
                        type="date"
                        value={faturando.vencimento}
                        onChange={(e) => setFaturando((f) => (f ? { ...f, vencimento: e.target.value } : f))}
                        className="h-8 w-40 text-xs"
                      />
                    </div>
                    <Button size="sm" onClick={faturar} disabled={pending}>
                      Confirmar faturamento
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setFaturando(null)} disabled={pending}>
                      Cancelar
                    </Button>
                    <p className="w-full text-[11px] text-muted-foreground">
                      A previsão vira conta a receber — entra em Contas a receber, no aging e no alerta de inadimplência.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex gap-1.5">
                    {editavel && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setLinhas((ls) => [
                            ...ls,
                            { chave: `novo-${Date.now()}`, descricao: "", percentual: "", marcoId: NA_ASSINATURA },
                          ])
                        }
                      >
                        <Plus className="size-3.5" /> Parcela
                      </Button>
                    )}
                    {editavel && linhas.length === 0 && doc.planoProposta.length > 0 && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={trazerDaProposta}>
                        Trazer da proposta
                      </Button>
                    )}
                  </div>
                  {linhas.length > 0 && (
                    <span className={calculo.ok ? "text-success" : "text-warning"}>
                      {calculo.ok ? "Soma 100%" : calculo.motivo}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {algumaFaturada
                    ? "Há parcela faturada: o plano está travado. Ajustes vão pelo financeiro."
                    : "Assinado o contrato, cada parcela vira uma previsão no fluxo de caixa — a da assinatura na data dela, as de marco na data do marco, com o cronograma aprovado. Faturar transforma a previsão em conta a receber."}
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            {modo === "por_data" ? (
              <Button onClick={salvarPorData} disabled={pending}>
                Salvar
              </Button>
            ) : (
              editavel && (
                <Button onClick={salvarPorEntrega} disabled={pending}>
                  Salvar plano
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
