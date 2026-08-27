import { describe, expect, it } from "vitest";
import { docSchemaZ } from "@/modules/documentos/schema";
import { extrairTokens } from "@/modules/documentos/tokens";
import { catalogo } from "@/modules/juridico/contrato/campos";
import {
  modeloClt,
  modeloCliente,
  modeloEstagio,
  modeloPj,
  modelosDeFabrica,
} from "./modelos-fabrica-contrato";

const BUILTINS = new Set(["hoje", "pagina", "paginas", "grupo"]);

/** Todos os tokens citados no modelo inteiro (todas as bandas, todos os elementos). */
function tokensDoModelo(schema: ReturnType<typeof modeloClt>): string[] {
  const out: string[] = [];
  for (const banda of schema.bandas) {
    for (const el of banda.elementos) {
      if (!el.texto) continue;
      for (const bruto of extrairTokens(el.texto)) {
        if (/^\s*=/.test(bruto)) continue;
        const [expr] = bruto.split(":");
        if (!expr) continue;
        const chave = expr.includes(".") ? expr.split(".").pop()! : expr;
        if (BUILTINS.has(chave.toLowerCase())) continue;
        out.push(chave);
      }
    }
  }
  return out;
}

describe.each([
  ["modeloClt", modeloClt(), "equipe"],
  ["modeloEstagio", modeloEstagio(), "equipe"],
  ["modeloPj", modeloPj(), "equipe"],
  ["modeloCliente", modeloCliente(), "cliente"],
] as const)("%s", (_nome, schema, tipo) => {
  it("é um DocSchema válido — renderizável pelo Estúdio sem retrocompat quebrada", () => {
    const r = docSchemaZ.safeParse(schema);
    expect(r.success, r.success ? "" : JSON.stringify((r as { error?: unknown }).error)).toBe(true);
  });

  it("todo token citado existe no catálogo real do contrato — sem typo de campo", () => {
    // É o valor real deste teste: um `[Salaro]` digitado errado no texto da cláusula passaria
    // batido numa revisão visual e só apareceria em produção como "desconhecido" (Fase E4/M1),
    // depois de alguém já ter tentado gerar um contrato de verdade.
    const conhecidos = new Set(catalogo(tipo).map((c) => c.chave.toLowerCase()));
    const citados = tokensDoModelo(schema);
    expect(citados.length).toBeGreaterThan(3); // sanidade: o modelo cita campos de verdade
    for (const t of citados) {
      expect(conhecidos.has(t.toLowerCase()), `token [${t}] não está no catálogo "${tipo}"`).toBe(true);
    }
  });

  it("liga o bloqueio de campo vazio (E4) — é um documento assinável, não um relatório", () => {
    expect(schema.pagina.bloquearCamposVazios).toBe(true);
  });

  it("ClausulasAdicionais está isento do bloqueio — tem `condicao`", () => {
    const el = schema.bandas[0]!.elementos.find((e) => e.texto === "[ClausulasAdicionais]");
    expect(el?.condicao).toBe("naoVazio([ClausulasAdicionais])");
  });

  it("elementos não se sobrepõem verticalmente", () => {
    const els = [...schema.bandas[0]!.elementos].sort((a, b) => a.y - b.y);
    for (let i = 1; i < els.length; i++) {
      expect(els[i]!.y, `elemento ${i} sobrepõe o anterior`).toBeGreaterThanOrEqual(els[i - 1]!.y + els[i - 1]!.h);
    }
  });
});

describe("modelosDeFabrica", () => {
  it("devolve os 4 modelos com nomes distintos", () => {
    const nomes = modelosDeFabrica().map((m) => m.nome);
    expect(nomes).toHaveLength(4);
    expect(new Set(nomes).size).toBe(4);
  });

  it("os 3 de equipe têm `tipoEquipe`; o de cliente não", () => {
    const m = modelosDeFabrica();
    expect(m.filter((x) => x.tipoEquipe !== null)).toHaveLength(3);
    expect(m.find((x) => x.nome.includes("Cliente"))?.tipoEquipe).toBeNull();
  });
});
