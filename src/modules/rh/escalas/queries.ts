import "server-only";
import { prisma } from "@/lib/prisma";
import { type Role } from "@/lib/roles";
import type { Contratacao } from "@/generated/prisma/enums";
import { whereAudiencia } from "@/lib/audiencias";

export type DiaGrade = {
  diaSemana: number;
  ativo: boolean;
  entrada: string | null;
  saida: string | null;
  descansos: { inicio: string; fim: string }[];
  horasDia: number;
  toleranciaMin: number;
};

const DIA_UTIL = (d: number) => d >= 1 && d <= 5;

/** Linha default quando o dia não tem registro salvo: seg-sex 8h, fds folga. */
function diaPadrao(diaSemana: number): DiaGrade {
  const util = DIA_UTIL(diaSemana);
  return {
    diaSemana,
    ativo: util,
    entrada: util ? "08:00" : null,
    saida: util ? "17:00" : null,
    descansos: util ? [{ inicio: "12:00", fim: "13:00" }] : [],
    horasDia: util ? 8 : 0,
    toleranciaMin: 10,
  };
}

type LinhaDb = {
  diaSemana: number;
  ativo: boolean;
  entrada: string | null;
  saida: string | null;
  descansos: unknown;
  horasDia: unknown;
  toleranciaMin: number;
};

function normalizar(row: LinhaDb): DiaGrade {
  return {
    diaSemana: row.diaSemana,
    ativo: row.ativo,
    entrada: row.entrada,
    saida: row.saida,
    descansos: Array.isArray(row.descansos) ? (row.descansos as { inicio: string; fim: string }[]) : [],
    horasDia: Number(row.horasDia),
    toleranciaMin: row.toleranciaMin,
  };
}

/** Completa os 7 dias da semana, preenchendo com o default o que não tem linha salva. */
function completarSemana(linhas: LinhaDb[]): DiaGrade[] {
  const porDia = new Map(linhas.map((l) => [l.diaSemana, l]));
  return Array.from({ length: 7 }, (_, dia) => {
    const existente = porDia.get(dia);
    return existente ? normalizar(existente) : diaPadrao(dia);
  });
}

/**
 * LEGADO — grade padrão por PAPEL. Continua exportada só para o arnês de jornada
 * (`scripts/checar-equivalencia-jornada.ts`) reconstruir o "antes". Nenhum caminho de cálculo
 * deve chamá-la: a fonte é `escalaContratacaoGrade` desde a Onda E.
 */
export async function escalaRoleGrade(role: Role): Promise<DiaGrade[]> {
  const linhas = await prisma.escalaRole.findMany({ where: { role } });
  return completarSemana(linhas);
}

/**
 * Grade padrão (7 dias) da CONTRATAÇÃO — usada quando o usuário não tem override ativo.
 *
 * Jornada é matéria trabalhista, e `role` misturava quatro eixos; a chave passa a ser COMO a
 * pessoa é contratada (Onda E, §6.4).
 *
 * `contratacao` nula (admin sem vínculo) ou sem linhas (`pj`, `autonomo_rpa`, `pro_labore`) cai
 * no default de `completarSemana` — 8h nos dias úteis, exatamente como caía via `escalaRoleGrade`
 * para esses papéis, que também não tinham linha. Ver a nota no schema sobre por que "sem
 * jornada" NÃO virou 0h: zeraria o custo/hora de PJ sem `Recurso.custoHora`.
 */
export async function escalaContratacaoGrade(contratacao: Contratacao | null): Promise<DiaGrade[]> {
  if (!contratacao) return completarSemana([]);
  const linhas = await prisma.escalaContratacao.findMany({ where: { contratacao } });
  return completarSemana(linhas);
}

/** Grade + override do usuário. `temOverride` = tem ao menos 1 dia ativo próprio (substitui o perfil inteiro). */
export async function escalaUsuarioGrade(userId: string): Promise<{ temOverride: boolean; dias: DiaGrade[] }> {
  const linhas = await prisma.escalaUsuario.findMany({ where: { userId } });
  if (linhas.length === 0) {
    return { temOverride: false, dias: Array.from({ length: 7 }, (_, d) => diaPadrao(d)) };
  }
  return { temOverride: linhas.some((l) => l.ativo), dias: completarSemana(linhas) };
}

/**
 * Horas de um dia útil típico do usuário (independente de calendário): maior
 * `horasDia` entre os dias ativos da grade vigente (override do usuário se ativo,
 * senão o perfil); 8 se nenhum dia ativo. Reproduz o antigo `EscalaTrabalho.horasDia`
 * (escalar por usuário) para cálculos de esperado/custo-hora que não dependem de um
 * dia específico da semana. Puro-de-I/O (só leituras).
 */
function horasDiaDaSemana(semana: DiaGrade[]): number {
  const ativos = semana.filter((d) => d.ativo).map((d) => d.horasDia);
  return ativos.length ? Math.max(...ativos) : 8;
}

export async function horasDiaPadrao(userId: string, contratacao: Contratacao | null): Promise<number> {
  const usuario = await escalaUsuarioGrade(userId);
  const semana = usuario.temOverride ? usuario.dias : await escalaContratacaoGrade(contratacao);
  return horasDiaDaSemana(semana);
}

/**
 * Grade semanal vigente de vários usuários — 2 queries no total (evita N+1
 * quando o cálculo roda sobre a equipe toda: rateio, saldo corrente do banco).
 * Mesma resolução de `escalaUsuarioGrade`: override ativo do usuário substitui
 * a grade do perfil POR INTEIRO.
 */
export async function gradesEmLote(
  usuarios: { id: string; contratacao: Contratacao | null }[],
): Promise<Map<string, DiaGrade[]>> {
  const ids = usuarios.map((u) => u.id);
  const contratacoes = [...new Set(usuarios.map((u) => u.contratacao).filter((c): c is Contratacao => c != null))];
  const [uRows, rRows] = await Promise.all([
    prisma.escalaUsuario.findMany({ where: { userId: { in: ids } } }),
    prisma.escalaContratacao.findMany({ where: { contratacao: { in: contratacoes } } }),
  ]);
  const porUser = new Map<string, LinhaDb[]>();
  for (const r of uRows) porUser.set(r.userId, [...(porUser.get(r.userId) ?? []), r]);
  const porContratacao = new Map<string, LinhaDb[]>();
  for (const r of rRows) porContratacao.set(r.contratacao, [...(porContratacao.get(r.contratacao) ?? []), r]);

  const out = new Map<string, DiaGrade[]>();
  for (const u of usuarios) {
    const linhasU = porUser.get(u.id) ?? [];
    const temOverride = linhasU.some((l) => l.ativo);
    out.set(u.id, completarSemana(temOverride ? linhasU : (u.contratacao ? (porContratacao.get(u.contratacao) ?? []) : [])));
  }
  return out;
}

/** Igual a `horasDiaPadrao`, mas em lote — evita N+1 (rateio roda sobre a equipe toda). */
export async function horasDiaPadraoEmLote(
  usuarios: { id: string; contratacao: Contratacao | null }[],
): Promise<Map<string, number>> {
  const grades = await gradesEmLote(usuarios);
  const out = new Map<string, number>();
  for (const u of usuarios) out.set(u.id, horasDiaDaSemana(grades.get(u.id) ?? []));
  return out;
}

/** Usuários internos elegíveis a escala (todos os perfis exceto cliente). */
export async function usuariosParaEscala() {
  return prisma.user.findMany({
    where: whereAudiencia("interno"),
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, contratacao: true },
  });
}
