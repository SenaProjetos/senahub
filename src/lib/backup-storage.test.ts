import { describe, expect, it } from "vitest";
import {
  descreverCodigoRobocopy,
  destinoDentroDaOrigem,
  mesmoVolume,
  parseResumoRobocopy,
  resolverDestinoStorage,
  robocopyOk,
} from "./backup-storage";

describe("robocopyOk", () => {
  // A pegadinha do robocopy: 0 e 1 são sucesso, 8+ é falha. Tratar != 0 como erro
  // marcaria como falha justamente o backup que copiou arquivos.
  it("aceita os códigos de sucesso (0..7)", () => {
    for (const c of [0, 1, 2, 3, 4, 5, 6, 7]) expect(robocopyOk(c)).toBe(true);
  });

  it("recusa 8 ou mais (falha real de cópia)", () => {
    for (const c of [8, 9, 16, 24]) expect(robocopyOk(c)).toBe(false);
  });

  it("recusa código nulo (processo morto por sinal)", () => {
    expect(robocopyOk(null)).toBe(false);
  });
});

describe("descreverCodigoRobocopy", () => {
  it("descreve o caso mais comum", () => {
    expect(descreverCodigoRobocopy(1)).toContain("copiados");
    expect(descreverCodigoRobocopy(0)).toContain("nada a copiar");
  });

  it("decompõe o bitmask", () => {
    const d = descreverCodigoRobocopy(3);
    expect(d).toContain("copiados");
    expect(d).toContain("extras");
  });

  it("aponta erro fatal", () => {
    expect(descreverCodigoRobocopy(16)).toContain("ERRO FATAL");
  });
});

describe("parseResumoRobocopy", () => {
  const saidaEn = `
               Total    Copied   Skipped  Mismatch    FAILED    Extras
    Dirs :        12         1        11         0         0         0
   Files :       340        18       322         0         0         0
   Bytes :   1.5 g    120.4 m   1.4 g         0         0         0
`;

  // Saida REAL do robocopy pt-BR (colhida na maquina de dev), com o "o" acentuado de
  // "Diretorios" ja corrompido: o robocopy escreve na codepage OEM do console e o Node le
  // como UTF-8. Casar pela palavra inteira devolvia null justo na maquina real - por isso
  // o parser casa por prefixo ASCII.
  const saidaPt = [
    "               Total   Copiada  IgnoradaIncompatibilidade     FALHA    Extras",
    "Diret��rios:        12         1        11         0         0         0",
    " Arquivos:       340        18       322         0         2         0",
    "    Bytes:        19        19         0         0         0         0",
    "N.� de Vezes:   0:00:00   0:00:00                       0:00:00   0:00:00",
  ].join("\n");

  it("lê o resumo em inglês", () => {
    const r = parseResumoRobocopy(saidaEn);
    expect(r.arquivos).toEqual({ total: 340, copiados: 18, falhas: 0 });
    expect(r.diretorios).toEqual({ total: 12, copiados: 1, falhas: 0 });
  });

  it("lê o resumo em português (acento corrompido) e captura as falhas", () => {
    const r = parseResumoRobocopy(saidaPt);
    expect(r.arquivos).toEqual({ total: 340, copiados: 18, falhas: 2 });
    expect(r.diretorios).toEqual({ total: 12, copiados: 1, falhas: 0 });
  });

  it("ignora a linha de tempo (valor com dois-pontos) e a de bytes", () => {
    const r = parseResumoRobocopy(saidaPt);
    // "N.o de Vezes: 0:00:00" nao pode ser confundida com contagem de arquivos.
    expect(r.arquivos?.total).toBe(340);
  });

  it("devolve null em vez de inventar número quando não reconhece a saída", () => {
    expect(parseResumoRobocopy("robocopy nao rodou")).toEqual({ arquivos: null, diretorios: null });
  });
});

describe("guardas de destino", () => {
  it("detecta destino dentro da origem", () => {
    expect(destinoDentroDaOrigem("F:\\SenaHub\\storage", "F:\\SenaHub\\storage\\backup")).toBe(true);
    expect(destinoDentroDaOrigem("F:\\SenaHub\\storage", "F:\\SenaHub\\storage")).toBe(true);
    expect(destinoDentroDaOrigem("F:\\SenaHub\\storage", "F:\\backups\\storage")).toBe(false);
  });

  it("não confunde pasta irmã de prefixo parecido", () => {
    expect(destinoDentroDaOrigem("F:\\SenaHub\\storage", "F:\\SenaHub\\storage-backup")).toBe(false);
  });

  it("detecta cópia no mesmo volume", () => {
    expect(mesmoVolume("F:\\SenaHub\\storage", "F:\\backups\\storage")).toBe(true);
    expect(mesmoVolume("F:\\SenaHub\\storage", "D:\\backups\\storage")).toBe(false);
  });
});

describe("resolverDestinoStorage", () => {
  it("prefere STORAGE_BACKUP_PATH", () => {
    expect(resolverDestinoStorage({ STORAGE_BACKUP_PATH: "D:\\bkp", BACKUP_PATH: "F:\\b" } as NodeJS.ProcessEnv)).toBe(
      "D:\\bkp",
    );
  });

  it("cai em BACKUP_PATH/storage", () => {
    const d = resolverDestinoStorage({ BACKUP_PATH: "F:\\backups" } as NodeJS.ProcessEnv);
    expect(d.replace(/\//g, "\\")).toBe("F:\\backups\\storage");
  });
});
