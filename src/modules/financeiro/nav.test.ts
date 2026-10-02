import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { itemAtual, itensDaNavFinanceiro, todosOsItens, type FlagsNavFinanceiro } from "@/modules/financeiro/nav";

const nenhuma: FlagsNavFinanceiro = { ver: false, resultados: false, aprovar: false, conciliar: false, gerir: false, fechar: false, folhaPj: false };
const tudo: FlagsNavFinanceiro = { ver: true, resultados: true, aprovar: true, conciliar: true, gerir: true, fechar: true, folhaPj: true };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("navegação do Financeiro por gate (mock de 2026-10-02)", () => {
  it("sem nenhuma permissão não há link", () => {
    expect(todosOsItens(itensDaNavFinanceiro(nenhuma))).toEqual([]);
  });

  it("só leitura (ver): 3 diretos, fluxo e extrato, planejamento e documentos — sem DRE, sem gestão", () => {
    const n = itensDaNavFinanceiro({ ...nenhuma, ver: true });
    expect(ids(n.principais)).toEqual(["visao", "lancamentos", "contas"]);
    expect(ids(n.movimentacoes)).toEqual(["fluxo", "extrato"]);
    expect(ids(n.planejamento)).toEqual(["planejador", "cenarios", "caixinhas", "distribuicao", "orcamento"]);
    expect(n.resultados).toEqual([]);
    expect(ids(n.mais)).toEqual(["documentos"]);
  });

  it("cada permissão abre só o que a página de destino deixa entrar", () => {
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, resultados: true }).resultados)).toEqual(["dre", "dfc", "balanco", "rentabilidade"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, aprovar: true }).mais)).toEqual(["aprovacoes"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, conciliar: true }).movimentacoes)).toEqual(["conciliacao"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, conciliar: true }).mais)).toEqual(["importar"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, fechar: true }).mais)).toEqual(["fechamento"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, gerir: true }).movimentacoes)).toEqual(["planejamento"]);
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, gerir: true }).mais)).toEqual(["regras", "cadastros", "configuracoes"]);
    // A Produção tem gate próprio (`folha_pj`): quem paga projetista não precisa gerir o resto.
    expect(ids(itensDaNavFinanceiro({ ...nenhuma, folhaPj: true }).mais)).toEqual(["producao"]);
  });

  it("todo href aponta para uma página que existe", () => {
    const raiz = join(__dirname, "..", "..", "app", "(dashboard)");
    for (const i of todosOsItens(itensDaNavFinanceiro(tudo))) {
      const pasta = join(raiz, i.href.split("?")[0].replace(/^\//, ""));
      expect(existsSync(join(pasta, "page.tsx")), `${i.href} sem page.tsx`).toBe(true);
    }
    expect(readdirSync(raiz).length).toBeGreaterThan(0);
  });

  it("id de item é único e o rótulo novo está marcado", () => {
    const todos = todosOsItens(itensDaNavFinanceiro(tudo));
    expect(new Set(ids(todos)).size).toBe(todos.length);
    expect(todos.find((i) => i.id === "extrato")?.novo).toBe(true);
    expect(todos.find((i) => i.id === "importar")?.rotulo).toBe("Importar planilha");
  });
});

describe("item atual", () => {
  const todos = todosOsItens(itensDaNavFinanceiro(tudo));
  const por = (id: string) => todos.find((i) => i.id === id)!;

  it("Visão geral só na raiz exata; as demais por prefixo", () => {
    expect(itemAtual(por("visao"), "/financeiro")).toBe(true);
    expect(itemAtual(por("visao"), "/financeiro/fluxo-caixa")).toBe(false);
    expect(itemAtual(por("fluxo"), "/financeiro/fluxo-caixa")).toBe(true);
    expect(itemAtual(por("lancamentos"), "/financeiro/lancamentos/x")).toBe(true);
    expect(itemAtual(por("cenarios"), "/financeiro/cenarios")).toBe(true);
    expect(itemAtual(por("planejador"), "/financeiro/cenarios")).toBe(false);
    expect(itemAtual(por("distribuicao"), "/financeiro/distribuicao")).toBe(true);
  });

  it("Contas marca as duas abas (a de aberto e a de pagas) e as rotas antigas", () => {
    expect(itemAtual(por("contas"), "/financeiro/contas")).toBe(true);
    expect(itemAtual(por("contas"), "/financeiro/contas-a-pagar")).toBe(true);
    expect(itemAtual(por("contas"), "/financeiro/contas-a-receber")).toBe(true);
    expect(itemAtual(por("contas"), "/financeiro/lancamentos")).toBe(false);
  });
});
