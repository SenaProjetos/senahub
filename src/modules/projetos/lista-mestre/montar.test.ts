import { describe, expect, it } from "vitest";
import { foraDoPadrao } from "@/modules/projetos/pranchas/codigo";
import {
  faseDaListaMestre,
  montarListaMestre,
  nomeDaListaMestre,
  numeroDaListaMestre,
  type DocumentoCandidato,
} from "./montar";

function doc(parcial: Partial<DocumentoCandidato> & { nome: string }): DocumentoCandidato {
  return {
    titulo: null,
    tituloPrancha: null,
    numeroPrancha: null,
    faseSigla: "EX",
    tipoSigla: "DET",
    papelSigla: "A1",
    revisaoAtual: 1,
    statusFinal: false,
    pacote: "A",
    arquivos: [
      { ext: "pdf", validado: true },
      { ext: "dwg", validado: false },
    ],
    atualizadoEm: "2026-09-17T12:00:00.000Z",
    ...parcial,
  };
}

describe("montarListaMestre", () => {
  it("lista só documentos de Pranchas com arquivo validado na revisão atual", () => {
    const linhas = montarListaMestre(
      [
        doc({ nome: "260037-DRE-EX-6102-DET.pdf", numeroPrancha: 6102 }),
        doc({ nome: "260037-DRE-EX-6101-DET.pdf", numeroPrancha: 6101, arquivos: [{ ext: "pdf", validado: false }] }),
        doc({ nome: "backup.qibzip", pacote: "B" }),
        doc({ nome: "260037-DRE-EX-6103-DET.pdf", numeroPrancha: 6103, statusFinal: true }),
        doc({ nome: "260037-DRE-EX-6100-LMS.pdf", numeroPrancha: 6100, tipoSigla: "LMS" }),
      ],
      "LMS",
    );
    expect(linhas.map((l) => l.documento)).toEqual(["260037-DRE-EX-6102-DET"]);
  });

  it("monta a linha com título (ou o de reserva), revisão R00 e formatos", () => {
    const [comTitulo, comReserva] = montarListaMestre(
      [
        doc({ nome: "A-6101.pdf", numeroPrancha: 6101, titulo: " PLANTA BAIXA - TÉRREO " }),
        doc({ nome: "A-6102.pdf", numeroPrancha: 6102, tituloPrancha: "Cobertura", revisaoAtual: 2 }),
      ],
      "LMS",
    );
    expect(comTitulo).toMatchObject({ titulo: "PLANTA BAIXA - TÉRREO", revisao: "R00", formatos: ["DWG", "PDF"] });
    expect(comReserva).toMatchObject({ titulo: "Cobertura", revisao: "R01" });
  });

  it("ordena por número, e sem número vai para o fim por nome", () => {
    const linhas = montarListaMestre(
      [
        doc({ nome: "sem-numero-b.pdf" }),
        doc({ nome: "x-6103.pdf", numeroPrancha: 6103 }),
        doc({ nome: "sem-numero-a.pdf" }),
        doc({ nome: "x-6101.pdf", numeroPrancha: 6101 }),
      ],
      "LMS",
    );
    expect(linhas.map((l) => l.documento)).toEqual(["x-6101", "x-6103", "sem-numero-a", "sem-numero-b"]);
  });
});

describe("numeroDaListaMestre", () => {
  const linhas = montarListaMestre(
    [doc({ nome: "a.pdf", numeroPrancha: 6104 }), doc({ nome: "b.pdf", numeroPrancha: 6101 })],
    "LMS",
  );

  it("usa o início da faixa quando existe", () => {
    expect(numeroDaListaMestre(6000, linhas)).toBe(6000);
  });

  it("sem faixa, a centena do menor número (caso real 6101–6104 → 6100)", () => {
    expect(numeroDaListaMestre(null, linhas)).toBe(6100);
  });

  it("sem faixa e sem número, 0", () => {
    expect(numeroDaListaMestre(null, [])).toBe(0);
  });
});

describe("faseDaListaMestre", () => {
  it("fica com a fase mais frequente", () => {
    const linhas = montarListaMestre(
      [
        doc({ nome: "a.pdf", numeroPrancha: 1, faseSigla: "BS" }),
        doc({ nome: "b.pdf", numeroPrancha: 2, faseSigla: "EX" }),
        doc({ nome: "c.pdf", numeroPrancha: 3, faseSigla: "EX" }),
      ],
      "LMS",
    );
    expect(faseDaListaMestre(linhas)).toBe("EX");
  });

  it("empate fica com a que aparece primeiro; sem fase, null", () => {
    const empate = montarListaMestre(
      [doc({ nome: "a.pdf", numeroPrancha: 1, faseSigla: "BS" }), doc({ nome: "b.pdf", numeroPrancha: 2, faseSigla: "EX" })],
      "LMS",
    );
    expect(faseDaListaMestre(empate)).toBe("BS");
    expect(faseDaListaMestre(montarListaMestre([doc({ nome: "a.pdf", faseSigla: null })], "LMS"))).toBeNull();
  });
});

describe("nomeDaListaMestre", () => {
  it("segue o modelo do motor, com número em 4 dígitos", () => {
    expect(nomeDaListaMestre({ codigoProjeto: "260037", siglaDisciplina: "DRE", fase: "EX", numero: 6100, siglaTipo: "LMS" })).toBe(
      "260037-DRE-EX-6100-LMS",
    );
    expect(nomeDaListaMestre({ codigoProjeto: "260037", siglaDisciplina: "HID", fase: "EX", numero: 0, siglaTipo: "LMS" })).toBe(
      "260037-HID-EX-0000-LMS",
    );
  });

  it("não é marcado fora do padrão pelo modelo global de produção nem pelo embutido", () => {
    for (const padrao of ["{proj}-{disc}-{fase}-{nº}-{tipo}", null]) {
      expect(foraDoPadrao("260037-DRE-EX-6100-LMS.pdf", padrao)).toBe(false);
      expect(foraDoPadrao("260037-DRE-EX-6100-LMS.xlsx", padrao)).toBe(false);
    }
  });
});
