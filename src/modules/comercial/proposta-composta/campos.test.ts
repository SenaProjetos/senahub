import { describe, expect, it } from "vitest";
import { CAMPOS_PROPOSTA, escalaresDaProposta, resolverTextoProposta, tokensNaoResolvidosProposta } from "./campos";

const completa = {
  numero: "PROP-2026-0042",
  cliente: "Construtora Alfa",
  titulo: "Projetos multidisciplinares",
  obraEndereco: "Quadra 6, Lote 15",
  obraCidade: "Maceió",
  obraUF: "al",
  areaM2: 1200,
  total: 105_000,
  validadeDias: 30,
};

describe("escalaresDaProposta", () => {
  it("monta os campos, com UF em maiúscula e extensos calculados do número", () => {
    const e = escalaresDaProposta(completa);
    expect(e).toMatchObject({
      Numero: "PROP-2026-0042",
      Cidade: "Maceió",
      UF: "AL",
      AreaM2: 1200,
      Total: 105_000,
      TotalExtenso: "cento e cinco mil reais", // era "(cento e cinco reais)" numa proposta real
      ValidadeDias: 30,
      ValidadeExtenso: "30 (trinta) dias",
    });
  });

  it("dado ausente vira null (é o null que o bloqueio reconhece), nunca vazio nem zero", () => {
    const e = escalaresDaProposta({});
    for (const c of CAMPOS_PROPOSTA) expect(e[c.chave], c.chave).toBeNull();
  });

  it("total ou validade inválidos viram null, e o extenso some junto (não fica 'zero real')", () => {
    expect(escalaresDaProposta({ total: 0, validadeDias: 0 })).toMatchObject({ Total: null, TotalExtenso: null, ValidadeDias: null });
    expect(escalaresDaProposta({ total: -5, validadeDias: 1.5 })).toMatchObject({ Total: null, TotalExtenso: null, ValidadeDias: null });
    expect(escalaresDaProposta({ total: NaN })).toMatchObject({ Total: null, TotalExtenso: null });
  });

  it("texto só de espaços conta como ausente", () => {
    expect(escalaresDaProposta({ obraCidade: "   " }).Cidade).toBeNull();
  });

  it("o extenso acompanha o número: mudar o total muda o extenso (a causa dos 12 erros)", () => {
    expect(escalaresDaProposta({ total: 2805 }).TotalExtenso).toBe("dois mil oitocentos e cinco reais");
    expect(escalaresDaProposta({ total: 2800 }).TotalExtenso).toBe("dois mil e oitocentos reais");
  });
});

describe("resolverTextoProposta", () => {
  const escalar = escalaresDaProposta(completa);

  it("resolve os campos citados, com formato do Estúdio", () => {
    const r = resolverTextoProposta("Obra em [Cidade]/[UF], [AreaM2:n0] m², no valor de [Total:c2] ([TotalExtenso]).", escalar);
    expect(r).toEqual({ ok: true, texto: expect.stringContaining("Obra em Maceió/AL, 1.200 m²") });
    if (r.ok) expect(r.texto).toContain("(cento e cinco mil reais)");
  });

  it("texto sem token passa direto", () => {
    expect(resolverTextoProposta("Texto simples.", escalar)).toEqual({ ok: true, texto: "Texto simples." });
  });

  it("RECUSA texto que cita campo sem valor, em vez de imprimir 'obra em , '", () => {
    const r = resolverTextoProposta("Obra em [Cidade].", escalaresDaProposta({ ...completa, obraCidade: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problemas).toEqual([{ token: "Cidade", motivo: "vazio", label: "Cidade da obra" }]);
      expect(r.mensagem).toContain("Cidade da obra");
    }
  });

  it("campo que o texto NÃO cita nunca bloqueia (área vazia só importa a quem a cita)", () => {
    const r = resolverTextoProposta("Obra em [Cidade].", escalaresDaProposta({ ...completa, areaM2: null }));
    expect(r.ok).toBe(true);
  });

  it("RECUSA campo que não existe no catálogo (erro de digitação na biblioteca)", () => {
    const r = resolverTextoProposta("Obra em [Cidde].", escalar);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas[0]).toMatchObject({ token: "Cidde", motivo: "desconhecido" });
  });

  it("RECUSA token com a caixa errada: [cidade] passava na validação e saía em branco", () => {
    // O motor de tokens resolve por chave exata; o bloqueio de contratos casa sem diferenciar caixa.
    const r = resolverTextoProposta("Obra em [cidade].", escalar);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problemas).toHaveLength(1); // sem relato duplicado
      expect(r.problemas[0].token).toContain("[Cidade]");
    }
  });

  it("caixa errada + campo vazio ao mesmo tempo não duplica o relato", () => {
    const r = tokensNaoResolvidosProposta("Obra em [cidade].", escalaresDaProposta({}));
    expect(r).toHaveLength(1);
  });

  it("relata cada campo problemático uma vez, mesmo citado várias vezes", () => {
    const r = resolverTextoProposta("[Cidade] e [Cidade] e [Cidade]", escalaresDaProposta({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas).toHaveLength(1);
  });

  it("aceita token com formato e maiúscula certa (UF, TotalExtenso)", () => {
    expect(resolverTextoProposta("[UF]", escalar)).toEqual({ ok: true, texto: "AL" });
  });
});
