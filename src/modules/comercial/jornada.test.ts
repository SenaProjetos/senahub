import { describe, expect, it } from "vitest";
import type { EstagioNegociacao } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import {
  ESTAGIOS_ATIVOS,
  validarMovimento,
  exigeConcorrente,
  exigeMotivoPerda,
  probabilidadeDe,
  transicaoPermitida,
} from "./jornada";

/** Defaults semeados na F1.6 — a tabela real que o serviço vai injetar. */
const TABELA = {
  LEVANTAMENTO: 20,
  ORCAMENTO: 35,
  PROPOSTA_ENVIADA: 55,
  NEGOCIACAO: 75,
  CONTRATADO: 100,
} as const;

const TODOS: EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "CONTRATADO",
  "PERDIDO",
  "EM_ESPERA",
  "CANCELADO",
];

describe("transicaoPermitida — avanço no funil", () => {
  it("percorre o funil inteiro para frente", () => {
    expect(transicaoPermitida("LEVANTAMENTO", "ORCAMENTO")).toBe(true);
    expect(transicaoPermitida("ORCAMENTO", "PROPOSTA_ENVIADA")).toBe(true);
    expect(transicaoPermitida("PROPOSTA_ENVIADA", "NEGOCIACAO")).toBe(true);
    expect(transicaoPermitida("NEGOCIACAO", "CONTRATADO")).toBe(true);
  });

  it("permite voltar entre estágios ativos — cliente pede revisão", () => {
    expect(transicaoPermitida("PROPOSTA_ENVIADA", "ORCAMENTO")).toBe(true);
    expect(transicaoPermitida("NEGOCIACAO", "LEVANTAMENTO")).toBe(true);
  });
});

describe("transicaoPermitida — CONTRATADO exige proposta antes", () => {
  it("aceita a partir de PROPOSTA_ENVIADA e NEGOCIACAO", () => {
    expect(transicaoPermitida("PROPOSTA_ENVIADA", "CONTRATADO")).toBe(true);
    expect(transicaoPermitida("NEGOCIACAO", "CONTRATADO")).toBe(true);
  });

  it("recusa o atalho de LEVANTAMENTO/ORCAMENTO — criaria projeto sem proposta", () => {
    // A transição para CONTRATADO cria um Projeto (F5.9). Permitir o pulo faria nascer projeto
    // sem nenhuma proposta por trás — o buraco que a reforma existe para fechar.
    expect(transicaoPermitida("LEVANTAMENTO", "CONTRATADO")).toBe(false);
    expect(transicaoPermitida("ORCAMENTO", "CONTRATADO")).toBe(false);
  });
});

describe("transicaoPermitida — encerrar, pausar e reabrir", () => {
  it("qualquer ativo pode ser perdido, cancelado ou pausado", () => {
    for (const de of ESTAGIOS_ATIVOS) {
      expect(transicaoPermitida(de, "PERDIDO")).toBe(true);
      expect(transicaoPermitida(de, "CANCELADO")).toBe(true);
      expect(transicaoPermitida(de, "EM_ESPERA")).toBe(true);
    }
  });

  it("reabre o que foi perdido ou cancelado (ADR-10)", () => {
    expect(transicaoPermitida("PERDIDO", "NEGOCIACAO")).toBe(true);
    expect(transicaoPermitida("PERDIDO", "LEVANTAMENTO")).toBe(true);
    expect(transicaoPermitida("CANCELADO", "ORCAMENTO")).toBe(true);
  });

  it("retoma o que estava em espera", () => {
    expect(transicaoPermitida("EM_ESPERA", "NEGOCIACAO")).toBe(true);
  });

  it("reabrir vai para o funil, não para outro encerramento", () => {
    expect(transicaoPermitida("PERDIDO", "CANCELADO")).toBe(false);
    expect(transicaoPermitida("PERDIDO", "EM_ESPERA")).toBe(false);
    expect(transicaoPermitida("CANCELADO", "PERDIDO")).toBe(false);
    expect(transicaoPermitida("EM_ESPERA", "PERDIDO")).toBe(false);
  });
});

describe("transicaoPermitida — recusas", () => {
  it("CONTRATADO é o único terminal de verdade: não sai de lá", () => {
    // Já criou Projeto. Desfazer não é transição de estágio, é outra operação.
    for (const para of TODOS) {
      expect(transicaoPermitida("CONTRATADO", para)).toBe(false);
    }
  });

  it("estágio para ele mesmo nunca é transição", () => {
    for (const e of TODOS) {
      expect(transicaoPermitida(e, e)).toBe(false);
    }
  });
});

describe("exigeMotivoPerda", () => {
  it("PERDIDO exige motivo — sem ele o relatório da Fase 6 nasce vazio", () => {
    expect(exigeMotivoPerda("PERDIDO")).toBe(true);
  });

  it("nenhum outro estágio exige, inclusive CANCELADO", () => {
    for (const e of TODOS.filter((x) => x !== "PERDIDO")) {
      expect(exigeMotivoPerda(e)).toBe(false);
    }
  });
});

describe("exigeConcorrente", () => {
  it("segue o dado do catálogo, não uma lista no código", () => {
    expect(exigeConcorrente({ exigeConcorrente: true })).toBe(true);
    expect(exigeConcorrente({ exigeConcorrente: false })).toBe(false);
  });

  it("sem motivo escolhido, não exige", () => {
    expect(exigeConcorrente(null)).toBe(false);
    expect(exigeConcorrente(undefined)).toBe(false);
  });
});

describe("probabilidadeDe", () => {
  const base = { tabela: TABELA, override: false, atual: 42 };

  it("usa o default do estágio quando não há override", () => {
    expect(probabilidadeDe("LEVANTAMENTO", base)).toBe(20);
    expect(probabilidadeDe("ORCAMENTO", base)).toBe(35);
    expect(probabilidadeDe("PROPOSTA_ENVIADA", base)).toBe(55);
    expect(probabilidadeDe("NEGOCIACAO", base)).toBe(75);
    expect(probabilidadeDe("CONTRATADO", base)).toBe(100);
  });

  it("override congela o número — nenhuma transição recalcula (ADR-12)", () => {
    const comOverride = { ...base, override: true, atual: 90 };
    expect(probabilidadeDe("LEVANTAMENTO", comOverride)).toBe(90);
    expect(probabilidadeDe("NEGOCIACAO", comOverride)).toBe(90);
    expect(probabilidadeDe("CONTRATADO", comOverride)).toBe(90);
  });

  it("PERDIDO e CANCELADO zeram mesmo com override — forecast não pode mentir", () => {
    const comOverride = { ...base, override: true, atual: 90 };
    expect(probabilidadeDe("PERDIDO", comOverride)).toBe(0);
    expect(probabilidadeDe("CANCELADO", comOverride)).toBe(0);
    expect(probabilidadeDe("PERDIDO", base)).toBe(0);
  });

  it("EM_ESPERA mantém o valor: pausar não é perder", () => {
    expect(probabilidadeDe("EM_ESPERA", { ...base, atual: 55 })).toBe(55);
  });

  it("estágio sem linha na tabela mantém o atual, não inventa default", () => {
    // Banco novo com seed incompleto: chutar aqui recriaria o número mágico que o ADR-12 rejeita.
    expect(probabilidadeDe("NEGOCIACAO", { tabela: {}, override: false, atual: 33 })).toBe(33);
  });
});

describe("validarMovimento — guard que recusa ANTES de tocar o banco (F2.7)", () => {
  const motivoConcorrente = { exigeConcorrente: true };
  const motivoSimples = { exigeConcorrente: false };

  it("recusa transição inválida com mensagem que nomeia os dois estágios", () => {
    expect(() => validarMovimento({ de: "LEVANTAMENTO", para: "CONTRATADO" })).toThrow(ActionError);
    expect(() => validarMovimento({ de: "LEVANTAMENTO", para: "CONTRATADO" })).toThrow(
      /Levantamento.*Contratado/,
    );
  });

  it("recusa mover para o estágio em que já está", () => {
    expect(() => validarMovimento({ de: "NEGOCIACAO", para: "NEGOCIACAO" })).toThrow(/já está/i);
  });

  it("PERDIDO sem motivo é recusado", () => {
    expect(() => validarMovimento({ de: "NEGOCIACAO", para: "PERDIDO" })).toThrow(
      /motivo da perda/i,
    );
  });

  it("PERDIDO com motivo passa", () => {
    expect(() =>
      validarMovimento({
        de: "NEGOCIACAO",
        para: "PERDIDO",
        motivoPerdaId: "m1",
        motivo: motivoSimples,
      }),
    ).not.toThrow();
  });

  it("motivo que exige concorrente sem o nome é recusado", () => {
    expect(() =>
      validarMovimento({
        de: "NEGOCIACAO",
        para: "PERDIDO",
        motivoPerdaId: "m1",
        motivo: motivoConcorrente,
      }),
    ).toThrow(/concorrente/i);
  });

  it("espaço em branco não conta como concorrente informado", () => {
    expect(() =>
      validarMovimento({
        de: "NEGOCIACAO",
        para: "PERDIDO",
        motivoPerdaId: "m1",
        concorrente: "   ",
        motivo: motivoConcorrente,
      }),
    ).toThrow(/concorrente/i);
  });

  it("com concorrente informado, passa", () => {
    expect(() =>
      validarMovimento({
        de: "NEGOCIACAO",
        para: "PERDIDO",
        motivoPerdaId: "m1",
        concorrente: "Concorrente X",
        motivo: motivoConcorrente,
      }),
    ).not.toThrow();
  });

  it("movimento válido comum não lança", () => {
    expect(() => validarMovimento({ de: "ORCAMENTO", para: "PROPOSTA_ENVIADA" })).not.toThrow();
  });
});

/**
 * F5.9 — o aceite de proposta move a negociação para CONTRATADO por um caminho próprio.
 *
 * A regra normal exige vir de PROPOSTA_ENVIADA/NEGOCIACAO, e o motivo está escrito na própria
 * `jornada.ts`: "deixar LEVANTAMENTO → CONTRATADO passar significaria projeto nascendo sem
 * nenhuma proposta por trás". No aceite essa premissa está satisfeita por construção — a
 * proposta É o gatilho. O que a exceção NÃO afrouxa são os estágios terminais.
 */
describe("transicaoPermitida — porAceiteDeProposta (F5.9)", () => {
  const porAceite = { porAceiteDeProposta: true };

  it("de qualquer estágio ATIVO vai a CONTRATADO quando é aceite de proposta", () => {
    for (const de of ["LEVANTAMENTO", "ORCAMENTO", "PROPOSTA_ENVIADA", "NEGOCIACAO"] as const) {
      expect(transicaoPermitida(de, "CONTRATADO", porAceite)).toBe(true);
    }
  });

  it("EM_ESPERA também aceita — a pausa não invalida a proposta que o cliente assinou", () => {
    expect(transicaoPermitida("EM_ESPERA", "CONTRATADO", porAceite)).toBe(true);
  });

  it("SEM a flag, LEVANTAMENTO/ORCAMENTO continuam recusados (a regra do board não mudou)", () => {
    expect(transicaoPermitida("LEVANTAMENTO", "CONTRATADO")).toBe(false);
    expect(transicaoPermitida("ORCAMENTO", "CONTRATADO")).toBe(false);
  });

  it("PERDIDO e CANCELADO seguem recusados MESMO no aceite — ali a inconsistência é real", () => {
    expect(transicaoPermitida("PERDIDO", "CONTRATADO", porAceite)).toBe(false);
    expect(transicaoPermitida("CANCELADO", "CONTRATADO", porAceite)).toBe(false);
  });

  it("já CONTRATADO segue recusado (não se aceita duas vezes)", () => {
    expect(transicaoPermitida("CONTRATADO", "CONTRATADO", porAceite)).toBe(false);
  });

  it("a flag não afrouxa transição nenhuma que não seja para CONTRATADO", () => {
    expect(transicaoPermitida("CONTRATADO", "ORCAMENTO", porAceite)).toBe(false);
  });

  it("validarMovimento dá mensagem específica de aceite quando recusa", () => {
    expect(() =>
      validarMovimento({ de: "PERDIDO", para: "CONTRATADO", porAceiteDeProposta: true }),
    ).toThrow(/aceitar a proposta/i);
  });

  it("validarMovimento passa para negociação em orçamento quando é aceite", () => {
    expect(() =>
      validarMovimento({ de: "ORCAMENTO", para: "CONTRATADO", porAceiteDeProposta: true }),
    ).not.toThrow();
  });
});
