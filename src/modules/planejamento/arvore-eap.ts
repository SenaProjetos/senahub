/**
 * Mexer na árvore da EAP como no MS Project: recuar (a tarefa vira subtarefa da de cima), avançar (sobe um nível) e
 * inserir uma tarefa acima. PURO — decide O QUE fazer; `arvore-service.ts` grava.
 *
 * A posição entre irmãos vem de `ordem` (empate desfeito pelo `id`), a mesma que `calcularCodigos` lê. `ordem` é um
 * contador do projeto, não uma posição de 1 a N: só a ordem relativa ENTRE IRMÃOS importa, então para pôr uma linha
 * antes de outra basta empurrar as `ordem` maiores uma casa para a frente.
 *
 * Avançar segue o Project: as tarefas que vinham DEPOIS da avançada, no mesmo nível, passam a ser filhas dela — é o
 * que a mantém no mesmo lugar da tela. Sem isso ela pularia para depois das irmãs.
 */

export type NoArvore = { id: string; parentId: string | null; ordem: number; tipoEap: string };

export const MOTIVO_SEM_IRMA_ACIMA = "Não há uma tarefa acima, no mesmo nível, para receber esta como subtarefa.";
export const MOTIVO_IRMA_E_MARCO = "A tarefa acima é um marco e não pode ter subtarefas.";
export const MOTIVO_NIVEL_MAIS_ALTO = "Esta tarefa já está no nível mais alto.";

const comparar = (a: NoArvore, b: NoArvore) => (a.ordem !== b.ordem ? a.ordem - b.ordem : a.id.localeCompare(b.id));

/** Pai válido: existe no conjunto e não é a própria linha (órfã e ciclo contam como raiz, como em `calcularCodigos`). */
function paiDe(n: NoArvore, ids: ReadonlySet<string>): string | null {
  return n.parentId && n.parentId !== n.id && ids.has(n.parentId) ? n.parentId : null;
}

function irmaosDe(nos: readonly NoArvore[], pai: string | null): NoArvore[] {
  const ids = new Set(nos.map((n) => n.id));
  return nos.filter((n) => paiDe(n, ids) === pai).sort(comparar);
}

export type Recuo = { ok: true; novoPaiId: string } | { ok: false; motivo: string };

/** Recuar: a tarefa vira a ÚLTIMA subtarefa da que está logo acima dela, no mesmo nível. */
export function planoDeRecuo(nos: readonly NoArvore[], id: string): Recuo {
  const x = nos.find((n) => n.id === id);
  if (!x) return { ok: false, motivo: "Tarefa não encontrada." };
  const ids = new Set(nos.map((n) => n.id));
  const irmaos = irmaosDe(nos, paiDe(x, ids));
  const anterior = irmaos[irmaos.findIndex((n) => n.id === id) - 1];
  if (!anterior) return { ok: false, motivo: MOTIVO_SEM_IRMA_ACIMA };
  if (anterior.tipoEap === "mrc") return { ok: false, motivo: MOTIVO_IRMA_E_MARCO };
  return { ok: true, novoPaiId: anterior.id };
}

export type Avanco =
  | {
      ok: true;
      /** O novo pai (`null` = raiz): o pai antigo da tarefa. */
      novoPaiId: string | null;
      /** A tarefa entra logo DEPOIS desta, entre os irmãos do novo nível. */
      depoisDeId: string;
      /** As irmãs que vinham depois passam a ser filhas da avançada, nesta ordem. */
      reparentarIds: string[];
    }
  | { ok: false; motivo: string };

/** Avançar: a tarefa sobe um nível e fica logo depois do pai antigo. */
export function planoDeAvanco(nos: readonly NoArvore[], id: string): Avanco {
  const x = nos.find((n) => n.id === id);
  if (!x) return { ok: false, motivo: "Tarefa não encontrada." };
  const ids = new Set(nos.map((n) => n.id));
  const paiId = paiDe(x, ids);
  const pai = nos.find((n) => n.id === paiId);
  if (!pai) return { ok: false, motivo: MOTIVO_NIVEL_MAIS_ALTO };
  const posteriores = irmaosDe(nos, pai.id).filter((n) => comparar(n, x) > 0);
  return { ok: true, novoPaiId: paiDe(pai, ids), depoisDeId: pai.id, reparentarIds: posteriores.map((n) => n.id) };
}

export type Insercao = { ok: true; paiId: string | null; aPartirDeOrdem: number } | { ok: false; motivo: string };

/**
 * Inserir acima: a tarefa nova nasce no mesmo nível de `id`, imediatamente antes dela. `aPartirDeOrdem` é a `ordem`
 * de `id`: empurra-se toda `ordem` maior ou igual uma casa, e a nova ocupa esse lugar.
 */
export function planoDeInsercaoAcima(nos: readonly NoArvore[], id: string): Insercao {
  const x = nos.find((n) => n.id === id);
  if (!x) return { ok: false, motivo: "Tarefa não encontrada." };
  const ids = new Set(nos.map((n) => n.id));
  return { ok: true, paiId: paiDe(x, ids), aPartirDeOrdem: x.ordem };
}
