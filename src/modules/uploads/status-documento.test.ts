import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHAVE_STATUS,
  CORES_STATUS,
  classeDoStatus,
  statusAoAprovar,
  statusAoDesaprovar,
  statusAoEnviarRevisao,
  type StatusAtual,
} from "./status-documento";

const st = (chave: string | null, final = false): StatusAtual => ({ chave, final });

describe("revisão nova → Enviado", () => {
  it("o 1º arquivo da revisão vigente põe Enviado, venha de onde vier", () => {
    for (const atual of [null, st("em_elaboracao"), st("aprovado"), st("compartilhado"), st("liberado_obra"), st(null)]) {
      expect(statusAoEnviarRevisao({ atual, primeiroArquivoDaRevisao: true, revisaoVigente: true })).toBe("enviado");
    }
  });

  it("o DWG que chega depois na mesma revisão não muda nada", () => {
    expect(statusAoEnviarRevisao({ atual: st("aprovado"), primeiroArquivoDaRevisao: false, revisaoVigente: true })).toBeNull();
  });

  it("revisão antiga, status final ou já Enviado: nada", () => {
    expect(statusAoEnviarRevisao({ atual: null, primeiroArquivoDaRevisao: true, revisaoVigente: false })).toBeNull();
    expect(statusAoEnviarRevisao({ atual: st("obsoleto", true), primeiroArquivoDaRevisao: true, revisaoVigente: true })).toBeNull();
    expect(statusAoEnviarRevisao({ atual: st("enviado"), primeiroArquivoDaRevisao: true, revisaoVigente: true })).toBeNull();
  });
});

describe("prancha validada → Aprovado", () => {
  it("anda o fluxo de quem ainda não estava aprovado", () => {
    for (const atual of [null, st("em_elaboracao"), st("enviado"), st("em_analise"), st("correcao_solicitada")]) {
      expect(statusAoAprovar({ atual, revisaoVigente: true })).toBe("aprovado");
    }
  });

  it("nunca desfaz um passo dado à mão nem mexe em status do escritório ou final", () => {
    for (const atual of [st("aprovado"), st("aprovado_ressalvas"), st("compartilhado"), st("liberado_obra"), st(null), st("arquivado", true)]) {
      expect(statusAoAprovar({ atual, revisaoVigente: true })).toBeNull();
    }
  });

  it("validar arquivo de revisão antiga não mexe no status", () => {
    expect(statusAoAprovar({ atual: st("enviado"), revisaoVigente: false })).toBeNull();
  });
});

describe("validação desfeita", () => {
  const base = { revisaoVigente: true, aindaHaValidadoNaVigente: false };

  it("desfaz só o Aprovado que a validação pôs", () => {
    expect(statusAoDesaprovar({ ...base, atual: st("aprovado"), motivo: "reverter" })).toBe("enviado");
    expect(statusAoDesaprovar({ ...base, atual: st("aprovado"), motivo: "correcao" })).toBe("correcao_solicitada");
    expect(statusAoDesaprovar({ ...base, atual: st("compartilhado"), motivo: "correcao" })).toBeNull();
    expect(statusAoDesaprovar({ ...base, atual: null, motivo: "reverter" })).toBeNull();
  });

  it("o PDF ainda validado segura o Aprovado quando se reverte o DWG", () => {
    expect(statusAoDesaprovar({ ...base, aindaHaValidadoNaVigente: true, atual: st("aprovado"), motivo: "reverter" })).toBeNull();
  });

  it("revisão antiga: nada", () => {
    expect(statusAoDesaprovar({ ...base, revisaoVigente: false, atual: st("aprovado"), motivo: "reverter" })).toBeNull();
  });
});

describe("cor da badge", () => {
  it("desconhecida ou vazia cai no neutro", () => {
    expect(classeDoStatus(null)).toBe(classeDoStatus("neutro"));
    expect(classeDoStatus("#ff0000")).toBe(classeDoStatus("neutro"));
    expect(classeDoStatus("aprovado")).toContain("text-status-aprovado");
  });

  it("toda cor e toda chave da migração existem no mapa", () => {
    const sql = readFileSync("prisma/migrations/20260929150000_documento_status_compartilhado/migration.sql", "utf-8");
    const cores = [...sql.matchAll(/COALESCE\("cor", '([a-z_]+)'\)/g)].map((m) => m[1]);
    const chaves = [...sql.matchAll(/SET "chave" = '([a-z_]+)'/g)].map((m) => m[1]);
    expect(cores.length).toBe(10);
    for (const c of cores) expect(CORES_STATUS).toContain(c);
    expect(new Set(chaves)).toEqual(new Set(Object.values(CHAVE_STATUS)));
  });
});
