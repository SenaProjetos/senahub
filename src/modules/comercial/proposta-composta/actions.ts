"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { escalaresDaProposta, tokensNaoResolvidosProposta } from "./campos";
import { mensagemTokensNaoResolvidos } from "@/modules/juridico/contrato/campos";
import { calcularParcelas } from "./parcelas";
import { SECOES_ORDEM, pagamentoDoModeloSchema, secoesDoModeloSchema } from "./modelos";
import type { SecaoProposta } from "@/generated/prisma/client";

/**
 * Manutenção da biblioteca de cláusulas e dos modelos de proposta (ADR-0006, G3).
 *
 * Gate `comercial:modelos` em TUDO aqui: editar uma cláusula muda o texto de toda proposta
 * montada dali em diante, então é da gestão — `comercial:gerir` (quem monta proposta) não basta.
 */

const base = { modulo: "comercial", recurso: "comercial", permissao: "modelos" } as const;

const UF = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "UF deve ter 2 letras.")
  .optional()
  .or(z.literal("").transform(() => undefined));

const secaoEnum = z.enum(SECOES_ORDEM as [SecaoProposta, ...SecaoProposta[]]);

const clausulaSchema = z.object({
  secao: secaoEnum,
  titulo: z.string().trim().min(3, "Dê um nome para achar a cláusula depois.").max(120),
  texto: z.string().trim().min(10, "O texto da cláusula está curto demais."),
  disciplinaId: z.string().trim().optional(),
  uf: UF,
  ordem: z.number().int().min(0).max(9999).default(0),
});

/**
 * Valida os tokens ANTES de salvar.
 *
 * O motor resolve token desconhecido como string vazia, e `resolverTextoProposta` recusa gerar o
 * documento — ou seja, o erro só apareceria na hora de montar a proposta, longe de quem digitou.
 * Aqui ele aparece no formulário, em cima do campo.
 *
 * A checagem usa uma proposta fictícia COMPLETA: interessa o token que não existe (erro de
 * digitação), não o campo que esta proposta específica ainda não preencheu.
 */
function validarTokens(texto: string) {
  const fixture = escalaresDaProposta({
    numero: "PR-260001",
    cliente: "Cliente",
    titulo: "Proposta",
    obraEndereco: "Rua Exemplo, 100",
    obraCidade: "Cidade",
    obraUF: "AL",
    areaM2: 100,
    total: 1000,
    validadeDias: 30,
  });
  const problemas = tokensNaoResolvidosProposta(texto, fixture).filter((p) => p.motivo === "desconhecido");
  if (problemas.length > 0) throw new ActionError(mensagemTokensNaoResolvidos(problemas));
}

/** Slug a partir do título: é o contrato do seed create-only, então nasce estável e único. */
function slugDe(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function slugLivre(base: string): Promise<string> {
  const raiz = base || "clausula";
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? raiz : `${raiz}-${i + 1}`;
    const existe = await prisma.clausulaProposta.findUnique({ where: { slug: tentativa }, select: { id: true } });
    if (!existe) return tentativa;
  }
  throw new ActionError("Não foi possível gerar um identificador para esta cláusula.");
}

export const criarClausula = defineAction(
  { ...base, acao: "criar-clausula", entidade: "ClausulaProposta", schema: clausulaSchema },
  async (i) => {
    validarTokens(i.texto);
    const slug = await slugLivre(slugDe(i.titulo));
    const c = await prisma.clausulaProposta.create({
      data: {
        slug,
        secao: i.secao,
        titulo: i.titulo,
        texto: i.texto,
        disciplinaId: i.disciplinaId || null,
        uf: i.uf ?? null,
        ordem: i.ordem,
      },
      select: { id: true, slug: true },
    });
    revalidatePath("/comercial/modelos");
    return c;
  },
);

export const editarClausula = defineAction(
  {
    ...base,
    acao: "editar-clausula",
    entidade: "ClausulaProposta",
    schema: clausulaSchema.extend({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.clausulaProposta.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    validarTokens(i.texto);
    // O SLUG NÃO MUDA: é a chave do seed create-only e o que os modelos referenciam. Renomear
    // faria o seed recriar a cláusula antiga no próximo deploy e quebraria todo modelo que a cita.
    await prisma.clausulaProposta.update({
      where: { id: i.id },
      data: {
        secao: i.secao,
        titulo: i.titulo,
        texto: i.texto,
        disciplinaId: i.disciplinaId || null,
        uf: i.uf ?? null,
        ordem: i.ordem,
      },
    });
    revalidatePath("/comercial/modelos");
    return {};
  },
);

export const alternarClausula = defineAction(
  {
    ...base,
    acao: "alternar-clausula",
    entidade: "ClausulaProposta",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    capturarAntes: async (i) => prisma.clausulaProposta.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    // Desativar é o jeito certo de "apagar": o texto já copiado para propostas fica intacto e o
    // rastreio (`PropostaSecao.clausulaId`) continua apontando para a origem.
    await prisma.clausulaProposta.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    revalidatePath("/comercial/modelos");
    return {};
  },
);

const modeloSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  familia: z.string().trim().max(60).optional(),
  descricao: z.string().trim().max(400).optional(),
  validadeDias: z.number().int().min(1).max(365),
  secoes: secoesDoModeloSchema,
  pagamento: pagamentoDoModeloSchema,
});

/**
 * O plano sugerido do modelo passa pela MESMA regra que o editor da proposta vai aplicar. Salvar
 * um modelo cujo plano soma 105% só adiaria o erro para quem monta a proposta.
 */
function validarPlano(pagamento: z.infer<typeof pagamentoDoModeloSchema>) {
  if (pagamento.length === 0) return;
  const r = calcularParcelas(100_000, pagamento);
  if (!r.ok) throw new ActionError(r.mensagem);
}

/** Um slug citado que não existe faria a seção nascer vazia na proposta — recusa ao salvar. */
async function validarSlugsDasSecoes(secoes: z.infer<typeof secoesDoModeloSchema>) {
  const slugs = [...new Set(secoes.map((s) => s.clausulaSlug).filter((s): s is string => Boolean(s)))];
  if (slugs.length === 0) return;
  const achadas = await prisma.clausulaProposta.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, ativo: true },
  });
  const porSlug = new Map(achadas.map((c) => [c.slug, c]));
  const faltando = slugs.filter((s) => !porSlug.has(s));
  const inativas = slugs.filter((s) => porSlug.get(s)?.ativo === false);
  if (faltando.length > 0) throw new ActionError(`Cláusula não encontrada: ${faltando.join(", ")}.`);
  if (inativas.length > 0) throw new ActionError(`Cláusula desativada: ${inativas.join(", ")}.`);
}

export const criarModeloProposta = defineAction(
  { ...base, acao: "criar-modelo-proposta", entidade: "ModeloProposta", schema: modeloSchema },
  async (i) => {
    validarPlano(i.pagamento);
    await validarSlugsDasSecoes(i.secoes);
    const raiz = slugDe(i.nome) || "modelo";
    let slug = raiz;
    for (let n = 2; await prisma.modeloProposta.findUnique({ where: { slug }, select: { id: true } }); n++) {
      slug = `${raiz}-${n}`;
      if (n > 50) throw new ActionError("Não foi possível gerar um identificador para este modelo.");
    }
    const m = await prisma.modeloProposta.create({
      data: {
        slug,
        nome: i.nome,
        familia: i.familia || null,
        descricao: i.descricao || null,
        validadeDias: i.validadeDias,
        secoesJson: i.secoes,
        pagamentoJson: i.pagamento,
      },
      select: { id: true, slug: true },
    });
    revalidatePath("/comercial/modelos");
    return m;
  },
);

export const editarModeloProposta = defineAction(
  {
    ...base,
    acao: "editar-modelo-proposta",
    entidade: "ModeloProposta",
    schema: modeloSchema.extend({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.modeloProposta.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    validarPlano(i.pagamento);
    await validarSlugsDasSecoes(i.secoes);
    await prisma.modeloProposta.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        familia: i.familia || null,
        descricao: i.descricao || null,
        validadeDias: i.validadeDias,
        secoesJson: i.secoes,
        pagamentoJson: i.pagamento,
      },
    });
    revalidatePath("/comercial/modelos");
    return {};
  },
);

export const alternarModeloProposta = defineAction(
  {
    ...base,
    acao: "alternar-modelo-proposta",
    entidade: "ModeloProposta",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    capturarAntes: async (i) => prisma.modeloProposta.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    // Nunca apagar: `Proposta.modeloId` aponta para cá (com SetNull), e a proposta já enviada
    // perderia a origem. Inativo some da escolha de quem monta, e pronto.
    await prisma.modeloProposta.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    revalidatePath("/comercial/modelos");
    return {};
  },
);
