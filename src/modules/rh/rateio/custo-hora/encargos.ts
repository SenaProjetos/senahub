/**
 * Custo do mês de UMA pessoa = base (holerite ou cadastro) + encargos da tabela vigente
 * (decisões 3–6 e a tabela da decisão 4 do spec). PURO e em centavos: cada item é arredondado
 * sozinho, e a multa do FGTS usa os FGTS já arredondados — é a mesma conta que o RH refaz à mão.
 */
import type { ParametrosEncargos } from "./parametros";

export type ItemCusto = { chave: string; rotulo: string; cent: number };

export type EntradaCustoMes = {
  /** Salário do mês (holerite, ou cadastro proporcional). FGTS e INSS da empresa incidem nele. */
  baseCent: number;
  /** Base das reservas (13º, férias, aviso, recesso): salário contratual proporcional ao vínculo. Padrão: `baseCent`. */
  salarioReservasCent?: number;
  /** Dias úteis no vínculo ÷ dias úteis do mês (benefício não suspenso nas férias). Padrão: 1. */
  fracaoVinculo?: number;
  parametros: ParametrosEncargos;
  /** Anos completos de casa no fim do mês (aviso prévio). */
  anosCompletos: number;
  /** Dias úteis fora de férias ÷ dias úteis do mês (0 a 1). */
  fracaoForaDeFerias: number;
  /** Estagiário contratado por agente de integração (paga a taxa). */
  viaAgenteIntegracao: boolean;
};

export type CustoMes = { baseCent: number; itens: ItemCusto[]; totalCent: number };

const pct = (cent: number, bp: number) => Math.round((cent * bp) / 10000);

/**
 * Reserva mensal do aviso prévio (decisão 4, pergunta 42 = b). Aviso = salário ÷ 30 × (30 + 3 ×
 * anos completos), teto de 90 dias. No 1º ano reserva 1/12 do aviso de 30 dias; depois, só o
 * acréscimo de 3 dias por ano (salário ÷ 120 por mês), enquanto o total não passar de 90 dias.
 */
export function avisoPrevioMensalCent(baseCent: number, anosCompletos: number): number {
  if (anosCompletos < 1) return Math.round(baseCent / 12);
  if (30 + 3 * anosCompletos > 90) return 0;
  return Math.round(baseCent / 120);
}

export function custoDoMes(e: EntradaCustoMes): CustoMes {
  const base = Math.max(0, Math.round(e.baseCent));
  const reservas = Math.max(0, Math.round(e.salarioReservasCent ?? e.baseCent));
  const fracaoVinculo = Math.min(1, Math.max(0, e.fracaoVinculo ?? 1));
  const itens: ItemCusto[] = [];
  const add = (chave: string, rotulo: string, cent: number) => {
    if (cent > 0) itens.push({ chave, rotulo, cent });
  };
  const p = e.parametros;

  if (p.tipo === "clt") {
    const fgts = pct(base, p.fgtsBp);
    const decimo = p.reservaDecimoTerceiro ? Math.round(reservas / 12) : 0;
    // Férias + 1/3 por mês = (salário + salário/3) ÷ 12 = salário ÷ 9.
    const ferias = p.reservaFerias ? Math.round(reservas / 9) : 0;
    const fgtsProvisoes = pct(decimo + ferias, p.fgtsBp);
    add("fgts", "FGTS", fgts);
    add("decimo_terceiro", "Reserva de 13º", decimo);
    add("ferias", "Reserva de férias + 1/3", ferias);
    add("fgts_provisoes", "FGTS sobre 13º e férias", fgtsProvisoes);
    add("multa_fgts", "Multa de 40% do FGTS", pct(fgts + fgtsProvisoes, p.multaFgtsBp));
    add("inss_empresa", "INSS da empresa", pct(base + decimo + ferias, p.inssEmpresaBp));
    if (p.reservaAvisoPrevio) add("aviso_previo", "Reserva de aviso prévio", avisoPrevioMensalCent(reservas, e.anosCompletos));
    const fracao = Math.min(1, Math.max(0, e.fracaoForaDeFerias));
    p.beneficios.forEach((b, i) => add(`beneficio_${i}`, b.nome, Math.round(b.valorCent * (b.suspensoNasFerias ? fracao : fracaoVinculo))));
  } else if (p.tipo === "estagio") {
    if (p.reservaRecesso) add("recesso", "Reserva de recesso", Math.round(reservas / 12));
    if (e.viaAgenteIntegracao) add("taxa_agente", "Taxa do agente de integração", p.taxaAgenteCent);
  } else {
    add("inss_empresa", "INSS da empresa", pct(base, p.inssEmpresaBp));
  }

  return { baseCent: base, itens, totalCent: base + itens.reduce((s, i) => s + i.cent, 0) };
}
