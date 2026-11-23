/**
 * Atas de reunião (spec `docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md`) — regras PURAS: limites,
 * frases de recusa (a mesma frase é o `ActionError` do servidor e o motivo de item desabilitado na tela) e as decisões
 * de "pode publicar / responder / mexer na pendência". Sem Prisma, sem Next.
 */

export type EstadoVersao = "rascunho" | "publicada" | "substituida";
export type RespostaAta = "concorda" | "observacoes";
export type TipoItem = "decisao" | "tarefa_equipe" | "pendencia_cliente";
export type SituacaoPendencia = "aberta" | "aguardando_conferencia" | "conferida" | "reaberta" | "cancelada";
export type OperacaoPendencia = "feito" | "conferir" | "reabrir";

/** Item do rascunho (e de uma versão publicada): `chave` é a identidade que passa de versão em versão. */
export type ItemRascunho = {
  chave: string;
  tipo: TipoItem;
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  /** "YYYY-MM-DD" (dia de São Paulo) ou nulo. */
  prazo: string | null;
};

export const TITULO_MAX = 120;
export const TEXTO_MAX = 20000;
export const TITULO_ITEM_MAX = 200;
export const DESCRICAO_ITEM_MAX = 2000;
export const OBSERVACAO_MAX = 2000;
export const COMENTARIO_FEITO_MAX = 1000;
export const MOTIVO_REABRIR_MAX = 500;
export const MOTIVO_RETIRAR_MAX = 500;
export const ITENS_MAX = 200;
export const TAMANHO_MAX_ARQUIVO = 20 * 1024 * 1024;
export const TAMANHO_MAX_ARQUIVO_LABEL = "20 MB";
export const EXTENSOES_ARQUIVO = ["docx", "md", "txt"] as const;

export const MOTIVO_NAO_ENCONTRADA = "Ata não encontrada.";
export const MOTIVO_PENDENCIA_NAO_ENCONTRADA = "Pendência não encontrada.";
export const MOTIVO_JA_RESPONDIDA = "Esta versão já foi respondida.";
export const MOTIVO_SUBSTITUIDA = "Esta versão foi substituída por uma mais nova. Recarregue a página.";
export const MOTIVO_RETIRADA = "Esta ata foi retirada.";
export const MOTIVO_SEM_RASCUNHO = "Não há rascunho para publicar.";
export const MOTIVO_JA_TEM_RASCUNHO = "Já existe um rascunho desta ata.";
export const MOTIVO_SEM_PUBLICADA = "Esta ata ainda não foi publicada.";
export const MOTIVO_SEM_CONTEUDO = "Escreva o texto da ata ou inclua ao menos um item.";
export const MOTIVO_SEM_RESPONSAVEL = "Escolha o responsável de cada tarefa da equipe.";
export const MOTIVO_RESPONSAVEL_FORA = "O responsável precisa ser membro do projeto.";
export const MOTIVO_TITULO_ITEM = "Dê um título a cada item da ata.";
export const MOTIVO_OBSERVACAO = "Escreva a sua observação.";
export const MOTIVO_MOTIVO_REABRIR = "Explique por que a pendência foi reaberta.";
export const MOTIVO_MOTIVO_RETIRAR = "Explique por que a ata está sendo retirada.";
export const MOTIVO_TIPO_ARQUIVO = "Anexe as anotações em .docx, .md ou .txt.";
export const MOTIVO_ARQUIVO_GRANDE = `O arquivo passa de ${TAMANHO_MAX_ARQUIVO_LABEL}.`;
export const MOTIVO_TITULO = "Dê um título à reunião.";
export const MOTIVO_DATA = "Informe a data da reunião.";

/** Frase quando a operação não cabe na situação atual da pendência. */
export const MOTIVO_PENDENCIA_ESTADO: Record<SituacaoPendencia, string> = {
  aberta: "Esta pendência ainda não foi marcada como feita.",
  aguardando_conferencia: "Esta pendência já foi marcada como feita e aguarda a conferência da coordenação.",
  conferida: "Esta pendência já foi conferida.",
  reaberta: "Esta pendência foi reaberta e aguarda o cliente.",
  cancelada: "Esta pendência foi cancelada.",
};

export const ROTULO_SITUACAO_PENDENCIA: Record<SituacaoPendencia, string> = {
  aberta: "Aberta",
  aguardando_conferencia: "Aguardando conferência",
  conferida: "Conferida",
  reaberta: "Reaberta",
  cancelada: "Cancelada",
};
export const ROTULO_RESPOSTA_ATA: Record<RespostaAta, string> = { concorda: "Li e concordo", observacoes: "Tenho observações" };
export const ROTULO_TIPO_ITEM: Record<TipoItem, string> = {
  decisao: "Decisão",
  tarefa_equipe: "Tarefa da equipe",
  pendencia_cliente: "Pendência do cliente",
};
export const ROTULO_COORDENACAO = "a coordenação";

const PERMITE: Record<OperacaoPendencia, readonly SituacaoPendencia[]> = {
  feito: ["aberta", "reaberta"],
  conferir: ["aguardando_conferencia"],
  reabrir: ["aguardando_conferencia"],
};

export function motivoParaPendencia(op: OperacaoPendencia, s: SituacaoPendencia): string | null {
  return PERMITE[op].includes(s) ? null : MOTIVO_PENDENCIA_ESTADO[s];
}

export function pendenciaAtrasada(p: { situacao: SituacaoPendencia; prazo: string | null }, hoje: string): boolean {
  return (p.situacao === "aberta" || p.situacao === "reaberta") && p.prazo !== null && p.prazo < hoje;
}

export function motivoParaPublicar(p: { texto: string; itens: ItemRascunho[]; membros: ReadonlySet<string> }): string | null {
  if (p.texto.trim().length === 0 && p.itens.length === 0) return MOTIVO_SEM_CONTEUDO;
  for (const i of p.itens) {
    if (i.titulo.trim().length === 0) return MOTIVO_TITULO_ITEM;
    if (i.tipo === "tarefa_equipe") {
      if (!i.responsavelId) return MOTIVO_SEM_RESPONSAVEL;
      if (!p.membros.has(i.responsavelId)) return MOTIVO_RESPONSAVEL_FORA;
    }
  }
  return null;
}

export function motivoParaResponder(v: { estado: EstadoVersao; resposta: string | null; retirada: boolean }): string | null {
  if (v.retirada) return MOTIVO_RETIRADA;
  if (v.estado === "substituida") return MOTIVO_SUBSTITUIDA;
  if (v.estado !== "publicada") return MOTIVO_NAO_ENCONTRADA;
  if (v.resposta !== null) return MOTIVO_JA_RESPONDIDA;
  return null;
}

/** Extensão em minúsculas, sem ponto. */
export function extensaoDoArquivo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

export function motivoDoArquivo(p: { nome: string; tamanho: number }): string | null {
  if (!(EXTENSOES_ARQUIVO as readonly string[]).includes(extensaoDoArquivo(p.nome))) return MOTIVO_TIPO_ARQUIVO;
  if (p.tamanho > TAMANHO_MAX_ARQUIVO) return MOTIVO_ARQUIVO_GRANDE;
  return null;
}
