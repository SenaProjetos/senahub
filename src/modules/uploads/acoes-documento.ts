import {
  Copy,
  Download,
  Eye,
  FolderMinus,
  FolderOpen,
  GitCompare,
  History,
  Link2,
  PanelRight,
  Pencil,
  ShieldCheck,
  Trash2,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { rotuloRevisao } from "@/lib/utils";
import { ROTULO_SITUACAO, SITUACOES, type Situacao } from "./revisao-marcada";
import { comVolta } from "./volta-visualizador";
import { itensDoCiclo, type CicloDaLinha } from "./ciclo/acoes";
import { estadoCongelado } from "./ciclo/estados";
import { MOTIVO_VALIDACAO_CONGELADA } from "./ciclo/transicoes";

/**
 * Descritor das ações de uma linha da tabela de documentos (aba Arquivos do projeto) — **puro**,
 * sem React e sem I/O. Quem liga cada `id` a uma action/diálogo é `useAcoesDocumento`. A mesma
 * lista alimenta o menu de contexto da linha e o `...` (regra 2 da ADR-0002).
 *
 * Os gates daqui só ESCONDEM itens; o gate real continua no `defineAction` de cada action.
 * Esconder demais é aceitável, mostrar demais não.
 *
 * **Reposição do menu nativo (regra 1):** a linha tem links reais por arquivo (baixar e
 * visualizar, no `BadgeExtensao`). Com o botão direito tomado pela linha inteira, o menu repõe
 * "abrir em nova aba" e "copiar endereço" **para cada arquivo da revisão** — PDF e DWG da mesma
 * prancha são dois arquivos, e repor só o primeiro tiraria o do segundo.
 */

/** Abre o painel lateral de detalhes/metadados — o mesmo que clicar no título na tabela. */
export const ACAO_DETALHES = "detalhes";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_HISTORICO = "historico";
export const ACAO_VALIDAR = "validar";
export const ACAO_DESFAZER_VALIDACAO = "desfazer-validacao";
export const ACAO_SOLICITAR_AJUSTE = "solicitar-ajuste";
export const ACAO_RENOMEAR = "renomear";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_SOLICITAR_EXCLUSAO = "solicitar-exclusao";
/** "copiar-link:<uploadId>" — um por arquivo da revisão. */
export const PREFIXO_COPIAR_LINK = "copiar-link:";
/** "retirar-situacao:<situacao>" — tirar o documento de uma pasta do cliente. */
export const PREFIXO_RETIRAR_SITUACAO = "retirar-situacao:";

/** Extrai a pasta de um id de "Tirar de…"; `null` se não for esse item. */
export function situacaoDoRetirar(idDaAcao: string): Situacao | null {
  if (!idDaAcao.startsWith(PREFIXO_RETIRAR_SITUACAO)) return null;
  const s = idDaAcao.slice(PREFIXO_RETIRAR_SITUACAO.length);
  return (SITUACOES as readonly string[]).includes(s) ? (s as Situacao) : null;
}

/** Extrai o arquivo de um id de "Copiar link"; `null` se não for esse item. */
export function arquivoDoCopiarLink(idDaAcao: string): string | null {
  return idDaAcao.startsWith(PREFIXO_COPIAR_LINK) ? idDaAcao.slice(PREFIXO_COPIAR_LINK.length) : null;
}

export type ArquivoParaAcoes = { id: string; nome: string; ext: string; downloadUrl: string };

export type DocumentoParaAcoes = {
  /**
   * Projeto DESTE documento. Obrigatório onde a lista mistura projetos (diretório geral), onde
   * `ctx.projetoId` não existe; na aba do projeto pode ficar de fora e vale o do contexto.
   */
  projetoId?: string;
  /**
   * Upload âncora: o primeiro arquivo da revisão vigente. É sobre ele que histórico, validação,
   * renomear e excluir agem — o mesmo de antes do menu de contexto.
   */
  id: string;
  nome: string;
  /** Revisão vigente do documento (comparar só faz sentido a partir da segunda). */
  versao: number;
  /** `null` para arquivo em `PastaProjeto`: lá não existe validação por arquivo. */
  validado: boolean | null;
  /** Herdado da disciplina — só esconde "Renomear" (ver `LinhaDocumento.podeGerir`). */
  podeGerir: boolean;
  /** Todos os arquivos da revisão vigente (PDF + DWG da mesma prancha, por exemplo). */
  arquivos: readonly ArquivoParaAcoes[];
  /** O DocumentoDisciplina — o que "Tirar de Compartilhado" muda. Ausente = sem esse item. */
  documentoId?: string;
  /** `arquivos:alterar_status` + muralha, já resolvidos na linha. */
  podeAlterarStatus?: boolean;
  /** Revisão (número do banco) que o cliente vê em cada pasta do link. */
  naPasta?: { compartilhado: number | null; liberado_obra: number | null };
  /** Ciclo documental da revisão da linha. Participando, substitui as marcas manuais de pasta. */
  ciclo?: CicloDaLinha;
};

export type ContextoAcoesDocumento = {
  /** Projeto da aba. Ausente no diretório geral, onde cada documento traz o seu. */
  projetoId?: string;
  /**
   * Tela de consulta (diretório geral): sem "Detalhes" — o painel de metadados é da aba do
   * projeto, junto do catálogo de fases/tipos — e com "Abrir no projeto", que leva até lá.
   */
  consulta?: boolean;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  /** Uma ação desta tabela ainda está em curso — trava as que mudam o documento. */
  ocupado?: boolean;
  /** Endereço atual da lista (`/caminho?busca`): "Visualizar" o leva junto para o "← Arquivos" voltar aqui. */
  volta?: string;
};

export const MOTIVO_OCUPADO = "Aguarde a ação anterior terminar.";

/**
 * Um item por arquivo quando há mais de um (vira submenu), ou o item direto quando há um só —
 * quem tem um arquivo não precisa abrir submenu para baixá-lo.
 */
function porArquivo(
  arquivos: readonly ArquivoParaAcoes[],
  base: { id: string; rotulo: string; icone: LucideIcon },
  item: (a: ArquivoParaAcoes, rotulo: string) => AcaoItem,
): AcaoItem | null {
  if (arquivos.length === 0) return null;
  if (arquivos.length === 1) return item(arquivos[0], base.rotulo);
  return {
    tipo: "sub",
    id: base.id,
    rotulo: base.rotulo,
    icone: base.icone,
    itens: arquivos.map((a) => item(a, a.nome)),
  };
}

/** O que `documentoParaAcoes` precisa saber de uma linha de tabela — cabe em `LinhaDoc`. */
type LinhaParaAcoes = {
  id?: string;
  projetoId: string;
  revisaoAtual: number | null;
  podeGerir: boolean;
  podeAlterarStatus?: boolean;
  revisaoCompartilhada?: number | null;
  revisaoLiberadaObra?: number | null;
  arquivos: readonly (ArquivoParaAcoes & { validado: boolean | null })[];
  ciclo?: CicloDaLinha;
};

/**
 * Linha da tabela → o que o descritor consome. O primeiro arquivo da revisão vigente ancora as
 * ações (histórico, validação…); os demais entram em `arquivos` para baixar/copiar link de cada um.
 * `null` = linha sem arquivo: não há menu, e o menu nativo do navegador fica.
 */
export function documentoParaAcoes(linha: LinhaParaAcoes): DocumentoParaAcoes | null {
  const arquivo = linha.arquivos[0];
  if (!arquivo) return null;
  return {
    id: arquivo.id,
    projetoId: linha.projetoId,
    nome: arquivo.nome,
    versao: linha.revisaoAtual ?? 0,
    validado: arquivo.validado,
    podeGerir: linha.podeGerir,
    arquivos: linha.arquivos,
    documentoId: linha.id,
    podeAlterarStatus: linha.podeAlterarStatus,
    naPasta: { compartilhado: linha.revisaoCompartilhada ?? null, liberado_obra: linha.revisaoLiberadaObra ?? null },
    ciclo: linha.ciclo,
  };
}

/** O grupo com o seu separador na frente — ou nada, quando o grupo é vazio (o separador ficaria órfão). */
function comSeparador(id: string, itens: AcaoItem[]): AcaoItem[] {
  return itens.length > 0 ? [{ tipo: "separador", id }, ...itens] : [];
}

/**
 * Pastas do cliente (reunião de 29/09/2026): o documento entra pelo status ("Compartilhado", "Liberado para
 * obra") e sai por aqui, um item por pasta em que está. A tela de consulta não mexe.
 */
function itensDasPastasDoCliente(d: DocumentoParaAcoes, ctx: ContextoAcoesDocumento, travado: string | undefined): AcaoItem[] {
  if (!d.documentoId || !d.podeAlterarStatus || ctx.consulta) return [];
  return SITUACOES.flatMap((situacao): AcaoItem[] => {
    const revisao = d.naPasta?.[situacao];
    if (revisao == null) return [];
    const rotulo = ROTULO_SITUACAO[situacao];
    return [
      {
        tipo: "acao",
        id: PREFIXO_RETIRAR_SITUACAO + situacao,
        rotulo: `Tirar de ${rotulo} (${rotuloRevisao(revisao)})`,
        icone: FolderMinus,
        desabilitado: travado,
        confirmar: {
          titulo: `Tirar da pasta ${rotulo}?`,
          descricao: "O cliente deixa de ver este documento no link. O arquivo continua na aba Arquivos.",
          rotuloConfirmar: "Tirar da pasta",
        },
      },
    ];
  });
}

export function itensDeDocumento(d: DocumentoParaAcoes, ctx: ContextoAcoesDocumento): AcaoItem[] {
  // O visualizador de PDF recebe o id do PDF — que nem sempre é o primeiro arquivo da revisão.
  const pdf = d.arquivos.find((a) => a.ext === "pdf");
  const projetoId = d.projetoId ?? ctx.projetoId;
  const temValidacao = d.validado !== null;
  const travado = ctx.ocupado ? MOTIVO_OCUPADO : undefined;
  // Revisão publicada/arquivada: a validação fica como está (mesma frase do servidor).
  const travadoValidacao =
    travado ?? (d.ciclo?.participa && d.ciclo.estado && estadoCongelado(d.ciclo.estado) ? MOTIVO_VALIDACAO_CONGELADA : undefined);

  const itens: (AcaoItem | null)[] = [
    // Primeiro item: o mesmo do ícone de informações da linha (o clique no título abre o visualizador).
    ctx.consulta ? null : { tipo: "acao", id: ACAO_DETALHES, rotulo: "Detalhes do documento", icone: PanelRight },
    ctx.consulta && projetoId
      ? {
          tipo: "link",
          id: "abrir-no-projeto",
          rotulo: "Abrir no projeto",
          icone: FolderOpen,
          href: `/projetos/${projetoId}/arquivos`,
        }
      : null,
    pdf && projetoId
      ? {
          tipo: "link",
          id: "visualizar",
          rotulo: "Visualizar em nova aba",
          icone: Eye,
          href: comVolta(`/projetos/${projetoId}/arquivos/${pdf.id}/visualizar`, ctx.volta),
          novaAba: true,
        }
      : null,
    pdf && projetoId && d.versao > 1
      ? {
          tipo: "link",
          id: "comparar",
          rotulo: "Comparar revisões",
          icone: GitCompare,
          href: `/projetos/${projetoId}/arquivos/${pdf.id}/comparar`,
        }
      : null,
    porArquivo(d.arquivos, { id: "baixar", rotulo: "Baixar", icone: Download }, (a, rotulo) => ({
      tipo: "link",
      id: `baixar:${a.id}`,
      rotulo,
      icone: Download,
      href: a.downloadUrl,
    })),
    porArquivo(d.arquivos, { id: "copiar-link", rotulo: "Copiar link", icone: Link2 }, (a, rotulo) => ({
      tipo: "acao",
      id: PREFIXO_COPIAR_LINK + a.id,
      rotulo,
      icone: Link2,
    })),
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
    { tipo: "acao", id: ACAO_HISTORICO, rotulo: "Histórico de revisões", icone: History },

    { tipo: "separador", id: "sep-validacao" },
    ...(ctx.podeValidar && temValidacao
      ? d.validado
        ? [
            {
              tipo: "acao",
              id: ACAO_DESFAZER_VALIDACAO,
              rotulo: "Desfazer validação",
              icone: Undo2,
              desabilitado: travadoValidacao,
            } satisfies AcaoItem,
          ]
        : [
            { tipo: "acao", id: ACAO_VALIDAR, rotulo: "Validar", icone: ShieldCheck, desabilitado: travadoValidacao } satisfies AcaoItem,
            { tipo: "acao", id: ACAO_SOLICITAR_AJUSTE, rotulo: "Solicitar ajuste", icone: XCircle, desabilitado: travadoValidacao } satisfies AcaoItem,
          ]
      : []),

    // Documento do ciclo: estado e controles da revisão (envio, publicação, obra, cliente, bloqueio).
    // Fora do ciclo seguem as marcas antigas de pasta do cliente. A tela de consulta não mexe.
    ...comSeparador(
      "sep-cliente",
      d.ciclo?.participa ? (ctx.consulta ? [] : itensDoCiclo(d.ciclo, travado)) : itensDasPastasDoCliente(d, ctx, travado),
    ),

    { tipo: "separador", id: "sep-gerir" },
    // Diretório é consulta: mesmo quem gere a disciplina renomeia pela aba do projeto.
    d.podeGerir && !ctx.consulta ? { tipo: "acao", id: ACAO_RENOMEAR, rotulo: "Renomear", icone: Pencil } : null,

    { tipo: "separador", id: "sep-excluir" },
    // Excluir não leva `confirmar`: abre o diálogo de ESCOPO (só este arquivo × o documento
    // inteiro), que já é a confirmação exigida pela regra 4 da ADR-0002.
    ctx.podeExcluir
      ? { tipo: "acao", id: ACAO_EXCLUIR, rotulo: "Excluir", icone: Trash2, variant: "destructive", desabilitado: travado }
      : ctx.podeSolicitarExclusao
        ? { tipo: "acao", id: ACAO_SOLICITAR_EXCLUSAO, rotulo: "Solicitar exclusão", icone: Trash2 }
        : null,
  ];

  return limparSeparadores(itens.filter((i) => i !== null));
}
