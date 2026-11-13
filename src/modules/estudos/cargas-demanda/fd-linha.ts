import { fdAquecimentoEletrodomesticos, fdEquipamentoEspecifico, type GrupoEquipamentoEquatorial } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/equatorial";
import { fdAdministracaoEdificios } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/neoenergia";

import type { Concessionaria, CriterioFdAquecimento, LinhaCargaEstudo } from "./conteudo";

/**
 * FD sugerido de uma linha de carga — **puro**. A linha pode seguir uma REGRA (`regraFd`): com o `fd` em branco ela adota o
 * sugerido da regra (azul na tela); digitado, o `fd` vale. Os valores vêm sempre da biblioteca (`concessionarias/*`), nunca
 * daqui. A regra só vale na concessionária dela: trocar de concessionária tira a sugestão, não deixa um número velho.
 *
 * Regras ligadas até agora (o resto das tabelas de FD continua digitado pelo projetista):
 *   neo-adm-iluminacao, neo-adm-tomadas  Neoenergia, administração de edifícios de uso coletivo: DUAS linhas, 1,00 da
 *                                        iluminação e 0,50 das tomadas (resposta do engenheiro à Q36)
 *   eqt-aquecimento                      Equatorial, aparelhos de aquecimento por nº de aparelhos do escopo (quantidade × N):
 *                                        pela potência do aparelho ou pelo tipo de equipamento, à escolha do cálculo (Q33)
 */

export const REGRA_NEO_ADM_ILUMINACAO = "neo-adm-iluminacao";
export const REGRA_NEO_ADM_TOMADAS = "neo-adm-tomadas";
export const REGRA_EQT_AQUECIMENTO = "eqt-aquecimento";

/** Aparelho "até 3,5 kW" é inclusive (a tabela separa até/acima de 3,5 kW). */
export const LIMITE_POTENCIA_APARELHO_W = 3500;

export const GRUPOS_EQUIPAMENTO_EQUATORIAL: readonly { valor: GrupoEquipamentoEquatorial; rotulo: string }[] = [
  { valor: "chuveiro", rotulo: "Chuveiro elétrico" },
  { valor: "torneira_aquecedor_ferro", rotulo: "Torneira, aquecedor ou ferro" },
  { valor: "fogao", rotulo: "Fogão elétrico" },
  { valor: "secadora_lava_louca_forno_microondas", rotulo: "Secadora, lava-louças ou forno de micro-ondas" },
];

const REGRA_DA_CONCESSIONARIA: Record<string, Concessionaria> = {
  [REGRA_NEO_ADM_ILUMINACAO]: "neoenergia",
  [REGRA_NEO_ADM_TOMADAS]: "neoenergia",
  [REGRA_EQT_AQUECIMENTO]: "equatorial",
};

export type ContextoFd = {
  concessionaria: Concessionaria | null;
  /** × N do escopo do cálculo. */
  escopoN: number;
  fdAquecimento: CriterioFdAquecimento | null;
};

/**
 * A regra que a linha segue: a gravada (`regraFd`) ou, na Equatorial, a dos aparelhos de aquecimento (todo cálculo de
 * aquecimento dela tem a escolha T6 × T7, sem a pessoa precisar marcar linha a linha).
 */
export function regraDaLinha(concessionaria: Concessionaria | null, l: Pick<LinhaCargaEstudo, "regraFd" | "tipoCarga">): string | null {
  if (l.regraFd) return l.regraFd;
  return concessionaria === "equatorial" && l.tipoCarga === "aquecimento" ? REGRA_EQT_AQUECIMENTO : null;
}

/** A regra existe e vale para a concessionária do estudo? */
export function regraVale(regra: string | null, concessionaria: Concessionaria | null): boolean {
  return regra != null && concessionaria != null && REGRA_DA_CONCESSIONARIA[regra] === concessionaria;
}

function grupoValido(subtipo: string | null): GrupoEquipamentoEquatorial | null {
  return GRUPOS_EQUIPAMENTO_EQUATORIAL.find((g) => g.valor === subtipo)?.valor ?? null;
}

/** FD que a regra da linha sugere; `null` = sem regra, regra de outra concessionária, ou falta dado (ex.: o grupo do equipamento). */
export function fdSugeridoDaLinha(ctx: ContextoFd, l: Pick<LinhaCargaEstudo, "regraFd" | "tipoCarga" | "subtipo" | "quantidade" | "potenciaW">): number | null {
  const regra = regraDaLinha(ctx.concessionaria, l);
  if (!regraVale(regra, ctx.concessionaria)) return null;
  switch (regra) {
    case REGRA_NEO_ADM_ILUMINACAO:
      return fdAdministracaoEdificios().iluminacao;
    case REGRA_NEO_ADM_TOMADAS:
      return fdAdministracaoEdificios().tomadas;
    case REGRA_EQT_AQUECIMENTO: {
      if (l.quantidade == null || !(l.quantidade > 0)) return null;
      // O nº de aparelhos é o do ESCOPO (spec §3.1, regra 4): quantidade × N, nunca a soma de cálculos isolados.
      const aparelhos = Math.round(l.quantidade * ctx.escopoN);
      if ((ctx.fdAquecimento ?? "potencia") === "equipamento") {
        const grupo = grupoValido(l.subtipo);
        return grupo ? fdEquipamentoEspecifico(grupo, aparelhos).fd : null;
      }
      if (l.potenciaW == null || !(l.potenciaW > 0)) return null;
      return fdAquecimentoEletrodomesticos(l.potenciaW <= LIMITE_POTENCIA_APARELHO_W ? "ate_3_5_kW" : "maior_que_3_5_kW", aparelhos).fd;
    }
    default:
      return null;
  }
}

/** O FD que vale na linha: o digitado, ou (em branco) o sugerido da regra. */
export function fdEfetivoDaLinha(ctx: ContextoFd, l: Pick<LinhaCargaEstudo, "fd" | "regraFd" | "tipoCarga" | "subtipo" | "quantidade" | "potenciaW">): { fd: number | null; ehSugerido: boolean } {
  if (l.fd != null) return { fd: l.fd, ehSugerido: false };
  const sugerido = fdSugeridoDaLinha(ctx, l);
  return { fd: sugerido, ehSugerido: sugerido != null };
}
