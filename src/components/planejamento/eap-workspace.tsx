"use client";

import { RecursosDaCelula } from "@/components/planejamento/recursos-celula";
import { sinalDaLinha } from "@/modules/planejamento/sinais-linha";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { brl } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Rocket,
  CalendarCheck,
  ExternalLink,
  X,
} from "lucide-react";
import {
  aplicarAoProjeto,
  avancarEapTarefa,
  definirPredecessorasDaLinha,
  editarEapTarefa,
  excluirEapTarefa,
  gerarTarefaDeEap,
  inserirEapTarefaAcima,
  apagarEap,
  avancarEapTarefas,
  colarEapBloco,
  definirInicioEapTarefa,
  definirTerminoEapTarefa,
  excluirEapTarefas,
  moverEapTarefasNoNivel,
  recuarEapTarefas,
  moverEapTarefa,
  moverEapTarefaNoNivel,
  reagendarPlano,
  recuarEapTarefa,
} from "@/modules/planejamento/actions";
import { herdarResponsaveisDaDisciplina } from "@/modules/planejamento/recursos-actions";
import type { EapTarefaDTO, cronogramaProjetoInfo } from "@/modules/planejamento/queries";
import type { Achado } from "@/modules/planejamento/qualidade";
import type { CustoLinha } from "@/modules/planejamento/custo";
import type { ResultadoSaude } from "@/modules/planejamento/saude";
import type { CalendarioGantt } from "@/modules/planejamento/gantt-escala";
import { somarDias } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AplicarModeloDialog, type PreviaDeModelo } from "@/components/planejamento/modelos/aplicar-modelo-dialog";
import { BarraEstrutura } from "@/components/planejamento/barra-estrutura";
import { ColarTarefasDialog } from "@/components/planejamento/colar-tarefas-dialog";
import { PredecessorasDialog } from "@/components/planejamento/predecessoras-dialog";
import { SalvarComoModeloDialog } from "@/components/planejamento/modelos/salvar-como-modelo-dialog";
import { DesfazerBotao } from "@/components/planejamento/desfazer-botao";
import { GerarEapDisciplinasDialog } from "@/components/planejamento/modelos/gerar-eap-disciplinas-dialog";
import type { OpcaoDeDisciplina } from "@/modules/planejamento/modelos/disciplina-service";
import { montarGrade, type Vinculo } from "@/modules/planejamento/gantt-linhas";
import {
  ACAO_ABRIR,
  ACAO_ATUALIZAR,
  ACAO_AVANCAR,
  ACAO_EXCLUIR,
  ACAO_GERAR_CARD,
  ACAO_INSERIR_ACIMA,
  ACAO_MOVER_BAIXO,
  ACAO_MOVER_CIMA,
  ACAO_RECUAR,
  itensDeLinhaEap,
} from "@/modules/planejamento/acoes-eap";
import { ACAO_COLAR, ACAO_COPIAR, itensDeCopiarColar, itensDeEstruturaEap } from "@/modules/planejamento/acoes-lote-eap";
import type { NoArvore } from "@/modules/planejamento/arvore-eap";
import { MOTIVO_PLANO_TRAVADO, planoTravado } from "@/modules/planejamento/trava-plano";
import type { Larguras } from "@/modules/planejamento/gantt-larguras";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import {
  ACAO_APAGAR_EAP,
  ACAO_APLICAR,
  ACAO_GERAR_DISCIPLINAS,
  ACAO_HERDAR,
  ACAO_NOVAS_TAREFAS,
  ACAO_REAGENDAR,
  ACAO_SALVAR_MODELO,
  itensDoPlanejamento,
} from "@/modules/planejamento/acoes-planejamento";
import { PlanoGantt, type EdicaoDeCampo, type ModoGantt } from "@/components/planejamento/plano-gantt";
import { EapLinhaPainel } from "@/components/planejamento/eap-linha-painel";
import { ExecucaoDialog } from "@/components/planejamento/execucao-dialog";
import { FaixaCronograma } from "@/components/planejamento/faixa-cronograma";
import type { ComparativoBase } from "@/components/planejamento/saude-cronograma-painel";
import { rotuloBaseline, rotuloDaOpcao, tarefasComBaseline } from "@/modules/planejamento/baselines";

const diasDesvio = (t: EapTarefaDTO) => {
  if (!t.fimBaseline) return 0;
  const a = new Date(t.fimPrevisto + "T00:00:00").getTime();
  const b = new Date(t.fimBaseline + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
};

/** A visão da tela: os dois Gantt e os Indicadores (Valor Agregado + Plano vs Real, que a página manda prontos). */
type VisaoTela = ModoGantt | "indicadores";
type Filtro = "todas" | "validar" | "atrasadas" | "criticas" | "bloqueadas";
type Lookahead = "todas" | 7 | 15 | 30;

export function EapWorkspace({
  projeto,
  tarefas,
  disciplinas,
  pessoas,
  temLinhaBase,
  custoTotal,
  podeGerir,
  podeAprovar,
  podeExecutado,
  podeAprovarFase,
  verDatas,
  calendario,
  hoje,
  cronograma,
  qualidade,
  previasModelos = [],
  opcoesDisciplinas = [],
  impedimentoApagar = null,
  ultimoPasso = null,
  tiposEmpreendimento = [],
  largurasColunas,
  noProjeto,
  indicadores,
}: {
  projeto: { id: string; codigo: string; nome: string };
  tarefas: EapTarefaDTO[];
  disciplinas: { id: string; nome: string; etapas: { etapaId: string; sigla: string; nome: string }[] }[];
  pessoas: { id: string; name: string; image: string | null; contratacao?: string | null; habilidades?: string[] }[];
  temLinhaBase: boolean;
  /** F7.1: custo previsto do projeto. `null` = o viewer não vê custo (coluna oculta). */
  custoTotal: CustoLinha | null;
  podeGerir: boolean;
  podeAprovar: boolean;
  podeExecutado: boolean;
  /** `aprovacoes:disciplina`: aprovar a fase quando o marco dela é concluído (F7.0). */
  podeAprovarFase: boolean;
  /**
   * Decisão #3: sem isto o servidor já mandou as linhas SEM datas — a tela não desenha Gantt, datas, filtros de
   * prazo nem exportação (quem só consulta vê a estrutura).
   */
  verDatas: boolean;
  /** O calendário do motor (dias úteis e feriados): o gráfico sombreia os dias não úteis com ele. */
  calendario: CalendarioGantt;
  /** `YYYY-MM-DD` de hoje, calculado no servidor — o mesmo valor na tela renderizada e na hidratada. */
  hoje: string;
  /** `null` = quem não vê datas (o servidor nem busca a Data de Status, a baseline nem a Saúde). */
  cronograma: Awaited<ReturnType<typeof cronogramaProjetoInfo>> | null;
  qualidade: {
    achados: Achado[];
    saude: ResultadoSaude | null;
    totalLinhas: number;
    dataStatus: string | null;
  } | null;
  /**
   * Decisão #5: modelos de EAP com a prévia já calculada para ESTE projeto. Vem vazio quando a EAP já
   * tem linha, quem olha não monta EAP, ou não há modelo cadastrado — e aí o botão não aparece.
   */
  previasModelos?: PreviaDeModelo[];
  /** Disciplinas sem tarefa na EAP, com os modelos de disciplina que servem ("Gerar EAP das disciplinas"). */
  opcoesDisciplinas?: OpcaoDeDisciplina[];
  /** Por que "Apagar EAP" não pode (`null` = pode) — a mesma frase da action. */
  impedimentoApagar?: string | null;
  /** O que o Ctrl+Z desfaria agora (rótulo da última ação desta pessoa neste projeto); `null` = nada. */
  ultimoPasso?: string | null;
  /** Tipos de empreendimento para o "Salvar como modelo" (vazio quando quem olha não monta a EAP). */
  tiposEmpreendimento?: { id: string; nome: string }[];
  /** Larguras de coluna do Gantt que o usuário ajustou (preferência dele). */
  largurasColunas?: Larguras;
  /**
   * Aba EAP do projeto (só consulta): o cabeçalho do projeto já tem código e nome, então sai o título e o
   * "← Planejamento" e entra o link para o Planejamento, onde a EAP se edita. `editar` = quem pode montar a EAP.
   */
  noProjeto?: { editar: boolean };
  /** A visão Indicadores (Valor Agregado + Plano vs Real), renderizada no servidor. Sem ela, a visão não aparece. */
  indicadores?: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modo, setModo] = useState<VisaoTela>("planejamento");
  // Qual versão da linha de base o Gantt de Controle compara. `null` = a mais recente (a que sempre foi).
  const [baselineEscolhida, setBaselineEscolhida] = useState<number | null>(null);
  const confirm = useConfirm();
  /** Linha recém-inserida: o nome dela abre em edição assim que chega na tabela. */
  const [novaLinhaId, setNovaLinhaId] = useState<string | null>(null);
  /** Painel da linha (substitui o antigo diálogo): a linha aberta, ou "nova tarefa". */
  const [painel, setPainel] = useState<{ aberto: boolean; linhaId: string | null; nova: boolean }>({ aberto: false, linhaId: null, nova: false });
  /** Alterações não salvas no painel: abrir outra linha pergunta antes de descartar. */
  const alteracoesNoPainel = useRef(0);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  /** "Ver na tabela" de um achado do verificador: só as linhas dele (some ao trocar de filtro). */
  const [achadoFiltro, setAchadoFiltro] = useState<{ rotulo: string; ids: Set<string> } | null>(null);
  /** Linhas selecionadas no cronograma (Ctrl/Shift+clique), em ordem de documento. */
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [sinalLimparSelecao, setSinalLimparSelecao] = useState(0);
  /** Janela "Novas tarefas" (colar várias de uma vez). */
  const [colarAberto, setColarAberto] = useState(false);
  const [salvarModeloAberto, setSalvarModeloAberto] = useState(false);
  const [gerarAberto, setGerarAberto] = useState(false);
  /** Uma ação de estrutura (setas, copiar/colar, excluir) está gravando: trava a barra contra duplo clique. */
  const [gravandoEstrutura, setGravandoEstrutura] = useState(false);
  /** Janela da árvore de predecessoras: a linha em edição, ou `null`. */
  const [predAberta, setPredAberta] = useState<EapTarefaDTO | null>(null);
  /** Área de cópia: as linhas que o Copiar guardou (a estrutura é lida de novo na hora de colar). */
  const [copiadas, setCopiadas] = useState<string[]>([]);
  /** Linha no "Atualizar tarefa" (datas reais) — `null` = fechado. */
  const [execucao, setExecucao] = useState<EapTarefaDTO | null>(null);
  /** Folhas sem custo conhecido — o que falta cadastrar para o custo previsto fechar. */
  const semCusto = tarefas.filter((t) => !t.ehResumo && t.custo == null).length;
  const [lookahead, setLookahead] = useState<Lookahead>("todas");

  const abrir = async (tarefa: EapTarefaDTO | null) => {
    if (!podeGerir) return;
    const mesma = painel.aberto && (tarefa ? painel.linhaId === tarefa.id : painel.nova);
    if (mesma) return;
    if (painel.aberto && alteracoesNoPainel.current > 0) {
      const ok = await confirm({
        title: "Descartar as alterações da linha aberta?",
        description: "Elas não foram salvas.",
        confirmLabel: "Descartar",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setPainel({ aberto: true, linhaId: tarefa?.id ?? null, nova: !tarefa });
  };
  const vazio = tarefas.length === 0;
  // Aprovado e fora de revisão: o plano está travado (`trava-plano.ts`). O servidor recusa do mesmo jeito.
  const travado = planoTravado(cronograma);
  const versoes = cronograma?.versoes ?? [];
  const maisNova = versoes[0]?.numero ?? null;
  // As tarefas com as datas de base da versão escolhida: alimenta o Gantt, as colunas de desvio e os cartões.
  // Só a linha de base muda — o resto da tarefa (previsto, %, predecessoras) segue o de hoje.
  const tarefasComBase = useMemo(
    () => tarefasComBaseline(tarefas, baselineEscolhida, cronograma?.datasPorBaseline ?? {}),
    [tarefas, baselineEscolhida, cronograma],
  );
  const rotuloBase = (baselineEscolhida ?? maisNova) != null ? rotuloBaseline((baselineEscolhida ?? maisNova) as number) : undefined;

  // Filtros e lookahead (Doc 03 §36/§37) — aplicados só à VISÃO (Gantt + tabela). O diálogo
  // continua vendo a EAP inteira: escolher predecessora não pode depender do que está
  // filtrado na tela naquele momento.
  const visiveis = useMemo(() => {
    let base = tarefas;
    if (achadoFiltro) base = base.filter((t) => achadoFiltro.ids.has(t.id));
    if (filtro === "atrasadas") {
      const hj = hoje;
      // Contra o combinado (a linha de base), como o verificador: com a Data de Status, a previsão de
      // uma linha inacabada anda para depois dela e deixaria de parecer atrasada.
      base = base.filter((t) => (t.fimBaseline ?? t.fimPrevisto) < hj && t.progresso < 100 && t.status !== "con");
    } else if (filtro === "validar") {
      // Reunião de 08/10/2026: o que o responsável já marcou como concluído e o gestor ainda não validou.
      base = base.filter((t) => sinalDaLinha(t, hoje) === "validar");
    } else if (filtro === "criticas") {
      base = base.filter((t) => t.critica);
    } else if (filtro === "bloqueadas") {
      base = base.filter((t) => t.status === "blq");
    }
    if (lookahead !== "todas") {
      const limite = somarDias(hoje, lookahead);
      base = base.filter((t) => t.inicioPrevisto <= limite && t.fimPrevisto >= hoje);
    }
    // "Minhas atividades": o dado existe desde a F5 (`atribuicoes` por linha), mas o filtro
    // precisa do usuário logado na tela e ninguém pediu — o projetista nem vê a EAP (Q14).
    return base;
  }, [tarefas, filtro, lookahead, hoje, achadoFiltro]);

  const totalAtrasadas = tarefas.filter(
    (t) => (t.fimBaseline ?? t.fimPrevisto) < hoje && t.progresso < 100 && t.status !== "con",
  ).length;
  const totalAValidar = tarefas.filter((t) => sinalDaLinha(t, hoje) === "validar").length;
  const totalCriticas = tarefas.filter((t) => t.critica).length;
  const totalBloqueadas = tarefas.filter((t) => t.status === "blq").length;

  // Prévia do que "Aplicar ao projeto" vai gravar: por disciplina vinculada,
  // o prazo passa a ser o MAIOR fimPrevisto entre as tarefas dessa disciplina.
  function previaAplicacao() {
    const porDisciplina = new Map<string, { nome: string; prazo: string }>();
    for (const t of tarefas) {
      if (!t.disciplinaId) continue;
      const atual = porDisciplina.get(t.disciplinaId);
      if (!atual || t.fimPrevisto > atual.prazo) {
        porDisciplina.set(t.disciplinaId, {
          nome: t.disciplinaNome ?? "Disciplina",
          prazo: t.fimPrevisto,
        });
      }
    }
    return [...porDisciplina.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async function aplicar() {
    const previa = previaAplicacao();
    if (previa.length === 0) {
      toast.error("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
      return;
    }
    start(async () => {
      const r = await aplicarAoProjeto({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(`Prazos aplicados a ${r.data.aplicadas} disciplina(s).`);
        if (r.data.semEap.length > 0) {
          toast.warning(
            `${r.data.semEap.length} disciplina(s) sem tarefa na EAP (ignoradas): ${r.data.semEap.join(", ")}.`,
          );
        }
        if (r.data.ignoradas.length > 0) {
          toast.warning(`Linhas não aplicadas: ${r.data.ignoradas.join("; ")}.`, {
            description: "Disciplina com etapas só recebe prazo de linha que tenha a fase da etapa.",
          });
        }
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Cada gravação reagenda o projeto inteiro: a fila garante uma de cada vez — a segunda, disparada em paralelo,
  // trabalharia sobre datas que a primeira ainda vai mudar (Tab/Enter em sequência na tabela faz isso).
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const p = fila.current.then(tarefa, tarefa);
    fila.current = p.catch(() => undefined);
    return p;
  }

  /** Edição direto na tabela (Nome, Duração, % concluído). A action grava a linha inteira: o que não muda vai como está. */
  function editarCampo(t: EapTarefaDTO, e: EdicaoDeCampo): Promise<string | null> {
    return naFila(async () => {
      const dataBr = (iso: string) => iso.split("-").reverse().join("/");
      // Início digitado = o alfinete; término digitado = a duração. O motor pode não dar a data pedida: avisa a real.
      if (e.campo === "inicio") {
        const r = await definirInicioEapTarefa({ id: t.id, data: e.data });
        if (!r.ok) return r.error;
        if (r.data.inicio !== r.data.pedido) {
          toast.warning(`A tarefa só pode começar em ${dataBr(r.data.inicio)}.`, {
            description: "Depois das predecessoras e num dia útil — a data que você pediu ficou como \"não iniciar antes de\".",
          });
        }
        router.refresh();
        return null;
      }
      if (e.campo === "termino") {
        const r = await definirTerminoEapTarefa({ id: t.id, data: e.data });
        if (!r.ok) return r.error;
        toast.success(`Duração: ${String(r.data.duracaoDias).replace(".", ",")} ${r.data.duracaoDias === 1 ? "dia útil" : "dias úteis"}.`);
        router.refresh();
        return null;
      }
      const r = await editarEapTarefa({
        id: t.id,
        nome: e.campo === "nome" ? e.nome : t.nome,
        // Sem a disciplina a action a tiraria da linha.
        disciplinaId: t.disciplinaId ?? undefined,
        duracaoDias: e.campo === "duracao" ? e.duracaoDias : t.marco || t.ehResumo ? undefined : t.duracaoDias,
        progresso: e.campo === "progresso" ? e.progresso : Math.round(t.progresso),
        marco: e.campo === "duracao" ? e.marco : t.marco,
      });
      if (!r.ok) return r.error;
      router.refresh();
      return null;
    });
  }

  /** A célula Predecessoras: o conjunto inteiro de uma vez, com um reagendamento só. */
  function editarPredecessoras(t: EapTarefaDTO, vinculos: Vinculo[]): Promise<string | null> {
    return naFila(async () => {
      const r = await definirPredecessorasDaLinha({ tarefaId: t.id, vinculos });
      if (!r.ok) return r.error;
      router.refresh();
      return null;
    });
  }

  /** A árvore e os nomes que o descritor de estrutura precisa — tudo da lista que a tela já tem. */
  const nosDaArvore: NoArvore[] = tarefas.map((t) => ({ id: t.id, parentId: t.parentId, ordem: t.ordem, tipoEap: t.tipoEap }));
  const nomesDasLinhas = new Map(tarefas.map((t) => [t.id, t.nome]));
  // Os dados da janela da árvore de predecessoras: só se recalculam quando a lista de tarefas muda.
  const gradeDaArvore = useMemo(() => montarGrade(tarefas), [tarefas]);
  const linhasDaArvore = useMemo(
    () => gradeDaArvore.map((l) => ({ id: l.t.id, parentId: l.t.parentId, ordem: l.t.ordem, codigo: l.codigo, nome: l.t.nome, tipoEap: l.t.tipoEap })),
    [gradeDaArvore],
  );
  const dependenciasDaArvore = useMemo(
    () => tarefas.flatMap((t) => t.predecessoras.map((v) => ({ tarefaId: t.id, predecessoraId: v.predecessoraId }))),
    [tarefas],
  );
  const codigoPorId = useMemo(() => new Map(gradeDaArvore.map((l) => [l.t.id, l.codigo])), [gradeDaArvore]);
  // ↑↓ do painel da linha andam na ordem da tabela, só pelas linhas que os filtros deixam à vista.
  const ordemDaTabela = useMemo(() => {
    const vis = new Set(visiveis.map((t) => t.id));
    return gradeDaArvore.map((l) => l.t.id).filter((id) => vis.has(id));
  }, [gradeDaArvore, visiveis]);
  const itensDaSelecao = (ids: string[] = selecionadas) =>
    itensDeEstruturaEap({ nos: nosDaArvore, nomes: nomesDasLinhas, selecionadas: ids, planoTravado: travado, podeColar: copiadas.length > 0 });

  /**
   * As setas da barra e o menu sobre uma SELEÇÃO: UMA chamada ao servidor (tudo ou nada, um reagendamento, um passo de
   * desfazer). O `confirm` vem ANTES de gravar e nenhuma passa por `startTransition`.
   */
  async function executarEstrutura(item: AcaoItemAcao, ids: string[]) {
    if (item.id === ACAO_COPIAR) {
      setCopiadas(ids);
      toast.success(ids.length === 1 ? "1 linha copiada." : `${ids.length} linhas copiadas.`, {
        description: "Escolha uma linha e use Colar abaixo.",
      });
      return;
    }
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
        variant: item.variant === "destructive" ? "destructive" : undefined,
      });
      if (!ok) return;
    }
    setGravandoEstrutura(true);
    await naFila(async () => {
      if (item.id === ACAO_COLAR) {
        const r = await colarEapBloco({ projetoId: projeto.id, origemIds: copiadas, depoisDeId: ids[0] ?? null });
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.data.criadas === 1 ? "1 linha colada." : `${r.data.criadas} linhas coladas.`);
      } else if (item.id === ACAO_RECUAR) {
        const r = await recuarEapTarefas({ ids });
        if (!r.ok) return void toast.error(r.error);
        if (r.data.paisComGente > 0) {
          toast.warning("A tarefa de cima virou agrupamento e ainda tem pessoas atribuídas.", {
            description: "As horas delas deixam de contar — passe as pessoas para as tarefas dentro do agrupamento.",
          });
        }
      } else if (item.id === ACAO_AVANCAR) {
        const r = await avancarEapTarefas({ ids });
        if (!r.ok) return void toast.error(r.error);
      } else if (item.id === ACAO_MOVER_CIMA || item.id === ACAO_MOVER_BAIXO) {
        const r = await moverEapTarefasNoNivel({ ids, direcao: item.id === ACAO_MOVER_CIMA ? -1 : 1 });
        if (!r.ok) return void toast.error(r.error);
      } else if (item.id === ACAO_EXCLUIR) {
        const r = await excluirEapTarefas({ ids });
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.data.excluidas === 1 ? "Linha excluída." : `${r.data.excluidas} linhas excluídas.`);
      }
      router.refresh();
    }).finally(() => setGravandoEstrutura(false));
  }

  /**
   * O que cada item do menu da linha faz (o descritor é `itensDeLinhaEap`). O `confirm` vem ANTES de qualquer
   * gravação — e nenhuma passa por `startTransition`: confirm dentro de transição trava o React 19.
   */
  async function aoAcao(t: EapTarefaDTO, item: AcaoItemAcao) {
    // Menu aberto sobre uma seleção de várias linhas: a ação vale para todas (ADR-0002, regra 3).
    if (selecionadas.length > 1 && selecionadas.includes(t.id)) return executarEstrutura(item, selecionadas);
    // Copiar e colar também estão no menu de UMA linha: valem para ela.
    if (item.id === ACAO_COPIAR || item.id === ACAO_COLAR) return executarEstrutura(item, [t.id]);
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
      });
      if (!ok) return;
    }
    switch (item.id) {
      case ACAO_ABRIR:
        void abrir(t);
        return;
      case ACAO_ATUALIZAR:
        setExecucao(t);
        return;
      case ACAO_GERAR_CARD:
        gerarTarefa(t.id);
        return;
      case ACAO_INSERIR_ACIMA:
        await naFila(async () => {
          const r = await inserirEapTarefaAcima({ id: t.id });
          if (!r.ok) return void toast.error(r.error);
          setNovaLinhaId(r.data.id);
          router.refresh();
        });
        return;
      case ACAO_RECUAR:
        await naFila(async () => {
          const r = await recuarEapTarefa({ id: t.id });
          if (!r.ok) return void toast.error(r.error);
          if (r.data.paiVirouAgrupamentoComGente) {
            toast.warning("A tarefa de cima virou agrupamento e ainda tem pessoas atribuídas.", {
              description: "As horas delas deixam de contar — passe as pessoas para as tarefas dentro do agrupamento.",
            });
          }
          router.refresh();
        });
        return;
      case ACAO_AVANCAR:
        await naFila(async () => {
          const r = await avancarEapTarefa({ id: t.id });
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        });
        return;
      case ACAO_MOVER_CIMA:
      case ACAO_MOVER_BAIXO:
        await naFila(async () => {
          const r = await moverEapTarefaNoNivel({ id: t.id, direcao: item.id === ACAO_MOVER_CIMA ? -1 : 1 });
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        });
        return;
      case ACAO_EXCLUIR:
        await naFila(async () => {
          const r = await excluirEapTarefa({ id: t.id });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Tarefa excluída.");
          router.refresh();
        });
        return;
    }
  }

  /** Arrastar a linha (alça da coluna EDT): antes/depois de outra, no nível dela, com as subtarefas junto. */
  function mover(t: EapTarefaDTO, alvoId: string, posicao: "antes" | "depois") {
    void naFila(async () => {
      const r = await moverEapTarefa({ id: t.id, alvoId, posicao });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  function gerarTarefa(eapTarefaId: string) {
    start(async () => {
      const r = await gerarTarefaDeEap({ eapTarefaId });
      if (r.ok) {
        toast.success(r.data.jaExistia ? "Tarefa já existia no kanban" : "Tarefa criada no kanban", {
          action: { label: "Ver tarefas", onClick: () => router.push("/tarefas") },
        });
      } else toast.error(r.error);
    });
  }

  /** Apagar a EAP inteira para recomeçar com outro modelo. O confirm vem ANTES da transição. */
  async function apagarTudo() {
    const ok = await confirm({
      title: "Apagar a EAP deste projeto?",
      description:
        `As ${tarefas.length} linhas da EAP — tarefas, marcos, vínculos e pessoas atribuídas — serão apagadas, para você usar ` +
        "outro modelo ou gerar de novo. Ficam as fases cadastradas nas disciplinas e o início do cronograma. Não dá para desfazer.",
      confirmLabel: "Apagar a EAP",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await apagarEap({ projetoId: projeto.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`EAP apagada (${r.data.apagadas} linhas).`, { description: "Agora dá para usar outro modelo ou gerar das disciplinas." });
      router.refresh();
    });
  }

  function herdar() {
    start(async () => {
      const r = await herdarResponsaveisDaDisciplina({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(
          r.data.criadas > 0
            ? `${r.data.criadas} atribuição(ões) herdada(s) da disciplina.`
            : "Nenhuma linha sem responsável para herdar — o que já tem gente não é tocado.",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function reagendar() {
    start(async () => {
      const r = await reagendarPlano({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(
          r.data.reagendadas > 0
            ? `${r.data.reagendadas} tarefa(s) reagendada(s) pelo motor.`
            : "Cronograma já coerente com duração e dependências.",
          r.data.ciclosIgnorados > 0
            ? { description: `${r.data.ciclosIgnorados} dependência(s) circular(es) foram ignoradas.` }
            : undefined,
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const itensDoMenu = itensDoPlanejamento({
    projetoId: projeto.id,
    podeGerir,
    verDatas,
    temTarefas: tarefas.length > 0,
    temDisciplinas: disciplinas.length > 0,
    disciplinasSemEap: opcoesDisciplinas.length,
    planoTravado: travado,
    impedimentoApagar,
  });

  /** O `⋯` do cabeçalho (descritor `itensDoPlanejamento`). Os confirms ficam dentro de cada ação, antes de gravar. */
  async function aoMenu(item: AcaoItemAcao) {
    switch (item.id) {
      case ACAO_NOVAS_TAREFAS:
        setColarAberto(true);
        return;
      case ACAO_GERAR_DISCIPLINAS:
        setGerarAberto(true);
        return;
      case ACAO_REAGENDAR:
        reagendar();
        return;
      case ACAO_HERDAR:
        herdar();
        return;
      case ACAO_APLICAR:
        await aplicar();
        return;
      case ACAO_SALVAR_MODELO:
        setSalvarModeloAberto(true);
        return;
      case ACAO_APAGAR_EAP:
        await apagarTudo();
        return;
    }
  }

  // Custo previsto: vai para a ponta da faixa de status.
  const resumoCusto = custoTotal ? (
    custoTotal.custo != null ? (
      <span className="text-muted-foreground" title="Horas previstas × custo/hora de cada pessoa (Recursos)">
        Custo previsto <span className="font-mono text-foreground">{brl(custoTotal.custo)}</span>
      </span>
    ) : (
      <span className="text-warning" title="Linhas sem horas, com perfil (vaga) ou com pessoa sem custo/hora cadastrado em Recursos">
        Custo incompleto · {semCusto === 1 ? "1 linha" : `${semCusto} linhas`}
      </span>
    )
  ) : null;

  // Linha de base × hoje: vai para o painel de saúde (era um bloco fixo no topo).
  const comparativo: ComparativoBase | null = (() => {
    if (!verDatas || !temLinhaBase || !rotuloBase) return null;
    const comBase = tarefasComBase.filter((t) => t.fimBaseline);
    if (comBase.length === 0) return null;
    const atrasadas = comBase.filter((t) => diasDesvio(t) > 0);
    return {
      rotulo: rotuloBase,
      total: comBase.length,
      noPrazo: comBase.filter((t) => diasDesvio(t) === 0).length,
      adiantadas: comBase.filter((t) => diasDesvio(t) < 0).length,
      atrasadas: atrasadas.length,
      mediaAtraso: atrasadas.length ? Math.round(atrasadas.reduce((s, t) => s + diasDesvio(t), 0) / atrasadas.length) : 0,
    };
  })();

  const comIndicadores = indicadores != null;
  const visoes: [VisaoTela, string][] = [
    ...(verDatas
      ? ([
          ["planejamento", "Gantt"],
          ["controle", "Controle"],
        ] as [VisaoTela, string][])
      : []),
    ...(comIndicadores ? ([["indicadores", "Indicadores"]] as [VisaoTela, string][]) : []),
  ];
  const seletorVisao =
    visoes.length > 1 ? (
      <div className="flex overflow-hidden rounded-sm border bg-background" role="group" aria-label="Visão do cronograma">
        {visoes.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={modo === v}
            onClick={() => setModo(v)}
            className={`px-2 py-1 text-xs font-medium ${modo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
    ) : null;

  // Barra única (mock de 2026-10-23): visão · comparar com · filtros · período, e depois as ferramentas do gráfico.
  const barraInicio = (
    <>
      {seletorVisao}
      {verDatas && modo === "controle" && versoes.length > 1 && (
        // Reunião de 29/09/2026: escolher com qual versão da linha de base o plano de hoje é comparado.
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Comparar com
          <select
            aria-label="Versão da linha de base usada na comparação"
            value={baselineEscolhida ?? maisNova ?? ""}
            onChange={(e) => setBaselineEscolhida(Number(e.target.value) === maisNova ? null : Number(e.target.value))}
            className="h-7 max-w-56 rounded-sm border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary"
          >
            {versoes.map((v, i) => (
              <option key={v.numero} value={v.numero}>
                {rotuloDaOpcao(v, i === 0)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtro das linhas">
        {(
          [
            ["todas", "Todas", tarefas.length],
            ["validar", "A validar", totalAValidar],
            ["atrasadas", "Atrasadas", totalAtrasadas],
            ["criticas", "Críticas", totalCriticas],
            ["bloqueadas", "Bloqueadas", totalBloqueadas],
          ] as [Filtro, string, number][]
        )
          .filter(([v]) => verDatas || v === "todas" || v === "bloqueadas" || v === "validar")
          .map(([v, label, n]) => (
            <button
              key={v}
              type="button"
              aria-pressed={filtro === v && !achadoFiltro}
              onClick={() => {
                setFiltro(v);
                setAchadoFiltro(null);
              }}
              title={v === "atrasadas" && comparativo?.mediaAtraso ? `Contra a ${comparativo.rotulo} · média +${comparativo.mediaAtraso} dias` : undefined}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                filtro === v && !achadoFiltro
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:border-primary/50"
              }`}
            >
              {label}{" "}
              <span className={`tabular-nums ${v === "atrasadas" && n > 0 && !(filtro === v && !achadoFiltro) ? "font-semibold text-destructive" : "font-semibold"}`}>{n}</span>
            </button>
          ))}
        {achadoFiltro && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            Achado: {achadoFiltro.rotulo} ({achadoFiltro.ids.size})
            <button type="button" aria-label="Tirar o filtro do achado" className="-mr-1 rounded-full p-0.5 hover:bg-primary-foreground/20" onClick={() => setAchadoFiltro(null)}>
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>
      {verDatas && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Período</span>
          <select
            aria-label="Período"
            value={String(lookahead)}
            onChange={(e) => setLookahead(e.target.value === "todas" ? "todas" : (Number(e.target.value) as Lookahead))}
            className="h-7 rounded-sm border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary"
          >
            <option value="todas">Período: tudo</option>
            <option value="7">Próx. 7 dias</option>
            <option value="15">Próx. 15 dias</option>
            <option value="30">Próx. 30 dias</option>
          </select>
        </label>
      )}
    </>
  );
  const barraFim = (
    <>
      {podeGerir && <DesfazerBotao projetoId={projeto.id} rotulo={ultimoPasso} travado={travado} compacto />}
      {noProjeto && (
        <>
          <Button size="sm" variant="outline" render={<Link href={`/planejamento/${projeto.id}`} />}>
            <ExternalLink className="size-3.5" /> {noProjeto.editar ? "Editar no Planejamento" : "Abrir no Planejamento"}
          </Button>
          <BotaoAcoes itens={itensDoMenu} onSelect={(item) => void aoMenu(item)} rotulo="Mais ações da EAP" className="size-7 border border-input bg-background text-foreground" />
        </>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      {!noProjeto && (
        <CabecalhoPagina
          titulo={
            <>
              <span className="font-mono">{projeto.codigo}</span> · {projeto.nome}
            </>
          }
          descricao="EAP e cronograma"
          trilha={[
            { href: "/", label: "Início" },
            { href: "/planejamento", label: "Planejamento" },
            { label: projeto.codigo },
          ]}
          acoes={
            <>
              {podeGerir && (
                <Button size="sm" onClick={() => void abrir(null)} disabled={travado} title={travado ? MOTIVO_PLANO_TRAVADO : undefined}>
                  <Plus className="size-3.5" /> Nova tarefa
                </Button>
              )}
              <BotaoAcoes
                itens={itensDoMenu}
                onSelect={(item) => void aoMenu(item)}
                rotulo="Mais ações do planejamento"
                className="size-8 border border-input bg-background text-foreground"
              />
            </>
          }
        />
      )}

      {qualidade && cronograma && tarefas.length > 0 && (
        <FaixaCronograma
          projetoId={projeto.id}
          hoje={hoje}
          podeAprovar={podeAprovar}
          podeGerir={podeGerir}
          podeExecutado={podeExecutado}
          linhasComDataFixada={tarefas.filter((t) => t.restricaoTipo).length}
          aprovado={cronograma.aprovado}
          emRevisao={cronograma.emRevisao}
          revisaoAbertaEm={cronograma.revisaoAbertaEm}
          revisaoAlterada={cronograma.revisaoAlterada}
          aprovadoEm={cronograma.aprovadoEm}
          dataStatus={cronograma.dataStatus}
          inicioProjeto={cronograma.inicioProjeto}
          ultimaBaseline={cronograma.ultimaBaseline}
          versoes={versoes}
          alocacoesTipadas={cronograma.alocacoesTipadas}
          linhasSemHora={
            tarefas.filter((t) => !t.ehResumo && t.tipoEap === "atv" && t.trabalhoHoras == null && !t.deTerceiro).length
          }
          achados={qualidade.achados}
          nota={qualidade.saude?.nota ?? null}
          faixa={qualidade.saude?.faixa ?? null}
          provisoria={qualidade.saude?.provisoria ?? true}
          custo={resumoCusto}
          comparativo={comparativo}
          onVerNaTabela={(rotulo, ids) => {
            setAchadoFiltro({ rotulo, ids: new Set(ids) });
            setFiltro("todas");
            setLookahead("todas");
          }}
        />
      )}

      {vazio ? (
        <div className="rounded-sm border border-dashed">
          <EmptyState
            icon={Rocket}
            title="Este projeto ainda não tem planejamento"
            description={
              podeGerir
                ? "Comece criando a primeira tarefa da EAP para montar o cronograma."
                : "Nenhuma tarefa foi cadastrada ainda."
            }
            action={
              podeGerir ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {disciplinas.length > 0 && (
                    <GerarEapDisciplinasDialog
                      key={opcoesDisciplinas.map((o) => o.disciplinaId).join()}
                      projetoId={projeto.id}
                      opcoes={opcoesDisciplinas}
                      variante="default"
                      tamanho="default"
                    />
                  )}
                  {previasModelos.length > 0 && (
                    <AplicarModeloDialog projetoId={projeto.id} previas={previasModelos} />
                  )}
                  <Button variant={disciplinas.length > 0 ? "outline" : "default"} onClick={() => void abrir(null)}>
                    <Rocket className="size-3.5" /> Criar tarefa manual
                  </Button>
                </div>
              ) : undefined
            }
            className="py-14"
          />
        </div>
      ) : (
        <>

          {modo === "indicadores" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {seletorVisao}
                <span className="flex-1" />
                {barraFim}
              </div>
              {indicadores}
            </div>
          ) : (
          <PlanoGantt
            barraInicio={barraInicio}
            barraFim={barraFim}
            sobreposicao={
              podeGerir && selecionadas.length > 0 ? (
                <BarraEstrutura
                  itens={itensDaSelecao()}
                  total={selecionadas.length}
                  onAcao={(item) => void executarEstrutura(item, selecionadas)}
                  onLimpar={() => setSinalLimparSelecao((n) => n + 1)}
                  pendente={pending || gravandoEstrutura}
                />
              ) : undefined
            }
            alturaCheia
            tarefas={tarefasComBase}
            rotuloBase={rotuloBase}
            modo={modo === "controle" ? "controle" : "planejamento"}
            calendario={calendario}
            verDatas={verDatas}
            mostrarCusto={custoTotal != null}
            hoje={hoje}
            filtroIds={filtro === "todas" && lookahead === "todas" && !achadoFiltro ? null : new Set(visiveis.map((t) => t.id))}
            onAbrir={podeGerir ? (t) => void abrir(t) : undefined}
            celulaRecursos={
              podeGerir
                ? (t, conteudo) => (
                    <RecursosDaCelula linha={t} pessoas={pessoas} onAbrirLinha={() => void abrir(t)}>
                      {conteudo}
                    </RecursosDaCelula>
                  )
                : undefined
            }
            onEditarCampo={podeGerir ? editarCampo : undefined}
            planoTravado={travado}
            largurasIniciais={largurasColunas}
            onEditarPredecessoras={podeGerir && !travado ? editarPredecessoras : undefined}
            onErro={(mensagem) => toast.error(mensagem)}
            onSelecaoChange={setSelecionadas}
            onEscolherPredecessoras={podeGerir && !travado ? setPredAberta : undefined}
            sinalLimparSelecao={sinalLimparSelecao}
            menuDe={(t, contexto) =>
              selecionadas.length > 1 && selecionadas.includes(t.id)
                ? itensDaSelecao()
                : itensDeLinhaEap(
                { nome: t.nome, ehResumo: t.ehResumo, ...contexto },
                  { podeGerir, podeExecutado, cronogramaAprovado: !!cronograma?.aprovado, planoTravado: travado },
                ).concat(
                  podeGerir
                    ? [
                        { tipo: "separador", id: "sep-copiar-linha" } as const,
                        ...itensDeCopiarColar({ temSelecao: true, planoTravado: travado, podeColar: copiadas.length > 0 }),
                      ]
                    : [],
                )
            }
            onAcao={(t, item) => void aoAcao(t, item)}
            onMover={podeGerir && !travado ? mover : undefined}
            focoNomeId={novaLinhaId}
            onFocoConsumido={() => setNovaLinhaId(null)}
            acoes={
              podeExecutado
                ? (t) =>
                    !t.ehResumo && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Atualizar tarefa (datas reais)"
                        title={t.marco ? "Concluir o marco (data real)" : "Atualizar tarefa: início e término reais"}
                        disabled={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExecucao(t);
                        }}
                      >
                        <CalendarCheck className="size-3.5" />
                      </Button>
                    )
                : undefined
            }
          />
          )}
        </>
      )}

      {podeExecutado && (
        <ExecucaoDialog linha={execucao} onClose={() => setExecucao(null)} podeAprovarFase={podeAprovarFase} />
      )}

      {podeGerir && predAberta && (
        <PredecessorasDialog
          tarefa={{ id: predAberta.id, nome: predAberta.nome, codigo: gradeDaArvore.find((l) => l.t.id === predAberta.id)?.codigo ?? "" }}
          linhas={linhasDaArvore}
          dependencias={dependenciasDaArvore}
          vinculosAtuais={predAberta.predecessoras}
          onAplicar={(vinculos) => editarPredecessoras(predAberta, vinculos)}
          onFechar={() => setPredAberta(null)}
        />
      )}

      {podeGerir && disciplinas.length > 0 && (
        <GerarEapDisciplinasDialog
          key={opcoesDisciplinas.map((o) => o.disciplinaId).join()}
          projetoId={projeto.id}
          opcoes={opcoesDisciplinas}
          aberto={gerarAberto}
          onAbertoChange={setGerarAberto}
        />
      )}

      {podeGerir && tarefas.length > 0 && (
        <SalvarComoModeloDialog
          projetoId={projeto.id}
          projetoCodigo={projeto.codigo}
          tipos={tiposEmpreendimento}
          totalLinhas={tarefas.length}
          totalMarcos={tarefas.filter((t) => t.marco).length}
          open={salvarModeloAberto}
          onOpenChange={setSalvarModeloAberto}
        />
      )}

      {podeGerir && (
        <ColarTarefasDialog
          projetoId={projeto.id}
          depoisDeId={selecionadas[0] ?? null}
          depoisDeNome={selecionadas[0] ? (nomesDasLinhas.get(selecionadas[0]) ?? null) : null}
          open={colarAberto}
          onOpenChange={setColarAberto}
        />
      )}

      {podeGerir && (
        <EapLinhaPainel
          aberto={painel.aberto}
          linhaId={painel.linhaId}
          nova={painel.nova}
          onFechar={() => setPainel({ aberto: false, linhaId: null, nova: false })}
          onNavegar={(id) => setPainel({ aberto: true, linhaId: id, nova: false })}
          ordem={ordemDaTabela}
          codigoPorId={codigoPorId}
          tarefas={tarefas}
          projetoId={projeto.id}
          disciplinas={disciplinas}
          pessoas={pessoas}
          planoTravado={travado}
          linhasDaArvore={linhasDaArvore}
          dependenciasDaArvore={dependenciasDaArvore}
          onAlteracoes={(n) => {
            alteracoesNoPainel.current = n;
          }}
        />
      )}
    </div>
  );
}
