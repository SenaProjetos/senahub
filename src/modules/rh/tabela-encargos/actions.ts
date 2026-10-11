"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { parametrosEncargosSchema } from "@/modules/rh/rateio/custo-hora/parametros";
import { motivoParaNaoExcluirVersao } from "@/modules/rh/tabela-encargos/regras";

const PATH = "/rh/encargos-empresa";
const mesIso = (d: Date) => d.toISOString().slice(0, 7);

export const criarVersaoEncargos = defineAction(
  {
    modulo: "rh",
    acao: "criar-versao-encargos",
    gereRh: true,
    entidade: "TabelaEncargos",
    schema: z.object({
      contratacao: z.enum(["clt", "estagio", "pro_labore"]),
      vigencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês de início."),
      parametros: parametrosEncargosSchema,
      observacao: z.string().trim().max(500).optional(),
    }),
  },
  async (i, { user }) => {
    if (i.parametros.tipo !== i.contratacao) throw new ActionError("Os parâmetros não são desta contratação.");
    const vigenciaEm = new Date(`${i.vigencia}-01T00:00:00Z`);
    const existe = await prisma.tabelaEncargos.findUnique({ where: { contratacao_vigenciaEm: { contratacao: i.contratacao, vigenciaEm } } });
    if (existe) throw new ActionError("Já existe uma versão começando neste mês. Exclua a anterior ou escolha outro mês.");
    const fechado = await prisma.fechamentoRateio.findFirst({
      where: { calculo: "v2", OR: [{ ano: { gt: vigenciaEm.getUTCFullYear() } }, { ano: vigenciaEm.getUTCFullYear(), mes: { gte: vigenciaEm.getUTCMonth() + 1 } }] },
      select: { ano: true, mes: true },
    });
    if (fechado) {
      throw new ActionError(`O mês ${String(fechado.mes).padStart(2, "0")}/${fechado.ano} já foi fechado. A versão nova precisa começar depois do último mês fechado.`);
    }
    const criada = await prisma.tabelaEncargos.create({
      data: { contratacao: i.contratacao, vigenciaEm, parametros: i.parametros, observacao: i.observacao || null, autorId: user.id },
    });
    revalidatePath(PATH);
    return { id: criada.id };
  },
);

export const excluirVersaoEncargos = defineAction(
  {
    modulo: "rh",
    acao: "excluir-versao-encargos",
    gereRh: true,
    entidade: "TabelaEncargos",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.tabelaEncargos.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const v = await prisma.tabelaEncargos.findUnique({ where: { id: i.id } });
    if (!v) throw new ActionError("Versão não encontrada.");
    const [irmas, fechados] = await Promise.all([
      prisma.tabelaEncargos.findMany({ where: { contratacao: v.contratacao }, select: { vigenciaEm: true } }),
      prisma.fechamentoRateio.findMany({ where: { calculo: "v2" }, select: { ano: true, mes: true } }),
    ]);
    const motivo = motivoParaNaoExcluirVersao({
      vigencia: mesIso(v.vigenciaEm),
      vigenciasDaContratacao: irmas.map((x) => mesIso(x.vigenciaEm)),
      mesesFechadosV2: fechados.map((f) => `${f.ano}-${String(f.mes).padStart(2, "0")}`),
    });
    if (motivo) throw new ActionError(motivo);
    await prisma.tabelaEncargos.delete({ where: { id: i.id } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);

export const definirAgenteIntegracao = defineAction(
  {
    modulo: "rh",
    acao: "definir-agente-integracao",
    gereRh: true,
    entidade: "Vinculo",
    schema: z.object({ vinculoId: z.string().min(1), agente: z.string().trim().max(60).nullable() }),
    entidadeId: (_d, i) => i.vinculoId,
    capturarAntes: async (i) => prisma.vinculo.findUnique({ where: { id: i.vinculoId }, select: { agenteIntegracao: true } }),
  },
  async (i) => {
    const r = await prisma.vinculo.updateMany({
      where: { id: i.vinculoId, contratacao: "estagio", dataFim: null },
      data: { agenteIntegracao: i.agente || null },
    });
    if (r.count !== 1) throw new ActionError("Só dá para mudar o agente de um estágio ativo.");
    revalidatePath(PATH);
    return { ok: true };
  },
);
