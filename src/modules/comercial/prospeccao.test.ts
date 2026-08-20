import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUS_PROSPECCAO_ATIVOS, prospeccaoTravaEmpresa } from "./prospeccao";

describe("prospeccaoTravaEmpresa", () => {
  it("os 4 status ativos travam a empresa (ADR-18)", () => {
    expect(prospeccaoTravaEmpresa("IDENTIFICADO")).toBe(true);
    expect(prospeccaoTravaEmpresa("CONTATO_INICIADO")).toBe(true);
    expect(prospeccaoTravaEmpresa("EM_CONTATO")).toBe(true);
    expect(prospeccaoTravaEmpresa("QUALIFICADO")).toBe(true);
  });

  it("os 4 terminais liberam a empresa", () => {
    expect(prospeccaoTravaEmpresa("SEM_OPORTUNIDADE")).toBe(false);
    expect(prospeccaoTravaEmpresa("EM_ESPERA")).toBe(false);
    expect(prospeccaoTravaEmpresa("DESCARTADO")).toBe(false);
  });

  it("OPORTUNIDADE_CRIADA libera — é a decisão que sustenta o padrão real do escritório", () => {
    // Záphis aparece 3× e Rbarros 2× em produção: múltiplas obras por cliente é o normal.
    // Se qualificar travasse a empresa, a 2ª obra não poderia ser prospectada.
    expect(prospeccaoTravaEmpresa("OPORTUNIDADE_CRIADA")).toBe(false);
  });

  it("são exatamente 4 status travando, nem mais nem menos", () => {
    expect(STATUS_PROSPECCAO_ATIVOS).toHaveLength(4);
  });
});

describe("acoplamento com o índice parcial do banco", () => {
  /**
   * O `WHERE` dos índices parciais precisa listar exatamente os mesmos status desta constante.
   * Se alguém adicionar um status aqui e esquecer da migration, o banco passa a aceitar o que a
   * UI recusa — divergência silenciosa, e o tipo de coisa que só aparece em produção.
   */
  it("a migration lista os mesmos 4 status do módulo", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations/20260820120000_crm_prospeccao_ativa_unica/migration.sql"),
      "utf8",
    );
    for (const s of STATUS_PROSPECCAO_ATIVOS) {
      expect(sql).toContain(`'${s}'`);
    }
    // E não lista nenhum dos que liberam.
    for (const s of ["SEM_OPORTUNIDADE", "EM_ESPERA", "DESCARTADO", "OPORTUNIDADE_CRIADA"]) {
      expect(sql).not.toContain(`'${s}'`);
    }
  });
});
