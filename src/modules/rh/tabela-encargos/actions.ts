"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { parametrosEncargosSchema } from "@/modules/rh/rateio/custo-hora/parametros";
import { motivoParaNaoCriarVersao, motivoParaNaoExcluirVersao } from "@/modules/rh/tabela-encargos/regras";

const MSG_MES_REPETIDO = "Já existe uma versão começando neste mês. Exclua a anterior ou escolha outro mês.";
const mesesFechadosV2 = async () =>
  (await prisma.fechamentoRateio.findMany({ where: { calculo: "v2" }, select: { ano: true, mes: true } })).map(
    (f) => `${f.ano}-${String(f.mes).padStart(2, "0")}`,
  );

const PATH = "/rh/encargos-empresa";
const mesIso = (d: Date) => d.toISOString().slice(0, 7);

export const criarVersaoEncargos = defineAction(
  {
    modulo: "rh",
    acao: "criar-versao-encargos",
    gereRh: true,
    entidade: "TabelaEncargos",
    entidadeId: (d) => (d as { id: string }).id,
    schema: z.object({
      contratacao: z.enum(["clt", "estagio", "pro_labore"]),
      vigencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês de início."),
      parametros: parametrosEncargosSchema,
      observacao: z.string().trim().max(500, "Observação com até 500 caracteres.").optional(),
    }),
  },
  async (i, { user }) => {
    if (i.parametros.tipo !== i.contratacao) throw new ActionError("Os parâmetros não são desta contratação.");
    const vigenciaEm = new Date(`${i.vigencia}-01T00:00:00Z`);
    const existe = await prisma.tabelaEncargos.findUnique({ where: { contratacao_vigenciaEm: { contratacao: i.contratacao, vigenciaEm } } });
    if (existe) throw new ActionError(MSG_MES_REPETIDO);
    const motivo = motivoParaNaoCriarVersao({ vigencia: i.vigencia, mesesFechadosV2: await mesesFechadosV2() });
    if (motivo) throw new ActionError(motivo);
    const criada = await prisma.tabelaEncargos
      .create({
        data: { contratacao: i.contratacao, vigenciaEm, parametros: i.parametros, observacao: i.observacao || null, autorId: user.id },
      })
      .catch((e: unknown) => {
        // Clique duplo: o segundo esbarra no @@unique([contratacao, vigenciaEm]).
        if ((e as { code?: string }).code === "P2002") throw new ActionError(MSG_MES_REPETIDO);
        throw e;
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
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (i) => prisma.tabelaEncargos.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const v = await prisma.tabelaEncargos.findUnique({ where: { id: i.id } });
    if (!v) throw new ActionError("Versão não encontrada.");
    const [irmas, fechados] = await Promise.all([
      prisma.tabelaEncargos.findMany({ where: { contratacao: v.contratacao }, select: { vigenciaEm: true } }),
      mesesFechadosV2(),
    ]);
    const motivo = motivoParaNaoExcluirVersao({
      vigencia: mesIso(v.vigenciaEm),
      vigenciasDaContratacao: irmas.map((x) => mesIso(x.vigenciaEm)),
      mesesFechadosV2: fechados,
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
    // Só "IEL" ou contratação direta (null): a tela não oferece outro agente, e qualquer texto ligaria a taxa.
    schema: z.object({ vinculoId: z.string().min(1), agente: z.enum(["IEL"], { error: "Agente desconhecido." }).nullable() }),
    entidadeId: (_d, i) => i.vinculoId,
    capturarAntes: async (i) => prisma.vinculo.findUnique({ where: { id: i.vinculoId }, select: { agenteIntegracao: true } }),
  },
  async (i) => {
    const r = await prisma.vinculo.updateMany({
      where: { id: i.vinculoId, contratacao: "estagio", ativo: true },
      data: { agenteIntegracao: i.agente || null },
    });
    if (r.count !== 1) throw new ActionError("Só dá para mudar o agente de um estágio ativo.");
    revalidatePath(PATH);
    return { ok: true };
  },
);
