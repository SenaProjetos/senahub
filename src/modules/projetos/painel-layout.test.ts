import { describe, expect, it } from "vitest";
import {
  layoutPadraoPainelProjeto,
  limitesPainelProjeto,
  normalizarLayoutPainelProjeto,
  trocarPosicoesPainelProjeto,
  type PainelProjetoId,
} from "./painel-layout";
import { salvarLayoutPainelProjetoSchema } from "./schemas";

const paineis: PainelProjetoId[] = ["progresso", "indicadores", "cronograma"];

describe("layout do painel de projeto", () => {
  it("usa o arranjo padrão quando não há preferência salva", () => {
    expect(normalizarLayoutPainelProjeto(null, paineis)).toEqual(layoutPadraoPainelProjeto(paineis));
  });

  it("preserva a posição válida e respeita o tamanho mínimo do painel", () => {
    const [progresso] = normalizarLayoutPainelProjeto(
      { versao: 4, itens: [{ id: "progresso", x: 8, y: 12, w: 1, h: 2 }] },
      ["progresso"],
    );

    expect(progresso).toMatchObject({ id: "progresso", x: 8, y: 12, w: 3, h: 5 });
  });

  it("restaura o padrão quando uma preferência salva possui cards sobrepostos", () => {
    const layout = normalizarLayoutPainelProjeto(
      {
        versao: 4,
        itens: [
          { id: "progresso", x: 0, y: 0, w: 6, h: 5 },
          { id: "prazo", x: 0, y: 0, w: 6, h: 5 },
        ],
      },
      ["progresso", "prazo"],
    );

    expect(layout).toEqual(layoutPadraoPainelProjeto(["progresso", "prazo"]));
  });

  it("troca cards quando os dois espaços continuam livres", () => {
    const resultado = trocarPosicoesPainelProjeto(
      [
        { id: "progresso", x: 0, y: 0, w: 6, h: 5 },
        { id: "prazo", x: 6, y: 0, w: 6, h: 5 },
      ],
      "progresso",
      "prazo",
    );

    expect(resultado).toEqual([
      { id: "progresso", x: 6, y: 0, w: 6, h: 5 },
      { id: "prazo", x: 0, y: 0, w: 6, h: 5 },
    ]);
  });

  it("não troca cards quando o tamanho tornaria a grade inválida", () => {
    const resultado = trocarPosicoesPainelProjeto(
      [
        { id: "indicadores", x: 0, y: 10, w: 16, h: 5 },
        { id: "cronograma", x: 16, y: 10, w: 8, h: 8 },
      ],
      "indicadores",
      "cronograma",
    );

    expect(resultado).toBeNull();
  });

  it("descarta itens desconhecidos, repetidos e inclui painéis novos no padrão", () => {
    const layout = normalizarLayoutPainelProjeto(
      {
        versao: 4,
        itens: [
          { id: "indicadores", x: 0, y: 18, w: 12, h: 6 },
          { id: "indicadores", x: 0, y: 0, w: 4, h: 5 },
          { id: "inexistente", x: 0, y: 0, w: 12, h: 12 },
        ],
      },
      paineis,
    );

    expect(layout).toHaveLength(3);
    expect(layout.find((item) => item.id === "indicadores")).toMatchObject({ x: 0, y: 18, w: 16, h: 6 });
    expect(layout.find((item) => item.id === "cronograma")).toEqual(layoutPadraoPainelProjeto(["cronograma"])[0]);
  });

  it("mantém indicadores e cronograma alinhados dentro da grade", () => {
    const layout = layoutPadraoPainelProjeto(["indicadores", "cronograma"]);
    const indicadores = layout.find((item) => item.id === "indicadores");
    const cronograma = layout.find((item) => item.id === "cronograma");

    expect(indicadores).toMatchObject({ x: 0, y: 10, w: 16 });
    expect(cronograma).toMatchObject({ x: 16, y: 10, w: 8 });
    expect(indicadores?.y).toBe(cronograma?.y);
    expect((indicadores?.x ?? 0) + (indicadores?.w ?? 0)).toBe(cronograma?.x);
    expect((indicadores?.x ?? 0) + (indicadores?.w ?? 0)).toBeLessThanOrEqual(24);
    expect((cronograma?.x ?? 0) + (cronograma?.w ?? 0)).toBeLessThanOrEqual(24);
  });

  it("permite reduzir os seis cards iniciais para metade da largura padrão", () => {
    for (const id of ["progresso", "prazo", "area", "entregas", "pendencias", "atualizacao"] as const) {
      expect(limitesPainelProjeto(id)).toMatchObject({ w: 6, minW: 3 });
    }
  });

  it("restaura o padrão para preferências de uma versão anterior", () => {
    expect(normalizarLayoutPainelProjeto({ versao: 3, itens: [] }, paineis)).toEqual(layoutPadraoPainelProjeto(paineis));
  });

  it("permite reduzir o resultado financeiro para metade da largura padrão", () => {
    expect(limitesPainelProjeto("financeiro")).toMatchObject({ w: 12, minW: 6 });
  });

  it("aceita salvar cards na segunda metade da grade", () => {
    const resultado = salvarLayoutPainelProjetoSchema.safeParse({
      projetoId: "projeto-1",
      layout: { versao: 4, itens: [{ id: "atividade", x: 12, y: 30, w: 12, h: 8 }] },
    });

    expect(resultado.success).toBe(true);
  });

  it("recusa salvar cards sobrepostos", () => {
    const resultado = salvarLayoutPainelProjetoSchema.safeParse({
      projetoId: "projeto-1",
      layout: {
        versao: 4,
        itens: [
          { id: "atividade", x: 0, y: 30, w: 12, h: 8 },
          { id: "equipe", x: 0, y: 30, w: 12, h: 8 },
        ],
      },
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe("Os cards não podem ocupar a mesma área do painel.");
    }
  });
});
