import "server-only";
import { addDays, differenceInCalendarDays, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { gravarSnapshotQualidade } from "@/modules/qualidade/queries";
import { gravarSnapshotDashboard } from "@/modules/dashboard/queries";
import { gravarSnapshotLicitacaoMensal } from "@/modules/licitacoes/dashboard/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";
import { ehRecurso, TIPO_EVENTO_LABEL, type TipoEventoLicitacao } from "@/modules/licitacoes/eventos/eventos";
import { eventosParaNotificar } from "@/modules/licitacoes/eventos/alertas";
import { acrescimoAcumuladoPct, somaAcrescimos, proximoDoLimite } from "@/modules/licitacoes/contrato/saldo";
import { ehAniversarioReajuste, valorReajustado } from "@/modules/licitacoes/contrato/reajuste";

/** Rotinas das automações (chamadas pelos jobs do pg-boss em lib/jobs.ts). */

async function gestores(roles: string[] = ["admin", "supervisor", "administrativo"]) {
  const us = await prisma.user.findMany({
    where: { ativo: true, role: { in: roles as never } },
    select: { id: true },
  });
  return us.map((u) => u.id);
}

function diaAlvo(dias: number): { gte: Date; lte: Date } {
  const d = addDays(new Date(), dias);
  const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  return { gte: ini, lte: fim };
}

/** D-7/D-3/D-1: prazos de disciplina → responsáveis + gestores. */
export async function alertasPrazoDisciplina(): Promise<number> {
  let enviados = 0;
  for (const dias of [7, 3, 1]) {
    const discs = await prisma.disciplina.findMany({
      where: {
        prazo: diaAlvo(dias),
        status: { notIn: ["aprovado", "entregue"] },
        projeto: { situacao: "em_andamento" },
      },
      include: {
        responsaveis: { select: { userId: true } },
        projeto: { select: { id: true, codigo: true } },
      },
    });
    for (const d of discs) {
      const alvo = [...d.responsaveis.map((r) => r.userId), ...(await gestores(["admin", "supervisor"]))];
      await notificarMuitos(alvo, {
        titulo: `Prazo em ${dias} dia(s): ${d.nome}`,
        corpo: `${formatarCodigo(d.projeto.codigo)} — entrega em ${dias} dia(s).`,
        href: `/projetos/${d.projeto.id}`,
        tag: `prazo-${d.id}-${dias}`,
      });
      enviados++;
    }
  }
  return enviados;
}

/** D+1: receitas previstas vencidas ontem → gestores (inadimplência). */
export async function alertaInadimplencia(): Promise<number> {
  const ontem = diaAlvo(-1);
  const vencidos = await prisma.lancamento.findMany({
    where: { tipo: "receita", status: "previsto", vencimento: ontem },
    include: { cliente: { select: { nome: true } } },
  });
  if (vencidos.length === 0) return 0;
  const ids = await gestores();
  for (const l of vencidos) {
    await notificarMuitos(ids, {
      titulo: "Recebimento vencido (D+1)",
      corpo: `${l.descricao}${l.cliente ? ` — ${l.cliente.nome}` : ""} · R$ ${Number(l.valor).toLocaleString("pt-BR")}`,
      href: "/financeiro/contas-a-receber",
      tag: `inad-${l.id}`,
    });
  }
  return vencidos.length;
}

/** Certidões vencendo em 30/15/7 dias → gestores do jurídico. */
export async function alertaCertidoes(): Promise<number> {
  let n = 0;
  const ids = await gestores();
  for (const dias of [30, 15, 7]) {
    const certs = await prisma.certidao.findMany({
      where: { validade: diaAlvo(dias) },
      include: { tipo: true },
    });
    for (const c of certs) {
      await notificarMuitos(ids, {
        titulo: `Certidão vence em ${dias} dia(s)`,
        corpo: `${c.tipo.nome}${c.descricao ? ` — ${c.descricao}` : ""}`,
        href: "/juridico",
        tag: `cert-${c.id}-${dias}`,
      });
      n++;
    }
  }
  return n;
}

/** Prazos de proposta de licitação em 15/7/1 dias → gestores. */
export async function alertaLicitacoes(): Promise<number> {
  let n = 0;
  const ids = await gestores(["admin", "administrativo"]);
  for (const dias of [15, 7, 1]) {
    const lics = await prisma.licitacao.findMany({
      where: { status: "em_andamento", prazoProposta: diaAlvo(dias) },
    });
    for (const l of lics) {
      await notificarMuitos(ids, {
        titulo: `Licitação: prazo em ${dias} dia(s)`,
        corpo: l.titulo,
        href: "/licitacoes",
        tag: `lic-${l.id}-${dias}`,
      });
      n++;
    }
  }
  return n;
}

/** Dia 1º: grava o snapshot de qualidade do mês anterior. */
export async function snapshotQualidadeMensal() {
  const anterior = subMonths(new Date(), 1);
  return gravarSnapshotQualidade(anterior.getFullYear(), anterior.getMonth() + 1);
}

/** Dia 1º: snapshot do funil de licitações do mês anterior. */
export async function snapshotLicitacaoMensal() {
  const anterior = subMonths(new Date(), 1);
  return gravarSnapshotLicitacaoMensal(anterior.getFullYear(), anterior.getMonth() + 1);
}

/** Rotinas noturnas de RH/comercial: propostas vencidas e férias que iniciam hoje. */
export async function rotinasRhDiarias(): Promise<{ propostas: number; ferias: number }> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = addDays(hoje, 1);

  const props = await prisma.proposta.findMany({
    where: { status: "enviada", validade: { lt: hoje } },
    select: { id: true, numero: true, titulo: true },
  });
  if (props.length > 0) {
    const ids = await gestores(["admin", "supervisor", "administrativo"]);
    for (const p of props) {
      await notificarMuitos(ids, {
        titulo: "Proposta vencida (sem retorno)",
        corpo: `${p.numero} — ${p.titulo}`,
        href: "/comercial/propostas",
        tag: `prop-venc-${p.id}`,
      });
    }
  }

  const fer = await prisma.ferias.findMany({
    where: { status: "aprovado", inicio: { gte: hoje, lt: amanha } },
    select: { id: true, userId: true },
  });
  for (const f of fer) {
    const ids = [...(await gestores(["admin", "supervisor", "administrativo"])), f.userId];
    await notificarMuitos(ids, {
      titulo: "Férias iniciam hoje",
      corpo: "Período de férias aprovado começa hoje.",
      href: "/rh",
      tag: `ferias-inicio-${f.id}`,
    });
  }
  return { propostas: props.length, ferias: fer.length };
}

/** Diário: grava a foto dos KPIs do dashboard (série histórica). */
export async function snapshotDashboardDiario() {
  await gravarSnapshotDashboard();
}

/** Dias úteis 09:15: CLT/estagiário sem ponto aberto hoje → lembrete. */
export async function lembretePontoNaoBatido(): Promise<number> {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const clts = await prisma.user.findMany({
    where: { ativo: true, role: { in: ["clt", "estagiario"] } },
    select: { id: true },
  });
  let n = 0;
  for (const u of clts) {
    const sessao = await prisma.sessaoTrabalho.findFirst({
      where: { userId: u.id, inicio: { gte: ini } },
    });
    if (!sessao) {
      await notificarMuitos([u.id], {
        titulo: "Lembrete: bater o ponto",
        corpo: "Você ainda não iniciou a jornada de hoje.",
        href: "/ponto",
        tag: `ponto-${u.id}-${ini.toISOString().slice(0, 10)}`,
      });
      n++;
    }
  }
  return n;
}

/** Alertas de eventos de licitação (datas-chave e recursos) em D-n → gestores. */
export async function alertaEventosLicitacao(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const hojeISO = hoje0.toISOString().slice(0, 10);
  const horizonte = addDays(hoje0, 60);

  const evts = await prisma.licitacaoEvento.findMany({
    where: { concluidoEm: null, data: { gte: hoje0, lte: horizonte } },
    include: { licitacao: { select: { titulo: true } } },
  });

  const mapeados = evts.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    dataISO: e.data.toISOString().slice(0, 10),
    alertaDias: e.alertaDias,
    concluido: false,
    titulo: e.licitacao.titulo,
  }));

  const recursoList = mapeados.filter((e) => ehRecurso(e.tipo as TipoEventoLicitacao));
  const datasList = mapeados.filter((e) => !ehRecurso(e.tipo as TipoEventoLicitacao));
  const aNotificar = [
    ...eventosParaNotificar(recursoList, hojeISO, cfg.recurso.alertaDiasPadrao),
    ...eventosParaNotificar(datasList, hojeISO, cfg.datasChave.alertaDiasPadrao),
  ];
  if (aNotificar.length === 0) return 0;

  const ids = await gestores(["admin", "administrativo"]);
  const byId = new Map(mapeados.map((e) => [e.id, e]));
  let n = 0;
  for (const a of aNotificar) {
    const e = byId.get(a.id)!;
    await notificarMuitos(ids, {
      titulo: `Licitação: ${TIPO_EVENTO_LABEL[a.tipo as TipoEventoLicitacao]} em ${a.dias} dia(s)`,
      corpo: e.titulo,
      href: "/licitacoes",
      tag: `evt-${a.id}-${a.dias}`,
    });
    n++;
  }
  return n;
}

/** Segunda 07:00: resumo da semana p/ gestores (e-mail se SMTP; sempre notificação). */
export async function resumoSemanal(): Promise<void> {
  const seteDias = addDays(new Date(), 7);
  const [aReceber, aPagar, entregas] = await Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "receita", status: "previsto", vencimento: { lte: seteDias } },
      select: { valor: true },
    }),
    prisma.lancamento.findMany({
      where: { tipo: "despesa", status: "previsto", vencimento: { lte: seteDias } },
      select: { valor: true },
    }),
    prisma.disciplina.count({
      where: {
        prazo: { lte: seteDias },
        status: { notIn: ["aprovado", "entregue"] },
        projeto: { situacao: "em_andamento" },
      },
    }),
  ]);
  const somaR = aReceber.reduce((s, l) => s + Number(l.valor), 0);
  const somaP = aPagar.reduce((s, l) => s + Number(l.valor), 0);
  const corpo = `Semana: ${entregas} entrega(s) com prazo · a receber R$ ${somaR.toLocaleString("pt-BR")} · a pagar R$ ${somaP.toLocaleString("pt-BR")}.`;

  const ids = await gestores(["admin", "supervisor"]);
  await notificarMuitos(ids, { titulo: "Resumo semanal", corpo, href: "/", tag: `resumo-${Date.now()}` });

  if (smtpConfigurado()) {
    const admins = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor"] } },
      select: { email: true },
    });
    for (const a of admins) {
      await enviarEmail({ to: a.email, subject: "SenaHub — resumo semanal", html: `<p>${corpo}</p>` });
    }
  }

  const dif = differenceInCalendarDays(seteDias, new Date());
  void dif;
}

/** Contratos cujo acréscimo acumulado de aditivos se aproxima/excede o limite → gestores. */
export async function alertaLimiteAditivo(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const contratos = await prisma.contratoLicitacao.findMany({
    include: { aditivos: { select: { valorDelta: true } }, licitacao: { select: { titulo: true } } },
  });
  const ids = await gestores(["admin", "administrativo"]);
  let n = 0;
  for (const c of contratos) {
    const homologado = Number(c.valorHomologado);
    if (homologado <= 0) continue;
    const baseCalc = c.valorHomologadoBase != null ? Number(c.valorHomologadoBase) : homologado;
    const acresc = somaAcrescimos(c.aditivos.map((a) => ({ valorDelta: a.valorDelta != null ? Number(a.valorDelta) : null })));
    const pct = acrescimoAcumuladoPct(baseCalc, acresc);
    const limite = c.limiteAcrescimoPct != null ? Number(c.limiteAcrescimoPct) : cfg.aditivo.limiteAcrescimoPctPadrao;
    if (!proximoDoLimite(pct, limite, cfg.aditivo.fatorAviso)) continue;
    await notificarMuitos(ids, {
      titulo: `Aditivo perto do limite (${pct.toFixed(1)}% de ${limite}%)`,
      corpo: c.licitacao.titulo,
      href: "/licitacoes",
      tag: `aditivo-limite-${c.id}-${Math.floor(pct)}`,
    });
    n++;
  }
  return n;
}

/** Aniversário de reajuste do contrato (anual, por vigenciaInicio). Manual → notifica; automático → cria reajuste pendente sugerido. */
export async function alertaReajusteContrato(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);
  const hojeISO = hoje0.toISOString().slice(0, 10);
  const contratos = await prisma.contratoLicitacao.findMany({
    where: { vigenciaInicio: { not: null } },
    include: { licitacao: { select: { id: true, titulo: true } }, reajustes: { select: { aniversario: true } } },
  });
  const ids = await gestores(["admin", "administrativo"]);
  let n = 0;
  for (const c of contratos) {
    if (!c.vigenciaInicio) continue;
    const inicioISO = c.vigenciaInicio.toISOString().slice(0, 10);
    if (!ehAniversarioReajuste(inicioISO, hojeISO)) continue;
    const jaTem = c.reajustes.some((r) => r.aniversario.toISOString().slice(0, 10) === hojeISO);
    if (jaTem) continue;
    if (cfg.reajuste.modo === "automatico") {
      const valorAnterior = Number(c.valorHomologado);
      const pct = cfg.reajuste.percentualPadrao;
      await prisma.reajusteContrato.create({
        data: {
          contratoId: c.id,
          indice: cfg.reajuste.indices[0] ?? "—",
          percentual: pct,
          dataBase: c.vigenciaInicio,
          aniversario: hoje0,
          valorAnterior,
          valorReajustado: valorReajustado(valorAnterior, pct),
          aplicadoEm: null,
        },
      });
      await notificarMuitos(ids, {
        titulo: "Reajuste sugerido (aniversário do contrato)",
        corpo: c.licitacao.titulo,
        href: "/licitacoes",
        tag: `reajuste-sug-${c.id}-${hojeISO}`,
      });
    } else {
      await notificarMuitos(ids, {
        titulo: "Reajuste do contrato no aniversário",
        corpo: c.licitacao.titulo,
        href: "/licitacoes",
        tag: `reajuste-due-${c.id}-${hojeISO}`,
      });
    }
    n++;
  }
  return n;
}
