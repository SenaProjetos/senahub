/**
 * Código da EAP (`1.2.3`) — a POSIÇÃO hierárquica de uma linha.
 *
 * PURO: sem I/O. Recebe a árvore e devolve o código de cada linha.
 *
 * Não confundir com identidade. O Doc 02 §30 separa as três coisas, e elas não se
 * substituem:
 *
 *   `idCorporativo` ATV-01842  identidade permanente  NUNCA muda
 *   `codigoEap`     3.2.4      posição hierárquica    muda ao mover a linha
 *   classificadores ELE/EXE    características        mudam com a natureza
 *
 * Mover "Revisão interna" de lugar recalcula o código e deixa o `idCorporativo` intacto:
 * continua sendo a mesma atividade, agora noutro ponto da árvore. É por isso que o código
 * NUNCA pode ser usado como chave (Doc 02 §4.2) — e por isso a mudança dele precisa de
 * histórico, que é o que permite reconstruir a estrutura de um cronograma numa data
 * passada (Doc 02 §27), coisa que projeto contratual e auditoria exigem.
 */

export type NoEap = {
  id: string;
  parentId: string | null;
  /** Posição entre os irmãos. Empate é desempatado pelo `id`, para o resultado ser estável. */
  ordem: number;
};

export type CodigoCalculado = {
  id: string;
  codigo: string;
  /** Profundidade na árvore: raiz = 1. Útil para indentar a tela sem recalcular. */
  nivel: number;
};

/**
 * Calcula o código de cada linha a partir da árvore.
 *
 * Linha órfã (aponta para um pai que não está no conjunto) é tratada como RAIZ, em vez de
 * sumir do resultado: uma linha sem código não aparece na tela, e o coordenador perderia
 * trabalho sem entender por quê. Ciclo de parentesco também cai aqui — a linha entra como
 * raiz e a árvore continua desenhável.
 */
export function calcularCodigos(nos: NoEap[]): CodigoCalculado[] {
  const conhecidos = new Set(nos.map((n) => n.id));

  // Pai válido = existe no conjunto e não é a própria linha.
  const paiDe = new Map<string, string | null>();
  for (const n of nos) {
    const pai = n.parentId && n.parentId !== n.id && conhecidos.has(n.parentId) ? n.parentId : null;
    paiDe.set(n.id, pai);
  }

  // Um ciclo (a → b → a) deixaria a recursão infinita; quem estiver em ciclo vira raiz.
  for (const n of nos) {
    const visto = new Set<string>([n.id]);
    let atual = paiDe.get(n.id) ?? null;
    while (atual) {
      if (visto.has(atual)) {
        paiDe.set(n.id, null);
        break;
      }
      visto.add(atual);
      atual = paiDe.get(atual) ?? null;
    }
  }

  const filhos = new Map<string | null, NoEap[]>();
  for (const n of nos) {
    const pai = paiDe.get(n.id) ?? null;
    const lista = filhos.get(pai);
    if (lista) lista.push(n);
    else filhos.set(pai, [n]);
  }
  for (const lista of filhos.values()) {
    lista.sort((a, b) => (a.ordem !== b.ordem ? a.ordem - b.ordem : a.id.localeCompare(b.id)));
  }

  const saida: CodigoCalculado[] = [];
  const descer = (pai: string | null, prefixo: string, nivel: number) => {
    const lista = filhos.get(pai) ?? [];
    lista.forEach((n, i) => {
      const codigo = prefixo ? `${prefixo}.${i + 1}` : String(i + 1);
      saida.push({ id: n.id, codigo, nivel });
      descer(n.id, codigo, nivel + 1);
    });
  };
  descer(null, "", 1);
  return saida;
}

export type MudancaCodigo = {
  tarefaId: string;
  codigoAnterior: string | null;
  codigoNovo: string;
};

/**
 * Quais linhas mudaram de código — o que vira `EapCodigoHistorico`.
 *
 * Só as que mudaram de verdade: gravar histórico de linha que ficou onde estava encheria
 * a tabela e escondería a mudança real no meio do ruído.
 */
export function diferencaDeCodigos(
  atuais: Map<string, string | null>,
  calculados: CodigoCalculado[],
): MudancaCodigo[] {
  const mudancas: MudancaCodigo[] = [];
  for (const c of calculados) {
    const anterior = atuais.get(c.id) ?? null;
    if (anterior !== c.codigo) {
      mudancas.push({ tarefaId: c.id, codigoAnterior: anterior, codigoNovo: c.codigo });
    }
  }
  return mudancas;
}

/**
 * Ordena códigos como a tela mostra: `1.2` antes de `1.10`, e não em ordem alfabética.
 *
 * Comparação de texto puro colocaria `1.10` antes de `1.2` — o bug clássico de numeração
 * em string, que numa EAP de 185 linhas embaralha a árvore inteira.
 */
export function compararCodigos(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
