"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import { descricaoDaRetirada, motivoDoRateio, percentualParaBp, ratearEntreSocios, type SocioParaRateio } from "@/modules/financeiro/socios/calculo";
import { adiantarLucrosSchema, distribuirLucrosSchema } from "@/modules/financeiro/socios/schemas";

/**
 * Retiradas de sócio que viram dinheiro de verdade (F6B): distribuição de lucros dividida pelo
 * percentual de cada sócio e adiantamento para um sócio. Cria `Lancamento` PREVISTO, um por sócio,
 * na categoria `distribuicao_lucros`/`adiantamento_lucros` — fora do resultado, dentro do caixa.
 *
 * Os valores por sócio são visíveis a quem vê o Financeiro (D5), como o pró-labore já era.
 */
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir", entidade: "Lancamento" } as const;

function rev() {
  revalidatePath("/financeiro/cadastros");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/planejador");
  revalidatePath("/financeiro");
}

async function categoriaPorChave(chave: string) {
  const c = await prisma.categoriaFinanceira.findUnique({ where: { chave }, select: { id: true, ativo: true } });
  if (!c?.ativo) throw new ActionError("A categoria de distribuição a sócios não existe ou está inativa. Rode as migrações e `npm run db:seed`.");
  return c.id;
}

async function sociosAtivos(): Promise<SocioParaRateio[]> {
  const rows = await prisma.socio.findMany({
    where: { ativo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, percentual: true, user: { select: { name: true } } },
  });
  return rows.map((s) => ({ id: s.id, nome: s.user.name, percentualBp: percentualParaBp(Number(s.percentual)) }));
}

export const distribuirLucros = defineAction(
  { ...base, acao: "distribuir-lucros", schema: distribuirLucrosSchema },
  async (i, { user }) => {
    const socios = await sociosAtivos();
    const motivo = motivoDoRateio(socios);
    if (motivo) throw new ActionError(motivo);
    const categoriaId = await categoriaPorChave("distribuicao_lucros");
    const partes = ratearEntreSocios(Math.round(i.valor * 100), socios);
    const quando = new Date(`${i.data}T00:00:00.000Z`);

    await prisma.$transaction(async (tx) => {
      for (const p of partes) {
        await tx.lancamento.create({
          data: {
            tipo: "despesa",
            descricao: descricaoDaRetirada("distribuicao", p.nome),
            valor: p.valor / 100,
            status: "previsto",
            data: quando,
            vencimento: quando,
            categoriaId,
            socioId: p.socioId,
            observacao: i.observacao || null,
            autorId: user.id,
          },
        });
      }
    });
    rev();
    return { lancamentos: partes.length, total: partes.reduce((s, p) => s + p.valor, 0) };
  },
);

export const adiantarLucros = defineAction(
  { ...base, acao: "adiantar-lucros", schema: adiantarLucrosSchema },
  async (i, { user }) => {
    const s = await prisma.socio.findUnique({ where: { id: i.socioId }, select: { ativo: true, user: { select: { name: true } } } });
    if (!s?.ativo) throw new ActionError("O sócio escolhido não existe ou está inativo.");
    const categoriaId = await categoriaPorChave("adiantamento_lucros");
    const quando = new Date(`${i.data}T00:00:00.000Z`);
    const l = await prisma.lancamento.create({
      data: {
        tipo: "despesa",
        descricao: descricaoDaRetirada("adiantamento", s.user.name),
        valor: i.valor,
        status: "previsto",
        data: quando,
        vencimento: quando,
        categoriaId,
        socioId: i.socioId,
        observacao: i.observacao || null,
        autorId: user.id,
      },
      select: { id: true },
    });
    rev();
    return { id: l.id };
  },
);
