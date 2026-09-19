import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão: `await confirm()` dentro de `start(async …)`/`startTransition(async …)`
 * trava a tela. No React 19 o `setState` que abre o diálogo cai na lane da própria async action e
 * o render suspende até ela terminar — mas ela espera o clique num diálogo que nunca aparece.
 * O confirm tem que vir ANTES do start. Achado em 2026-09-13 em 7 telas (botão "não fazia nada").
 */

const RAIZ = path.resolve(__dirname, "../..");

/**
 * Varre `.tsx` e `.ts`: desde que as ações de uma entidade passaram a morar em hooks
 * (`use-acoes-*.ts`), o padrão ruim cabe num arquivo sem JSX. Testes ficam de fora — senão o
 * detector acha as próprias amostras.
 */
function arquivosDeComponente(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivosDeComponente(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

/** Corpo (entre chaves) de cada callback async passado a start/startTransition. */
function corposDeTransicao(src: string): { linha: number; corpo: string }[] {
  const re = /\b(?:start|startTransition)\(\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  const achados: { linha: number; corpo: string }[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    while (i < src.length && nivel > 0) {
      if (src[i] === "{") nivel++;
      else if (src[i] === "}") nivel--;
      i++;
    }
    achados.push({ linha: src.slice(0, m.index).split("\n").length, corpo: src.slice(m.index, i) });
  }
  return achados;
}

describe("confirm() fora de startTransition", () => {
  it("o detector acha o padrão ruim e ignora o bom", () => {
    const ruim = `start(async () => { const ok = await confirm({ title: "x" }); if (!ok) return; })`;
    const bom = `const ok = await confirm({ title: "x" }); if (!ok) return; start(async () => { await acao(); })`;
    expect(corposDeTransicao(ruim).some((c) => /\bawait\s+confirm\(/.test(c.corpo))).toBe(true);
    expect(corposDeTransicao(bom).some((c) => /\bawait\s+confirm\(/.test(c.corpo))).toBe(false);
  });

  it("nenhum componente espera confirm() dentro de uma async transition", () => {
    const violacoes = arquivosDeComponente(RAIZ).flatMap((arquivo) =>
      corposDeTransicao(readFileSync(arquivo, "utf8"))
        .filter((c) => /\bawait\s+confirm\(/.test(c.corpo))
        .map((c) => `${path.relative(RAIZ, arquivo)}:${c.linha}`),
    );
    expect(violacoes).toEqual([]);
  });
});
