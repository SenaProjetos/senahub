"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, BookmarkPlus, Check, CopyPlus, FileArchive, GitCompare, Loader2, Maximize2, MapPin, MessageSquare, PauseCircle, Pencil, RotateCcw, Ruler, Send, Sparkles, Stamp, Table2, Tags, Trash2, Undo2, Wrench, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PendenciaView, ReincidenciaView } from "@/modules/projetos/pendencias/queries";
import {
  criarPendencia,
  editarPendencia,
  excluirPendencia,
  enviarApontamentos,
  resolverPendencia,
  reabrirPendencia,
  fecharPendencia,
  descartarPendencia,
  replicarPendencia,
  responderPendencia,
  criarApontamentoPadrao,
  registrarUsoApontamentoPadrao,
  assumirCorrecaoPendencia,
  adiarPendencia,
  classificarPendencia,
  excluirRespostaPendencia,
} from "@/modules/projetos/pendencias/actions";
import type { PranchaVigente } from "@/modules/uploads/queries";
import { Checkbox } from "@/components/ui/checkbox";
import { TarefaDialog, type OpcoesUI } from "@/components/tarefas/tarefa-dialog";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import {
  rotuloItemPendencia,
  pesoSeveridade,
  transicoesPossiveis,
  temEvidencia,
  STATUS_LABEL,
  STATUS_TERMINAIS,
  contaComoTrabalho,
  ehRascunho,
  temImpeditivoAberto,
  type PapeisPendencia,
  type StatusPendencia,
  SEVERIDADES,
  SEVERIDADE_LABEL,
  TIPOS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
  type Severidade,
  type TipoPendencia,
} from "@/modules/projetos/pendencias/helpers";
import { construirAncora, relocalizarAncora } from "@/modules/projetos/pendencias/ancora";
import {
  caixaRecorte,
  construirMarcacao,
  MARCACAO_LABEL,
  TIPOS_MARCACAO,
  type Marcacao,
  type TipoMarcacao,
} from "@/modules/projetos/pendencias/marcacao";
import {
  comprimentoEmPontos,
  ESCALAS_COMUNS,
  fatorPorCalibracao,
  fatorPorEscala,
  formatarMedida,
  medirMm,
  MODOS_CALIBRACAO,
  rotuloCalibracao,
  type ModoCalibracao,
} from "@/modules/projetos/pendencias/medicao";
import { calibrarPrancha, marcarDocumentoLido } from "@/modules/projetos/pendencias/actions";
import type { CalibracaoView, PadraoView } from "@/modules/projetos/pendencias/queries";
import {
  diasAtePrazo,
  rotuloPrazo,
  situacaoPrazo,
  SITUACAO_PRAZO_LABEL,
  type SituacaoPrazo,
} from "@/modules/projetos/pendencias/prazo";
import { MarcacaoSvg } from "@/components/pdf/marcacao-svg";
import { PendenciaAnexos } from "@/components/projetos/pendencia-anexos";
import { PendenciaReferencias } from "@/components/projetos/pendencia-referencias";
import { descreverNovidades, type Novidades } from "@/modules/projetos/pendencias/novidades";
import { sugerirReincidencias, referenciarPendencia } from "@/modules/projetos/pendencias/actions";
import { partesComMencao } from "@/modules/chat/mencoes";
import { PdfPagina, type MarcaTexto } from "@/components/pdf/pdf-pagina";
import { usePdfBusca } from "@/components/pdf/use-pdf-busca";
import { BarraBuscaPdf } from "@/components/pdf/barra-busca-pdf";
import { usePdfCamadas } from "@/components/pdf/use-pdf-camadas";
import { CamadasPdf } from "@/components/pdf/camadas-pdf";
import { usePinchZoom } from "@/components/pdf/use-pinch-zoom";
import { usePresencaDocumento } from "@/components/pdf/use-presenca-documento";
import type { ItemPagina } from "@/lib/pdf-busca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatarData, formatarDataHora, rotuloRevisao } from "@/lib/utils";

// pdf.js é carregado dinamicamente no cliente (evita SSR e mantém o chunk fora do bundle inicial).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/**
 * Pendência já resolvida para ESTA revisão: `x`/`y` podem ter sido reposicionados pela âncora
 * textual. `incerta` = herdado sem conseguir confirmar onde fica agora.
 */
type PinPosicionado = PendenciaView & { incerta: boolean; relocalizado: boolean };

/**
 * Realça tokens @nome no texto do apontamento (item 33). O servidor já resolveu quem foi
 * notificado (`resolverMencionados`); aqui é só leitura visual, sempre realçada — a lista de
 * candidatos não trafega pro cliente só para essa distinção cosmética.
 */
function textoComMencao(texto: string) {
  return partesComMencao(texto).map((parte, i) =>
    parte.startsWith("@") ? (
      <span key={i} className="rounded bg-primary/15 px-1 font-semibold text-primary">
        {parte}
      </span>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

/** Tooltip do pino — diz de qual revisão veio e o quanto se pode confiar na posição. */
function tituloPin(p: PinPosicionado) {
  const origem = p.versaoOrigem != null ? ` (aberto na ${rotuloRevisao(p.versaoOrigem)}` : "";
  if (!p.deOutraRevisao || !origem) return `#${p.numero}: ${p.texto}`;
  const nota = p.relocalizado
    ? " — posição reconferida pelo texto desta revisão)"
    : " — a posição pode ter mudado nesta revisão)";
  return `#${p.numero}${origem}${nota}: ${p.texto}`;
}

type Props = {
  uploadId: string;
  projetoId: string;
  disciplinaId: string;
  nomeArquivo: string;
  codigo: string;
  projetoNome: string;
  disciplinaNome: string;
  versao: number;
  versaoAtual: boolean;
  validado: boolean;
  finalizada: boolean;
  podeValidar: boolean;
  ehResponsavel: boolean;
  ehAdmin: boolean;
  /** admin/supervisor — único perfil que adia e reativa apontamento (item 22, R9). */
  ehGlobal: boolean;
  currentUserId: string;
  pendenciasIniciais: PendenciaView[];
  colunasTarefa: { id: string; nome: string }[];
  opcoesTarefa: OpcoesUI | null;
  responsaveisPadrao: string[];
  /** Existe outra versão do mesmo documento — só aí o link de comparar revisões faz sentido. */
  temOutraRevisao: boolean;
  /** `null` em linha legada sem pai — presença (item 32) fica desligada nesse caso. */
  documentoId: string | null;
  /** Pranchas vigentes da mesma disciplina, exceto esta — destinos possíveis de "replicar" (item 30). */
  pranchasParaReplicar: PranchaVigente[];
  /** Calibração de escala por página (item 28) — vazio = nenhuma página calibrada ainda. */
  calibracoesIniciais: CalibracaoView[];
  /** Biblioteca de apontamentos-padrão aplicável a esta disciplina (item 10). */
  padroes: PadraoView[];
  /** "O que mudou desde sua última análise" (item 8) — já calculado ANTES desta visita. */
  novidades: Novidades;
  paginaInicial: number | null;
  pinInicial: number | null;
};

// `traco` é a cor do desenho vetorial (item 9): o SVG usa `currentColor`, então basta a classe
// de texto — mesma paleta do pino, sem cor cravada em hex.
// Os rótulos vêm de `helpers.ts` — um lugar só, senão a tela e o relatório divergem.
const STATUS_META: Record<string, { label: string; cls: string; pin: string; traco: string }> = {
  aberta: { label: STATUS_LABEL.aberta, cls: "text-warning border-warning/40", pin: "bg-warning text-warning-foreground", traco: "text-warning" },
  em_correcao: { label: STATUS_LABEL.em_correcao, cls: "text-primary border-primary/40", pin: "bg-primary text-primary-foreground", traco: "text-primary" },
  resolvida: { label: "Resolvida", cls: "text-info border-info/40", pin: "bg-info text-info-foreground", traco: "text-info" },
  fechada: { label: STATUS_LABEL.fechada, cls: "text-status-aprovado border-status-aprovado/40", pin: "bg-status-aprovado text-white", traco: "text-status-aprovado" },
  descartada: { label: STATUS_LABEL.descartada, cls: "text-muted-foreground border-muted", pin: "bg-muted-foreground text-white", traco: "text-muted-foreground" },
  adiado: { label: STATUS_LABEL.adiado, cls: "text-muted-foreground border-dashed border-muted-foreground/40", pin: "bg-muted text-muted-foreground", traco: "text-muted-foreground" },
};

/** Botão de cada transição — o rótulo/ícone que a máquina de estados (item 22) oferece. */
const ACAO_TRANSICAO: Record<
  StatusPendencia,
  {
    rotulo: string;
    sucesso: string;
    cls: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icone: any;
    /** `null` quando a transição NÃO é direta — "não procede" passa pela janela de justificativa. */
    acao: ((i: { id: string }) => Promise<{ ok: boolean; error?: string }>) | null;
  }
> = {
  em_correcao: { rotulo: "assumir", sucesso: "Assumida para correção.", cls: "text-primary", icone: Wrench, acao: assumirCorrecaoPendencia },
  resolvida: { rotulo: "resolver", sucesso: "Marcada como resolvida.", cls: "text-info", icone: Check, acao: resolverPendencia },
  aberta: { rotulo: "voltar à fila", sucesso: "Voltou para a fila.", cls: "", icone: Undo2, acao: reabrirPendencia },
  fechada: { rotulo: "fechar", sucesso: "Apontamento fechado.", cls: "text-status-aprovado", icone: Check, acao: fecharPendencia },
  descartada: { rotulo: "não procede", sucesso: "Marcado como não procede.", cls: "text-muted-foreground", icone: RotateCcw, acao: null },
  adiado: { rotulo: "adiar", sucesso: "Apontamento adiado.", cls: "text-muted-foreground", icone: PauseCircle, acao: adiarPendencia },
};

/**
 * Cor da severidade (item 11). Só o `impeditivo` usa `destructive` cheio: é o único nível que
 * vai travar a aprovação da entrega (item 19), então precisa saltar da lista sem depender de o
 * usuário ler o rótulo. Os demais são contorno, para não competir com o badge de status.
 */
const SEVERIDADE_CLS: Record<Severidade, string> = {
  impeditivo: "border-transparent bg-destructive text-white",
  alta: "text-destructive border-destructive/40",
  media: "text-warning border-warning/40",
  baixa: "text-muted-foreground border-muted",
};

/** Medição pronta pra persistir (item 28) — valor + fator + modo que o produziram. */
type MedidaCalculada = { mm: number; fator: number; modo: ModoCalibracao };

/** Cor do badge de prazo (item 18). Só vencido usa `destructive` — é o que exige ação hoje. */
const PRAZO_CLS: Record<SituacaoPrazo, string> = {
  sem_prazo: "",
  no_prazo: "text-muted-foreground border-muted",
  vence_em_breve: "text-warning border-warning/40",
  vencido: "border-transparent bg-destructive text-white",
};

/** Valor do `Select` quando nada está escolhido — `Select` do base-ui não aceita `null` como item. */
const SEM_CLASSIFICACAO = "__nenhum__";

/**
 * Os dois campos de classificação (item 11), compartilhados pela janela de criar/editar e pela
 * de reclassificar. Opcional de propósito: exigir os dois a cada pino transformaria o
 * clique-e-descreve num formulário.
 */
function CamposClassificacao({
  severidade,
  setSeveridade,
  tipo,
  setTipo,
  prazo,
  setPrazo,
}: {
  severidade: Severidade | null;
  setSeveridade: (v: Severidade | null) => void;
  tipo: TipoPendencia | null;
  setTipo: (v: TipoPendencia | null) => void;
  prazo: string;
  setPrazo: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pendencia-severidade">Severidade</Label>
          <Select
            value={severidade ?? SEM_CLASSIFICACAO}
            onValueChange={(v) => setSeveridade(v && v !== SEM_CLASSIFICACAO ? (v as Severidade) : null)}
          >
            <SelectTrigger id="pendencia-severidade" className="h-8 text-xs">
              <SelectValue placeholder="Não classificada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CLASSIFICACAO}>Não classificada</SelectItem>
              {SEVERIDADES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SEVERIDADE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pendencia-tipo">Tipo</Label>
          <Select
            value={tipo ?? SEM_CLASSIFICACAO}
            onValueChange={(v) => setTipo(v && v !== SEM_CLASSIFICACAO ? (v as TipoPendencia) : null)}
          >
            <SelectTrigger id="pendencia-tipo" className="h-8 text-xs">
              <SelectValue placeholder="Não classificado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CLASSIFICACAO}>Não classificado</SelectItem>
              {TIPOS_PENDENCIA.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_PENDENCIA_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pendencia-prazo">Prazo (opcional)</Label>
        <input
          id="pendencia-prazo"
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className="w-full rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <p className="text-xs text-muted-foreground">
          A contagem começa quando a rodada é enviada — rascunho não queima prazo.
        </p>
      </div>
      {severidade === "impeditivo" && (
        <p className="text-xs text-destructive">
          Apontamento impeditivo: marca a prancha como bloqueada para aprovação enquanto estiver aberto.
        </p>
      )}
    </>
  );
}

export function PdfViewer(props: Props) {
  const { uploadId, projetoId, disciplinaId, nomeArquivo, codigo, projetoNome, disciplinaNome, versao, versaoAtual, validado, finalizada, podeValidar, ehResponsavel, ehAdmin, colunasTarefa, opcoesTarefa, responsaveisPadrao, temOutraRevisao, documentoId, pranchasParaReplicar, pinInicial, paginaInicial } = props;

  const downloadUrl = `/api/uploads/${uploadId}/download?disposition=inline`;
  // Apontar é permitido mesmo com a entrega já validada — nesse caso o envio abre revisão
  // (mantém a validação financeira). Só a versão vigente recebe pinos novos.
  const podeApontar = podeValidar && versaoAtual;

  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [larguraAlvo, setLarguraAlvo] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [arrastando, setArrastando] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; left: number; top: number } | null>(null);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const ajustarZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  }, []);

  const [pendencias, setPendencias] = useState<PendenciaView[]>(props.pendenciasIniciais);
  // "Em aberto" = aberta OU em_correcao (item 22): quem assumiu a correção ainda tem trabalho
  // pendente, e deixar de contar aqui destravaria a validação ao assumir.
  const temApontamentoAberto = pendencias.some((p) => contaComoTrabalho(p));
  // Rascunhos meus, ainda não entregues (item 31) — não bloqueiam nada, mas some sem avisar
  // seria pior: quem marcou 5 pinos e saiu da tela precisa saber que ninguém os viu.
  const rascunhos = pendencias.filter((p) => ehRascunho(p) && !STATUS_TERMINAIS.includes(p.status as StatusPendencia));
  // Item 19: impeditivo aberto é o que NÃO pode passar — sinalizado à parte do bloqueio geral.
  const temImpeditivo = temImpeditivoAberto(pendencias);
  /** Papéis desta pessoa sobre esta prancha, na forma que a máquina de estados entende. */
  // Tem que espelhar `papeisSobre` do servidor: lá o perfil GLOBAL já conta como responsável.
  // Sem esse `|| props.ehGlobal`, a tela escondia de um supervisor transições que a action
  // aceitaria — o inverso do problema que a máquina veio resolver, e igualmente confuso.
  const papeisNaTela: PapeisPendencia = {
    ehValidador: podeValidar,
    ehResponsavel: ehResponsavel || ehAdmin || props.ehGlobal,
    ehGlobal: ehAdmin || props.ehGlobal,
  };
  // Validar a prancha: só a versão vigente, entrega não finalizada, e sem apontamento
  // aberto (força resolver/fechar as pendências antes de dar por validada).
  const podeValidarArquivo = podeValidar && versaoAtual && !finalizada && !temApontamentoAberto;
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  // Filtro/ordenação da lista lateral (item 15) — só a lista; os pinos no canvas continuam
  // mostrando tudo, senão "filtrar a lista" viraria "esconder pino da prancha", o que não
  // foi pedido.
  const [filtroStatus, setFiltroStatus] = useState<"todos" | keyof typeof STATUS_META>("todos");
  const [ordenacao, setOrdenacao] = useState<"numero" | "pagina" | "recente" | "severidade">("numero");
  const [modoApontar, setModoApontar] = useState(false);
  // Ferramenta de marcação (item 9). "ponto" = clique simples, o comportamento de sempre.
  const [ferramenta, setFerramenta] = useState<TipoMarcacao>("ponto");
  // Calibração por página (item 28) — chega do servidor e é atualizada in loco ao calibrar.
  const [calibracoes, setCalibracoes] = useState<CalibracaoView[]>(props.calibracoesIniciais);
  const calibracaoDaPagina = useCallback(
    (pagina: number) => calibracoes.find((c) => c.pagina === pagina) ?? null,
    [calibracoes],
  );
  /**
   * Página que está sob os olhos do usuário — a que ocupa o topo da área de rolagem. Existe
   * porque a calibração e a medição (item 28) são POR PÁGINA: num PDF de várias pranchas,
   * calibrar "a página 1" enquanto a pessoa olha a 3 seria o erro clássico.
   */
  const [paginaVisivel, setPaginaVisivel] = useState(1);
  // Página cuja calibração está sendo definida; `null` = janela fechada.
  const [calibrarPagina, setCalibrarPagina] = useState<number | null>(null);
  const [modoCalib, setModoCalib] = useState<ModoCalibracao>("escala");
  const [escalaDenom, setEscalaDenom] = useState("50");
  const [refValorMm, setRefValorMm] = useState("");
  // Segmento de referência traçado na prancha durante a calibração por dois pontos.
  const [refSegmento, setRefSegmento] = useState<{ pagina: number; pontos: number } | null>(null);
  /**
   * Página onde estamos ESPERANDO o usuário traçar o segmento de referência, com a janela de
   * calibração recolhida. Precisa existir porque a janela é modal: com ela aberta, o overlay
   * do base-ui come o ponteiro e é fisicamente impossível arrastar sobre a prancha. O fluxo
   * vira dois tempos — recolhe, traça, e a janela volta com o segmento medido.
   */
  const [tracandoReferencia, setTracandoReferencia] = useState<number | null>(null);
  const [tarefaDialogAberto, setTarefaDialogAberto] = useState(false);
  const [pending, start] = useTransition();

  // Rascunho de novo apontamento / edição. `marcacao` só existe quando veio de um arrasto —
  // clique simples segue nascendo pino, sem geometria.
  const [draft, setDraft] = useState<{ pagina: number; x: number; y: number; marcacao: Marcacao | null; medida: MedidaCalculada | null } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  // Classificação do apontamento sendo criado/editado (item 11) — opcional.
  const [severidade, setSeveridade] = useState<Severidade | null>(null);
  const [tipo, setTipo] = useState<TipoPendencia | null>(null);
  /** Prazo do apontamento (item 18) — data ISO no input `type="date"`; "" = sem prazo. */
  const [prazo, setPrazo] = useState("");
  /** Biblioteca (item 10): lista local pra refletir o que foi cadastrado sem recarregar. */
  const [padroes, setPadroes] = useState<PadraoView[]>(props.padroes);
  const [buscaPadrao, setBuscaPadrao] = useState("");
  /**
   * Reincidência (item 17): sugestões de apontamento FECHADO parecido com o que está sendo
   * escrito, e qual delas a pessoa confirmou. Confirmar não muda nada agora — depois de criar
   * o apontamento, vira a referência cruzada do item 13.
   */
  const [reincidencias, setReincidencias] = useState<ReincidenciaView[]>([]);
  const [reincidenciaDe, setReincidenciaDe] = useState<string | null>(null);

  // Consulta de reincidência só no formulário de CRIAÇÃO e com pausa na digitação: editar é
  // ajustar o que já existe, e consultar a cada tecla seria uma varredura por caractere.
  useEffect(() => {
    if (editId || !draft) {
      setReincidencias([]);
      return;
    }
    const t = texto.trim();
    if (t.length < 10) {
      setReincidencias([]);
      return;
    }
    const timer = setTimeout(async () => {
      const r = await sugerirReincidencias({ uploadId, texto: t });
      if (r.ok) setReincidencias(r.data.itens);
    }, 500);
    return () => clearTimeout(timer);
  }, [texto, editId, draft, uploadId]);

  /** Aplica um padrão no formulário: preenche o texto e a pré-classificação sugerida. */
  function aplicarPadrao(p: PadraoView) {
    setTexto(p.texto);
    if (p.severidade) setSeveridade(p.severidade as Severidade);
    if (p.tipo) setTipo(p.tipo as TipoPendencia);
    setBuscaPadrao("");
    // Contabiliza o uso pra ordenação — falhar aqui não pode atrapalhar o apontamento.
    void registrarUsoApontamentoPadrao({ id: p.id }).catch(() => {});
    setPadroes((ps) => ps.map((x) => (x.id === p.id ? { ...x, usos: x.usos + 1 } : x)));
  }

  /** Guarda o texto atual como padrão reutilizável da disciplina. */
  function salvarComoPadrao() {
    const t = texto.trim();
    if (t.length < 3) return;
    start(async () => {
      const r = await criarApontamentoPadrao({ disciplinaId, texto: t, severidade, tipo });
      if (r.ok) {
        setPadroes((ps) => [{ id: r.data.id, texto: r.data.texto, severidade, tipo, usos: 0, geral: false }, ...ps]);
        toast.success("Salvo na biblioteca da disciplina.");
      } else toast.error(r.error);
    });
  }
  // Reclassificar depois do envio (item 11) — janela separada da de editar texto, que fecha
  // assim que a rodada vira tarefa. Aqui é onde a triagem de fato acontece.
  const [classificarId, setClassificarId] = useState<string | null>(null);
  // Thread de resposta (item 39): id do apontamento cuja conversa está aberta + rascunho.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [respostaTexto, setRespostaTexto] = useState("");
  // Geração do PDF carimbado (itens 20/25) — pode levar alguns segundos numa prancha A0.
  const [carimbando, setCarimbando] = useState(false);
  // "Não procede" (item 22) exige justificativa — id do apontamento + texto.
  const [descartarId, setDescartarId] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  // Replicar apontamento pra outras pranchas (item 30).
  const [replicarId, setReplicarId] = useState<string | null>(null);
  const [replicarDestinos, setReplicarDestinos] = useState<Set<string>>(new Set());

  const colunaRef = useRef<HTMLDivElement | null>(null);
  const paginaRefs = useRef(new Map<number, HTMLDivElement>());
  // Zoom por pinça de 2 dedos (item 34-touch) — pan de 1 dedo já existia via Pointer Events.
  const pinch = usePinchZoom(colunaRef, { zoom, setZoom, min: ZOOM_MIN, max: ZOOM_MAX });

  // ── Carrega o documento ──────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    let doc: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: downloadUrl }).promise;
        if (cancelado) {
          doc?.destroy?.();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        console.error("[pdf-viewer] falha ao carregar PDF:", e);
        if (!cancelado) setErro("Não foi possível carregar o PDF.");
      }
    })();
    return () => {
      cancelado = true;
      try {
        doc?.destroy?.();
      } catch {
        /* noop */
      }
    };
  }, [downloadUrl]);

  // Largura-alvo de renderização (acompanha a coluna).
  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const medir = () => setLarguraAlvo(Math.max(320, Math.min(el.clientWidth - 24, 1100)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom com Ctrl + scroll do mouse (scroll normal continua rolando/pan das páginas).
  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      ajustarZoom(e.deltaY < 0 ? 0.2 : -0.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ajustarZoom]);

  const irParaPagina = useCallback((pagina: number) => {
    const alvo = paginaRefs.current.get(pagina);
    alvo?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const busca = usePdfBusca(numPages);
  const camadas = usePdfCamadas(pdf);
  const presentes = usePresencaDocumento(documentoId);

  // Aviso do item 8: a frase é congelada no primeiro render (o servidor já a calculou com a
  // marca d'água ANTERIOR) e some quando a pessoa dispensa. O `marcarDocumentoLido` roda logo
  // em seguida — a partir daqui, "novo" passa a ser o que vier depois desta abertura.
  const [avisoNovidades, setAvisoNovidades] = useState<string | null>(() => descreverNovidades(props.novidades));
  useEffect(() => {
    if (!documentoId) return;
    void marcarDocumentoLido({ documentoId });
  }, [documentoId]);

  /**
   * Ancoragem resiliente (item 3): o pino HERDADO de outra revisão tem `(x,y)` da revisão
   * antiga, que só continua valendo se o layout não mudou. Tendo âncora textual, procura-se o
   * mesmo trecho de texto NESTA revisão e o pino vai junto com o conteúdo. Sem âncora, ou com
   * âncora ambígua/ausente aqui, o pino fica onde estava e assume-se `incerta` — melhor
   * admitir que não sabe do que fingir precisão.
   *
   * Pino da própria revisão NUNCA é relocalizado: seu `(x,y)` é exato por definição, e mexer
   * nele só poderia introduzir erro onde não havia.
   */
  const pinsPosicionados = useMemo(
    () =>
      pendencias.map((p) => {
        if (!p.deOutraRevisao) return { ...p, incerta: false, relocalizado: false };
        const itens = busca.itensDaPagina(p.pagina);
        // Página ainda não reportou texto: mantém o aviso de herdado até saber mais.
        if (!itens || !p.ancora) return { ...p, incerta: true, relocalizado: false };
        const pos = relocalizarAncora(itens, p.ancora);
        if (!pos) return { ...p, incerta: true, relocalizado: false };
        return { ...p, x: pos.x, y: pos.y, incerta: false, relocalizado: true };
      }),
    // versaoTexto muda conforme as páginas reportam texto — é o gatilho pra relocalizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendencias, busca.versaoTexto, busca.itensDaPagina],
  );

  /** Lista lateral filtrada por status e ordenada (item 15) — só a lista, ver nota acima. */
  const pinsDaLista = useMemo(() => {
    const filtrados =
      filtroStatus === "todos" ? pinsPosicionados : pinsPosicionados.filter((p) => p.status === filtroStatus);
    return filtrados.slice().sort((a, b) => {
      if (ordenacao === "pagina") return a.pagina - b.pagina || a.numero - b.numero;
      if (ordenacao === "recente") return b.createdAt.localeCompare(a.createdAt);
      // Gravidade (item 11): impeditivo primeiro, não classificado por último; empate volta
      // pro número, pra ordem não "dançar" entre renders.
      if (ordenacao === "severidade") {
        return pesoSeveridade(a.severidade) - pesoSeveridade(b.severidade) || a.numero - b.numero;
      }
      return a.numero - b.numero;
    });
  }, [pinsPosicionados, filtroStatus, ordenacao]);

  // Ao navegar pra uma ocorrência de busca: rola até a página e, na sequência, até a marca exata.
  useEffect(() => {
    const atual = busca.ocorrenciaAtual;
    if (!atual) return;
    irParaPagina(atual.pagina);
    const id = atual.id;
    const t = setTimeout(() => {
      colunaRef.current?.querySelector(`[data-ocorrencia="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [busca.ocorrenciaAtual, irParaPagina]);

  /**
   * Atalhos de teclado (item 14). Sai fora quando o foco está num campo de texto OU quando
   * qualquer janela está aberta: o viewer tem quatro superfícies de digitação (busca, descrição
   * do apontamento, resposta da thread e os `Select` do base-ui, que tratam seta/typeahead por
   * conta própria), e roubar tecla de qualquer uma delas quebraria a digitação.
   *
   * `Esc` só desliga o modo apontar, e só com tudo fechado — o base-ui já fecha diálogo no Esc
   * sozinho, então tratar aqui também faria a tecla disparar duas coisas de uma vez.
   */
  useEffect(() => {
    if (!podeApontar) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || alvo?.isContentEditable) return;
      if (draft || editId || classificarId || replicarId || threadId) return;
      if (alvo?.closest("[role='dialog'],[role='listbox'],[role='combobox']")) return;

      if (e.key === "Escape") {
        if (modoApontar) {
          setModoApontar(false);
          e.preventDefault();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "a") {
        setModoApontar((v) => !v);
        e.preventDefault();
        return;
      }
      const porTecla: Record<string, TipoMarcacao> = { "1": "ponto", "2": "retangulo", "3": "seta", "4": "nuvem", "5": "medida" };
      const ferr = porTecla[e.key];
      if (ferr) {
        escolherFerramenta(ferr);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // `escolherFerramenta` é recriada a cada render (fecha sobre `paginaVisivel` e as
    // calibrações) — listá-la aqui reassinaria o listener a cada rolagem. As dependências
    // reais são as que decidem se o atalho pode disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeApontar, modoApontar, draft, editId, classificarId, replicarId, threadId, paginaVisivel, calibracoes]);

  // Descobre a página visível pela rolagem: a primeira cujo fim ainda está abaixo do topo da
  // janela. Escuta o container (não o window) porque a rolagem do viewer é interna.
  useEffect(() => {
    const el = colunaRef.current;
    if (!el || !numPages) return;
    function aoRolar() {
      const caixa = el!.getBoundingClientRect();
      let atual = 1;
      for (let n = 1; n <= numPages; n++) {
        const pg = paginaRefs.current.get(n);
        if (!pg) continue;
        const r = pg.getBoundingClientRect();
        // Margem de 40px: a página "vale" enquanto ainda tem corpo visível abaixo do topo.
        if (r.bottom > caixa.top + 40) {
          atual = n;
          break;
        }
      }
      setPaginaVisivel((p) => (p === atual ? p : atual));
    }
    aoRolar();
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, [numPages]);

  // Deep-link ?pagina=&pin= após o documento carregar.
  useEffect(() => {
    if (!numPages) return;
    if (paginaInicial) irParaPagina(paginaInicial);
    if (pinInicial != null) {
      const alvo = props.pendenciasIniciais.find((p) => p.numero === pinInicial);
      if (alvo) {
        setSelecionadaId(alvo.id);
        if (!paginaInicial) irParaPagina(alvo.pagina);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // ── Ações ────────────────────────────────────────────────────
  function fecharFormulario() {
    setDraft(null);
    setEditId(null);
    setTexto("");
    setSeveridade(null);
    setTipo(null);
    setPrazo("");
    setReincidencias([]);
    setReincidenciaDe(null);
  }

  function abrirNovo(
    pagina: number,
    x: number,
    y: number,
    marcacao: Marcacao | null = null,
    medida: MedidaCalculada | null = null,
  ) {
    setEditId(null);
    // Medição já entra com o valor no texto — é o que o usuário ia digitar de qualquer jeito,
    // e deixa o apontamento legível na lista sem depender do desenho.
    setTexto(medida ? `Medida: ${formatarMedida(medida.mm)}. ` : "");
    setSeveridade(null);
    setTipo(null);
    setPrazo("");
    setDraft({ pagina, x, y, marcacao, medida });
  }

  function abrirEdicao(p: PendenciaView) {
    setEditId(p.id);
    setTexto(p.texto);
    setSeveridade((p.severidade as Severidade | null) ?? null);
    setTipo((p.tipo as TipoPendencia | null) ?? null);
    setDraft(null);
  }

  function salvarDraft() {
    const t = texto.trim();
    if (!t) return;
    if (editId) {
      start(async () => {
        const r = await editarPendencia({ id: editId, texto: t, severidade, tipo });
        if (r.ok) {
          setPendencias((ps) => ps.map((p) => (p.id === editId ? { ...p, texto: t, severidade, tipo } : p)));
          fecharFormulario();
          toast.success("Pendência atualizada.");
        } else toast.error(r.error);
      });
      return;
    }
    if (!draft) return;
    // Âncora textual do clique (item 3) — o servidor não tem como calcular, só o cliente tem
    // o PDF renderizado. Null quando não há texto perto: o pino nasce sem âncora, e assumirá
    // "posição incerta" se um dia for herdado por uma revisão de layout diferente.
    const ancora = construirAncora(busca.itensDaPagina(draft.pagina) ?? [], draft.x, draft.y);
    start(async () => {
      const r = await criarPendencia({
        uploadId,
        pagina: draft.pagina,
        x: draft.x,
        y: draft.y,
        texto: t,
        ancora,
        severidade,
        tipo,
        marcacao: draft.marcacao,
        medida: draft.medida,
      });
      if (r.ok) {
        const nova: PendenciaView = {
          id: r.data.id,
          numero: r.data.numero,
          pagina: draft.pagina,
          x: draft.x,
          y: draft.y,
          texto: t,
          status: "aberta",
          severidade,
          tipo,
          marcacao: draft.marcacao,
          medidaMm: draft.medida?.mm ?? null,
          // Nasce RASCUNHO (item 31): só vira público no envio da rodada.
          publicadoEm: null,
          prazo: prazo ? new Date(`${prazo}T12:00:00`).toISOString() : null,
          thumbPath: null,
          anexos: [],
          referencias: [],
          autorId: props.currentUserId,
          autor: "Você",
          tarefaId: null,
          resolvidoEm: null,
          fechadoEm: null,
          createdAt: new Date().toISOString(),
          respostas: [],
          // Recém-criado na versão aberta agora — nunca é carry-over.
          versaoOrigem: versao,
          deOutraRevisao: false,
          ancora,
        };
        setPendencias((ps) => [...ps, nova]);
        setSelecionadaId(nova.id);
        // Reincidência confirmada (item 17) → vira a MESMA referência cruzada do item 13. Não
        // existe "vínculo de reincidência" à parte: seria uma segunda ligação entre os mesmos
        // dois apontamentos, com a mesma semântica e outra tela pra manter.
        const repeteId = reincidenciaDe;
        fecharFormulario();
        if (repeteId) {
          void referenciarPendencia({ origemId: r.data.id, destinoId: repeteId, nota: "reincidência" })
            .then((res) => {
              if (!res.ok) toast.error(res.error);
            })
            .catch(() => {});
        }
        toast.success(`Apontamento #${nova.numero} criado.`);
        // Só marcação de ÁREA tem recorte (item 14) — pino simples não gera miniatura.
        if (draft.marcacao) void enviarMiniatura(r.data.id, draft.pagina, draft.x, draft.y, draft.marcacao);
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirPendencia({ id });
      if (r.ok) {
        setPendencias((ps) => ps.filter((p) => p.id !== id));
        toast.success("Apontamento excluído.");
      } else toast.error(r.error);
    });
  }

  /**
   * Miniatura do recorte (item 14, R6 pediu que persista). Recorta do canvas JÁ RENDERIZADO da
   * página — nada de re-renderizar o PDF só pra isso — e sobe por multipart em segundo passo
   * (a action já criou a linha e devolveu o id), mesmo desenho do snapshot da Coordenação.
   *
   * Só roda para apontamento COM FORMA: o "recorte" do item 14 é a área selecionada, e pino
   * simples não tem área. Também é a interação mais quente do viewer — não deve pagar um
   * round trip a mais, mesma razão de a consulta de menções só disparar quando há "@".
   *
   * Falha silenciosa de propósito: o apontamento já existe e é válido sem miniatura; um toast
   * de erro aqui puniria o usuário por algo que não muda o trabalho dele.
   */
  const MAX_THUMB = 480;
  async function enviarMiniatura(pendenciaId: string, pagina: number, x: number, y: number, marcacao: Marcacao) {
    try {
      const canvas = paginaRefs.current.get(pagina)?.querySelector("canvas");
      if (!canvas) return;
      // Pixels REAIS do canvas (já incluem o DPR); o tamanho CSS daria recorte deslocado em tela retina.
      const { sx, sy, sw, sh } = caixaRecorte(x, y, marcacao, canvas.width, canvas.height);
      const escala = Math.min(1, MAX_THUMB / sw);
      const destino = document.createElement("canvas");
      destino.width = Math.max(1, Math.round(sw * escala));
      destino.height = Math.max(1, Math.round(sh * escala));
      const ctx = destino.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, destino.width, destino.height);
      const blob = await new Promise<Blob | null>((r) => destino.toBlob(r, "image/png"));
      if (!blob) return;
      const form = new FormData();
      form.append("pendenciaId", pendenciaId);
      form.append("file", new File([blob], "thumb.png", { type: "image/png" }));
      const resp = await fetch("/api/pendencias/thumb", { method: "POST", body: form });
      if (!resp.ok) return;
      const dados = (await resp.json()) as { thumbPath?: string };
      // 2ª atualização: a linha otimista entrou na lista antes de a miniatura existir.
      if (dados.thumbPath) {
        setPendencias((ps) => ps.map((p) => (p.id === pendenciaId ? { ...p, thumbPath: dados.thumbPath! } : p)));
      }
    } catch (e) {
      console.warn("[apontamentos] miniatura não pôde ser gerada:", e);
    }
  }

  /**
   * Troca a ferramenta ativa e liga o modo apontar (senão a tecla parece não fazer nada).
   *
   * Medir exige escala: sem calibração na página visível, abre a janela de calibração em vez
   * de deixar o usuário arrastar e não receber número nenhum. `medidaMm` é congelado na
   * criação, então não existe estado de "medida sem valor" pra consertar depois.
   */
  function escolherFerramenta(t: TipoMarcacao) {
    setFerramenta(t);
    setModoApontar(true);
    if (t === "medida" && !calibracaoDaPagina(paginaVisivel)) {
      abrirCalibracao(paginaVisivel);
    }
  }

  function abrirCalibracao(pagina: number) {
    const atual = calibracaoDaPagina(pagina);
    setModoCalib((atual?.modo as ModoCalibracao | undefined) ?? "escala");
    setEscalaDenom(atual?.escalaDenominador ? String(atual.escalaDenominador) : "50");
    setRefSegmento(null);
    setRefValorMm("");
    setCalibrarPagina(pagina);
  }

  /**
   * Salva a calibração da página (item 28). Os dois modos convergem em `mmPorPonto` antes de
   * sair do cliente — é a única grandeza que o servidor guarda, e é o que a medição consome.
   */
  function salvarCalibracao() {
    if (calibrarPagina == null) return;
    const pagina = calibrarPagina;
    let fator: number | null = null;
    let denom: number | null = null;
    if (modoCalib === "escala") {
      denom = Number(escalaDenom.replace(",", "."));
      fator = fatorPorEscala(denom);
      if (!fator) {
        toast.error("Informe uma escala válida (ex.: 50 para 1:50).");
        return;
      }
    } else {
      if (!refSegmento || refSegmento.pagina !== pagina) {
        toast.error("Trace na prancha um segmento de medida conhecida.");
        return;
      }
      const valor = Number(refValorMm.replace(",", "."));
      fator = fatorPorCalibracao(refSegmento.pontos, valor);
      if (!fator) {
        toast.error("Informe a medida real do segmento, em milímetros.");
        return;
      }
    }
    const mmPorPonto = fator;
    start(async () => {
      const r = await calibrarPrancha({
        uploadId,
        pagina,
        modo: modoCalib,
        escalaDenominador: modoCalib === "escala" ? denom : null,
        mmPorPonto,
      });
      if (r.ok) {
        setCalibracoes((cs) => [
          ...cs.filter((c) => c.pagina !== pagina),
          { pagina, modo: r.data.modo, escalaDenominador: r.data.escalaDenominador, mmPorPonto: r.data.mmPorPonto },
        ]);
        setCalibrarPagina(null);
        setRefSegmento(null);
        setRefValorMm("");
        toast.success(`Página ${pagina} calibrada.`);
      } else toast.error(r.error);
    });
  }

  /** "Não procede" (item 22) — justificativa obrigatória, validada também no servidor. */
  function confirmarDescarte() {
    if (!descartarId) return;
    const id = descartarId;
    const texto = justificativa.trim();
    if (texto.length < 3) return;
    start(async () => {
      const r = await descartarPendencia({ id, justificativa: texto });
      if (r.ok) {
        setPendencias((ps) => ps.map((x) => (x.id === id ? { ...x, status: "descartada" } : x)));
        setDescartarId(null);
        setJustificativa("");
        toast.success("Marcado como não procede.");
      } else toast.error(r.error);
    });
  }

  /** Abre a janela de reclassificação já com o que o apontamento tem hoje (item 11). */
  function abrirClassificacao(p: PendenciaView) {
    setSeveridade((p.severidade as Severidade | null) ?? null);
    setTipo((p.tipo as TipoPendencia | null) ?? null);
    setPrazo(p.prazo ? p.prazo.slice(0, 10) : "");
    setClassificarId(p.id);
  }

  function salvarClassificacao() {
    if (!classificarId) return;
    const id = classificarId;
    start(async () => {
      const r = await classificarPendencia({ id, severidade, tipo, prazo: prazo || null });
      if (r.ok) {
        setPendencias((ps) =>
          ps.map((p) =>
            p.id === id ? { ...p, severidade, tipo, prazo: prazo ? new Date(`${prazo}T12:00:00`).toISOString() : null } : p,
          ),
        );
        setClassificarId(null);
        setSeveridade(null);
        setTipo(null);
        setPrazo("");
        toast.success("Classificação atualizada.");
      } else toast.error(r.error);
    });
  }

  /** Apaga a própria resposta da thread (ou admin apaga qualquer uma). */
  function apagarResposta(pendenciaId: string, respostaId: string) {
    start(async () => {
      const r = await excluirRespostaPendencia({ id: respostaId });
      if (r.ok) {
        setPendencias((ps) =>
          ps.map((p) => (p.id === pendenciaId ? { ...p, respostas: p.respostas.filter((x) => x.id !== respostaId) } : p)),
        );
      } else toast.error(r.error);
    });
  }

  /**
   * Baixa o PDF carimbado (itens 20/25). Manda as posições **como estão na tela** — o pino
   * herdado que a âncora textual reposicionou nesta revisão (item 3) só é calculado aqui no
   * cliente. Se o servidor usasse o x/y cru do banco, o papel que vai pra obra mostraria o
   * apontamento num lugar e a tela em outro, que é a divergência que este item veio evitar.
   */
  async function baixarCarimbado() {
    setCarimbando(true);
    try {
      const r = await fetch("/api/pendencias/pdf-carimbado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          posicoes: pinsPosicionados.map((p) => ({ id: p.id, pagina: p.pagina, x: p.x, y: p.y })),
        }),
      });
      if (!r.ok) {
        const dados = await r.json().catch(() => null);
        toast.error(dados?.error ?? "Não foi possível gerar o PDF carimbado.");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo.replace(/\.pdf$/i, "") + "-carimbado.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível gerar o PDF carimbado.");
    } finally {
      setCarimbando(false);
    }
  }

  /** Publica uma resposta na thread do apontamento (item 39). */
  function enviarResposta() {
    const t = respostaTexto.trim();
    if (!threadId || !t) return;
    start(async () => {
      const r = await responderPendencia({ id: threadId, texto: t });
      if (r.ok) {
        const nova = {
          id: r.data.id,
          autorId: props.currentUserId,
          autor: "Você",
          texto: t,
          createdAt: new Date().toISOString(),
        };
        setPendencias((ps) => ps.map((p) => (p.id === threadId ? { ...p, respostas: [...p.respostas, nova] } : p)));
        setRespostaTexto("");
      } else toast.error(r.error);
    });
  }

  function confirmarReplicar() {
    if (!replicarId || replicarDestinos.size === 0) return;
    start(async () => {
      const r = await replicarPendencia({ id: replicarId, uploadIds: [...replicarDestinos] });
      if (r.ok) {
        toast.success(`Apontamento replicado pra ${r.data.total} prancha(s).`);
        setReplicarId(null);
        setReplicarDestinos(new Set());
      } else toast.error(r.error);
    });
  }

  function mudarStatus(
    id: string,
    fn: (i: { id: string }) => Promise<{ ok: boolean; error?: string }>,
    novo: string,
    msg: string,
  ) {
    start(async () => {
      const r = await fn({ id });
      if (r.ok) {
        setPendencias((ps) => ps.map((p) => (p.id === id ? { ...p, status: novo } : p)));
        toast.success(msg);
      } else toast.error(r.error ?? "Erro.");
    });
  }

  function aplicarEnvio(data: { tarefaId: string; total: number; revisaoAberta: number | null }) {
    setPendencias((ps) => ps.map((p) => (p.status === "aberta" && !p.tarefaId ? { ...p, tarefaId: data.tarefaId } : p)));
    toast.success(
      data.revisaoAberta != null
        ? `Revisão R${data.revisaoAberta} aberta · tarefa com ${data.total} apontamento(s).`
        : `Tarefa criada com ${data.total} apontamento(s).`,
    );
    setModoApontar(false);
  }

  // "Enviar" abre a janela de confirmação da tarefa (prioridade/prazo/etc não são automáticos).
  function enviar() {
    if (abertasSemTarefa === 0) return;
    if (!opcoesTarefa) {
      // Sem dados da janela → cria direto com os defaults do servidor.
      start(async () => {
        const r = await enviarApontamentos({ uploadId });
        if (r.ok) aplicarEnvio(r.data);
        else toast.error(r.error);
      });
      return;
    }
    setTarefaDialogAberto(true);
  }

  // Chamado pela janela de confirmação: cria a tarefa com os campos revisados.
  async function submeterTarefa(payload: {
    titulo: string;
    descricao: string;
    statusId: string;
    prazo: string;
    prioridade: string;
    responsaveisIds: string[];
    dependeDeIds: string[];
  }): Promise<boolean> {
    const r = await enviarApontamentos({
      uploadId,
      titulo: payload.titulo,
      descricao: payload.descricao,
      statusId: payload.statusId,
      prazo: payload.prazo,
      prioridade: payload.prioridade,
      responsaveisIds: payload.responsaveisIds,
      dependeDeIds: payload.dependeDeIds,
    });
    if (r.ok) {
      aplicarEnvio(r.data);
      return true;
    }
    toast.error(r.error);
    return false;
  }

  // ── Pan por arraste (quando não está apontando) ──────────────
  function panDown(e: React.PointerEvent<HTMLDivElement>) {
    if (modoApontar || e.button !== 0 || pinch.pinching) return;
    if ((e.target as HTMLElement).closest("button, a")) return; // não sequestra pinos/links
    const el = colunaRef.current;
    if (!el) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setArrastando(true);
    el.setPointerCapture?.(e.pointerId);
  }
  function panMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = panRef.current;
    const el = colunaRef.current;
    // Um 2º dedo tocou no meio do arraste: solta o pan e deixa a pinça assumir.
    if (pinch.pinching) {
      panRef.current = null;
      setArrastando(false);
      return;
    }
    if (!p || !el) return;
    el.scrollLeft = p.left - (e.clientX - p.sx);
    el.scrollTop = p.top - (e.clientY - p.sy);
  }
  function panUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    panRef.current = null;
    setArrastando(false);
    colunaRef.current?.releasePointerCapture?.(e.pointerId);
  }

  const enviaveis = pendencias
    .filter((p) => p.status === "aberta" && !p.tarefaId)
    .slice()
    .sort((a, b) => a.numero - b.numero);
  const abertasSemTarefa = enviaveis.length;

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <Link
          href={`/projetos/${projetoId}/arquivos`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Arquivos
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{nomeArquivo}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {codigo} · {projetoNome} · {disciplinaNome} · {rotuloRevisao(versao)}
            {!versaoAtual && " (versão anterior)"}
          </p>
        </div>
        {/* Busca textual */}
        {pdf && (
          <BarraBuscaPdf
            query={busca.query}
            onQueryChange={busca.setQuery}
            total={busca.total}
            indiceAtual={busca.indiceAtual}
            pronto={busca.pronto}
            onProxima={busca.proxima}
            onAnterior={busca.anterior}
            className="flex items-center gap-1"
          />
        )}
        {/* Camadas/OCG — só aparece quando o PDF de fato tem alguma (raro fora de export CAD/Revit). */}
        {pdf && camadas.temCamadas && <CamadasPdf grupos={camadas.grupos} onAlternar={camadas.alternar} />}
        {/* Presença (item 32) — só quando alguém mais está com o mesmo documento aberto. Sem
            Socket.io ativo (`npm run dev` puro), `presentes` fica sempre vazio — degrada
            para "nada aparece", nunca erro. */}
        {presentes.length > 0 && (
          <div
            className="flex items-center -space-x-2"
            title={`Também vendo agora: ${presentes.map((u) => u.nome).join(", ")}`}
          >
            {presentes.slice(0, 3).map((u) => (
              <Avatar key={u.userId} className="size-6 border-2 border-background">
                <AvatarFallback className="text-[10px]">{u.nome.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
            {presentes.length > 3 && (
              <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
                +{presentes.length - 3}
              </span>
            )}
          </div>
        )}
        {/* Comparar revisões (itens 4/5) — só quando existe outra versão pra comparar. */}
        {temOutraRevisao && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Comparar revisões"
            title="Comparar revisões"
            render={<Link href={`/projetos/${projetoId}/arquivos/${uploadId}/comparar`} />}
          >
            <GitCompare className="size-4" />
          </Button>
        )}
        {/* Zoom / ajuste à largura */}
        {pdf && (
          <div className="flex items-center gap-0.5 rounded-sm border px-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => ajustarZoom(-0.25)}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
              title="Diminuir zoom"
            >
              <ZoomOut className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[4.5ch] text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
              title="Ajustar à largura (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => ajustarZoom(0.25)}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
              title="Aumentar zoom"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setZoom(1)}
              aria-label="Ajustar à largura"
              title="Ajustar à largura"
            >
              <Maximize2 className="size-4" />
            </Button>
          </div>
        )}
        {podeValidarArquivo ? (
          <AcoesValidacaoArquivo uploadId={uploadId} nomeArquivo={nomeArquivo} validado={validado} />
        ) : (
          podeValidar &&
          versaoAtual &&
          !finalizada &&
          !validado &&
          temApontamentoAberto && (
            <span
              className={cn("text-xs", temImpeditivo ? "font-medium text-destructive" : "text-warning")}
              title={
                temImpeditivo
                  ? "Há apontamento IMPEDITIVO em aberto — a prancha não pode ser liberada."
                  : "Resolva ou feche os apontamentos abertos para validar a prancha"
              }
            >
              {temImpeditivo
                ? "Apontamento IMPEDITIVO em aberto — não é possível validar."
                : "Apontamento(s) em aberto — não é possível validar."}
            </span>
          )
        )}
        {avisoNovidades && (
          <span
            className="inline-flex items-center gap-1 rounded-sm border border-info/40 px-1.5 py-0.5 text-xs text-info"
            title="Contado a partir da última vez que você abriu esta prancha."
          >
            <Sparkles className="size-3" />
            {avisoNovidades}
            <button
              type="button"
              aria-label="Dispensar aviso de novidades"
              className="ml-0.5 text-info/70 hover:text-info"
              onClick={() => setAvisoNovidades(null)}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        {rascunhos.length > 0 && (
          <span className="text-xs text-muted-foreground" title="Só você enxerga estes apontamentos até enviar a rodada.">
            {rascunhos.length} em rascunho
          </span>
        )}
        {podeApontar ? (
          <>
            <Button
              size="sm"
              variant={modoApontar ? "default" : "outline"}
              onClick={() => setModoApontar((v) => !v)}
              className="gap-1"
              title="Ative e clique na prancha para criar um apontamento (atalho: A)"
            >
              <MapPin className="size-4" /> {modoApontar ? "Apontando…" : "Apontar"}
            </Button>
            {/* Escala da página visível (item 28) — clicável pra (re)calibrar. */}
            {modoApontar && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => abrirCalibracao(paginaVisivel)}
                title={`Escala da página ${paginaVisivel} — clique para calibrar`}
              >
                <Ruler className="size-3.5" />
                {rotuloCalibracao(calibracaoDaPagina(paginaVisivel)?.modo, calibracaoDaPagina(paginaVisivel)?.escalaDenominador)}
              </Button>
            )}
            {/* Ferramenta de marcação (item 9) — só aparece no modo apontar, senão ocupa a
                barra com um controle que não faz nada. */}
            {modoApontar && (
              <Select value={ferramenta} onValueChange={(v) => escolherFerramenta((v as TipoMarcacao) ?? "ponto")}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label="Tipo de marcação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_MARCACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MARCACAO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              onClick={enviar}
              disabled={pending || abertasSemTarefa === 0}
              className="gap-1"
              title={finalizada ? "Abrirá revisão (mantém a validação financeira)" : undefined}
            >
              <Send className="size-4" /> Enviar {abertasSemTarefa > 0 && `(${abertasSemTarefa})`}
            </Button>
          </>
        ) : podeValidar ? (
          <span className="text-xs text-muted-foreground">Versão anterior — aponte na versão atual.</span>
        ) : null}
      </div>

      {/* Aviso: apontar numa entrega já validada abre revisão */}
      {podeApontar && finalizada && (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs text-warning">
          <MapPin className="size-3.5 shrink-0" /> Entrega já validada — enviar apontamentos abre revisão.
        </div>
      )}

      {/* Busca sem resultado por falta de texto pesquisável (PDF provavelmente escaneado) */}
      {busca.query.trim() !== "" && busca.semTextoPesquisavel && (
        <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-xs text-warning">
          Esta prancha não possui texto pesquisável (provavelmente escaneada).
        </div>
      )}

      {/* Régua de calibração armada (item 28): a janela está recolhida esperando o traço. */}
      {tracandoReferencia != null && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <Ruler className="size-3.5 shrink-0" />
          Arraste sobre uma dimensão conhecida da página {tracandoReferencia} (uma cota, um vão).
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => {
              setTracandoReferencia(null);
              setCalibrarPagina(tracandoReferencia);
            }}
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Dica do modo-apontar */}
      {modoApontar && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-1.5 text-xs text-primary">
          <MapPin className="size-3.5 shrink-0" />{" "}
          {ferramenta === "ponto"
            ? "Clique no ponto da prancha onde está a pendência."
            : `Arraste na prancha para desenhar ${MARCACAO_LABEL[ferramenta].toLowerCase()} — cancelar na janela descarta o desenho.`}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            Atalhos: 1 pino · 2 retângulo · 3 seta · 4 nuvem · Esc sai
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Coluna de páginas */}
        <div
          ref={colunaRef}
          className={cn(
            "min-w-0 flex-1 overflow-auto bg-muted/30 p-3",
            !modoApontar && (arrastando ? "cursor-grabbing select-none" : "cursor-grab"),
          )}
          // O pan (1 dedo) e o zoom (2 dedos) já são 100% custom via Pointer Events — sem
          // isto, o gesto NATIVO do navegador (scroll/pinch-zoom da página) rodaria junto e
          // brigaria com `panMove`/`usePinchZoom` (double-scroll, ou pinça some cedo demais).
          style={{ touchAction: "none" }}
          onPointerDown={panDown}
          onPointerMove={panMove}
          onPointerUp={panUp}
          onPointerLeave={panUp}
        >
          {erro ? (
            <div className="mx-auto mt-16 max-w-sm text-center text-sm text-destructive">{erro}</div>
          ) : !pdf ? (
            <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando prancha…
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <Pagina
                  key={n}
                  registrar={(el) => {
                    if (el) paginaRefs.current.set(n, el);
                    else paginaRefs.current.delete(n);
                  }}
                  pdf={pdf}
                  pagina={n}
                  largura={Math.round(larguraAlvo * zoom)}
                  pins={pinsPosicionados.filter((p) => p.pagina === n)}
                  selecionadaId={selecionadaId}
                  modoApontar={modoApontar}
                  ferramenta={ferramenta}
                  mmPorPonto={calibracaoDaPagina(n)?.mmPorPonto ?? null}
                  modoCalibracao={(calibracaoDaPagina(n)?.modo as ModoCalibracao | undefined) ?? null}
                  capturandoReferencia={tracandoReferencia === n}
                  onSegmentoReferencia={(pagina, pontos) => {
                    setRefSegmento({ pagina, pontos });
                    // Traçou: recolhe o modo régua e traz a janela de volta pra digitar o valor.
                    setTracandoReferencia(null);
                    setCalibrarPagina(pagina);
                  }}
                  onSelecionar={setSelecionadaId}
                  onApontar={(x, y, marcacao, medida) => abrirNovo(n, x, y, marcacao, medida)}
                  onTexto={busca.registrarTexto}
                  marcas={busca.ocorrenciasPorPagina(n)}
                  ocgConfig={camadas.config}
                  ocgVersao={camadas.versao}
                />
              ))}
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="flex w-80 shrink-0 flex-col border-l">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Apontamentos</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                {pendencias.length}
              </Badge>
              {pendencias.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Exportar apontamentos em BCF"
                  title="Exportar apontamentos em BCF (Revit/Navisworks/BIMcollab)"
                  render={<a href={`/api/pendencias/bcf?projeto=${projetoId}&ids=${pendencias.map((p) => p.id).join(",")}`} />}
                >
                  <FileArchive className="size-3.5" />
                </Button>
              )}
              {pendencias.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Baixar relatório em planilha"
                  title="Relatório de apontamentos (.xlsx)"
                  render={<a href={`/api/pendencias/relatorio?upload=${uploadId}`} />}
                >
                  <Table2 className="size-3.5" />
                </Button>
              )}
              {pendencias.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label="Baixar PDF carimbado"
                  title="PDF carimbado (marcações + bloco de análise)"
                  onClick={baixarCarimbado}
                  disabled={carimbando}
                >
                  {carimbando ? <Loader2 className="size-3.5 animate-spin" /> : <Stamp className="size-3.5" />}
                </Button>
              )}
            </div>
          </div>
          {pendencias.length > 0 && (
            <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus((v as typeof filtroStatus) ?? "todos")}>
                <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_META).map(([v, m]) => (
                    <SelectItem key={v} value={v}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ordenacao} onValueChange={(v) => setOrdenacao((v as typeof ordenacao) ?? "numero")}>
                <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="numero">Nº</SelectItem>
                  <SelectItem value="pagina">Página</SelectItem>
                  <SelectItem value="recente">Mais recente</SelectItem>
                  <SelectItem value="severidade">Gravidade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pendencias.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {podeApontar
                  ? "Clique em “Apontar” e toque na prancha para criar uma pendência."
                  : "Nenhum apontamento nesta prancha."}
              </p>
            ) : pinsDaLista.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhum apontamento com esse filtro.
              </p>
            ) : (
              <ul className="divide-y">
                {pinsDaLista.map((p) => {
                    const meta = STATUS_META[p.status] ?? STATUS_META.aberta;
                    const sel = selecionadaId === p.id;
                    // Editar/excluir: só quem criou o apontamento (ou admin), enquanto aberto e sem tarefa.
                    const editavel =
                      (p.autorId === props.currentUserId || ehAdmin) && p.status === "aberta" && !p.tarefaId;
                    return (
                      <li
                        key={p.id}
                        className={cn("cursor-pointer px-3 py-2 text-sm hover:bg-muted/50", sel && "bg-muted")}
                        onClick={() => {
                          setSelecionadaId(p.id);
                          irParaPagina(p.pagina);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", meta.pin)}>
                            {p.numero}
                          </span>
                          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.cls)}>
                            {meta.label}
                          </Badge>
                          {ehRascunho(p) && (
                            <Badge
                              variant="outline"
                              className="h-5 border-dashed px-1.5 text-[10px] text-muted-foreground"
                              title="Rascunho: só você enxerga. Vira visível ao enviar a rodada."
                            >
                              Rascunho
                            </Badge>
                          )}
                          {p.deOutraRevisao && p.versaoOrigem != null && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] text-muted-foreground"
                              title={
                                p.relocalizado
                                  ? `Aberto na ${rotuloRevisao(p.versaoOrigem)} — o pino foi reposicionado pelo texto desta revisão.`
                                  : `Aberto na ${rotuloRevisao(p.versaoOrigem)} — a posição do pino pode não corresponder a esta revisão.`
                              }
                            >
                              {rotuloRevisao(p.versaoOrigem)}
                              {p.incerta && " ?"}
                            </Badge>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground">pág. {p.pagina}</span>
                        </div>
                        {/* Classificação (item 11) — some quando o apontamento não foi classificado,
                            em vez de mostrar um "—" que só ocuparia espaço na lista. */}
                        {(p.severidade || p.tipo || p.marcacao || p.prazo) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {p.marcacao && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                                {MARCACAO_LABEL[p.marcacao.tipo]}
                              </Badge>
                            )}
                            {p.severidade && (
                              <Badge
                                variant="outline"
                                className={cn("h-5 px-1.5 text-[10px]", SEVERIDADE_CLS[p.severidade as Severidade])}
                              >
                                {SEVERIDADE_LABEL[p.severidade as Severidade] ?? p.severidade}
                              </Badge>
                            )}
                            {p.tipo && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                                {TIPO_PENDENCIA_LABEL[p.tipo as TipoPendencia] ?? p.tipo}
                              </Badge>
                            )}
                            {(() => {
                              const sit = situacaoPrazo(p, STATUS_TERMINAIS);
                              if (sit === "sem_prazo") return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className={cn("h-5 px-1.5 text-[10px]", PRAZO_CLS[sit])}
                                  title={`${SITUACAO_PRAZO_LABEL[sit]} — ${rotuloPrazo(diasAtePrazo(p.prazo, p.publicadoEm))}`}
                                >
                                  {rotuloPrazo(diasAtePrazo(p.prazo, p.publicadoEm))}
                                </Badge>
                              );
                            })()}
                          </div>
                        )}
                        {/* Miniatura do recorte (item 14) — só existe em marcação de área.
                            `loading="lazy"` porque uma prancha pode ter dezenas. */}
                        {p.thumbPath && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/pendencias/thumb/${p.id}`}
                            alt={`Recorte da prancha no apontamento #${p.numero}`}
                            loading="lazy"
                            className="mt-1.5 max-h-28 w-full rounded-sm border bg-white object-contain"
                          />
                        )}
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs">{textoComMencao(p.texto)}</p>
                        {/* Anexos (item 12) — evidência da pendência. Aparece quando já existe
                            algum, ou quando a thread está aberta (é a hora natural de juntar). */}
                        {(p.anexos.length > 0 || threadId === p.id) && (
                          <PendenciaAnexos
                            pendenciaId={p.id}
                            anexos={p.anexos}
                            currentUserId={props.currentUserId}
                            ehAdmin={ehAdmin}
                            onMudou={(anexos) =>
                              setPendencias((ps) => ps.map((x) => (x.id === p.id ? { ...x, anexos } : x)))
                            }
                          />
                        )}
                        {/* Referência cruzada (item 13) — mesma regra de exibição dos anexos:
                            só ocupa espaço quando já existe ligação ou a thread está aberta. */}
                        {(p.referencias.length > 0 || threadId === p.id) && (
                          <PendenciaReferencias
                            pendenciaId={p.id}
                            referencias={p.referencias}
                            currentUserId={props.currentUserId}
                            ehAdmin={ehAdmin}
                            onMudou={(referencias) =>
                              setPendencias((ps) => ps.map((x) => (x.id === p.id ? { ...x, referencias } : x)))
                            }
                          />
                        )}
                        {/* Thread de resposta (item 39) — a conversa do apontamento, aberta sob demanda. */}
                        {(threadId === p.id || p.respostas.length > 0) && (
                          <div className="mt-1.5 space-y-1.5 rounded-sm border-l-2 border-muted pl-2" onClick={(e) => e.stopPropagation()}>
                            {p.respostas.map((r) => (
                              <div key={r.id} className="group/resp text-[11px]">
                                <span className="font-medium">{r.autor}</span>
                                <span className="ml-1 text-muted-foreground">{formatarDataHora(r.createdAt)}</span>
                                {(r.autorId === props.currentUserId || ehAdmin) && (
                                  <button
                                    type="button"
                                    aria-label={`Apagar resposta de ${r.autor}`}
                                    className="ml-1 align-middle text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/resp:opacity-100"
                                    onClick={() => apagarResposta(p.id, r.id)}
                                    disabled={pending}
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                )}
                                <p className="whitespace-pre-wrap break-words">{textoComMencao(r.texto)}</p>
                              </div>
                            ))}
                            {threadId === p.id && (
                              <div className="flex items-end gap-1 pt-0.5">
                                <textarea
                                  value={respostaTexto}
                                  onChange={(e) => setRespostaTexto(e.target.value)}
                                  placeholder="Responder… (use @nome para mencionar)"
                                  maxLength={2000}
                                  rows={2}
                                  autoFocus
                                  className="w-full resize-y rounded-sm border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary"
                                />
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={enviarResposta} disabled={pending || !respostaTexto.trim()}>
                                  Enviar
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                            onClick={() => {
                              setThreadId((atual) => (atual === p.id ? null : p.id));
                              setRespostaTexto("");
                            }}
                            disabled={pending}
                          >
                            <MessageSquare className="size-3" />
                            {p.respostas.length > 0 ? `responder (${p.respostas.length})` : "responder"}
                          </Button>
                          {editavel && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs" onClick={() => abrirEdicao(p)} disabled={pending}>
                                <Pencil className="size-3" /> editar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-destructive" onClick={() => excluir(p.id)} disabled={pending}>
                                <Trash2 className="size-3" /> excluir
                              </Button>
                            </>
                          )}
                          {/* Evidência do "depois" (item 7): avisa exatamente no momento em que
                              alguém marcou como resolvida e o validador vai fechar. Não bloqueia
                              — há correção que não rende foto (uma cota que passou a existir na
                              revisão nova), e travar o fechamento por isso pararia o fluxo. */}
                          {p.status === "resolvida" && !temEvidencia(p.anexos, "depois") && (
                            <span className="w-full text-[10px] text-muted-foreground">
                              Sem evidência do “depois” anexada.
                            </span>
                          )}
                          {/* Transições (item 22): a lista sai da MESMA máquina que a action
                              usa pra recusar, então a tela nunca oferece um movimento que o
                              servidor vai negar. */}
                          {transicoesPossiveis(p.status, papeisNaTela).map((destino) => {
                            const meta = ACAO_TRANSICAO[destino];
                            const Icone = meta.icone;
                            const rotulo = destino === "aberta" && p.status === "resolvida" ? "reabrir" : meta.rotulo;
                            return (
                              <Button
                                key={destino}
                                size="sm"
                                variant="ghost"
                                className={cn("h-6 gap-1 px-1.5 text-xs", meta.cls)}
                                onClick={() => {
                                  // "Não procede" precisa de justificativa: abre a janela.
                                  // Sem action direta = precisa de janela (só "não procede" hoje).
                                  if (!meta.acao) setDescartarId(p.id);
                                  else mudarStatus(p.id, meta.acao, destino, meta.sucesso);
                                }}
                                disabled={pending}
                              >
                                <Icone className="size-3" /> {rotulo}
                              </Button>
                            );
                          })}
                          {podeValidar && !STATUS_TERMINAIS.includes(p.status as StatusPendencia) && (
                            /* Triagem (item 11): vale DEPOIS do envio, quando "editar" já fechou —
                               é justamente aí que se decide o que é impeditivo. */
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground" onClick={() => abrirClassificacao(p)} disabled={pending}>
                              <Tags className="size-3" /> classificar
                            </Button>
                          )}
                          {podeValidar && pranchasParaReplicar.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                              onClick={() => {
                                setReplicarId(p.id);
                                setReplicarDestinos(new Set());
                              }}
                              disabled={pending}
                            >
                              <CopyPlus className="size-3" /> replicar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Dialog de texto (novo / editar) */}
      <Dialog
        open={draft != null || editId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            setEditId(null);
            setTexto("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar apontamento" : "Novo apontamento"}</DialogTitle>
            <DialogDescription className="truncate">
              {nomeArquivo}
              {draft && ` · pág. ${draft.pagina}`}
            </DialogDescription>
          </DialogHeader>
          {/* Biblioteca de apontamentos-padrão (item 10) — só no formulário de CRIAÇÃO:
              editar um apontamento existente é ajustar o que já foi escrito, não escolher
              de catálogo. */}
          {!editId && padroes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="busca-padrao">Usar um apontamento-padrão</Label>
              <input
                id="busca-padrao"
                value={buscaPadrao}
                onChange={(e) => setBuscaPadrao(e.target.value)}
                placeholder="Buscar na biblioteca da disciplina…"
                className="w-full rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
              {buscaPadrao.trim().length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-sm border">
                  {padroes
                    .filter((p) => p.texto.toLowerCase().includes(buscaPadrao.trim().toLowerCase()))
                    .slice(0, 8)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => aplicarPadrao(p)}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1 truncate">{p.texto}</span>
                        {p.geral && <span className="shrink-0 text-[10px] text-muted-foreground">geral</span>}
                        {p.usos > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{p.usos}×</span>}
                      </button>
                    ))}
                  {padroes.filter((p) => p.texto.toLowerCase().includes(buscaPadrao.trim().toLowerCase())).length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nada na biblioteca com esse termo.</p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pendencia-texto">Descrição da pendência</Label>
            <textarea
              id="pendencia-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: cota ausente na planta baixa; revisar espessura da parede."
              maxLength={1000}
              rows={4}
              autoFocus
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            {/* Reincidência (item 17): SUGESTÃO. Marcar não muda estado nenhum — só faz o
                apontamento nascer ligado ao fechado (referência do item 13). */}
            {reincidencias.length > 0 && (
              <div className="space-y-1 rounded-sm border border-warning/40 bg-warning/5 p-2">
                <p className="text-xs font-medium text-warning">
                  Parece repetir apontamento já fechado nesta disciplina:
                </p>
                {reincidencias.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={reincidenciaDe === r.id}
                      onChange={(e) => setReincidenciaDe(e.target.checked ? r.id : null)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">#{r.numero}</span> {r.texto}
                      <span className="block text-[10px] text-muted-foreground">
                        {r.arquivo}
                        {r.fechadoEm ? ` · fechado em ${formatarData(r.fechadoEm)}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  Marcar apenas registra a ligação entre os dois apontamentos.
                </p>
              </div>
            )}
          </div>
          <CamposClassificacao severidade={severidade} setSeveridade={setSeveridade} tipo={tipo} setTipo={setTipo} prazo={prazo} setPrazo={setPrazo} />
          <DialogFooter>
            {!editId && (
              <Button
                variant="ghost"
                className="mr-auto gap-1 text-xs text-muted-foreground"
                onClick={salvarComoPadrao}
                disabled={pending || texto.trim().length < 3}
                title="Guarda este texto na biblioteca da disciplina para reutilizar"
              >
                <BookmarkPlus className="size-3.5" /> salvar como padrão
              </Button>
            )}
            <Button variant="outline" onClick={fecharFormulario} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={salvarDraft} disabled={pending || !texto.trim()}>
              {editId ? "Salvar" : "Criar apontamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Não procede" (item 22) — a justificativa virou obrigatória */}
      <Dialog
        open={descartarId != null}
        onOpenChange={(o) => {
          if (!o) {
            setDescartarId(null);
            setJustificativa("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como não procede</DialogTitle>
            <DialogDescription>
              Encerra o apontamento sem correção. A justificativa fica registrada e aparece para o
              projetista — é o que evita a discussão de &quot;por que isso foi descartado?&quot; depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="justificativa-descarte">Por que não procede?</Label>
            <textarea
              id="justificativa-descarte"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDescartarId(null); setJustificativa(""); }} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={confirmarDescarte} disabled={pending || justificativa.trim().length < 3}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calibração de escala da página (item 28) — os dois modos que o solicitante escolheu */}
      <Dialog
        open={calibrarPagina != null}
        onOpenChange={(o) => {
          if (!o) {
            setCalibrarPagina(null);
            setRefSegmento(null);
            setRefValorMm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escala da página {calibrarPagina}</DialogTitle>
            <DialogDescription>
              Necessária para medir na prancha. Fica valendo para as próximas revisões deste mesmo
              documento — recalibre se a revisão mudar de escala.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="calib-modo">Como definir</Label>
            <Select value={modoCalib} onValueChange={(v) => setModoCalib((v as ModoCalibracao) ?? "escala")}>
              <SelectTrigger id="calib-modo" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS_CALIBRACAO.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "escala" ? "Declarar a escala da prancha" : "Calibrar por dois pontos conhecidos"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {modoCalib === "escala" ? (
            <div className="space-y-1.5">
              <Label htmlFor="calib-escala">Escala 1:</Label>
              <div className="flex flex-wrap gap-1">
                {ESCALAS_COMUNS.map((e) => (
                  <Button
                    key={e}
                    size="sm"
                    variant={escalaDenom === String(e) ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setEscalaDenom(String(e))}
                  >
                    1:{e}
                  </Button>
                ))}
              </div>
              <input
                id="calib-escala"
                value={escalaDenom}
                onChange={(ev) => setEscalaDenom(ev.target.value)}
                inputMode="numeric"
                className="w-full rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">
                Só funciona se a prancha foi plotada na escala declarada. Se houver dúvida, calibre por
                dois pontos.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="calib-valor">Medida real do segmento (mm)</Label>
              <p className="text-xs text-muted-foreground">
                Arraste na prancha sobre uma dimensão que você conhece (uma cota, um vão) e informe
                quanto ela mede de verdade.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => {
                    // Recolhe a janela: modal aberta bloqueia o ponteiro sobre a prancha.
                    setTracandoReferencia(calibrarPagina);
                    setCalibrarPagina(null);
                  }}
                >
                  <Ruler className="size-3.5" /> Traçar na prancha
                </Button>
                <span
                  className={cn(
                    "text-xs",
                    refSegmento?.pagina === calibrarPagina ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {refSegmento?.pagina === calibrarPagina
                    ? `${refSegmento.pontos.toFixed(1)} pt na folha`
                    : "nenhum segmento ainda"}
                </span>
              </div>
              <input
                id="calib-valor"
                value={refValorMm}
                onChange={(ev) => setRefValorMm(ev.target.value)}
                inputMode="decimal"
                placeholder="ex.: 5000"
                className="w-full rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCalibrarPagina(null);
                setRefSegmento(null);
                setRefValorMm("");
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={salvarCalibracao} disabled={pending}>
              Salvar escala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reclassificar (item 11) — separado de "editar", que fecha quando a rodada vira tarefa */}
      <Dialog
        open={classificarId != null}
        onOpenChange={(o) => {
          if (!o) {
            setClassificarId(null);
            setSeveridade(null);
            setTipo(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Classificar apontamento</DialogTitle>
            <DialogDescription>
              Severidade e tipo podem ser ajustados a qualquer momento, inclusive depois de a rodada
              virar tarefa — é aí que a triagem costuma acontecer.
            </DialogDescription>
          </DialogHeader>
          <CamposClassificacao severidade={severidade} setSeveridade={setSeveridade} tipo={tipo} setTipo={setTipo} prazo={prazo} setPrazo={setPrazo} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setClassificarId(null);
                setSeveridade(null);
                setTipo(null);
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={salvarClassificacao} disabled={pending}>
              Salvar classificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replicar apontamento pra outras pranchas (item 30) */}
      <Dialog open={replicarId != null} onOpenChange={(v) => { if (!v) { setReplicarId(null); setReplicarDestinos(new Set()); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replicar apontamento</DialogTitle>
            <DialogDescription>
              Cria uma cópia deste apontamento (mesmo texto e posição) nas pranchas marcadas.
              A cópia nasce sem âncora textual — se a prancha de destino tiver uma revisão
              nova depois, o pino aparece como posição incerta até alguém conferir.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {pranchasParaReplicar.map((pr) => (
              <label key={pr.uploadId} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={replicarDestinos.has(pr.uploadId)}
                  onCheckedChange={(v) =>
                    setReplicarDestinos((prev) => {
                      const novo = new Set(prev);
                      if (v) novo.add(pr.uploadId);
                      else novo.delete(pr.uploadId);
                      return novo;
                    })
                  }
                />
                <span className="truncate">{pr.nomeArquivo}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReplicarId(null); setReplicarDestinos(new Set()); }} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={confirmarReplicar} disabled={pending || replicarDestinos.size === 0}>
              Replicar pra {replicarDestinos.size || ""} prancha(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Janela de confirmação da tarefa (prioridade/prazo/responsáveis antes de salvar) */}
      {opcoesTarefa && tarefaDialogAberto && (
        <TarefaDialog
          open={tarefaDialogAberto}
          onOpenChange={setTarefaDialogAberto}
          tarefa={null}
          opcoes={opcoesTarefa}
          colunas={colunasTarefa}
          meId={props.currentUserId}
          meRole={ehAdmin ? "admin" : "supervisor"}
          tituloDialog="Confirmar tarefa de ajustes"
          itensReadonly
          valoresIniciais={{
            titulo: `Ajustes · ${nomeArquivo} (${disciplinaNome} — ${codigo})`,
            descricao: `${enviaveis.length} apontamento(s) na prancha ${nomeArquivo}.`,
            statusId: colunasTarefa[0]?.id ?? "",
            projetoId,
            disciplinaId,
            responsaveisIds: responsaveisPadrao,
            itens: enviaveis.map((p) => ({ descricao: rotuloItemPendencia(p), concluido: false })),
          }}
          onSubmit={submeterTarefa}
        />
      )}
    </div>
  );
}

// ── Página individual (canvas + texto compartilhados via PdfPagina, overlay de pinos aqui) ──
function Pagina({
  pdf,
  pagina,
  largura,
  pins,
  selecionadaId,
  modoApontar,
  ferramenta,
  mmPorPonto,
  modoCalibracao,
  capturandoReferencia,
  onSegmentoReferencia,
  onSelecionar,
  onApontar,
  registrar,
  onTexto,
  marcas,
  ocgConfig,
  ocgVersao,
}: {
  pdf: PdfDoc;
  pagina: number;
  largura: number;
  pins: PinPosicionado[];
  selecionadaId: string | null;
  modoApontar: boolean;
  ferramenta: TipoMarcacao;
  /** mm reais por ponto do PDF nesta página (item 28); `null` = página sem escala definida. */
  mmPorPonto: number | null;
  /** Modo da calibração JÁ GRAVADA — só viaja junto da medida, não muda o comportamento do arrasto. */
  modoCalibracao: ModoCalibracao | null;
  /**
   * Estado TRANSITÓRIO: o próximo arrasto é a régua da calibração, não um apontamento.
   * Separado de `modoCalibracao` de propósito — confundir os dois fazia uma página calibrada
   * por dois pontos tratar TODO arrasto como régua e nunca mais criar apontamento.
   */
  capturandoReferencia: boolean;
  /** Traçado o segmento de referência da calibração por dois pontos: devolve o comprimento em pontos. */
  onSegmentoReferencia: (pagina: number, pontos: number) => void;
  onSelecionar: (id: string) => void;
  onApontar: (x: number, y: number, marcacao: Marcacao | null, medida: MedidaCalculada | null) => void;
  registrar: (el: HTMLDivElement | null) => void;
  onTexto: (pagina: number, itens: ItemPagina[]) => void;
  marcas: MarcaTexto[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ocgConfig?: any;
  ocgVersao?: number;
}) {
  // Arrasto em andamento (item 9). Fica em estado local da PÁGINA, não do viewer: só a página
  // desenhada precisa saber do traço provisório, e assim mover o mouse não re-renderiza a
  // lista lateral nem as outras páginas do documento.
  const [tracando, setTracando] = useState<{ x: number; y: number; ax: number; ay: number } | null>(null);
  // Dimensões da página em PONTOS do PDF (espaço visual, `/Rotate` já aplicado). Vem do
  // `PdfPagina` no render e fica em ref porque quem precisa é o handler de pointerup, que não
  // roda dentro do callback de render — e guardar em estado provocaria re-render por página.
  const dimPtRef = useRef<{ wPt: number; hPt: number } | null>(null);
  const dimPt = dimPtRef.current;

  const posicaoNormalizada = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  /**
   * O apontamento SEMPRE nasce no `pointerup`, nunca no `pointerdown` — inclusive o pino
   * simples, que não tem arrasto. Abrir a janela no `pointerdown` faz o `pointerup` seguinte
   * cair FORA dela, e o base-ui trata isso como clique fora e fecha na hora: a janela pisca e
   * some. (Passava despercebido em teste automatizado porque `mouse.click` dispara os dois
   * eventos quase juntos e às vezes a janela nem tinha montado a tempo de escutar o dismiss.)
   */
  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    if ((!modoApontar && !capturandoReferencia) || e.button !== 0) return;
    const p = posicaoNormalizada(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setTracando({ x: p.x, y: p.y, ax: p.x, ay: p.y });
  }

  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!tracando) return;
    const p = posicaoNormalizada(e);
    setTracando((t) => (t ? { ...t, ax: p.x, ay: p.y } : t));
  }

  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    if (!tracando) return;
    const p = posicaoNormalizada(e);
    const inicio = { x: tracando.x, y: tracando.y };
    setTracando(null);

    // Calibrando por dois pontos: o arrasto é a RÉGUA, não um apontamento. Reporta o
    // comprimento em pontos e sai — quem fecha o cálculo é a janela de calibração.
    if (capturandoReferencia && dimPt) {
      const pontos = comprimentoEmPontos(inicio, p, dimPt.wPt, dimPt.hPt);
      if (pontos > 0) onSegmentoReferencia(pagina, pontos);
      return;
    }

    // Pino ignora pra onde o ponteiro foi: nasce onde o clique começou.
    if (ferramenta === "ponto") {
      onApontar(inicio.x, inicio.y, null, null);
      return;
    }
    const feito = construirMarcacao(ferramenta, inicio, p);
    // Arrasto curto demais degrada pra pino em vez de recusar em silêncio — quem só clicou
    // com o retângulo selecionado ainda consegue criar o apontamento.
    if (!feito) {
      onApontar(inicio.x, inicio.y, null, null);
      return;
    }
    let medida: MedidaCalculada | null = null;
    if (ferramenta === "medida" && mmPorPonto && dimPt) {
      const mm = medirMm(inicio, p, dimPt.wPt, dimPt.hPt, mmPorPonto);
      // Sem valor calculável (fator inválido ou segmento nulo) não vira medição fantasma.
      if (mm == null) {
        onApontar(inicio.x, inicio.y, null, null);
        return;
      }
      medida = { mm, fator: mmPorPonto, modo: modoCalibracao ?? "escala" };
    }
    onApontar(feito.x, feito.y, feito.marcacao, medida);
  }

  const previa: Marcacao | null =
    tracando && ferramenta !== "ponto"
      ? { tipo: ferramenta, pontos: [{ dx: tracando.ax - tracando.x, dy: tracando.ay - tracando.y }] }
      : null;

  return (
    <PdfPagina pdf={pdf} pagina={pagina} largura={largura} registrar={registrar} onTexto={onTexto} marcas={marcas} ocgConfig={ocgConfig} ocgVersao={ocgVersao}>
      {(dim) => {
        dimPtRef.current = { wPt: dim.wPt, hPt: dim.hPt };
        return (
        <div
          className={cn("absolute inset-0", (modoApontar || capturandoReferencia) && "cursor-crosshair")}
          style={modoApontar && ferramenta !== "ponto" ? { touchAction: "none" } : undefined}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={() => setTracando(null)}
        >
          {/* Formas: SVG único por página, atrás dos pinos (que continuam clicáveis).
              `pointer-events-none` para não roubar o arrasto de quem está desenhando. */}
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${dim.w} ${dim.h}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {pins.map((p) =>
              p.marcacao ? (
                <g
                  key={p.id}
                  className={cn(
                    (STATUS_META[p.status] ?? STATUS_META.aberta).traco,
                    p.incerta && "opacity-60",
                    selecionadaId === p.id && "drop-shadow",
                  )}
                >
                  <MarcacaoSvg dim={dim} x={p.x} y={p.y} marcacao={p.marcacao} espessura={selecionadaId === p.id ? 3 : 2} medidaMm={p.medidaMm} />
                </g>
              ) : null,
            )}
            {previa && tracando && (
              <g className="text-primary">
                <MarcacaoSvg dim={dim} x={tracando.x} y={tracando.y} marcacao={previa} />
              </g>
            )}
          </svg>

          {pins.map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.aberta;
            const sel = selecionadaId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelecionar(p.id);
                }}
                className={cn(
                  "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold shadow ring-2 ring-white transition",
                  meta.pin,
                  // Herdado e sem conseguir confirmar a posição nesta revisão: sinaliza em vez
                  // de fingir precisão. Herdado mas relocalizado pela âncora textual volta ao
                  // visual normal — a posição foi reconferida contra o texto desta revisão.
                  p.incerta && "opacity-70 ring-muted-foreground",
                  // Rascunho: mesma linguagem visual do "incerto" (esmaecido), sem inventar
                  // um terceiro código de cor.
                  ehRascunho(p) && "opacity-60 ring-dashed ring-muted-foreground",
                  sel && "ring-4 ring-ring",
                )}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                title={tituloPin(p)}
              >
                {p.numero}
              </button>
            );
          })}
        </div>
        );
      }}
    </PdfPagina>
  );
}
