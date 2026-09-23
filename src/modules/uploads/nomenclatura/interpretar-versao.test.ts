import { describe, expect, it } from "vitest";
import { PADRAO_V1, PADRAO_V2, catalogoDaVersao, vocabularioDaVersao } from "@/test/catalogo-nomenclatura-versoes";
import { interpretarNomeArquivo, type ContextoNomenclatura } from "./interpretar";

/**
 * Aceite da F2 da spec `2026-09-21-nomenclatura-versionada-subdisciplinas.md`: cada nome é lido
 * só pelo vocabulário da versão do projeto, a sub-disciplina identifica o card, e o nome de outra
 * versão só gera aviso.
 */

const projeto = { codigo: "260010", ano: 2026, sequencial: 10 };

function ler(nome: string, versao: number, extra: Partial<ContextoNomenclatura> = {}) {
  return interpretarNomeArquivo(nome, {
    projeto,
    vocabulario: vocabularioDaVersao(versao),
    padrao: versao === 1 ? PADRAO_V1 : PADRAO_V2,
    ...extra,
  });
}

describe("nome do padrão v2 num projeto v2", () => {
  it("lê sub, card-mãe, etapa, número e tipo", () => {
    const r = ler("260010-SENA-AGF-BAS-001-PLB.pdf", 2);
    expect(r.casouPadrao).toBe(true);
    expect(r.subdisciplina?.valor).toBe("s-agf");
    expect(r.disciplina?.valor).toBe("d-hid");
    expect(r.fase?.valor).toBe("f-bs");
    expect(r.tipo?.valor).toBe("t-plb");
    expect(r.numero?.valor).toBe(1);
    expect(r.projeto?.bateComAtual).toBe(true);
    expect(r.partes.find((p) => p.texto === "AGF")?.papel).toBe("subdisciplina");
  });

  it("sem o padrão configurado, a heurística também acha a sub no lugar da disciplina", () => {
    const r = ler("260010-SENA-AGQ-EXE-003-ISO.dwg", 2, { padrao: null });
    expect(r.subdisciplina?.valor).toBe("s-agq");
    expect(r.disciplina?.valor).toBe("d-hid");
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.tipo?.valor).toBe("t-iso");
    expect(r.numero?.valor).toBe(3);
  });

  it("sigla geral do card: card sem sub", () => {
    const r = ler("260010-SENA-HID-EXE-001-M3D.ifc", 2);
    expect(r.disciplina?.valor).toBe("d-hid");
    expect(r.subdisciplina).toBeUndefined();
  });

  it("card sem sigla geral (Telecom) é achado pela sub", () => {
    const r = ler("260010-SENA-DAD-EXE-001-PLB.pdf", 2);
    expect(r.subdisciplina?.valor).toBe("s-dad");
    expect(r.disciplina?.valor).toBe("d-tel");
  });

  it("card e sub no nome se contradizendo → aviso, vale a sub", () => {
    const r = ler("260010-SENA-EST-AGF-BAS-001-PLB.pdf", 2, { padrao: null });
    expect(r.subdisciplina?.valor).toBe("s-agf");
    expect(r.disciplina?.valor).toBe("d-hid");
    expect(r.avisos.map((a) => a.tipo)).toContain("disciplina_divergente");
  });

  it("card e sub do mesmo card no nome não geram aviso", () => {
    const r = ler("260010-SENA-HID-AGF-BAS-001-PLB.pdf", 2, { padrao: null });
    expect(r.subdisciplina?.valor).toBe("s-agf");
    expect(r.avisos.map((a) => a.tipo)).not.toContain("disciplina_divergente");
  });

  it("sub de outro card que o escolhido no envio → aviso de disciplina divergente", () => {
    const r = ler("260010-SENA-AGF-BAS-001-PLB.pdf", 2, { disciplinaCatalogoId: "d-est" });
    expect(r.avisos.map((a) => a.tipo)).toContain("disciplina_divergente");
  });
});

describe("cada nome lido só pela sua versão", () => {
  it("nome v1 num projeto v1 continua como hoje", () => {
    const r = ler("260018-EST-EX-4012-DET.pdf", 1, { projeto: { codigo: "260018", ano: 2026, sequencial: 18 } });
    expect(r.disciplina?.valor).toBe("d-est");
    expect(r.fase?.valor).toBe("f-ex");
    expect(r.tipo?.valor).toBe("t-det");
    expect(r.numero?.valor).toBe(4012);
    expect(r.subdisciplina).toBeUndefined();
  });

  it("nome v1 num projeto v2: sem metadado da v1 e com aviso de outra versão (D6)", () => {
    const r = ler("260010-EST-EX-4012-DET.pdf", 2, {
      outrosPadroes: [{ rotulo: "v1 (Padrão original)", padrao: PADRAO_V1 }],
    });
    expect(r.casouPadrao).toBe(false);
    expect(r.fase).toBeUndefined(); // EX só vale na v1
    expect(r.avisos.find((a) => a.tipo === "outra_versao")?.texto).toContain("v1 (Padrão original)");
  });

  it("nome v2 num projeto v1: não lê sub nem etapa nova", () => {
    const r = ler("260010-SENA-AGF-BAS-001-PLB.pdf", 1, {
      outrosPadroes: [{ rotulo: "v2", padrao: PADRAO_V2 }],
    });
    expect(r.subdisciplina).toBeUndefined();
    expect(r.fase).toBeUndefined();
    expect(r.tipo).toBeUndefined();
    expect(r.avisos.map((a) => a.tipo)).toContain("outra_versao");
  });

  it("nome que casa com o padrão do projeto não recebe aviso de outra versão", () => {
    const r = ler("260010-SENA-AGF-BAS-001-PLB.pdf", 2, {
      outrosPadroes: [{ rotulo: "v1", padrao: PADRAO_V1 }],
    });
    expect(r.avisos.map((a) => a.tipo)).not.toContain("outra_versao");
  });

  it("ESG: hidrossanitário inteiro na v1, sub Esgoto na v2", () => {
    const v1 = ler("260010-ESG-EX-6001-DET.pdf", 1);
    expect(v1.disciplina?.valor).toBe("d-hid");
    expect(v1.subdisciplina).toBeUndefined();
    const v2 = ler("260010-SENA-ESG-EXE-001-PLB.pdf", 2);
    expect(v2.disciplina?.valor).toBe("d-hid");
    expect(v2.subdisciplina?.valor).toBe("s-esg");
  });

  it("ACU: card Acústica na v1, sub de Arquitetura na v2", () => {
    expect(ler("260010-ACU-EX-3101-DET.pdf", 1).disciplina?.valor).toBe("d-acu");
    const v2 = ler("260010-SENA-ACU-EXE-001-PLB.pdf", 2);
    expect(v2.disciplina?.valor).toBe("d-arq");
    expect(v2.subdisciplina?.valor).toBe("s-acu");
    expect(catalogoDaVersao(2).disciplinas.some((d) => d.id === "d-acu")).toBe(false);
  });

  it("SEG: card CFTV na v1, sigla geral de Segurança e Alarme na v2", () => {
    expect(ler("260010-SEG-EX-5201-DET.pdf", 1).disciplina?.valor).toBe("d-seg");
    expect(ler("260010-SENA-SEG-EXE-001-PLB.pdf", 2).disciplina?.valor).toBe("d-sga");
  });

  it("sigla renomeada: SPD na v1, PDA na v2", () => {
    expect(ler("260010-SPD-EX-5301-DET.pdf", 1).disciplina?.valor).toBe("d-spd");
    expect(ler("260010-SENA-PDA-EXE-001-PLB.pdf", 2).disciplina?.valor).toBe("d-spd");
    expect(ler("260010-SENA-SPD-EXE-001-PLB.pdf", 2).disciplina).toBeUndefined();
  });

  it("subprojeto .N continua valendo na v2 (P3)", () => {
    const r = ler("260010.1-SENA-AGF-BAS-001-PLB.pdf", 2);
    expect(r.casouPadrao).toBe(true);
    expect(r.projeto?.subprojeto).toBe(1);
    expect(r.subdisciplina?.valor).toBe("s-agf");
  });
});
