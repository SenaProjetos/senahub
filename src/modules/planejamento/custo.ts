/**
 * Custo previsto por linha da EAP (F7.1): horas previstas × custo/hora de quem faz
 * (`Recurso.custoHora`). Regras puras, sem I/O — a leitura das taxas fica em `custo-service.ts`.
 *
 * É o "custo da linha de base" do MS Project, que o Valor Agregado (F8) usa como VP. Por isso
 * a regra é a mesma das horas no motor: desconhecido NÃO vira zero. Uma linha com uma pessoa
 * sem custo/hora cadastrado tem custo desconhecido, e um resumo com um filho desconhecido
 * também — somar só o que se sabe daria um orçamento menor que o real sem ninguém perceber.
 *
 * O custo real de quem recebe por entrega (PJ/freelancer) é o PAGAMENTO, não horas × taxa: este
 * número é o previsto pelo cronograma. Quem compara os dois é a F8.
 */

/** Por que a linha não tem custo — a tela diz o que falta cadastrar. */
export type MotivoSemCusto =
  /** A linha (ou alguém nela) ainda não tem horas previstas. */
  | "sem_horas"
  /** Há um perfil (vaga, sem pessoa) com horas: perfil não tem custo/hora. */
  | "perfil"
  /** Uma pessoa com horas não tem custo/hora cadastrado em Recursos. */
  | "sem_custo_hora"
  /** Resumo: alguma linha dentro dele está sem custo. */
  | "filho_sem_custo";

export type CustoLinha = { custo: number; motivo: null } | { custo: null; motivo: MotivoSemCusto };

export const ROTULO_SEM_CUSTO: Record<MotivoSemCusto, string> = {
  sem_horas: "Sem horas previstas",
  perfil: "Perfil (vaga) não tem custo/hora — atribua uma pessoa",
  sem_custo_hora: "Pessoa sem custo/hora cadastrado em Recursos",
  filho_sem_custo: "Alguma atividade dentro está sem custo",
};

const centavos = (v: number) => Math.round(v * 100);

/**
 * Custo de uma linha-folha.
 *
 * `horasDaLinha` é o que o motor usa (`LinhaAgendada.trabalhoHoras`): `null` = não estimada;
 * `0` = zero conhecido (marco, etapa de terceiro). Cada atribuição com hora entra como
 * horas × taxa, arredondada ao centavo; atribuição sem hora não custa nada.
 */
export function custoDaFolha(p: {
  horasDaLinha: number | null;
  atribuicoes: readonly { userId: string | null; horas: number }[];
  /** userId → custo/hora. Quem não está no mapa não tem taxa cadastrada. */
  custoHora: ReadonlyMap<string, number>;
}): CustoLinha {
  if (p.horasDaLinha == null) return { custo: null, motivo: "sem_horas" };
  let total = 0;
  for (const a of p.atribuicoes) {
    if (!(Number.isFinite(a.horas) && a.horas > 0)) continue;
    if (a.userId == null) return { custo: null, motivo: "perfil" };
    const taxa = p.custoHora.get(a.userId);
    if (taxa == null || !Number.isFinite(taxa)) return { custo: null, motivo: "sem_custo_hora" };
    total += centavos(a.horas * taxa);
  }
  return { custo: total / 100, motivo: null };
}

/**
 * Custo de TODAS as linhas: folha pelo `custoDaFolha` já calculado; resumo = soma dos filhos, ou
 * desconhecido se algum filho for. Recursivo por `parentId`, com memória — a EAP é uma árvore,
 * e um ciclo (dado corrompido) é tratado como desconhecido em vez de estourar a pilha.
 */
export function custosComResumo(
  linhas: readonly { id: string; parentId: string | null }[],
  folhas: ReadonlyMap<string, CustoLinha>,
): Map<string, CustoLinha> {
  const filhos = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.parentId == null) continue;
    const lista = filhos.get(l.parentId) ?? [];
    lista.push(l.id);
    filhos.set(l.parentId, lista);
  }
  const memo = new Map<string, CustoLinha>();
  const visitando = new Set<string>();
  const custo = (id: string): CustoLinha => {
    const pronto = memo.get(id);
    if (pronto) return pronto;
    const meus = filhos.get(id) ?? [];
    if (meus.length === 0) {
      const c = folhas.get(id) ?? { custo: null, motivo: "sem_horas" as const };
      memo.set(id, c);
      return c;
    }
    if (visitando.has(id)) return { custo: null, motivo: "filho_sem_custo" };
    visitando.add(id);
    let total = 0;
    let r: CustoLinha | null = null;
    for (const f of meus) {
      const cf = custo(f);
      if (cf.custo == null) {
        r = { custo: null, motivo: "filho_sem_custo" };
        break;
      }
      total += centavos(cf.custo);
    }
    visitando.delete(id);
    const c = r ?? { custo: total / 100, motivo: null };
    memo.set(id, c);
    return c;
  };
  for (const l of linhas) custo(l.id);
  return memo;
}

/** Custo do projeto: soma das raízes — desconhecido se alguma raiz for. */
export function custoTotal(
  linhas: readonly { id: string; parentId: string | null }[],
  custos: ReadonlyMap<string, CustoLinha>,
): CustoLinha {
  let total = 0;
  for (const l of linhas) {
    if (l.parentId != null) continue;
    const c = custos.get(l.id);
    if (!c || c.custo == null) return { custo: null, motivo: "filho_sem_custo" };
    total += centavos(c.custo);
  }
  return { custo: total / 100, motivo: null };
}
