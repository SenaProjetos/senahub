/**
 * Avisos de atendimento (spec §5 passo 25, §6 "Tipo de atendimento" e "Subestação e espaço") — **puro**.
 * Compara a demanda do nível (e, quando a norma pede, a carga instalada) com os limites da concessionária. Todo limite
 * é LIDO do trecho literal da biblioteca (`lerDoTrecho`); trecho que não casa = erro de carregamento.
 * Limite em kW comparado direto com a demanda em kVA (decisão da Fase 0: a favor da segurança; nota no relatório).
 *
 * Cemig: faixas do texto da ND-5.2, 4.4.1.1 a 4.4.1.4 (resposta do engenheiro à Q6, 2026-11-12).
 * Copel: sem aviso — o atendimento fica a cargo do projetista, na norma (Q24). Enel: sem biblioteca (Q23).
 * Fora por enquanto: Energisa abaixo de 276 kW (6.7.3 não lida a fundo, Q7 = esperar a leitura do engenheiro) e o
 * aviso de alta tensão acima de 2.500 kW para Celesc e Copel (Q29 B: falta a REN 1000/2021 na biblioteca).
 */

import { CELESC_N3210003_TRECHOS } from "./biblioteca/celesc-n3210003-trechos";
import { CEMIG_ND52_TRECHOS } from "./biblioteca/cemig";
import { ENERGISA_NDU003_TRECHOS } from "./biblioteca/energisa-ndu003-trechos";
import { EQT_NT00004_TRECHOS } from "./biblioteca/equatorial";
import { DIS_NOR_053, DIS_NOR_066, NEO_TRECHOS } from "./biblioteca/neoenergia";
import type { IdConcessionaria } from "./composicao";
import { lerDoTrecho } from "./concessionarias/texto";
import { MSG, type Mensagem } from "./mensagens";

/** Uso da edificação, para os limites que mudam com ele (Neoenergia: 300 kVA residencial, 225 kVA comercial ou misto). */
export type UsoDaEdificacao = "residencial" | "comercial" | "misto";

export type EntradaAtendimento = {
  demandaKVA: number;
  /** Carga instalada do nível, quando conhecida (Equatorial: baixa tensão até 75 kW de carga instalada). */
  cargaInstaladaKW?: number | null;
  uso?: UsoDaEdificacao;
};

export type Atendimento = {
  /** Nível de tensão esperado, como aparece na mensagem; `null` = a norma não permite dizer com os dados do nível. */
  nivel: string | null;
  mensagens: Mensagem[];
};

const neo = (fonte: typeof DIS_NOR_053, t: { item: string; pagina: number; texto: string }) => [{ fonte, ...t }];

const NEO_AT = lerDoTrecho(neo(DIS_NOR_066, NEO_TRECHOS.at066), "5.2", /no mínimo, igual a ([\d.]+) kW.*?tensão igual ou superior a (\d+) kV/);
const NEO_BT = lerDoTrecho(neo(DIS_NOR_053, NEO_TRECHOS.bt624), "6.2.4", /menor ou igual a (\d+) kVA para edificações de múltiplas unidades consumidoras residenciais e (\d+) kVA para edificações de múltiplas unidades consumidoras comerciais ou mistas/);
const NEO_ABRIGADO = lerDoTrecho(neo(DIS_NOR_053, NEO_TRECHOS.anexoITrafoAbrigado), "Anexo I", /superar (\d+) kVA para edificações de múltiplas unidades consumidoras residenciais e (\d+) kVA/);

const EQT_BT = lerDoTrecho(EQT_NT00004_TRECHOS, "5.15.1", /carga instalada na unidade consumidora for igual ou inferior a (\d+) kW/);
const EQT_MT = lerDoTrecho(EQT_NT00004_TRECHOS, "5.15.2", /for igual ou inferior a ([\d.]+) kW/);
const EQT_AT = lerDoTrecho(EQT_NT00004_TRECHOS, "5.15.6", /for superior a ([\d.]+) kW/);

const CELESC_BT = lerDoTrecho(CELESC_N3210003_TRECHOS, "5.3.4", /demanda provável de até (\d+) kVA pode ser atendido em baixa tensão/);
const CELESC_MT = lerDoTrecho(CELESC_N3210003_TRECHOS, "5.3.4", /demanda provável maior que (\d+) kVA.*?deve ser reservado o espaço físico necessário para construção, às expensas do interessado, de subestação abrigada/);

const CEMIG_BT_AEREO = lerDoTrecho(CEMIG_ND52_TRECHOS, "4.4.1.1", /Demanda igual ou inferior a (\d+)kVA/);
const CEMIG_BT_SUBTERRANEO = lerDoTrecho(CEMIG_ND52_TRECHOS, "4.4.1.2", /Demanda entre (\d+) e (\d+)kVA/);
const CEMIG_CAMARA = lerDoTrecho(CEMIG_ND52_TRECHOS, "4.4.1.3", /Demanda entre (\d+) e (\d+)kVA/);
const CEMIG_ESPECIAL = lerDoTrecho(CEMIG_ND52_TRECHOS, "4.4.1.4", /Demanda Superior a (\d+)kVA/);

const ENERGISA_SUBESTACAO = lerDoTrecho(ENERGISA_NDU003_TRECHOS, "6.7.4", /demanda entre (\d+) kW e ([\d.]+) kW.*?Subestações Aéreas.*?Subestação abrigada/);

const tipo = (demanda: number, nivel: string, referencia: string): Atendimento => ({
  nivel,
  mensagens: [MSG.tipoAtendimento(demanda, nivel, referencia)],
});

/** Passo 25 — avisos de atendimento do nível. */
export function avisosDeAtendimento(c: IdConcessionaria | "enel", e: EntradaAtendimento): Atendimento {
  const d = e.demandaKVA;
  switch (c) {
    case "neoenergia": {
      const [limiteAT, kv] = NEO_AT.valores;
      if (d >= limiteAT) return tipo(d, `tensão de ${kv} kV ou mais`, NEO_AT.referencia);
      const [btRes, btCom] = NEO_BT.valores;
      const limite = e.uso === "comercial" || e.uso === "misto" ? btCom : btRes;
      if (d <= limite) return tipo(d, "baixa tensão", NEO_BT.referencia);
      const r = tipo(d, "média tensão", NEO_BT.referencia);
      const [abRes, abCom] = NEO_ABRIGADO.valores;
      if (d > (e.uso === "comercial" || e.uso === "misto" ? abCom : abRes)) {
        r.mensagens.push(MSG.subestacaoEspaco("subestação abrigada", NEO_ABRIGADO.referencia));
      }
      return r;
    }
    case "equatorial": {
      if (d > EQT_AT.valores[0]) return tipo(d, "alta tensão", EQT_AT.referencia);
      // Baixa tensão depende da CARGA INSTALADA (≤ 75 kW). A demanda nunca passa da carga instalada: demanda acima do
      // limite já garante carga acima dele; abaixo, sem a carga instalada, a norma não permite dizer.
      const ci = e.cargaInstaladaKW ?? (d > EQT_BT.valores[0] ? d : null);
      if (ci == null) return { nivel: null, mensagens: [] };
      if (ci <= EQT_BT.valores[0]) return tipo(d, "baixa tensão", EQT_BT.referencia);
      if (d <= EQT_MT.valores[0]) return tipo(d, "média tensão", EQT_MT.referencia);
      return tipo(d, "alta tensão", EQT_AT.referencia);
    }
    case "celesc": {
      if (d <= CELESC_BT.valores[0]) return tipo(d, "baixa tensão", CELESC_BT.referencia);
      const r = tipo(d, "média tensão", CELESC_MT.referencia);
      if (d > CELESC_MT.valores[0]) r.mensagens.push(MSG.subestacaoEspaco("subestação abrigada", CELESC_MT.referencia));
      return r;
    }
    case "cemig": {
      if (d <= CEMIG_BT_AEREO.valores[0]) return tipo(d, "baixa tensão, ramal de conexão aéreo", CEMIG_BT_AEREO.referencia);
      if (d <= CEMIG_BT_SUBTERRANEO.valores[1]) return tipo(d, "baixa tensão, ramal de conexão subterrâneo", CEMIG_BT_SUBTERRANEO.referencia);
      if (d <= CEMIG_CAMARA.valores[1]) return tipo(d, "câmara transformadora ou equipamento em pedestal", CEMIG_CAMARA.referencia);
      if (d > CEMIG_ESPECIAL.valores[0]) return tipo(d, "projeto especial da Cemig", CEMIG_ESPECIAL.referencia);
      return { nivel: null, mensagens: [] };
    }
    case "energisa": {
      const [de, ate] = ENERGISA_SUBESTACAO.valores;
      if (d >= de && d <= ate) {
        return { nivel: null, mensagens: [MSG.subestacaoEspaco("subestação aérea ou abrigada", ENERGISA_SUBESTACAO.referencia)] };
      }
      return { nivel: null, mensagens: [] };
    }
    case "copel":
    case "enel":
      return { nivel: null, mensagens: [] };
  }
}
