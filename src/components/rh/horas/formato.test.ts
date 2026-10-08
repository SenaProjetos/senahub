import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESTINO_OUTROS, DESTINO_REUNIOES, DESTINO_SEM_PROJETO } from "@/modules/rh/produtividade/horas";
import { CORES_COMPARACAO, corDoDestino, proximoFoco } from "./formato";

/**
 * As cores são tokens; dois tokens diferentes podem ter o MESMO valor (`--info` = `--chart-3`).
 * Este teste resolve cada token no `globals.css`, nos dois temas, e exige cores distintas numa pilha
 * cheia (5 projetos + Outros + Reuniões + Sem projeto) — senão a legenda mente.
 */
const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");

function blocosDeTema(): string[] {
  // 1º bloco = tema claro (:root), 2º = escuro (primeira redefinição de --chart-3).
  const indices = [...css.matchAll(/--chart-3:\s*([^;]+);/g)].map((m) => m.index!);
  return indices.slice(0, 2).map((i, k) => css.slice(k === 0 ? 0 : indices[0] + 1, i + 200));
}

function resolver(cor: string, bloco: string): string {
  return cor.replace(/var\((--[a-z0-9-]+)\)/g, (_, token: string) => {
    const achados = [...bloco.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))];
    return achados.length ? achados[achados.length - 1][1].trim().toLowerCase() : token;
  });
}

describe("cores do gráfico de horas", () => {
  const pilha = [
    ...CORES_COMPARACAO.map((_, i) => corDoDestino(`p:${i}`, i)),
    corDoDestino(DESTINO_OUTROS, 5),
    corDoDestino(DESTINO_REUNIOES, 6),
    corDoDestino(DESTINO_SEM_PROJETO, 7),
  ];

  it.each([0, 1])("pilha cheia não repete cor resolvida (tema %i)", (tema) => {
    const bloco = blocosDeTema()[tema];
    const resolvidas = pilha.map((c) => resolver(c, bloco));
    expect(new Set(resolvidas).size).toBe(resolvidas.length);
  });
});

describe("proximoFoco (uma parada de Tab no gráfico; setas andam entre os dias)", () => {
  it.each([
    [3, "ArrowRight", 10, 4],
    [3, "ArrowLeft", 10, 2],
    [9, "ArrowRight", 10, 9],
    [0, "ArrowLeft", 10, 0],
    [5, "Home", 10, 0],
    [5, "End", 10, 9],
  ])("de %i com %s (total %i) vai para %i", (atual, tecla, total, esperado) => {
    expect(proximoFoco(atual, tecla, total)).toBe(esperado);
  });
  it("outra tecla não move (null = deixa o navegador tratar)", () => {
    expect(proximoFoco(3, "Tab", 10)).toBeNull();
  });
});
