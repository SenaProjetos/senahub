/**
 * Sugestões para desfazer uma sobrecarga (D18): "atrasar X" ou "passar Y para o João".
 *
 * PURO: sem I/O. Nunca aplica nada — devolve a sugestão, e é o coordenador quem clica.
 * Nivelamento automático está fora por decisão (D18): o MS Project nivela, e é a origem
 * clássica do cronograma que mudou sozinho sem ninguém saber por quê.
 *
 * Toda sugestão é VERIFICADA antes de sair, simulando o efeito inteiro:
 *   - "atrasar" roda o MOTOR de novo com a restrição candidata. Checar só a folga da linha
 *     não basta: passada a folga livre, as sucessoras andam junto, e com elas as horas de
 *     outras pessoas — ou da mesma, numa semana que estava livre.
 *   - as duas recalculam a carga de TODO mundo e só passam se o término do projeto não
 *     muda, nenhuma semana nova estoura e nenhuma sobrecarga existente piora.
 * Sugestão que troca um problema por outro não é sugestão.
 */
import { diasUteisEntre, proximoDiaUtil, type Calendario, type Dia } from "@/lib/calendario-trabalho";
import { chaveSemanaIso } from "./disponibilidade";
import { agendar, type LinhaAgendada, type LinhaEntrada } from "./motor";
import {
  detectarSobrecargas,
  distribuirHoras,
  parcelasDasLinhas,
  type LinhaCarga,
  type Papel,
  type ParcelaCarga,
  type Sobrecarga,
} from "./recursos";

export type ContextoProjeto = {
  projetoId: string;
  /** Exatamente o que o motor consome para este projeto. */
  linhasMotor: readonly LinhaEntrada[];
  inicioProjeto: Dia;
  /** A Data de Status com que o plano atual rodou — a simulação usa a mesma (L1). */
  dataStatus: Dia | null;
  fimProjeto: Dia | null;
  /** Resultado atual do motor. */
  agendado: ReadonlyMap<string, LinhaAgendada>;
  /** Linhas com atribuições, nas datas ATUAIS. */
  linhasCarga: readonly LinhaCarga[];
  /** Linhas que já começaram (têm início real): começo não se atrasa. */
  iniciadas: ReadonlySet<string>;
};

export type EntradaSugestoes = {
  /** Só projetos com cronograma APROVADO — o resto não tem linha para mexer. */
  projetos: ReadonlyMap<string, ContextoProjeto>;
  /** Carga de todo mundo, de todos os projetos, inclusive alocação digitada. */
  parcelas: readonly ParcelaCarga[];
  capacidade: ReadonlyMap<string, ReadonlyMap<string, number>>;
  semanas: readonly string[];
  cal: Calendario;
  /**
   * Quem pode receber a atribuição: responsável da mesma disciplina, ou gente que já
   * exerce aquele papel naquela disciplina. Sem esse filtro a sugestão mandaria o
   * projeto elétrico para quem só faz hidráulica — o que a carga não sabe distinguir.
   */
  qualificados: (linhaId: string, papel: Papel) => readonly string[];
};

export type SugestaoAtraso = {
  tipo: "atrasar";
  projetoId: string;
  linhaId: string;
  /** Vira `iniciar_nao_antes_de` na linha — o mesmo que arrastar a barra na tela (D34). */
  novoInicio: Dia;
  diasUteis: number;
  /** `false` = a linha já tinha essa restrição; só a data muda. */
  criaRestricao: boolean;
  /** Resolve a semana inteira, ou só alivia. */
  resolve: boolean;
};

export type SugestaoTroca = {
  tipo: "passar";
  projetoId: string;
  linhaId: string;
  atribuicaoId: string;
  deUserId: string;
  paraUserId: string;
  horas: number;
  resolve: boolean;
};

export type Sugestoes = { atrasar: SugestaoAtraso | null; passar: SugestaoTroca | null };

/** Quantas linhas candidatas simular por sobrecarga — cada uma roda o motor inteiro. */
const MAX_CANDIDATAS = 5;
const TOL = 0.05;

const chave = (s: { userId: string; semana: string }) => `${s.userId}|${s.semana}`;

/**
 * Aceita o cenário `depois` contra o `antes`? Nenhuma sobrecarga nova, nenhuma existente
 * piorando, e a semana-alvo melhorando. Devolve `null` se não aceita.
 */
function avaliar(
  alvo: Sobrecarga,
  antes: readonly Sobrecarga[],
  depois: readonly Sobrecarga[],
): { resolve: boolean } | null {
  const excessoAntes = new Map(antes.map((s) => [chave(s), s.excesso]));
  for (const s of depois) {
    const anterior = excessoAntes.get(chave(s));
    if (anterior == null) return null; // semana nova estourando
    if (s.excesso > anterior + TOL) return null; // sobrecarga existente piorou
  }
  const alvoDepois = depois.find((s) => chave(s) === chave(alvo));
  if (alvoDepois && alvoDepois.excesso >= alvo.excesso - TOL) return null; // não melhorou nada
  return { resolve: alvoDepois == null };
}

/** Segunda-feira seguinte à semana ISO que contém `dia`. */
function segundaSeguinte(dia: Dia): Dia {
  const d = new Date(`${dia}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? 1 : 8 - dow));
  return d.toISOString().slice(0, 10);
}

/**
 * "Atrasar X": empurra o início de uma linha da pessoa para depois da semana estourada,
 * dentro da folga — o término do projeto não pode mudar.
 *
 * Candidatas: linhas da pessoa naquela semana que ainda não começaram, não são críticas e
 * não têm outra restrição (desfazer uma restrição que alguém pôs de propósito não é
 * sugestão, é atropelo). Da maior folga para a menor.
 */
export function sugerirAtraso(alvo: Sobrecarga, e: EntradaSugestoes): SugestaoAtraso | null {
  const antes = detectarSobrecargas(e.parcelas, e.capacidade, { semanas: e.semanas });

  const candidatas: { ctx: ContextoProjeto; linha: LinhaCarga; agendada: LinhaAgendada }[] = [];
  const vistas = new Set<string>();
  for (const pc of alvo.parcelas) {
    if (pc.linhaId == null || vistas.has(pc.linhaId)) continue;
    vistas.add(pc.linhaId);
    const ctx = e.projetos.get(pc.projetoId);
    const linha = ctx?.linhasCarga.find((l) => l.id === pc.linhaId);
    const agendada = ctx?.agendado.get(pc.linhaId);
    if (!ctx || !linha || !agendada) continue;
    if (agendada.critica || agendada.folgaTotal <= 0 || agendada.ehResumo) continue;
    if (ctx.iniciadas.has(linha.id) || (linha.status !== "nin" && linha.status !== "agu")) continue;
    const entrada = ctx.linhasMotor.find((l) => l.id === linha.id);
    if (!entrada || (entrada.restricaoTipo && entrada.restricaoTipo !== "iniciar_nao_antes_de")) continue;
    candidatas.push({ ctx, linha, agendada });
  }
  candidatas.sort((a, b) => b.agendada.folgaTotal - a.agendada.folgaTotal);

  let melhor: SugestaoAtraso | null = null;
  for (const { ctx, linha, agendada } of candidatas.slice(0, MAX_CANDIDATAS)) {
    // Último dia da linha dentro da semana estourada → começa na segunda seguinte.
    const diasNaSemana = [...distribuirHoras(agendada.inicio, agendada.fim, 1, e.cal).keys()].filter(
      (d) => chaveSemanaIso(d) === alvo.semana,
    );
    if (diasNaSemana.length === 0) continue;
    const novoInicio = proximoDiaUtil(segundaSeguinte(diasNaSemana[diasNaSemana.length - 1]), e.cal);
    if (novoInicio <= agendada.inicio) continue;
    const diasUteis = diasUteisEntre(agendada.inicio, novoInicio, e.cal) - 1;
    if (diasUteis > agendada.folgaTotal) continue; // atalho; a simulação abaixo é quem decide

    const linhasMotor = ctx.linhasMotor.map((l) =>
      l.id === linha.id ? { ...l, restricaoTipo: "iniciar_nao_antes_de" as const, restricaoData: novoInicio } : l,
    );
    const novo = agendar([...linhasMotor], ctx.inicioProjeto, e.cal, { dataStatus: ctx.dataStatus });
    if (novo.fimProjeto !== ctx.fimProjeto) continue;

    const novasLinhas = ctx.linhasCarga.map((l) => {
      const a = novo.linhas.get(l.id);
      return a ? { ...l, inicio: a.inicio, fim: a.fim } : l;
    });
    const parcelas = [
      ...e.parcelas.filter((p) => !(p.projetoId === ctx.projetoId && p.linhaId != null)),
      ...parcelasDasLinhas(novasLinhas, e.cal),
    ];
    const depois = detectarSobrecargas(parcelas, e.capacidade, { semanas: e.semanas });
    const ok = avaliar(alvo, antes, depois);
    if (!ok) continue;

    const sugestao: SugestaoAtraso = {
      tipo: "atrasar",
      projetoId: ctx.projetoId,
      linhaId: linha.id,
      novoInicio,
      diasUteis,
      criaRestricao: !ctx.linhasMotor.find((l) => l.id === linha.id)?.restricaoTipo,
      resolve: ok.resolve,
    };
    if (
      melhor == null ||
      (sugestao.resolve && !melhor.resolve) ||
      (sugestao.resolve === melhor.resolve && sugestao.diasUteis < melhor.diasUteis)
    ) {
      melhor = sugestao;
    }
  }
  return melhor;
}

/**
 * "Passar Y para o João": entrega a atribuição INTEIRA da pessoa sobrecarregada a alguém
 * qualificado que aguenta as horas em todas as semanas da linha.
 *
 * Inteira, não um pedaço: dividir a linha entre duas pessoas é decisão de coordenação
 * (e o BIM nem sempre divide — D16), não algo para o sistema sugerir em um clique.
 * Entre os que servem, fica quem resolve a semana e, no empate, quem sobra mais folgado.
 */
export function sugerirTroca(alvo: Sobrecarga, e: EntradaSugestoes): SugestaoTroca | null {
  const antes = detectarSobrecargas(e.parcelas, e.capacidade, { semanas: e.semanas });

  let melhor: SugestaoTroca | null = null;
  let folgaDoMelhor = -Infinity;
  const vistas = new Set<string>();
  for (const pc of alvo.parcelas) {
    if (pc.atribuicaoId == null || pc.linhaId == null || vistas.has(pc.atribuicaoId)) continue;
    vistas.add(pc.atribuicaoId);
    const ctx = e.projetos.get(pc.projetoId);
    const linha = ctx?.linhasCarga.find((l) => l.id === pc.linhaId);
    const atrib = linha?.atribuicoes.find((a) => a.id === pc.atribuicaoId);
    if (!ctx || !linha || !atrib || atrib.userId !== alvo.userId) continue;

    const jaNoPapel = new Set(linha.atribuicoes.filter((a) => a.papel === atrib.papel).map((a) => a.userId));
    for (const paraUserId of e.qualificados(linha.id, atrib.papel)) {
      if (paraUserId === alvo.userId || jaNoPapel.has(paraUserId)) continue;
      const parcelas = e.parcelas.map((p) => (p.atribuicaoId === atrib.id ? { ...p, userId: paraUserId } : p));
      const depois = detectarSobrecargas(parcelas, e.capacidade, { semanas: e.semanas });
      const ok = avaliar(alvo, antes, depois);
      if (!ok) continue;

      // Folga que sobra para quem recebe, na pior semana da linha.
      const semanasDaLinha = new Set(parcelas.filter((p) => p.atribuicaoId === atrib.id).map((p) => p.semana));
      let folga = Infinity;
      for (const s of semanasDaLinha) {
        const carga = parcelas.filter((p) => p.userId === paraUserId && p.semana === s).reduce((t, p) => t + p.horas, 0);
        folga = Math.min(folga, (e.capacidade.get(paraUserId)?.get(s) ?? 0) - carga);
      }

      const candidata: SugestaoTroca = {
        tipo: "passar",
        projetoId: ctx.projetoId,
        linhaId: linha.id,
        atribuicaoId: atrib.id,
        deUserId: alvo.userId,
        paraUserId,
        horas: atrib.horas,
        resolve: ok.resolve,
      };
      if (
        melhor == null ||
        (candidata.resolve && !melhor.resolve) ||
        (candidata.resolve === melhor.resolve && folga > folgaDoMelhor)
      ) {
        melhor = candidata;
        folgaDoMelhor = folga;
      }
    }
  }
  return melhor;
}

export function sugerirCorrecoes(alvo: Sobrecarga, e: EntradaSugestoes): Sugestoes {
  return { atrasar: sugerirAtraso(alvo, e), passar: sugerirTroca(alvo, e) };
}
