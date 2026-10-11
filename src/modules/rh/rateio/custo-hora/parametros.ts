/**
 * Parâmetros da tabela de encargos de uma contratação (decisões 2–6 de
 * docs/superpowers/specs/2026-09-15-rateio-horas-decisoes.md). PURO: roda no navegador (formulário)
 * e no servidor (cálculo). Percentual em pontos-base, dinheiro em centavos.
 */
import { z } from "zod";

const bp = z.number().int().min(0).max(10000);

export const beneficioSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao benefício."),
  valorCent: z.number().int().nonnegative(),
  /** Não é pago nas férias: no mês com férias entra proporcional aos dias úteis fora delas. */
  suspensoNasFerias: z.boolean(),
});

export const parametrosCltSchema = z.object({
  tipo: z.literal("clt"),
  fgtsBp: bp,
  multaFgtsBp: bp,
  /** Zero no Anexo III/V (o INSS da empresa vem no DAS). */
  inssEmpresaBp: bp,
  reservaDecimoTerceiro: z.boolean(),
  reservaFerias: z.boolean(),
  reservaAvisoPrevio: z.boolean(),
  beneficios: z.array(beneficioSchema),
});

export const parametrosEstagioSchema = z.object({
  tipo: z.literal("estagio"),
  reservaRecesso: z.boolean(),
  /** Taxa mensal do agente de integração (IEL). Só vale para o vínculo com agente. */
  taxaAgenteCent: z.number().int().nonnegative(),
});

export const parametrosProLaboreSchema = z.object({
  tipo: z.literal("pro_labore"),
  inssEmpresaBp: bp,
});

export const parametrosEncargosSchema = z.discriminatedUnion("tipo", [
  parametrosCltSchema,
  parametrosEstagioSchema,
  parametrosProLaboreSchema,
]);

export type ParametrosClt = z.infer<typeof parametrosCltSchema>;
export type ParametrosEstagio = z.infer<typeof parametrosEstagioSchema>;
export type ParametrosProLabore = z.infer<typeof parametrosProLaboreSchema>;
export type ParametrosEncargos = z.infer<typeof parametrosEncargosSchema>;

/** Contratações que têm tabela de encargos. PJ e autônomo entram só com horas (decisão 7). */
export const CONTRATACOES_COM_ENCARGOS = ["clt", "estagio", "pro_labore"] as const;
export type ContratacaoComEncargos = (typeof CONTRATACOES_COM_ENCARGOS)[number];

const pctTexto = (b: number) => `${(b / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Uma linha que descreve a versão da tabela, para a lista da tela. */
export function resumoParametros(p: ParametrosEncargos): string {
  if (p.tipo === "clt") {
    const reservas = [p.reservaDecimoTerceiro && "13º", p.reservaFerias && "férias", p.reservaAvisoPrevio && "aviso prévio"].filter(Boolean) as string[];
    const reservasTxt = reservas.length === 0 ? null : reservas.length === 1 ? reservas[0] : `${reservas.slice(0, -1).join(", ")} e ${reservas[reservas.length - 1]}`;
    return [
      `FGTS ${pctTexto(p.fgtsBp)}`,
      `multa ${pctTexto(p.multaFgtsBp)}`,
      `INSS empresa ${pctTexto(p.inssEmpresaBp)}`,
      reservasTxt,
      ...p.beneficios.map((b) => `${b.nome} ${reais(b.valorCent)}`),
    ].filter(Boolean).join(" · ");
  }
  if (p.tipo === "estagio") {
    return [p.reservaRecesso ? "Recesso" : null, `taxa do agente ${reais(p.taxaAgenteCent)}`].filter(Boolean).join(" · ");
  }
  return `INSS empresa ${pctTexto(p.inssEmpresaBp)}`;
}
