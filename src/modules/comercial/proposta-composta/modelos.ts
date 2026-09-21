import { z } from "zod";
import type { SecaoProposta } from "@/generated/prisma/client";

/**
 * Leitura do `ModeloProposta.secoesJson` — puro, sem I/O.
 *
 * O JSON referencia cláusulas por SLUG, e slug não tem chave estrangeira. Um slug com erro de
 * digitação, ou uma cláusula que a gestão desativou depois, produziria uma seção faltando sem
 * ninguém perceber. Esta é a terceira vez que este sistema quase repete o mesmo padrão — o
 * fallback `docVazio()` do Estúdio e o token que resolve vazio foram as outras duas —, então
 * aqui a resolução **relata** o que não resolveu, como `resolverTextoProposta` faz.
 */

export const SECOES_ORDEM: SecaoProposta[] = [
  "descricao",
  "escopo",
  "valor_observacao",
  "pagamento_observacao",
  "nao_incluso",
  "competencia_contratada",
  "competencia_contratante",
  "documentos",
  "alteracoes",
];

/** Rótulo exibido quando a seção da proposta não tem título próprio. */
export const ROTULO_SECAO: Record<SecaoProposta, string> = {
  descricao: "Descrição dos serviços",
  escopo: "Escopo",
  valor_observacao: "Observações sobre o valor",
  pagamento_observacao: "Condições de pagamento",
  nao_incluso: "Não estão inclusos nesta proposta",
  competencia_contratada: "Competências da contratada",
  competencia_contratante: "Competências da contratante",
  documentos: "Documentos necessários",
  alteracoes: "Alterações e revisões",
};

export const secaoDoModeloSchema = z.object({
  secao: z.enum(SECOES_ORDEM as [SecaoProposta, ...SecaoProposta[]]),
  titulo: z.string().trim().max(120).optional(),
  clausulaSlug: z.string().trim().min(1).optional(),
  ordem: z.number().int(),
});
export type SecaoDoModelo = z.infer<typeof secaoDoModeloSchema>;

export const secoesDoModeloSchema = z.array(secaoDoModeloSchema);

export const parcelaDoModeloSchema = z.object({
  descricao: z.string().trim().min(1),
  percentual: z.number().positive().max(100),
  prazo: z.string().trim().optional(),
});
export const pagamentoDoModeloSchema = z.array(parcelaDoModeloSchema);
export type ParcelaDoModelo = z.infer<typeof parcelaDoModeloSchema>;

/** `secoesJson` vindo do banco (Json = unknown). JSON inválido vira lista vazia + problema. */
export function lerSecoesDoModelo(json: unknown): { secoes: SecaoDoModelo[]; invalido: boolean } {
  const r = secoesDoModeloSchema.safeParse(json);
  if (!r.success) return { secoes: [], invalido: true };
  return { secoes: [...r.data].sort((a, b) => a.ordem - b.ordem), invalido: false };
}

export function lerPagamentoDoModelo(json: unknown): ParcelaDoModelo[] {
  const r = pagamentoDoModeloSchema.safeParse(json);
  return r.success ? r.data : [];
}

export type ClausulaDisponivel = { slug: string; texto: string; titulo: string; ativo: boolean };

export type SecaoResolvida = {
  secao: SecaoProposta;
  titulo: string;
  ordem: number;
  /** Texto da cláusula; vazio quando a seção do modelo não aponta para nenhuma. */
  texto: string;
  clausulaSlug?: string;
};

export type ProblemaDoModelo = {
  secao: SecaoProposta;
  clausulaSlug: string;
  motivo: "inexistente" | "inativa";
};

export type ResolucaoDoModelo = {
  secoes: SecaoResolvida[];
  /** Slugs citados que não deram texto — a UI PRECISA mostrar, não pode ignorar. */
  problemas: ProblemaDoModelo[];
  /** `secoesJson` que não passou no schema (modelo corrompido ou de versão futura). */
  jsonInvalido: boolean;
};

/**
 * Monta as seções de uma proposta a partir do modelo + da biblioteca.
 *
 * Slug que não existe ou aponta para cláusula inativa **não é descartado**: a seção entra sem
 * texto (para quem monta preencher) e o problema vai em `problemas`. Descartar a seção faria a
 * proposta sair sem "Não inclusos" — uma cláusula de proteção sumindo em silêncio.
 */
export function resolverSecoesDoModelo(
  secoesJson: unknown,
  clausulas: readonly ClausulaDisponivel[],
): ResolucaoDoModelo {
  const { secoes, invalido } = lerSecoesDoModelo(secoesJson);
  const porSlug = new Map(clausulas.map((c) => [c.slug, c]));
  const problemas: ProblemaDoModelo[] = [];

  const resolvidas = secoes.map((s): SecaoResolvida => {
    const base = { secao: s.secao, ordem: s.ordem, clausulaSlug: s.clausulaSlug };
    if (!s.clausulaSlug) return { ...base, titulo: s.titulo ?? ROTULO_SECAO[s.secao], texto: "" };

    const c = porSlug.get(s.clausulaSlug);
    if (!c) {
      problemas.push({ secao: s.secao, clausulaSlug: s.clausulaSlug, motivo: "inexistente" });
      return { ...base, titulo: s.titulo ?? ROTULO_SECAO[s.secao], texto: "" };
    }
    if (!c.ativo) {
      problemas.push({ secao: s.secao, clausulaSlug: s.clausulaSlug, motivo: "inativa" });
      return { ...base, titulo: s.titulo ?? ROTULO_SECAO[s.secao], texto: "" };
    }
    return { ...base, titulo: s.titulo ?? ROTULO_SECAO[s.secao], texto: c.texto };
  });

  return { secoes: resolvidas, problemas, jsonInvalido: invalido };
}

/** Mensagem pt-BR pronta para a tela de quem monta a proposta. */
export function mensagemProblemasDoModelo(problemas: readonly ProblemaDoModelo[]): string {
  if (problemas.length === 0) return "";
  const inexistentes = problemas.filter((p) => p.motivo === "inexistente");
  const inativas = problemas.filter((p) => p.motivo === "inativa");
  const partes: string[] = [];
  if (inexistentes.length > 0) {
    partes.push(
      `Cláusula não encontrada na biblioteca: ${inexistentes.map((p) => p.clausulaSlug).join(", ")}.`,
    );
  }
  if (inativas.length > 0) {
    partes.push(`Cláusula desativada: ${inativas.map((p) => p.clausulaSlug).join(", ")}.`);
  }
  return `${partes.join(" ")} A seção ficou em branco — preencha o texto ou corrija o modelo.`;
}
