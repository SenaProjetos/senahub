/**
 * Custo unitário de uma composição a partir de coeficientes × preços — PURO, sem I/O.
 *
 * Recebe *resolvers* em memória (Maps já carregados por quem chama, não Prisma) para ficar
 * testável com fixtures pequenas e reutilizável tanto na tela (composição importada ou própria)
 * quanto num futuro recálculo em lote. Recursivo em `composicaoAux` (composição auxiliar), com
 * detecção de ciclo e profundidade controlada (design §2.1).
 */

export type ItemComposicaoRef = {
  tipo: "insumo" | "composicao";
  /** Id do insumo (tipo=insumo) ou da composição auxiliar (tipo=composicao). */
  refId: string;
  coeficiente: number;
};

export type ResolverItensComposicao = (composicaoId: string) => ItemComposicaoRef[] | undefined;
export type ResolverPrecoInsumo = (insumoId: string) => number | undefined;

export type ResultadoCustoUnitario =
  | {
      ok: true;
      custoUnitario: number;
      /** Ids de insumo sem preço na base/UF/regime escolhido — custo é parcial, não abortado. */
      semPreco: string[];
    }
  | { ok: false; erro: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

class ErroCalculoComposicao extends Error {}

/** Calcula o custo unitário de `composicaoId`, resolvendo itens e preços via callback. */
export function calcularCustoUnitario(
  composicaoId: string,
  resolverItens: ResolverItensComposicao,
  resolverPreco: ResolverPrecoInsumo,
  opts: { profundidadeMax?: number } = {},
): ResultadoCustoUnitario {
  const profundidadeMax = opts.profundidadeMax ?? 8;
  const semPreco = new Set<string>();

  function custoDe(id: string, caminho: string[]): number {
    if (caminho.includes(id)) {
      throw new ErroCalculoComposicao(`Ciclo de composição auxiliar detectado: ${[...caminho, id].join(" → ")}.`);
    }
    if (caminho.length >= profundidadeMax) {
      throw new ErroCalculoComposicao(
        `Profundidade máxima de composição auxiliar (${profundidadeMax}) excedida a partir de "${id}".`,
      );
    }
    const itens = resolverItens(id);
    if (!itens) {
      throw new ErroCalculoComposicao(`Composição "${id}" não encontrada.`);
    }
    const proximoCaminho = [...caminho, id];
    let total = 0;
    for (const item of itens) {
      if (item.tipo === "insumo") {
        const preco = resolverPreco(item.refId);
        if (preco === undefined) {
          semPreco.add(item.refId);
        } else {
          total += preco * item.coeficiente;
        }
      } else {
        total += custoDe(item.refId, proximoCaminho) * item.coeficiente;
      }
    }
    return total;
  }

  try {
    const total = custoDe(composicaoId, []);
    return { ok: true, custoUnitario: round2(total), semPreco: [...semPreco] };
  } catch (err) {
    if (err instanceof ErroCalculoComposicao) return { ok: false, erro: err.message };
    throw err;
  }
}
