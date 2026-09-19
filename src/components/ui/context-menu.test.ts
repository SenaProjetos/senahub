import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da regra 1 da ADR-0002: o menu nativo do navegador só é suprimido dentro do
 * `ContextMenu.Trigger` de `components/ui/context-menu.tsx`. Nenhum outro arquivo de `src/`
 * escreve `onContextMenu` nem escuta o evento `contextmenu` à mão — um `preventDefault` solto
 * tira o "abrir em nova aba", o "copiar" e o corretor de quem só queria clicar com o botão
 * direito, sem dar nada em troca.
 *
 * A supressão feita pela biblioteca vive em `node_modules` e não é alvo deste teste.
 */

const RAIZ = path.resolve(__dirname, "../..");

/** O único arquivo autorizado a mencionar o evento. */
const ARQUIVO_DA_PRIMITIVA = path.join("components", "ui", "context-menu.tsx");

/**
 * Exceções: **vazia de propósito**. Incluir um arquivo aqui exige emendar a ADR-0002
 * (`docs/adr/0002-menu-de-contexto.md`); a primeira entrada prevista é o canvas do Estúdio de
 * Documentos, na onda 2.
 */
const EXCECOES: readonly string[] = [];

/**
 * Varre `.ts` e `.tsx`, sem `generated` e sem NENHUM teste — senão este arquivo (e o de qualquer
 * outra guarda) acharia as próprias amostras e falharia. Essa exclusão é do varredor: não conta
 * como exceção da ADR.
 */
function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivosDeCodigo(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

/** Linhas que escrevem o handler ou a string do evento entre aspas. */
export function ocorrenciasDoEvento(src: string): number[] {
  const re = /\bonContextMenu\b|["'`]contextmenu["'`]/g;
  const linhas: number[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    linhas.push(src.slice(0, m.index).split("\n").length);
  }
  return linhas;
}

describe("botão direito só na primitiva do menu de contexto", () => {
  it("o detector acha o handler e a string do evento, e ignora o resto", () => {
    expect(ocorrenciasDoEvento(`<tr onContextMenu={(e) => e.preventDefault()} />`)).toEqual([1]);
    expect(ocorrenciasDoEvento(`el.addEventListener("contextmenu", fn)`)).toEqual([1]);
    expect(ocorrenciasDoEvento(`el.addEventListener('contextmenu', fn)`)).toEqual([1]);
    expect(ocorrenciasDoEvento(`a\nb\n<div onContextMenu={x} />`)).toEqual([3]);

    // O componente do menu e o texto solto não são o evento.
    expect(ocorrenciasDoEvento(`<ContextMenuTrigger render={<li />}>x</ContextMenuTrigger>`)).toEqual([]);
    expect(ocorrenciasDoEvento(`// o menu de contexto abre com o botão direito`)).toEqual([]);
    expect(ocorrenciasDoEvento(`const contextmenuAberto = true`)).toEqual([]);
  });

  it("nenhum arquivo de src/ trata o evento contextmenu fora da primitiva", () => {
    const violacoes = arquivosDeCodigo(RAIZ).flatMap((arquivo) => {
      const rel = path.relative(RAIZ, arquivo);
      if (rel === ARQUIVO_DA_PRIMITIVA || EXCECOES.includes(rel)) return [];
      return ocorrenciasDoEvento(readFileSync(arquivo, "utf8")).map((linha) => `${rel}:${linha}`);
    });
    expect(violacoes).toEqual([]);
  });

  it("a lista de exceções continua vazia (emendar a ADR-0002 antes de incluir arquivo)", () => {
    expect(EXCECOES).toEqual([]);
  });
});
