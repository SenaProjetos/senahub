/**
 * Revisão marcada para o cliente (reunião de 29/09/2026). PURO: sem Prisma nem React.
 *
 * Duas "situações" levam o documento a uma pasta do cliente: **Compartilhado** (mandado para ele analisar)
 * e **Liberado para obra**. Cada uma guarda a REVISÃO que o cliente vê (`revisaoCompartilhadaId` /
 * `revisaoLiberadaObraId`), e não "a última": a equipe segue versionando e o cliente só vê a próxima quando
 * alguém marcar de novo — "o cliente nem notaria".
 *
 * Marca-se pondo o status correspondente. A revisão marcada é a MAIS NOVA que tem arquivo validado (fora da
 * lixeira): é a mesma exigência que o link sempre teve (arquivo não validado nunca chega ao cliente).
 */
import { CHAVE_STATUS } from "./status-documento";

export type Situacao = "compartilhado" | "liberado_obra";

export const SITUACOES: readonly Situacao[] = ["compartilhado", "liberado_obra"];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  compartilhado: "Compartilhado",
  liberado_obra: "Liberado para obra",
};

/** O status que leva o documento para a pasta, pela chave. Os dois nomes coincidem de propósito. */
export function situacaoDoStatus(chave: string | null | undefined): Situacao | null {
  if (chave === CHAVE_STATUS.compartilhado) return "compartilhado";
  if (chave === CHAVE_STATUS.liberadoObra) return "liberado_obra";
  return null;
}

/** Valor da URL (`?situacao=`) → situação válida, ou `null`. */
export function situacaoValida(v: unknown): Situacao | null {
  return v === "compartilhado" || v === "liberado_obra" ? v : null;
}

/** O campo do documento que guarda a revisão de cada situação. */
export const CAMPO_DA_SITUACAO = {
  compartilhado: "revisaoCompartilhadaId",
  liberado_obra: "revisaoLiberadaObraId",
} as const satisfies Record<Situacao, string>;

export type RevisaoCandidata = { id: string; numero: number; temArquivoValidado: boolean };

export function motivoSemRevisaoAprovada(situacao: Situacao): string {
  return situacao === "compartilhado"
    ? "Aprove a prancha antes de compartilhar: o cliente só recebe arquivo validado."
    : "Aprove a prancha antes de liberar para obra: o cliente só recebe arquivo validado.";
}

/** A revisão a marcar: a mais nova com arquivo validado. */
export function revisaoParaMarcar(
  revisoes: readonly RevisaoCandidata[],
  situacao: Situacao,
): { ok: true; revisaoId: string; numero: number } | { ok: false; motivo: string } {
  const melhor = revisoes
    .filter((r) => r.temArquivoValidado)
    .reduce<RevisaoCandidata | null>((m, r) => (m === null || r.numero > m.numero ? r : m), null);
  return melhor ? { ok: true, revisaoId: melhor.id, numero: melhor.numero } : { ok: false, motivo: motivoSemRevisaoAprovada(situacao) };
}

/**
 * Retirar da pasta: se o status do documento é o da própria pasta, ele volta a "Aprovado" (o passo antes de
 * marcar, que exige revisão validada) — senão o status diria "Compartilhado" com o documento fora da pasta.
 */
export function statusAoRetirar(chaveAtual: string | null | undefined, situacao: Situacao): typeof CHAVE_STATUS.aprovado | null {
  return situacaoDoStatus(chaveAtual) === situacao ? CHAVE_STATUS.aprovado : null;
}

/**
 * As marcas que a linha da tabela mostra ("Compartilhado R01"): todas, menos a que o status já diz na
 * revisão vigente — status "Compartilhado" com a marca na própria revisão vigente seria dizer duas vezes.
 * Depois que a equipe sobe a R02 (status volta a Enviado), a etiqueta lembra que o cliente segue na R01.
 */
export function marcasVisiveis(p: {
  statusChave: string | null;
  revisaoAtual: number | null;
  compartilhado: number | null;
  liberadoObra: number | null;
}): { situacao: Situacao; revisao: number }[] {
  const marcas: { situacao: Situacao; revisao: number | null }[] = [
    { situacao: "compartilhado", revisao: p.compartilhado },
    { situacao: "liberado_obra", revisao: p.liberadoObra },
  ];
  return marcas.flatMap((m) =>
    m.revisao == null || (situacaoDoStatus(p.statusChave) === m.situacao && m.revisao === p.revisaoAtual)
      ? []
      : [{ situacao: m.situacao, revisao: m.revisao }],
  );
}

/**
 * Os arquivos que o cliente vê de um documento na pasta: os da revisão marcada, validados e fora da
 * lixeira. Vazio = o documento não aparece (a revisão sumiu ou teve a validação desfeita depois).
 */
export function arquivosDaRevisaoMarcada<T extends { revisaoId: string | null; validado: boolean }>(
  arquivos: readonly T[],
  revisaoMarcadaId: string | null,
): T[] {
  if (!revisaoMarcadaId) return [];
  return arquivos.filter((a) => a.revisaoId === revisaoMarcadaId && a.validado);
}
