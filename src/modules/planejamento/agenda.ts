import "server-only";

import { prisma } from "@/lib/prisma";
import { criarCalendario, type Calendario, type Dia } from "@/lib/calendario-trabalho";
import { feriadosParaCalculo } from "@/modules/rh/feriados/queries";
import { agendar, type LinhaEntrada, type ResultadoMotor } from "./motor";
import { calcularCodigos, diferencaDeCodigos } from "./codigo-eap";
import { ehEtapaDeTerceiro, horasDaLinha } from "./recursos";

/**
 * Adaptador entre o motor puro e o banco.
 *
 * O motor (`motor.ts`) e o calendário (`lib/calendario-trabalho.ts`) não sabem o que é
 * Prisma; é aqui que os dois encostam no dado real. Toda conversão de fronteira acontece
 * neste arquivo — em especial o `Decimal` do Prisma virando `number`, que se escapar para
 * dentro do motor vira string concatenada numa soma sem ninguém notar.
 */

/** `Date` do Prisma (`@db.Date`, meia-noite UTC) → `YYYY-MM-DD`, sem passar por fuso local. */
export function paraDia(d: Date): Dia {
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `Date` em meia-noite UTC, que é como o Prisma grava `@db.Date`. */
export function paraDataUtc(dia: Dia): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** `Decimal | number | null` → `number`. A conversão de fronteira mais importante daqui. */
function num(v: unknown, padrao = 0): number {
  if (v == null) return padrao;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : padrao;
}

/**
 * Monta o calendário de trabalho cobrindo os anos que o cronograma atravessa.
 *
 * Usa `feriadosParaCalculo`, a MESMA função que o ponto usa para horas esperadas —
 * inclusive a rede de segurança dela, que calcula os nacionais quando o ano não foi
 * importado. Duas definições de dia útil no sistema (uma para prazo, outra para folha)
 * seria a primeira coisa a divergir.
 *
 * Os feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) saem daí prontos:
 * `feriadosNacionais` deriva todos da Páscoa.
 */
export async function montarCalendario(anos: number[]): Promise<Calendario> {
  return (await montarCalendarioComNomes(anos)).calendario;
}

/**
 * O mesmo calendário, com o nome de cada feriado — para quem precisa EXPLICAR um dia não
 * útil ("capacidade menor nesta semana: feriado de Finados"). Uma fonte só: o calendário
 * sai da mesma lista que dá os nomes.
 */
export async function montarCalendarioComNomes(
  anos: number[],
): Promise<{ calendario: Calendario; nomes: Map<Dia, string> }> {
  const unicos = [...new Set(anos)].filter((a) => Number.isInteger(a) && a > 1970 && a < 2200);
  const listas = (await Promise.all(unicos.map((ano) => feriadosParaCalculo(ano)))).flat();
  return {
    calendario: criarCalendario({ feriados: listas.map((f) => f.data) }),
    nomes: new Map(listas.map((f) => [f.data, f.nome])),
  };
}

/** Anos que um conjunto de datas atravessa, com uma folga de um ano para cada lado. */
function anosDe(datas: Dia[]): number[] {
  if (datas.length === 0) {
    const atual = new Date().getUTCFullYear();
    return [atual, atual + 1];
  }
  const anos = datas.map((d) => Number(d.slice(0, 4)));
  const min = Math.min(...anos) - 1;
  const max = Math.max(...anos) + 1;
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export type PlanoDoProjeto = {
  resultado: ResultadoMotor;
  /** Exatamente o que o motor consumiu — quem simula um "e se" (F5) roda o motor de novo sobre isto. */
  entrada: LinhaEntrada[];
  calendario: Calendario;
  /** Âncora efetivamente usada — a do cronograma, ou o menor início existente. */
  inicioProjeto: Dia;
  /** `true` quando o projeto não tem `CronogramaProjeto` ainda. */
  semCronograma: boolean;
};

/**
 * Lê a EAP do projeto, monta o calendário e roda o motor. NÃO grava nada.
 *
 * É o caminho de leitura: a tela chama isto para mostrar datas, folga e caminho crítico
 * sem que o banco precise ter as datas recalculadas. Gravar é `reagendarProjeto`.
 */
export async function planoDoProjeto(projetoId: string): Promise<PlanoDoProjeto | null> {
  const [tarefas, cronograma] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId },
      select: {
        id: true,
        parentId: true,
        tipoEap: true,
        duracaoDias: true,
        progresso: true,
        inicioPrevisto: true,
        restricaoTipo: true,
        restricaoData: true,
        origem: { select: { sigla: true } },
        atribuicoes: { select: { horasPrevistas: true } },
        predecessoras: { select: { predecessoraId: true, tipo: true, lagDias: true } },
      },
    }),
    prisma.cronogramaProjeto.findUnique({
      where: { projetoId },
      select: { inicioProjeto: true },
    }),
  ]);
  if (tarefas.length === 0) return null;

  const comFilhos = new Set(tarefas.map((t) => t.parentId).filter((p): p is string => p != null));
  const linhas: LinhaEntrada[] = tarefas.map((t) => ({
    id: t.id,
    parentId: t.parentId,
    duracaoDias: num(t.duracaoDias, 1),
    progresso: t.progresso,
    // Peso do rollup (D26). `null` = linha ainda não estimada — o motor volta a pesar por
    // duração em vez de dar peso zero a ela (ver `aplicarProgresso`).
    trabalhoHoras: horasDaLinha(
      {
        tipoEap: t.tipoEap,
        ehResumo: comFilhos.has(t.id),
        duracaoDias: num(t.duracaoDias, 1),
        deTerceiro: ehEtapaDeTerceiro(t.origem?.sigla),
      },
      t.atribuicoes.map((a) => ({ horas: num(a.horasPrevistas, 0) })),
    ),
    restricaoTipo: t.restricaoTipo,
    restricaoData: t.restricaoData ? paraDia(t.restricaoData) : null,
    predecessoras: t.predecessoras.map((p) => ({
      predecessoraId: p.predecessoraId,
      tipo: p.tipo,
      lagDias: num(p.lagDias, 0),
    })),
  }));

  // Sem âncora gravada, a melhor leitura é o menor início que já existe — e nunca "hoje",
  // que faria o cronograma de um projeto aprovado andar sozinho a cada dia que passa.
  const menorInicio = tarefas
    .map((t) => paraDia(t.inicioPrevisto))
    .reduce((a, b) => (a < b ? a : b));
  const inicioProjeto = cronograma?.inicioProjeto ? paraDia(cronograma.inicioProjeto) : menorInicio;

  const datas = [inicioProjeto, ...linhas.map((l) => l.restricaoData).filter((d): d is Dia => !!d)];
  const calendario = await montarCalendario(anosDe(datas));

  return {
    resultado: agendar(linhas, inicioProjeto, calendario),
    entrada: linhas,
    calendario,
    inicioProjeto,
    semCronograma: cronograma == null,
  };
}

export type ResumoReagendamento = {
  reagendadas: number;
  codigosAtualizados: number;
  ciclosIgnorados: number;
  conflitosRestricao: number;
  fimProjeto: Dia | null;
};

/**
 * Roda o motor e GRAVA as datas, o código da EAP e o histórico de quem mudou de posição.
 *
 * Não-destrutivo: só escreve a linha que realmente mudou. Isso mantém `updatedAt` honesto
 * (quem não mexeu não aparece como mexido) e deixa o log de auditoria legível.
 */
export async function reagendarProjeto(
  projetoId: string,
  autorId?: string | null,
): Promise<ResumoReagendamento> {
  const plano = await planoDoProjeto(projetoId);
  if (!plano) {
    return {
      reagendadas: 0,
      codigosAtualizados: 0,
      ciclosIgnorados: 0,
      conflitosRestricao: 0,
      fimProjeto: null,
    };
  }

  const atuais = await prisma.eapTarefa.findMany({
    where: { projetoId },
    select: { id: true, inicioPrevisto: true, fimPrevisto: true, codigoEap: true, ordem: true, parentId: true },
  });

  const codigos = calcularCodigos(
    atuais.map((t) => ({ id: t.id, parentId: t.parentId, ordem: t.ordem })),
  );
  const mudancasCodigo = diferencaDeCodigos(
    new Map(atuais.map((t) => [t.id, t.codigoEap])),
    codigos,
  );
  const codigoPorId = new Map(codigos.map((c) => [c.id, c.codigo]));

  const escritas: { id: string; inicio?: Date; fim?: Date; codigo?: string }[] = [];
  for (const t of atuais) {
    const agendada = plano.resultado.linhas.get(t.id);
    if (!agendada) continue;
    const mudouData =
      paraDia(t.inicioPrevisto) !== agendada.inicio || paraDia(t.fimPrevisto) !== agendada.fim;
    const codigoNovo = codigoPorId.get(t.id);
    const mudouCodigo = codigoNovo != null && codigoNovo !== t.codigoEap;
    if (!mudouData && !mudouCodigo) continue;
    escritas.push({
      id: t.id,
      ...(mudouData
        ? { inicio: paraDataUtc(agendada.inicio), fim: paraDataUtc(agendada.fim) }
        : {}),
      ...(mudouCodigo ? { codigo: codigoNovo } : {}),
    });
  }

  if (escritas.length > 0 || mudancasCodigo.length > 0) {
    await prisma.$transaction([
      ...escritas.map((e) =>
        prisma.eapTarefa.update({
          where: { id: e.id },
          data: {
            ...(e.inicio ? { inicioPrevisto: e.inicio, fimPrevisto: e.fim } : {}),
            ...(e.codigo ? { codigoEap: e.codigo } : {}),
          },
        }),
      ),
      // Histórico só de quem mudou de posição (Doc 02 §27). É o que permite reconstruir a
      // estrutura do cronograma numa data passada, exigência de projeto contratual.
      ...mudancasCodigo.map((m) =>
        prisma.eapCodigoHistorico.create({
          data: {
            tarefaId: m.tarefaId,
            codigoAnterior: m.codigoAnterior,
            codigoNovo: m.codigoNovo,
            motivo: "Recálculo automático da posição na EAP.",
            autorId: autorId ?? null,
          },
        }),
      ),
    ]);
  }

  const conflitos = [...plano.resultado.linhas.values()].filter((l) => l.conflitoRestricao).length;
  return {
    reagendadas: escritas.filter((e) => e.inicio != null).length,
    codigosAtualizados: mudancasCodigo.length,
    ciclosIgnorados: plano.resultado.ciclosIgnorados.length,
    conflitosRestricao: conflitos,
    fimProjeto: plano.resultado.fimProjeto,
  };
}
