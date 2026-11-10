/**
 * Equatorial — critério da área útil da NT.00004, 6.11.4.2 (anexo B da spec) — **puro**.
 *   D1 = S × f                (S: Tabela 25 pela área média ponderada; f: Tabela 26 pelo nº de apartamentos)
 *   parcela dos apartamentos = D1 × 1,2   (o 1,2 é lido da fórmula "D = (D1) x 1,2 + D2 + D3")
 * Área acima da Tabela 25: Y = 0,034939 · X^0,895075 (fórmula do mesmo item, lida do texto).
 * Apart-hotel: a norma manda carga instalada (6.11.8) — o método avisa e a tela não deve usar a área útil.
 */

import {
  EQT_NT00004_TRECHOS,
  EQT_TABELA_4,
  EQT_TABELA_5,
  EQT_TABELA_6,
  EQT_TABELA_7,
  EQT_TABELA_8,
  EQT_TABELA_9,
  EQT_TABELA_10,
  EQT_TABELA_13,
  EQT_TABELA_25,
  EQT_TABELA_26,
} from "../biblioteca/equatorial";
import { referenciaDe } from "../biblioteca/tipos";
import { MSG } from "../mensagens";
import { avisosDeFaltantes, faixasDeArea, formulaDaArea, limiteDaTabela, valorDaArea } from "./area";
import { degrausDeFaixasAcumuladas, fdDaFaixa, maiorEDemais, type FdMaiorEDemais, type FdProgressivo, type FdSugerido } from "./fd-sugerido";
import { lerDoTrecho } from "./texto";
import {
  areaMediaPonderada,
  avisosAbaixoDaNorma,
  fator,
  produto,
  totalDeApartamentos,
  type Ajustes,
  type ResultadoAreaUtil,
  type TipoApartamento,
} from "./tipos";

export const NOME = "Equatorial";

const FAIXAS_S = faixasDeArea(EQT_TABELA_25.linhas, (l) => l.area_util_m2, (l) => l.demanda_S_kVA);
export const MULTIPLICADOR = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2", /D = \(D1\) x ([\d,]+) \+ D2 \+ D3 \(2\)/);
export const FORMULA_AREA = lerDoTrecho(EQT_NT00004_TRECHOS, "6.11.4.2", /Y = ([\d,]+) X\^([\d,]+)/);

/** S sugerido (kVA): Tabela 25; acima dela, a fórmula. */
export function sSugerido(areaM2: number): { valor: number | null; referencia: string } {
  if (areaM2 > limiteDaTabela(FAIXAS_S)) {
    const [c, e] = FORMULA_AREA.valores;
    return { valor: formulaDaArea(c, e, areaM2), referencia: FORMULA_AREA.referencia };
  }
  return { valor: valorDaArea(FAIXAS_S, areaM2), referencia: referenciaDe(EQT_TABELA_25) };
}

export function fSugerido(totalApartamentos: number): number | null {
  return EQT_TABELA_26.linhas.find((l) => l.n_aptos === totalApartamentos)?.f_div ?? null;
}

export type OpcoesEquatorial = { apartHotel?: boolean };

export function demandaAreaUtil(tipos: readonly TipoApartamento[], ajustes?: Ajustes, opcoes?: OpcoesEquatorial): ResultadoAreaUtil {
  const area = areaMediaPonderada(tipos);
  const n = totalDeApartamentos(tipos);
  const sug = sSugerido(area);
  const s = fator("s", "Demanda por apartamento", sug.valor, sug.referencia, ajustes, { simbolo: "S", unidade: "kVA" });
  const f = fator("f", "Fator de diversificação", fSugerido(n), referenciaDe(EQT_TABELA_26), ajustes, { simbolo: "f" });
  const m = fator("multiplicador", "Multiplicador", MULTIPLICADOR.valores[0], MULTIPLICADOR.referencia, ajustes);
  const d1 = produto([s.adotado, f.adotado]);
  const fatores = [s, f, m];
  return {
    fatores,
    passos: [
      { chave: "area", rotulo: "Área média ponderada", valor: area, unidade: "m²", formula: "Σ (n · A) ÷ Σ n" },
      { chave: "d1", rotulo: "Demanda dos apartamentos", simbolo: "D1", valor: d1, unidade: "kVA", formula: "S × f" },
      { chave: "d1m", rotulo: "Demanda dos apartamentos com multiplicador", valor: produto([d1, m.adotado]), unidade: "kVA", formula: "D1 × multiplicador" },
    ],
    demandaKVA: produto([d1, m.adotado]),
    demandaCriterioKVA: produto([s.sugerido, f.sugerido, m.sugerido]),
    avisos: [
      ...(opcoes?.apartHotel ? [MSG.apartHotelAreaUtil()] : []),
      ...avisosDeFaltantes(fatores),
      ...avisosAbaixoDaNorma(fatores, NOME),
    ],
  };
}

// ─── FD sugerido por tipo de carga (NT.00004, item 8 Tabelas; passo 4b) ─────────────────────────────────────────────

const pct = (v: number) => v / 100;

/** Tabela 4 — usos não residenciais (como a norma os escreve). */
export function usosNaoResidenciais(): string[] {
  return EQT_TABELA_4.linhas.map((l) => l.descricao);
}

/** Tabela 4 — FD de iluminação e tomadas de uso geral por uso não residencial, em degraus de kW. `null` = uso fora da tabela. */
export function fdIluminacaoTomadasNaoResidencial(uso: string): FdProgressivo | null {
  const l = EQT_TABELA_4.linhas.find((x) => x.descricao === uso);
  if (!l) return null;
  const degraus = degrausDeFaixasAcumuladas(l.faixas.map((f) => ({ de: f.de_kW, ate: f.ate_kW, fd: pct(f.fd_pct) })));
  return { degraus, literal: l.fator_demanda_rotulo, referencia: referenciaDe(EQT_TABELA_4) };
}

/**
 * Tabela 5, linha "Prédios Residenciais" — iluminação e tomadas de uso geral (soma das duas), em degraus de kW.
 * A linha "Unidades Consumidoras Residenciais" (FD por faixa da carga instalada) fica fora: a norma não diz se a faixa
 * vale para a carga inteira ou por degrau (perguntas novas do plano).
 */
export function fdIluminacaoTomadasPredioResidencial(): FdProgressivo {
  const linha = EQT_TABELA_5.linhas.find((l) => l.descricao === "Prédios Residenciais");
  if (!linha?.faixas) throw new Error("Tabela 5 da Equatorial sem a linha dos Prédios Residenciais.");
  const degraus = degrausDeFaixasAcumuladas(linha.faixas.map((f) => ({ de: f.de_kW, ate: f.ate_kW, fd: pct(f.fd_pct) })));
  return { degraus, literal: linha.fator_demanda_rotulo, referencia: referenciaDe(EQT_TABELA_5) };
}

export type GrupoEquipamentoEquatorial = "chuveiro" | "torneira_aquecedor_ferro" | "fogao" | "secadora_lava_louca_forno_microondas";

const COLUNA_T6: Record<GrupoEquipamentoEquatorial, "chuveiro_eletrico" | "torneira_aquecedor_ferro" | "fogao_eletrico" | "secadora_lava_louca_forno_microondas"> = {
  chuveiro: "chuveiro_eletrico",
  torneira_aquecedor_ferro: "torneira_aquecedor_ferro",
  fogao: "fogao_eletrico",
  secadora_lava_louca_forno_microondas: "secadora_lava_louca_forno_microondas",
};

/**
 * Tabela 6 — equipamentos de utilização específica por grupo e nº de aparelhos (o anexo B da spec manda esta tabela
 * para os grupos b1–b5). As faixas "56 a 65" e "65 a 75" se sobrepõem em 65: onde as duas linhas diferem (torneira,
 * aquecedor e ferro), 65 aparelhos fica sem sugestão.
 */
export function fdEquipamentoEspecifico(grupo: GrupoEquipamentoEquatorial, aparelhos: number): FdSugerido {
  const coluna = COLUNA_T6[grupo];
  const faixas = EQT_TABELA_6.linhas.map((l) => ({ de: l.n_aparelhos.de, ate: l.n_aparelhos.ate, valor: l[coluna] }));
  return fdDaFaixa(EQT_TABELA_6, faixas, aparelhos, { sobreposicaoAmbigua: true });
}

/** Linhas da Tabela 7 cujo "Acima de 61" deixa o 61 em aberto: esse número de aparelhos fica sem sugestão. */
const APARELHOS_PENDENTES_T7 = new Set([61]);

export type PotenciaDoAparelho = "ate_3_5_kW" | "maior_que_3_5_kW";

/** Tabela 7 — aparelhos de aquecimento e eletrodomésticos em geral, por nº de aparelhos e potência (até/acima de 3,5 kW). */
export function fdAquecimentoEletrodomesticos(potencia: PotenciaDoAparelho, aparelhos: number): FdSugerido {
  const faixas = EQT_TABELA_7.linhas.map((l) => ({ de: l.n_aparelhos.de, ate: l.n_aparelhos.ate, valor: l[potencia] }));
  return fdDaFaixa(EQT_TABELA_7, faixas, aparelhos, { pendentes: APARELHOS_PENDENTES_T7 });
}

export type UsoArCondicionadoEquatorial = "residenciais" | "comerciais";

/** Tabela 8 — ar-condicionado de edifícios (janela, split e chiller), pelo nº de aparelhos. */
export function fdArCondicionadoEdificio(uso: UsoArCondicionadoEquatorial, aparelhos: number): FdSugerido {
  const faixas = EQT_TABELA_8.linhas.map((l) => ({ de: l.n_aparelhos.de, ate: l.n_aparelhos.ate, valor: l[uso] }));
  return fdDaFaixa(EQT_TABELA_8, faixas, aparelhos);
}

/** Tabela 9 — ar-condicionado de residências individuais, pelo nº de aparelhos. */
export function fdArCondicionadoResidencia(aparelhos: number): FdSugerido {
  const faixas = EQT_TABELA_9.linhas.map((l) => ({ de: l.n_aparelhos.de, ate: l.n_aparelhos.ate, valor: l.fd }));
  return fdDaFaixa(EQT_TABELA_9, faixas, aparelhos);
}

/** Tabela 10 — motor-bomba de hidromassagem, pelo nº de aparelhos. */
export function fdHidromassagem(aparelhos: number): FdSugerido {
  const faixas = EQT_TABELA_10.linhas.map((l) => ({ de: l.n_aparelhos.de, ate: l.n_aparelhos.ate, valor: pct(l.fd_pct) }));
  return fdDaFaixa(EQT_TABELA_10, faixas, aparelhos);
}

/** Tabela 13 — motores: o maior e a soma dos restantes. */
export function fdMotores(): FdMaiorEDemais {
  const maior = EQT_TABELA_13.linhas.find((l) => /maior/i.test(l.motores));
  const demais = EQT_TABELA_13.linhas.find((l) => /restantes/i.test(l.motores));
  if (!maior || !demais) throw new Error("Tabela 13 da Equatorial sem o maior motor e os restantes.");
  return maiorEDemais(EQT_TABELA_13, 1, pct(maior.fd_pct), pct(demais.fd_pct));
}
