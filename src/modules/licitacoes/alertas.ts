import { diasRestantes } from "@/modules/licitacoes/eventos/alertas";

export type HabilitacaoParaAlerta = {
  itemId: string;
  sessaoId: string;
  sessaoISO: string;
  /** Override da sessão; vazio usa o calendário padrão de datas-chave. */
  alertaDias: number[];
  certidaoValidadeISO: string;
  atendido: boolean;
};

export type AlertaHabilitacao = {
  itemId: string;
  sessaoId: string;
  dias: number;
};

function diasAlertaValidos(dias: readonly number[]): number[] {
  return [
    ...new Set(
      dias.filter((dia) => Number.isInteger(dia) && dia >= 0),
    ),
  ];
}

/**
 * Encontra certidões vinculadas à habilitação que não estarão válidas na
 * sessão. O disparo segue os mesmos D-n configurados para datas-chave.
 *
 * Validade igual à data da sessão ainda é válida, em paridade com
 * `itemAtendido`.
 */
export function habilitacoesParaNotificar(
  itens: HabilitacaoParaAlerta[],
  hojeISO: string,
  padraoDias: number[],
): AlertaHabilitacao[] {
  const alertas: AlertaHabilitacao[] = [];
  const padraoValido = diasAlertaValidos(padraoDias);

  for (const item of itens) {
    if (item.atendido) continue;
    if (item.certidaoValidadeISO >= item.sessaoISO) continue;

    const dias = diasRestantes(hojeISO, item.sessaoISO);
    const calendario = item.alertaDias.length > 0
      ? diasAlertaValidos(item.alertaDias)
      : padraoValido;
    if (dias < 0 || !calendario.includes(dias)) continue;

    alertas.push({
      itemId: item.itemId,
      sessaoId: item.sessaoId,
      dias,
    });
  }

  return alertas;
}

export type ContratoParaAlerta = {
  contratoId: string;
  vigenciaFimISO: string | null;
  garantiaValidadeISO: string | null;
};

export type TipoVencimentoContrato = "vigencia" | "garantia";

export type AlertaVencimentoContrato = {
  contratoId: string;
  tipo: TipoVencimentoContrato;
  dataISO: string;
  dias: number;
};

export type AditivoParaVigencia = {
  tipo: string;
  novaVigenciaISO: string | null;
  dataISO: string;
  createdAtISO: string;
};

/**
 * A vigência informada no último aditivo de prazo prevalece sobre a data-base
 * do contrato. Para aditivos na mesma data, o criado por último vence.
 */
export function vigenciaEfetivaContrato(
  vigenciaFimISO: string | null,
  aditivos: AditivoParaVigencia[],
): string | null {
  let maisRecente: AditivoParaVigencia | null = null;

  for (const aditivo of aditivos) {
    if (
      (aditivo.tipo !== "prazo" && aditivo.tipo !== "valor_prazo")
      || !aditivo.novaVigenciaISO
    ) {
      continue;
    }

    if (
      !maisRecente
      || aditivo.dataISO > maisRecente.dataISO
      || (
        aditivo.dataISO === maisRecente.dataISO
        && aditivo.createdAtISO > maisRecente.createdAtISO
      )
    ) {
      maisRecente = aditivo;
    }
  }

  return maisRecente?.novaVigenciaISO ?? vigenciaFimISO;
}

export function verboVencimentoCertidao(
  certidaoValidadeISO: string,
  hojeISO: string,
): "venceu em" | "vence em" {
  return certidaoValidadeISO < hojeISO ? "venceu em" : "vence em";
}

/** Vencimentos contratuais que caem em um dos D-n configurados. */
export function vencimentosContratoParaNotificar(
  contratos: ContratoParaAlerta[],
  hojeISO: string,
  padraoDias: number[],
): AlertaVencimentoContrato[] {
  const alertas: AlertaVencimentoContrato[] = [];

  for (const contrato of contratos) {
    const datas: { tipo: TipoVencimentoContrato; dataISO: string | null }[] = [
      { tipo: "vigencia", dataISO: contrato.vigenciaFimISO },
      { tipo: "garantia", dataISO: contrato.garantiaValidadeISO },
    ];

    for (const data of datas) {
      if (!data.dataISO) continue;

      const dias = diasRestantes(hojeISO, data.dataISO);
      if (dias < 0 || !padraoDias.includes(dias)) continue;

      alertas.push({
        contratoId: contrato.contratoId,
        tipo: data.tipo,
        dataISO: data.dataISO,
        dias,
      });
    }
  }

  return alertas;
}
