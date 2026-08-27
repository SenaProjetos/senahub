"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Copy,
  Send,
  Check,
  X,
  Link2,
  Plus,
  Trash2,
  Eye,
  ListChecks,
  MessageSquareText,
} from "lucide-react";
import {
  salvarProposta,
  copiarProposta,
  mudarStatusProposta,
  aceitarProposta,
  enviarPropostaEmail,
} from "@/modules/comercial/actions";
import { STATUS_PROPOSTA_TONE } from "./propostas-view";
import { STATUS_PROPOSTA_LABEL } from "@/modules/comercial/labels";
import { MotivoRecusaPropostaDialog } from "./motivo-recusa-proposta-dialog";
import type { MotivoPerdaOpcao } from "@/modules/comercial/queries";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AplicarTabelaDialog,
  type TabelaPrecoParaEditor,
} from "@/components/comercial/aplicar-tabela-dialog";
import { itensPersistiveis, totalItens, type ItemProposta } from "@/modules/comercial/honorarios";
import { calcularValoresVersao, percentualDesconto } from "@/modules/comercial/versoes";
import { brl } from "@/lib/utils";

type Item = ItemProposta;
type Condicao = { descricao: string; tipo: "percentual" | "valor"; valor: number };
type Tabela = TabelaPrecoParaEditor;

type Proposta = {
  id: string;
  numero: string;
  titulo: string;
  status: string;
  cliente: string;
  areaM2: number | null;
  validade: string;
  observacoes: string;
  token: string;
  projetoId: string | null;
  visualizacoes: string[];
  versoes: { numero: number; autor: string; data: string }[];
  itens: Item[];
  condicoes: Condicao[];
};

export function PropostaEditor({
  proposta,
  catalogo,
  tabelas,
  podeGerir,
  baseUrl,
  modelosDoc,
  descontoMaxSemJustificativa,
  motivosPerda,
}: {
  proposta: Proposta;
  catalogo: string[];
  tabelas: Tabela[];
  podeGerir: boolean;
  baseUrl: string;
  modelosDoc: { id: string; nome: string }[];
  descontoMaxSemJustificativa: number;
  motivosPerda: MotivoPerdaOpcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState(proposta.titulo);
  const [areaM2, setAreaM2] = useState(proposta.areaM2 != null ? String(proposta.areaM2) : "");
  const [validade, setValidade] = useState(proposta.validade);
  const [observacoes, setObservacoes] = useState(proposta.observacoes);
  const [itens, setItens] = useState<Item[]>(proposta.itens);
  const [condicoes, setCondicoes] = useState<Condicao[]>(proposta.condicoes);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [justificativaDesconto, setJustificativaDesconto] = useState("");
  const [recusando, setRecusando] = useState(false);

  const aceita = proposta.status === "aceita";
  const editavel = podeGerir && !aceita;
  const linkPublico = `${baseUrl}/a/proposta/${proposta.token}`;

  // Uma lista só para exibir o total E para enviar no salvar — é o que garante o critério da
  // F1.22 ("total na tela = total no PDF"). `itensPersistiveis` derruba a linha sem disciplina
  // (que a action descartaria) e quantiza o valor na precisão do banco (Decimal(14,2)); sem isso,
  // um valor digitado com 3 casas somaria na tela de um jeito e seria gravado de outro.
  const paraSalvar = itensPersistiveis(itens);
  const total = totalItens(paraSalvar);

  // F5.8 (Q6/ADR-19) — mesma conta pura do backend, aqui só pra avisar ANTES do clique em
  // salvar; quem decide de verdade é `salvarProposta` (o limite é `ConfigSistema`, pode mudar
  // sem redeploy, então a checagem no servidor é a que vale).
  const descontoNum = desconto;
  const valoresPreview = calcularValoresVersao(paraSalvar, descontoNum);
  const percentualPreview = percentualDesconto(valoresPreview);
  const exigeJustificativa =
    percentualPreview !== null && percentualPreview > descontoMaxSemJustificativa;

  function addItem() {
    const usadas = new Set(itens.map((i) => i.disciplina));
    const prox = catalogo.find((c) => !usadas.has(c)) ?? catalogo[0] ?? "";
    setItens((arr) => [...arr, { disciplina: prox, descricao: "", valor: 0 }]);
  }

  /**
   * Resultado do preenchimento pela tabela (F1.22). O cálculo e a escolha das disciplinas moram
   * no diálogo + em `honorarios.ts`; aqui só entra o estado novo.
   *
   * A comparação por NOME que antes vivia neste arquivo saiu: as disciplinas agora vêm da própria
   * linha da tabela, então o item nasce com o preço da linha que o originou, sem casamento algum.
   * Reprecificar um item já existente ainda casa por nome — mas as duas pontas passaram a resolver
   * o nome pelo mesmo catálogo (`listarTabelasPreco`), o que fecha o caso "Lógica"→"Cabeamento"
   * que a F1.20 deixou anotado. Resta o item antigo cuja grafia não existe no catálogo: aí não há
   * FK dos dois lados, e é exatamente o que a F1.21 vai consolidar.
   */
  function preenchido(novos: Item[], resumo: { adicionados: number; reprecificados: number }) {
    setItens(novos);
    const partes = [];
    if (resumo.adicionados) partes.push(`${resumo.adicionados} item(ns) adicionado(s)`);
    if (resumo.reprecificados) partes.push(`${resumo.reprecificados} reprecificado(s)`);
    toast.success(`${partes.join(", ") || "Nada a preencher"} — ${areaM2} m².`);
  }

  function salvar() {
    if (exigeJustificativa && !justificativaDesconto.trim()) {
      toast.error(
        `Desconto de ${percentualPreview!.toFixed(1)}% acima do limite de ${descontoMaxSemJustificativa}% exige justificativa.`,
      );
      return;
    }
    start(async () => {
      const r = await salvarProposta({
        id: proposta.id,
        titulo,
        areaM2: areaM2 ? Number(areaM2) : undefined,
        validade,
        observacoes,
        itens: paraSalvar,
        condicoes: condicoes.filter((c) => c.descricao),
        desconto: descontoNum ?? undefined,
        justificativaDesconto: justificativaDesconto.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Proposta salva (nova versão).");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function copiar() {
    start(async () => {
      const r = await copiarProposta({ id: proposta.id });
      if (r.ok) {
        toast.success(`Cópia criada: ${r.data.numero}.`);
        router.push(`/comercial/propostas/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  function status(
    s: "enviada" | "em_negociacao" | "recusada" | "rascunho",
    motivo?: { motivoPerdaId: string; concorrente: string; observacaoRecusa: string },
  ) {
    start(async () => {
      const r = await mudarStatusProposta({ id: proposta.id, status: s, ...motivo });
      if (r.ok) {
        toast.success("Status atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aceitar() {
    start(async () => {
      const r = await aceitarProposta({ id: proposta.id });
      if (r.ok) {
        toast.success(`Projeto ${r.data.codigo} criado com canais de chat.`);
        router.push(`/projetos/${r.data.projetoId}`);
      } else toast.error(r.error);
    });
  }

  function email() {
    start(async () => {
      const r = await enviarPropostaEmail({ id: proposta.id });
      if (r.ok) {
        toast.success("Proposta enviada por e-mail.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(linkPublico);
    toast.success("Link copiado.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial/propostas" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{proposta.numero}</span>
            <h2 className="truncate text-xl font-extrabold tracking-tight">{titulo}</h2>
            <StatusBadge tone={STATUS_PROPOSTA_TONE[proposta.status] ?? "neutral"}>
              {/* `proposta.status` chega como `string` solto (prop do Server Component) — o
                  cast é local, só aqui; `STATUS_PROPOSTA_LABEL` continua estrito para quem
                  já tem o enum de verdade. O `??` cobre um valor fora do enum sem quebrar a tela. */}
              {STATUS_PROPOSTA_LABEL[proposta.status as keyof typeof STATUS_PROPOSTA_LABEL] ?? proposta.status}
            </StatusBadge>
            {proposta.visualizacoes.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Eye className="size-3" /> {proposta.visualizacoes.length} abertura(s)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{proposta.cliente}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <GerarDocumentoButton modelos={modelosDoc} paramId="propostaId" valor={proposta.id} />
          <Button variant="outline" size="sm" onClick={copiarLink}>
            <Link2 className="size-3.5" /> Link
          </Button>
          {podeGerir && (
            <>
              <Button variant="outline" size="sm" onClick={copiar} disabled={pending}>
                <Copy className="size-3.5" /> Copiar
              </Button>
              {!aceita && (
                <>
                  <Button variant="outline" size="sm" onClick={email} disabled={pending}>
                    <Send className="size-3.5" /> E-mail
                  </Button>
                  {/* F5.5 — só depois de enviada faz sentido marcar "em negociação": é o
                      cliente respondendo, e não dá pra responder ao que nunca chegou. */}
                  {proposta.status === "enviada" && (
                    <Button variant="outline" size="sm" onClick={() => status("em_negociacao")} disabled={pending}>
                      <MessageSquareText className="size-3.5" /> Em negociação
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setRecusando(true)} disabled={pending}>
                    <X className="size-3.5" /> Recusar
                  </Button>
                  <Button size="sm" onClick={aceitar} disabled={pending}>
                    <Check className="size-3.5" /> Aceitar → projeto
                  </Button>
                </>
              )}
              {aceita && proposta.projetoId && (
                <Button size="sm" render={<Link href={`/projetos/${proposta.projetoId}`} />}>
                  Ver projeto
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Itens (disciplinas)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editavel && (
              <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-2.5">
                <AplicarTabelaDialog
                  tabelas={tabelas}
                  itens={itens}
                  areaM2={Number(areaM2) || 0}
                  catalogo={catalogo}
                  onAplicar={preenchido}
                />
                <Button size="sm" variant="outline" onClick={addItem} className="ml-auto">
                  <Plus className="size-3.5" /> Item
                </Button>
              </div>
            )}

            {itens.length === 0 ? (
              <EmptyState icon={ListChecks} title="Nenhum item" />
            ) : (
              <div className="space-y-2">
                {itens.map((it, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={it.disciplina}
                      onValueChange={(v) =>
                        setItens((arr) => arr.map((x, idx) => (idx === i ? { ...x, disciplina: v ?? "" } : x)))
                      }
                    >
                      <SelectTrigger className="w-44" disabled={!editavel}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogo.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="min-w-32 flex-1"
                      placeholder="Descrição (opcional)"
                      value={it.descricao}
                      disabled={!editavel}
                      onChange={(e) =>
                        setItens((arr) => arr.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)))
                      }
                    />
                    {/* A coluna é Decimal(14,2): `InputMoeda` já entra em centavos, então não há
                        3ª casa para o banco arredondar e o total da tela nunca diverge do PDF. */}
                    <InputMoeda
                      semPrefixo
                      placeholder="Valor (R$)"
                      className="w-32"
                      value={it.valor || null}
                      disabled={!editavel}
                      onChange={(v) =>
                        setItens((arr) => arr.map((x, idx) => (idx === i ? { ...x, valor: v ?? 0 } : x)))
                      }
                    />
                    {editavel && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover"
                        onClick={() => setItens((arr) => arr.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="border-t pt-2 text-right text-sm font-bold">
              Total: <span className="font-mono">{brl(total)}</span>
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={titulo} disabled={!editavel} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Área (m²)</Label>
                  <Input type="number" value={areaM2} disabled={!editavel} onChange={(e) => setAreaM2(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade</Label>
                  <Input type="date" value={validade} disabled={!editavel} onChange={(e) => setValidade(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <textarea
                  rows={3}
                  className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  value={observacoes}
                  disabled={!editavel}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desconto (R$)</Label>
                <InputMoeda value={desconto} disabled={!editavel} onChange={setDesconto} />
                {percentualPreview !== null && (
                  <p className="text-xs text-muted-foreground">
                    {percentualPreview.toFixed(1)}% sobre {brl(valoresPreview.valorOriginal)}
                  </p>
                )}
              </div>
              {/* F5.8 (Q6/ADR-19) — só aparece quando o desconto de fato passa do limite
                  configurado; abaixo dele ninguém precisa explicar nada. */}
              {editavel && exigeJustificativa && (
                <div className="space-y-1.5">
                  <Label className="text-amber-600 dark:text-amber-400">
                    Justificativa do desconto ({percentualPreview!.toFixed(1)}% — acima de{" "}
                    {descontoMaxSemJustificativa}%)
                  </Label>
                  <textarea
                    rows={2}
                    className="w-full resize-y rounded-sm border border-amber-500 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                    placeholder="Por que este desconto?"
                    value={justificativaDesconto}
                    onChange={(e) => setJustificativaDesconto(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Condições de pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {condicoes.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Entrada, na entrega…"
                    value={c.descricao}
                    disabled={!editavel}
                    onChange={(e) =>
                      setCondicoes((arr) => arr.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)))
                    }
                  />
                  <Select
                    value={c.tipo}
                    onValueChange={(v) =>
                      setCondicoes((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, tipo: (v as "percentual" | "valor") ?? "percentual" } : x)),
                      )
                    }
                  >
                    <SelectTrigger className="w-20" disabled={!editavel}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">%</SelectItem>
                      <SelectItem value="valor">R$</SelectItem>
                    </SelectContent>
                  </Select>
                  {c.tipo === "valor" ? (
                    <InputMoeda
                      semPrefixo
                      className="w-24"
                      value={c.valor || null}
                      disabled={!editavel}
                      onChange={(v) =>
                        setCondicoes((arr) => arr.map((x, idx) => (idx === i ? { ...x, valor: v ?? 0 } : x)))
                      }
                    />
                  ) : (
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="w-24 text-right tabular-nums"
                      value={c.valor || ""}
                      disabled={!editavel}
                      onChange={(e) =>
                        setCondicoes((arr) =>
                          arr.map((x, idx) => (idx === i ? { ...x, valor: Number(e.target.value) } : x)),
                        )
                      }
                    />
                  )}
                  {editavel && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover"
                      onClick={() => setCondicoes((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {editavel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCondicoes((arr) => [...arr, { descricao: "", tipo: "percentual", valor: 0 }])
                  }
                >
                  <Plus className="size-3.5" /> Condição
                </Button>
              )}
            </CardContent>
          </Card>

          {proposta.versoes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Versões</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {proposta.versoes.map((v) => (
                    <li key={v.numero}>
                      <span className="font-mono font-semibold text-foreground">v{v.numero}</span> · {v.autor} ·{" "}
                      {new Date(v.data).toLocaleString("pt-BR")}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {editavel && (
        <div className="sticky bottom-20 flex justify-end lg:bottom-4">
          <Button onClick={salvar} disabled={pending}>
            <Save className="size-4" /> {pending ? "Salvando…" : "Salvar proposta"}
          </Button>
        </div>
      )}

      {recusando && (
        <MotivoRecusaPropostaDialog
          numero={proposta.numero}
          motivos={motivosPerda}
          onCancelar={() => setRecusando(false)}
          onConfirmar={(motivoPerdaId, concorrente, observacaoRecusa) => {
            setRecusando(false);
            status("recusada", { motivoPerdaId, concorrente, observacaoRecusa });
          }}
        />
      )}
    </div>
  );
}
