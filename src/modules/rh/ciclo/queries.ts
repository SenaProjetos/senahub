import "server-only";

import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { itemAtrasado, modeloSugerido, responsavelEfetivo, type Contratacao } from "./regras";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const selectCiclo = {
  id: true,
  userId: true,
  tipo: true,
  status: true,
  iniciadoEm: true,
  concluidoEm: true,
  ancora: true,
  template: { select: { nome: true } },
  itens: {
    orderBy: { ordem: "asc" as const },
    select: {
      id: true,
      descricao: true,
      concluido: true,
      concluidoEm: true,
      responsavel: true,
      prazoEm: true,
      patrimonio: true,
      evidencia: true,
    },
  },
} as const;

type CicloDb = Awaited<ReturnType<typeof prisma.onboardingProcesso.findFirstOrThrow<{ select: typeof selectCiclo }>>>;

/** Ciclo pronto para a tela: datas em `YYYY-MM-DD`, atraso já calculado contra hoje. */
function paraTela(c: CicloDb, hoje: string) {
  return {
    id: c.id,
    userId: c.userId,
    tipo: c.tipo,
    status: c.status,
    iniciadoEm: c.iniciadoEm.toISOString(),
    concluidoEm: c.concluidoEm?.toISOString() ?? null,
    ancora: iso(c.ancora),
    modelo: c.template?.nome ?? null,
    itens: c.itens.map((it) => {
      const prazoEm = iso(it.prazoEm);
      return {
        id: it.id,
        descricao: it.descricao,
        concluido: it.concluido,
        concluidoEm: it.concluidoEm?.toISOString() ?? null,
        responsavel: it.responsavel,
        prazoEm,
        patrimonio: it.patrimonio,
        evidencia: it.evidencia,
        atrasado: itemAtrasado({ concluido: it.concluido, prazoEm }, hoje),
      };
    }),
  };
}
export type CicloTela = ReturnType<typeof paraTela>;

/** Todos os ciclos da pessoa, o mais novo primeiro (o aberto aparece no topo). */
export async function ciclosDaPessoa(userId: string) {
  const hoje = diaDeSaoPaulo();
  const ciclos = await prisma.onboardingProcesso.findMany({
    where: { userId },
    select: selectCiclo,
    orderBy: [{ iniciadoEm: "desc" }],
  });
  return ciclos.map((c) => paraTela(c, hoje));
}

/** Ciclos em andamento de todo mundo (fila do RH em /rh/admin). */
export async function ciclosAbertos() {
  const hoje = diaDeSaoPaulo();
  const ciclos = await prisma.onboardingProcesso.findMany({
    where: { status: "em_andamento" },
    select: { ...selectCiclo, user: { select: { name: true } } },
    orderBy: [{ ancora: "asc" }, { iniciadoEm: "asc" }],
  });
  return ciclos.map((c) => ({ ...paraTela(c, hoje), nome: c.user.name }));
}
export type CicloAberto = Awaited<ReturnType<typeof ciclosAbertos>>[number];

/**
 * Itens abertos dos ciclos em andamento, agrupados por quem responde HOJE (RH, TI, a pessoa —
 * líder e coordenador ficam com o RH até a F3). Atrasados primeiro, depois por prazo.
 */
export async function pendenciasPorResponsavel() {
  const hoje = diaDeSaoPaulo();
  const itens = await prisma.onboardingItem.findMany({
    where: { concluido: false, processo: { status: "em_andamento" } },
    select: {
      id: true,
      descricao: true,
      responsavel: true,
      prazoEm: true,
      processo: { select: { id: true, tipo: true, userId: true, user: { select: { name: true } } } },
    },
  });
  const grupos: Record<"rh" | "ti" | "pessoa", ReturnType<typeof linha>[]> = { rh: [], ti: [], pessoa: [] };
  function linha(it: (typeof itens)[number]) {
    const prazoEm = iso(it.prazoEm);
    return {
      id: it.id,
      descricao: it.descricao,
      responsavel: it.responsavel,
      prazoEm,
      atrasado: itemAtrasado({ concluido: false, prazoEm }, hoje),
      cicloId: it.processo.id,
      tipo: it.processo.tipo,
      userId: it.processo.userId,
      nome: it.processo.user.name,
    };
  }
  for (const it of itens) grupos[responsavelEfetivo(it.responsavel)].push(linha(it));
  const ordem = (a: ReturnType<typeof linha>, b: ReturnType<typeof linha>) =>
    Number(b.atrasado) - Number(a.atrasado) || (a.prazoEm ?? "9999").localeCompare(b.prazoEm ?? "9999");
  for (const g of Object.values(grupos)) g.sort(ordem);
  return grupos;
}
export type PendenciasCiclo = Awaited<ReturnType<typeof pendenciasPorResponsavel>>;

/** Listas-modelo (todas, para a tela de edição; a escolha de um ciclo filtra as ativas). */
export async function modelosCiclo() {
  const modelos = await prisma.onboardingTemplate.findMany({
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    include: { itens: { orderBy: { ordem: "asc" } }, _count: { select: { processos: true } } },
  });
  return modelos.map((m) => ({
    id: m.id,
    nome: m.nome,
    ativo: m.ativo,
    tipo: m.tipo,
    publico: m.publico,
    usos: m._count.processos,
    itens: m.itens.map((it) => ({
      id: it.id,
      descricao: it.descricao,
      responsavel: it.responsavel,
      prazoDias: it.prazoDias,
      patrimonio: it.patrimonio,
    })),
  }));
}
export type ModeloCiclo = Awaited<ReturnType<typeof modelosCiclo>>[number];

/** O que a ficha precisa para oferecer "Abrir lista": modelos ativos e o sugerido pela contratação. */
export async function opcoesDeCicloDaPessoa(userId: string) {
  const [pessoa, modelos] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { contratacao: true, vinculoAtivo: { select: { contratacao: true, dataFim: true } } },
    }),
    prisma.onboardingTemplate.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, ativo: true, tipo: true, publico: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  const contratacao = (pessoa?.vinculoAtivo?.contratacao ?? pessoa?.contratacao ?? null) as Contratacao | null;
  return {
    modelos,
    sugeridoEntrada: modeloSugerido(modelos, "entrada", contratacao)?.id ?? null,
    sugeridoSaida: modeloSugerido(modelos, "saida", contratacao)?.id ?? null,
    ultimoDiaVinculo: iso(pessoa?.vinculoAtivo?.dataFim),
  };
}
export type OpcoesCiclo = Awaited<ReturnType<typeof opcoesDeCicloDaPessoa>>;

/**
 * Ativos e máquinas sob responsabilidade da pessoa — só leitura, para o item de devolução. Ativo
 * baixado fica de fora; máquina ligada a um ativo já listado não aparece duas vezes.
 */
export async function equipamentosDaPessoa(userId: string) {
  const [ativos, maquinas] = await Promise.all([
    prisma.ativo.findMany({
      where: { responsavelId: userId, status: { not: "baixado" } },
      select: { id: true, nome: true, categoria: true },
      orderBy: { nome: "asc" },
    }),
    prisma.maquinaTI.findMany({
      where: { responsavelId: userId },
      select: { id: true, nome: true, patrimonioId: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  const idsAtivos = new Set(ativos.map((a) => a.id));
  return [
    ...ativos.map((a) => ({ id: a.id, tipo: "ativo" as const, nome: a.nome, detalhe: a.categoria })),
    ...maquinas
      .filter((m) => !m.patrimonioId || !idsAtivos.has(m.patrimonioId))
      .map((m) => ({ id: m.id, tipo: "maquina" as const, nome: m.nome, detalhe: "Máquina de TI" })),
  ];
}
export type EquipamentoDaPessoa = Awaited<ReturnType<typeof equipamentosDaPessoa>>[number];

/** Pessoas para "abrir lista" na fila do RH: internas ativas, com a contratação e o último dia do vínculo. */
export async function pessoasParaCiclo() {
  const pessoas = await prisma.user.findMany({
    where: { ativo: true, tipo: "interno" },
    select: { id: true, name: true, contratacao: true, vinculoAtivo: { select: { contratacao: true, dataFim: true } } },
    orderBy: { name: "asc" },
  });
  return pessoas.map((p) => ({
    id: p.id,
    nome: p.name,
    contratacao: (p.vinculoAtivo?.contratacao ?? p.contratacao ?? null) as Contratacao | null,
    ultimoDiaVinculo: iso(p.vinculoAtivo?.dataFim),
  }));
}
export type PessoaParaCiclo = Awaited<ReturnType<typeof pessoasParaCiclo>>[number];
