import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

describe("classeDoStatus — contraste AA do selo 'perigo' (Download bloqueado, bloqueio do ciclo)", () => {
  // Lê os tokens do tema direto do globals.css: o selo é texto de 10 px, precisa de 4,5:1 nos dois temas,
  // sobre o card, o fundo da página e o fundo de linha (muted).
  const css = readFileSync(path.resolve(__dirname, "..", "..", "app", "globals.css"), "utf8");
  const bloco = (seletor: string) => {
    const i = css.indexOf(`${seletor} {`);
    return css.slice(i, css.indexOf("}", i));
  };
  const token = (b: string, nome: string) => {
    const m = new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i").exec(b);
    if (!m) throw new Error(`token --${nome} não achado`);
    return m[1];
  };
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  for (const [tema, seletor] of [["claro", ":root"], ["escuro", ".dark"]] as const) {
    it(`tema ${tema}: texto do selo ≥ 4,5:1`, () => {
      const b = bloco(seletor);
      const classe = classeDoStatus("perigo");
      const texto = /\btext-([a-z-]+)/.exec(classe)![1];
      const fundo = /\bbg-([a-z-]+)\/(\d+)/.exec(classe)!;
      const alfa = Number(fundo[2]) / 100;
      for (const base of ["card", "background", "muted"]) {
        const sob = rgb(token(b, base));
        const tinta = rgb(token(b, fundo[1]));
        const mistura = tinta.map((t, i) => t * alfa + sob[i] * (1 - alfa));
        expect(contraste(rgb(token(b, texto)), mistura), `${tema} sobre ${base}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
