/**
 * Aviso em cascata (pool de recursos, decisões C, D, E, F, 8 e 9): quando uma DATA REAL ou a DATA DE STATUS de um projeto
 * empurra alguém para cima de outro cronograma, quem gravou vê na hora e a coordenação do outro projeto, se ele estiver
 * aprovado, é avisada. O % concluído e a revisão não disparam (decisão 9).
 *
 * PURO: compara as sobrecargas por dia (`detectarSobrecargasPorDia`, contando os rascunhos) de ANTES e DEPOIS da gravação.
 * "Novo" é o par (pessoa, dia, outro projeto) que não existia antes — sem tabela de "já avisado" (decisão F). Só pares em que
 * ESTE projeto põe hora no dia: a gravação só move as linhas daqui, então nenhum outro par muda.
 *
 * Dois sentidos de "conflito":
 * - o da tela de quem gravou: o dia passa da jornada somando aprovados E rascunhos (decisão 8: lista o rascunho afetado);
 * - o do aviso à coordenação: este projeto e o outro estão APROVADOS e o dia passa da jornada só com aprovados (decisão J:
 *   o aprovado não recebe alerta por rascunho).
 * Um par entra na lista quando é novo em qualquer dos dois; avisa só quando é novo no segundo.
 */
import type { Dia } from "@/lib/calendario-trabalho";
import type { SobrecargaDia } from "./recursos";

/** O mesmo meio centésimo de folga da detecção: 8,004 h em 8 h não é conflito. */
const FOLGA = 0.005;

type Par = {
  userId: string;
  dia: Dia;
  outroId: string;
  outroRascunho: boolean;
  /** Os dois aprovados e o dia passa da jornada só com aprovados. */
  entreAprovados: boolean;
  linhasDeste: string[];
  linhasDoOutro: string[];
};

const chave = (p: Pick<Par, "userId" | "dia" | "outroId">) => `${p.userId}|${p.dia}|${p.outroId}`;

/** Os pares (pessoa, dia, outro projeto) em que este projeto divide um dia acima da jornada com outro. */
export function paresDoProjeto(sobrecargas: readonly SobrecargaDia[], projetoId: string, projetoAprovado: boolean): Par[] {
  const out: Par[] = [];
  for (const s of sobrecargas) {
    const deste = s.parcelas.filter((p) => p.projetoId === projetoId && p.horas > 0);
    if (deste.length === 0) continue;
    const cargaAprovada = s.parcelas.filter((p) => !p.rascunho).reduce((t, p) => t + p.horas, 0);
    const estouraSoComAprovados = projetoAprovado && cargaAprovada > s.capacidade + FOLGA;
    const outros = new Map<string, { rascunho: boolean; linhas: Set<string> }>();
    for (const p of s.parcelas) {
      if (p.projetoId === projetoId || p.horas <= 0) continue;
      const o = outros.get(p.projetoId) ?? { rascunho: p.rascunho, linhas: new Set<string>() };
      o.linhas.add(p.linhaId);
      outros.set(p.projetoId, o);
    }
    const linhasDeste = [...new Set(deste.map((p) => p.linhaId))];
    for (const [outroId, o] of outros) {
      out.push({
        userId: s.userId,
        dia: s.dia,
        outroId,
        outroRascunho: o.rascunho,
        entreAprovados: estouraSoComAprovados && !o.rascunho,
        linhasDeste,
        linhasDoOutro: [...o.linhas],
      });
    }
  }
  return out;
}

/** Os conflitos novos de uma pessoa com UM outro projeto, já agrupados por dia. */
export type ConflitoNovo = {
  userId: string;
  outroId: string;
  outroRascunho: boolean;
  dias: Dia[];
  /** A coordenação do outro projeto é avisada (os dois aprovados, novo entre aprovados). */
  avisarCoordenacao: boolean;
  linhasDeste: string[];
  linhasDoOutro: string[];
};

export function conflitosNovos(
  antes: readonly SobrecargaDia[],
  depois: readonly SobrecargaDia[],
  projetoId: string,
  projetoAprovado: boolean,
): ConflitoNovo[] {
  const paresAntes = paresDoProjeto(antes, projetoId, projetoAprovado);
  const existia = new Set(paresAntes.map(chave));
  const existiaEntreAprovados = new Set(paresAntes.filter((p) => p.entreAprovados).map(chave));

  const grupos = new Map<string, ConflitoNovo>();
  for (const p of paresDoProjeto(depois, projetoId, projetoAprovado)) {
    const k = chave(p);
    const novo = !existia.has(k);
    const avisar = p.entreAprovados && !existiaEntreAprovados.has(k);
    if (!novo && !avisar) continue;
    const g = `${p.userId}|${p.outroId}`;
    const atual = grupos.get(g) ?? {
      userId: p.userId,
      outroId: p.outroId,
      outroRascunho: p.outroRascunho,
      dias: [],
      avisarCoordenacao: false,
      linhasDeste: [],
      linhasDoOutro: [],
    };
    if (!atual.dias.includes(p.dia)) atual.dias.push(p.dia);
    atual.avisarCoordenacao ||= avisar;
    for (const l of p.linhasDeste) if (!atual.linhasDeste.includes(l)) atual.linhasDeste.push(l);
    for (const l of p.linhasDoOutro) if (!atual.linhasDoOutro.includes(l)) atual.linhasDoOutro.push(l);
    grupos.set(g, atual);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, dias: [...g.dias].sort() }))
    .sort((a, b) => a.dias[0].localeCompare(b.dias[0]) || a.userId.localeCompare(b.userId) || a.outroId.localeCompare(b.outroId));
}

// ─────────────────────────────────────────────────────────────
// Para a tela de quem gravou e para o texto do aviso
// ─────────────────────────────────────────────────────────────

/** Um bloco do diálogo "conflito de recurso": pessoa, dias, as tarefas daqui e as do outro. */
export type ConflitoEmCascata = {
  userId: string;
  nome: string;
  dias: Dia[];
  /** `null` = quem gravou não vê a carga da equipe (`recursos:ver`): a tela diz "outro projeto", sem nome nem tarefa. */
  outro: { codigo: string; rotulo: string; linhas: string[] } | null;
  outroRascunho: boolean;
  /** A coordenação do outro projeto foi avisada. */
  coordenacaoAvisada: boolean;
  linhasDeste: string[];
};

/** O que a action devolve para a tela (`null` = nada novo). */
export type AvisoCascata = { origem: "data_real" | "data_status"; conflitos: ConflitoEmCascata[] };

export function paraTela(
  novos: readonly ConflitoNovo[],
  contexto: {
    nomes: ReadonlyMap<string, string>;
    linhas: Readonly<Record<string, { nome: string }>>;
    projetos: Readonly<Record<string, { codigo: string; nome: string }>>;
    verCargaDaEquipe: boolean;
    /** Projetos cuja coordenação recebeu o aviso de fato (alguém na audiência). */
    avisados: ReadonlySet<string>;
  },
): ConflitoEmCascata[] {
  const nomeDaLinha = (id: string) => contexto.linhas[id]?.nome ?? "Tarefa";
  return novos.map((n) => ({
    userId: n.userId,
    nome: contexto.nomes.get(n.userId) ?? "Pessoa sem nome",
    dias: n.dias,
    outro: contexto.verCargaDaEquipe
      ? {
          codigo: contexto.projetos[n.outroId]?.codigo ?? "outro projeto",
          rotulo: contexto.projetos[n.outroId] ? `${contexto.projetos[n.outroId].codigo} — ${contexto.projetos[n.outroId].nome}` : "Outro projeto",
          linhas: n.linhasDoOutro.map(nomeDaLinha),
        }
      : null,
    // Sem a carga da equipe, nem a situação do outro projeto (rascunho? avisado?) sai: só "outro projeto".
    outroRascunho: contexto.verCargaDaEquipe && n.outroRascunho,
    coordenacaoAvisada: contexto.verCargaDaEquipe && n.avisarCoordenacao && contexto.avisados.has(n.outroId),
    linhasDeste: n.linhasDeste.map(nomeDaLinha),
  }));
}

/** "26/11", "26/11 e 27/11" ou "26/11 e mais 3 dias". `curta` formata um dia (`dataCurta`). */
export function diasDoConflito(dias: readonly Dia[], curta: (d: Dia) => string): string {
  if (dias.length === 0) return "";
  if (dias.length === 1) return curta(dias[0]);
  if (dias.length === 2) return `${curta(dias[0])} e ${curta(dias[1])}`;
  return `${curta(dias[0])} e mais ${dias.length - 1} dias`;
}

/**
 * O aviso à coordenação do projeto afetado. `origem` = rótulo do projeto onde a data foi registrada, só para quem vê a
 * carga da equipe; sem ele, "outro cronograma" (o escopo de quem recebe pode não incluí-lo).
 */
export function textoDoAvisoDeCascata(p: {
  afetado: string;
  origem: string | null;
  pessoas: readonly { nome: string; dias: string }[];
}): { titulo: string; corpo: string } {
  const quem =
    p.pessoas.length === 1
      ? `${p.pessoas[0].nome} passou da jornada em ${p.pessoas[0].dias}`
      : `${p.pessoas
          .slice(0, -1)
          .map((x) => `${x.nome} (${x.dias})`)
          .join(", ")} e ${p.pessoas[p.pessoas.length - 1].nome} (${p.pessoas[p.pessoas.length - 1].dias}) passaram da jornada`;
  const onde = p.origem ? `no ${p.origem}` : "em outro cronograma";
  return {
    titulo: `Conflito de recurso no ${p.afetado}`,
    corpo: `${quem} depois de uma data registrada ${onde}. Nenhuma data do ${p.afetado} mudou: veja se é caso de abrir "Revisar planejamento".`,
  };
}
