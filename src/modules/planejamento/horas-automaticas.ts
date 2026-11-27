/**
 * Horas automáticas das atribuições (pool de recursos, decisões B e 2 do planejamento, 25–26/11/2026 — spec
 * `docs/superpowers/specs/2026-11-25-pool-de-recursos-design.md` §2 e §3.2).
 *
 * A tarefa tem um TOTAL de horas fixo: `dias úteis × 8 h` (o expediente comercial), seja qual for a jornada de quem está
 * nela. As atribuições automáticas dividem esse total (menos o que alguém digitou à mão) pelo PESO de cada pessoa,
 * `jornada semanal × dedicação`. Se a dedicação de uma cai, as horas das outras sobem: o trabalho da tarefa não muda.
 *
 * Só quem EXECUTA recebe hora automática (projetista, modelador, estagiário, engenheiro): quem acompanha, revisa ou aprova
 * nasce com zero, como antes. Pessoa sozinha recebe o total inteiro — se isso passa da jornada dela, o conflito aparece e
 * quem planeja decide; o sistema não mexe na duração.
 *
 * O PERFIL que executa (vaga sem pessoa, "(perfil) Projetista") também recebe (feedback do planejamento, 26/11/2026): quem
 * escala por perfil antes de saber quem vai fazer aprovava o cronograma com a linha em zero hora. Sem pessoa não há escala
 * nem dedicação, então o perfil pesa o expediente comercial a 100%; quando a pessoa entra no lugar dele, a mesma
 * atribuição continua automática e a conta refaz com a jornada e a dedicação dela.
 *
 * PURO (sem Prisma): `horas-automaticas-service.ts` lê o banco e grava.
 */
import { ENCERRADA, linhaAceitaHoras, type Papel, type StatusLinha, type TipoLinha } from "./recursos";

/** Horas de um dia de tarefa, para o total: o expediente comercial (decisão do planejamento, 26/11/2026). */
export const HORAS_DO_EXPEDIENTE = 8;

/** Jornada semanal de quem não tem escala cadastrada (sócio, dado antigo): o expediente comercial. */
export const JORNADA_SEMANAL_PADRAO = 40;

const PAPEIS_QUE_EXECUTAM: ReadonlySet<Papel> = new Set<Papel>(["pro", "mod", "est", "eng"]);

/** O papel recebe hora automática? Só quem executa — quem acompanha, revisa ou aprova não divide as horas da tarefa. */
export function papelRecebeHorasAutomaticas(papel: Papel): boolean {
  return PAPEIS_QUE_EXECUTAM.has(papel);
}

type AtribuicaoNova = { userId: string | null; papel: Papel; horas: number };

/** Peso do perfil sem pessoa: o expediente comercial, a 100% (não há escala nem dedicação para ler). */
export const PESO_DO_PERFIL: PesoDaPessoa = { jornadaSemanal: JORNADA_SEMANAL_PADRAO, dedicacao: 1 };

/** Uma atribuição NOVA nasce automática quando é pessoa ou perfil que executa e ninguém digitou hora. */
export function nasceAutomatica(a: AtribuicaoNova): boolean {
  return papelRecebeHorasAutomaticas(a.papel) && !(a.horas > 0);
}

/**
 * O perfil que a pessoa escalada OCUPA: escalar o João numa linha que tem "(perfil) Projetista" é preencher a vaga, não
 * somar uma segunda — senão o perfil dividiria as horas automáticas da tarefa com ele. Mesmo papel; sem papel (o arrasto
 * da tela por pessoa), o primeiro perfil que executa. Na ordem recebida (a de criação). `null` = não há vaga: a pessoa
 * entra como atribuição nova. A vaga ocupada guarda as horas e a marca de automática (a digitada continua digitada).
 */
export function perfilQueAPessoaOcupa<T extends { userId: string | null; papel: Papel }>(
  atribuicoes: readonly T[],
  papel: Papel | null,
): T | null {
  return (
    atribuicoes.find(
      (a) => a.userId == null && a.papel !== "ext" && (papel != null ? a.papel === papel : papelRecebeHorasAutomaticas(a.papel)),
    ) ?? null
  );
}

/**
 * A atribuição depois de editada (horas e marca). `depois.horas` ausente = a tela não mexeu nas horas (trocou só o papel
 * ou a pessoa): ficam as gravadas — nunca um valor que a tela carregou antes de outra pessoa mudar a linha.
 *
 * - Hora digitada diferente da gravada desliga o automático (hora digitada vence, regra B); zero volta para ele; o mesmo
 *   valor mantém o que era.
 * - Quem passa a acompanhar, revisar ou aprovar sai do automático, e a hora que era do sistema vira zero: quem acompanha
 *   nasce com zero, e a hora dele tiraria horas dos executores.
 */
export function atribuicaoAposEditar(
  antes: { horas: number; automatica: boolean },
  depois: { userId: string | null; papel: Papel; horas?: number },
): { horas: number; automatica: boolean } {
  const executa = papelRecebeHorasAutomaticas(depois.papel);
  if (depois.horas === undefined) {
    if (!executa) return { horas: antes.automatica ? 0 : antes.horas, automatica: false };
    return { horas: antes.horas, automatica: antes.automatica };
  }
  if (!executa) return { horas: depois.horas, automatica: false };
  if (!(depois.horas > 0)) return { horas: 0, automatica: true };
  if (Math.abs(depois.horas - antes.horas) < 0.005) return { horas: antes.horas, automatica: antes.automatica };
  return { horas: depois.horas, automatica: false };
}

export type PesoDaPessoa = {
  /** Horas da escala na semana (soma dos dias ativos). Zero ou sem escala = `JORNADA_SEMANAL_PADRAO`. */
  jornadaSemanal: number;
  /** Dedicação NESTA disciplina, de 0 a 1 (`DisciplinaResponsavel.dedicacao` ou `Recurso.capacidade`). */
  dedicacao: number;
};

export type LinhaParaHorasAutomaticas = {
  tipoEap: TipoLinha;
  ehResumo: boolean;
  duracaoDias: number;
  status: StatusLinha;
};

export type AtribuicaoParaHorasAutomaticas = {
  id: string;
  userId: string | null;
  papel: Papel;
  horas: number;
  automatica: boolean;
};

/**
 * As horas que cada atribuição AUTOMÁTICA da linha deve ter. Só as automáticas saem no mapa; as outras não mudam.
 * Linha encerrada sai vazia: a hora dela já é história (custo, linha de base). Linha que não aceita hora (marco,
 * agrupamento) zera as automáticas.
 *
 * Conta em centésimos de hora (a coluna é `Decimal(7, 2)`): cada pessoa recebe o piso da sua parte e o resto vai para a
 * última, para a soma bater com o total.
 */
export function horasAutomaticasDaLinha(
  linha: LinhaParaHorasAutomaticas,
  atribuicoes: readonly AtribuicaoParaHorasAutomaticas[],
  pesoDe: (userId: string) => PesoDaPessoa,
): Map<string, number> {
  const out = new Map<string, number>();
  if (ENCERRADA.has(linha.status)) return out;
  const automaticas = atribuicoes.filter((a) => a.automatica && papelRecebeHorasAutomaticas(a.papel));
  if (automaticas.length === 0) return out;
  if (!linhaAceitaHoras(linha)) {
    for (const a of automaticas) out.set(a.id, 0);
    return out;
  }

  const total = Math.round(linha.duracaoDias * HORAS_DO_EXPEDIENTE * 100);
  const idsAutomaticas = new Set(automaticas.map((a) => a.id));
  // A hora digitada no perfil também sai do total: ela entra nas horas da linha como a de qualquer pessoa.
  const digitadas = atribuicoes
    .filter((a) => !idsAutomaticas.has(a.id) && a.papel !== "ext")
    .reduce((s, a) => s + Math.round((Number.isFinite(a.horas) && a.horas > 0 ? a.horas : 0) * 100), 0);
  const restante = Math.max(0, total - digitadas);

  const pesos = automaticas.map((a) => {
    const p = a.userId == null ? PESO_DO_PERFIL : pesoDe(a.userId);
    const jornada = p.jornadaSemanal > 0 ? p.jornadaSemanal : JORNADA_SEMANAL_PADRAO;
    const dedicacao = Number.isFinite(p.dedicacao) && p.dedicacao > 0 ? p.dedicacao : 0;
    return jornada * dedicacao;
  });
  const soma = pesos.reduce((s, p) => s + p, 0);
  const partes = soma > 0 ? pesos.map((p) => p / soma) : pesos.map(() => 1 / pesos.length);

  let distribuido = 0;
  automaticas.forEach((a, i) => {
    const centesimos = i === automaticas.length - 1 ? restante - distribuido : Math.floor(restante * partes[i]);
    distribuido += centesimos;
    out.set(a.id, centesimos / 100);
  });
  return out;
}
