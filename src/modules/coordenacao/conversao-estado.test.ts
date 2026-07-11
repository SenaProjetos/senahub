import { describe, it, expect } from "vitest";
import {
  podeEnfileirar,
  resultadoConversao,
  caminhoFragDeUpload,
  validarHeaderIfc,
  schemaProvavelmenteNaoSuportado,
  explicarErroConversao,
  MAX_TENTATIVAS,
} from "@/modules/coordenacao/conversao-estado";

describe("podeEnfileirar", () => {
  it("permite quando não há conversão ainda", () => {
    expect(podeEnfileirar(undefined)).toBe(true);
  });

  it("recusa quando já está na fila ou processando", () => {
    expect(podeEnfileirar({ status: "fila", tentativas: 0 })).toBe(false);
    expect(podeEnfileirar({ status: "processando", tentativas: 1 })).toBe(false);
  });

  it("recusa reprocessar concluído sem forçar", () => {
    expect(podeEnfileirar({ status: "concluido", tentativas: 1 })).toBe(false);
  });

  it("reprocessa erro enquanto não estourou o teto de tentativas", () => {
    expect(podeEnfileirar({ status: "erro", tentativas: 0 })).toBe(true);
    expect(podeEnfileirar({ status: "erro", tentativas: MAX_TENTATIVAS - 1 })).toBe(true);
    expect(podeEnfileirar({ status: "erro", tentativas: MAX_TENTATIVAS })).toBe(false);
  });

  it("forçar reprocessa concluído e erro esgotado, mas nunca o que está processando", () => {
    expect(podeEnfileirar({ status: "concluido", tentativas: 1 }, { forcar: true })).toBe(true);
    expect(podeEnfileirar({ status: "erro", tentativas: MAX_TENTATIVAS }, { forcar: true })).toBe(true);
    expect(podeEnfileirar({ status: "processando", tentativas: 1 }, { forcar: true })).toBe(false);
  });
});

describe("resultadoConversao", () => {
  it("conclui quando code 0 + frag presente", () => {
    const r = resultadoConversao({ code: 0, caminhoFrag: "x/y.frag", tamanhoFrag: 100, duracaoMs: 700 });
    expect(r.status).toBe("concluido");
    expect(r.caminhoFrag).toBe("x/y.frag");
    expect(r.tamanhoFrag).toBe(100);
    expect(r.erro).toBeNull();
  });

  it("vira erro com code != 0", () => {
    const r = resultadoConversao({ code: 1, erro: "boom", caminhoFrag: null });
    expect(r.status).toBe("erro");
    expect(r.caminhoFrag).toBeNull();
    expect(r.erro).toContain("boom");
  });

  it("vira erro se code 0 mas sem frag (converter não gravou)", () => {
    const r = resultadoConversao({ code: 0, caminhoFrag: null });
    expect(r.status).toBe("erro");
  });

  it("mensagem padrão quando erro ausente", () => {
    const r = resultadoConversao({ code: 137, caminhoFrag: null });
    expect(r.erro).toMatch(/137/);
  });

  it("trunca mensagens de erro longas", () => {
    const r = resultadoConversao({ code: 1, erro: "x".repeat(1000), caminhoFrag: null });
    expect(r.erro!.length).toBeLessThanOrEqual(500);
  });
});

describe("caminhoFragDeUpload", () => {
  it("coloca o .frag numa pasta COORDENACAO irmã do pacote, por uploadId", () => {
    const c = caminhoFragDeUpload("2026/Cliente/260007_Proj/EST/A/EST-modelo.ifc", "abc123");
    expect(c).toBe("2026/Cliente/260007_Proj/EST/COORDENACAO/abc123.frag");
  });

  it("normaliza separadores do Windows para posix", () => {
    const c = caminhoFragDeUpload("2026\\Cliente\\260007_Proj\\HID\\A\\arq.ifc", "id9");
    expect(c).toBe("2026/Cliente/260007_Proj/HID/COORDENACAO/id9.frag");
  });
});

describe("validarHeaderIfc", () => {
  it("aceita IFC válido e extrai o schema", () => {
    const header = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\n";
    expect(validarHeaderIfc(header)).toEqual({ ok: true, schema: "IFC4" });
  });

  it("aceita sem FILE_SCHEMA (schema null, deixa tentar)", () => {
    expect(validarHeaderIfc("ISO-10303-21; foo")).toEqual({ ok: true, schema: null });
  });

  it("recusa arquivo sem cabeçalho ISO-10303-21", () => {
    const r = validarHeaderIfc("%PDF-1.7 blah");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não é um IFC/i);
  });
});

describe("schemaProvavelmenteNaoSuportado", () => {
  it("suporta IFC2X3 / IFC4 / IFC4X3", () => {
    expect(schemaProvavelmenteNaoSuportado("IFC4")).toBe(false);
    expect(schemaProvavelmenteNaoSuportado("IFC2X3")).toBe(false);
    expect(schemaProvavelmenteNaoSuportado("IFC4X3_ADD2")).toBe(false);
  });
  it("marca schemas exóticos e não bloqueia quando ausente", () => {
    expect(schemaProvavelmenteNaoSuportado("IFC2X2")).toBe(true);
    expect(schemaProvavelmenteNaoSuportado(null)).toBe(false);
  });
});

describe("explicarErroConversao", () => {
  it("memória", () => {
    expect(explicarErroConversao("Out of memory: allocation failed")).toMatch(/memória insuficiente/i);
  });
  it("não-IFC / header", () => {
    expect(explicarErroConversao("missing ISO-10303-21 header")).toMatch(/não é um IFC/i);
  });
  it("schema não suportado", () => {
    expect(explicarErroConversao("unsupported schema IFC2X2")).toMatch(/schema IFC não suportad/i);
  });
  it("arquivo mal formado", () => {
    expect(explicarErroConversao("Unexpected token at line 4")).toMatch(/mal formado ou incompleto/i);
  });
  it("timeout", () => {
    expect(explicarErroConversao("Conversão excedeu 45 min e foi abortada.")).toMatch(/tempo limite/i);
  });
  it("preserva o teto de tamanho já amigável", () => {
    const msg = "IFC de 3000 MB excede o limite de conversão (2 GB). Exporte por pavimento/setor no Revit.";
    expect(explicarErroConversao(msg)).toBe(msg);
  });
  it("desconhecido preserva o texto cru", () => {
    expect(explicarErroConversao("weird glitch 42")).toMatch(/Falha na conversão: weird glitch 42/);
  });
  it("vazio", () => {
    expect(explicarErroConversao("")).toMatch(/desconhecido/i);
  });
});
