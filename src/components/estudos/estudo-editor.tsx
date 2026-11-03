"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Ruler, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { limparSeparadores, type AcaoItemAcao } from "@/components/ui/acoes";
import { CondicoesInstalacao } from "@/components/ferramentas/condicoes-instalacao";
import { LinhaCarga, Prop } from "@/components/ferramentas/linha-carga";
import { formatarDataHora } from "@/lib/utils";
import { AVISO_EM_VALIDACAO, MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO } from "@/modules/estudos/acesso";
import {
  ACAO_AMBIENTE_ADICIONAR_CARGA,
  ACAO_AMBIENTE_DESCER,
  ACAO_AMBIENTE_DUPLICAR,
  ACAO_AMBIENTE_REMOVER,
  ACAO_AMBIENTE_SUBIR,
  ACAO_ESTUDO_DUPLICAR,
  ACAO_ESTUDO_EXCLUIR,
  MOTIVO_AMBIENTES_CHEIO,
  MOTIVO_CARGAS_CHEIO,
  ambienteDoMover,
  itensDeAmbiente,
  itensDeCargaDoEstudo,
  itensDeEstudo,
} from "@/modules/estudos/acoes";
import { duplicarEstudoAction, excluirEstudoAction, salvarEstudoAction } from "@/modules/estudos/actions";
import { calcularEstudo, ROTULO_SEM_TIPO, SEM_TIPO_PONTO } from "@/modules/estudos/calculo";
import { TIPOS_PONTO, TIPO_PONTO_ROTULO, type ConteudoEstudo } from "@/modules/estudos/conteudo";
import {
  assinatura,
  duplicarAmbiente,
  estadoInicial,
  montarConteudo,
  moverCargaParaAmbiente,
  novoAmbiente,
  podeAdicionarAmbiente,
  podeAdicionarCarga,
  totalDeLinhas,
  type EstadoEstudo,
} from "@/modules/estudos/form";
import {
  ACAO_CARGA_DESCER,
  ACAO_CARGA_DUPLICAR,
  ACAO_CARGA_REMOVER,
  ACAO_CARGA_SUBIR,
  moverItem,
} from "@/modules/ferramentas/acoes-carga";
import { novaLinha, type Linha } from "@/modules/ferramentas/carga-linha";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { AlertaCalculo } from "@/components/ferramentas/alerta-calculo";

type Alteracao = { id: string; quando: Date; quem: string; oQue: string };

type Props = {
  projetoId: string;
  estudo: { id: string; nome: string; versao: number; atualizadoPor: string; atualizadoEm: Date };
  conteudoInicial: ConteudoEstudo | null;
  podeEditar: boolean;
  emValidacao: boolean;
  totalEstudos: number;
  alteracoes: Alteracao[];
};

const SEM_TIPO = SEM_TIPO_PONTO;

export function EstudoEditor({ projetoId, estudo, conteudoInicial, podeEditar, emValidacao, totalEstudos, alteracoes }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [estado, setEstado] = useState<EstadoEstudo>(() => estadoInicial(estudo.nome, conteudoInicial));
  const [versao, setVersao] = useState(estudo.versao);
  const [salvo, setSalvo] = useState(() => assinatura(estado));
  const [conflito, setConflito] = useState(false);
  const [pendente, startTransition] = useTransition();

  const montagem = useMemo(() => montarConteudo(estado), [estado]);
  // O motor ainda pode recusar uma entrada que o formulário aceitou: sem o try, a tela inteira cairia e o que não foi
  // salvo se perderia. Sem resultado, a tela segue editável e o erro da montagem (se houver) aparece.
  const resultado = useMemo(() => {
    if (!montagem.conteudo) return null;
    try {
      return calcularEstudo(montagem.conteudo);
    } catch {
      return null;
    }
  }, [montagem]);
  const alterado = useMemo(() => assinatura(estado) !== salvo, [estado, salvo]);
  const totalCargas = totalDeLinhas(estado.ambientes);
  const erro = estado.nome.trim() === "" ? "Dê um nome ao estudo." : montagem.erro;

  // O estado mais recente para os atalhos (Ctrl+S) e o aviso de saída, sem reinscrever o listener a cada tecla.
  const salvarRef = useRef<() => Promise<void>>(async () => {});

  async function salvar() {
    if (!podeEditar || pendente || !alterado || conflito) return;
    const m = montarConteudo(estado);
    if (m.erro !== undefined || estado.nome.trim() === "") {
      toast.error(estado.nome.trim() === "" ? "Dê um nome ao estudo." : m.erro);
      return;
    }
    const assin = assinatura(estado);
    if (conteudoInicial === null && versao === estudo.versao) {
      const ok = await confirm({
        title: "Substituir o conteúdo ilegível?",
        description: "O conteúdo gravado deste estudo não pôde ser lido. Salvar grava o que está na tela por cima dele (o conteúdo antigo continua na auditoria).",
        confirmLabel: "Substituir e salvar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await salvarEstudoAction({ id: estudo.id, versao, nome: estado.nome.trim(), conteudo: m.conteudo });
      if (!r.ok) {
        if (r.error === MOTIVO_ALTERADO_POR_OUTRA_PESSOA) setConflito(true);
        toast.error(r.error);
        return;
      }
      setVersao(r.data.versao);
      setSalvo(assin);
      setConflito(false);
      toast.success(m.ignoradas ? `Estudo salvo. ${m.ignoradas} linha(s) em branco ficaram de fora.` : "Estudo salvo.");
      router.refresh();
    });
  }
  salvarRef.current = salvar;

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvarRef.current();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  async function voltar() {
    if (alterado) {
      const ok = await confirm({
        title: "Sair sem salvar?",
        description: "Há alterações que ainda não foram salvas neste estudo.",
        confirmLabel: "Sair sem salvar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    router.push(`/projetos/${projetoId}/estudos`);
  }

  // ── Ações do estudo (⋯ do cabeçalho) ──────────────────────────────────────────────────────────
  const itensEstudo = limparSeparadores(
    itensDeEstudo({ projetoId, estudoId: estudo.id, podeEditar, totalEstudos, alterado }).filter((i) => i.id !== "abrir-estudo"),
  );

  async function executarEstudo(item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      if (item.id === ACAO_ESTUDO_DUPLICAR) {
        if (alterado) {
          toast.error("Salve as alterações antes de duplicar: a cópia sai da última versão salva.");
          return;
        }
        const r = await duplicarEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo duplicado.");
        router.push(`/projetos/${projetoId}/estudos/${r.data.id}`);
      } else if (item.id === ACAO_ESTUDO_EXCLUIR) {
        const r = await excluirEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo excluído.");
        // Já excluído: o aviso de "alterações não salvas" não faz mais sentido.
        setSalvo(assinatura(estado));
        router.push(`/projetos/${projetoId}/estudos`);
      }
    });
  }

  // ── Edição dos ambientes e das cargas ─────────────────────────────────────────────────────────
  const setAmbientes = (f: (a: EstadoEstudo["ambientes"]) => EstadoEstudo["ambientes"]) =>
    setEstado((e) => ({ ...e, ambientes: f(e.ambientes) }));

  const setLinha = (ambienteChave: number, chave: number, k: keyof Linha, v: string) =>
    setAmbientes((as) =>
      as.map((a) => (a.chave === ambienteChave ? { ...a, linhas: a.linhas.map((l) => (l.chave === chave ? { ...l, [k]: v } : l)) } : a)),
    );

  const adicionarCarga = (ambienteChave: number) =>
    setAmbientes((as) => as.map((a) => (a.chave === ambienteChave ? { ...a, linhas: [...a.linhas, novaLinha()] } : a)));

  async function confirmarSeNecessario(item: AcaoItemAcao): Promise<boolean> {
    if (!item.confirmar) return true;
    return confirm({
      title: item.confirmar.titulo,
      description: item.confirmar.descricao,
      confirmLabel: item.confirmar.rotuloConfirmar,
      variant: item.variant === "destructive" ? "destructive" : "default",
    });
  }

  async function executarAmbiente(ambienteChave: number, item: AcaoItemAcao) {
    if (!(await confirmarSeNecessario(item))) return;
    // O ambiente é achado pela chave DEPOIS da confirmação: a lista pode ter mudado com o diálogo aberto.
    setAmbientes((as) => {
      const i = as.findIndex((a) => a.chave === ambienteChave);
      if (i < 0) return as;
      if (item.id === ACAO_AMBIENTE_ADICIONAR_CARGA) {
        return as.map((a, j) => (j === i ? { ...a, linhas: [...a.linhas, novaLinha()] } : a));
      }
      if (item.id === ACAO_AMBIENTE_DUPLICAR) return duplicarAmbiente(as, ambienteChave);
      if (item.id === ACAO_AMBIENTE_SUBIR) return moverItem(as, i, i - 1);
      if (item.id === ACAO_AMBIENTE_DESCER) return moverItem(as, i, i + 1);
      if (item.id === ACAO_AMBIENTE_REMOVER) return as.filter((a) => a.chave !== ambienteChave);
      return as;
    });
  }

  async function executarCarga(ambienteChave: number, chave: number, item: AcaoItemAcao) {
    if (!(await confirmarSeNecessario(item))) return;
    const destino = ambienteDoMover(item.id);
    // Chave nova criada fora do updater (StrictMode roda o updater duas vezes).
    const nova = novaLinha();
    setAmbientes((as) => {
      if (destino) return moverCargaParaAmbiente(as, ambienteChave, chave, destino);
      return as.map((a) => {
        if (a.chave !== ambienteChave) return a;
        const i = a.linhas.findIndex((l) => l.chave === chave);
        if (i < 0) return a;
        if (item.id === ACAO_CARGA_DUPLICAR) {
          const origem = a.linhas[i];
          const copia = { ...origem, chave: nova.chave, descricao: origem.descricao ? `${origem.descricao.slice(0, 112)} (cópia)` : "" };
          return { ...a, linhas: [...a.linhas.slice(0, i + 1), copia, ...a.linhas.slice(i + 1)] };
        }
        if (item.id === ACAO_CARGA_SUBIR) return { ...a, linhas: moverItem(a.linhas, i, i - 1) };
        if (item.id === ACAO_CARGA_DESCER) return { ...a, linhas: moverItem(a.linhas, i, i + 1) };
        if (item.id === ACAO_CARGA_REMOVER) return { ...a, linhas: a.linhas.filter((l) => l.chave !== chave) };
        return a;
      });
    });
  }

  const outrosAmbientes = estado.ambientes.map((a) => ({ id: a.id, nome: a.nome.trim() || "Ambiente sem nome" }));
  const total = resultado?.total ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void voltar()}>
          <ArrowLeft aria-hidden className="mr-1.5 size-4" /> Estudos
        </Button>
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Nome do estudo"
            value={estado.nome}
            maxLength={120}
            disabled={!podeEditar}
            onChange={(e) => setEstado((s) => ({ ...s, nome: e.target.value }))}
            className="text-base font-semibold"
          />
        </div>
        {!podeEditar && <Badge variant="outline">Somente leitura</Badge>}
        {podeEditar && alterado && <Badge variant="outline" className="border-warning/40 text-warning-text">Alterações não salvas</Badge>}
        {podeEditar && (
          <Button
            type="button"
            onClick={() => void salvar()}
            disabled={!alterado || pendente || !!erro || conflito}
            title="Salvar (Ctrl+S)"
            aria-describedby={erro ? "est-erro" : undefined}
          >
            {pendente ? <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" /> : <Save aria-hidden className="mr-1.5 size-4" />}
            Salvar
          </Button>
        )}
        <BotaoAcoes itens={itensEstudo} onSelect={(item) => void executarEstudo(item)} rotulo={`Ações do estudo ${estado.nome}`} className="size-8" />
      </div>

      <p className="text-xs text-muted-foreground">
        Alterado por {estudo.atualizadoPor} em {formatarDataHora(estudo.atualizadoEm)} · versão {versao}
        {!podeEditar && ` · ${MOTIVO_SEM_EDICAO}`}
      </p>

      {emValidacao && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Motor em validação.</strong> {AVISO_EM_VALIDACAO} Só quem gere as ferramentas vê esta aba por enquanto.
          </span>
        </p>
      )}
      {conteudoInicial === null && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          O conteúdo gravado deste estudo não pôde ser lido e abriu vazio. Se você salvar, o conteúdo antigo será substituído (ele continua na auditoria).
        </p>
      )}
      {conflito && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{MOTIVO_ALTERADO_POR_OUTRA_PESSOA}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      )}

      <fieldset disabled={!podeEditar} className="min-w-0 space-y-6 border-0 p-0">
        <legend className="sr-only">Ambientes, cargas e condições do estudo{podeEditar ? "" : " (somente leitura)"}</legend>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              Ambientes e cargas <span className="font-normal text-muted-foreground">· {estado.ambientes.length} ambiente(s), {totalCargas} carga(s)</span>
            </h2>
            {podeEditar && (
              <span className="flex flex-wrap items-center gap-2">
                {!podeAdicionarAmbiente(estado.ambientes) && <span className="text-xs text-muted-foreground">{MOTIVO_AMBIENTES_CHEIO}</span>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!podeAdicionarAmbiente(estado.ambientes)}
                  onClick={() => setAmbientes((as) => [...as, novoAmbiente()])}
                >
                  <Plus aria-hidden className="mr-1.5 size-3.5" /> Adicionar ambiente
                </Button>
              </span>
            )}
          </div>

          {estado.ambientes.length === 0 && (
            <EmptyState
              icon={Ruler}
              title="Nenhum ambiente ainda"
              description={podeEditar ? "Adicione o primeiro (sala, cozinha, quadro de força…) e lance as cargas dele." : MOTIVO_SEM_EDICAO}
              action={
                podeEditar ? (
                  <Button type="button" size="sm" onClick={() => setAmbientes((as) => [...as, novoAmbiente()])}>
                    <Plus aria-hidden className="mr-1.5 size-3.5" /> Adicionar ambiente
                  </Button>
                ) : undefined
              }
            />
          )}

          <ul className="space-y-4" aria-label="Ambientes do estudo">
            {estado.ambientes.map((a, ai) => {
              const sub = resultado?.ambientes.find((x) => x.id === a.id);
              const itensAmb = podeEditar
                ? itensDeAmbiente({ indice: ai, total: estado.ambientes.length, cargas: a.linhas.length, totalCargas })
                : [];
              return (
                <li key={a.chave} className="space-y-3 rounded-lg border p-3">
                  <LinhaComMenu itens={itensAmb} onSelect={(item) => void executarAmbiente(a.chave, item)} render={<div className="flex flex-wrap items-center gap-2" />}>
                    <div className="min-w-44 flex-1">
                      <Input
                        aria-label={`Nome do ambiente ${ai + 1}`}
                        placeholder="Nome do ambiente (ex.: Sala, Cozinha)"
                        value={a.nome}
                        maxLength={80}
                        onChange={(e) => setAmbientes((as) => as.map((x) => (x.chave === a.chave ? { ...x, nome: e.target.value } : x)))}
                        className="font-medium"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {a.linhas.length} carga(s)
                      {sub?.resultado ? ` · demanda ${fmtNum(sub.resultado.pDemandadaW / 1000, 2)} kW` : ""}
                    </span>
                    <BotaoAcoes itens={itensAmb} onSelect={(item) => void executarAmbiente(a.chave, item)} rotulo={`Ações do ambiente ${a.nome || ai + 1}`} className="size-8" />
                  </LinhaComMenu>

                  {a.linhas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma carga neste ambiente.</p>}
                  <ul className="space-y-2" aria-label={`Cargas do ambiente ${a.nome || ai + 1}`}>
                    {a.linhas.map((l, li) => {
                      const itens = podeEditar
                        ? itensDeCargaDoEstudo({
                            indice: li,
                            total: a.linhas.length,
                            totalGeral: totalCargas,
                            ambientes: outrosAmbientes,
                            ambienteAtualId: a.id,
                          })
                        : [];
                      return (
                        <li key={l.chave}>
                          <LinhaCarga
                            linha={l}
                            numero={li + 1}
                            itens={itens}
                            idPrefixo={`est-a${ai}`}
                            contexto={a.nome.trim() || `ambiente ${ai + 1}`}
                            onSelect={(item) => void executarCarga(a.chave, l.chave, item)}
                            onChange={(k, v) => setLinha(a.chave, l.chave, k, v)}
                            extra={
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Tipo do ponto</Label>
                                <Select
                                  value={l.tipoPonto || SEM_TIPO}
                                  onValueChange={(v) => v && setLinha(a.chave, l.chave, "tipoPonto", v === SEM_TIPO ? "" : v)}
                                >
                                  <SelectTrigger className="w-full" aria-label={`Tipo do ponto da carga ${li + 1} de ${a.nome || `ambiente ${ai + 1}`}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SEM_TIPO}>{ROTULO_SEM_TIPO}</SelectItem>
                                    {TIPOS_PONTO.map((t) => (
                                      <SelectItem key={t} value={t}>{TIPO_PONTO_ROTULO[t]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {podeEditar && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={!podeAdicionarCarga(estado.ambientes)} onClick={() => adicionarCarga(a.chave)}>
                        <Plus aria-hidden className="mr-1.5 size-3.5" /> Adicionar carga
                      </Button>
                      {!podeAdicionarCarga(estado.ambientes) && <span className="text-xs text-muted-foreground">{MOTIVO_CARGAS_CHEIO}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Potência nominal em W (de saída, no caso de motores). Fator de demanda: use o da concessionária; 100 % se a carga funciona toda junta.
            Nada vem preenchido por padrão. Clique com o botão direito num ambiente ou numa carga (ou use o ⋯) para duplicar, mover ou remover.
          </p>
        </section>

        <CondicoesInstalacao geral={estado.geral} onChange={(g) => setEstado((e) => ({ ...e, geral: g }))} idPrefixo="est" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Fonte dos fatores e observações</h2>
          <div className="space-y-1.5">
            <Label htmlFor="est-fonte">De onde vêm os fatores de demanda</Label>
            <Input
              id="est-fonte"
              value={estado.fonte}
              maxLength={300}
              placeholder="Ex.: tabela de demanda da norma técnica da concessionária"
              onChange={(e) => setEstado((s) => ({ ...s, fonte: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-obs">Observações</Label>
            <textarea
              id="est-obs"
              rows={3}
              maxLength={2000}
              value={estado.observacoes}
              onChange={(e) => setEstado((s) => ({ ...s, observacoes: e.target.value }))}
              className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          </div>
        </section>
      </fieldset>

      {erro && (
        <p id="est-erro" role="status" className="rounded-lg border border-dashed border-warning/40 p-4 text-sm text-warning-text">
          {erro}
        </p>
      )}

      {!montagem.erro && !total && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Lance ao menos uma carga para ver a demanda do estudo.</p>
      )}

      {resultado && total && (
        <section aria-label="Resultado do estudo" className="space-y-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Subtotal por ambiente</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 pr-3 font-medium">Ambiente</th>
                  <th className="pb-1 pr-3 text-right font-medium">Cargas</th>
                  <th className="pb-1 pr-3 text-right font-medium">Instalada (kW)</th>
                  <th className="pb-1 pr-3 text-right font-medium">Demanda (kW)</th>
                  <th className="pb-1 text-right font-medium">Demanda (kVA)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {resultado.ambientes.map((x) => (
                  <tr key={x.id}>
                    <td className="pr-3 font-sans">{x.nome}</td>
                    <td className="pr-3 text-right">{x.cargas}</td>
                    <td className="pr-3 text-right">{x.resultado ? fmtNum(x.resultado.pInstaladaW / 1000, 2) : "—"}</td>
                    <td className="pr-3 text-right">{x.resultado ? fmtNum(x.resultado.pDemandadaW / 1000, 2) : "—"}</td>
                    <td className="text-right">{x.resultado ? fmtNum(x.resultado.sDemandadaVA / 1000, 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-mono font-semibold">
                <tr className="border-t">
                  <td className="pr-3 pt-1 font-sans">Total</td>
                  <td className="pr-3 pt-1 text-right">{total.linhas.length}</td>
                  <td className="pr-3 pt-1 text-right">{fmtNum(total.pInstaladaW / 1000, 2)}</td>
                  <td className="pr-3 pt-1 text-right">{fmtNum(total.pDemandadaW / 1000, 2)}</td>
                  <td className="pt-1 text-right">{fmtNum(total.sDemandadaVA / 1000, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {resultado.porTipoPonto.some((g) => g.tipo !== SEM_TIPO) && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Subtotal por tipo de ponto</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 pr-3 font-medium">Tipo do ponto</th>
                    <th className="pb-1 pr-3 text-right font-medium">Cargas</th>
                    <th className="pb-1 pr-3 text-right font-medium">Instalada (kW)</th>
                    <th className="pb-1 text-right font-medium">Demanda (kW)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {resultado.porTipoPonto.map((g) => (
                    <tr key={g.tipo}>
                      <td className="pr-3 font-sans">{g.rotulo}</td>
                      <td className="pr-3 text-right">{g.cargas}</td>
                      <td className="pr-3 text-right">{fmtNum(g.pInstaladaW / 1000, 2)}</td>
                      <td className="text-right">{fmtNum(g.pDemandadaW / 1000, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-3 grid-cols-2 sm:grid-cols-3">
            <Prop simbolo="FCT" valor={fmtNum(total.fct, 2)} un="" />
            <Prop simbolo="FCA" valor={fmtNum(total.fca, 2)} un="" />
            <Prop simbolo="P instalada" valor={fmtNum(total.pInstaladaW / 1000, 2)} un="kW" />
            <Prop simbolo="Demanda" valor={fmtNum(total.pDemandadaW / 1000, 2)} un="kW" destaque />
            <Prop simbolo="Demanda" valor={fmtNum(total.sDemandadaVA / 1000, 2)} un="kVA" destaque />
            <Prop simbolo="fp médio" valor={fmtNum(total.fpMedio, 2)} un="" />
            <Prop simbolo="I total" valor={fmtNum(total.correnteTotalA, 1)} un="A" destaque />
          </div>
          {total.alertas.map((al) => (
            <AlertaCalculo key={al}>{al}</AlertaCalculo>
          ))}

          <CollapsibleSection titulo="Corrente por carga" descricao="Ib de projeto e Ib′ corrigida por FCT × FCA, para comparar com a capacidade de condução.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Corrente e demanda por carga</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 pr-3 font-medium">Carga</th>
                    <th className="pb-1 pr-3 text-right font-medium">Ib (A)</th>
                    <th className="pb-1 pr-3 text-right font-medium">Ib′ (A)</th>
                    <th className="pb-1 text-right font-medium">Demanda (W)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {total.linhas.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-3 font-sans">{l.descricao}</td>
                      <td className="pr-3 text-right">{fmtNum(l.ib, 2)}</td>
                      <td className="pr-3 text-right">{fmtNum(l.ibCorrigida, 2)}</td>
                      <td className="text-right">{fmtNum(l.pDemandada, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          <p className="text-xs text-muted-foreground">A memória exportada (⋯) usa a última versão salva.</p>
        </section>
      )}

      <CollapsibleSection titulo="Alterações" descricao="Quem salvou este estudo e quando (últimas 20)." resumo={<span className="text-xs text-muted-foreground">{alteracoes.length}</span>}>
        {alteracoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {alteracoes.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{a.quem}</span>
                <span>{a.oQue}</span>
                <span className="text-muted-foreground">{formatarDataHora(a.quando)}</span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
