"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Flag, GripVertical, ListTree, Lock, Pin } from "lucide-react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import {
  contextoDaLinha,
  formatarPredecessoras,
  idsComFilhos,
  lerDuracao,
  lerPercentual,
  lerPredecessoras,
  linhasVisiveis,
  montarGrade,
  soAsDoFiltro,
  textoRecursos,
  type ContextoDaLinha,
  type LinhaGrade,
  type Vinculo,
} from "@/modules/planejamento/gantt-linhas";
import { montarEscala, ZOOMS_GANTT, type CalendarioGantt, type EscalaGantt, type ZoomGantt } from "@/modules/planejamento/gantt-escala";
import { caminhoDaSeta, type PosicaoBarra } from "@/modules/planejamento/gantt-setas";
import { criarCalendario, diasUteisEntre } from "@/lib/calendario-trabalho";
import { dataCurta, diasEntre } from "@/lib/dias-iso";
import { brl, cn } from "@/lib/utils";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import {
  BarraDaLinha,
  CabecalhoEscala,
  HEAD_H,
  MARCO,
  ROW_H,
  type ModoGantt,
} from "@/components/planejamento/gantt-barra";

/**
 * O cronograma do projeto no molde do MS Project: a TABELA à esquerda e o GRÁFICO à direita, nas mesmas
 * linhas, dentro de UMA área de rolagem — a tabela fica presa à esquerda e o cabeçalho preso em cima,
 * então as duas metades nunca desalinham. Duas visões, como no Project:
 *
 *  - planejamento ("Gráfico de Gantt"): EDT, tarefa, duração, início, término, predecessoras, recursos;
 *  - controle ("Gantt de Controle"): % concluído, datas, linha de base e desvio, com a barra da base
 *    logo abaixo da barra prevista.
 *
 * Apresentacional de propósito: nenhuma action, nenhum `next/*` — quem monta a tela injeta o que fazer ao
 * abrir uma linha e os botões da coluna Ações. Sem `verDatas` (quem só consulta a estrutura) o servidor já
 * mandou as datas vazias: aqui não há gráfico nem coluna de data.
 */

/** Re-exportado de `gantt-barra` (onde a barra vive): quem já importava daqui não muda. */
export type { ModoGantt } from "@/components/planejamento/gantt-barra";

/** O que se edita direto na célula. `pred` (Predecessoras) tem callback próprio: grava o conjunto inteiro. */
export type CampoEditavel = "nome" | "duracao" | "progresso" | "pred";

export type EdicaoDeCampo =
  | { campo: "nome"; nome: string }
  | { campo: "duracao"; marco: boolean; duracaoDias?: number }
  | { campo: "progresso"; progresso: number };

type Destino = "fica" | "proxima" | "anterior" | "abaixo";

export type PlanoGanttProps = {
  tarefas: EapTarefaDTO[];
  modo: ModoGantt;
  /** Rótulo da versão da linha de base desenhada ("BL-01"); a legenda o cita. */
  rotuloBase?: string;
  calendario: CalendarioGantt;
  verDatas: boolean;
  mostrarCusto: boolean;
  /** `YYYY-MM-DD` de hoje (a linha vermelha do gráfico). */
  hoje: string;
  /** Ids que passaram nos filtros; `null` = sem filtro (a árvore, com recolher e expandir). */
  filtroIds: ReadonlySet<string> | null;
  /** Abre a janela completa da linha (duplo clique ou Enter na linha) — só para quem monta o cronograma. */
  onAbrir?: (t: EapTarefaDTO) => void;
  /**
   * Edição direto na célula, como no Project (Nome, Duração, % concluído) — só para quem monta o cronograma.
   * Devolve a mensagem de erro do servidor, ou `null` se gravou. Quem chama serializa as gravações: cada uma
   * reagenda o projeto, e a segunda trabalharia sobre datas velhas.
   */
  onEditarCampo?: (t: EapTarefaDTO, edicao: EdicaoDeCampo) => Promise<string | null>;
  /** A célula Predecessoras: o conjunto inteiro de uma vez. */
  onEditarPredecessoras?: (t: EapTarefaDTO, vinculos: Vinculo[]) => Promise<string | null>;
  /** Uma edição que o texto digitado não permite (o que o servidor nem chega a ver). */
  onErro?: (mensagem: string) => void;
  /**
   * Ações da linha (inserir, recuar, avançar, excluir…): o MESMO array alimenta o menu de contexto, o `...` e os
   * atalhos de teclado (ADR-0002). Vem do descritor puro `itensDeLinhaEap`; sem itens a linha fica sem menu.
   */
  menuDe?: (t: EapTarefaDTO, contexto: ContextoDaLinha) => AcaoItem[];
  onAcao?: (t: EapTarefaDTO, item: AcaoItemAcao) => void;
  /**
   * Arrastar a linha pela alça da coluna EDT (como no Project): ela vai para antes/depois de `alvoId`, no nível dele, com as
   * subtarefas junto. Sem esta prop não há alça. Mover para cima/baixo pelo teclado passa pelo menu (`onAcao`).
   */
  onMover?: (t: EapTarefaDTO, alvoId: string, posicao: "antes" | "depois") => void;
  /** Uma linha recém-criada cujo nome deve abrir em edição assim que ela aparecer na tabela. */
  focoNomeId?: string | null;
  onFocoConsumido?: () => void;
  /** Botões da coluna Ações, por linha (os de uso frequente; o resto está no `...`). */
  acoes?: (t: EapTarefaDTO) => ReactNode;
  className?: string;
};



type Linha = LinhaGrade<EapTarefaDTO>;

type Coluna = {
  id: string;
  rotulo: string;
  w: number;
  alinhar?: "right" | "center";
  /** Some na tabela compacta. */
  secundaria?: boolean;
  render: (l: Linha) => ReactNode;
};

const diasDeDesvio = (t: EapTarefaDTO) => (t.fimBaseline && t.fimPrevisto ? diasEntre(t.fimBaseline, t.fimPrevisto) : null);

function zoomInicial(tarefas: EapTarefaDTO[]): ZoomGantt {
  const ini = tarefas.map((t) => t.inicioPrevisto).filter(Boolean).sort();
  const fim = tarefas.map((t) => t.fimPrevisto).filter(Boolean).sort();
  if (ini.length === 0 || fim.length === 0) return "semanas";
  const span = diasEntre(ini[0], fim[fim.length - 1]);
  return span <= 45 ? "dias" : span <= 240 ? "semanas" : "meses";
}

export function PlanoGantt({
  tarefas,
  modo,
  calendario,
  verDatas,
  mostrarCusto,
  hoje,
  filtroIds,
  onAbrir,
  onEditarCampo,
  onEditarPredecessoras,
  onErro,
  menuDe,
  onAcao,
  onMover,
  focoNomeId = null,
  onFocoConsumido,
  acoes,
  rotuloBase,
  className,
}: PlanoGanttProps) {
  const [zoom, setZoom] = useState<ZoomGantt>(() => zoomInicial(tarefas));
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  // Com gráfico, a tabela abre compacta (como o Project abre só com as colunas básicas): a completa deixa o gráfico
  // com uma nesga de tela. Sem gráfico (sem datas) não há o que poupar.
  const [compacto, setCompacto] = useState(verDatas);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ id: string; campo: CampoEditavel } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [invalida, setInvalida] = useState(false);
  // O que a pessoa acabou de gravar aparece já, sem esperar a tela recarregar; some quando chegam os dados novos
  // (guardado junto da lista que existia na hora — derivado, sem efeito para limpar).
  const [gravados, setGravados] = useState<{ base: EapTarefaDTO[]; valores: Record<string, string> }>({ base: tarefas, valores: {} });
  const valoresGravados = gravados.base === tarefas ? gravados.valores : {};
  const rolagemRef = useRef<HTMLDivElement>(null);
  // Arrasto em curso: a linha e o que vai com ela (não se solta dentro de si mesma); e onde ela cairia agora.
  const [arrasto, setArrasto] = useState<{ id: string; junto: ReadonlySet<string> } | null>(null);
  const [destino, setDestino] = useState<{ id: string; posicao: "antes" | "depois" } | null>(null);

  const grade = useMemo(() => montarGrade(tarefas), [tarefas]);
  // A linha se identifica pelo CÓDIGO da EAP (1.2.3): é o que a coluna EDT mostra e o que as predecessoras citam.
  const codigoPorId = useMemo(() => new Map(grade.map((l) => [l.t.id, l.codigo])), [grade]);
  const idPorCodigo = useMemo(() => new Map(grade.map((l) => [l.codigo, l.t.id])), [grade]);
  const contextos = useMemo(() => new Map(grade.map((l, i) => [l.t.id, contextoDaLinha(grade, i)])), [grade]);
  const linhas: Linha[] = useMemo(
    () => (filtroIds ? soAsDoFiltro(grade, filtroIds) : linhasVisiveis(grade, recolhidos)),
    [grade, filtroIds, recolhidos],
  );
  const cal = useMemo(() => criarCalendario({ diasSemana: calendario.diasUteis, feriados: calendario.feriados }), [calendario]);

  // A escala cobre TODAS as linhas (não só as visíveis): filtrar ou recolher não pode mexer o gráfico de lugar.
  const escala: EscalaGantt | null = useMemo(() => {
    if (!verDatas) return null;
    const datas = tarefas.flatMap((t) => [t.inicioPrevisto, t.fimPrevisto, t.inicioBaseline, t.fimBaseline]).filter((d): d is string => !!d);
    const ord = [...datas].sort();
    return montarEscala({ min: ord[0] ?? hoje, max: ord[ord.length - 1] ?? hoje, zoom, calendario });
  }, [verDatas, tarefas, zoom, calendario, hoje]);

  const podeEditar = !!onEditarCampo;
  const podeEditarPred = !!onEditarPredecessoras;
  // Agrupamento só edita o nome: duração, % e predecessoras derivam dos filhos (Doc 03 §23). Marco não tem % digitado.
  const ehEditavel = (l: Linha, campo: CampoEditavel): boolean => {
    if (campo === "nome") return podeEditar;
    if (l.temFilhos) return false;
    if (campo === "duracao") return podeEditar;
    if (campo === "progresso") return podeEditar && !l.t.marco;
    return podeEditarPred;
  };
  const camposDaVisao: CampoEditavel[] = !verDatas ? ["nome", "duracao", "progresso", "pred"] : modo === "planejamento" ? ["nome", "duracao", "pred"] : ["nome", "progresso"];

  const textoInicial = (l: Linha, campo: CampoEditavel): string => {
    const t = l.t;
    if (campo === "nome") return t.nome;
    if (campo === "duracao") return t.marco ? "0" : String(t.duracaoDias).replace(".", ",");
    if (campo === "progresso") return String(t.progresso);
    return formatarPredecessoras(t.predecessoras, codigoPorId);
  };

  /** A célula seguinte na ordem da tabela: Tab e Shift+Tab andam pela linha, Enter desce na mesma coluna. */
  const vizinha = (id: string, campo: CampoEditavel, destino: Exclude<Destino, "fica">) => {
    const celulas = linhas.flatMap((l) => camposDaVisao.filter((c) => ehEditavel(l, c)).map((c) => ({ id: l.t.id, campo: c })));
    const i = celulas.findIndex((c) => c.id === id && c.campo === campo);
    if (i < 0) return null;
    if (destino === "proxima") return celulas[i + 1] ?? null;
    if (destino === "anterior") return celulas[i - 1] ?? null;
    return celulas.slice(i + 1).find((c) => c.campo === campo) ?? null;
  };

  const iniciar = (id: string, campo: CampoEditavel) => {
    setSelecionadaId(id);
    setInvalida(false);
    setEdicao({ id, campo });
  };
  const cancelar = () => {
    setInvalida(false);
    setEdicao(null);
  };

  // Linha recém-inserida (ou criada por outro caminho): quando ela chega na tabela, o nome já abre para digitar.
  useEffect(() => {
    if (!focoNomeId || !tarefas.some((t) => t.id === focoNomeId)) return;
    // Sincroniza com um pedido de fora ("edite esta linha"), não com estado derivado.
    iniciar(focoNomeId, "nome");
    onFocoConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o pedido ou a lista mudam
  }, [focoNomeId, tarefas]);

  /** Lê o texto, pede a gravação e devolve se deu certo (ou se nada mudou). */
  async function executar(l: Linha, campo: CampoEditavel, texto: string): Promise<boolean> {
    const t = l.t;
    let exibir: string;
    let erro: string | null;
    if (campo === "nome") {
      const nome = texto.trim();
      if (!nome) {
        onErro?.("Informe o nome.");
        return false;
      }
      if (nome === t.nome) return true;
      exibir = nome;
      erro = await onEditarCampo!(t, { campo: "nome", nome });
    } else if (campo === "duracao") {
      const r = lerDuracao(texto);
      if (!r.ok) {
        onErro?.(r.erro);
        return false;
      }
      if (r.marco ? t.marco : !t.marco && t.duracaoDias === r.dias) return true;
      exibir = r.marco ? "marco" : `${r.dias}d`;
      erro = await onEditarCampo!(t, { campo: "duracao", marco: r.marco, duracaoDias: r.marco ? undefined : r.dias });
    } else if (campo === "progresso") {
      const r = lerPercentual(texto);
      if (!r.ok) {
        onErro?.(r.erro);
        return false;
      }
      if (r.valor === t.progresso) return true;
      exibir = `${r.valor}%`;
      erro = await onEditarCampo!(t, { campo: "progresso", progresso: r.valor });
    } else {
      const r = lerPredecessoras(texto, idPorCodigo, t.id);
      if (!r.ok) {
        onErro?.(r.erro);
        return false;
      }
      exibir = formatarPredecessoras(r.vinculos, codigoPorId);
      if (exibir === formatarPredecessoras(t.predecessoras, codigoPorId)) return true;
      erro = await onEditarPredecessoras!(t, r.vinculos);
    }
    if (erro) {
      onErro?.(erro);
      return false;
    }
    setGravados({ base: tarefas, valores: { ...valoresGravados, [`${t.id}:${campo}`]: exibir } });
    return true;
  }

  async function confirmar(l: Linha, campo: CampoEditavel, texto: string, destino: Destino): Promise<boolean> {
    setSalvando(true);
    const ok = await executar(l, campo, texto);
    setSalvando(false);
    if (!ok) {
      setInvalida(true);
      return false;
    }
    setInvalida(false);
    const prox = destino === "fica" ? null : vizinha(l.t.id, campo, destino);
    setEdicao(prox);
    if (prox) setSelecionadaId(prox.id);
    return true;
  }

  /** Envolve o conteúdo de uma célula na edição direto na tabela, quando a linha e a pessoa permitem. */
  const envolver = (l: Linha, campo: CampoEditavel, rotulo: string, conteudo: ReactNode): ReactNode =>
    ehEditavel(l, campo) ? (
      <CelulaEditavel
        ativa={edicao?.id === l.t.id && edicao.campo === campo}
        salvando={salvando}
        invalida={invalida}
        valorInicial={textoInicial(l, campo)}
        rotulo={`${rotulo} da tarefa ${l.codigo}`}
        aoIniciar={() => iniciar(l.t.id, campo)}
        aoConfirmar={(texto, destino) => confirmar(l, campo, texto, destino)}
        aoCancelar={cancelar}
        aoDigitar={() => setInvalida(false)}
      >
        {conteudo}
      </CelulaEditavel>
    ) : (
      conteudo
    );
  const gravado = (id: string, campo: CampoEditavel) => valoresGravados[`${id}:${campo}`];

  // Arrastar só na árvore inteira: com filtro, "logo acima" na tela não é a linha de cima de verdade.
  const podeArrastar = !!onMover && !filtroIds;
  function iniciarArrasto(l: Linha, e: DragEvent) {
    const i = grade.findIndex((g) => g.t.id === l.t.id);
    const junto = new Set([l.t.id]);
    for (let j = i + 1; j < grade.length && grade[j].nivel > l.nivel; j++) junto.add(grade[j].t.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", l.t.nome);
    setArrasto({ id: l.t.id, junto });
  }
  function encerrarArrasto() {
    setArrasto(null);
    setDestino(null);
  }
  function sobreLinha(l: Linha, e: DragEvent<HTMLDivElement>) {
    if (!arrasto || arrasto.junto.has(l.t.id)) return; // sem preventDefault o navegador recusa soltar aqui
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const posicao = e.clientY - r.top < r.height / 2 ? "antes" : "depois";
    if (destino?.id !== l.t.id || destino.posicao !== posicao) setDestino({ id: l.t.id, posicao });
  }
  function soltarNaLinha(e: DragEvent) {
    e.preventDefault();
    if (arrasto && destino) {
      let alvo = destino;
      // Logo abaixo de um agrupamento ABERTO fica a primeira subtarefa dele: é lá que a linha aparece caindo.
      const i = grade.findIndex((g) => g.t.id === destino.id);
      if (destino.posicao === "depois" && grade[i]?.temFilhos && !recolhidos.has(destino.id) && grade[i + 1]) {
        alvo = { id: grade[i + 1].t.id, posicao: "antes" };
      }
      const movida = grade.find((g) => g.t.id === arrasto.id)?.t;
      if (movida && alvo.id !== arrasto.id) onMover?.(movida, alvo.id, alvo.posicao);
    }
    encerrarArrasto();
  }

  const colunas: Coluna[] = useMemo(() => {
    const cs: Coluna[] = [];
    const nome: Coluna = {
      id: "nome",
      rotulo: "Nome da tarefa",
      w: 300,
      render: (l) => {
        const t = l.t;
        const recolhido = recolhidos.has(t.id);
        return (
          <div className="flex min-w-0 items-center" style={{ paddingLeft: 6 + (l.nivel - 1) * 16 }}>
            {l.temFilhos && !filtroIds ? (
              <button
                type="button"
                aria-label={recolhido ? `Expandir ${t.nome}` : `Recolher ${t.nome}`}
                aria-expanded={!recolhido}
                onClick={(e) => {
                  e.stopPropagation();
                  setRecolhidos((atual) => {
                    const novo = new Set(atual);
                    if (novo.has(t.id)) novo.delete(t.id);
                    else novo.add(t.id);
                    return novo;
                  });
                }}
                className="mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {recolhido ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            ) : (
              <span className="mr-0.5 inline-block size-4 shrink-0" aria-hidden />
            )}
            {t.marco && <Flag className="mr-1 size-3 shrink-0 text-primary" aria-label="Marco" />}
            {t.status === "blq" && <Lock className="mr-1 size-3 shrink-0 text-destructive" aria-label="Bloqueada" />}
            {t.status === "con" && (
              <CheckCircle2
                className="mr-1 size-3 shrink-0 text-success"
                aria-label={t.fimReal ? `Concluída em ${dataCurta(t.fimReal)}` : "Concluída"}
              />
            )}
            {t.restricaoTipo && <Pin className="mr-1 size-3 shrink-0 text-muted-foreground" aria-label="Data fixada" />}
            {envolver(
              l,
              "nome",
              "Nome",
              <span className={cn("truncate text-xs", l.temFilhos ? "font-semibold" : "font-medium")} title={t.nome}>
                {gravado(t.id, "nome") ?? t.nome}
              </span>,
            )}
          </div>
        );
      },
    };
    // Reunião de 29/09/2026: no lugar do Nº (posição na lista), o código da EAP — 1, 1.1, 1.1.1… —, que se refaz
    // sozinho ao mover linha. É ele que as predecessoras citam. Largura para até quatro níveis de dois dígitos.
    const codigo: Coluna = {
      id: "codigo",
      rotulo: "EDT",
      w: podeArrastar ? 96 : 76,
      alinhar: "right",
      render: (l) => (
        <span className="flex w-full items-center justify-end gap-1">
          {podeArrastar && (
            <span
              draggable
              onDragStart={(e) => iniciarArrasto(l, e)}
              onDragEnd={encerrarArrasto}
              title="Arraste para mover a tarefa, com as subtarefas"
              aria-hidden
              className="mr-auto cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/linha:opacity-70 hover:!opacity-100 active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </span>
          )}
          <span className="font-mono text-[11px] text-muted-foreground" title={`Código da EAP: ${l.codigo}`}>
            {l.codigo}
          </span>
        </span>
      ),
    };
    const duracao: Coluna = {
      id: "duracao",
      rotulo: "Duração",
      w: 76,
      render: (l) => {
        const t = l.t;
        // Agrupamento não tem duração própria: é o que sobra entre o menor início e o maior término, em dias úteis.
        const dias = l.temFilhos && t.inicioPrevisto && t.fimPrevisto ? diasUteisEntre(t.inicioPrevisto, t.fimPrevisto, cal) : t.duracaoDias;
        const texto = gravado(t.id, "duracao") ?? (t.marco ? "marco" : l.temFilhos && !t.inicioPrevisto ? "—" : `${dias}d`);
        return envolver(l, "duracao", "Duração", <span className="font-mono text-xs text-muted-foreground">{texto}</span>);
      },
    };
    const inicio: Coluna = {
      id: "inicio",
      rotulo: "Início",
      w: 84,
      render: (l) => <span className="font-mono text-xs">{dataCurta(l.t.inicioPrevisto) || "—"}</span>,
    };
    const termino: Coluna = {
      id: "termino",
      rotulo: "Término",
      w: 84,
      render: (l) => <span className="font-mono text-xs">{dataCurta(l.t.fimPrevisto) || "—"}</span>,
    };
    const progresso: Coluna = {
      id: "progresso",
      rotulo: "% concl.",
      w: 128,
      render: (l) => {
        const gravadoPct = gravado(l.t.id, "progresso");
        const pct = gravadoPct ? Number.parseInt(gravadoPct, 10) : l.t.progresso;
        return envolver(
          l,
          "progresso",
          "% concluído",
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-14 overflow-hidden rounded-sm bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
            {l.t.progressoDerivado && (
              <span className="text-[9px] uppercase text-muted-foreground" title="Agrupamento: o avanço é calculado dos filhos, ponderado por horas">
                calc
              </span>
            )}
          </div>,
        );
      },
    };
    const predecessoras: Coluna = {
      id: "pred",
      rotulo: "Predecessoras",
      w: 112,
      render: (l) => {
        const texto = gravado(l.t.id, "pred") ?? formatarPredecessoras(l.t.predecessoras, codigoPorId);
        return envolver(l, "pred", "Predecessoras", <span className="truncate font-mono text-xs text-muted-foreground" title={texto}>{texto}</span>);
      },
    };
    const recursos: Coluna = {
      id: "recursos",
      rotulo: "Nomes dos recursos",
      w: 180,
      secundaria: true,
      render: (l) => {
        const t = l.t;
        if (l.temFilhos) return <span className="text-xs text-muted-foreground">—</span>;
        const texto = textoRecursos(t.atribuicoes, t.deTerceiro);
        const semHoras = t.trabalhoHoras == null && !t.deTerceiro && t.atribuicoes.length > 0 && !t.marco;
        return texto ? (
          <span className="flex min-w-0 items-center gap-1 text-xs" title={t.atribuicoes.map((a) => `${a.nome ?? `(perfil) ${a.rotuloPapel}`} · ${a.rotuloPapel}`).join("\n") || undefined}>
            <span className={cn("truncate", t.deTerceiro && "text-muted-foreground")}>{texto}</span>
            {semHoras && <span className="shrink-0 text-[10px] text-warning" title="Alguma pessoa nesta linha ainda não tem horas estimadas">s/h</span>}
          </span>
        ) : t.marco ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="text-xs text-warning">sem gente</span>
        );
      },
    };
    const disciplina: Coluna = {
      id: "disciplina",
      rotulo: "Disciplina",
      w: 130,
      secundaria: true,
      render: (l) => (
        <span className="truncate text-xs text-muted-foreground" title={l.t.disciplinaNome ?? undefined}>
          {l.t.disciplinaNome ?? "—"}
          {l.t.etapaSigla && <span className="ml-1 font-mono text-[10px]">· {l.t.etapaSigla}</span>}
        </span>
      ),
    };
    const custo: Coluna = {
      id: "custo",
      rotulo: "Custo",
      w: 100,
      alinhar: "right",
      secundaria: true,
      render: (l) => (
        <span className={cn("font-mono text-xs", l.temFilhos ? "" : "text-muted-foreground")}>
          {l.t.custo != null ? brl(l.t.custo) : l.t.custoMotivo === "perfil" || l.t.custoMotivo === "sem_custo_hora" ? <span className="text-warning">s/ custo</span> : "—"}
        </span>
      ),
    };
    const inicioBase: Coluna = {
      id: "inicioBase",
      rotulo: "Início base",
      w: 84,
      secundaria: true,
      render: (l) => <span className="font-mono text-xs text-muted-foreground">{dataCurta(l.t.inicioBaseline) || "—"}</span>,
    };
    const terminoBase: Coluna = {
      id: "terminoBase",
      rotulo: "Término base",
      w: 84,
      secundaria: true,
      render: (l) => <span className="font-mono text-xs text-muted-foreground">{dataCurta(l.t.fimBaseline) || "—"}</span>,
    };
    const desvio: Coluna = {
      id: "desvio",
      rotulo: "Desvio",
      w: 84,
      alinhar: "right",
      render: (l) => {
        const d = diasDeDesvio(l.t);
        if (d == null) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-[11px]",
              d > 0 ? "border-destructive/40 text-destructive" : d < 0 ? "border-success/40 text-success" : "text-muted-foreground",
            )}
          >
            {d > 0 ? `+${d}d` : d < 0 ? `${d}d` : "no prazo"}
          </span>
        );
      },
    };
    const acoesCol: Coluna | null =
      acoes || menuDe
        ? {
            id: "acoes",
            rotulo: "Ações",
            w: 92,
            alinhar: "right",
            render: (l) => (
              <div className="flex items-center justify-end gap-0.5">
                {acoes?.(l.t)}
                {menuDe && (
                  <BotaoAcoes
                    itens={menuDe(l.t, contextos.get(l.t.id)!)}
                    onSelect={(item) => onAcao?.(l.t, item)}
                    rotulo={`Ações da tarefa ${l.codigo}: ${l.t.nome}`}
                  />
                )}
              </div>
            ),
          }
        : null;

    if (!verDatas) cs.push(codigo, nome, disciplina, duracao, progresso, predecessoras, recursos);
    else if (modo === "planejamento") cs.push(codigo, nome, disciplina, duracao, inicio, termino, predecessoras, recursos);
    else cs.push(codigo, nome, progresso, inicio, termino, inicioBase, terminoBase, desvio);
    if (mostrarCusto && (modo === "planejamento" || !verDatas)) cs.push(custo);
    if (acoesCol) cs.push(acoesCol);
    return compacto ? cs.filter((c) => !c.secundaria) : cs;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `envolver`/`gravado` releem o estado da edição a cada render
  }, [modo, verDatas, mostrarCusto, compacto, acoes, codigoPorId, recolhidos, filtroIds, cal, edicao, salvando, invalida, valoresGravados, podeEditar, podeEditarPred, idPorCodigo, menuDe, onAcao, contextos, podeArrastar, grade]);

  const larguraTabela = colunas.reduce((s, c) => s + c.w, 0);

  // Geometria das barras (só com datas): uma vez por linha visível, para as barras e para as setas.
  const geometria = useMemo(() => {
    const porId = new Map<string, { x: number; w: number; pos: PosicaoBarra }>();
    if (!escala) return porId;
    linhas.forEach((l, i) => {
      const t = l.t;
      if (!t.inicioPrevisto || !t.fimPrevisto) return;
      const x = escala.x(t.inicioPrevisto);
      const w = Math.max(escala.pxPorDia, escala.xFim(t.fimPrevisto) - x);
      const y = i * ROW_H + ROW_H / 2;
      const centro = x + escala.pxPorDia / 2;
      const pos: PosicaoBarra = t.marco ? { xIni: centro - MARCO * 0.7, xFim: centro + MARCO * 0.7, y } : { xIni: x, xFim: x + w, y };
      porId.set(t.id, { x, w, pos });
    });
    return porId;
  }, [escala, linhas]);

  const setas = useMemo(() => {
    const out: { chave: string; d: string }[] = [];
    for (const l of linhas) {
      const suc = geometria.get(l.t.id);
      if (!suc) continue;
      for (const v of l.t.predecessoras) {
        const pred = geometria.get(v.predecessoraId);
        if (!pred) continue;
        out.push({ chave: `${v.predecessoraId}>${l.t.id}`, d: caminhoDaSeta(v.tipo, pred.pos, suc.pos, ROW_H) });
      }
    }
    return out;
  }, [linhas, geometria]);

  // Abre já com o "hoje" à vista — sem isto o projeto que começou meses atrás abre no passado. A tabela fica presa
  // à esquerda e cobre a rolagem, então a janela do gráfico é o que sobra dela: o "hoje" vai para 30% dessa janela.
  const irParaHoje = () => {
    const el = rolagemRef.current;
    if (!el || !escala || !escala.contem(hoje)) return;
    const janelaDoGrafico = Math.max(0, el.clientWidth - larguraTabela);
    el.scrollLeft = Math.max(0, escala.x(hoje) - janelaDoGrafico * 0.3);
  };
  useEffect(() => {
    irParaHoje();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura e ao trocar de zoom
  }, [zoom, verDatas]);

  const todosIds = useMemo(() => idsComFilhos(grade), [grade]);
  const temNivel = todosIds.length > 0;

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {verDatas && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Escala</span>
            <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Escala de tempo">
              {ZOOMS_GANTT.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  aria-pressed={zoom === z.id}
                  onClick={() => setZoom(z.id)}
                  className={cn("px-2.5 py-1 text-xs", zoom === z.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {z.rotulo}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" type="button" onClick={irParaHoje} disabled={!escala?.contem(hoje)} title="Rolar o gráfico até a data de hoje">
              Hoje
            </Button>
          </div>
        )}
        {temNivel && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" type="button" disabled={!!filtroIds} onClick={() => setRecolhidos(new Set(todosIds))} title="Recolher todos os agrupamentos">
              <ChevronsDownUp className="size-3.5" /> Recolher
            </Button>
            <Button size="sm" variant="outline" type="button" disabled={!!filtroIds} onClick={() => setRecolhidos(new Set())} title="Expandir todos os agrupamentos">
              <ChevronsUpDown className="size-3.5" /> Expandir
            </Button>
          </div>
        )}
        <Button size="sm" variant="outline" type="button" aria-pressed={compacto} onClick={() => setCompacto((c) => !c)} title="Esconde as colunas secundárias para dar mais espaço ao gráfico">
          {compacto ? "Tabela completa" : "Tabela compacta"}
        </Button>
        {filtroIds && <span className="text-xs text-muted-foreground">Filtro ativo: mostrando só {linhas.length} linha(s), sem os níveis.</span>}
      </div>

      {linhas.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhuma tarefa para os filtros selecionados" className="py-10" />
      ) : (
        <div ref={rolagemRef} className="relative max-h-[72vh] overflow-auto rounded-sm border bg-background" role="region" aria-label="Cronograma: tabela e gráfico">
          <div className="flex min-w-max">
            {/* ── Tabela ── */}
            <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: larguraTabela }} role="table" aria-label="Tarefas">
              <div className="sticky top-0 z-30 flex border-b bg-muted" style={{ height: HEAD_H }} role="row">
                {colunas.map((c) => (
                  <div
                    key={c.id}
                    role="columnheader"
                    className={cn(
                      "flex shrink-0 items-center border-r px-2 font-mono text-[10px] uppercase leading-tight tracking-[0.08em] text-muted-foreground last:border-r-0",
                      c.alinhar === "right" && "justify-end text-right",
                      c.alinhar === "center" && "justify-center text-center",
                    )}
                    style={{ width: c.w }}
                  >
                    {c.rotulo}
                  </div>
                ))}
              </div>
              {linhas.map((l) => {
                const itens = menuDe ? menuDe(l.t, contextos.get(l.t.id)!) : [];
                // Atalho = o mesmo item do menu: se está desabilitado (ou não existe para o perfil), a tecla não faz nada.
                const atalho = (id: string) => {
                  const item = itens.find((i): i is AcaoItemAcao => i.tipo === "acao" && i.id === id && !i.desabilitado);
                  if (item) onAcao?.(l.t, item);
                };
                return (
                  <LinhaComMenu
                    key={l.t.id}
                    itens={itens}
                    onSelect={(item) => onAcao?.(l.t, item)}
                    aoAbrir={(aberto) => {
                      if (aberto) setSelecionadaId(l.t.id);
                    }}
                    render={
                      <div
                        role="row"
                        tabIndex={0}
                        aria-selected={selecionadaId === l.t.id}
                        onClick={() => setSelecionadaId(l.t.id)}
                        onDoubleClick={() => onAbrir?.(l.t)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return; // teclas de dentro de uma célula em edição não chegam aqui
                          if (e.key === "F2" && ehEditavel(l, "nome")) {
                            e.preventDefault();
                            iniciar(l.t.id, "nome");
                          } else if (e.key === "Insert") {
                            e.preventDefault();
                            atalho("inserir-acima");
                          } else if (e.key === "Delete") {
                            e.preventDefault();
                            atalho("excluir");
                          } else if (e.altKey && e.shiftKey && e.key === "ArrowRight") {
                            e.preventDefault();
                            atalho("recuar");
                          } else if (e.altKey && e.shiftKey && e.key === "ArrowLeft") {
                            e.preventDefault();
                            atalho("avancar");
                          } else if (e.altKey && e.shiftKey && e.key === "ArrowUp") {
                            e.preventDefault();
                            atalho("mover-cima");
                          } else if (e.altKey && e.shiftKey && e.key === "ArrowDown") {
                            e.preventDefault();
                            atalho("mover-baixo");
                          } else if ((e.key === "Enter" || e.key === " ") && onAbrir) {
                            e.preventDefault();
                            onAbrir(l.t);
                          }
                        }}
                        onMouseEnter={() => setHoverId(l.t.id)}
                        onMouseLeave={() => setHoverId((h) => (h === l.t.id ? null : h))}
                        onDragOver={podeArrastar ? (e) => sobreLinha(l, e) : undefined}
                        onDrop={podeArrastar ? soltarNaLinha : undefined}
                        className={cn(
                          "group/linha flex border-b bg-background",
                          // Reunião de 29/09/2026: o agrupamento mais escuro que a tarefa, para a estrutura saltar
                          // aos olhos. No hover ele escurece mais um degrau, senão não mudaria nada.
                          l.temFilhos && "bg-muted",
                          hoverId === l.t.id && (l.temFilhos ? "bg-border/60" : "bg-muted"),
                          selecionadaId === l.t.id && "bg-primary/10",
                          arrasto?.junto.has(l.t.id) && "opacity-50",
                          // Onde a linha vai cair: um traço em cima ou embaixo desta.
                          destino?.id === l.t.id &&
                            (destino.posicao === "antes"
                              ? "shadow-[inset_0_2px_0_0_var(--color-primary)]"
                              : "shadow-[inset_0_-2px_0_0_var(--color-primary)]"),
                        )}
                        style={{ height: ROW_H }}
                      />
                    }
                  >
                    {colunas.map((c) => (
                      <div
                        key={c.id}
                        role="cell"
                        className={cn(
                          "flex min-w-0 shrink-0 items-center overflow-hidden border-r border-border/50 px-2 last:border-r-0",
                          c.alinhar === "right" && "justify-end",
                          c.alinhar === "center" && "justify-center",
                          c.id === "nome" && "px-0 pr-2",
                        )}
                        style={{ width: c.w }}
                      >
                        {c.render(l)}
                      </div>
                    ))}
                  </LinhaComMenu>
                );
              })}
            </div>

            {/* ── Gráfico ── */}
            {escala && (
              <div className="relative shrink-0" style={{ width: escala.largura }}>
                <div className="sticky top-0 z-10 border-b bg-muted" style={{ height: HEAD_H }} aria-hidden>
                  <CabecalhoEscala escala={escala} />
                </div>

                <div className="relative" style={{ height: linhas.length * ROW_H }}>
                  {/* dia não útil */}
                  {escala.naoUteis.map((f) => (
                    <div key={f.x} className="absolute inset-y-0 bg-muted/70" style={{ left: f.x, width: f.largura }} aria-hidden />
                  ))}
                  {/* divisas das faixas de cima (semana, mês ou ano) */}
                  {escala.topo.map((f) => (
                    <div key={`d${f.chave}`} className="absolute inset-y-0 w-px bg-border/70" style={{ left: f.x }} aria-hidden />
                  ))}
                  {/* linhas: uma faixa por linha da tabela, com as barras dentro */}
                  {linhas.map((l, i) => (
                    <BarraDaLinha
                      key={l.t.id}
                      l={l}
                      modo={modo}
                      escala={escala}
                      geo={geometria.get(l.t.id)}
                      top={i * ROW_H}
                      destaque={hoverId === l.t.id || selecionadaId === l.t.id}
                      onHover={(h) => setHoverId((atual) => (h ? l.t.id : atual === l.t.id ? null : atual))}
                      onSelecionar={() => setSelecionadaId(l.t.id)}
                      onAbrir={onAbrir}
                    />
                  ))}
                  {/* setas de dependência */}
                  <svg className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible text-muted-foreground" width={escala.largura} height={linhas.length * ROW_H} aria-hidden>
                    <defs>
                      <marker id="plano-seta" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M 0 0 L 6 3 L 0 6 Z" fill="currentColor" />
                      </marker>
                    </defs>
                    {setas.map((s) => (
                      <path key={s.chave} d={s.d} stroke="currentColor" strokeWidth="1.25" fill="none" opacity="0.75" markerEnd="url(#plano-seta)" />
                    ))}
                  </svg>
                  {/* hoje */}
                  {escala.contem(hoje) && (
                    <div className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-destructive/70" style={{ left: escala.x(hoje) + escala.pxPorDia / 2 }} title="Hoje" aria-hidden />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {verDatas && linhas.length > 0 && <Legenda modo={modo} tarefas={tarefas} rotuloBase={rotuloBase} />}
    </div>
  );
}

/**
 * A célula que vira campo de texto ao clicar: Enter grava e desce, Tab grava e vai para a próxima, Esc desiste, e
 * sair do campo (clicar fora) grava. O valor vem NÃO controlado (`defaultValue`) e é lido ao confirmar — a linha
 * inteira re-renderiza a cada gravação e um campo controlado perderia o que se digita. Definida no nível do módulo:
 * dentro do componente pai ela remontaria a cada render e o campo perderia o foco a cada tecla.
 */
function CelulaEditavel({
  ativa,
  salvando,
  invalida,
  valorInicial,
  rotulo,
  aoIniciar,
  aoConfirmar,
  aoCancelar,
  aoDigitar,
  children,
}: {
  ativa: boolean;
  salvando: boolean;
  invalida: boolean;
  valorInicial: string;
  rotulo: string;
  aoIniciar: () => void;
  aoConfirmar: (texto: string, destino: Destino) => Promise<boolean>;
  aoCancelar: () => void;
  aoDigitar: () => void;
  children: ReactNode;
}) {
  const campoRef = useRef<HTMLInputElement | null>(null);
  const encerrada = useRef(false);

  // Volta o foco depois que a gravação termina (o campo desabilita enquanto salva e perde o foco).
  useEffect(() => {
    if (ativa && !salvando) campoRef.current?.focus();
  }, [ativa, salvando]);

  if (!ativa) {
    return (
      <div
        className="flex h-6 min-w-0 flex-1 cursor-text items-center rounded-sm px-1 hover:bg-primary/5 hover:ring-1 hover:ring-primary/30"
        onClick={(e) => {
          e.stopPropagation();
          aoIniciar();
        }}
        title="Clique para editar"
      >
        {children}
      </div>
    );
  }

  const confirmar = (texto: string, destino: Destino) => {
    encerrada.current = true;
    void aoConfirmar(texto, destino).then((ok) => {
      if (!ok) encerrada.current = false; // continua editando: o próximo blur ou Enter tenta de novo
    });
  };

  return (
    <input
      ref={(el) => {
        if (el && campoRef.current !== el) {
          campoRef.current = el;
          encerrada.current = false;
          el.focus();
          el.select();
        }
      }}
      defaultValue={valorInicial}
      disabled={salvando}
      aria-label={rotulo}
      aria-invalid={invalida || undefined}
      className={cn(
        "h-6 w-full min-w-0 rounded-sm border bg-background px-1 text-xs outline-none disabled:opacity-60",
        invalida ? "border-destructive ring-1 ring-destructive/40" : "border-primary ring-1 ring-primary/40",
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={aoDigitar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar(e.currentTarget.value, "abaixo");
        } else if (e.key === "Tab") {
          e.preventDefault();
          confirmar(e.currentTarget.value, e.shiftKey ? "anterior" : "proxima");
        } else if (e.key === "Escape") {
          e.preventDefault();
          encerrada.current = true;
          aoCancelar();
        }
      }}
      onBlur={(e) => {
        if (encerrada.current) return;
        confirmar(e.currentTarget.value, "fica");
      }}
    />
  );
}

function Legenda({ modo, tarefas, rotuloBase }: { modo: ModoGantt; tarefas: EapTarefaDTO[]; rotuloBase?: string }) {
  const temCritico = tarefas.some((t) => t.critica);
  const temMarco = tarefas.some((t) => t.marco);
  const temResumo = tarefas.some((t) => tarefas.some((f) => f.parentId === t.id));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-5 rounded-sm border border-primary/50 bg-primary/25" aria-hidden /> Tarefa (o preenchimento é o % concluído)
      </span>
      {temResumo && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-5 bg-foreground" aria-hidden /> Agrupamento
        </span>
      )}
      {temMarco && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rotate-45 bg-foreground" aria-hidden /> Marco
        </span>
      )}
      {temCritico && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm border border-destructive bg-destructive/20" aria-hidden /> Caminho crítico
        </span>
      )}
      {modo === "controle" && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-5 rounded-sm bg-muted-foreground" aria-hidden /> Linha de base{rotuloBase ? ` ${rotuloBase}` : ""}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Pin className="size-3" aria-hidden /> Data fixada
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-3 bg-muted" aria-hidden /> Dia não útil
      </span>
    </div>
  );
}
