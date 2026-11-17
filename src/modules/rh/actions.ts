"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { aplicaRegraInicioFeriasClt, controlaJornada, type SujeitoJornada } from "@/modules/ponto/jornada";
import { formatarData } from "@/lib/utils";
import { validarInicioFeriasClt } from "@/lib/ferias-clt";
import { listarFeriados } from "@/modules/rh/feriados/queries";
import { avisarImpactoDaAusencia } from "@/modules/planejamento/impacto-ausencia-service";
import {
  MOTIVO_ABONO_JA_DECIDIDO,
  MOTIVO_APROVAR_SOBREPOSTA,
  motivoParaNaoDecidirAbono,
  tratamentoPadrao,
} from "@/modules/rh/abono-entrada";
import {
  MOTIVO_FERIAS_JA_DECIDIDAS,
  motivoParaNaoDecidirFerias,
  motivoParaNaoDecidirFeriasDe,
  motivoParaNaoLancarFeriasPara,
} from "@/modules/rh/ferias-decisao";
import {
  MOTIVO_AUSENCIA_OCUPADA,
  OPCOES_TX_AUSENCIA,
  ausenciaSobreposta,
  ehTempoEsgotado,
  travarAusenciasDaPessoa,
} from "@/modules/rh/abono-service";
import { ehDoRh, notificarQuemDecide, notificarSemFalhar } from "@/modules/rh/gestores-rh";
import { recalcularBancoDaPessoaSemFalhar } from "@/modules/rh/banco/service";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Mesma frase para qualquer corrida nas alterações de férias (dois cliques, duas abas). */
const MOTIVO_ALTERACAO_MUDOU = "A alteração destas férias mudou enquanto você decidia. Atualize a página.";
const menorData = (a: Date, b: Date) => (a < b ? a : b);

/**
 * `roles` é obrigatório aqui: sem `roles` E sem `recurso`, `defineAction` pula o gate inteiro
 * (`lib/with-action.ts`). Como Server Action é endpoint, o perfil `cliente` alcançava o
 * self-service de RH. Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§4c)
 */
const base = { modulo: "rh", interno: true } as const;
const adminBase = { modulo: "rh", gereRh: true } as const;

// ── Self-service ──────────────────────────────────────────────
/**
 * Restrito a quem tem jornada controlada (`controlaJornada`, pela CONTRATAÇÃO — não pelo papel):
 * férias são instituto celetista (e recesso, no estágio). PJ, freelancer e sócio não têm férias —
 * abrir a solicitação para eles materializa subordinação. Um Administrativo ou TI contratado CLT
 * tem, e até 2026-09-15 era recusado aqui por causa do papel.
 */
export const solicitarFerias = defineAction(
  {
    ...base,
    acao: "solicitar-ferias",
    entidade: "Ferias",
    schema: z.object({
      inicio: z.string().min(1),
      fim: z.string().min(1),
      observacao: z.string().optional(),
    }),
  },
  async (i, { user }) => {
    if (!controlaJornada(user)) throw new ActionError("Férias são só para contratação CLT ou estágio.");
    await garantirInicioFeriasClt(user, i.inicio);
    const f = await prisma.ferias.create({
      data: { userId: user.id, inicio: new Date(i.inicio), fim: new Date(i.fim), observacao: i.observacao || null },
    });
    // Quem é do RH tem as férias decididas por um administrador — o aviso vai para quem decide.
    await notificarQuemDecide(user.id, {
      titulo: "Solicitação de férias",
      corpo: `${user.name} solicitou férias.`,
      href: "/rh/admin",
    });
    revalidatePath("/rh");
    return { id: f.id };
  },
);

export const registrarHumor = defineAction(
  {
    ...base,
    acao: "registrar-humor",
    entidade: "RegistroEmocao",
    schema: z.object({ humor: z.number().int().min(1).max(5), comentario: z.string().optional() }),
    audit: false,
  },
  async (i, { user }) => {
    const dia = new Date();
    dia.setHours(0, 0, 0, 0);
    await prisma.registroEmocao.upsert({
      where: { userId_dia: { userId: user.id, dia } },
      create: { userId: user.id, dia, humor: i.humor, comentario: i.comentario || null },
      update: { humor: i.humor, comentario: i.comentario || null },
    });
    revalidatePath("/rh");
    return { ok: true };
  },
);

/**
 * Feedback livre à empresa (do herocard). `anonimo` → não grava userId (RH não vê o autor).
 * `audit: false` p/ que, quando anônimo, não exista trilha ligando autor ↔ conteúdo.
 */
export const registrarHumorFeedback = defineAction(
  {
    ...base,
    acao: "registrar-humor-feedback",
    entidade: "FeedbackHumor",
    schema: z.object({ conteudo: z.string().min(1, "Escreva algo.").max(2000), anonimo: z.boolean().default(false) }),
    audit: false,
  },
  async (i, { user }) => {
    await prisma.feedbackHumor.create({
      data: { conteudo: i.conteudo, anonimo: i.anonimo, userId: i.anonimo ? null : user.id },
    });
    return { ok: true };
  },
);

// ── Validação (gestores) ──────────────────────────────────────
const validarSchema = z.object({ id: z.string().min(1), aprovar: z.boolean() });

const validarAbonoSchema = validarSchema.extend({
  /** Só vale ao aprovar. Omitido: atestado abona; consulta/exame/compromisso/outro descontam do banco. */
  tratamento: z.enum(["abonar", "banco_horas"]).optional(),
});

export const validarAbono = defineAction(
  {
    ...adminBase,
    acao: "validar-abono",
    entidade: "AbonoFalta",
    schema: validarAbonoSchema,
    // O RH decide a linha de OUTRA pessoa — a trilha aponta qual abono e como ele estava.
    entidadeId: (d) => (d as { id: string }).id,
    capturarAntes: async (i) =>
      prisma.abonoFalta.findUnique({
        where: { id: i.id },
        select: { userId: true, status: true, tratamento: true, motivoTipo: true },
      }),
  },
  async (i, { user }) => {
    const abono = await prisma.abonoFalta.findUnique({ where: { id: i.id } });
    if (!abono) throw new ActionError("Abono não encontrado.");
    // Já decidido, a própria ausência ou a de quem é do RH sem ser administrador
    // (`quem-decide.ts`) — a fila mostra a mesma frase no lugar dos botões.
    const recusa = motivoParaNaoDecidirAbono(
      { ...abono, donoEhRh: await ehDoRh(abono.userId) },
      { id: user.id, superUsuario: user.superUsuario === true },
    );
    if (recusa) throw new ActionError(recusa);
    const tratamento = i.tratamento ?? tratamentoPadrao(abono.motivoTipo);
    try {
      await prisma.$transaction(async (tx) => {
        // Sob a trava da pessoa, como o lançamento do RH: aprovar por cima de uma ausência já
        // aprovada no mesmo tempo contaria as horas duas vezes.
        await travarAusenciasDaPessoa(tx, abono.userId);
        if (i.aprovar) {
          const periodo = {
            dataInicio: ymd(abono.dataInicio),
            dataFim: ymd(abono.dataFim),
            horaInicio: abono.horaInicio,
            horaFim: abono.horaFim,
          };
          if (await ausenciaSobreposta(tx, abono.userId, periodo, ["aprovado"], abono.id)) {
            throw new ActionError(MOTIVO_APROVAR_SOBREPOSTA);
          }
        }
        // Condicionado a `pendente`: dois cliques (ou dois gestores) ao mesmo tempo decidem uma vez
        // só — o segundo não sobrescreve a decisão nem notifica a pessoa de novo.
        const { count } = await tx.abonoFalta.updateMany({
          where: { id: i.id, status: "pendente" },
          data: {
            status: i.aprovar ? "aprovado" : "rejeitado",
            ...(i.aprovar ? { tratamento } : {}),
            validadoPorId: user.id,
            validadoEm: new Date(),
          },
        });
        if (count !== 1) throw new ActionError(MOTIVO_ABONO_JA_DECIDIDO);
      }, OPCOES_TX_AUSENCIA);
    } catch (e) {
      if (ehTempoEsgotado(e)) throw new ActionError(MOTIVO_AUSENCIA_OCUPADA);
      throw e;
    }
    await notificarSemFalhar(abono.userId, {
      titulo: i.aprovar ? "Ausência aprovada" : "Ausência rejeitada",
      corpo: !i.aprovar
        ? "Sua solicitação de abono foi avaliada."
        : tratamento === "abonar"
          ? "Sua ausência foi aprovada e abonada: as horas não serão cobradas."
          : "Sua ausência foi aprovada e será descontada do banco de horas.",
      href: "/rh",
    });
    if (i.aprovar) {
      await avisarImpactoDaAusencia({
        userId: abono.userId,
        inicio: abono.dataInicio,
        fim: abono.dataFim,
        tipo: "ausencia",
        registroId: abono.id,
      });
      // Mês de banco de horas já fechado: o saldo congelado passa a contar a ausência.
      await recalcularBancoDaPessoaSemFalhar(abono.userId, abono.dataInicio);
    }
    revalidatePath("/rh/admin");
    return { id: i.id };
  },
);

export const validarFerias = defineAction(
  {
    ...adminBase,
    acao: "validar-ferias",
    entidade: "Ferias",
    schema: validarSchema,
    // O RH decide a linha de OUTRA pessoa — a trilha aponta quais férias e como estavam.
    entidadeId: (d) => (d as { id: string }).id,
    // Datas em texto: a auditoria grava `Date` como objeto vazio.
    capturarAntes: async (i) => {
      const f = await prisma.ferias.findUnique({
        where: { id: i.id },
        select: { userId: true, status: true, inicio: true, fim: true },
      });
      return f && { ...f, inicio: ymd(f.inicio), fim: ymd(f.fim) };
    },
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    // Já decididas, as próprias férias ou as de quem é do RH sem ser administrador
    // (`quem-decide.ts`) — a fila mostra a mesma frase no lugar dos botões.
    const recusa = motivoParaNaoDecidirFerias(
      { ...f, donoEhRh: await ehDoRh(f.userId) },
      { id: user.id, superUsuario: user.superUsuario === true },
    );
    if (recusa) throw new ActionError(recusa);
    // Condicionado a `pendente`: dois cliques (ou dois gestores) ao mesmo tempo decidem uma vez
    // só — o segundo não sobrescreve a decisão nem notifica a pessoa de novo.
    const { count } = await prisma.ferias.updateMany({
      where: { id: i.id, status: "pendente" },
      data: { status: i.aprovar ? "aprovado" : "rejeitado", validadoPorId: user.id },
    });
    if (count !== 1) throw new ActionError(MOTIVO_FERIAS_JA_DECIDIDAS);
    await notificarSemFalhar(f.userId, {
      titulo: i.aprovar ? "Férias aprovadas" : "Férias rejeitadas",
      corpo: "Sua solicitação de férias foi avaliada.",
      href: "/rh",
    });
    if (i.aprovar) {
      await avisarImpactoDaAusencia({ userId: f.userId, inicio: f.inicio, fim: f.fim, tipo: "ferias", registroId: f.id });
      await recalcularBancoDaPessoaSemFalhar(f.userId, f.inicio);
    }
    revalidatePath("/rh/admin");
    return { id: i.id };
  },
);

// ── Lançamento direto pelo RH ─────────────────────────────────
const lancarFeriasSchema = z
  .object({
    userId: z.string().min(1, "Selecione o colaborador."),
    inicio: z.string().min(1),
    fim: z.string().min(1),
    observacao: z.string().optional(),
  })
  .refine((v) => v.fim >= v.inicio, {
    message: "A data de fim não pode ser anterior ao início.",
    path: ["fim"],
  });

/**
 * RH/admin registra férias de um colaborador SEM solicitação prévia dele (CLT art. 136:
 * a época do gozo é definida pelo empregador). Nasce já `aprovado`, então os efeitos —
 * ponto, banco de horas, agenda, disponibilidade em projetos, jobs — valem na hora: todos
 * os consumidores leem `status: "aprovado"` + intervalo de datas. Nenhuma regra é duplicada.
 *
 * `lancadoPorId` distingue este registro de uma solicitação do colaborador que o RH aprovou.
 */
export const lancarFeriasColaborador = defineAction(
  {
    ...adminBase,
    acao: "lancar-ferias-colaborador",
    entidade: "Ferias",
    schema: lancarFeriasSchema,
    // As outras actions de férias não definem `entidadeId` porque agem sobre o próprio
    // registro do autor. Aqui o RH age sobre a linha de OUTRA pessoa — a trilha precisa
    // apontar qual registro nasceu.
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const achado = await prisma.user.findUnique({
      where: { id: i.userId },
      select: { id: true, tipo: true, ativo: true, contratacao: true },
    });
    if (!achado || !achado.ativo) throw new ActionError("Colaborador não encontrado.");
    // Férias lançadas nascem aprovadas: as próprias e as de quem é do RH só um administrador
    // lança (`quem-decide.ts`) — o RH usa a solicitação, que um administrador aprova.
    const naoPode = motivoParaNaoLancarFeriasPara(
      { id: achado.id, ehRh: await ehDoRh(achado.id) },
      { id: user.id, superUsuario: user.superUsuario === true },
    );
    if (naoPode) throw new ActionError(naoPode);
    const alvo: SujeitoJornada & { id: string } = {
      id: achado.id,
      tipo: achado.tipo,
      contratacao: achado.contratacao,
    };
    // Mesma restrição do autoatendimento, aplicada ao ALVO (o chamador é sempre gestor de RH):
    // férias são instituto celetista — lançar para PJ/freelancer materializaria subordinação.
    if (!controlaJornada(alvo))
      throw new ActionError("Férias só podem ser lançadas para contratação CLT ou estágio.");
    // Regra CLT de início pelo ALVO, não pelo RH — passar o chamador aqui validaria a pessoa errada.
    await garantirInicioFeriasClt(alvo, i.inicio);

    const f = await prisma.ferias.create({
      data: {
        userId: alvo.id,
        inicio: new Date(i.inicio),
        fim: new Date(i.fim),
        observacao: i.observacao || null,
        status: "aprovado",
        validadoPorId: user.id,
        lancadoPorId: user.id,
      },
    });

    await notificarSemFalhar(alvo.id, {
      titulo: "Férias lançadas pelo RH",
      corpo: `O RH registrou suas férias de ${formatarData(f.inicio)} a ${formatarData(f.fim)}.`,
      href: "/rh",
    });
    await avisarImpactoDaAusencia({ userId: alvo.id, inicio: f.inicio, fim: f.fim, tipo: "ferias", registroId: f.id });
    await recalcularBancoDaPessoaSemFalhar(alvo.id, f.inicio);
    revalidatePath("/rh");
    revalidatePath("/rh/admin");
    return { id: f.id };
  },
);

// ── Edição de férias ──────────────────────────────────────────
const editarPendenteSchema = z.object({
  id: z.string().min(1),
  inicio: z.string().min(1),
  fim: z.string().min(1),
  observacao: z.string().optional(),
});

/**
 * Edição livre de férias AINDA PENDENTES pelo próprio funcionário (antes de qualquer
 * aprovação). Férias já aprovadas usam o fluxo de proposta+dupla aprovação.
 */
export const editarFeriasPendente = defineAction(
  {
    ...base,
    acao: "editar-ferias-pendente",
    entidade: "Ferias",
    schema: editarPendenteSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    if (f.userId !== user.id) throw new ActionError("Sem permissão.");
    if (f.status !== "pendente")
      throw new ActionError("Férias já avaliadas — proponha uma alteração para mudar as datas.");
    await garantirInicioFeriasClt(user, i.inicio);
    // Condicionado a `pendente`: se o RH aprovou no meio, as datas aprovadas não mudam por aqui.
    const { count } = await prisma.ferias.updateMany({
      where: { id: f.id, status: "pendente" },
      data: { inicio: new Date(i.inicio), fim: new Date(i.fim), observacao: i.observacao || null },
    });
    if (count !== 1) throw new ActionError("Férias já avaliadas — proponha uma alteração para mudar as datas.");
    revalidatePath("/rh");
    return { id: f.id };
  },
);

const proporSchema = z.object({
  id: z.string().min(1),
  inicio: z.string().min(1),
  fim: z.string().min(1),
});

/**
 * Propõe nova data para férias JÁ APROVADAS. Pode ser iniciada pelo funcionário (dono)
 * ou por um gestor de RH; só entra em vigor após aprovação das DUAS partes. O lado de
 * quem propõe já conta como aprovado; a contraparte é notificada para decidir.
 */
export const proporAlteracaoFerias = defineAction(
  {
    ...base,
    acao: "propor-alteracao-ferias",
    entidade: "Ferias",
    schema: proporSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f) throw new ActionError("Solicitação não encontrada.");
    if (f.status !== "aprovado")
      throw new ActionError("Só é possível propor alteração em férias já aprovadas.");
    const ehDono = f.userId === user.id;
    // O lado "empresa" da dupla aprovação só conta para quem pode decidir férias deste dono: as
    // próprias e as de quem é do RH, só um administrador (`quem-decide.ts`).
    const bloqueio = user.gereRh
      ? motivoParaNaoDecidirFeriasDe(
          { id: f.userId, ehRh: await ehDoRh(f.userId) },
          { id: user.id, superUsuario: user.superUsuario === true },
        )
      : "Sem permissão.";
    const ehAdmin = bloqueio === null;
    if (!ehDono && !ehAdmin) throw new ActionError(bloqueio ?? "Sem permissão.");
    if (f.altInicio) throw new ActionError("Já existe uma alteração pendente para estas férias.");

    // Regra CLT de início vale para a NOVA data, conforme a contratação do DONO das férias (quem
    // propõe pode ser o RH). Sem dono carregado, o sujeito vai incompleto e a regra VALIDA — antes
    // era `dono?.role ?? ""`, que pulava a validação.
    const dono = await prisma.user.findUnique({
      where: { id: f.userId },
      select: { tipo: true, name: true, contratacao: true },
    });
    await garantirInicioFeriasClt(
      dono
        ? { tipo: dono.tipo, contratacao: dono.contratacao }
        : ({ tipo: "interno" } as SujeitoJornada),
      i.inicio,
    );

    const okAdmin = ehAdmin;
    const okFunc = ehDono;

    // Só o administrador, nas próprias férias, satisfaz os dois lados: aplica direto. O dono que é
    // do RH sem ser administrador cai na proposta, que um administrador aprova.
    if (okAdmin && okFunc) {
      const { count } = await prisma.ferias.updateMany({
        where: { id: f.id, status: "aprovado", altInicio: null },
        data: { inicio: new Date(i.inicio), fim: new Date(i.fim) },
      });
      if (count !== 1) throw new ActionError(MOTIVO_ALTERACAO_MUDOU);
      await avisarImpactoDaAusencia({
        userId: f.userId,
        inicio: new Date(i.inicio),
        fim: new Date(i.fim),
        tipo: "ferias",
        registroId: f.id,
      });
      await recalcularBancoDaPessoaSemFalhar(f.userId, menorData(f.inicio, new Date(i.inicio)));
      revalidatePath("/rh");
      revalidatePath("/rh/admin");
      return { id: f.id, aplicado: true };
    }

    // Condicionado a "sem proposta aberta": duas propostas ao mesmo tempo não se sobrescrevem.
    const { count } = await prisma.ferias.updateMany({
      where: { id: f.id, status: "aprovado", altInicio: null },
      data: {
        altInicio: new Date(i.inicio),
        altFim: new Date(i.fim),
        altPorId: user.id,
        altOkAdmin: okAdmin,
        altOkFunc: okFunc,
      },
    });
    if (count !== 1) throw new ActionError(MOTIVO_ALTERACAO_MUDOU);

    if (ehDono) {
      await notificarQuemDecide(f.userId, {
        titulo: "Alteração de férias proposta",
        corpo: `${dono?.name ?? "Colaborador"} propôs uma nova data de férias — precisa da sua aprovação.`,
        href: "/rh/admin",
      });
    } else {
      await notificarSemFalhar(f.userId, {
        titulo: "Alteração de férias proposta",
        corpo: "O RH propôs uma nova data para suas férias. Aprove ou recuse em RH.",
        href: "/rh",
      });
    }
    revalidatePath("/rh");
    revalidatePath("/rh/admin");
    return { id: f.id, aplicado: false };
  },
);

const responderSchema = z.object({ id: z.string().min(1), aprovar: z.boolean() });

/**
 * A contraparte responde à proposta de alteração: aprovar aplica a nova data (o lado de
 * quem propôs já estava aprovado, então uma aprovação completa a dupla); recusar descarta
 * a proposta e mantém as datas originais.
 */
export const responderAlteracaoFerias = defineAction(
  {
    ...base,
    acao: "responder-alteracao-ferias",
    entidade: "Ferias",
    schema: responderSchema,
    capturarAntes: (i) => prisma.ferias.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const f = await prisma.ferias.findUnique({ where: { id: i.id } });
    if (!f || !f.altInicio || !f.altFim) throw new ActionError("Não há alteração pendente.");
    const ehDono = f.userId === user.id;
    // O lado "empresa" só responde quem pode decidir férias deste dono (`quem-decide.ts`).
    const bloqueio = user.gereRh
      ? motivoParaNaoDecidirFeriasDe(
          { id: f.userId, ehRh: await ehDoRh(f.userId) },
          { id: user.id, superUsuario: user.superUsuario === true },
        )
      : null;
    const ehAdmin = user.gereRh && bloqueio === null;
    // Só pode responder o lado que ainda NÃO aprovou (a contraparte de quem propôs).
    const respondeAdmin = ehAdmin && !f.altOkAdmin;
    const respondeFunc = ehDono && !f.altOkFunc;
    if (!respondeAdmin && !respondeFunc) {
      throw new ActionError(
        bloqueio && !f.altOkAdmin ? bloqueio : "Você não tem uma alteração de férias para aprovar aqui.",
      );
    }

    // A proposta que esta tela leu, e só ela: outra resposta ou outra proposta no meio → recusa.
    const mesmaProposta = {
      id: f.id,
      altInicio: f.altInicio,
      altFim: f.altFim,
      altPorId: f.altPorId,
      altOkAdmin: f.altOkAdmin,
      altOkFunc: f.altOkFunc,
    };
    if (!i.aprovar) {
      const { count } = await prisma.ferias.updateMany({
        where: mesmaProposta,
        data: { altInicio: null, altFim: null, altPorId: null, altOkAdmin: false, altOkFunc: false },
      });
      if (count !== 1) throw new ActionError(MOTIVO_ALTERACAO_MUDOU);
      if (f.altPorId && f.altPorId !== user.id) {
        await notificarSemFalhar(f.altPorId, {
          titulo: "Alteração de férias recusada",
          corpo: "A proposta de nova data de férias foi recusada; as datas originais foram mantidas.",
          href: "/rh",
        });
      }
      revalidatePath("/rh");
      revalidatePath("/rh/admin");
      return { id: f.id, aplicado: false };
    }

    // Aprovação da contraparte completa a dupla → aplica a nova data.
    const { count } = await prisma.ferias.updateMany({
      where: mesmaProposta,
      data: {
        inicio: f.altInicio,
        fim: f.altFim,
        altInicio: null,
        altFim: null,
        altPorId: null,
        altOkAdmin: false,
        altOkFunc: false,
      },
    });
    if (count !== 1) throw new ActionError(MOTIVO_ALTERACAO_MUDOU);
    if (f.altPorId && f.altPorId !== user.id) {
      await notificarSemFalhar(f.altPorId, {
        titulo: "Alteração de férias aprovada",
        corpo: "A nova data de férias foi aprovada e já está valendo.",
        href: "/rh",
      });
    }
    // Nova data em vigor: a coordenação revê a alocação do novo período, não a do antigo.
    await avisarImpactoDaAusencia({ userId: f.userId, inicio: f.altInicio, fim: f.altFim, tipo: "ferias", registroId: f.id });
    // O mês antigo e o novo podem estar fechados: refaz a partir do mais cedo dos dois.
    await recalcularBancoDaPessoaSemFalhar(f.userId, menorData(f.inicio, f.altInicio));
    revalidatePath("/rh");
    revalidatePath("/rh/admin");
    return { id: f.id, aplicado: true };
  },
);

// definirEscala removido em F7 (substituído por EscalaRole/EscalaUsuario no módulo escalas)

/**
 * Regra CLT de início de férias (art. 134 §3º) — só para colaboradores CLT.
 * Lança ActionError se a data de início cair nos 2 dias que antecedem feriado/domingo.
 */
async function garantirInicioFeriasClt(sujeito: SujeitoJornada, inicioISO: string) {
  if (!aplicaRegraInicioFeriasClt(sujeito)) return;
  const anoIni = Number(inicioISO.slice(0, 4));
  const feriados = new Set(
    [
      ...(await listarFeriados(anoIni)),
      // início + 2 dias pode cair no ano seguinte (borda de 30/31 de dez).
      ...(inicioISO.slice(5, 10) >= "12-30" ? await listarFeriados(anoIni + 1) : []),
    ].map((f) => f.data),
  );
  const chk = validarInicioFeriasClt(inicioISO, feriados);
  if (!chk.valido) throw new ActionError(chk.motivo!);
}
