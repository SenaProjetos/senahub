import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F7.6 — o critério de aceite tem duas metades: "mover um card com checklist em 0% funciona"
 * (comportamento, coberto no smoke) e "moverEstagio não consulta checklist para autorizar"
 * (ESTRUTURAL — um teste de comportamento com catálogo vazio passaria mesmo com um hard-gate
 * que só dispara quando existe item, então não prova nada sozinho). Este arquivo prova a
 * segunda metade lendo o código-fonte, no mesmo espírito do `blocosDeConfig` de
 * `auditoria.test.ts`: recorta a função pelo nível de chaves, não confia em regex solta.
 */
function corpoDaFuncao(fonte: string, assinatura: RegExp): string {
  const m = assinatura.exec(fonte);
  if (!m) throw new Error(`Assinatura não encontrada: ${assinatura}`);
  let i = fonte.indexOf("{", m.index + m[0].length - 1);
  let nivel = 0;
  const inicio = i;
  for (; i < fonte.length; i++) {
    if (fonte[i] === "{") nivel++;
    else if (fonte[i] === "}") {
      nivel--;
      if (nivel === 0) break;
    }
  }
  return fonte.slice(inicio, i + 1);
}

const SERVICE = readFileSync(join(process.cwd(), "src/modules/comercial/service.ts"), "utf8");
const JORNADA = readFileSync(join(process.cwd(), "src/modules/comercial/jornada.ts"), "utf8");

describe("checklist por estágio (F7.6) é SOFT — nunca hard-gate de moverEstagio", () => {
  it("moverEstagio não referencia checklist em nenhuma forma", () => {
    const corpo = corpoDaFuncao(SERVICE, /export async function moverEstagio\(/);
    expect(corpo.toLowerCase()).not.toContain("checklist");
  });

  it("aplicarMovimentoEstagio (a transação que faz o commit da transição) não referencia checklist", () => {
    const corpo = corpoDaFuncao(SERVICE, /async function aplicarMovimentoEstagio\(/);
    expect(corpo.toLowerCase()).not.toContain("checklist");
  });

  it("jornada.ts (regras de transição válida) não referencia checklist", () => {
    expect(JORNADA.toLowerCase()).not.toContain("checklist");
  });

  it("o motor de regras de automação (F7.1) também não referencia checklist — são eixos independentes", () => {
    const regras = readFileSync(join(process.cwd(), "src/modules/comercial/regras.ts"), "utf8");
    expect(regras.toLowerCase()).not.toContain("checklist");
  });
});
