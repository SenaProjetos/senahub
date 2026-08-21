import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F3.3 — a dívida de auditoria do Comercial, travada por teste em vez de por `grep` manual.
 *
 * Sem `entidadeId`, o `AuditLog` registra que "alguém editou um lead" mas não QUAL. A tela de
 * histórico por entidade filtra exatamente por esse campo, então a linha simplesmente não
 * aparece em lugar nenhum — o registro existe e é inútil. Era o estado de 23 das 31 actions.
 *
 * O aceite original da tarefa era um `grep`. Um teste é melhor: `grep` alguém roda uma vez e
 * esquece; isto quebra a suíte no dia em que uma action nova nascer sem o campo.
 */
const FONTE = readFileSync(join(process.cwd(), "src/modules/comercial/actions.ts"), "utf8");

/**
 * Recorta o bloco de configuração de cada `defineAction` — o primeiro argumento, do `{` que abre
 * até o `}` que fecha no mesmo nível. Contar chaves é o suficiente aqui e evita trazer um parser
 * de TypeScript para dentro de um teste.
 */
function blocosDeConfig(fonte: string): { acao: string; config: string }[] {
  const blocos: { acao: string; config: string }[] = [];
  const re = /defineAction\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    let i = m.index + m[0].length - 1; // posiciona no `{`
    let nivel = 0;
    const inicio = i;
    for (; i < fonte.length; i++) {
      if (fonte[i] === "{") nivel++;
      else if (fonte[i] === "}") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    const config = fonte.slice(inicio, i + 1);
    const acao = /acao:\s*"([^"]+)"/.exec(config)?.[1] ?? "(sem acao)";
    blocos.push({ acao, config });
  }
  return blocos;
}

describe("toda action do Comercial identifica a entidade que tocou", () => {
  const blocos = blocosDeConfig(FONTE);

  it("encontrou todas as actions do arquivo", () => {
    const declaradas = (FONTE.match(/defineAction\(/g) ?? []).length;
    expect(blocos).toHaveLength(declaradas);
    expect(blocos.length).toBeGreaterThan(25);
  });

  it("nenhuma fica sem `entidadeId`", () => {
    const semId = blocos.filter((b) => !/\bentidadeId:/.test(b.config)).map((b) => b.acao);
    expect(semId).toEqual([]);
  });

  it("nenhuma fica sem `entidade`", () => {
    // `entidade` sem `entidadeId` audita pela metade; `entidadeId` sem `entidade` não diz de que
    // tabela é o id. Os dois andam juntos.
    const semEntidade = blocos.filter((b) => !/\bentidade:/.test(b.config)).map((b) => b.acao);
    expect(semEntidade).toEqual([]);
  });

  it("toda action declara `acao`", () => {
    expect(blocos.filter((b) => b.acao === "(sem acao)")).toEqual([]);
  });
});
