import { describe, expect, it } from "vitest";
import { camposBloqueados, mensagemCamposBloqueados } from "./bloqueio";
import { docVazio, novoId } from "./schema";
import type { DocSchema, Elemento } from "./schema";

const estiloBase: Elemento["estilo"] = {
  fontSize: 12, bold: false, italic: false, align: "left", color: "", bg: "",
  borderW: 0, borderColor: "#000", borderStyle: "solida", radius: 0, fontFamily: "",
};

function elemento(over: Partial<Elemento>): Elemento {
  return { id: novoId(), tipo: "paragrafo", x: 0, y: 0, w: 100, h: 20, texto: "", estilo: estiloBase, visivel: true, travado: false, ...over };
}

/** Modelo com UM elemento no primeiro band (cabecalho) e `bloquearCamposVazios` ligado. */
function schemaCom(texto: string, opts: { bloquear?: boolean; condicao?: string; tipo?: Elemento["tipo"] } = {}): DocSchema {
  const s = docVazio();
  s.pagina.bloquearCamposVazios = opts.bloquear ?? true;
  s.bandas[0]!.elementos.push(elemento({ texto, tipo: opts.tipo, condicao: opts.condicao }));
  return s;
}

describe("camposBloqueados", () => {
  it("desligado (default) nunca bloqueia — retrocompat com todo modelo existente", () => {
    const s = schemaCom("[NaoExiste]", { bloquear: false });
    expect(camposBloqueados(s, "cliente", {})).toEqual([]);
  });

  it("token desconhecido na fonte é bloqueado", () => {
    const s = schemaCom("[CampoQueNaoExisteNaFonte]");
    const r = camposBloqueados(s, "cliente", { Nome: "Fulano" });
    expect(r).toEqual([{ token: "CampoQueNaoExisteNaFonte", motivo: "desconhecido" }]);
  });

  it("campo conhecido mas vazio no escalar é bloqueado", () => {
    const s = schemaCom("[Documento]"); // "cliente" tem escalar "Documento" no catálogo
    const r = camposBloqueados(s, "cliente", { Nome: "Fulano" }); // sem Documento
    expect(r).toEqual([{ token: "Documento", motivo: "vazio", label: "CPF/CNPJ" }]);
  });

  it("campo preenchido não bloqueia", () => {
    const s = schemaCom("[Nome]");
    expect(camposBloqueados(s, "cliente", { Nome: "Fulano" })).toEqual([]);
  });

  it("elemento com `condicao` é ISENTO — o mecanismo de escape do Estúdio já resolve", () => {
    const s = schemaCom("[Documento]", { condicao: "naoVazio([Documento])" });
    expect(camposBloqueados(s, "cliente", { Nome: "Fulano" })).toEqual([]);
  });

  it("elemento tabela é ignorado — token de coluna resolve por linha, não pelo escalar", () => {
    const s = schemaCom("", { tipo: "tabela" });
    s.bandas[0]!.elementos[0]!.colunas = [{ campo: "[Valor]", titulo: "Valor", largura: 1, align: "left" }];
    expect(camposBloqueados(s, "cliente", {})).toEqual([]);
  });

  it("banda com fonte PRÓPRIA (multi-coleção) fica fora do escopo desta fase", () => {
    const s = docVazio();
    s.pagina.bloquearCamposVazios = true;
    s.bandas[0]!.fonteId = "licitacao"; // sub-fonte, não a primária
    s.bandas[0]!.elementos.push(elemento({ texto: "[CampoQualquerNaoExiste]" }));
    expect(camposBloqueados(s, "cliente", {})).toEqual([]);
  });

  it("token builtin ([Hoje], [Pagina]) nunca é 'desconhecido'", () => {
    const s = schemaCom("[Hoje] · [Pagina] de [Paginas]");
    expect(camposBloqueados(s, "cliente", {})).toEqual([]);
  });

  it("agregado ([Sum(...)]) não é verificado contra o catálogo escalar", () => {
    const s = schemaCom("[Sum(Valor)]");
    expect(camposBloqueados(s, "cliente", {})).toEqual([]);
  });

  it("token repetido em elementos diferentes só aparece uma vez no resultado", () => {
    const s = docVazio();
    s.pagina.bloquearCamposVazios = true;
    s.bandas[0]!.elementos.push(elemento({ texto: "[Documento]" }), elemento({ texto: "[Documento]" }));
    expect(camposBloqueados(s, "cliente", { Nome: "Fulano" })).toHaveLength(1);
  });
});

describe("mensagemCamposBloqueados", () => {
  it("separa erro de modelo de falta de dado", () => {
    const msg = mensagemCamposBloqueados([
      { token: "Errado", motivo: "desconhecido" },
      { token: "Documento", motivo: "vazio", label: "CPF/CNPJ" },
    ]);
    expect(msg).toBe("Campo inexistente na fonte: [Errado]. Sem dado para preencher: CPF/CNPJ.");
  });
});
