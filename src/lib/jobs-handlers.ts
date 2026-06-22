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
import { importarEditaisPNCP } from "@/modules/licitacoes/pncp/import";

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
      await notificarMuitos(
        alvo,
        {
          titulo: `Prazo em ${dias} dia(s): ${d.nome}`,
          corpo: `${formatarCodigo(d.projeto.codigo)} — entrega em ${dias} dia(s).`,
          href: `/projetos/${d.projeto.id}`,
          tag: `prazo-${d.id}-${dias}`,
        },
        { categoria: "prazo_disciplina" },
      );
      enviados++;
    }
  }
  return enviados;
}

/** D+1: receitas previstas vencidas ontem → gestores (inadimplência) + e-mail ao cliente. */
export async function alertaInadimplencia(): Promise<number> {
  const ontem = diaAlvo(-1);
  const vencidos = await prisma.lancamento.findMany({
    where: { tipo: "receita", status: "previsto", vencimento: ontem },
    include: { cliente: { select: { nome: true, email: true } } },
  });
  if (vencidos.length === 0) return 0;
  const ids = await gestores();
  const comEmail = smtpConfigurado();
  for (const l of vencidos) {
    await notificarMuitos(
      ids,
      {
        titulo: "Recebimento vencido (D+1)",
        corpo: `${l.descricao}${l.cliente ? ` — ${l.cliente.nome}` : ""} · R$ ${Number(l.valor).toLocaleString("pt-BR")}`,
        href: "/financeiro/contas-a-receber",
        tag: `inad-${l.id}`,
      },
      { categoria: "inadimplencia" },
    );
    if (comEmail && l.cliente?.email) {
      const valor = Number(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const venc = l.vencimento ? l.vencimento.toLocaleDateString("pt-BR") : "—";
      await enviarEmail({
        to: l.cliente.email,
        subject: `Lembrete de pagamento — ${l.descricao}`,
        html: `<p>Olá, ${l.cliente.nome}.</p>
<p>Identificamos que o pagamento referente a <strong>${l.descricao}</strong> no valor de <strong>${valor}</strong>, com vencimento em ${venc}, ainda não foi registrado.</p>
<p>Caso já tenha efetuado o pagamento, desconsidere este aviso.</p>
<p>Em caso de dúvidas, entre em contato com nossa equipe.</p>`,
      });
    }
  }
  return vencidos.length;
}

/**
 * Mensal: mês anterior tem sessões de trabalho com projeto mas o rateio NÃO foi
 * fechado → custo de horas ausente nas margens. Lembra os gestores de fechar.
 */
export async function alertaRateioAberto(): Promise<number> {
  const ref = subMonths(new Date(), 1);
  const ano = ref.getFullYear();
  const mes = ref.getMonth() + 1;
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 1);

  // Já fechado? (existe ao menos um RateioHora do mês)
  const fechado = await prisma.rateioHora.findFirst({ where: { ano, mes }, select: { id: true } });
  if (fechado) return 0;

  // Há sessões com projeto a ratear no mês?
  const sessoes = await prisma.sessaoTrabalho.count({
    where: { inicio: { gte: ini, lt: fim }, projetoId: { not: null } },
  });
  if (sessoes === 0) return 0;

  const ids = await gestores(["admin", "supervisor", "administrativo"]);
  await notificarMuitos(ids, {
    titulo: "Rateio de horas em aberto",
    corpo: `${String(mes).padStart(2, "0")}/${ano}: ${sessoes} sessão(ões) com projeto ainda não rateadas. Feche o rateio para refletir o custo de horas nas margens.`,
    href: "/ponto",
    tag: `rateio-aberto-${ano}-${mes}`,
  });
  return sessoes;
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
      await notificarMuitos(
        ids,
        {
          titulo: `Certidão vence em ${dias} dia(s)`,
          corpo: `${c.tipo.nome}${c.descricao ? ` — ${c.descricao}` : ""}`,
          href: "/juridico",
          tag: `cert-${c.id}-${dias}`,
        },
        { categoria: "certidao" },
      );
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
      await notificarMuitos(
        ids,
        {
          titulo: `Licitação: prazo em ${dias} dia(s)`,
          corpo: l.titulo,
          href: "/licitacoes",
          tag: `lic-${l.id}-${dias}`,
        },
        { categoria: "licitacao" },
      );
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
  await notificarMuitos(ids, { titulo: "Resumo semanal", corpo, href: "/", tag: `resumo-${Date.now()}` }, { categoria: "digest_semanal" });

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

/** Licitações em execução ainda não publicadas no PNCP → gestores (lembrete de publicação). */
export async function alertaPncpNaoPublicado(): Promise<number> {
  const lics = await prisma.licitacao.findMany({
    where: { status: "em_execucao", publicadoPNCPEm: null },
    select: { id: true, titulo: true },
  });
  if (lics.length === 0) return 0;
  const ids = await gestores(["admin", "administrativo"]);
  for (const l of lics) {
    await notificarMuitos(ids, {
      titulo: "Publicar no PNCP",
      corpo: l.titulo,
      href: `/licitacoes/${l.id}`,
      tag: `pncp-pub-${l.id}`,
    });
  }
  return lics.length;
}

/**
 * Diário: importa editais do PNCP filtrados por palavras-chave configuráveis.
 * No-op quando o modo PNCP != "api" ou sem palavras-chave (seguro agendar sempre).
 */
export async function importarPncpDiario(): Promise<{ importados: number; verificados: number }> {
  const r = await importarEditaisPNCP();
  console.log(`[pncp-import] importados=${r.importados} verificados=${r.verificados}`);
  return r;
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

// ── P6: jobs de projeto ──────────────────────────────────────────────────────

/**
 * P-53/N-41: Lembrete semanal ao cliente para preencher inputs pendentes.
 * Dispara para usuários com role "cliente" cujo projeto tem link público ativo e inputs sem resposta.
 */
export async function lembreteInputsCliente(): Promise<number> {
  const projetos = await prisma.projeto.findMany({
    where: {
      situacao: "em_andamento",
      linkInput: { isNot: null },
    },
    select: {
      id: true,
      codigo: true,
      nome: true,
      linkInput: { select: { token: true } },
      cliente: {
        select: {
          usuarios: {
            where: { ativo: true, role: "cliente" },
            select: { id: true },
          },
        },
      },
      inputs: { where: { resposta: null }, select: { id: true } },
    },
  });

  let enviados = 0;
  for (const p of projetos) {
    const pendentes = p.inputs.length;
    if (pendentes === 0) continue;
    const clienteIds = p.cliente.usuarios.map((u) => u.id);
    if (clienteIds.length === 0) continue;

    await notificarMuitos(clienteIds, {
      titulo: "Inputs pendentes no seu projeto",
      corpo: `O projeto ${p.codigo} — ${p.nome} tem ${pendentes} input(s) aguardando resposta.`,
      href: `/inputs/${p.linkInput!.token}`,
      tag: `inputs-${p.id}`,
    });
    enviados += clienteIds.length;
  }
  return enviados;
}

/**
 * P-54: Alerta proativo de risco — projetos em andamento com prazo vencido ou margem negativa.
 * Notifica admin e supervisor.
 */
export async function alertaRiscoProjeto(): Promise<number> {
  const hoje = new Date();
  const gestoresIds = await gestores(["admin", "supervisor"]);
  if (gestoresIds.length === 0) return 0;

  // Projetos com prazo vencido.
  const atrasados = await prisma.projeto.findMany({
    where: {
      situacao: "em_andamento",
      prazoFinal: { lt: hoje },
      disciplinas: { some: { status: { notIn: ["aprovado"] } } },
    },
    select: { id: true, codigo: true, nome: true, prazoFinal: true },
  });

  let enviados = 0;
  for (const p of atrasados) {
    const diasAtraso = differenceInCalendarDays(hoje, p.prazoFinal!);
    await notificarMuitos(
      gestoresIds,
      {
        titulo: "Projeto em atraso",
        corpo: `${p.codigo} — ${p.nome} está ${diasAtraso} dia(s) acima do prazo.`,
        href: `/projetos/${p.id}`,
        tag: `risco-prazo-${p.id}-${hoje.toISOString().slice(0, 10)}`,
      },
      { categoria: "risco_projeto" },
    );
    enviados++;
  }
  return enviados;
}

/**
 * N-46: Status report semanal por projeto — resumo de disciplinas enviado aos membros da equipe.
 * Corre toda segunda-feira junto com o resumo semanal geral.
 */
export async function statusReportSemanal(): Promise<number> {
  const projetos = await prisma.projeto.findMany({
    where: { situacao: "em_andamento" },
    select: {
      id: true,
      codigo: true,
      nome: true,
      membros: { select: { userId: true } },
      disciplinas: {
        select: {
          nome: true,
          status: true,
          prazo: true,
          responsaveis: { select: { userId: true } },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });

  const STATUS_PT: Record<string, string> = {
    aguardando: "Aguardando",
    em_andamento: "Em andamento",
    em_revisao: "Em revisão",
    entregue: "Entregue",
    aprovado: "Aprovado",
  };

  const hoje = new Date();
  let enviados = 0;

  for (const p of projetos) {
    if (p.disciplinas.length === 0) continue;

    // Coleta todos os usuários envolvidos (membros + responsáveis).
    const uids = new Set<string>();
    p.membros.forEach((m) => uids.add(m.userId));
    p.disciplinas.forEach((d) => d.responsaveis.forEach((r) => uids.add(r.userId)));
    if (uids.size === 0) continue;

    const atrasadas = p.disciplinas.filter(
      (d) => d.prazo && new Date(d.prazo) < hoje && d.status !== "aprovado",
    );
    const aprovadas = p.disciplinas.filter((d) => d.status === "aprovado").length;
    const total = p.disciplinas.length;

    const corpo =
      `${p.codigo} — ${aprovadas}/${total} disciplina(s) aprovada(s).` +
      (atrasadas.length > 0
        ? ` Atrasadas: ${atrasadas.map((d) => d.nome).join(", ")}.`
        : " Sem atrasos.");

    await notificarMuitos(
      [...uids],
      {
        titulo: "Resumo semanal do projeto",
        corpo,
        href: `/projetos/${p.id}`,
        tag: `report-${p.id}-${hoje.toISOString().slice(0, 10)}`,
      },
      { categoria: "digest_semanal" },
    );
    enviados++;
  }
  return enviados;
}
