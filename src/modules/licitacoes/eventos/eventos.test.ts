import { describe, it, expect } from "vitest";
import {
  isTipoEvento,
  isAutoria,
  ehRecurso,
  textoEventoHistorico,
  TIPO_EVENTO_LICITACAO,
  TIPO_EVENTO_LABEL,
} from "./eventos";

describe("isTipoEvento", () => {
  it("reconhece um tipo válido", () => {
    expect(isTipoEvento("sessao")).toBe(true);
  });

  it("rejeita string fora do conjunto", () => {
    expect(isTipoEvento("xpto")).toBe(false);
  });
});

describe("isAutoria", () => {
  it("reconhece autoria válida", () => {
    expect(isAutoria("propria")).toBe(true);
  });

  it("rejeita autoria desconhecida", () => {
    expect(isAutoria("x")).toBe(false);
  });
});

describe("ehRecurso", () => {
  it("classifica impugnacao como recurso", () => {
    expect(ehRecurso("impugnacao")).toBe(true);
  });

  it("não classifica abertura como recurso", () => {
    expect(ehRecurso("abertura")).toBe(false);
  });
});

describe("textoEventoHistorico", () => {
  it("formata texto de registrado com data BR", () => {
    expect(textoEventoHistorico("sessao", "2026-06-20", "registrado")).toBe(
      "Evento 'Sessão' (20/06/2026) registrado.",
    );
  });

  it("formata texto de atualizado com data BR", () => {
    expect(textoEventoHistorico("recurso", "2026-07-01", "atualizado")).toBe(
      "Evento 'Recurso' (01/07/2026) atualizado.",
    );
  });

  it("formata texto de concluído sem data", () => {
    expect(textoEventoHistorico("sessao", "2026-06-20", "concluído")).toBe(
      "Evento 'Sessão' concluído.",
    );
  });

  it("formata texto de removido sem data", () => {
    expect(textoEventoHistorico("impugnacao", "2026-06-20", "removido")).toBe(
      "Evento 'Impugnação' removido.",
    );
  });
});

describe("TIPO_EVENTO_LABEL", () => {
  it("contém exatamente as 10 chaves de TIPO_EVENTO_LICITACAO", () => {
    const labelKeys = Object.keys(TIPO_EVENTO_LABEL).sort();
    const tipoKeys = [...TIPO_EVENTO_LICITACAO].sort();
    expect(labelKeys).toEqual(tipoKeys);
  });
});
