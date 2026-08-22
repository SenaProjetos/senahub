import { describe, it, expect } from "vitest";
import { autoMapearCrm, CAMPOS_OBRIGATORIOS_CRM } from "@/lib/import/mapeamento-crm";

// O cabeçalho literal do aceite da F4.4 (docs/crm/04-plano-fases.md).
const HEADERS_ACEITE = ["Empresa", "E-mail do contato", "Telefone"];

describe("autoMapearCrm — aceite da F4.4", () => {
  it('"Empresa";"E-mail do contato";"Telefone" é auto-mapeado', () => {
    const m = autoMapearCrm(HEADERS_ACEITE);
    expect(HEADERS_ACEITE[m.empresa!]).toBe("Empresa");
    expect(HEADERS_ACEITE[m.emailContato!]).toBe("E-mail do contato");
    expect(HEADERS_ACEITE[m.telefone!]).toBe("Telefone");
  });

  it("coluna desconhecida fica SEM mapeamento, em vez de adivinhar", () => {
    const m = autoMapearCrm(["Empresa", "Coluna Misteriosa X"]);
    expect(m.empresa).toBe(0);
    // Nenhum campo do catálogo casou com "Coluna Misteriosa X" — o índice 1 não aparece
    // em nenhum valor do mapeamento.
    expect(Object.values(m)).not.toContain(1);
  });
});

describe("autoMapearCrm — export típico de Sales Navigator/planilha comercial", () => {
  const HEADERS = [
    "Nome da empresa", "CNPJ", "Nome do contato", "Cargo", "E-mail", "Celular",
    "Segmento", "Cidade", "Estado", "LinkedIn", "Observações",
  ];
  const m = autoMapearCrm(HEADERS);

  it("mapeia empresa e documento", () => {
    expect(HEADERS[m.empresa!]).toBe("Nome da empresa");
    expect(HEADERS[m.documento!]).toBe("CNPJ");
  });

  it("mapeia contato (nome, cargo, e-mail, telefone)", () => {
    expect(HEADERS[m.nomeContato!]).toBe("Nome do contato");
    expect(HEADERS[m.cargo!]).toBe("Cargo");
    expect(HEADERS[m.emailContato!]).toBe("E-mail");
    expect(HEADERS[m.telefone!]).toBe("Celular");
  });

  it("mapeia segmento, localização e LinkedIn", () => {
    expect(HEADERS[m.segmento!]).toBe("Segmento");
    expect(HEADERS[m.cidade!]).toBe("Cidade");
    expect(HEADERS[m.uf!]).toBe("Estado");
    expect(HEADERS[m.linkedinUrl!]).toBe("LinkedIn");
  });

  it("cada coluna usada no máximo uma vez", () => {
    const indices = Object.values(m);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

describe("autoMapearCrm — ambiguidade de 'Nome' (empresa vence, por ordem de CAMPOS_CRM)", () => {
  it("planilha com uma única coluna 'Nome' mapeia para EMPRESA, não para contato", () => {
    const m = autoMapearCrm(["Nome", "Telefone"]);
    expect(m.empresa).toBe(0);
    expect(m.nomeContato).toBeUndefined();
  });

  it("com as duas colunas presentes, cada 'Nome' vai para seu campo — sem colisão", () => {
    const m = autoMapearCrm(["Nome da empresa", "Nome do contato"]);
    expect(m.empresa).toBe(0);
    expect(m.nomeContato).toBe(1);
  });
});

describe("autoMapearCrm — casos gerais", () => {
  it("header desconhecido não quebra", () => {
    const m = autoMapearCrm(["Coluna X", "Outra"]);
    expect(m.empresa).toBeUndefined();
    expect(m.nomeContato).toBeUndefined();
  });

  it("planilha vazia devolve mapeamento vazio", () => {
    expect(autoMapearCrm([])).toEqual({});
  });

  it("CAMPOS_OBRIGATORIOS_CRM é exatamente empresa + nomeContato (par que a service exige)", () => {
    expect(CAMPOS_OBRIGATORIOS_CRM).toEqual(["empresa", "nomeContato"]);
  });
});
