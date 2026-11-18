import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda (início real pelo ponto, 2026-11-17): a primeira hora apontada numa tarefa é o início real da linha da EAP, e
 * quem grava isso é `depoisDoPontoNaTarefa` (`pos-ponto.ts`), chamado pela action DEPOIS de abrir a sessão. Um caminho
 * novo que cria `SessaoTrabalho` e esquece a chamada deixaria a linha sem início real em silêncio.
 *
 * Toda `sessaoTrabalho.create` em `src/` precisa de um comentário `inicio-pelo-ponto:` nas linhas logo acima, dizendo
 * onde o preenchimento acontece (ou por que não se aplica). É uma rede, não uma prova: obriga quem escreve a pensar nisso.
 */
const RAIZ = path.resolve(__dirname, "..", "..");
const JANELA = 4;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return [];
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("sessão de ponto nova pensa no início real da EAP", () => {
  it("toda sessaoTrabalho.create tem o comentário inicio-pelo-ponto: logo acima", () => {
    const achados: string[] = [];
    let total = 0;
    for (const f of arquivos(RAIZ)) {
      const linhas = readFileSync(f, "utf8").split(/\r?\n/);
      linhas.forEach((l, i) => {
        if (!/sessaoTrabalho\.create(Many)?\(/.test(l)) return;
        total++;
        const acima = linhas.slice(Math.max(0, i - JANELA), i).join("\n");
        if (!acima.includes("inicio-pelo-ponto:")) achados.push(`${path.relative(RAIZ, f)}:${i + 1}`);
      });
    }
    expect(total).toBeGreaterThan(0);
    expect(achados).toEqual([]);
  });
});
