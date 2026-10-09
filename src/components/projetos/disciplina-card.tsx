"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  History,
  Users,
  GitBranch,
  FolderUp,
  Upload as UploadIcon,
  Download,
  Eye,
  FileArchive,
  FileText,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  Link2,
  CheckCircle,
  XCircle,
  ListTodo,
  Plus,
  CalendarDays,
  NotebookPen,
  Unlock,
  Layers,
  ChevronDown,
} from "lucide-react";
import {
  atualizarStatusDisciplina,
  reabrirDisciplina,
  definirResponsaveis,
} from "@/modules/projetos/actions";
import { rotuloCatalogo } from "@/modules/projetos/disciplina-rotulo";
import {
  solicitarAprovacaoDisciplina,
  confirmarAprovacaoDisciplina,
  recusarAprovacaoDisciplina,
} from "@/modules/projetos/aprovacao-disciplina/actions";
import {
  podeSolicitarAprovacao,
  rotuloStatusDisciplina,
} from "@/modules/projetos/aprovacao-disciplina/regras";
import { podeEscreverNoDiario } from "@/modules/projetos/diario/acesso";
import { DiarioEntradaDialog } from "@/components/projetos/diario-entrada-dialog";
import { DisciplinaEditDialog, DisciplinaDeleteButton } from "@/components/projetos/disciplina-edit-dialog";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { DisciplinaEtapasButton } from "@/components/projetos/disciplina-etapas-dialog";
import { AprovarFaseButton } from "@/components/projetos/aprovar-fase-button";
import { validarEntrega, gerarAceiteCliente, revogarAceiteCliente } from "@/modules/uploads/actions";
import { statusValidacao, entregaveisAtuais, type StatusValidacao } from "@/modules/uploads/validacao";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { IconeArquivo, StatusArquivo, VersaoToggle } from "@/components/projetos/arquivos-explorer";
import { PastaTreeView, type ArquivoPasta } from "@/components/projetos/pasta-tree-view";
import type { PastaFlat } from "@/modules/projetos/pastas/arvore";
import { ratearPagamentoProjetista, bloqueioValorDisciplina } from "@/modules/uploads/rateio";
import {
  STATUS_LABEL,
  ETAPAS_DISCIPLINA,
  etapaDisciplina,
  rotuloEtapaDisciplina,
} from "@/modules/projetos/status";
import { diasDeAtraso } from "@/modules/projetos/atraso";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SeletorMultiplo } from "@/components/ui/seletor-multiplo";
import { opcoesDePessoas } from "@/components/ui/opcoes-pessoas";
import { EmptyState } from "@/components/ui/empty-state";
import { TarefaDialog, type TarefaUI, type OpcoesUI } from "@/components/tarefas/tarefa-dialog";
import { PRIORIDADE_LABEL, PRIORIDADE_CLASS, ehPrioridade } from "@/modules/tarefas/prioridade";
import { Badge } from "@/components/ui/badge";
import { brl, cn, formatarData, rotuloRevisao } from "@/lib/utils";
import { useAberto, type ControleJanela } from "@/lib/use-aberto";
import { copiarTexto } from "@/lib/clipboard";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ACAO_DISCIPLINA,
  PREFIXO_STATUS,
  itensDeDisciplina,
  itensDeStatus,
} from "@/modules/projetos/acoes-disciplina";
import {
  ROTULO_ACAO_PASSO,
  etiquetaPagamento,
  proximoPasso,
  type AcaoPasso,
  type ProximoPasso,
  type TomPasso,
} from "@/modules/projetos/proximo-passo";
import { prazoVencido } from "@/lib/data";
import type { SolicitacaoRevisaoView } from "@/modules/projetos/solicitacoes-revisao/queries";

/** Tarefa da disciplina para a lista (formato do board + nome/cor/concluído do status). */
export type TarefaDaDisciplina = TarefaUI & { statusNome: string; statusCor: string | null; concluido: boolean };

/** Tarefa atrasada = o prazo já PASSOU (o próprio dia ainda vale) e não está numa coluna final. */
function tarefaAtrasada(t: TarefaDaDisciplina): boolean {
  if (t.concluido) return false;
  return prazoVencido(t.prazo);
}

type UploadItem = {
  id: string;
  pacote: "A" | "B" | "OUTROS" | "RECEBIDOS";
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  validado: boolean;
  origem: "manual" | "ferramenta";
  ajusteObs: string | null;
  ajusteEm: string | null;
  autor: string;
  data: string;
  aceiteToken: string | null;
  aceiteSituacao: string | null;
  aceiteExpiraEm: string | null;
  aceiteRevogadoEm: string | null;
};

type Disc = {
  id: string;
  nome: string;
  /** Nome no catálogo. Vira rótulo secundário só se diferir de `nome` — ver `rotuloCatalogo`. */
  catalogoNome?: string | null;
  status: StatusDisciplina;
  prazo: string | null;
  valor: number | null;
  responsaveis: { userId: string; name: string; role: string }[];
  ehResponsavel: boolean;
  revisoes: { id: string; numero: number; motivo: string | null; autor: string; data: string }[];
  /** Solicitações de revisão — uma por envio de apontamentos; só leitura no card. */
  solicitacoesRevisao: SolicitacaoRevisaoView[];
  uploads: UploadItem[];
  temA: boolean;
  temB: boolean;
  jaValidado: boolean;
  /**
   * O pagamento de projetista já foi liberado POR INTEIRO — aprovar de novo não gera nada. Por
   * fase, só quando toda fase foi liberada (`estadoPagamento`).
   */
  pagamentoLiberado: boolean;
  /** Pagamento por fase: quantas liberadas, de quantas. Nulo sem fase ou se pagou inteira. */
  fasesLiberadas: { liberadas: number; total: number } | null;
  /** Fases entregues aguardando a aprovação que libera o pagamento delas (só no modo por fase). */
  fasesPendentes: { id: string; sigla: string; nomeFase: string; percentual: number }[];
  /** Tem etapa (F4): o prazo vira o maior das etapas e não se edita direto. */
  temEtapas: boolean;
  exigePacoteA: boolean;
  exigePacoteB: boolean;
  /** Ciclo documental (6-B): documentos sem revisão publicada — aprovar exige zero. */
  documentosSemPublicacao?: number;
  /** Aprovação/laudo (só projetos novos): árvore de pastas própria no lugar do pacote A/B. */
  usaPastas: boolean;
  pastas: PastaFlat[];
  arquivosPasta: ArquivoPasta[];
  aprovacaoSolicitadaEm: string | null;
  aprovacaoSolicitadaPorNome: string | null;
};

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Janelas do card — abertas pelo rodapé, pelo aviso, pelo ⋯ ou pelo botão direito. */
type Janela =
  | "arquivos"
  | "revisoes"
  | "tarefas"
  | "diario"
  | "responsaveis"
  | "etapas"
  | "editar"
  | "excluir"
  | "reabrir"
  | "confirmar"
  | "recusar";

const JANELAS = new Set<string>([
  "arquivos",
  "revisoes",
  "tarefas",
  "diario",
  "responsaveis",
  "etapas",
  "editar",
  "excluir",
  "reabrir",
  "confirmar",
  "recusar",
]);

/**
 * Cor do status nos dois lugares que a carregam: a faixa no topo do card e o quadro do ícone
 * (decisão A do redesenho: a faixa fica). As classes vão por extenso para o Tailwind as gerar.
 */
const STATUS_VISUAL: Record<StatusDisciplina, { faixa: string; quadro: string; pilula: string }> = {
  aguardando: {
    faixa: "border-t-status-aguardando",
    quadro: "bg-status-aguardando/10 text-status-aguardando",
    pilula: "border-status-aguardando/40 bg-status-aguardando/10 text-status-aguardando",
  },
  em_andamento: {
    faixa: "border-t-status-andamento",
    quadro: "bg-status-andamento/10 text-status-andamento",
    pilula: "border-status-andamento/40 bg-status-andamento/10 text-status-andamento",
  },
  em_revisao: {
    faixa: "border-t-status-revisao",
    quadro: "bg-status-revisao/10 text-status-revisao",
    pilula: "border-status-revisao/40 bg-status-revisao/10 text-status-revisao",
  },
  entregue: {
    faixa: "border-t-status-entregue",
    quadro: "bg-status-entregue/10 text-status-entregue",
    pilula: "border-status-entregue/40 bg-status-entregue/10 text-status-entregue",
  },
  aprovado: {
    faixa: "border-t-status-aprovado",
    quadro: "bg-status-aprovado/10 text-status-aprovado",
    pilula: "border-status-aprovado/40 bg-status-aprovado/10 text-status-aprovado",
  },
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Card de disciplina — redesenho aprovado pelo dono em 2026-09-29 (artifact "Card de disciplina
 * — proposta"): ícone da disciplina num quadro na cor do status, faixa da mesma cor no topo, o
 * status como botão (só as transições permitidas), UM aviso de próximo passo com a ação dele, e
 * as ações no ⋯ e no botão direito (ADR-0002) — o mesmo array para os dois.
 *
 * As janelas (arquivos, revisões, tarefas, diário, responsáveis, etapas, editar, excluir,
 * reabrir, confirmar/recusar) moram FORA do menu e do gatilho do botão direito: dentro do
 * gatilho, um clique direito numa janela aberta subiria pela árvore do React até o card.
 */
export function DisciplinaCard({
  projetoId,
  disciplina,
  podeGerir,
  podeValidar,
  internos,
  canalChatId,
  tarefas,
  tarefaOpcoes,
  tarefaColunas,
  meId,
  meRole,
  gereTodasTarefas = false,
  atuaEmDisciplinaAlheia = false,
  podeAprovarDisciplina = false,
  podeVerValor = false,
}: {
  projetoId: string;
  disciplina: Disc;
  podeGerir: boolean;
  podeValidar: boolean;
  internos: { id: string; name: string; role: string }[];
  canalChatId?: string;
  /** Tarefas desta disciplina (só p/ usuários internos); habilita o botão "Tarefas". */
  tarefas?: TarefaDaDisciplina[];
  tarefaOpcoes?: OpcoesUI;
  tarefaColunas?: { id: string; nome: string }[];
  meId?: string;
  meRole?: string;
  /** `tarefas:gerir_todas`, resolvido no servidor. */
  gereTodasTarefas?: boolean;
  /** `projetos:atuar_disciplina_alheia`, resolvido no servidor. */
  atuaEmDisciplinaAlheia?: boolean;
  /** `aprovacoes:disciplina` — finalizar a entrega e confirmar/recusar o passo 2. */
  podeAprovarDisciplina?: boolean;
  /** `podeVerFinanceiro` — só com isto o diálogo de confirmação mostra e edita o valor. */
  podeVerValor?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [janela, setJanela] = useState<Janela | null>(null);
  const controle = (qual: Janela) => ({ aberto: janela === qual, aoMudar: (v: boolean) => setJanela(v ? qual : null) });

  const podeMexerStatus = podeGerir || disciplina.ehResponsavel;
  const podeEnviar = podeGerir || disciplina.ehResponsavel;
  const podeDiario = podeEscreverNoDiario({ atuaEmDisciplinaAlheia, ehResponsavelDaDisciplina: disciplina.ehResponsavel });
  const temTarefas = !!(tarefaOpcoes && tarefaColunas && meId && meRole);
  const atraso = diasDeAtraso(disciplina.prazo, disciplina.status);
  const rotulo = rotuloCatalogo(disciplina.nome, disciplina.catalogoNome);
  const qtdTarefas = tarefas?.length ?? 0;
  const qtdAtrasadas = tarefas?.filter(tarefaAtrasada).length ?? 0;
  const qtdArquivos = disciplina.usaPastas
    ? disciplina.arquivosPasta.length
    : new Set(disciplina.uploads.map((u) => `${u.pacote}/${u.nomeArquivo}`)).size;
  const qtdRevisoes = arquivosComRevisaoPendente(disciplina).length;
  const visual = STATUS_VISUAL[disciplina.status];
  const hrefArquivos = `/projetos/${projetoId}/arquivos?${new URLSearchParams({ disciplinaId: disciplina.id })}`;
  const hrefEnviar = `/projetos/${projetoId}/arquivos?${new URLSearchParams({ disciplinaId: disciplina.id, enviar: "1" })}`;
  // Fonte única do progresso de validação: o card e o dialog de arquivos leem o MESMO
  // objeto, senão o aviso e o botão do rodapé podem discordar.
  const stVal = statusValidacao(disciplina.uploads, {
    exigePacoteA: disciplina.exigePacoteA,
    exigePacoteB: disciplina.exigePacoteB,
  });
  const passo = proximoPasso(
    { ...disciplina, qtdResponsaveis: disciplina.responsaveis.length },
    { podeAprovar: podeAprovarDisciplina, podeEnviar, podeGerir },
  );
  const pagamento = etiquetaPagamento(disciplina);
  const podeSolicitar = podeSolicitarAprovacao({
    ehResponsavel: disciplina.ehResponsavel,
    status: disciplina.status,
    aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm,
  });
  const itens = itensDeDisciplina(
    {
      status: disciplina.status,
      usaPastas: disciplina.usaPastas,
      qtdArquivos,
      qtdRevisoes,
      aguardandoConfirmacao: disciplina.aprovacaoSolicitadaEm != null,
      podeSolicitar,
      passo,
    },
    {
      podeGerir,
      podeMexerStatus,
      podeEnviar,
      podeDiario,
      podeAprovar: podeAprovarDisciplina,
      qtdTarefas: temTarefas ? qtdTarefas : null,
      hrefArquivos,
      hrefEnviar,
      hrefChat: canalChatId ? `/chat?c=${canalChatId}` : null,
    },
  );
  const podeTrocarStatus = podeMexerStatus && disciplina.status !== "aprovado";

  function mudarStatus(status: StatusDisciplina) {
    start(async () => {
      const res = await atualizarStatusDisciplina({ disciplinaId: disciplina.id, status });
      if (res.ok) toast.success("Status atualizado.");
      else toast.error(res.error);
    });
  }

  function aprovarEntrega() {
    start(async () => {
      const res = await validarEntrega({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success(
          res.data.pagamentos > 0
            ? `Entrega aprovada. ${res.data.pagamentos} pagamento(s) liberado(s).`
            : "Entrega aprovada. Sem pagamento (equipe CLT/estágio).",
        );
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function solicitar() {
    start(async () => {
      const res = await solicitarAprovacaoDisciplina({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success("Projeto marcado como aprovado — aguardando confirmação.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function confirmar(valor?: number) {
    start(async () => {
      const res = await confirmarAprovacaoDisciplina({ disciplinaId: disciplina.id, valor });
      if (res.ok) {
        toast.success("Aprovação confirmada.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function recusar(motivo: string) {
    start(async () => {
      const res = await recusarAprovacaoDisciplina({ disciplinaId: disciplina.id, motivo });
      if (res.ok) {
        toast.success("Aprovação recusada.");
        setJanela(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function aoSelecionar(item: AcaoItemAcao) {
    if (item.id.startsWith(PREFIXO_STATUS)) {
      const novo = item.id.slice(PREFIXO_STATUS.length) as StatusDisciplina;
      if (novo !== disciplina.status) mudarStatus(novo);
      return;
    }
    if (item.id === ACAO_DISCIPLINA.aprovar) return aprovarEntrega();
    if (item.id === ACAO_DISCIPLINA.entrega) return setJanela("arquivos");
    if (item.id === ACAO_DISCIPLINA.solicitar) return solicitar();
    if (item.id === ACAO_DISCIPLINA.copiarLink) {
      void copiarTexto(`${window.location.origin}/projetos/${projetoId}/disciplinas#disciplina-${disciplina.id}`).then((ok) =>
        ok ? toast.success("Link da disciplina copiado.") : toast.error("Não foi possível copiar o link."),
      );
      return;
    }
    if (JANELAS.has(item.id)) setJanela(item.id as Janela);
  }

  function aoAcaoPasso(acao: AcaoPasso | "recusar") {
    if (acao === "aprovar") return aprovarEntrega();
    if (acao === "solicitar") return solicitar();
    if (acao === "confirmar") return setJanela("confirmar");
    if (acao === "recusar") return setJanela("recusar");
    if (acao === "validar") return setJanela("arquivos");
    if (acao === "responsavel") return setJanela("responsaveis");
  }

  const rotuloStatus = rotuloStatusDisciplina({ status: disciplina.status, aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm });
  const pilula = (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {rotuloStatus}
    </>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <article
              aria-label={`Disciplina ${disciplina.nome}`}
              className={cn(
                "flex flex-col rounded-sm border border-t-[3px] bg-card data-[popup-open]:ring-2 data-[popup-open]:ring-ring/30",
                visual.faixa,
              )}
            />
          }
        >
          {/* No celular o status desce para a linha de baixo, alinhado ao nome: dividindo a linha
              com o nome e o ⋯, o prazo quebrava no meio. */}
          <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3.5 pb-2.5 sm:flex-nowrap">
            <span
              className={cn("flex size-10 shrink-0 items-center justify-center rounded-sm", visual.quadro)}
              title={STATUS_LABEL[disciplina.status]}
            >
              <DisciplinaIcone nome={disciplina.catalogoNome ?? disciplina.nome} className="size-6" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="flex flex-wrap items-baseline gap-x-1.5 font-semibold leading-tight">
                {disciplina.nome}
                {rotulo && (
                  <span className="text-xs font-normal text-muted-foreground" title={`Classificada no catálogo como ${rotulo}`}>
                    · {rotulo}
                  </span>
                )}
              </h4>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {disciplina.prazo && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <CalendarDays className="size-3.5" aria-hidden />
                    Prazo {formatarData(disciplina.prazo)}
                  </span>
                )}
                {atraso > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-destructive">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    atrasada {atraso}d
                  </span>
                )}
                {qtdTarefas > 0 && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <ListTodo className="size-3.5" aria-hidden />
                    {qtdTarefas} tarefa{qtdTarefas > 1 ? "s" : ""}
                    {qtdAtrasadas > 0 && (
                      <span className="font-medium text-destructive">
                        · {qtdAtrasadas} atrasada{qtdAtrasadas > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 max-sm:order-last max-sm:basis-full max-sm:pl-[52px]">
            {podeTrocarStatus ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Status: ${rotuloStatus}. Mudar status`}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                        visual.pilula,
                      )}
                    />
                  }
                >
                  {pilula}
                  <ChevronDown className="size-3.5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <AcoesMenuItens itens={itensDeStatus(disciplina.status)} onSelect={aoSelecionar} />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span
                className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", visual.pilula)}
              >
                {pilula}
              </span>
            )}
            </div>
            <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações de ${disciplina.nome}`} className="size-8" />
          </header>

          <div className="px-4">
            <TrilhoEtapas disciplina={disciplina} />
          </div>

          {passo && (
            <div className="px-4 pt-3">
              <PassoDisciplina passo={passo} disciplina={disciplina} hrefEnviar={hrefEnviar} pending={pending} onAcao={aoAcaoPasso} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2.5 text-xs">
            {disciplina.responsaveis.length > 0 ? (
              <button
                type="button"
                onClick={podeGerir ? () => setJanela("responsaveis") : undefined}
                disabled={!podeGerir}
                title={podeGerir ? "Responsáveis — clique para alterar" : "Responsáveis"}
                className="flex min-w-0 items-center gap-2 rounded-sm text-left outline-none enabled:hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                  {disciplina.responsaveis.slice(0, 3).map((r) => (
                    <span
                      key={r.userId}
                      className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-foreground"
                    >
                      {iniciais(r.name)}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 truncate">{disciplina.responsaveis.map((r) => r.name).join(", ")}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                <Users className="size-3.5" aria-hidden /> Sem responsável
              </span>
            )}
            {pagamento && (
              <span
                title={pagamento.dica}
                className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11px] text-muted-foreground"
              >
                <Unlock className="size-3" aria-hidden /> {pagamento.texto}
              </span>
            )}
            {disciplina.valor != null && (
              <span className="ml-auto font-mono text-muted-foreground">{brl(disciplina.valor)}</span>
            )}
          </div>

          <nav aria-label={`Atalhos de ${disciplina.nome}`} className="flex flex-wrap items-center gap-0.5 border-t px-2 py-1">
            <Button variant="ghost" size="sm" render={<Link href={hrefArquivos} />} title="Abrir a pasta da disciplina na aba Arquivos">
              <FolderUp className="size-3.5" /> Arquivos <span className="font-mono text-muted-foreground">{qtdArquivos}</span>
            </Button>
            {/* Celular: Revisões, Tarefas e Diário só com ícone (e contagem) — com os nomes, o
                rodapé quebrava em duas linhas. O nome continua para leitor de tela e na dica. */}
            <Button variant="ghost" size="sm" onClick={() => setJanela("revisoes")} title="Revisões">
              <History className="size-3.5" /> <span className="max-sm:sr-only">Revisões</span>{" "}
              <span className="font-mono text-muted-foreground">{qtdRevisoes}</span>
            </Button>
            {temTarefas && (
              <Button variant="ghost" size="sm" onClick={() => setJanela("tarefas")} title="Tarefas">
                <ListTodo className="size-3.5" /> <span className="max-sm:sr-only">Tarefas</span>{" "}
                <span className="font-mono text-muted-foreground">{qtdTarefas}</span>
              </Button>
            )}
            {podeDiario && (
              <Button variant="ghost" size="sm" onClick={() => setJanela("diario")} title="Diário">
                <NotebookPen className="size-3.5" /> <span className="max-sm:sr-only">Diário</span>
              </Button>
            )}
            <span className="flex-1" />
            {canalChatId && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Chat da disciplina (abre em nova aba)"
                title="Chat da disciplina"
                render={<Link href={`/chat?c=${canalChatId}`} target="_blank" rel="noopener noreferrer" />}
              >
                <MessageSquare className="size-3.5" />
              </Button>
            )}
          </nav>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <AcoesMenuItens itens={itens} onSelect={aoSelecionar} />
        </ContextMenuContent>
      </ContextMenu>

      <ArquivosDialog
        projetoId={projetoId}
        disciplina={disciplina}
        stVal={stVal}
        podeEnviar={podeEnviar}
        podeValidar={podeValidar}
        podeAprovar={podeAprovarDisciplina}
        controle={controle("arquivos")}
      />
      <RevisaoDialog disciplina={disciplina} controle={controle("revisoes")} />
      {temTarefas && (
        <TarefasDisciplinaDialog
          projetoId={projetoId}
          disciplinaId={disciplina.id}
          disciplinaNome={disciplina.nome}
          tarefas={tarefas ?? []}
          opcoes={tarefaOpcoes!}
          colunas={tarefaColunas!}
          meId={meId!}
          meRole={meRole!}
          gereTodasTarefas={gereTodasTarefas}
          controle={controle("tarefas")}
        />
      )}
      {podeDiario && (
        <DiarioEntradaDialog
          open={janela === "diario"}
          onOpenChange={(v) => setJanela(v ? "diario" : null)}
          disciplinas={[{ id: disciplina.id, nome: disciplina.nome }]}
          projetoId={projetoId}
          linkParaPainel
        />
      )}
      {podeGerir && (
        <>
          <ResponsaveisDialog disciplina={disciplina} internos={internos} controle={controle("responsaveis")} />
          <DisciplinaEditDialog
            disciplinaId={disciplina.id}
            nome={disciplina.nome}
            prazo={disciplina.prazo}
            valor={disciplina.valor}
            responsaveisIds={disciplina.responsaveis.map((r) => r.userId)}
            internos={internos}
            exigePacoteA={disciplina.exigePacoteA}
            exigePacoteB={disciplina.exigePacoteB}
            usaEstruturaPastas={disciplina.usaPastas}
            temEtapas={disciplina.temEtapas}
            controle={controle("editar")}
          />
          <DisciplinaEtapasButton
            disciplinaId={disciplina.id}
            nome={disciplina.nome}
            valor={disciplina.valor}
            temEtapas={disciplina.temEtapas}
            controle={controle("etapas")}
          />
          {disciplina.status !== "aprovado" && (
            <DisciplinaDeleteButton disciplinaId={disciplina.id} nome={disciplina.nome} qtdTarefas={qtdTarefas} controle={controle("excluir")} />
          )}
          {disciplina.status === "aprovado" && <ReabrirDisciplinaDialog disciplina={disciplina} controle={controle("reabrir")} />}
        </>
      )}
      {podeAprovarDisciplina && disciplina.usaPastas && disciplina.aprovacaoSolicitadaEm != null && (
        <>
          {disciplina.pagamentoLiberado ? (
            // Reaprovação: pagamento já liberado, sem valor a rever.
            <ConfirmarAprovacaoSemValorDialog
              disciplina={disciplina}
              pending={pending}
              onConfirmar={() => confirmar()}
              descricao="A disciplina fica aprovada de novo. O pagamento já tinha sido liberado — nada novo é gerado."
              controle={controle("confirmar")}
            />
          ) : (disciplina.fasesLiberadas?.liberadas ?? 0) > 0 ? (
            // Por fase, com alguma já liberada: o valor da disciplina não se reparte mais inteiro
            // (parte já foi paga), então a prévia "valor ÷ projetistas" mentiria.
            <ConfirmarAprovacaoSemValorDialog
              disciplina={disciplina}
              pending={pending}
              onConfirmar={() => confirmar()}
              descricao="A disciplina fica aprovada e o pagamento das fases que faltam é liberado, cada uma pelo seu percentual. Os valores por fase estão em Etapas. Essa confirmação não pode ser desfeita por aqui."
              controle={controle("confirmar")}
            />
          ) : podeVerValor ? (
            <ConfirmarAprovacaoDialog disciplina={disciplina} pending={pending} onConfirmar={confirmar} controle={controle("confirmar")} />
          ) : (
            <ConfirmarAprovacaoSemValorDialog disciplina={disciplina} pending={pending} onConfirmar={() => confirmar()} controle={controle("confirmar")} />
          )}
          <RecusarAprovacaoDialog pending={pending} onRecusar={recusar} controle={controle("recusar")} />
        </>
      )}
    </>
  );
}

/**
 * Trilho de etapas da disciplina — deixa visível que "Aprovado" é a CHEGADA do fluxo, não
 * uma opção do status. São 4 pontos porque `entregue` e `em_revisao` são o mesmo ponto do
 * caminho (a máquina alterna entre eles); o rótulo dessa etapa mostra o estado real.
 */
function TrilhoEtapas({ disciplina }: { disciplina: Disc }) {
  const atual = etapaDisciplina(disciplina.status);
  return (
    <ol className="flex items-center gap-1" aria-label="Etapas da disciplina">
      {ETAPAS_DISCIPLINA.map((_, i) => {
        const rotulo = rotuloEtapaDisciplina(i, disciplina.status, disciplina.aprovacaoSolicitadaEm);
        const percorrida = i <= atual;
        return (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className={`h-px flex-1 ${i <= atual ? "bg-status-aprovado" : "bg-muted"}`} />}
            <li
              className={`flex items-center gap-1 text-[11px] leading-tight ${
                i === atual ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
              aria-current={i === atual ? "step" : undefined}
            >
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${percorrida ? "bg-status-aprovado" : "bg-muted-foreground/30"}`}
              />
              {/* Celular: só o nome da etapa atual; os quatro nomes não cabiam numa linha. */}
              <span className={cn("whitespace-nowrap", i !== atual && "max-sm:sr-only")}>{rotulo}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

const TOM_PASSO: Record<TomPasso, string> = {
  ok: "border-transparent bg-status-aprovado/10 text-status-aprovado",
  pronto: "border-status-aprovado/40 bg-status-aprovado/10 text-status-aprovado",
  confirmar: "border-status-entregue/40 bg-status-entregue/10 text-status-entregue",
  fase: "border-info/40 bg-info/10 text-info",
  aviso: "border-dashed text-muted-foreground",
};

/**
 * O único aviso do card (`proximoPasso`): o que falta, ou o que dá para fazer agora, com o botão
 * da ação. Antes podiam aparecer três avisos empilhados, cada um num canto do card.
 */
function PassoDisciplina({
  passo,
  disciplina,
  hrefEnviar,
  pending,
  onAcao,
}: {
  passo: ProximoPasso;
  disciplina: Disc;
  hrefEnviar: string;
  pending: boolean;
  onAcao: (acao: AcaoPasso | "recusar") => void;
}) {
  const Icone =
    passo.tom === "ok" ? ShieldCheck : passo.tom === "fase" ? Layers : passo.tom === "aviso" ? AlertTriangle : CheckCircle;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border px-2.5 py-1.5 text-xs", TOM_PASSO[passo.tom])}>
      <span className="flex min-w-0 flex-1 items-start gap-1.5 max-sm:basis-full">
        <Icone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{passo.texto}</span>
      </span>
      {passo.acao === "aprovar_fase" && passo.fases ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {passo.fases.map((f) => (
            <AprovarFaseButton key={f.id} faseId={f.id} sigla={f.sigla} disciplina={disciplina.nome} label={`Aprovar ${f.sigla}`} />
          ))}
        </span>
      ) : passo.acao === "confirmar" ? (
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onAcao("recusar")} disabled={pending}>
            <XCircle className="size-3.5" /> Recusar
          </Button>
          <Button size="sm" className="h-7 px-2" onClick={() => onAcao("confirmar")} disabled={pending}>
            <CheckCircle className="size-3.5" /> Confirmar
          </Button>
        </span>
      ) : passo.acao === "enviar" ? (
        <Button size="sm" variant="outline" className="h-7 px-2" render={<Link href={hrefEnviar} />}>
          <UploadIcon className="size-3.5" /> {ROTULO_ACAO_PASSO.enviar}
        </Button>
      ) : passo.acao ? (
        <Button
          size="sm"
          variant={passo.acao === "aprovar" || passo.acao === "solicitar" ? "default" : "outline"}
          className="h-7 px-2"
          onClick={() => onAcao(passo.acao!)}
          disabled={pending}
        >
          {passo.acao === "aprovar" && <ShieldCheck className="size-3.5" />}
          {pending && passo.acao === "aprovar" ? "Aprovando…" : ROTULO_ACAO_PASSO[passo.acao]}
        </Button>
      ) : null}
    </div>
  );
}

/** Recusar a marcação de "aprovado" (aprovação/laudo): o motivo vai ao responsável. */
function RecusarAprovacaoDialog({
  pending,
  onRecusar,
  controle,
}: {
  pending: boolean;
  onRecusar: (motivo: string) => void;
  controle: ControleJanela;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={controle.aberto} onOpenChange={controle.aoMudar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Recusar aprovação</DialogTitle>
          <DialogDescription>Explique o motivo — o responsável será notificado.</DialogDescription>
        </DialogHeader>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => controle.aoMudar(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => onRecusar(motivo.trim())} disabled={pending || !motivo.trim()}>
            Recusar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Diálogo do passo 2 (confirmar): mostra o valor a enviar ao financeiro e o split por
 * projetista ANTES de liberar o pagamento — resposta direta às disciplinas concluídas
 * sem valor (viravam PagamentoProjetista de R$ 0,00 na folha, sem lançamento). Só
 * aparece quando ainda não há pagamento liberado (`!disciplina.pagamentoLiberado`, nenhuma fase);
 * reaprovação usa o botão simples, sem valor a rever.
 */
function ConfirmarAprovacaoDialog({
  disciplina,
  pending,
  onConfirmar,
  controle,
}: {
  disciplina: Disc;
  pending: boolean;
  onConfirmar: (valor: number) => void;
  controle?: ControleJanela;
}) {
  const [open, setOpen] = useAberto(controle);
  const [valorTexto, setValorTexto] = useState<number | null>(disciplina.valor ?? null);

  const responsaveisComRole = disciplina.responsaveis.map((r) => ({
    ...r,
    user: { role: r.role },
  }));
  const valorNum = valorTexto;
  const valorValido = valorNum != null && !Number.isNaN(valorNum) && valorNum >= 0;
  const bloqueio = bloqueioValorDisciplina(responsaveisComRole, valorValido ? valorNum : null);
  const { pagaveis, salariados } = ratearPagamentoProjetista(
    responsaveisComRole,
    valorValido ? valorNum : 0,
  );

  function confirmar() {
    if (bloqueio || !valorValido) return;
    onConfirmar(valorNum);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValorTexto(disciplina.valor ?? null); }}>
      {!controle && (
        <DialogTrigger
          render={
            <Button size="sm" className="h-7 px-2">
              <CheckCircle className="size-3.5" /> Confirmar
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar aprovação — {disciplina.nome}</DialogTitle>
          <DialogDescription>
            Revise o valor antes de enviar ao financeiro. Depois de confirmado, o pagamento é liberado
            e a alteração passa a exigir edição no financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="valor-confirmacao">Valor total a pagar</Label>
          <InputMoeda id="valor-confirmacao" value={valorTexto} onChange={setValorTexto} autoFocus />
        </div>

        {valorValido && (pagaveis.length > 0 || salariados.length > 0) && (
          <div className="space-y-1 rounded-sm border p-2 text-xs">
            {pagaveis.map(({ responsavel, valor }) => (
              <div key={responsavel.userId} className="flex justify-between">
                <span>{responsavel.name}</span>
                <span className="font-mono">{brl(valor)}</span>
              </div>
            ))}
            {salariados.map((r) => (
              <div key={r.userId} className="flex justify-between text-muted-foreground">
                <span>{r.name}</span>
                <span>sem pagamento (CLT/estágio)</span>
              </div>
            ))}
          </div>
        )}

        {bloqueio && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {bloqueio}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !valorValido || !!bloqueio}>
            Confirmar e enviar ao financeiro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Passo 2 para quem aprova sem enxergar financeiro (Q13/Q15 do dono: "quem está aprovando não é
 * quem vai pagar"). Mesma confirmação em modal, sem valor nem rateio: o pagamento é criado com o
 * valor já cadastrado na disciplina. Se faltar valor, o servidor recusa com a mensagem de
 * `bloqueioValorDisciplina`, que não expõe número nenhum.
 */
function ConfirmarAprovacaoSemValorDialog({
  disciplina,
  pending,
  onConfirmar,
  descricao = "A disciplina fica aprovada e a demanda é liberada para o financeiro, que paga pelo valor já cadastrado. Essa confirmação não pode ser desfeita por aqui.",
  controle,
}: {
  disciplina: Disc;
  pending: boolean;
  onConfirmar: () => void;
  descricao?: string;
  controle?: ControleJanela;
}) {
  const [open, setOpen] = useAberto(controle);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controle && (
        <DialogTrigger
          render={
            <Button size="sm" className="h-7 px-2">
              <CheckCircle className="size-3.5" /> Confirmar
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar aprovação — {disciplina.nome}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirmar();
              setOpen(false);
            }}
            disabled={pending}
          >
            Confirmar e liberar ao financeiro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Envio a partir do card é só um ATALHO para a aba Arquivos, com o diálogo de envio já aberto
 * e a disciplina selecionada no painel (pedido do dono, 2026-09-17).
 *
 * O card tinha um uploader próprio — seletor manual de pacote/pasta e envio cru — que ficou
 * para trás de tudo que o envio da aba Arquivos ganhou: disciplina e destino reconhecidos pelo
 * nome, revisão antes de enviar, correção em lote, título lido do carimbo, pasta arrastada,
 * "nova versão de". Manter os dois era garantir que divergissem de novo; o fluxo agora é um só.
 */
function AtalhoEnviar({ projetoId, disciplinaId }: { projetoId: string; disciplinaId: string }) {
  const href = `/projetos/${projetoId}/arquivos?${new URLSearchParams({ disciplinaId, enviar: "1" })}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border p-3">
      <p className="text-xs text-muted-foreground">
        O envio abre na aba Arquivos, com disciplina e destino reconhecidos pelo nome.
      </p>
      <Button size="sm" render={<Link href={href} />}>
        <UploadIcon className="size-3.5" /> Enviar arquivos
      </Button>
    </div>
  );
}

function ArquivosDialog({
  projetoId,
  disciplina,
  stVal,
  podeEnviar,
  podeValidar,
  podeAprovar,
  controle,
}: {
  projetoId: string;
  disciplina: Disc;
  stVal: StatusValidacao;
  podeEnviar: boolean;
  podeValidar: boolean;
  /** `aprovacoes:disciplina` — o gate de `validarEntrega`. */
  podeAprovar: boolean;
  controle?: ControleJanela;
}) {
  const router = useRouter();
  const [open, setOpen] = useAberto(controle);
  const [validando, start] = useTransition();
  const [versoesAbertas, setVersoesAbertas] = useState<Set<string>>(new Set());
  const alternarVersoes = (id: string) =>
    setVersoesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // `stVal.completo` também é true sem nenhum entregável, e o servidor exige responsável —
  // sem os dois checks o botão fica habilitado para uma chamada que a action recusa.
  const completoParaValidar =
    stVal.completo &&
    stVal.total > 0 &&
    disciplina.responsaveis.length > 0 &&
    !disciplina.jaValidado;
  // Ids dos entregáveis na versão atual — só eles ganham controles de validação.
  const idsValidaveis = new Set(entregaveisAtuais(disciplina.uploads).map((u) => u.id));

  // Primeiro upload validado — âncora do aceite digital
  const uploadValidado = disciplina.uploads.find((u) => u.validado);
  const aceiteToken = uploadValidado?.aceiteToken ?? null;
  const aceiteSituacao = uploadValidado?.aceiteSituacao ?? null;
  const aceiteExpiraEm = uploadValidado?.aceiteExpiraEm ?? null;
  const aceiteRevogadoEm = uploadValidado?.aceiteRevogadoEm ?? null;
  const aceiteAtivo =
    aceiteSituacao === "pendente" &&
    aceiteRevogadoEm === null &&
    aceiteExpiraEm !== null &&
    new Date(aceiteExpiraEm) > new Date();

  function gerarLinkAceite() {
    if (!uploadValidado) return;
    start(async () => {
      const res = await gerarAceiteCliente({ uploadId: uploadValidado.id });
      if (res.ok) {
        const url = `${window.location.origin}/p/aceite/${res.data.token}`;
        await navigator.clipboard.writeText(url);
        toast.success("Link de aceite copiado para a área de transferência.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function revogarLinkAceite() {
    if (!uploadValidado) return;
    start(async () => {
      const res = await revogarAceiteCliente({ uploadId: uploadValidado.id });
      if (res.ok) {
        toast.success("Link de aceite revogado.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function validar() {
    start(async () => {
      const res = await validarEntrega({ disciplinaId: disciplina.id });
      if (res.ok) {
        toast.success(
          res.data.pagamentos > 0
            ? `Entrega aprovada. ${res.data.pagamentos} pagamento(s) liberado(s).`
            : "Entrega aprovada. Sem pagamento (equipe CLT/estágio).",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const porPacote = (p: "A" | "B" | "OUTROS" | "RECEBIDOS") =>
    disciplina.uploads.filter((u) => u.pacote === p);

  // Conta arquivos lógicos (sem versões) e agrupa versões do mesmo arquivo
  // (mesma `(pacote, nome)`) — a mais recente é a "atual", as demais vão no acordeão.
  const contarLogicos = (itens: UploadItem[]) => new Set(itens.map((u) => `${u.pacote}/${u.nomeArquivo}`)).size;
  const agruparVersoes = (itens: UploadItem[]) => {
    const grupos = new Map<string, UploadItem[]>();
    const ordem: string[] = [];
    for (const u of itens) {
      if (!grupos.has(u.nomeArquivo)) {
        grupos.set(u.nomeArquivo, []);
        ordem.push(u.nomeArquivo);
      }
      grupos.get(u.nomeArquivo)!.push(u);
    }
    return ordem.map((nome) => {
      const vs = grupos.get(nome)!.slice().sort((a, b) => b.versao - a.versao);
      return { atual: vs[0], anteriores: vs.slice(1) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controle && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <FolderUp className="size-3.5" />{" "}
              Arquivos ({disciplina.usaPastas ? disciplina.arquivosPasta.length : contarLogicos(disciplina.uploads)})
            </Button>
          }
        />
      )}
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — arquivos</DialogTitle>
          <DialogDescription>
            {disciplina.usaPastas ? "Árvore de pastas própria deste tipo de projeto." : "Pranchas e arquivos (A) · Backup do modelo (B)"}
          </DialogDescription>
        </DialogHeader>

        {disciplina.usaPastas ? (
          <>
            {podeEnviar && <AtalhoEnviar projetoId={projetoId} disciplinaId={disciplina.id} />}
            <div className="min-w-0">
              <PastaTreeView
                disciplinaId={disciplina.id}
                projetoId={projetoId}
                pastas={disciplina.pastas}
                arquivos={disciplina.arquivosPasta}
                podeAdmin={podeValidar}
              />
            </div>
          </>
        ) : (
        <>
        {podeEnviar && !disciplina.jaValidado && (
          <AtalhoEnviar projetoId={projetoId} disciplinaId={disciplina.id} />
        )}

        {podeValidar && stVal.total > 0 && !disciplina.jaValidado && (
          <p className="text-xs text-muted-foreground">
            {stVal.validados} de {stVal.total} arquivo(s) validado(s)
            {stVal.pendentes > 0 ? ` · ${stVal.pendentes} pendente(s)` : " · pronto para finalizar"}.
          </p>
        )}

        <div className="min-w-0 space-y-3">
          {(["A", "B", "OUTROS"] as const).map((p) => {
            const itens = porPacote(p);
            if (itens.length === 0 && p === "OUTROS") return null;
            return (
              <div key={p}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {p === "A"
                      ? "Pranchas e arquivos"
                      : p === "B"
                        ? "Backup do modelo"
                        : "Outros (não suportados)"}
                  </span>
                  {itens.length > 0 && (
                    <a
                      href={`/api/uploads/disciplina/${disciplina.id}/zip`}
                      className="hidden"
                      aria-hidden
                    />
                  )}
                </div>
                {itens.length === 0 ? (
                  <EmptyState icon={FileText} title="Nenhum arquivo" />
                ) : (
                  <ul className="min-w-0 space-y-1">
                    {agruparVersoes(itens).map(({ atual: u, anteriores }) => {
                      const aberto = versoesAbertas.has(u.id);
                      return (
                        <Fragment key={u.id}>
                          <li className="flex min-w-0 items-center gap-2 rounded-sm border px-2 py-1 text-xs">
                            <IconeArquivo nome={u.nomeArquivo} />
                            {u.nomeArquivo.toLowerCase().endsWith(".pdf") ? (
                              <a
                                href={`/projetos/${projetoId}/arquivos/${u.id}/visualizar`}
                                target="_blank"
                                rel="noopener"
                                className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
                                title={`Visualizar ${u.nomeArquivo}`}
                              >
                                {u.nomeArquivo}
                                {u.versao > 1 && (
                                  <span className="ml-1 font-mono text-muted-foreground">{rotuloRevisao(u.versao)}</span>
                                )}
                              </a>
                            ) : (
                              <span className="min-w-0 flex-1 truncate" title={u.nomeArquivo}>
                                {u.nomeArquivo}
                                {u.versao > 1 && (
                                  <span className="ml-1 font-mono text-muted-foreground">{rotuloRevisao(u.versao)}</span>
                                )}
                              </span>
                            )}
                            <StatusArquivo aprovado={u.validado} ajusteObs={u.ajusteObs} dataAprovacao={u.data} />
                            {podeValidar && !disciplina.jaValidado && idsValidaveis.has(u.id) && (
                              <AcoesValidacaoArquivo
                                uploadId={u.id}
                                nomeArquivo={u.nomeArquivo}
                                validado={u.validado}
                              />
                            )}
                            {anteriores.length > 0 && (
                              <VersaoToggle
                                n={anteriores.length}
                                aberto={aberto}
                                onClick={() => alternarVersoes(u.id)}
                                nome={u.nomeArquivo}
                              />
                            )}
                            <span className="shrink-0 font-mono text-muted-foreground">{tamanhoLegivel(u.tamanho)}</span>
                            {u.nomeArquivo.toLowerCase().endsWith(".pdf") && (
                              <a
                                href={`/projetos/${projetoId}/arquivos/${u.id}/visualizar`}
                                target="_blank"
                                rel="noopener"
                                className="shrink-0 text-primary hover:underline"
                                aria-label="Visualizar prancha"
                                title="Visualizar prancha"
                              >
                                <Eye className="size-3.5" />
                              </a>
                            )}
                            <a
                              href={`/api/uploads/${u.id}/download`}
                              className="shrink-0 text-primary hover:underline"
                              aria-label="Baixar"
                            >
                              <Download className="size-3.5" />
                            </a>
                          </li>
                          {aberto &&
                            anteriores.map((v) => {
                              const ehPdf = v.nomeArquivo.toLowerCase().endsWith(".pdf");
                              return (
                                <li
                                  key={v.id}
                                  className="ml-5 flex min-w-0 items-center gap-2 rounded-sm border border-dashed px-2 py-1 text-xs text-muted-foreground"
                                >
                                  <IconeArquivo nome={v.nomeArquivo} />
                                  {ehPdf ? (
                                    <a
                                      href={`/projetos/${projetoId}/arquivos/${v.id}/visualizar`}
                                      target="_blank"
                                      rel="noopener"
                                      className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
                                      title={`Visualizar ${v.nomeArquivo}`}
                                    >
                                      {v.nomeArquivo}
                                      <span className="ml-1 font-mono">{rotuloRevisao(v.versao)}</span>
                                    </a>
                                  ) : (
                                    <span className="min-w-0 flex-1 truncate" title={v.nomeArquivo}>
                                      {v.nomeArquivo}
                                      <span className="ml-1 font-mono">{rotuloRevisao(v.versao)}</span>
                                    </span>
                                  )}
                                  <StatusArquivo aprovado={v.validado} ajusteObs={v.ajusteObs} dataAprovacao={v.data} />
                                  <span className="shrink-0 font-mono">{tamanhoLegivel(v.tamanho)}</span>
                                  {ehPdf && (
                                    <a
                                      href={`/projetos/${projetoId}/arquivos/${v.id}/visualizar`}
                                      target="_blank"
                                      rel="noopener"
                                      className="shrink-0 text-primary hover:underline"
                                      aria-label={`Visualizar ${v.nomeArquivo} ${rotuloRevisao(v.versao)}`}
                                      title="Visualizar prancha"
                                    >
                                      <Eye className="size-3.5" />
                                    </a>
                                  )}
                                  <a
                                    href={`/api/uploads/${v.id}/download`}
                                    className="shrink-0 text-primary hover:underline"
                                    aria-label={`Baixar ${v.nomeArquivo} ${rotuloRevisao(v.versao)}`}
                                  >
                                    <Download className="size-3.5" />
                                  </a>
                                </li>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(disciplina.uploads.length > 0 || disciplina.arquivosPasta.length > 0) && (
              <Button variant="outline" size="sm" render={<a href={`/api/uploads/disciplina/${disciplina.id}/zip`} />}>
                <FileArchive className="size-3.5" /> Baixar tudo (.zip)
              </Button>
            )}
            {podeValidar && disciplina.jaValidado && !disciplina.usaPastas && (
              aceiteToken ? (
                <div className="flex items-center gap-2">
                  {aceiteSituacao === "aceito" && (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle className="size-3.5" /> Aceito pelo cliente
                    </span>
                  )}
                  {aceiteSituacao === "revisao" && (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <XCircle className="size-3.5" /> Revisão solicitada
                    </span>
                  )}
                  {aceiteSituacao === "pendente" && (
                    <span className="text-xs text-muted-foreground">
                      {aceiteRevogadoEm
                        ? "Link revogado"
                        : aceiteAtivo
                          ? "Aguardando aceite"
                          : "Link expirado"}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={gerarLinkAceite}
                    disabled={validando}
                    title={aceiteAtivo ? "Copiar link de aceite" : "Gerar novo link de aceite"}
                  >
                    <Link2 className="size-3.5" />
                  </Button>
                  {aceiteSituacao === "pendente" && aceiteAtivo && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={revogarLinkAceite}
                      disabled={validando}
                      title="Revogar link de aceite"
                    >
                      <XCircle className="size-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={gerarLinkAceite} disabled={validando}>
                  <Link2 className="size-3.5" /> Link de aceite
                </Button>
              )
            )}
          </div>
          {podeAprovar && !disciplina.usaPastas && (
            <Button onClick={validar} disabled={!completoParaValidar || validando}>
              <ShieldCheck className="size-4" />
              {disciplina.jaValidado
                ? "Já validada"
                : validando
                  ? "Validando…"
                  : "Validar entrega"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reabrir disciplina aprovada (gestor). Volta para "em revisão" com motivo e novo
 * prazo — ambos ficam na auditoria. Se o novo prazo passar do prazo planejado do
 * projeto, o servidor desloca o planejado junto e registra no histórico.
 */
function ReabrirDisciplinaDialog({ disciplina, controle }: { disciplina: Disc; controle?: ControleJanela }) {
  const [open, setOpen] = useAberto(controle);
  const [motivo, setMotivo] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [pending, start] = useTransition();

  function reabrir() {
    if (motivo.trim().length < 3) {
      toast.error("Explique o motivo da reabertura.");
      return;
    }
    if (!novoPrazo) {
      toast.error("Informe o novo prazo da disciplina.");
      return;
    }
    start(async () => {
      const res = await reabrirDisciplina({
        disciplinaId: disciplina.id,
        motivo: motivo.trim(),
        novoPrazo,
      });
      if (res.ok) {
        toast.success(
          res.data.prazoProjetoDeslocado
            ? "Disciplina reaberta. O prazo planejado do projeto foi deslocado junto."
            : "Disciplina reaberta para revisão.",
        );
        setMotivo("");
        setNovoPrazo("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controle && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" className="w-full">
              <Unlock className="size-3.5" /> Reabrir disciplina
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reabrir {disciplina.nome}</DialogTitle>
          <DialogDescription>
            Volta para &ldquo;em revisão&rdquo; para novos ajustes. O pagamento já liberado é mantido — a
            reaprovação posterior não gera pagamento novo. A reabertura fica registrada na auditoria.
            Se o novo prazo passar do prazo planejado do projeto, ele desloca junto.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da reabertura"
          autoFocus
        />
        <div className="space-y-1.5">
          <Label htmlFor={`reabrir-prazo-${disciplina.id}`}>Novo prazo da disciplina</Label>
          <Input
            id={`reabrir-prazo-${disciplina.id}`}
            type="date"
            value={novoPrazo}
            onChange={(e) => setNovoPrazo(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={reabrir} loading={pending}>
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Arquivos com ajuste solicitado pelo validador e ainda pendente (revisaoObs/revisaoEm sem revalidação). */
function arquivosComRevisaoPendente(disciplina: Disc) {
  return disciplina.uploads.filter((u) => u.ajusteEm);
}

function RevisaoDialog({ disciplina, controle }: { disciplina: Disc; controle?: ControleJanela }) {
  const [open, setOpen] = useAberto(controle);
  const pendentes = arquivosComRevisaoPendente(disciplina);
  const solicitacoes = disciplina.solicitacoesRevisao;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controle && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <History className="size-3.5" /> Revisões ({pendentes.length})
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — revisões</DialogTitle>
          <DialogDescription>
            Cada envio de apontamentos registra uma solicitação de revisão. Ela fica em aberto até os apontamentos
            daquele envio saírem da fila.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60svh] space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Solicitações de revisão
            </h3>
            {solicitacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma solicitação. Elas surgem quando alguém envia apontamentos de uma prancha.</p>
            ) : (
              solicitacoes.map((s) => (
                <div key={s.id} className="rounded-sm border p-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-medium">{s.motivo}</span>
                    <SituacaoSolicitacaoBadge situacao={s.situacao} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.solicitante} · {formatarData(s.data)}
                    {s.apontamentos.total > 0 &&
                      (s.apontamentos.abertos > 0
                        ? ` · ${s.apontamentos.abertos} de ${s.apontamentos.total} apontamento(s) em aberto`
                        : ` · ${s.apontamentos.total} apontamento(s) tratado(s)`)}
                  </p>
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Arquivos com ajuste pendente
            </h3>
            {pendentes.length === 0 ? (
              <EmptyState icon={GitBranch} title="Nenhum ajuste pendente nos arquivos" />
            ) : (
              pendentes.map((a) => (
                <div key={a.id} className="rounded-sm border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{a.nomeArquivo}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {a.ajusteEm && formatarData(a.ajusteEm)}
                    </span>
                  </div>
                  {a.ajusteObs && <p className="mt-1 text-muted-foreground">{a.ajusteObs}</p>}
                </div>
              ))
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SituacaoSolicitacaoBadge({ situacao }: { situacao: SolicitacaoRevisaoView["situacao"] }) {
  if (situacao === "em_aberto") {
    return (
      <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/10 text-warning">
        Em aberto
      </Badge>
    );
  }
  if (situacao === "atendida") {
    return (
      <Badge variant="outline" className="shrink-0 border-success/40 bg-success/10 text-success">
        Atendida
      </Badge>
    );
  }
  return null;
}

function ResponsaveisDialog({
  disciplina,
  internos,
  controle,
}: {
  disciplina: Disc;
  internos: { id: string; name: string; role: string }[];
  controle?: ControleJanela;
}) {
  const [open, setOpen] = useAberto(controle);
  const [sel, setSel] = useState<string[]>(disciplina.responsaveis.map((r) => r.userId));
  const [pending, start] = useTransition();

  function salvar() {
    start(async () => {
      const res = await definirResponsaveis({ disciplinaId: disciplina.id, responsaveisIds: sel });
      if (res.ok) {
        toast.success("Responsáveis atualizados.");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controle && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <Users className="size-3.5" /> Responsáveis
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — responsáveis</DialogTitle>
          <DialogDescription>Marque uma ou mais pessoas. Busque pelo nome ou pelo perfil.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <SeletorMultiplo
            opcoes={opcoesDePessoas(internos)}
            selecionados={sel}
            onChange={setSel}
            placeholder="Buscar pessoa…"
            rotuloBusca="Buscar responsável"
            vazio="Nenhuma pessoa encontrada."
            rotuloContagem={(n) => (n === 1 ? "1 responsável" : `${n} responsáveis`)}
            // Altura fixa: a janela não pula enquanto a busca encolhe a lista.
            alturaLista="h-72"
            disabled={pending}
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista as tarefas da disciplina e permite criar/editar (reaproveita o TarefaDialog do módulo). */
function TarefasDisciplinaDialog({
  projetoId,
  disciplinaId,
  disciplinaNome,
  tarefas,
  opcoes,
  colunas,
  meId,
  meRole,
  gereTodasTarefas,
  controle,
}: {
  projetoId: string;
  disciplinaId: string;
  disciplinaNome: string;
  tarefas: TarefaDaDisciplina[];
  opcoes: OpcoesUI;
  colunas: { id: string; nome: string }[];
  meId: string;
  meRole: string;
  gereTodasTarefas: boolean;
  controle?: ControleJanela;
}) {
  const [openLista, setOpenLista] = useAberto(controle);
  const [editar, setEditar] = useState<TarefaDaDisciplina | "nova" | null>(null);

  return (
    <>
      <Dialog open={openLista} onOpenChange={setOpenLista}>
        {!controle && (
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                <ListTodo className="size-3.5" /> Tarefas ({tarefas.length})
              </Button>
            }
          />
        )}
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{disciplinaNome} — tarefas</DialogTitle>
            <DialogDescription>Tarefas vinculadas a esta disciplina.</DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {tarefas.length === 0 ? (
              <EmptyState icon={ListTodo} title="Nenhuma tarefa" />
            ) : (
              tarefas.map((t) => {
                const feitos = t.itens.filter((i) => i.concluido).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setOpenLista(false);
                      setEditar(t);
                    }}
                    className="flex w-full flex-col gap-1 rounded-sm border p-2 text-left text-sm transition-colors hover:border-primary/50"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: t.statusCor ?? "#576980" }}
                      />
                      <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                      {ehPrioridade(t.prioridade) && (
                        <Badge
                          variant="outline"
                          className={`h-4 px-1 text-[9px] leading-none ${PRIORIDADE_CLASS[t.prioridade]}`}
                        >
                          {PRIORIDADE_LABEL[t.prioridade]}
                        </Badge>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.statusNome}</span>
                      {t.prazo && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" /> {formatarData(t.prazo)}
                        </span>
                      )}
                      {t.itens.length > 0 && (
                        <span>
                          ☑ {feitos}/{t.itens.length}
                        </span>
                      )}
                      {t.responsaveis.length > 0 && (
                        <span className="truncate">{t.responsaveis.map((r) => r.nome).join(", ")}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setOpenLista(false);
                setEditar("nova");
              }}
            >
              <Plus className="size-4" /> Nova tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TarefaDialog
        tarefa={editar === "nova" ? null : editar}
        open={editar !== null}
        onOpenChange={(o) => !o && setEditar(null)}
        opcoes={opcoes}
        colunas={colunas}
        meId={meId}
        meRole={meRole}
        gereTodasTarefas={gereTodasTarefas}
        valoresIniciais={editar === "nova" ? { projetoId, disciplinaId } : undefined}
      />
    </>
  );
}
