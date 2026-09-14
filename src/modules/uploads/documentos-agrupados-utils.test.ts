import { describe, expect, it } from "vitest";
import { arquivosDaRevisaoAtual, chavePrancha, numeroPrancha, revisaoAtualDosUploads } from "./documentos-agrupados-utils";

describe("arquivosDaRevisaoAtual", () => {
  it("mantém a R01 disponível quando uma R02 já não tem upload ativo", () => {
    const uploads = [
      { id: "r01-pdf", revisaoId: "r01", revisao: { numero: 1 } },
      { id: "r01-dwg", revisaoId: "r01", revisao: { numero: 1 } },
    ];

    expect(revisaoAtualDosUploads(uploads)).toBe(1);
    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["r01-pdf", "r01-dwg"]);
  });

  it("usa a maior revisão que ainda possui upload ativo", () => {
    const uploads = [
      { id: "r01", revisaoId: "r01", revisao: { numero: 1 } },
      { id: "r02", revisaoId: "r02", revisao: { numero: 2 } },
    ];

    expect(revisaoAtualDosUploads(uploads)).toBe(2);
    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["r02"]);
  });

  it("preserva uploads legados sem revisão ao lado da revisão vigente", () => {
    const uploads = [
      { id: "legado", revisaoId: null, revisao: null },
      { id: "r02", revisaoId: "r02", revisao: { numero: 2 } },
      { id: "r01", revisaoId: "r01", revisao: { numero: 1 } },
    ];

    expect(arquivosDaRevisaoAtual(uploads).map((upload) => upload.id)).toEqual(["legado", "r02"]);
  });
});

describe("numeroPrancha", () => {
  it("devolve numeração com 4 dígitos e o tipo, ignorando extensão e revisão", () => {
    expect(numeroPrancha("260029-HDR-BS-6008-3D.ifc")).toBe("6008-3D");
    expect(numeroPrancha("260029-ELE-EX-12-pl-R02.pdf")).toBe("0012-PL");
  });

  it("nome fora do padrão fica sem número", () => {
    expect(numeroPrancha("memorial descritivo.docx")).toBeNull();
  });
});

describe("chavePrancha", () => {
  it("casa nome e Lista Mestre sem diferenciar maiúsculas", () => {
    expect(chavePrancha("d1", { numeracao: 6008, tipo: "3d", fase: "bs" })).toBe(
      chavePrancha("d1", { numeracao: 6008, tipo: "3D", fase: "BS" }),
    );
  });

  it("disciplinas diferentes nunca compartilham prancha", () => {
    expect(chavePrancha("d1", { numeracao: 1, tipo: "PL", fase: "EX" })).not.toBe(
      chavePrancha("d2", { numeracao: 1, tipo: "PL", fase: "EX" }),
    );
  });
});
