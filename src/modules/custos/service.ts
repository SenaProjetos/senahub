import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { RegimeEncargosObra } from "./encargos-obra";
import { calcularBdi, type EntradaBdi } from "./bdi";
import { calcularEncargos, type OverrideEncargo } from "./encargos-obra";
import type { z } from "zod";
import type { criarOrcamentoSchema, atualizarCabecalhoSchema } from "./schemas";

const BDI_ZERO: EntradaBdi = {
  admCentral: 0,
  seguro: 0,
  risco: 0,
  garantia: 0,
  despesasFinanceiras: 0,
  lucro: 0,
  pis: 0,
  cofins: 0,
  iss: 0,
  cprb: 0,
};

/** Materializa `bdiPercentual` a partir das 10 parcelas — lança se os tributos somarem ≥100%. */
export function materializarBdi(entrada: EntradaBdi): number {
  const r = calcularBdi(entrada);
  if (!r.ok) throw new ActionError(r.erro);
  return r.percentual;
}

/** Materializa os dois percentuais de encargos — lança se algum override citar rubrica inexistente. */
export function materializarEncargos(
  regime: RegimeEncargosObra,
  overrides?: OverrideEncargo[],
): { horista: number; mensalista: number } {
  const r = calcularEncargos({ regime, overrides });
  if (!r.ok) throw new ActionError(r.erro);
  return { horista: r.totalHorista, mensalista: r.totalMensalista };
}

type CriarInput = z.infer<typeof criarOrcamentoSchema>;

/** Cria o cabeçalho do orçamento. BDI nasce zerado (usuário preenche); encargos nascem no preset padrão. */
export async function criarOrcamento(input: CriarInput, criadoPorId: string) {
  const projetoId = input.projetoId || null;
  const nomeAvulso = input.nomeAvulso || null;
  if (Boolean(projetoId) === Boolean(nomeAvulso)) {
    throw new ActionError("Informe um projeto OU um nome avulso — nunca os dois, nem nenhum.");
  }

  const bdiPercentual = materializarBdi(BDI_ZERO);
  const encargos = materializarEncargos("nao_desonerado");

  return prisma.custoOrcamento.create({
    data: {
      titulo: input.titulo,
      descricao: input.descricao || null,
      projetoId,
      nomeAvulso,
      contratanteId: input.contratanteId || null,
      contratanteNome: input.contratanteNome || null,
      dataBase: new Date(input.dataBase),
      bdiPercentual,
      regimeEncargos: "nao_desonerado",
      encargosHoristaPct: encargos.horista,
      encargosMensalistaPct: encargos.mensalista,
      criadoPorId,
    },
  });
}

type AtualizarCabecalhoInput = z.infer<typeof atualizarCabecalhoSchema>;

export async function atualizarCabecalho(input: AtualizarCabecalhoInput) {
  return prisma.custoOrcamento.update({
    where: { id: input.id },
    data: {
      titulo: input.titulo,
      descricao: input.descricao || null,
      contratanteId: input.contratanteId || null,
      contratanteNome: input.contratanteNome || null,
      dataBase: new Date(input.dataBase),
    },
  });
}

export async function atualizarBdi(id: string, entrada: EntradaBdi) {
  const bdiPercentual = materializarBdi(entrada);
  return prisma.custoOrcamento.update({
    where: { id },
    data: {
      bdiAdmCentral: entrada.admCentral,
      bdiSeguro: entrada.seguro,
      bdiRisco: entrada.risco,
      bdiGarantia: entrada.garantia,
      bdiDespesasFinanceiras: entrada.despesasFinanceiras,
      bdiLucro: entrada.lucro,
      bdiPis: entrada.pis,
      bdiCofins: entrada.cofins,
      bdiIss: entrada.iss,
      bdiCprb: entrada.cprb,
      bdiPercentual,
    },
  });
}

export async function atualizarEncargos(id: string, regime: RegimeEncargosObra, overrides?: OverrideEncargo[]) {
  const encargos = materializarEncargos(regime, overrides);
  return prisma.custoOrcamento.update({
    where: { id },
    data: {
      regimeEncargos: regime,
      encargosOverridesJson: overrides && overrides.length > 0 ? overrides : Prisma.JsonNull,
      encargosHoristaPct: encargos.horista,
      encargosMensalistaPct: encargos.mensalista,
    },
  });
}

export async function cancelarOrcamento(id: string) {
  return prisma.custoOrcamento.update({ where: { id }, data: { status: "cancelado" } });
}
