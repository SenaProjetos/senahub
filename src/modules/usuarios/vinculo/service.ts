/**
 * Escrita de vínculo — **ponto único** que mantém `User.setor`/`User.contratacao`/`User.tipo`
 * e `User.vinculoAtivoId` em sincronia com a tabela `Vinculo`.
 *
 * Sem `server-only`: é compartilhado por Server Actions, jobs e scripts (`tsx`), como o resto
 * dos `service.ts` do projeto.
 *
 * A regra que justifica este arquivo existir: os escalares em `User` são CACHE. Se qualquer
 * outro lugar escrever neles direto, a fonte de verdade (`Vinculo`) e o cache divergem, e
 * folha/rateio/audiência passam a discordar entre si sem ninguém perceber.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§5)
 */
import type { Contratacao, Prisma, Setor, TipoUsuario } from "@/generated/prisma/client";
import { inicioDoDiaUtc } from "@/lib/data";

/** Cliente Prisma ou transação — permite compor com outras escritas. */
type Db = Prisma.TransactionClient;

export type NovoVinculo = {
  contratacao: Contratacao;
  setor: Setor;
  cargo?: string | null;
  cargaSemanal?: Prisma.Decimal | number | null;
  remuneracao?: Prisma.Decimal | number | null;
  pjId?: string | null;
  dataInicio: Date;
};

/**
 * Encerra o vínculo ativo (se houver) e abre um novo, atualizando o cache do usuário.
 *
 * O vínculo anterior é **encerrado, nunca apagado**: é ele que prova qual era a jornada, o
 * setor e a remuneração em qualquer data passada. `dataFim` recebe o dia anterior ao início
 * do novo, para os períodos não se sobreporem.
 */
export async function aplicarVinculo(
  db: Db,
  userId: string,
  dados: NovoVinculo,
  opcoes: { motivoFimAnterior?: string } = {},
) {
  const anterior = await db.vinculo.findFirst({
    where: { userId, ativo: true },
    orderBy: { dataInicio: "desc" },
    select: { id: true, dataInicio: true },
  });

  if (anterior) {
    const fim = new Date(dados.dataInicio);
    fim.setUTCDate(fim.getUTCDate() - 1);
    await db.vinculo.update({
      where: { id: anterior.id },
      data: {
        ativo: false,
        // Vínculo de um dia só (ou datas invertidas) não pode gerar dataFim < dataInicio.
        dataFim: fim < anterior.dataInicio ? anterior.dataInicio : fim,
        motivoFim: opcoes.motivoFimAnterior ?? "substituido",
      },
    });
  }

  const novo = await db.vinculo.create({
    data: {
      userId,
      contratacao: dados.contratacao,
      setor: dados.setor,
      cargo: dados.cargo ?? null,
      cargaSemanal: dados.cargaSemanal ?? null,
      remuneracao: dados.remuneracao ?? null,
      pjId: dados.pjId ?? null,
      dataInicio: dados.dataInicio,
      ativo: true,
    },
  });

  await sincronizarCache(db, userId, {
    tipo: "interno",
    setor: dados.setor,
    contratacao: dados.contratacao,
    vinculoAtivoId: novo.id,
  });
  // Vínculo novo = a pessoa fica. Um corte de login agendado por um desligamento anterior
  // (ex.: fim do estágio seguido de efetivação) derrubaria quem acabou de ser contratado.
  await db.user.update({ where: { id: userId }, data: { acessoAte: null } });

  return novo;
}

/**
 * Registra o desligamento: último dia do vínculo e último dia com login.
 *
 * Só AGENDA. O vínculo continua `ativo` (e a pessoa batendo ponto) até `dataFim`, e o login vale
 * até `acessoAte`; quem executa é `aplicarDesligamentosVencidos` — chamado aqui mesmo, para que
 * datas já passadas valham na hora, e pela rotina diária de RH para as futuras.
 *
 * Pré-condições (a action valida): existe vínculo ativo e `dataFim >= dataInicio` dele.
 */
export async function agendarDesligamento(
  db: Db,
  userId: string,
  dados: { vinculoId: string; dataFim: Date; motivo: string; acessoAte: Date },
  agora: Date = new Date(),
) {
  await db.vinculo.update({
    where: { id: dados.vinculoId },
    data: { dataFim: dados.dataFim, motivoFim: dados.motivo },
  });
  await db.user.update({ where: { id: userId }, data: { acessoAte: dados.acessoAte } });
  return aplicarDesligamentosVencidos(db, agora, userId);
}

/**
 * Desfaz um desligamento que ainda não aconteceu (vínculo ainda ativo). Depois de aplicado,
 * o caminho é reativar o usuário e abrir um vínculo novo — o encerrado é histórico.
 */
export async function cancelarDesligamento(db: Db, userId: string, vinculoId: string) {
  await db.vinculo.update({ where: { id: vinculoId }, data: { dataFim: null, motivoFim: null } });
  await db.user.update({ where: { id: userId }, data: { acessoAte: null } });
}

/**
 * Executa os desligamentos cujas datas já passaram. Idempotente — a rotina diária pode rodar
 * de novo, ou atrasada, sem efeito extra.
 *
 * 1. Vínculo com `dataFim` vencida: `ativo = false` e o cache do usuário zerado (sem setor, sem
 *    contratação). `tipo` fica como está — a pessoa segue sendo alguém que foi interno, e
 *    `controlaJornada` lê "só vínculo encerrado" como "não bate ponto" (ver `ponto/jornada.ts`).
 * 2. Usuário com `acessoAte` vencido: `ativo = false` e sessões apagadas. `getSession` já
 *    recusa a sessão desde a meia-noite; aqui a desativação fica gravada e as listas de
 *    usuários ativos deixam de trazê-lo.
 */
export async function aplicarDesligamentosVencidos(db: Db, agora: Date = new Date(), userId?: string) {
  const hoje = inicioDoDiaUtc(agora);
  const doUsuario = userId ? { userId } : {};

  const vinculos = await db.vinculo.findMany({
    where: { ...doUsuario, ativo: true, dataFim: { lt: hoje } },
    select: { id: true, userId: true, user: { select: { tipo: true, vinculoAtivoId: true } } },
  });
  for (const v of vinculos) {
    await db.vinculo.update({ where: { id: v.id }, data: { ativo: false } });
    if (v.user.vinculoAtivoId === v.id) {
      await sincronizarCache(db, v.userId, {
        tipo: v.user.tipo ?? "interno",
        setor: null,
        contratacao: null,
        vinculoAtivoId: null,
      });
    }
  }

  const usuarios = await db.user.findMany({
    where: { ...(userId ? { id: userId } : {}), ativo: true, acessoAte: { lt: hoje } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await db.user.updateMany({ where: { id: { in: ids } }, data: { ativo: false } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
  }

  return { vinculosEncerrados: vinculos.length, acessosEncerrados: ids.length };
}

/** Marca o usuário como externo (portal do cliente): sem setor, sem contratação, sem vínculo. */
export async function marcarExterno(db: Db, userId: string) {
  await sincronizarCache(db, userId, {
    tipo: "externo",
    setor: null,
    contratacao: null,
    vinculoAtivoId: null,
  });
}

/**
 * Grava os escalares denormalizados. Privada de propósito: quem precisa mexer em setor ou
 * contratação passa por `aplicarVinculo`, senão o cache deixa de ser derivado.
 */
async function sincronizarCache(
  db: Db,
  userId: string,
  cache: {
    tipo: TipoUsuario;
    setor: Setor | null;
    contratacao: Contratacao | null;
    vinculoAtivoId: string | null;
  },
) {
  await db.user.update({ where: { id: userId }, data: cache });
}

/**
 * Divergências entre a fonte de verdade (`Vinculo` ativo) e o cache em `User`.
 * Alimenta o teste de consistência e a reconciliação — se isto voltar não-vazio, alguém
 * escreveu no cache por fora de `aplicarVinculo`.
 */
export async function inconsistenciasDeCache(db: Db) {
  const usuarios = await db.user.findMany({
    where: { tipo: "interno" },
    select: {
      id: true,
      name: true,
      setor: true,
      contratacao: true,
      vinculoAtivoId: true,
      vinculos: {
        where: { ativo: true },
        select: { id: true, setor: true, contratacao: true },
      },
    },
  });

  const problemas: { userId: string; nome: string; problema: string }[] = [];
  for (const u of usuarios) {
    if (u.vinculos.length > 1) {
      problemas.push({ userId: u.id, nome: u.name, problema: `${u.vinculos.length} vínculos ativos` });
      continue;
    }
    const ativo = u.vinculos[0];
    if (!ativo) {
      if (u.vinculoAtivoId || u.setor || u.contratacao) {
        problemas.push({ userId: u.id, nome: u.name, problema: "cache preenchido sem vínculo ativo" });
      }
      continue;
    }
    if (u.vinculoAtivoId !== ativo.id) {
      problemas.push({ userId: u.id, nome: u.name, problema: "vinculoAtivoId aponta para outro vínculo" });
    }
    if (u.setor !== ativo.setor || u.contratacao !== ativo.contratacao) {
      problemas.push({ userId: u.id, nome: u.name, problema: "setor/contratação divergem do vínculo ativo" });
    }
  }
  return problemas;
}
