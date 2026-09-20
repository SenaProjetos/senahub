import {
  Copy,
  Download,
  Eye,
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

/** Extrai o arquivo de um id de "Copiar link"; `null` se não for esse item. */
export function arquivoDoCopiarLink(idDaAcao: string): string | null {
  return idDaAcao.startsWith(PREFIXO_COPIAR_LINK) ? idDaAcao.slice(PREFIXO_COPIAR_LINK.length) : null;
}

export type ArquivoParaAcoes = { id: string; nome: string; ext: string; downloadUrl: string };

export type DocumentoParaAcoes = {
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
};

export type ContextoAcoesDocumento = {
  projetoId: string;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
  /** Uma ação desta tabela ainda está em curso — trava as que mudam o documento. */
  ocupado?: boolean;
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

export function itensDeDocumento(d: DocumentoParaAcoes, ctx: ContextoAcoesDocumento): AcaoItem[] {
  // O visualizador de PDF recebe o id do PDF — que nem sempre é o primeiro arquivo da revisão.
  const pdf = d.arquivos.find((a) => a.ext === "pdf");
  const temValidacao = d.validado !== null;
  const travado = ctx.ocupado ? MOTIVO_OCUPADO : undefined;

  const itens: (AcaoItem | null)[] = [
    // Primeiro item: é o que o clique no título da linha faz, e quem chega pelo botão direito
    // não tem como descobrir sozinho que o título é clicável.
    { tipo: "acao", id: ACAO_DETALHES, rotulo: "Detalhes do documento", icone: PanelRight },
    pdf
      ? {
          tipo: "link",
          id: "visualizar",
          rotulo: "Visualizar em nova aba",
          icone: Eye,
          href: `/projetos/${ctx.projetoId}/arquivos/${pdf.id}/visualizar`,
          novaAba: true,
        }
      : null,
    pdf && d.versao > 1
      ? {
          tipo: "link",
          id: "comparar",
          rotulo: "Comparar revisões",
          icone: GitCompare,
          href: `/projetos/${ctx.projetoId}/arquivos/${pdf.id}/comparar`,
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
              desabilitado: travado,
            } satisfies AcaoItem,
          ]
        : [
            { tipo: "acao", id: ACAO_VALIDAR, rotulo: "Validar", icone: ShieldCheck, desabilitado: travado } satisfies AcaoItem,
            { tipo: "acao", id: ACAO_SOLICITAR_AJUSTE, rotulo: "Solicitar ajuste", icone: XCircle } satisfies AcaoItem,
          ]
      : []),

    { tipo: "separador", id: "sep-gerir" },
    d.podeGerir ? { tipo: "acao", id: ACAO_RENOMEAR, rotulo: "Renomear", icone: Pencil } : null,

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
