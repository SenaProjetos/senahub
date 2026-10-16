/**
 * Pendências do ciclo documental na tela do administrador. PURO: sem Prisma, sem I/O.
 *
 * A varredura (`integridade.ts`) acha violações; aqui cada uma ganha um ALVO (revisão, ou documento nas
 * duas publicadas) e uma ASSINATURA do estado. A dispensa grava a assinatura do momento: se o estado
 * mudar (outro arquivo na lixeira, a revisão voltou à análise), a assinatura muda e a pendência volta
 * a aparecer. Spec: docs/superpowers/specs/2026-10-15-pendencias-documentais-design.md.
 */
import type { Violacao } from "./integridade";

export const TIPOS_PENDENCIA = ["publicada_com_lixeira", "analise_parada", "duas_publicadas"] as const;
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number];
export type ViolacaoDispensavel = Extract<Violacao, { tipo: TipoPendencia }>;

export const ROTULO_PENDENCIA: Record<TipoPendencia | "corrigida", string> = {
  publicada_com_lixeira: "Lixeira",
  analise_parada: "Análise parada",
  duas_publicadas: "Duas publicadas",
  corrigida: "Corrigida automaticamente",
};

/** A MESMA frase vai para o `ActionError` do servidor e para o item desabilitado do menu. */
export const MOTIVO_NAO_DISPENSAVEL = "Já foi revogada automaticamente.";
export const MOTIVO_JA_RESOLVIDA = "Esta pendência mudou ou foi resolvida. Atualize a tela.";
export const MOTIVO_JA_DISPENSADA = "Esta pendência já está dispensada.";
export const MOTIVO_DISPENSA_ENCERRADA = "Esta dispensa já foi desfeita.";

export type DispensaAtiva = {
  id: string;
  alvoId: string;
  tipo: TipoPendencia;
  chave: string;
  motivo: string;
  criadaPorId: string;
  criadaEm: Date;
};

export type ItemPendencia = {
  violacao: ViolacaoDispensavel;
  alvoId: string;
  chave: string;
  dispensa: DispensaAtiva | null;
};

export function ehDispensavel(v: Violacao): v is ViolacaoDispensavel {
  return v.tipo !== "controle_fora_de_publicada";
}

/** Revisão (lixeira, análise parada) ou documento (duas publicadas). */
export function alvoDaViolacao(v: ViolacaoDispensavel): string {
  return v.tipo === "duas_publicadas" ? v.documentoId : v.revisaoId;
}

export function assinaturaDaViolacao(v: ViolacaoDispensavel): string {
  switch (v.tipo) {
    case "publicada_com_lixeira":
      return `lix:${v.estado}:${[...v.idsNaLixeira].sort().join(",")}`;
    case "analise_parada":
      return `par:${v.estadoEm.toISOString()}`;
    case "duas_publicadas":
      return `dup:${[...v.revisaoIds].sort().join(",")}`;
  }
}

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

export function detalheDaViolacao(v: ViolacaoDispensavel): { detalhe: string; complemento: string | null } {
  switch (v.tipo) {
    case "publicada_com_lixeira":
      return {
        detalhe: v.qtdNaLixeira === 1 ? "1 arquivo na lixeira" : `${v.qtdNaLixeira} arquivos na lixeira`,
        complemento: v.estado === "publicado" ? "revisão vigente" : null,
      };
    case "analise_parada":
      return { detalhe: `Em análise há ${dias(v.dias)}`, complemento: `limite do projeto: ${dias(v.limiteDias)}` };
    case "duas_publicadas":
      return { detalhe: `${v.revisaoIds.length} revisões publicadas`, complemento: "não deveria acontecer; avise o desenvolvedor" };
  }
}

const chaveDoPar = (tipo: string, alvoId: string) => `${tipo}:${alvoId}`;

/** Separa as violações dispensáveis em abertas e dispensadas (dispensa ativa COM a mesma assinatura). */
export function aplicarDispensas(
  violacoes: readonly Violacao[],
  dispensas: readonly DispensaAtiva[],
): { abertas: ItemPendencia[]; dispensadas: ItemPendencia[] } {
  const ativas = new Map(dispensas.map((d) => [chaveDoPar(d.tipo, d.alvoId), d]));
  const abertas: ItemPendencia[] = [];
  const dispensadas: ItemPendencia[] = [];
  for (const v of violacoes) {
    if (!ehDispensavel(v)) continue;
    const alvoId = alvoDaViolacao(v);
    const chave = assinaturaDaViolacao(v);
    const d = ativas.get(chaveDoPar(v.tipo, alvoId));
    const item: ItemPendencia = { violacao: v, alvoId, chave, dispensa: d && d.chave === chave ? d : null };
    (item.dispensa ? dispensadas : abertas).push(item);
  }
  return { abertas, dispensadas };
}

/**
 * Dispensas ativas que não casam com nenhuma violação atual (a pendência sumiu ou a assinatura mudou).
 * O job as encerra: sem isso, a ocorrência NOVA com a mesma assinatura de antes herdaria a dispensa
 * velha calada (1 arquivo na lixeira → 2 → volta a 1).
 */
export function dispensasObsoletas(violacoes: readonly Violacao[], dispensas: readonly DispensaAtiva[]): DispensaAtiva[] {
  const vivas = new Set<string>();
  for (const v of violacoes) {
    if (ehDispensavel(v)) vivas.add(`${chaveDoPar(v.tipo, alvoDaViolacao(v))}|${assinaturaDaViolacao(v)}`);
  }
  return dispensas.filter((d) => !vivas.has(`${chaveDoPar(d.tipo, d.alvoId)}|${d.chave}`));
}

/** Corpo da notificação diária (A7). `null` = nada a avisar. */
export function resumoDoAviso(p: { abertas: readonly ItemPendencia[]; corrigidas: number }): string | null {
  const partes: string[] = [];
  if (p.corrigidas > 0) {
    partes.push(
      p.corrigidas === 1
        ? "1 liberação indevida revogada automaticamente."
        : `${p.corrigidas} liberações indevidas revogadas automaticamente.`,
    );
  }
  if (p.abertas.length > 0) {
    const n = (t: TipoPendencia) => p.abertas.filter((i) => i.violacao.tipo === t).length;
    const lixeira = n("publicada_com_lixeira");
    const paradas = n("analise_parada");
    const duplas = n("duas_publicadas");
    const detalhe = [
      lixeira > 0 ? `${lixeira} na lixeira` : null,
      paradas > 0 ? `${paradas} ${paradas === 1 ? "parada" : "paradas"}` : null,
      duplas > 0 ? `${duplas} ${duplas === 1 ? "duplicada" : "duplicadas"}` : null,
    ].filter(Boolean);
    const total = p.abertas.length;
    partes.push(`${total} ${total === 1 ? "pendência aberta" : "pendências abertas"} (${detalhe.join(", ")}).`);
  }
  return partes.length > 0 ? partes.join(" ") : null;
}
