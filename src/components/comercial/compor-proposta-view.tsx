"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, GripVertical, Link2, MessageSquareText, Plus, Save, Send, Trash2, X } from "lucide-react";
import { salvarPropostaCompostaAction } from "@/modules/comercial/proposta-composta/actions";
import { aceitarProposta, enviarPropostaEmail, mudarStatusProposta } from "@/modules/comercial/actions";
import type { MotivoPerdaOpcao } from "@/modules/comercial/queries";
import { STATUS_PROPOSTA_LABEL } from "@/modules/comercial/labels";
import { STATUS_PROPOSTA_TONE } from "./propostas-view";
import { MotivoRecusaPropostaDialog } from "./motivo-recusa-proposta-dialog";
import { ROTULO_SECAO, SECOES_ORDEM } from "@/modules/comercial/proposta-composta/modelos";
import { calcularParcelas, rotuloPercentual, somaPercentuais } from "@/modules/comercial/proposta-composta/parcelas";
import type { PropostaCompostaEditor } from "@/modules/comercial/proposta-composta/queries";
import { extensoMoeda } from "@/lib/extenso";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Editor da proposta composta (ADR-0006, G4).
 *
 * A tela mostra o que o documento vai dizer — inclusive o **valor por extenso de cada parcela**,
 * calculado do número na hora. Nas 163 propostas analisadas, 12 extensos estavam errados porque
 * eram digitados à mão, e um plano cobrava R$ 4.750 a mais que o total. Aqui o percentual é a
 * entrada, o resto é consequência, e a soma aparece na tela enquanto se digita.
 */

type Secao = { secao: string; titulo: string; texto: string; disciplinaId: string | null; clausulaId: string | null };
type Parcela = { descricao: string; percentual: number; prazo: string };
type Item = { disciplina: string; valor: number };

export function ComporPropostaView({
  proposta,
  disciplinas,
  descontoMaxSemJustificativa,
  baseUrl,
  motivosPerda,
}: {
  proposta: PropostaCompostaEditor;
  disciplinas: string[];
  descontoMaxSemJustificativa: number;
  baseUrl: string;
  motivosPerda: MotivoPerdaOpcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recusando, setRecusando] = useState(false);
  const aceita = proposta.status === "aceita";
  const linkPublico = `${baseUrl}/a/proposta/${proposta.token}`;

  const [titulo, setTitulo] = useState(proposta.titulo);
  const [obraEndereco, setObraEndereco] = useState(proposta.obraEndereco);
  const [obraCidade, setObraCidade] = useState(proposta.obraCidade);
  const [obraUF, setObraUF] = useState(proposta.obraUF);
  const [areaM2, setAreaM2] = useState(proposta.areaM2 != null ? String(proposta.areaM2) : "");
  const [validade, setValidade] = useState(proposta.validade);
  const [observacoes, setObservacoes] = useState(proposta.observacoes);
  const [itens, setItens] = useState<Item[]>(proposta.itens);
  const [secoes, setSecoes] = useState<Secao[]>(proposta.secoes);
  const [parcelas, setParcelas] = useState<Parcela[]>(proposta.parcelas);
  const [desconto, setDesconto] = useState(proposta.desconto ?? 0);
  const [justificativa, setJustificativa] = useState("");

  const valorOriginal = useMemo(() => itens.reduce((s, i) => s + (i.valor || 0), 0), [itens]);
  const total = Math.max(0, valorOriginal - (desconto || 0));
  const percentualDesconto = valorOriginal > 0 ? ((desconto || 0) / valorOriginal) * 100 : 0;
  const precisaJustificar = percentualDesconto > descontoMaxSemJustificativa;

  const plano = useMemo(() => calcularParcelas(total, parcelas), [total, parcelas]);
  const soma = useMemo(() => somaPercentuais(parcelas), [parcelas]);

  function salvar() {
    start(async () => {
      const r = await salvarPropostaCompostaAction({
        id: proposta.id,
        titulo,
        obraEndereco: obraEndereco || undefined,
        obraCidade: obraCidade || undefined,
        obraUF: obraUF || undefined,
        areaM2: areaM2 ? Number(areaM2) : null,
        validade: validade || undefined,
        observacoes: observacoes || undefined,
        itens,
        secoes: secoes.map((s) => ({
          secao: s.secao as (typeof SECOES_ORDEM)[number],
          titulo: s.titulo || undefined,
          texto: s.texto,
          disciplinaId: s.disciplinaId,
          clausulaId: s.clausulaId,
        })),
        parcelas: parcelas.map((p) => ({
          descricao: p.descricao,
          percentual: p.percentual,
          prazo: p.prazo || undefined,
        })),
        desconto: desconto || null,
        justificativaDesconto: justificativa || undefined,
      });
      if (r.ok) {
        toast.success(`Salvo — versão ${r.data.versao}.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // As três ações abaixo passam pelas MESMAS actions do editor antigo: mesmo gate, mesma
  // auditoria, mesma timeline. A guarda de "enviável" (plano em 100%, empresa, campo em branco)
  // vive no servidor — o botão nunca é a única barreira.
  function status(
    s: "em_negociacao" | "recusada",
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

  function enviarPorEmail() {
    start(async () => {
      const r = await enviarPropostaEmail({ id: proposta.id });
      if (r.ok) {
        toast.success("Proposta enviada por e-mail.");
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

  async function copiarLink() {
    await navigator.clipboard.writeText(linkPublico);
    toast.success("Link copiado.");
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link href={proposta.negociacaoId ? `/comercial/funil?card=NEGOCIACAO:${proposta.negociacaoId}` : "/comercial/funil"} />
          }
        >
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold tracking-tight">
            {proposta.numero} · {proposta.clienteNome}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge tone={STATUS_PROPOSTA_TONE[proposta.status] ?? "neutral"}>
              {STATUS_PROPOSTA_LABEL[proposta.status as keyof typeof STATUS_PROPOSTA_LABEL] ?? proposta.status}
            </StatusBadge>
            {proposta.modeloNome ? `Modelo: ${proposta.modeloNome} · ` : ""}
            {proposta.versao != null ? `versão ${proposta.versao}` : "sem versão"}
            {proposta.aberturas > 0 ? ` · ${proposta.aberturas} abertura(s)` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/comercial/propostas/${proposta.id}/previa`} target="_blank" rel="noopener" />}
          >
            <Eye className="size-4" /> Pré-visualizar
          </Button>
          <Button variant="outline" size="sm" onClick={copiarLink}>
            <Link2 className="size-4" /> Link
          </Button>
          {!aceita && (
            <>
              <Button variant="outline" size="sm" onClick={enviarPorEmail} disabled={pending}>
                <Send className="size-4" /> E-mail
              </Button>
              {/* Só depois de enviada faz sentido "em negociação": é o cliente respondendo. */}
              {proposta.status === "enviada" && (
                <Button variant="outline" size="sm" onClick={() => status("em_negociacao")} disabled={pending}>
                  <MessageSquareText className="size-4" /> Em negociação
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setRecusando(true)} disabled={pending}>
                <X className="size-4" /> Recusar
              </Button>
              <Button size="sm" onClick={aceitar} disabled={pending}>
                <Check className="size-4" /> Aceitar → projeto
              </Button>
            </>
          )}
          {aceita && proposta.projetoId && (
            <Button size="sm" render={<Link href={`/projetos/${proposta.projetoId}`} />}>
              Ver projeto
            </Button>
          )}
          <Button size="sm" onClick={salvar} disabled={pending || aceita}>
            <Save className="size-4" /> {pending ? "Salvando…" : "Salvar versão"}
          </Button>
        </div>
      </div>

      {aceita && (
        <p className="rounded-sm border bg-muted/40 p-2 text-sm text-muted-foreground">
          Proposta aceita: ela deu origem ao projeto e não pode mais ser editada. Para mudar algo,
          crie uma nova proposta.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da proposta e da obra</CardTitle>
          <CardDescription>
            Cidade e UF decidem qual variante de cláusula vale — obra em outro estado não recebe
            norma que não é dele.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-titulo">Título</Label>
            <Input id="p-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-validade">Validade</Label>
            <Input id="p-validade" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-area">Área (m²)</Label>
            <Input id="p-area" type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-end">Endereço da obra</Label>
            <Input id="p-end" value={obraEndereco} onChange={(e) => setObraEndereco(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cidade">Cidade</Label>
            <Input id="p-cidade" value={obraCidade} onChange={(e) => setObraCidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-uf">UF</Label>
            <Input
              id="p-uf"
              value={obraUF}
              onChange={(e) => setObraUF(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="w-20"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disciplinas e valores</CardTitle>
          <CardDescription>É desta lista que o projeto nasce no aceite.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={it.disciplina}
                onValueChange={(v) =>
                  setItens((a) => a.map((x, j) => (j === i ? { ...x, disciplina: v ?? x.disciplina } : x)))
                }
              >
                <SelectTrigger className="w-64" aria-label={`Disciplina da linha ${i + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InputMoeda
                value={it.valor}
                onChange={(v) => setItens((a) => a.map((x, j) => (j === i ? { ...x, valor: v ?? 0 } : x)))}
                className="w-40"
                aria-label={`Valor da linha ${i + 1}`}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${it.disciplina}`}
                onClick={() => setItens((a) => a.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItens((a) => [...a, { disciplina: disciplinas[0] ?? "", valor: 0 }])}
          >
            <Plus className="size-4" /> Adicionar disciplina
          </Button>

          <div className="mt-2 space-y-1 border-t pt-2 text-sm">
            <div className="flex justify-between">
              <span>Soma das disciplinas</span>
              <span className="font-mono tabular-nums">{brl(valorOriginal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Desconto</span>
              <InputMoeda value={desconto} onChange={(v) => setDesconto(v ?? 0)} className="w-36" aria-label="Desconto" />
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{brl(total)}</span>
            </div>
            {total > 0 && <p className="text-xs text-muted-foreground">Por extenso: {extensoMoeda(total)}</p>}
            {precisaJustificar && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="p-just">
                  Justificativa do desconto ({percentualDesconto.toFixed(1)}%, acima de{" "}
                  {descontoMaxSemJustificativa}%)
                </Label>
                <Input
                  id="p-just"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Por que este desconto?"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano de pagamento</CardTitle>
          <CardDescription>
            Informe o percentual de cada marco: o valor e o extenso saem daqui. A última parcela
            absorve o arredondamento, então a soma fecha o total exato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {parcelas.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={p.descricao}
                onChange={(e) =>
                  setParcelas((a) => a.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))
                }
                placeholder="Marco (ex.: Assinatura do contrato)"
                className="min-w-48 flex-1"
                aria-label={`Descrição da parcela ${i + 1}`}
              />
              <Input
                type="number"
                step="0.01"
                value={p.percentual}
                onChange={(e) =>
                  setParcelas((a) => a.map((x, j) => (j === i ? { ...x, percentual: Number(e.target.value) } : x)))
                }
                className="w-24"
                aria-label={`Percentual da parcela ${i + 1}`}
              />
              <Input
                value={p.prazo}
                onChange={(e) => setParcelas((a) => a.map((x, j) => (j === i ? { ...x, prazo: e.target.value } : x)))}
                placeholder="Prazo (opcional)"
                className="w-44"
                aria-label={`Prazo da parcela ${i + 1}`}
              />
              <span className="w-32 text-right font-mono text-sm tabular-nums">
                {plano.ok ? brl(plano.parcelas[i]?.valor ?? 0) : "—"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover parcela ${i + 1}`}
                onClick={() => setParcelas((a) => a.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
              {plano.ok && (
                <p className="w-full pl-6 text-xs text-muted-foreground">
                  {plano.parcelas[i]?.valorExtenso}
                </p>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setParcelas((a) => [...a, { descricao: "", percentual: 0, prazo: "" }])}
          >
            <Plus className="size-4" /> Adicionar parcela
          </Button>

          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span>Soma dos percentuais</span>
            <span className="flex items-center gap-2">
              <span className={`font-mono tabular-nums ${soma === 100 ? "" : "text-destructive"}`}>
                {rotuloPercentual(soma)}
              </span>
              {soma === 100 ? (
                <StatusBadge tone="success">fecha</StatusBadge>
              ) : (
                <StatusBadge tone="danger">precisa somar 100%</StatusBadge>
              )}
            </span>
          </div>
          {!plano.ok && parcelas.length > 0 && <p className="text-xs text-destructive">{plano.mensagem}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Texto da proposta</CardTitle>
          <CardDescription>
            Veio do modelo e é editável aqui. Editar não muda a biblioteca — vale só para esta
            proposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {secoes.map((s, i) => (
            <div key={i} className="space-y-1.5 rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={s.secao}
                  onValueChange={(v) => setSecoes((a) => a.map((x, j) => (j === i ? { ...x, secao: v ?? x.secao } : x)))}
                >
                  <SelectTrigger className="w-56" aria-label={`Seção ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECOES_ORDEM.map((op) => (
                      <SelectItem key={op} value={op}>
                        {ROTULO_SECAO[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={s.titulo}
                  onChange={(e) => setSecoes((a) => a.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                  placeholder={ROTULO_SECAO[s.secao as keyof typeof ROTULO_SECAO] ?? "Título"}
                  className="min-w-48 flex-1"
                  aria-label={`Título da seção ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Mover seção ${i + 1} para cima`}
                  disabled={i === 0}
                  onClick={() =>
                    setSecoes((a) => {
                      const n = [...a];
                      [n[i - 1], n[i]] = [n[i], n[i - 1]];
                      return n;
                    })
                  }
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Mover seção ${i + 1} para baixo`}
                  disabled={i === secoes.length - 1}
                  onClick={() =>
                    setSecoes((a) => {
                      const n = [...a];
                      [n[i + 1], n[i]] = [n[i], n[i + 1]];
                      return n;
                    })
                  }
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover seção ${i + 1}`}
                  onClick={() => setSecoes((a) => a.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <textarea
                value={s.texto}
                onChange={(e) => setSecoes((a) => a.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                rows={Math.min(12, Math.max(3, Math.ceil(s.texto.length / 90)))}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                aria-label={`Texto da seção ${i + 1}`}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSecoes((a) => [...a, { secao: "descricao", titulo: "", texto: "", disciplinaId: null, clausulaId: null }])
            }
          >
            <Plus className="size-4" /> Adicionar seção
          </Button>

          <div className="space-y-1.5 pt-2">
            <Label htmlFor="p-obs">Observações internas</Label>
            <textarea
              id="p-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
        </CardContent>
      </Card>
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
