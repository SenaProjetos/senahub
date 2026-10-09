import { describe, expect, it } from "vitest";

import { destinoNoCiclo, trocaDeExtensao, type UltimaRevisao } from "./envio-arquivo";

const ultima = (estado: NonNullable<UltimaRevisao>["estado"], p: Partial<NonNullable<UltimaRevisao>> = {}): UltimaRevisao => ({
  id: "r2",
  numero: 2,
  estado,
  ultimaVersao: 3,
  ...p,
});

describe("destinoNoCiclo", () => {
  it("documento novo nasce na R00, versão 1 (I1)", () => {
    expect(destinoNoCiclo({ ultima: null, revisaoDoEnvio: null })).toEqual({ tipo: "nova_revisao", numero: 1, versao: 1 });
  });

  it("revisão em andamento recebe versão nova — não revisão nova (N2)", () => {
    expect(destinoNoCiclo({ ultima: ultima("em_andamento"), revisaoDoEnvio: null })).toEqual({
      tipo: "nova_versao",
      revisaoId: "r2",
      numero: 2,
      versao: 4,
      versaoAnterior: 3,
    });
  });

  it("segundo arquivo do mesmo envio (PDF + DWG) fica na mesma versão", () => {
    expect(destinoNoCiclo({ ultima: ultima("em_andamento"), revisaoDoEnvio: "r2" })).toEqual({ tipo: "mesma_versao", revisaoId: "r2", numero: 2, versao: 3 });
  });

  it("em análise recusa o envio (V2-a)", () => {
    expect(destinoNoCiclo({ ultima: ultima("compartilhado"), revisaoDoEnvio: null })).toEqual({
      tipo: "recusar",
      motivo: "A R01 está em análise. Aguarde a devolução ou a publicação para enviar arquivos.",
    });
  });

  it("publicada ou arquivada: nasce a revisão seguinte (I2 — publicado não recebe arquivo)", () => {
    expect(destinoNoCiclo({ ultima: ultima("publicado"), revisaoDoEnvio: null })).toEqual({ tipo: "nova_revisao", numero: 3, versao: 1 });
    expect(destinoNoCiclo({ ultima: ultima("arquivado"), revisaoDoEnvio: "r2" })).toEqual({ tipo: "nova_revisao", numero: 3, versao: 1 });
  });
});

describe("trocaDeExtensao", () => {
  const atuais = [{ id: "u1", ext: "pdf", versaoNaRevisao: 1 }, { id: "u2", ext: "dwg", versaoNaRevisao: 1 }];

  it("extensão nova é anexada", () => {
    expect(trocaDeExtensao([atuais[0]], "dwg", 2)).toEqual({ tipo: "nenhum" });
  });

  it("mesma extensão de versão anterior é substituída (o antigo fica no histórico)", () => {
    expect(trocaDeExtensao(atuais, "pdf", 2)).toEqual({ tipo: "substituir", uploadId: "u1" });
  });

  it("dois arquivos da mesma extensão no mesmo envio: recusa", () => {
    expect(trocaDeExtensao(atuais, "pdf", 1)).toMatchObject({ tipo: "recusar" });
  });
});
