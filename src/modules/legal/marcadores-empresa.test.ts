import { describe, it, expect } from "vitest";
import { MARCADORES_EMPRESA, camposTermoPendentes, preencherMarcadoresEmpresa, type EmpresaTermo } from "./marcadores-empresa";
import { TERMOS, preencherTermo } from "./termos";

const COMPLETA: EmpresaTermo = {
  razaoSocial: "Sena Estruturas Engenharia Ltda.",
  cnpj: "12.345.678/0001-90",
  endereco: "Rua 1, 100, Centro\nGoiânia/GO",
  encarregadoDados: "Maria Silva, privacidade@sena.com.br",
  foro: "Goiânia/GO",
};

describe("marcadores do Termo de Uso", () => {
  // Guarda: marcador novo no texto do termo sem entrada no mapa sairia em branco para sempre.
  it("todo marcador [ ... ] dos termos tem origem em Configurações → Empresa", () => {
    const conhecidos = new Set(MARCADORES_EMPRESA.map((m) => m.marcador));
    for (const tipo of ["colaborador", "cliente"] as const) {
      const achados = TERMOS[tipo].conteudo.match(/\[[^\]]+\]/g) ?? [];
      expect(achados.length).toBeGreaterThan(0);
      for (const m of achados) expect(conhecidos, `${tipo}: ${m}`).toContain(m);
    }
  });

  it("com todos os dados preenchidos, nenhum marcador sobra nos dois termos", () => {
    for (const tipo of ["colaborador", "cliente"] as const) {
      const t = preencherTermo(TERMOS[tipo], COMPLETA);
      expect(t.conteudo).not.toMatch(/\[[^\]]+\]/);
      expect(t.conteudo).toContain("Sena Estruturas Engenharia Ltda.");
      expect(t.conteudo).toContain("Maria Silva, privacidade@sena.com.br");
      expect(t.versao).toBe(TERMOS[tipo].versao);
    }
  });

  it("endereço com quebra de linha vira uma linha só", () => {
    expect(preencherMarcadoresEmpresa("sede em [ENDEREÇO COMPLETO — CIDADE/UF].", COMPLETA)).toBe(
      "sede em Rua 1, 100, Centro, Goiânia/GO.",
    );
  });

  it("campo vazio mantém o marcador visível", () => {
    const parcial = { ...COMPLETA, cnpj: null, foro: "  " };
    const texto = preencherMarcadoresEmpresa("CNPJ [CNPJ], foro [COMARCA — CIDADE/UF]", parcial);
    expect(texto).toBe("CNPJ [CNPJ], foro [COMARCA — CIDADE/UF]");
  });

  it("sem dados da empresa, o texto sai igual ao modelo", () => {
    expect(preencherTermo(TERMOS.colaborador, null).conteudo).toBe(TERMOS.colaborador.conteudo);
  });

  it("lista os pendentes sem repetir (endereço aparece em dois marcadores)", () => {
    expect(camposTermoPendentes(COMPLETA)).toEqual([]);
    expect(camposTermoPendentes(null)).toEqual([
      "Razão social",
      "CNPJ",
      "Endereço",
      "Encarregado de dados (DPO)",
      "Foro (comarca/UF)",
    ]);
    expect(camposTermoPendentes({ ...COMPLETA, encarregadoDados: null })).toEqual(["Encarregado de dados (DPO)"]);
  });
});
