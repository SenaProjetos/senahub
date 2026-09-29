import {
  BookOpen,
  CircleDot,
  Filter,
  FolderOpen,
  History,
  Layers,
  Link2,
  ListTodo,
  MessageSquare,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { limparSeparadores, type AcaoItem, type AcaoItemAcao } from "@/components/ui/acoes";
import { STATUS_LABEL, transicaoDisciplinaPermitida } from "@/modules/projetos/status";
import { ORDEM_STATUS_DISCIPLINA } from "@/modules/projetos/ordem-disciplinas";
import type { ProximoPasso } from "@/modules/projetos/proximo-passo";

/**
 * Ações do card de disciplina (ADR-0002): dado puro. O MESMO array alimenta o botão direito, o
 * ⋯ do card e — no pedaço de status — o botão do status. O que o perfil não permite não entra; o
 * que o estado impede entra desabilitado com o motivo.
 */
export const ACAO_DISCIPLINA = {
  /** Janela da entrega (validação por arquivo, aprovar, link de aceite do cliente). */
  entrega: "entrega",
  revisoes: "revisoes",
  tarefas: "tarefas",
  diario: "diario",
  aprovar: "aprovar",
  confirmar: "confirmar",
  recusar: "recusar",
  solicitar: "solicitar",
  reabrir: "reabrir",
  responsaveis: "responsaveis",
  etapas: "etapas",
  editar: "editar",
  copiarLink: "copiar-link",
  excluir: "excluir",
} as const;

/** `status:<novo>` — o prefixo separa as transições das demais ações. */
export const PREFIXO_STATUS = "status:";

export type DisciplinaParaAcoes = {
  status: StatusDisciplina;
  usaPastas: boolean;
  qtdArquivos: number;
  qtdRevisoes: number;
  /** Aprovação/laudo: há marcação de "aprovado" esperando a confirmação do gestor. */
  aguardandoConfirmacao: boolean;
  podeSolicitar: boolean;
  /** O próximo passo do card: diz se a entrega está pronta e, se não, por quê. */
  passo: ProximoPasso | null;
};

export type ContextoAcoesDisciplina = {
  podeGerir: boolean;
  podeMexerStatus: boolean;
  podeEnviar: boolean;
  podeDiario: boolean;
  podeAprovar: boolean;
  /** Tarefas só aparecem para usuários internos (com as opções carregadas). */
  qtdTarefas: number | null;
  /** Aba Arquivos do projeto já na pasta desta disciplina. */
  hrefArquivos: string;
  /** Aba Arquivos já com o envio aberto nesta disciplina. */
  hrefEnviar: string;
  /** Chat da disciplina (ou do projeto); `null` sem canal. */
  hrefChat: string | null;
};

export const MOTIVO_EXCLUIR_APROVADA = "Disciplina com entrega validada não pode ser excluída.";
export const MOTIVO_APROVADO_SO_PELA_APROVACAO = "Só aprovando a entrega.";

/** Ordem do FLUXO (não a da página): é a sequência que a pessoa percorre. */
const FLUXO_STATUS: StatusDisciplina[] = ["aguardando", "em_andamento", "entregue", "em_revisao"];

/** Transições oferecidas a partir do status atual — o atual vem marcado; "Aprovado", inerte. */
export function itensDeStatus(status: StatusDisciplina): AcaoItemAcao[] {
  const itens: AcaoItemAcao[] = FLUXO_STATUS.filter(
    (s) => s === status || transicaoDisciplinaPermitida(status, s),
  ).map((s) => ({ tipo: "acao", id: `${PREFIXO_STATUS}${s}`, rotulo: STATUS_LABEL[s], marcado: s === status }));
  itens.push({
    tipo: "acao",
    id: `${PREFIXO_STATUS}aprovado`,
    rotulo: STATUS_LABEL.aprovado,
    desabilitado: MOTIVO_APROVADO_SO_PELA_APROVACAO,
  });
  return itens;
}

function contagem(rotulo: string, n: number): string {
  return n > 0 ? `${rotulo} (${n})` : rotulo;
}

export function itensDeDisciplina(d: DisciplinaParaAcoes, ctx: ContextoAcoesDisciplina): AcaoItem[] {
  const aprovada = d.status === "aprovado";
  const pronta = d.passo?.tom === "pronto" && d.passo.acao === "aprovar";

  const aprovacao: (AcaoItem | null)[] = aprovada
    ? [ctx.podeGerir ? { tipo: "acao", id: ACAO_DISCIPLINA.reabrir, rotulo: "Reabrir disciplina…", icone: RotateCcw } : null]
    : d.usaPastas
      ? d.aguardandoConfirmacao
        ? ctx.podeAprovar
          ? [
              { tipo: "acao", id: ACAO_DISCIPLINA.confirmar, rotulo: "Confirmar aprovação…", icone: ShieldCheck },
              { tipo: "acao", id: ACAO_DISCIPLINA.recusar, rotulo: "Recusar aprovação…", icone: XCircle },
            ]
          : []
        : [d.podeSolicitar ? { tipo: "acao", id: ACAO_DISCIPLINA.solicitar, rotulo: "Marcar projeto aprovado", icone: ShieldCheck } : null]
      : [
          ctx.podeAprovar
            ? {
                tipo: "acao",
                id: ACAO_DISCIPLINA.aprovar,
                rotulo: "Aprovar entrega",
                icone: ShieldCheck,
                // Mesma frase do aviso do card: a pessoa lê o mesmo motivo nos dois lugares.
                desabilitado: pronta ? undefined : (d.passo?.texto ?? "A entrega ainda não está pronta."),
              }
            : null,
        ];

  const itens: (AcaoItem | null)[] = [
    // Arquivos abre a aba Arquivos do projeto na pasta da disciplina (pedido do dono, 2026-09-29);
    // a janela da entrega continua aqui por causa da validação e do link de aceite do cliente.
    { tipo: "link", id: "arquivos", rotulo: contagem("Arquivos", d.qtdArquivos), icone: FolderOpen, href: ctx.hrefArquivos },
    ctx.podeEnviar ? { tipo: "link", id: "enviar", rotulo: "Enviar arquivos", icone: Upload, href: ctx.hrefEnviar } : null,
    { tipo: "acao", id: ACAO_DISCIPLINA.entrega, rotulo: "Entrega e aceite do cliente…", icone: ShieldCheck },
    { tipo: "acao", id: ACAO_DISCIPLINA.revisoes, rotulo: contagem("Revisões", d.qtdRevisoes), icone: History },
    ctx.qtdTarefas !== null ? { tipo: "acao", id: ACAO_DISCIPLINA.tarefas, rotulo: contagem("Tarefas", ctx.qtdTarefas), icone: ListTodo } : null,
    ctx.podeDiario ? { tipo: "acao", id: ACAO_DISCIPLINA.diario, rotulo: "Nova anotação no diário", icone: NotebookPen } : null,
    ctx.hrefChat ? { tipo: "link", id: "chat", rotulo: "Chat da disciplina", icone: MessageSquare, href: ctx.hrefChat, novaAba: true } : null,
    { tipo: "separador", id: "sep-fluxo" },
    ctx.podeMexerStatus && !aprovada
      ? { tipo: "sub", id: "status", rotulo: "Mudar status", icone: CircleDot, itens: itensDeStatus(d.status) }
      : null,
    ...aprovacao,
    { tipo: "separador", id: "sep-gerir" },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_DISCIPLINA.responsaveis, rotulo: "Responsáveis…", icone: Users } : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_DISCIPLINA.etapas, rotulo: "Etapas e fases…", icone: Layers } : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_DISCIPLINA.editar, rotulo: "Editar disciplina…", icone: Pencil } : null,
    { tipo: "acao", id: ACAO_DISCIPLINA.copiarLink, rotulo: "Copiar link da disciplina", icone: Link2 },
    { tipo: "separador", id: "sep-excluir" },
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_DISCIPLINA.excluir,
          rotulo: "Excluir disciplina…",
          icone: Trash2,
          variant: "destructive",
          // O diálogo de exclusão já confirma (e conta as tarefas que vão junto).
          desabilitado: aprovada ? MOTIVO_EXCLUIR_APROVADA : undefined,
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

/** Ações do espaço vazio da página (emenda do ADR-0002 de 2026-09-29): adicionar e filtrar. */
export const ACAO_PAGINA_DISCIPLINAS = { adicionar: "adicionar", catalogo: "catalogo" } as const;
export const PREFIXO_MOSTRAR = "mostrar:";

export function itensDaPaginaDisciplinas(ctx: {
  podeGerir: boolean;
  temCatalogo: boolean;
  /** Filtro aberto (`null` = todas) e quantas há em cada status. */
  filtro: StatusDisciplina | null;
  contagem: Record<StatusDisciplina, number>;
  total: number;
}): AcaoItem[] {
  const mostrar: AcaoItemAcao[] = [
    { tipo: "acao", id: `${PREFIXO_MOSTRAR}todas`, rotulo: `Todas (${ctx.total})`, marcado: ctx.filtro === null },
    ...ORDEM_STATUS_DISCIPLINA.map(
      (s): AcaoItemAcao => ({
        tipo: "acao",
        id: `${PREFIXO_MOSTRAR}${s}`,
        rotulo: `${STATUS_LABEL[s]} (${ctx.contagem[s] ?? 0})`,
        marcado: ctx.filtro === s,
      }),
    ),
  ];
  const itens: (AcaoItem | null)[] = [
    ctx.podeGerir ? { tipo: "acao", id: ACAO_PAGINA_DISCIPLINAS.adicionar, rotulo: "Adicionar disciplina…", icone: Plus } : null,
    ctx.podeGerir && ctx.temCatalogo
      ? { tipo: "acao", id: ACAO_PAGINA_DISCIPLINAS.catalogo, rotulo: "Adicionar do catálogo…", icone: BookOpen }
      : null,
    { tipo: "separador", id: "sep-mostrar" },
    { tipo: "sub", id: "mostrar", rotulo: "Mostrar", icone: Filter, itens: mostrar },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
