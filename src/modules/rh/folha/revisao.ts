/**
 * O que mudou num holerite entre a versão que o funcionário assinou e a atual (depois de o RH
 * reabrir e corrigir a folha). Puro: sem Prisma/Next, roda no servidor e no teste.
 *
 * Itens são casados por descrição + tipo, na ordem em que aparecem (duas linhas "Diferença salarial"
 * viram dois pares, não um). Valores em reais com 2 casas; comparação em centavos.
 */

export type ItemHolerite = { descricao: string; tipo: "provento" | "desconto"; valor: number };

export type MudancaHolerite =
  | { kind: "adicionado"; descricao: string; tipo: ItemHolerite["tipo"]; depois: number }
  | { kind: "removido"; descricao: string; tipo: ItemHolerite["tipo"]; antes: number }
  | { kind: "alterado"; descricao: string; tipo: ItemHolerite["tipo"]; antes: number; depois: number };

export type RevisaoHolerite = {
  /** Quando o funcionário assinou a versão revogada. */
  assinadoAnteriorEm: string;
  mudancas: MudancaHolerite[];
  liquidoAntes: number;
  liquidoDepois: number;
};

const centavos = (v: number) => Math.round(v * 100);

export function liquidoDeItens(itens: ItemHolerite[]): number {
  const c = itens.reduce((s, it) => s + (it.tipo === "provento" ? 1 : -1) * centavos(it.valor), 0);
  return c / 100;
}

export function diffHolerite(antes: ItemHolerite[], depois: ItemHolerite[]): MudancaHolerite[] {
  const restantes = [...depois];
  const mudancas: MudancaHolerite[] = [];

  for (const a of antes) {
    const i = restantes.findIndex((d) => d.descricao === a.descricao && d.tipo === a.tipo);
    if (i === -1) {
      mudancas.push({ kind: "removido", descricao: a.descricao, tipo: a.tipo, antes: a.valor });
      continue;
    }
    const [d] = restantes.splice(i, 1);
    if (centavos(d.valor) !== centavos(a.valor)) {
      mudancas.push({ kind: "alterado", descricao: a.descricao, tipo: a.tipo, antes: a.valor, depois: d.valor });
    }
  }
  for (const d of restantes) {
    mudancas.push({ kind: "adicionado", descricao: d.descricao, tipo: d.tipo, depois: d.valor });
  }
  return mudancas;
}

/** Lê o JSON guardado em `Holerite.itensAssinadosAntes`; qualquer coisa fora do formato vira `null`. */
export function lerItensGuardados(json: unknown): ItemHolerite[] | null {
  if (!Array.isArray(json)) return null;
  const itens: ItemHolerite[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") return null;
    const { descricao, tipo, valor } = raw as Record<string, unknown>;
    if (typeof descricao !== "string" || typeof valor !== "number") return null;
    if (tipo !== "provento" && tipo !== "desconto") return null;
    itens.push({ descricao, tipo, valor });
  }
  return itens;
}

/**
 * `null` quando não há assinatura revogada. Quando a assinatura foi revogada mas o snapshot não
 * existe (ou é ilegível), devolve a revisão SEM detalhe (`mudancas` vazio, líquidos iguais ao atual):
 * a tela diz que a folha foi corrigida sem listar linhas que não sabe.
 */
export function montarRevisao(
  assinaturaAnteriorEm: Date | null,
  itensAntesJson: unknown,
  itensAtuais: ItemHolerite[],
): (RevisaoHolerite & { semDetalhe: boolean }) | null {
  if (!assinaturaAnteriorEm) return null;
  const antes = lerItensGuardados(itensAntesJson);
  if (!antes) {
    const l = liquidoDeItens(itensAtuais);
    return {
      assinadoAnteriorEm: assinaturaAnteriorEm.toISOString(),
      mudancas: [],
      liquidoAntes: l,
      liquidoDepois: l,
      semDetalhe: true,
    };
  }
  return {
    assinadoAnteriorEm: assinaturaAnteriorEm.toISOString(),
    mudancas: diffHolerite(antes, itensAtuais),
    liquidoAntes: liquidoDeItens(antes),
    liquidoDepois: liquidoDeItens(itensAtuais),
    semDetalhe: false,
  };
}
