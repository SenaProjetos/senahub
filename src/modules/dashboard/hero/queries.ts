import "server-only";

import type { Contratacao } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resumoAgendaHoje } from "@/modules/agenda/queries";
import { diaLocal, diaLocalDate } from "@/modules/ponto/engine";
import { controlaJornada } from "@/modules/ponto/jornada";
import { resolverEscala } from "@/modules/ponto/service";
import { candidatasDaPessoa } from "@/modules/ponto/tarefa-ponto-service";
import { estaAtrasada, sugestaoDoPonto } from "@/modules/ponto/tarefa-ponto";
import { minutoDeSaoPaulo, somarDias } from "@/modules/dashboard/hero/ceu";
import {
  DIAS_AVISO_FERIADO,
  DIAS_AVISO_FERIAS,
  anosDeCasaHoje,
  ehAniversarioHoje,
  ehFeriado,
  inicioNaCasa,
  linkDoLocal,
  type AtividadeHero,
  type FeriadoHero,
  type ReuniaoHero,
} from "@/modules/dashboard/hero/dia";
import type { BatidaHero, EscalaDoDia, TipoBatidaHero } from "@/modules/dashboard/hero/expediente";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type ExpedienteDoHero = { dia: string; escala: EscalaDoDia; batidas: BatidaHero[] };

export type DadosDoHero = {
  /** Dia de São Paulo em que os dados foram lidos. */
  hoje: string;
  /** Feriados do calendário do RH de hoje até `DIAS_AVISO_FERIADO` dias à frente. */
  feriados: FeriadoHero[];
  /** Início das próximas férias APROVADAS da pessoa, se começam em até `DIAS_AVISO_FERIAS` dias. */
  inicioFerias: string | null;
  /** Quem completa ano de casa hoje. */
  tempoDeCasa: { id: string; nome: string; anos: number }[];
  atividade: AtividadeHero | null;
  reunioes: ReuniaoHero[];
  expediente: ExpedienteDoHero | null;
  /** O dia é da pessoa que está vendo: aniversário e/ou ano de casa completado hoje. */
  festa: { aniversario: boolean; anosDeCasa: number | null };
};

type Pessoa = { id: string; tipo: "interno" | "externo"; contratacao: Contratacao | null };

async function feriadosAte(hoje: string, dias: number): Promise<FeriadoHero[]> {
  const linhas = await prisma.feriado.findMany({
    where: { data: { gte: new Date(`${hoje}T00:00:00.000Z`), lte: new Date(`${somarDias(hoje, dias)}T00:00:00.000Z`) } },
    orderBy: { data: "asc" },
    select: { data: true, nome: true },
  });
  return linhas.map((f) => ({ data: iso(f.data), nome: f.nome }));
}

/** Férias aprovadas que cobrem `dia` (aí não há expediente). */
async function emFerias(userId: string, dia: string): Promise<boolean> {
  const d = new Date(`${dia}T00:00:00.000Z`);
  const achada = await prisma.ferias.findFirst({
    where: { userId, status: "aprovado", inicio: { lte: d }, fim: { gte: d } },
    select: { id: true },
  });
  return achada != null;
}

/**
 * Escala e batidas de HOJE para a linha do expediente. `null` = sem linha: quem não bate ponto
 * (`controlaJornada`), dia sem escala, feriado do calendário do RH ou férias aprovadas. Escala só com
 * as horas do dia (sem horário) vale: a linha conta pela entrada batida.
 */
export async function expedienteDeHoje(pessoa: Pessoa, feriados?: FeriadoHero[]): Promise<ExpedienteDoHero | null> {
  if (!controlaJornada(pessoa)) return null;
  const agora = new Date();
  const hoje = diaLocal(agora);
  const doCalendario = feriados ?? (await feriadosAte(hoje, 0));
  if (ehFeriado(doCalendario, hoje)) return null;
  const grade = await resolverEscala(pessoa.id, pessoa.contratacao, agora);
  if (!grade.ativo || grade.horasDia <= 0) return null;
  if (await emFerias(pessoa.id, hoje)) return null;

  const batidas = await prisma.batida.findMany({
    where: { userId: pessoa.id, dia: diaLocalDate(agora) },
    orderBy: { horario: "asc" },
    select: { tipo: true, horario: true },
  });
  return {
    dia: hoje,
    escala: {
      entrada: grade.entrada,
      saida: grade.saida,
      descansos: grade.descansos,
      horasDia: grade.horasDia,
      toleranciaMin: grade.toleranciaMin,
    },
    batidas: batidas.map((b) => ({ tipo: b.tipo as TipoBatidaHero, minuto: minutoDeSaoPaulo(b.horario) })),
  };
}

/** Quem completa ano de casa hoje — contando sem interrupção desde o vínculo mais antigo emendado. */
async function tempoDeCasaHoje(hoje: string): Promise<DadosDoHero["tempoDeCasa"]> {
  const pessoas = await prisma.user.findMany({
    where: { ativo: true, tipo: "interno", vinculoAtivoId: { not: null } },
    select: { id: true, name: true, vinculos: { select: { dataInicio: true, dataFim: true } } },
  });
  const lista: DadosDoHero["tempoDeCasa"] = [];
  for (const p of pessoas) {
    const inicio = inicioNaCasa(p.vinculos.map((v) => ({ inicio: iso(v.dataInicio), fim: v.dataFim ? iso(v.dataFim) : null })));
    const anos = inicio ? anosDeCasaHoje(inicio, hoje) : null;
    if (anos) lista.push({ id: p.id, nome: p.name, anos });
  }
  return lista.sort((a, b) => b.anos - a.anos || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A atividade de hoje no cronograma — a mesma que o ponto sugere (`sugestaoDoPonto`). */
async function atividadeDeHoje(userId: string, hoje: string): Promise<AtividadeHero | null> {
  const candidatas = (await candidatasDaPessoa(userId))
    .filter((c) => c.projeto)
    .map((c) => ({ ...c, projetoId: c.projeto!.id }));
  const s = sugestaoDoPonto(candidatas, hoje);
  if (!s || !s.janela) return null;
  return { titulo: s.titulo, projeto: s.projeto!.nome, termino: s.janela.fim, atrasada: estaAtrasada(s.janela, hoje) };
}

/** Reuniões de hoje da agenda da pessoa (criador ou participante), menos as que ela recusou. */
async function reunioesDeHoje(userId: string): Promise<ReuniaoHero[]> {
  const compromissos = await resumoAgendaHoje(userId);
  return compromissos
    .filter((c) => c.confirmado !== false)
    .map((c) => {
      const inicio = minutoDeSaoPaulo(new Date(c.inicio));
      const fim = c.fim ? minutoDeSaoPaulo(new Date(c.fim)) : null;
      return { id: c.id, titulo: c.titulo, inicio, fim: fim != null && fim > inicio ? fim : null, link: linkDoLocal(c.local) };
    });
}

async function aniversarioHoje(userId: string, hoje: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { dataNascimento: true } });
  return u?.dataNascimento ? ehAniversarioHoje(iso(u.dataNascimento), hoje) : false;
}

async function inicioDasFerias(userId: string, hoje: string): Promise<string | null> {
  const proximas = await prisma.ferias.findFirst({
    where: {
      userId,
      status: "aprovado",
      inicio: { gt: new Date(`${hoje}T00:00:00.000Z`), lte: new Date(`${somarDias(hoje, DIAS_AVISO_FERIAS)}T00:00:00.000Z`) },
    },
    orderBy: { inicio: "asc" },
    select: { inicio: true },
  });
  return proximas ? iso(proximas.inicio) : null;
}

/** Tudo o que o herocard mostra além do céu, lido de uma vez no Início. */
export async function dadosDoHero(pessoa: Pessoa): Promise<DadosDoHero> {
  const hoje = diaLocal(new Date());
  const feriados = await feriadosAte(hoje, DIAS_AVISO_FERIADO);
  const [inicioFerias, tempoDeCasa, atividade, reunioes, expediente, aniversario] = await Promise.all([
    inicioDasFerias(pessoa.id, hoje),
    tempoDeCasaHoje(hoje),
    atividadeDeHoje(pessoa.id, hoje),
    reunioesDeHoje(pessoa.id),
    expedienteDeHoje(pessoa, feriados),
    aniversarioHoje(pessoa.id, hoje),
  ]);
  const anosDeCasa = tempoDeCasa.find((p) => p.id === pessoa.id)?.anos ?? null;
  return { hoje, feriados, inicioFerias, tempoDeCasa, atividade, reunioes, expediente, festa: { aniversario, anosDeCasa } };
}
