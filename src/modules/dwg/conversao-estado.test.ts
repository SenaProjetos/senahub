import { describe, it, expect } from "vitest";
import {
  podeEnfileirar,
  resultadoConversao,
  caminhoDxfDeUpload,
  caminhoDxfDeDocumento,
  validarAssinaturaDwg,
  explicarErroConversaoDwg,
  MAX_TENTATIVAS,
} from "@/modules/dwg/conversao-estado";

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
  it("conclui quando code 0 + dxf presente", () => {
    const r = resultadoConversao({ code: 0, caminhoDxf: "x/y.dxf", tamanhoDxf: 100, duracaoMs: 700 });
    expect(r.status).toBe("concluido");
    expect(r.caminhoDxf).toBe("x/y.dxf");
    expect(r.tamanhoDxf).toBe(100);
    expect(r.erro).toBeNull();
  });

  it("vira erro com code != 0", () => {
    const r = resultadoConversao({ code: 1, erro: "boom", caminhoDxf: null });
    expect(r.status).toBe("erro");
    expect(r.caminhoDxf).toBeNull();
    expect(r.erro).toContain("boom");
  });

  it("vira erro se code 0 mas sem dxf (converter não gravou)", () => {
    const r = resultadoConversao({ code: 0, caminhoDxf: null });
    expect(r.status).toBe("erro");
  });

  it("mensagem padrão quando erro ausente", () => {
    const r = resultadoConversao({ code: 137, caminhoDxf: null });
    expect(r.erro).toMatch(/137/);
  });

  it("trunca mensagens de erro longas", () => {
    const r = resultadoConversao({ code: 1, erro: "x".repeat(1000), caminhoDxf: null });
    expect(r.erro!.length).toBeLessThanOrEqual(500);
  });
});

describe("caminhoDxfDeUpload", () => {
  it("coloca o .dxf numa pasta DWG irmã do pacote, por uploadId", () => {
    const c = caminhoDxfDeUpload("2026/Cliente/260007_Proj/EST/A/EST-planta.dwg", "abc123");
    expect(c).toBe("2026/Cliente/260007_Proj/EST/DWG/abc123.dxf");
  });

  it("normaliza separadores do Windows para posix", () => {
    const c = caminhoDxfDeUpload("2026\\Cliente\\260007_Proj\\HID\\A\\arq.dwg", "id9");
    expect(c).toBe("2026/Cliente/260007_Proj/HID/DWG/id9.dxf");
  });
});

describe("caminhoDxfDeDocumento", () => {
  it("põe o .dxf numa pasta DWG irmã do arquivo, por versaoId", () => {
    const c = caminhoDxfDeDocumento("clientes/ACME/recebidos/planta.dwg", "ver1");
    expect(c).toBe("clientes/ACME/recebidos/DWG/ver1.dxf");
  });

  it("normaliza separadores do Windows", () => {
    const c = caminhoDxfDeDocumento("clientes\\ACME\\m.dwg", "v2");
    expect(c).toBe("clientes/ACME/DWG/v2.dxf");
  });
});

describe("validarAssinaturaDwg", () => {
  function bytesDe(assinatura: string, resto = "resto qualquer"): Uint8Array {
    return new Uint8Array(Buffer.from(assinatura + resto, "ascii"));
  }

  it("aceita assinatura conhecida (AC1032 = 2018+)", () => {
    expect(validarAssinaturaDwg(bytesDe("AC1032"))).toEqual({ ok: true, versao: "AC1032" });
  });

  it("aceita outras versões conhecidas (AC1015 = 2000)", () => {
    expect(validarAssinaturaDwg(bytesDe("AC1015"))).toEqual({ ok: true, versao: "AC1015" });
  });

  it("aceita com aviso versão não reconhecida mas com formato AC10xx", () => {
    const r = validarAssinaturaDwg(bytesDe("AC1099"));
    expect(r.ok).toBe(true);
    expect(r.versao).toBe("AC1099");
    expect(r.motivo).toMatch(/não reconhecida/i);
  });

  it("recusa arquivo sem assinatura AutoCAD", () => {
    const r = validarAssinaturaDwg(bytesDe("%PDF-1"));
    expect(r.ok).toBe(false);
    expect(r.versao).toBeNull();
    expect(r.motivo).toMatch(/não é um DWG/i);
  });

  it("recusa arquivo pequeno demais", () => {
    const r = validarAssinaturaDwg(new Uint8Array([1, 2, 3]));
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/pequeno demais/i);
  });
});

describe("explicarErroConversaoDwg", () => {
  it("assinatura inválida", () => {
    expect(explicarErroConversaoDwg("arquivo não é um DWG válido: assinatura ausente")).toMatch(/não é um DWG válido/i);
  });
  it("conversor não configurado", () => {
    expect(explicarErroConversaoDwg("ENOENT: ODA_CONVERTER_PATH não encontrado")).toMatch(/não está configurado/i);
  });
  it("timeout", () => {
    expect(explicarErroConversaoDwg("Conversão excedeu 10 min e foi abortada.")).toMatch(/tempo limite/i);
  });
  it("saída ausente", () => {
    expect(explicarErroConversaoDwg("Nenhum .dxf produced")).toMatch(/não gerou o arquivo de saída/i);
  });
  it("preserva o teto de tamanho já amigável", () => {
    const msg = "DWG de 800 MB excede o limite de conversão (500 MB). Reduza o arquivo e reenvie.";
    expect(explicarErroConversaoDwg(msg)).toBe(msg);
  });
  it("desconhecido preserva o texto cru", () => {
    expect(explicarErroConversaoDwg("weird glitch 42")).toMatch(/Falha na conversão: weird glitch 42/);
  });
  it("vazio", () => {
    expect(explicarErroConversaoDwg("")).toMatch(/desconhecido/i);
  });
});
