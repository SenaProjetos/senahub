/**
 * Mensagens da Calculadora de cargas e demanda — **puro**. Texto EXATO da spec §6 ("Mensagem na tela"):
 * a tela nunca cita norma, edição ou item, com uma única exceção (`edicao_a_confirmar`). A coluna "Referência"
 * da spec vai em `referencia`, lida SÓ pelo relatório.
 *
 * Decisão do dono (Fase 0, 2026-11-10): quando a planilha de casos cita a norma no texto (casos 13 e 18), vale a
 * spec §6 — sem norma na tela.
 */

import { fmt2, fmtInteiro } from "./numeros";

export type TipoMensagem = "recusa" | "alerta" | "informativo";

export type Mensagem = {
  id: IdMensagem;
  tipo: TipoMensagem;
  /** O que aparece na tela. */
  texto: string;
  /** Só no relatório. `null` = a spec não traz referência ("—"). */
  referencia: string | null;
};

type Def = { tipo: TipoMensagem; referencia: string | null };

const DEFS = {
  campo_obrigatorio: { tipo: "recusa", referencia: "regra da casa" },
  area_invalida: { tipo: "recusa", referencia: null },
  fp_invalido: { tipo: "recusa", referencia: null },
  apartamentos_invalido: { tipo: "recusa", referencia: null },
  quantidade_escopo_invalida: { tipo: "recusa", referencia: null },
  temperatura_fora_tabela: { tipo: "recusa", referencia: "NBR 5410, Tabela 40" },
  calculo_sem_escopo: { tipo: "alerta", referencia: null },
  cmd_sem_medidores: { tipo: "alerta", referencia: null },
  cmd_acima_capacidade: { tipo: "alerta", referencia: null },
  apartamentos_sem_cmd: { tipo: "alerta", referencia: null },
  apartamentos_a_mais: { tipo: "alerta", referencia: null },
  calculo_em_varios_cmd: { tipo: "alerta", referencia: null },
  levantamento_alterado: { tipo: "alerta", referencia: null },
  valor_editado: { tipo: "informativo", referencia: null },
  fp_em_branco_total: { tipo: "informativo", referencia: null },
  perimetro_incompativel: { tipo: "alerta", referencia: null },
  atividade_nao_listada: { tipo: "informativo", referencia: "NBR ISO/CIE 8995-1" },
  iluminancia_abaixo: { tipo: "alerta", referencia: "NBR ISO/CIE 8995-1" },
  iluminacao_abaixo_minimo: { tipo: "alerta", referencia: "NBR 5410, 9.5.2.1.2" },
  tug_abaixo_minimo: { tipo: "alerta", referencia: "NBR 5410, 9.5.2.2.1" },
  potencia_tomada_abaixo_minimo: { tipo: "alerta", referencia: "NBR 5410, 9.5.2.2.2" },
  valor_abaixo_norma: { tipo: "alerta", referencia: "anexos" },
  apart_hotel_area_util: { tipo: "alerta", referencia: "NT.00004, 6.11.8" },
  fator_combinado_baixo: { tipo: "alerta", referencia: "calculadora existente" },
  linha_enterrada: { tipo: "alerta", referencia: "NBR 5410, Tabela 40" },
  corrente_acima_serie: { tipo: "alerta", referencia: "item 4.5" },
  secao_digitada_menor: { tipo: "alerta", referencia: "NBR 5410, Tabelas 36 a 39" },
  secao_abaixo_minima: { tipo: "alerta", referencia: "NBR 5410, Tabela 47" },
  norma_vigencia_futura: { tipo: "alerta", referencia: "anexos B e G" },
  edicao_a_confirmar: { tipo: "alerta", referencia: "normas marcadas \"edição a confirmar\"" },
  metodo_outra_concessionaria: { tipo: "alerta", referencia: "anexo F e Copel" },
  tipo_atendimento: { tipo: "informativo", referencia: "anexos" },
  subestacao_espaco: { tipo: "informativo", referencia: "anexos" },
  recarga_acima_gatilho: { tipo: "alerta", referencia: "anexos" },
  seletividade_copel: { tipo: "informativo", referencia: "anexo E" },
  escopo_secao_cabo: { tipo: "informativo", referencia: "decisão do usuário" },
  responsavel_nao_preenchido: { tipo: "alerta", referencia: null },
} as const satisfies Record<string, Def>;

export type IdMensagem = keyof typeof DEFS;

function m(id: IdMensagem, texto: string, referencia?: string | null): Mensagem {
  const d: Def = DEFS[id];
  return { id, tipo: d.tipo, texto, referencia: referencia === undefined ? d.referencia : referencia };
}

/** Construtores, um por linha da spec §6. Os parâmetros vêm já calculados; a formatação é a da tela (2 casas). */
export const MSG = {
  campoObrigatorio: (campo: string) =>
    m("campo_obrigatorio", `Informe o valor de ${campo}. Não há valor padrão para esta concessionária.`),
  areaInvalida: () => m("area_invalida", "Área inválida. Informe um valor maior que zero (m²)."),
  fpInvalido: () => m("fp_invalido", "Fator de potência inválido. Informe um valor maior que 0 e até 1."),
  apartamentosInvalido: () =>
    m("apartamentos_invalido", "Número de apartamentos inválido. Informe um número inteiro maior que zero."),
  quantidadeEscopoInvalida: () =>
    m("quantidade_escopo_invalida", "Quantidade inválida. Informe um número inteiro maior ou igual a 1."),
  temperaturaForaTabela: () =>
    m(
      "temperatura_fora_tabela",
      "Temperatura fora da tabela para esta isolação. Informe um FCT manualmente ou escolha outra isolação.",
    ),
  calculoSemEscopo: () => m("calculo_sem_escopo", "Este cálculo não tem escopo. Escolha o levantamento ou digite as cargas."),
  cmdSemMedidores: () => m("cmd_sem_medidores", "Este CMD não tem medidores. Adicione ao menos um."),
  cmdAcimaCapacidade: (medidores: number, capacidade: number) =>
    m("cmd_acima_capacidade", `O CMD tem ${fmtInteiro(medidores)} medidores; a capacidade informada é ${fmtInteiro(capacidade)}.`),
  apartamentosSemCmd: (n: number) => m("apartamentos_sem_cmd", `Há ${fmtInteiro(n)} apartamentos sem CMD.`),
  apartamentosAMais: (n: number) =>
    m("apartamentos_a_mais", `Há ${fmtInteiro(n)} apartamentos a mais nos CMDs do que no cálculo.`),
  calculoEmVariosCmd: (nome: string) => m("calculo_em_varios_cmd", `O cálculo ${nome} está em mais de um CMD.`),
  levantamentoAlterado: () =>
    m("levantamento_alterado", "O levantamento foi alterado depois de trazer os valores. Atualize o cálculo."),
  valorEditado: () => m("valor_editado", "Valor diferente do levantamento."),
  fpEmBrancoTotal: () =>
    m("fp_em_branco_total", "A soma aparece quando os FP de todas as linhas estiverem preenchidos."),
  perimetroIncompativel: () =>
    m("perimetro_incompativel", "Perímetro incompatível com a área informada. Confira os valores."),
  atividadeNaoListada: () =>
    m("atividade_nao_listada", "Atividade não listada. Adote o valor de situação similar ou digite o Em."),
  iluminanciaAbaixo: () => m("iluminancia_abaixo", "Iluminância final inferior ao mínimo da atividade."),
  iluminacaoAbaixoMinimo: (minimoVA: number) =>
    m("iluminacao_abaixo_minimo", `Carga de iluminação inferior ao mínimo (${fmt2(minimoVA)} VA).`),
  tugAbaixoMinimo: (minimo: number) => m("tug_abaixo_minimo", `Quantidade de tomadas inferior ao mínimo (${fmtInteiro(minimo)}).`),
  potenciaTomadaAbaixoMinimo: (minimoVA: number) =>
    m("potencia_tomada_abaixo_minimo", `Potência por tomada inferior ao mínimo (${fmt2(minimoVA)} VA).`),
  /** `referencia` = norma e item do critério (ex.: "ND-5.2, 7.2"), só no relatório. */
  valorAbaixoNorma: (digitado: number, concessionaria: string, criterio: number, referencia: string) =>
    m(
      "valor_abaixo_norma",
      `O valor digitado (${fmt2(digitado)}) é inferior ao critério da ${concessionaria} (${fmt2(criterio)}). Mantido como digitado.`,
      referencia,
    ),
  apartHotelAreaUtil: () =>
    m("apart_hotel_area_util", "Para apart-hotel, esta concessionária usa carga instalada, e não área útil."),
  fatorCombinadoBaixo: () =>
    m("fator_combinado_baixo", "Fator de correção combinado abaixo de 0,5. Verifique as condições de instalação."),
  linhaEnterrada: () =>
    m("linha_enterrada", "Linha enterrada: use a coluna do solo da tabela de fator de temperatura (referência 20 °C)."),
  correnteAcimaSerie: () =>
    m("corrente_acima_serie", "Corrente acima da série cadastrada (1.600 A). Informe o disjuntor adotado."),
  secaoDigitadaMenor: () =>
    m("secao_digitada_menor", "A seção digitada é menor que a calculada para a corrente corrigida."),
  secaoAbaixoMinima: (minimoMm2: number) =>
    m("secao_abaixo_minima", `Seção inferior ao mínimo (${fmt2(minimoMm2)} mm²).`),
  /** `data` já no formato da tela (dd/mm/aaaa ou mês/ano, como a norma escreve). */
  normaVigenciaFutura: (data: string, referencia: string) =>
    m("norma_vigencia_futura", `Esta norma vale a partir de ${data}. Confirme os valores.`, referencia),
  /** A ÚNICA mensagem de tela que cita norma e edição (spec §3.2 e §6). */
  edicaoAConfirmar: (norma: string, ano: string) =>
    m("edicao_a_confirmar", `Esta calculadora usa a ${norma}, edição ${ano}. Confira se é a edição vigente.`, norma),
  metodoOutraConcessionaria: (concessionaria: string, referencia: string) =>
    m(
      "metodo_outra_concessionaria",
      `Método de referência de outra concessionária; não exigido por ${concessionaria}.`,
      referencia,
    ),
  tipoAtendimento: (demandaKVA: number, nivel: "baixa tensão" | "média tensão" | string, referencia: string) =>
    m(
      "tipo_atendimento",
      `Pela demanda calculada (${fmt2(demandaKVA)} kVA), o atendimento esperado é em ${nivel}. Confira com a concessionária.`,
      referencia,
    ),
  subestacaoEspaco: (subestacao: string, referencia: string) =>
    m(
      "subestacao_espaco",
      `Pela demanda calculada, o atendimento esperado é ${subestacao}, com previsão de espaço para transformador. Confira com a concessionária.`,
      referencia,
    ),
  recargaAcimaGatilho: (gatilhoKW: number, exigencia: string, referencia: string) =>
    m(
      "recarga_acima_gatilho",
      `Potência de recarga acima de ${fmt2(gatilhoKW)} kW: a concessionária exige ${exigencia}.`,
      referencia,
    ),
  seletividadeCopel: () =>
    m(
      "seletividade_copel",
      "Considere corrente de dimensionamento não inferior à de 26 kVA mais a demanda do condomínio.",
    ),
  escopoSecaoCabo: () =>
    m(
      "escopo_secao_cabo",
      "Seção sugerida pela capacidade de condução, sem queda de tensão. Verificar no projeto básico.",
    ),
  responsavelNaoPreenchido: () =>
    m(
      "responsavel_nao_preenchido",
      "Responsável técnico e CREA não preenchidos. O relatório sai marcado como não conferido.",
    ),
} as const;
