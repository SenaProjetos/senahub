import { describe, expect, it } from "vitest";
import { siglasRedefinidas, type LinhaSigla } from "./publicacao";

const l = (parcial: Partial<LinhaSigla> & Pick<LinhaSigla, "sigla" | "alvoChave" | "alvoRotulo">): LinhaSigla => ({
  categoria: "disciplina",
  oficial: true,
  versaoDesde: 1,
  versaoAte: null,
  ...parcial,
});

describe("siglasRedefinidas", () => {
  it("ESG: sinônimo de HID na v1, oficial de Esgoto na v2 — é redefinição", () => {
    const linhas: LinhaSigla[] = [
      l({ sigla: "HID", alvoChave: "disciplina:d-hid", alvoRotulo: "Hidrossanitário" }),
      l({ sigla: "ESG", oficial: false, versaoAte: 1, alvoChave: "disciplina:d-hid", alvoRotulo: "Hidrossanitário" }),
      l({ sigla: "ESG", categoria: "subdisciplina", versaoDesde: 2, alvoChave: "subdisciplina:s-esg", alvoRotulo: "Esgoto" }),
    ];
    const r = siglasRedefinidas(linhas, 2, [1]);
    expect(r).toEqual([
      {
        sigla: "ESG",
        categoria: "subdisciplina",
        alvoAntigo: { rotulo: "Hidrossanitário", desdeVersao: 1 },
        alvoNovo: { rotulo: "Esgoto" },
      },
    ]);
  });

  it("sigla renomeada (SPD → PDA) não é redefinição: são textos diferentes", () => {
    const linhas: LinhaSigla[] = [
      l({ sigla: "SPD", versaoAte: 1, alvoChave: "disciplina:d-spd", alvoRotulo: "SPDA" }),
      l({ sigla: "PDA", versaoDesde: 2, alvoChave: "disciplina:d-spd", alvoRotulo: "SPDA" }),
    ];
    expect(siglasRedefinidas(linhas, 2, [1])).toEqual([]);
  });

  it("sigla nova, sem histórico anterior, não é redefinição", () => {
    const linhas: LinhaSigla[] = [l({ sigla: "PLB", versaoDesde: 2, alvoChave: "tipo:t-plb", alvoRotulo: "Planta baixa", categoria: "tipo" })];
    expect(siglasRedefinidas(linhas, 2, [1])).toEqual([]);
  });

  it("mesmo alvo em versões diferentes não é redefinição", () => {
    const linhas: LinhaSigla[] = [l({ sigla: "HID", alvoChave: "disciplina:d-hid", alvoRotulo: "Hidrossanitário" })];
    expect(siglasRedefinidas(linhas, 2, [1])).toEqual([]);
  });

  it("sem versão anterior publicada, nada a comparar (primeira versão do sistema)", () => {
    const linhas: LinhaSigla[] = [l({ sigla: "HID", alvoChave: "disciplina:d-hid", alvoRotulo: "Hidrossanitário" })];
    expect(siglasRedefinidas(linhas, 1, [])).toEqual([]);
  });

  it("compara com a versão publicada anterior mais recente, não com todo o histórico", () => {
    // v1: ACU=card Acústica · v2: ACU=sub Acústica de Arquitetura (já redefinida) · v3: mesma coisa da v2 → sem novo aviso
    const linhas: LinhaSigla[] = [
      l({ sigla: "ACU", versaoAte: 1, alvoChave: "disciplina:d-acu", alvoRotulo: "Acústica (card)" }),
      l({ sigla: "ACU", categoria: "subdisciplina", versaoDesde: 2, alvoChave: "subdisciplina:s-acu", alvoRotulo: "Acústica" }),
    ];
    expect(siglasRedefinidas(linhas, 3, [1, 2])).toEqual([]);
  });
});
