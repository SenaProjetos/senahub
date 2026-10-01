import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { itemAtual, itensDaNavFinanceiro, type FlagsNavFinanceiro } from "@/modules/financeiro/nav";

const nenhuma: FlagsNavFinanceiro = { ver: false, resultados: false, aprovar: false, conciliar: false, gerir: false, fechar: false };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("navegação do Financeiro por gate", () => {
  it("sem nenhuma permissão não há link", () => {
    expect(itensDaNavFinanceiro(nenhuma)).toEqual({ principais: [], resultados: [], mais: [] });
  });

  it("só leitura (ver): as 6 telas de uso diário, orçamento e documentos — sem DRE, sem gestão", () => {
    const n = itensDaNavFinanceiro({ ...nenhuma, ver: true });
    expect(ids(n.principais)).toEqual(["visao", "planejador", "fluxo", "pagar", "receber", "lancamentos"]);
    expect(ids(n.resultados)).toEqual(["orcamento"]);
    expect(ids(n.mais)).toEqual(["documentos"]);
  });

  it("resultados abre os relatórios; aprovar, conciliar, gerir e fechar abrem os de Mais", () => {
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, resultados: true }).resultados)).toEqual(["dre", "rentabilidade", "dfc", "balanco"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, aprovar: true }).mais)).toEqual(["aprovacoes"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, conciliar: true }).mais)).toEqual(["conciliacao", "importar"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, fechar: true }).mais)).toEqual(["fechamento"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, gerir: true }).mais)).toEqual(["planejamento", "cadastros", "configuracoes"]);
  });

  it("todo href aponta para uma página que existe", () => {
    const raiz = join(__dirname, "..", "..", "app", "(dashboard)");
    const tudo = itensDaNavFinanceiro({ ver: true, resultados: true, aprovar: true, conciliar: true, gerir: true, fechar: true });
    for (const i of [...tudo.principais, ...tudo.resultados, ...tudo.mais]) {
      const pasta = join(raiz, i.href.split("?")[0].replace(/^\//, ""));
      expect(existsSync(join(pasta, "page.tsx")), `${i.href} sem page.tsx`).toBe(true);
    }
    expect(readdirSync(raiz).length).toBeGreaterThan(0);
  });
});

describe("item atual", () => {
  const n = itensDaNavFinanceiro({ ver: true, resultados: true, aprovar: true, conciliar: true, gerir: true, fechar: true });
  const por = (id: string) => [...n.principais, ...n.resultados, ...n.mais].find((i) => i.id === id)!;

  it("Visão geral só na raiz exata; as demais por prefixo", () => {
    expect(itemAtual(por("visao"), "/financeiro", null)).toBe(true);
    expect(itemAtual(por("visao"), "/financeiro/fluxo-caixa", null)).toBe(false);
    expect(itemAtual(por("fluxo"), "/financeiro/fluxo-caixa", null)).toBe(true);
    expect(itemAtual(por("lancamentos"), "/financeiro/lancamentos/x", null)).toBe(true);
  });

  it("A pagar × A receber se distinguem pela aba da mesma rota", () => {
    expect(itemAtual(por("pagar"), "/financeiro/contas", null)).toBe(true);
    expect(itemAtual(por("receber"), "/financeiro/contas", null)).toBe(false);
    expect(itemAtual(por("receber"), "/financeiro/contas", "receita")).toBe(true);
    expect(itemAtual(por("pagar"), "/financeiro/contas", "receita")).toBe(false);
    expect(itemAtual(por("pagar"), "/financeiro/lancamentos", null)).toBe(false);
  });
});
