import { describe, expect, it } from "vitest";
import {
  descreverCondicao,
  primeiraQueCasa,
  regraCasa,
  rotuloDosCampos,
  sugerirPreenchimento,
  sugerirTermo,
  type Condicao,
  type EntradaDoMotor,
  type Preenchimento,
  type RegraDoMotor,
} from "@/modules/financeiro/regras/motor";

const vazio: Preenchimento = { categoriaId: null, centroId: null, formaId: null, projetoId: null, fornecedorId: null, clienteId: null, tags: [] };
const regra = (id: string, ordem: number, condicoes: Condicao[], preenche: Partial<Preenchimento>, ativo = true): RegraDoMotor => ({
  id,
  ordem,
  ativo,
  condicoes,
  preenche: { ...vazio, ...preenche },
});
const e = (p: Partial<EntradaDoMotor> = {}): EntradaDoMotor => ({ descricao: "PAG BOLETO CREA-SC ART 1234567", tipo: "despesa", valor: 120, contaId: "itau", ...p });
const contemCrea: Condicao = { campo: "descricao", op: "contem", valor: "CREA" };

describe("condições", () => {
  it("descrição ignora caixa e acento; contém, igual, começa", () => {
    expect(regraCasa({ condicoes: [{ campo: "descricao", op: "contem", valor: "crea-sc" }] }, e())).toBe(true);
    expect(regraCasa({ condicoes: [{ campo: "descricao", op: "contem", valor: "Água" }] }, e({ descricao: "conta de AGUA" }))).toBe(true);
    expect(regraCasa({ condicoes: [{ campo: "descricao", op: "igual", valor: "pag boleto" }] }, e())).toBe(false);
    expect(regraCasa({ condicoes: [{ campo: "descricao", op: "comeca", valor: "pag boleto" }] }, e())).toBe(true);
  });
  it("valor em centavos: igual, maior, menor", () => {
    expect(regraCasa({ condicoes: [{ campo: "valor", op: "igual", valor: 120 }] }, e())).toBe(true);
    expect(regraCasa({ condicoes: [{ campo: "valor", op: "igual", valor: 120.01 }] }, e())).toBe(false);
    expect(regraCasa({ condicoes: [{ campo: "valor", op: "maior", valor: 100 }] }, e())).toBe(true);
    expect(regraCasa({ condicoes: [{ campo: "valor", op: "menor", valor: 120 }] }, e())).toBe(false);
  });
  it("tipo e conta; todas as condições precisam bater", () => {
    expect(regraCasa({ condicoes: [contemCrea, { campo: "tipo", op: "igual", valor: "despesa" }] }, e())).toBe(true);
    expect(regraCasa({ condicoes: [contemCrea, { campo: "tipo", op: "igual", valor: "receita" }] }, e())).toBe(false);
    expect(regraCasa({ condicoes: [contemCrea, { campo: "conta", op: "igual", valor: "nubank" }] }, e())).toBe(false);
    expect(regraCasa({ condicoes: [{ campo: "conta", op: "igual", valor: "itau" }] }, e({ contaId: null }))).toBe(false);
  });
  it("regra sem condição ou com texto vazio não casa com nada", () => {
    expect(regraCasa({ condicoes: [] }, e())).toBe(false);
    expect(regraCasa({ condicoes: [{ campo: "descricao", op: "contem", valor: "  " }] }, e())).toBe(false);
  });
});

describe("primeira regra que casa", () => {
  it("vale a de menor ordem; pausada é ignorada", () => {
    const a = regra("a", 2, [contemCrea], { categoriaId: "c-a" });
    const b = regra("b", 1, [contemCrea], { categoriaId: "c-b" });
    expect(primeiraQueCasa([a, b], e())?.id).toBe("b");
    expect(primeiraQueCasa([a, { ...b, ativo: false }], e())?.id).toBe("a");
    expect(primeiraQueCasa([a], e({ descricao: "outra coisa" }))).toBeNull();
  });
});

describe("sugerirPreenchimento: nunca sobrescreve", () => {
  const r = regra("r", 0, [contemCrea], { categoriaId: "cat", centroId: "centro", formaId: "forma", fornecedorId: "forn", tags: ["crea", "art"] });
  it("preenche tudo o que está vazio", () => {
    const s = sugerirPreenchimento([r], e());
    expect(s?.preenche).toEqual({ categoriaId: "cat", centroId: "centro", formaId: "forma", fornecedorId: "forn", tags: ["crea", "art"] });
    expect(s?.regraId).toBe("r");
  });
  it("campo já escolhido fica; tags só somam o que falta", () => {
    const s = sugerirPreenchimento([r], e(), { categoriaId: "outra", tags: ["crea"] });
    expect(s?.preenche.categoriaId).toBeUndefined();
    expect(s?.preenche.centroId).toBe("centro");
    expect(s?.preenche.tags).toEqual(["art"]);
  });
  it("contato é um só: com cliente ou fornecedor já escolhido, a regra não põe o outro; e respeita o tipo", () => {
    expect(sugerirPreenchimento([r], e(), { clienteId: "cli" })?.preenche.fornecedorId).toBeUndefined();
    const rc = regra("rc", 0, [contemCrea], { clienteId: "cli" });
    expect(sugerirPreenchimento([rc], e())).toBeNull(); // despesa não recebe cliente
    expect(sugerirPreenchimento([rc], e({ tipo: "receita" }))?.preenche.clienteId).toBe("cli");
  });
  it("sem nada a preencher, nada a sugerir", () => {
    expect(sugerirPreenchimento([regra("x", 0, [contemCrea], { categoriaId: "cat" })], e(), { categoriaId: "ja" })).toBeNull();
  });
  it("rótulo dos campos preenchidos", () => {
    expect(rotuloDosCampos(["categoriaId", "tags"])).toBe("categoria e tag");
    expect(rotuloDosCampos(["categoriaId", "centroId", "tags"])).toBe("categoria, centro e tag");
    expect(rotuloDosCampos(["fornecedorId", "clienteId"])).toBe("contato");
  });
});

describe("textos", () => {
  it("descreve a condição", () => {
    expect(descreverCondicao(contemCrea)).toBe("Descrição contém “CREA”");
    expect(descreverCondicao({ campo: "tipo", op: "igual", valor: "receita" })).toBe("Entrada");
    expect(descreverCondicao({ campo: "valor", op: "maior", valor: 1000 })).toContain("maior que");
    expect(descreverCondicao({ campo: "conta", op: "igual", valor: "x" }, () => "Itaú PJ")).toBe("Conta Itaú PJ");
  });
  it("sugere o termo: ignora PAG/BOLETO e número, prefere o que se repete nos parecidos", () => {
    expect(sugerirTermo("PAG BOLETO CREA-SC ART 1234567", ["BOLETO CREA-SC ART 1111", "PAG CREA-SC TAXA"])).toBe("CREA-SC");
    expect(sugerirTermo("PIX 123456 ENEL DISTRIBUICAO")).toBe("DISTRIBUICAO");
    expect(sugerirTermo("PAG 1234 PIX")).toBe("");
  });
});
