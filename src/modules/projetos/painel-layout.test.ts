import { describe, expect, it } from "vitest";
import {
  criarLayoutPainelProjeto,
  layoutPadraoPainelProjeto,
  limitesPainelProjeto,
  normalizarLayoutPainelProjeto,
  PAINEIS_PROJETO,
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
      { versao: 5, itens: [{ id: "progresso", x: 8, y: 12, w: 1, h: 2 }] },
      ["progresso"],
    );

    expect(progresso).toMatchObject({ id: "progresso", x: 8, y: 12, w: 3, h: 5 });
  });

  it("restaura o padrão quando uma preferência salva possui cards sobrepostos", () => {
    const layout = normalizarLayoutPainelProjeto(
      {
        versao: 5,
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
        versao: 5,
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

  // `normalizarLayoutPainelProjeto` cai no padrão quando o layout salvo se sobrepõe, mas não
  // valida o próprio padrão: um arranjo inicial inválido quebraria a grade de todo mundo em
  // silêncio. Como `layoutPadraoPainelProjeto` só REMOVE itens, checar os 14 cobre todo
  // subconjunto que a filtragem por permissão/dados possa gerar.
  it("mantém o arranjo padrão completo válido: sem sobreposição e dentro da grade", () => {
    const layout = layoutPadraoPainelProjeto(PAINEIS_PROJETO);

    expect(layout).toHaveLength(PAINEIS_PROJETO.length);

    for (const item of layout) {
      const limites = limitesPainelProjeto(item.id);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(24);
      expect(item.w).toBeGreaterThanOrEqual(limites.minW);
      expect(item.w).toBeLessThanOrEqual(limites.maxW);
      expect(item.h).toBeGreaterThanOrEqual(limites.minH);
      expect(item.h).toBeLessThanOrEqual(limites.maxH);
    }

    for (const [indice, item] of layout.entries()) {
      for (const outro of layout.slice(indice + 1)) {
        const sobrepoe =
          item.x < outro.x + outro.w &&
          item.x + item.w > outro.x &&
          item.y < outro.y + outro.h &&
          item.y + item.h > outro.y;
        expect(sobrepoe, `${item.id} sobrepõe ${outro.id}`).toBe(false);
      }
    }
  });

  // Caminho real de salvamento: `paraLayoutPersistido` manda o layout atual para a action, e
  // sem arrastar nada o layout atual É o padrão. O schema tem limites próprios (x <= 23) que
  // os helpers de grade não checam, então o padrão precisa passar por ele também.
  it("aceita salvar o arranjo padrão sem nenhuma personalização", () => {
    const resultado = salvarLayoutPainelProjetoSchema.safeParse({
      projetoId: "projeto-1",
      layout: criarLayoutPainelProjeto(layoutPadraoPainelProjeto(PAINEIS_PROJETO)),
    });

    expect(resultado.success).toBe(true);
  });

  it("mantém os seis cards de topo estreitáveis até um terço da grade", () => {
    for (const id of ["progresso", "prazo", "area", "entregas", "pendencias", "atualizacao"] as const) {
      expect(limitesPainelProjeto(id)).toMatchObject({ minW: 3, maxW: 12 });
    }
  });

  it("restaura o padrão para preferências de uma versão anterior", () => {
    expect(normalizarLayoutPainelProjeto({ versao: 4, itens: [] }, paineis)).toEqual(layoutPadraoPainelProjeto(paineis));
  });

  it("permite reduzir o resultado financeiro para metade da largura padrão", () => {
    expect(limitesPainelProjeto("financeiro")).toMatchObject({ w: 12, minW: 6 });
  });

  it("aceita salvar cards na segunda metade da grade", () => {
    const resultado = salvarLayoutPainelProjetoSchema.safeParse({
      projetoId: "projeto-1",
      layout: { versao: 5, itens: [{ id: "atividade", x: 12, y: 30, w: 12, h: 8 }] },
    });

    expect(resultado.success).toBe(true);
  });

  it("recusa salvar cards sobrepostos", () => {
    const resultado = salvarLayoutPainelProjetoSchema.safeParse({
      projetoId: "projeto-1",
      layout: {
        versao: 5,
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
