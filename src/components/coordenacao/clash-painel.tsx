"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, FileText, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { ViewerEngine, ConflitoView } from "@/modules/coordenacao/viewer/engine";
import { criarApontamentoCoordenacao } from "@/modules/coordenacao/actions";
import { formatarMetros } from "@/modules/coordenacao/medicao";
import { montarRelatorioClashHtml, type ItemRelatorioClash } from "@/modules/coordenacao/relatorio-clash";
import {
  agruparConflitos,
  chaveParCategorias,
  nomeDoLado,
  paresDeCategorias,
  rotuloCategoria,
  type ConflitoListavel,
} from "@/modules/coordenacao/conflitos-lista";
import {
  ACAO_APONTAR_CONFLITO,
  ACAO_FOCAR_CONFLITO,
  ACAO_IGNORAR_COMBINACAO,
  itensDoConflito,
} from "@/modules/coordenacao/acoes-conflito";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ModeloClash = { uploadId: string; disciplinaId: string | null; label: string };

/** Conflito do engine no formato da lista pura, sem perder o original (câmera, realce). */
type Linha = ConflitoListavel & { chave: string; view: ConflitoView };

/** Grupos desenhados por vez — um modelo real chega a centenas de elementos com conflito. */
const GRUPOS_POR_PAGINA = 100;

const numero = new Intl.NumberFormat("pt-BR");

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o snapshot."));
    reader.readAsDataURL(blob);
  });
}

function chaveIgnorados(projetoId: string) {
  return `senahub:coordenacao:clash-ignorados:${projetoId}`;
}

/** Combinações ignoradas ficam no navegador da pessoa (conveniência, não regra do projeto). */
function lerIgnorados(projetoId: string): Set<string> {
  try {
    const bruto = localStorage.getItem(chaveIgnorados(projetoId));
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function gravarIgnorados(projetoId: string, ignorados: Set<string>) {
  try {
    localStorage.setItem(chaveIgnorados(projetoId), JSON.stringify([...ignorados]));
  } catch {
    /* armazenamento indisponível: vale só nesta sessão */
  }
}

/**
 * Detecção de conflitos (clash) entre 2 disciplinas: escolhe os modelos, roda o
 * núcleo puro (AABB + refino por malha, via engine.detectarConflitos) e lista o
 * resultado AGRUPADO por elemento, com nome e categoria de cada lado. Combinações de
 * categorias inteiras podem ser ignoradas (ex.: laje do ARQ × laje do EST). Cada
 * conflito foca/realça no viewer, vira apontamento ou entra no relatório HTML.
 */
export function ClashPainel({
  engine,
  modelos,
  projetoId,
  projetoCodigo,
  projetoNome,
  podeGerir,
}: {
  engine: ViewerEngine | null;
  modelos: ModeloClash[];
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  podeGerir: boolean;
}) {
  const [modeloAId, setModeloAId] = useState<string | null>(null);
  const [modeloBId, setModeloBId] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoView[]>([]);
  const [detectando, setDetectando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [toleranciaMm, setToleranciaMm] = useState("1");
  const [refinarPorMalha, setRefinarPorMalha] = useState(true);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [limiteGrupos, setLimiteGrupos] = useState(GRUPOS_POR_PAGINA);
  const [pending, start] = useTransition();

  useEffect(() => {
    setIgnorados(lerIgnorados(projetoId));
  }, [projetoId]);

  const nomeDe = (uploadId: string) => modelos.find((m) => m.uploadId === uploadId)?.label ?? "—";

  const linhas = useMemo<Linha[]>(
    () =>
      conflitos.map((c) => ({
        chave: `${c.localIdA}:${c.localIdB}`,
        view: c,
        a: { modeloId: c.modeloIdA, localId: c.localIdA, categoria: c.categoriaA, nome: c.nomeA },
        b: { modeloId: c.modeloIdB, localId: c.localIdB, categoria: c.categoriaB, nome: c.nomeB },
        profundidade: c.profundidade,
      })),
    [conflitos],
  );
  const pares = useMemo(() => paresDeCategorias(linhas), [linhas]);
  const grupos = useMemo(() => agruparConflitos(linhas, ignorados), [linhas, ignorados]);
  const visiveis = useMemo(() => grupos.flatMap((g) => g.conflitos), [grupos]);
  const ocultos = linhas.length - visiveis.length;

  function alternarIgnorado(chave: string) {
    setIgnorados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      gravarIgnorados(projetoId, novo);
      return novo;
    });
  }

  async function detectar() {
    if (!engine || !modeloAId || !modeloBId) return;
    const tolerancia = Number(toleranciaMm.replace(",", "."));
    if (!Number.isFinite(tolerancia) || tolerancia < 0 || tolerancia > 1000) {
      toast.error("Informe uma tolerância entre 0 e 1.000 mm.");
      return;
    }
    setDetectando(true);
    setProgresso(null);
    setAtivo(null);
    setSelecionados(new Set());
    setAbertos(new Set());
    setLimiteGrupos(GRUPOS_POR_PAGINA);
    await engine.limparRealceConflito();
    try {
      const r = await engine.detectarConflitos(modeloAId, modeloBId, {
        tolerancia: tolerancia / 1000,
        refinarPorMalha,
        onProgresso: (feitos, total) => setProgresso({ feitos, total }),
      });
      setConflitos(r);
      if (r.length === 0) toast.success("Nenhum conflito encontrado entre as disciplinas escolhidas.");
      else if (refinarPorMalha) {
        const semMalha = r.filter((conflito) => conflito.metodo === "aabb").length;
        if (semMalha > 0) {
          toast.warning(
            `${numero.format(semMalha)} conflito(s) ficaram só pela caixa: a malha não pôde ser conferida a tempo ou o IFC não forneceu triângulos.`,
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao detectar conflitos.");
    } finally {
      setDetectando(false);
      setProgresso(null);
    }
  }

  async function focar(linha: Linha) {
    if (!engine) return;
    setAtivo(linha.chave);
    await engine.focarConflito(linha.view);
    await engine.realcarConflito(linha.view);
  }

  function alternarSelecionado(chave: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  function alternarAberto(chave: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  function virarApontamento(linha: Linha) {
    if (!engine) return;
    const c = linha.view;
    const modeloA = modelos.find((m) => m.uploadId === c.modeloIdA);
    start(async () => {
      await engine.focarConflito(c);
      await engine.realcarConflito(c);
      const [guidsA, guidsB] = await Promise.all([
        engine.guidsPorLocalIds(c.modeloIdA, [c.localIdA]),
        engine.guidsPorLocalIds(c.modeloIdB, [c.localIdB]),
      ]);
      const camera = engine.capturarCamera();
      const r = await criarApontamentoCoordenacao({
        projetoId,
        disciplinaId: modeloA?.disciplinaId ?? undefined,
        uploadId: c.modeloIdA,
        titulo: `Conflito: ${nomeDoLado(linha.a)} × ${nomeDoLado(linha.b)}`,
        texto:
          `Interferência detectada automaticamente entre ${nomeDe(c.modeloIdA)} e ${nomeDe(c.modeloIdB)} ` +
          `(${rotuloCategoria(c.categoriaA)} × ${rotuloCategoria(c.categoriaB)}, penetração ${formatarMetros(c.profundidade)}).`,
        guids: [...guidsA, ...guidsB],
        camera,
      });
      if (r.ok) toast.success(`Apontamento #${r.data.numero} criado a partir do conflito.`);
      else toast.error(r.error);
    });
  }

  function aoSelecionarAcao(linha: Linha, item: AcaoItemAcao) {
    if (item.id === ACAO_FOCAR_CONFLITO) void focar(linha);
    else if (item.id === ACAO_APONTAR_CONFLITO) virarApontamento(linha);
    else if (item.id === ACAO_IGNORAR_COMBINACAO) alternarIgnorado(chaveParCategorias(linha));
  }

  async function gerarRelatorio() {
    if (!engine || visiveis.length === 0) return;
    const alvo = selecionados.size > 0 ? visiveis.filter((l) => selecionados.has(l.chave)) : visiveis;
    setGerandoRelatorio(true);
    try {
      const itens: ItemRelatorioClash[] = [];
      for (const [indice, linha] of alvo.entries()) {
        const c = linha.view;
        await engine.focarConflito(c);
        await engine.realcarConflito(c);
        const blob = await engine.capturarSnapshot();
        if (!blob) continue;
        const imagemDataUrl = await blobParaDataUrl(blob);
        itens.push({
          numero: indice + 1,
          disciplinaA: nomeDe(c.modeloIdA),
          disciplinaB: nomeDe(c.modeloIdB),
          elementoA: `${nomeDoLado(linha.a)} (${rotuloCategoria(c.categoriaA)})`,
          elementoB: `${nomeDoLado(linha.b)} (${rotuloCategoria(c.categoriaB)})`,
          profundidade: formatarMetros(c.profundidade),
          imagemDataUrl,
        });
      }
      const html = montarRelatorioClashHtml(itens, {
        projetoCodigo,
        projetoNome,
        geradoEm: formatarDataHora(new Date()),
      });
      const aba = window.open("", "_blank");
      if (aba) {
        aba.document.write(html);
        aba.document.close();
      } else {
        toast.error("O navegador bloqueou a aba do relatório — permita pop-ups para este site.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o relatório.");
    } finally {
      setGerandoRelatorio(false);
    }
  }

  function limpar() {
    setConflitos([]);
    setAtivo(null);
    setSelecionados(new Set());
    void engine?.limparRealceConflito();
  }

  if (modelos.length < 2) return null;

  const textoBotao = !detectando
    ? "Detectar conflitos"
    : progresso && progresso.total > 0
      ? `Conferindo pela malha… ${numero.format(progresso.feitos)} de ${numero.format(progresso.total)}`
      : "Detectando…";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-4" /> Detecção de conflitos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Select value={modeloAId ?? ""} onValueChange={(v) => setModeloAId(v || null)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Disciplina A" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m.uploadId} value={m.uploadId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeloBId ?? ""} onValueChange={(v) => setModeloBId(v || null)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Disciplina B" />
            </SelectTrigger>
            <SelectContent>
              {modelos
                .filter((m) => m.uploadId !== modeloAId)
                .map((m) => (
                  <SelectItem key={m.uploadId} value={m.uploadId}>
                    {m.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="clash-tolerancia" className="text-xs">Tolerância (mm)</Label>
            <Input
              id="clash-tolerancia"
              type="number"
              min={0}
              max={1000}
              step={0.5}
              value={toleranciaMm}
              onChange={(evento) => setToleranciaMm(evento.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <label className="flex h-8 cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={refinarPorMalha}
              onCheckedChange={(valor) => setRefinarPorMalha(valor === true)}
            />
            Conferir pela malha
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sem conferir pela malha, vale só a caixa de cada elemento — mais rápido, mas com muitos
          falsos conflitos. Ambientes, aberturas e terreno ficam de fora.
        </p>
        <Button
          size="sm"
          className="w-full"
          disabled={!modeloAId || !modeloBId || modeloAId === modeloBId || detectando}
          onClick={detectar}
        >
          <Search className="mr-1.5 size-3.5" />
          {textoBotao}
        </Button>

        {conflitos.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs">
                  {numero.format(visiveis.length)} conflito(s) em {numero.format(grupos.length)} elemento(s)
                </p>
                {ocultos > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {numero.format(ocultos)} oculto(s) por combinação ignorada
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" onClick={gerarRelatorio} disabled={gerandoRelatorio || visiveis.length === 0}>
                  <FileText className="mr-1.5 size-3.5" />
                  {gerandoRelatorio ? "Gerando…" : selecionados.size > 0 ? `Relatório (${selecionados.size})` : "Relatório"}
                </Button>
                <Button size="sm" variant="ghost" onClick={limpar} title="Limpar resultado" aria-label="Limpar resultado">
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            <CollapsibleSection
              titulo={`Combinações (${pares.length})`}
              resumo={ignorados.size > 0 ? `${pares.filter((p) => ignorados.has(p.chave)).length} ignorada(s)` : undefined}
            >
              <div className="space-y-1">
                {pares.map((par) => (
                  <label key={par.chave} className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox
                      checked={!ignorados.has(par.chave)}
                      onCheckedChange={() => alternarIgnorado(par.chave)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {rotuloCategoria(par.categoriaA)} × {rotuloCategoria(par.categoriaB)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{numero.format(par.total)}</span>
                  </label>
                ))}
              </div>
            </CollapsibleSection>

            <ScrollArea className="max-h-[40vh]">
              <div className="relative space-y-1 pr-3">
                {grupos.slice(0, limiteGrupos).map((grupo) => {
                  const chaveGrupo = `${grupo.elemento.modeloId}:${grupo.elemento.localId}`;
                  const aberto = abertos.has(chaveGrupo);
                  return (
                    <div key={chaveGrupo} className="rounded border">
                      <button
                        type="button"
                        onClick={() => alternarAberto(chaveGrupo)}
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                        aria-expanded={aberto}
                      >
                        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !aberto && "-rotate-90")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{nomeDoLado(grupo.elemento)}</span>
                          <span className="block truncate text-muted-foreground">
                            {rotuloCategoria(grupo.elemento.categoria)} · até {formatarMetros(grupo.maiorProfundidade)}
                          </span>
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {grupo.conflitos.length}
                        </Badge>
                      </button>
                      {aberto && (
                        <div className="space-y-1 border-t p-1">
                          {grupo.conflitos.map((linha) => (
                            <LinhaConflito
                              key={linha.chave}
                              linha={linha}
                              ativo={ativo === linha.chave}
                              selecionado={selecionados.has(linha.chave)}
                              podeApontar={podeGerir}
                              apontando={pending}
                              onSelecionar={() => alternarSelecionado(linha.chave)}
                              onFocar={() => void focar(linha)}
                              onAcao={(item) => aoSelecionarAcao(linha, item)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {grupos.length > limiteGrupos && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setLimiteGrupos((n) => n + GRUPOS_POR_PAGINA)}
                  >
                    Mostrar mais {numero.format(Math.min(GRUPOS_POR_PAGINA, grupos.length - limiteGrupos))} elemento(s)
                  </Button>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Uma linha de conflito dentro do grupo — fora do pai para não remontar e fechar o menu. */
function LinhaConflito({
  linha,
  ativo,
  selecionado,
  podeApontar,
  apontando,
  onSelecionar,
  onFocar,
  onAcao,
}: {
  linha: Linha;
  ativo: boolean;
  selecionado: boolean;
  podeApontar: boolean;
  apontando: boolean;
  onSelecionar: () => void;
  onFocar: () => void;
  onAcao: (item: AcaoItemAcao) => void;
}) {
  const itens = itensDoConflito(linha.view, { podeApontar, apontando });
  const nomeB = nomeDoLado(linha.b);
  return (
    <LinhaComMenu
      itens={itens}
      onSelect={onAcao}
      render={
        <div
          className={cn(
            "flex items-center gap-2 rounded px-1.5 py-1 text-xs data-[popup-open]:bg-muted/50",
            ativo && "bg-destructive/5 ring-1 ring-destructive",
          )}
        />
      }
    >
      <Checkbox checked={selecionado} onCheckedChange={onSelecionar} aria-label={`Selecionar conflito com ${nomeB}`} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onFocar}>
        <span className="block truncate">{nomeB}</span>
        <span className="block truncate text-muted-foreground">
          {rotuloCategoria(linha.b.categoria)} · penetração {formatarMetros(linha.profundidade)}
          {linha.view.metodo === "aabb" ? " · só pela caixa" : ""}
        </span>
      </button>
      <BotaoAcoes itens={itens} onSelect={onAcao} rotulo={`Ações do conflito com ${nomeB}`} className="size-7 shrink-0" />
    </LinhaComMenu>
  );
}
