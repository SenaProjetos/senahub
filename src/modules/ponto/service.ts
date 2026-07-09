import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/lib/roles";
import {
  calcularDia,
  diaLocal,
  diaLocalDate,
  diaSemanaLocal,
  intervalosComProjeto,
  podeBater,
  transicoesPermitidas,
  type BatidaCalc,
  type TipoBatida,
  type EstadoJornada,
} from "@/modules/ponto/engine";
import {
  escalaRoleGrade,
  escalaUsuarioGrade,
  type DiaGrade,
} from "@/modules/rh/escalas/queries";

/** Origem da batida (espelha o enum Prisma OrigemBatida). */
export type OrigemBatida = "app" | "offline" | "ajuste_proprio" | "ajuste_admin" | "migracao";

/** Jornada aberta há mais que isto sem batida nova = abandonada (esqueceu de sair). */
const LIMITE_ABANDONO_MS = 16 * 60 * 60 * 1000;
/** Janela de deduplicação de batida idêntica (duplo-clique / replay offline). */
const JANELA_IDEMPOTENCIA_MS = 30_000;

const rotulo: Record<TipoBatida, string> = {
  entrada: "iniciar a jornada",
  inicio_descanso: "iniciar o descanso",
  fim_descanso: "voltar do descanso",
  saida: "encerrar a jornada",
};

function toCalc(b: { tipo: TipoBatida; horario: Date }): BatidaCalc {
  return { tipo: b.tipo, horario: b.horario };
}

type BatidaRow = { id: string; tipo: TipoBatida; horario: Date; dia: Date };

/**
 * Identifica a jornada corrente do usuário (a que uma nova batida afeta).
 *
 * A jornada pertence ao DIA da entrada e pode cruzar a meia-noite; por isso não
 * basta filtrar por "dia de hoje". Buscamos a última batida: se a jornada dela
 * está aberta e não venceu, a nova batida continua nesse mesmo `dia`. Se está
 * fechada (ou não há batidas), uma nova jornada começa no dia local de agora.
 * Se está aberta mas vencida (>16h), a jornada é abandonada aqui (a sessão
 * aberta é fechada contribuindo 0) e uma nova pode começar.
 */
async function jornadaCorrente(
  tx: Prisma.TransactionClient,
  userId: string,
  horario: Date,
  tipo: TipoBatida,
): Promise<{ diaJornada: Date; batidas: BatidaRow[]; estado: EstadoJornada; abandonou: boolean }> {
  const ultima = await tx.batida.findFirst({
    where: { userId },
    orderBy: { horario: "desc" },
    select: { dia: true, horario: true },
  });

  if (!ultima) {
    return { diaJornada: diaLocalDate(horario), batidas: [], estado: "fora", abandonou: false };
  }

  const batidas = (await tx.batida.findMany({
    where: { userId, dia: ultima.dia },
    orderBy: { horario: "asc" },
    select: { id: true, tipo: true, horario: true, dia: true },
  })) as BatidaRow[];

  const estado = calcularDia(batidas.map(toCalc), horario, false).estado;

  if (estado === "fora") {
    return { diaJornada: diaLocalDate(horario), batidas: [], estado: "fora", abandonou: false };
  }

  // Jornada aberta há mais de 16h → abandonada. Só descartamos ao INICIAR uma
  // nova jornada (entrada): aí a antiga dangling é fechada contribuindo 0 e a
  // nova começa no dia de agora. Para saida/descanso, honramos o estado real
  // para que o usuário CONSIGA encerrar a jornada presa (senão ficaria em loop
  // infinito: encerrar rejeitado para sempre, cronômetro subindo 24h+).
  if (tipo === "entrada" && horario.getTime() - ultima.horario.getTime() > LIMITE_ABANDONO_MS) {
    await fecharSessaoAbertaContribuindoZero(tx, userId);
    return { diaJornada: diaLocalDate(horario), batidas: [], estado: "fora", abandonou: true };
  }

  return { diaJornada: ultima.dia, batidas, estado, abandonou: false };
}

/** Fecha a sessão aberta do usuário com fim = início (0 min) — jornada abandonada. */
async function fecharSessaoAbertaContribuindoZero(tx: Prisma.TransactionClient, userId: string) {
  const aberta = await tx.sessaoTrabalho.findFirst({
    where: { userId, fim: null },
    orderBy: { inicio: "desc" },
  });
  if (aberta) {
    await tx.sessaoTrabalho.update({ where: { id: aberta.id }, data: { fim: aberta.inicio } });
  }
}

/** Fecha a sessão aberta do usuário em `t` (contabiliza o tempo trabalhado). */
async function fecharSessaoAberta(tx: Prisma.TransactionClient, userId: string, t: Date) {
  const aberta = await tx.sessaoTrabalho.findFirst({
    where: { userId, fim: null },
    orderBy: { inicio: "desc" },
  });
  if (aberta) {
    await tx.sessaoTrabalho.update({ where: { id: aberta.id }, data: { fim: t } });
  }
}

export type ResultadoBatida =
  | { idempotente: true }
  | { batidaId: string; estado: EstadoJornada };

/**
 * Aplica uma batida de ponto de forma transacional, mantendo o acoplamento
 * batida ↔ SessaoTrabalho no MESMO instante:
 *   entrada / fim_descanso → abre sessão no projeto ativo
 *   inicio_descanso / saida → fecha a sessão aberta
 * A sessão continua sendo a fonte do rateio; a batida é a fonte da jornada.
 * Invariante garantida por construção: Σ minutos das sessões == trabalhadoMin.
 */
export async function aplicarBatida(params: {
  userId: string;
  tipo: TipoBatida;
  horario: Date;
  projetoId?: string | null;
  geo?: Prisma.InputJsonValue | null;
  origem: OrigemBatida;
  criadoPorId?: string | null;
}): Promise<ResultadoBatida> {
  const { userId, tipo, horario, projetoId, geo, origem, criadoPorId } = params;

  return prisma.$transaction(async (tx) => {
    const { diaJornada, batidas, estado } = await jornadaCorrente(tx, userId, horario, tipo);

    // Idempotência (S8): batida do mesmo tipo, mesmo usuário, < 30s → no-op.
    const ultima = batidas[batidas.length - 1];
    if (
      ultima &&
      ultima.tipo === tipo &&
      Math.abs(horario.getTime() - ultima.horario.getTime()) < JANELA_IDEMPOTENCIA_MS
    ) {
      return { idempotente: true };
    }

    if (!podeBater(estado, tipo)) {
      const validas = transicoesPermitidas(estado).map((t) => rotulo[t]).join(" ou ");
      throw new ActionError(
        validas
          ? `Ação inválida agora. Você pode ${validas}.`
          : "Ação de ponto inválida no estado atual.",
      );
    }

    // Acoplamento com a sessão (rateio).
    if (tipo === "entrada" || tipo === "fim_descanso") {
      await tx.sessaoTrabalho.create({
        data: { userId, projetoId: projetoId || null, inicio: horario },
      });
    } else {
      await fecharSessaoAberta(tx, userId, horario);
    }

    const criada = await tx.batida.create({
      data: {
        userId,
        dia: diaJornada,
        tipo,
        horario,
        projetoId: projetoId || null,
        origem,
        criadoPorId: criadoPorId ?? null,
        geo: geo ?? undefined,
      },
      select: { id: true },
    });

    const estadoDepois = calcularDia(
      [...batidas.map(toCalc), { tipo, horario }],
      horario,
      false,
    ).estado;

    return { batidaId: criada.id, estado: estadoDepois };
  });
}

/**
 * Escala vigente do usuário para uma data: override do usuário (se ativo)
 * substitui a escala do perfil por inteiro; senão a escala do perfil; senão o
 * padrão seg-sex 8h. Puro-de-I/O (só leituras). Usado por espelho e alertas.
 */
export async function resolverEscala(userId: string, role: Role, data: Date): Promise<DiaGrade> {
  const ds = diaSemanaLocal(data);
  const usuario = await escalaUsuarioGrade(userId);
  if (usuario.temOverride) return usuario.dias[ds];
  const perfil = await escalaRoleGrade(role);
  return perfil[ds];
}

// ── Edição de dia + reconciliação de sessões (F5) ───────────────────────────

/** Item de batida vindo do editor: tipo + hora "HH:MM" (fuso de Brasília) + projeto. */
export type ItemEdicaoBatida = { tipo: TipoBatida; hora: string; projetoId?: string | null };

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Monta o instante UTC de uma hora local (Brasília, offset fixo -03:00 desde
 * 2019) num dado dia. `T${hora}:00-03:00` é interpretado pelo JS como o horário
 * de SP e convertido para UTC corretamente.
 */
function instanteLocal(diaISO: string, hora: string): Date {
  return new Date(`${diaISO}T${hora}:00-03:00`);
}

/**
 * Converte os itens do editor em batidas com horário absoluto, garantindo ordem
 * monotônica crescente (uma jornada que cruza a meia-noite tem a saída no dia
 * seguinte: se um horário não é maior que o anterior, soma 24h).
 */
export function montarBatidasEdicao(
  diaISO: string,
  itens: ItemEdicaoBatida[],
): { tipo: TipoBatida; horario: Date; projetoId: string | null }[] {
  let anterior = 0;
  return itens.map((it) => {
    let inst = instanteLocal(diaISO, it.hora).getTime();
    while (anterior && inst <= anterior) inst += DIA_MS;
    anterior = inst;
    return { tipo: it.tipo, horario: new Date(inst), projetoId: it.projetoId ?? null };
  });
}

/**
 * Reescreve as SessaoTrabalho de um dia LOCAL a partir das batidas informadas,
 * preservando a invariante do rateio (Σ minutos das sessões == trabalhadoMin).
 * Remove todas as sessões cujo INÍCIO cai no dia local (inclui splits de troca
 * de projeto e jornada que cruzou a meia-noite) e recria uma sessão por
 * intervalo de trabalho, com o projeto da batida que abriu o intervalo.
 */
export async function reconciliarSessoesDoDia(
  tx: Prisma.TransactionClient,
  userId: string,
  dia: Date,
  batidas: { tipo: TipoBatida; horario: Date; projetoId: string | null }[],
): Promise<void> {
  // `dia` é a meia-noite UTC do dia local → o próprio ISO (não aplicar diaLocal,
  // que deslocaria -3h e cairia no dia anterior).
  const targetISO = dia.toISOString().slice(0, 10);
  // Janela UTC folgada (±1 dia) e filtro exato por dia local — robusto a fuso.
  const candidatas = await tx.sessaoTrabalho.findMany({
    where: { userId, inicio: { gte: new Date(dia.getTime() - DIA_MS), lt: new Date(dia.getTime() + 2 * DIA_MS) } },
    select: { id: true, inicio: true },
  });
  const idsRemover = candidatas.filter((s) => diaLocal(s.inicio) === targetISO).map((s) => s.id);
  if (idsRemover.length > 0) {
    await tx.sessaoTrabalho.deleteMany({ where: { id: { in: idsRemover } } });
  }

  const diaCorrente = targetISO === diaLocal(new Date());
  const intervalos = intervalosComProjeto(batidas, diaCorrente);
  for (const it of intervalos) {
    await tx.sessaoTrabalho.create({
      data: { userId, projetoId: it.projetoId, inicio: it.inicio, fim: it.fim },
    });
  }
}

export type ResultadoEdicao = { ajusteId: string; status: "pendente_ciencia" | null };

/**
 * Edita as batidas de um DIA inteiro de forma transacional: valida a sequência,
 * substitui as batidas do dia, reconcilia as sessões (rateio) e registra um
 * AjustePonto com snapshot antes/depois. Edição própria (`proprio`) é aplicada
 * sem ciência; edição de terceiro fica `pendente_ciencia` até o usuário confirmar.
 * Bloqueia meses já fechados no banco de horas (snapshot congelado).
 */
export async function editarDia(params: {
  userId: string;
  editorId: string;
  diaISO: string;
  itens: ItemEdicaoBatida[];
  justificativa: string;
  proprio: boolean;
}): Promise<ResultadoEdicao> {
  const { userId, editorId, diaISO, itens, justificativa, proprio } = params;
  const dia = new Date(`${diaISO}T00:00:00.000Z`);

  // Não editar dias futuros.
  if (diaISO > diaLocal(new Date())) {
    throw new ActionError("Não é possível editar um dia futuro.");
  }

  // Mês já fechado no banco de horas → snapshot congelado, não reabrir.
  const [ano, mes] = diaISO.split("-").map(Number);
  const fechado = await prisma.bancoHorasMensal.findUnique({
    where: { userId_ano_mes: { userId, ano, mes } },
    select: { id: true },
  });
  if (fechado) {
    throw new ActionError("Mês já fechado no banco de horas — não pode ser editado.");
  }

  const novas = montarBatidasEdicao(diaISO, itens);
  const calc = calcularDia(novas.map((b) => ({ tipo: b.tipo, horario: b.horario })), new Date(), false);
  if (calc.inconsistencias > 0) {
    throw new ActionError(
      "Sequência inválida: use a ordem entrada → descanso(s) → saída, sem sobreposição.",
    );
  }
  // Guarda contra jornada implausível (ex.: saída digitada antes da entrada, que o
  // ajuste de meia-noite empurraria para ~23h). Cobre a cruzada real (ex.: 22h→06h).
  if (novas.length >= 2) {
    const span = novas[novas.length - 1].horario.getTime() - novas[0].horario.getTime();
    if (span > 20 * 60 * 60 * 1000) {
      throw new ActionError("Intervalo implausível (mais de 20h). Verifique os horários.");
    }
  }

  const status = proprio ? null : ("pendente_ciencia" as const);

  const ajusteId = await prisma.$transaction(async (tx) => {
    const antes = await tx.batida.findMany({
      where: { userId, dia },
      orderBy: { horario: "asc" },
      select: { tipo: true, horario: true, projetoId: true },
    });

    await tx.batida.deleteMany({ where: { userId, dia } });

    const origem: OrigemBatida = proprio ? "ajuste_proprio" : "ajuste_admin";
    for (const b of novas) {
      await tx.batida.create({
        data: {
          userId,
          dia,
          tipo: b.tipo,
          horario: b.horario,
          projetoId: b.projetoId,
          origem,
          editada: true,
          criadoPorId: editorId,
        },
      });
    }

    await reconciliarSessoesDoDia(tx, userId, dia, novas);

    const ajuste = await tx.ajustePonto.create({
      data: {
        userId,
        editorId,
        dia,
        justificativa,
        snapshotAntes: antes.map((b) => ({ tipo: b.tipo, horario: b.horario.toISOString(), projetoId: b.projetoId })),
        snapshotDepois: novas.map((b) => ({ tipo: b.tipo, horario: b.horario.toISOString(), projetoId: b.projetoId })),
        proprio,
        status,
      },
      select: { id: true },
    });
    return ajuste.id;
  });

  return { ajusteId, status };
}
