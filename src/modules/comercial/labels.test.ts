import { describe, it, expect } from "vitest";
import {
  STATUS_COMERCIAL_LABEL,
  STATUS_PROSPECCAO_LABEL,
  ESTAGIO_NEGOCIACAO_LABEL,
  TEMPERATURA_LABEL,
  STATUS_PROPOSTA_LABEL,
  TIPO_ATIVIDADE_LABEL,
  TIPO_PROXIMA_ACAO_LABEL,
  TIPO_ANCORA_COMPROMISSO_LABEL,
  STATUS_RELACIONAMENTO_CONTATO_LABEL,
  BASE_LEGAL_LGPD_LABEL,
  opcoesDe,
} from "./labels";

/**
 * A exaustividade real é garantida pelo `satisfies Record<Enum, string>` em labels.ts — falta de
 * valor quebra a COMPILAÇÃO, não o teste. O que se testa aqui é o que o compilador não pega:
 * contagem (bate com 02-schema.md), rótulo vazio, e que ninguém deixou o identificador cru.
 */

const MAPAS = {
  STATUS_COMERCIAL_LABEL,
  STATUS_PROSPECCAO_LABEL,
  ESTAGIO_NEGOCIACAO_LABEL,
  TEMPERATURA_LABEL,
  STATUS_PROPOSTA_LABEL,
  TIPO_ATIVIDADE_LABEL,
  TIPO_PROXIMA_ACAO_LABEL,
  TIPO_ANCORA_COMPROMISSO_LABEL,
  STATUS_RELACIONAMENTO_CONTATO_LABEL,
  BASE_LEGAL_LGPD_LABEL,
} as const;

describe("labels do CRM", () => {
  it("tem a quantidade de valores que o schema alvo define", () => {
    // Números conferidos contra os enums de docs/crm/02-schema.md.
    expect(Object.keys(STATUS_COMERCIAL_LABEL)).toHaveLength(4);
    expect(Object.keys(STATUS_PROSPECCAO_LABEL)).toHaveLength(8);
    expect(Object.keys(ESTAGIO_NEGOCIACAO_LABEL)).toHaveLength(8);
    expect(Object.keys(TEMPERATURA_LABEL)).toHaveLength(3);
    expect(Object.keys(STATUS_PROPOSTA_LABEL)).toHaveLength(5);
    expect(Object.keys(TIPO_ATIVIDADE_LABEL)).toHaveLength(8);
    expect(Object.keys(TIPO_PROXIMA_ACAO_LABEL)).toHaveLength(12);
    expect(Object.keys(TIPO_ANCORA_COMPROMISSO_LABEL)).toHaveLength(3);
    expect(Object.keys(STATUS_RELACIONAMENTO_CONTATO_LABEL)).toHaveLength(3);
    expect(Object.keys(BASE_LEGAL_LGPD_LABEL)).toHaveLength(1);
  });

  it("nenhum rótulo vazio ou só espaço", () => {
    for (const [nomeMapa, mapa] of Object.entries(MAPAS)) {
      for (const [chave, rotulo] of Object.entries(mapa)) {
        expect(rotulo.trim(), `${nomeMapa}.${chave} está vazio`).not.toBe("");
      }
    }
  });

  it("nenhum rótulo é o identificador cru (esqueceram de traduzir)", () => {
    for (const [nomeMapa, mapa] of Object.entries(MAPAS)) {
      for (const [chave, rotulo] of Object.entries(mapa)) {
        expect(rotulo, `${nomeMapa}.${chave} não foi traduzido`).not.toBe(chave);
      }
    }
  });

  it("rótulos não têm underscore — identificador vaza pro usuário", () => {
    for (const [nomeMapa, mapa] of Object.entries(MAPAS)) {
      for (const [chave, rotulo] of Object.entries(mapa)) {
        expect(rotulo, `${nomeMapa}.${chave} parece identificador`).not.toMatch(/_/);
      }
    }
  });

  it("traduz os valores que a UI mais mostra", () => {
    expect(STATUS_PROSPECCAO_LABEL.CONTATO_INICIADO).toBe("Contato iniciado");
    expect(ESTAGIO_NEGOCIACAO_LABEL.PROPOSTA_ENVIADA).toBe("Proposta enviada");
    expect(STATUS_PROPOSTA_LABEL.em_negociacao).toBe("Em negociação");
    expect(TIPO_PROXIMA_ACAO_LABEL.COBRAR_ARQUITETURA).toBe("Cobrar arquitetura");
  });
});

describe("opcoesDe", () => {
  it("preserva a ordem de declaração — que é a do funil, não alfabética", () => {
    const o = opcoesDe(ESTAGIO_NEGOCIACAO_LABEL);
    expect(o.map((x) => x.value).slice(0, 5)).toEqual([
      "LEVANTAMENTO",
      "ORCAMENTO",
      "PROPOSTA_ENVIADA",
      "NEGOCIACAO",
      "CONTRATADO",
    ]);
  });

  it("devolve value/label prontos para o Select", () => {
    expect(opcoesDe(TEMPERATURA_LABEL)).toEqual([
      { value: "FRIO", label: "Frio" },
      { value: "MORNO", label: "Morno" },
      { value: "QUENTE", label: "Quente" },
    ]);
  });
});
