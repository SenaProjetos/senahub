/**
 * Coordenação BIM — agregações PURAS do dashboard de apontamentos: contagem por
 * status, por disciplina, e criados-vs-encerrados por semana (burndown simples).
 * Recebe dados já buscados (queries.ts faz a I/O); sem Prisma/server-only aqui.
 */
import { startOfWeek, format, subWeeks } from "date-fns";

export type ApontamentoResumo = {
  createdAt: string; // ISO
  resolvidoEm: string | null;
  fechadoEm: string | null;
  status: string; // aberta | resolvida | fechada | descartada
  disciplinaNome: string;
};

export type ContagemStatus = { status: string; total: number };
export type ContagemDisciplina = { disciplina: string; total: number; abertos: number };
export type PontoSemana = { semana: string; criados: number; encerrados: number };

const STATUS_ORDEM = ["aberta", "resolvida", "fechada", "descartada"];

/** Contagem por status, na ordem canônica do workflow (mesmo se algum status não ocorrer). */
export function contarPorStatus(apontamentos: readonly ApontamentoResumo[]): ContagemStatus[] {
  const contagem = new Map<string, number>();
  for (const a of apontamentos) contagem.set(a.status, (contagem.get(a.status) ?? 0) + 1);
  return STATUS_ORDEM.map((status) => ({ status, total: contagem.get(status) ?? 0 }));
}

/** Contagem por disciplina (total + em aberto), ordenada por total desc. */
export function contarPorDisciplina(apontamentos: readonly ApontamentoResumo[]): ContagemDisciplina[] {
  const contagem = new Map<string, { total: number; abertos: number }>();
  for (const a of apontamentos) {
    const atual = contagem.get(a.disciplinaNome) ?? { total: 0, abertos: 0 };
    atual.total += 1;
    if (a.status === "aberta") atual.abertos += 1;
    contagem.set(a.disciplinaNome, atual);
  }
  return [...contagem.entries()]
    .map(([disciplina, v]) => ({ disciplina, ...v }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Criados vs encerrados (resolvida/fechada) por semana, últimas `semanas` (padrão 8),
 * semana atual incluída. `referencia` é injetável para testes determinísticos.
 */
export function semanasCriadosEncerrados(
  apontamentos: readonly ApontamentoResumo[],
  semanas = 8,
  referencia: Date = new Date(),
): PontoSemana[] {
  const inicioSemanaAtual = startOfWeek(referencia, { weekStartsOn: 1 });
  const buckets: { inicio: Date; criados: number; encerrados: number }[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    buckets.push({ inicio: subWeeks(inicioSemanaAtual, i), criados: 0, encerrados: 0 });
  }

  function bucketDe(data: Date): (typeof buckets)[number] | undefined {
    const inicio = startOfWeek(data, { weekStartsOn: 1 }).getTime();
    return buckets.find((b) => b.inicio.getTime() === inicio);
  }

  for (const a of apontamentos) {
    const bucketCriado = bucketDe(new Date(a.createdAt));
    if (bucketCriado) bucketCriado.criados += 1;

    const encerradoEm = a.resolvidoEm ?? a.fechadoEm;
    if (encerradoEm) {
      const bucketEncerrado = bucketDe(new Date(encerradoEm));
      if (bucketEncerrado) bucketEncerrado.encerrados += 1;
    }
  }
  return buckets.map((b) => ({
    semana: format(b.inicio, "dd/MM"),
    criados: b.criados,
    encerrados: b.encerrados,
  }));
}
