/**
 * Árvore hierárquica do orçamento (grupo → subgrupo → serviço) — PURO, sem Prisma.
 * Código WBS, herança de BDI (item → grupo → orçamento) e roll-up de totais.
 *
 * `recalcularIncremental` assume que a alteração está confinada ao próprio nó (sua
 * `quantidade`/`custoUnitario`/`bdiPercentual`) — recalcula só o caminho até a raiz (§7 do
 * design). Mudar o `bdiPercentual` de um GRUPO afeta toda a subárvore por herança; nesse caso
 * o chamador deve rodar `rollUp` na subárvore inteira, não `recalcularIncremental`.
 */
import { aplicarBdi } from "./bdi";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type TipoItemOrcamento = "grupo" | "servico";

export type NoOrcamento = {
  id: string;
  parentId: string | null;
  tipo: TipoItemOrcamento;
  ordem: number;
  quantidade: number;
  /** Custo unitário materializado (já resolvido da composição, ou digitado). */
  custoUnitario: number;
  /** null = herda do pai mais próximo com valor, ou do orçamento. */
  bdiPercentual: number | null;
  /** Preço travado — não impede o roll-up (que só lê o campo), é contrato do chamador (C2). */
  bloqueado: boolean;
};

export type NoArvore = NoOrcamento & { filhos: NoArvore[] };

export type Totais = { totalSemBdi: number; totalComBdi: number };

export type ResultadoArvore =
  | { ok: true; raizes: NoArvore[]; porId: Map<string, NoArvore> }
  | { ok: false; erro: string };

/** Monta a árvore a partir da lista flat (como vem do Prisma). Detecta órfão e ciclo. */
export function montarArvore(nos: NoOrcamento[]): ResultadoArvore {
  const porIdFlat = new Map<string, NoOrcamento>(nos.map((n) => [n.id, n]));

  for (const n of nos) {
    if (n.parentId !== null && !porIdFlat.has(n.parentId)) {
      return { ok: false, erro: `Nó órfão: "${n.id}" aponta para o pai inexistente "${n.parentId}".` };
    }
  }
  for (const n of nos) {
    const visitados = new Set<string>();
    let atual: NoOrcamento | undefined = n;
    while (atual && atual.parentId !== null) {
      if (visitados.has(atual.id)) {
        return { ok: false, erro: `Ciclo detectado envolvendo o nó "${n.id}".` };
      }
      visitados.add(atual.id);
      atual = porIdFlat.get(atual.parentId);
    }
  }

  const porId = new Map<string, NoArvore>(nos.map((n) => [n.id, { ...n, filhos: [] }]));
  const raizes: NoArvore[] = [];
  for (const n of nos) {
    const no = porId.get(n.id)!;
    if (n.parentId === null) raizes.push(no);
    else porId.get(n.parentId)!.filhos.push(no);
  }
  const porOrdem = (a: NoArvore, b: NoArvore) => a.ordem - b.ordem || a.id.localeCompare(b.id);
  raizes.sort(porOrdem);
  for (const no of porId.values()) no.filhos.sort(porOrdem);

  return { ok: true, raizes, porId };
}

/** Código WBS (1, 1.2, 1.2.3…) por posição na árvore já ordenada. */
export function calcularCodigosWbs(raizes: NoArvore[]): Map<string, string> {
  const codigos = new Map<string, string>();
  function visita(nos: NoArvore[], prefixo: string) {
    nos.forEach((no, i) => {
      const codigo = prefixo ? `${prefixo}.${i + 1}` : `${i + 1}`;
      codigos.set(no.id, codigo);
      if (no.filhos.length > 0) visita(no.filhos, codigo);
    });
  }
  visita(raizes, "");
  return codigos;
}

/** [nó, pai, avô, ..., raiz]. `null` se `noId` não existir na árvore. */
export function caminhoAteRaiz(noId: string, porId: Map<string, NoArvore>): NoArvore[] | null {
  const inicio = porId.get(noId);
  if (!inicio) return null;
  const caminho: NoArvore[] = [];
  const visitados = new Set<string>();
  let atual: NoArvore | undefined = inicio;
  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    caminho.push(atual);
    atual = atual.parentId ? porId.get(atual.parentId) : undefined;
  }
  return caminho;
}

/** Primeiro `bdiPercentual` não nulo caminhando de `caminho[0]` até a raiz; senão o BDI do orçamento. */
export function bdiEfetivo(caminho: readonly { bdiPercentual: number | null }[], bdiOrcamento: number): number {
  for (const no of caminho) {
    if (no.bdiPercentual !== null) return no.bdiPercentual;
  }
  return bdiOrcamento;
}

function totalDoNoFolha(no: NoOrcamento, bdiAqui: number): Totais {
  const totalSemBdi = no.tipo === "servico" ? round2(no.quantidade * no.custoUnitario) : 0;
  return { totalSemBdi, totalComBdi: aplicarBdi(totalSemBdi, bdiAqui) };
}

/** Roll-up completo: da folha até a raiz, para toda a árvore recebida. */
export function rollUp(raizes: NoArvore[], bdiOrcamento: number): Map<string, Totais> {
  const totais = new Map<string, Totais>();
  function visita(no: NoArvore, bdiHerdado: number): Totais {
    const bdiAqui = no.bdiPercentual ?? bdiHerdado;
    let resultado: Totais;
    if (no.filhos.length === 0) {
      resultado = totalDoNoFolha(no, bdiAqui);
    } else {
      let semBdi = 0;
      let comBdi = 0;
      for (const filho of no.filhos) {
        const t = visita(filho, bdiAqui);
        semBdi += t.totalSemBdi;
        comBdi += t.totalComBdi;
      }
      resultado = { totalSemBdi: round2(semBdi), totalComBdi: round2(comBdi) };
    }
    totais.set(no.id, resultado);
    return resultado;
  }
  for (const raiz of raizes) visita(raiz, bdiOrcamento);
  return totais;
}

export type ResultadoRecalculo = { ok: true; totais: Map<string, Totais> } | { ok: false; erro: string };

/**
 * Recalcula só o caminho de `noAlteradoId` até a raiz, reaproveitando `totaisAnteriores` para
 * todo o resto da árvore (nunca refaz o roll-up completo). Ver limitação de escopo no topo do arquivo.
 */
export function recalcularIncremental(
  nos: NoOrcamento[],
  noAlteradoId: string,
  bdiOrcamento: number,
  totaisAnteriores: Map<string, Totais>,
): ResultadoRecalculo {
  const arv = montarArvore(nos);
  if (!arv.ok) return arv;

  const caminho = caminhoAteRaiz(noAlteradoId, arv.porId);
  if (!caminho) return { ok: false, erro: `Nó "${noAlteradoId}" não encontrado na árvore.` };

  const working = new Map(totaisAnteriores);

  for (let i = 0; i < caminho.length; i++) {
    const no = caminho[i];
    const bdiAqui = bdiEfetivo(caminho.slice(i), bdiOrcamento);
    let totalDoNo: Totais;
    if (no.filhos.length === 0) {
      totalDoNo = totalDoNoFolha(no, bdiAqui);
    } else {
      let semBdi = 0;
      let comBdi = 0;
      for (const filho of no.filhos) {
        let t = working.get(filho.id);
        if (!t) {
          // Filho sem total prévio (nó novo, nunca passou por rollUp) — resolve a subárvore dele.
          const sub = rollUp([filho], bdiAqui);
          for (const [id, val] of sub) working.set(id, val);
          t = working.get(filho.id)!;
        }
        semBdi += t.totalSemBdi;
        comBdi += t.totalComBdi;
      }
      totalDoNo = { totalSemBdi: round2(semBdi), totalComBdi: round2(comBdi) };
    }
    working.set(no.id, totalDoNo);
  }

  return { ok: true, totais: working };
}
