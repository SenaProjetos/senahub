import "server-only";
import { addDays, differenceInCalendarDays, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { enviarPush } from "@/lib/push";
import { emitParaCanal, usuarioOnline } from "@/lib/socket";
import { textoParaPreview } from "@/modules/chat/formatacao";
import type { MensagemAgendadaJob } from "@/modules/chat/agendamento";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate, resolverTemplate, markdownParaHtml } from "@/lib/email-templates";
import { slugAlertaPonto } from "@/lib/email-templates-meta";
import { gravarSnapshotQualidade } from "@/modules/qualidade/queries";
import { gravarSnapshotDashboard } from "@/modules/dashboard/queries";
import { gravarSnapshotLicitacaoMensal } from "@/modules/licitacoes/dashboard/queries";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  agruparPorDestinatario,
  situacaoPrazo,
  DIAS_ALERTA as DIAS_ALERTA_APONTAMENTO,
} from "@/modules/projetos/pendencias/prazo";
import { formatarData } from "@/lib/utils";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";
import { ehRecurso, TIPO_EVENTO_LABEL, type TipoEventoLicitacao } from "@/modules/licitacoes/eventos/eventos";
import { eventosParaNotificar } from "@/modules/licitacoes/eventos/alertas";
import {
  habilitacoesParaNotificar,
  vigenciaEfetivaContrato,
  vencimentosContratoParaNotificar,
  verboVencimentoCertidao,
} from "@/modules/licitacoes/alertas";
import {
  entregarBestEffort,
  persistirSinoLicitacaoUmaVez,
} from "@/modules/licitacoes/alertas-dedup";
import { acrescimoAcumuladoPct, somaAcrescimos, proximoDoLimite } from "@/modules/licitacoes/contrato/saldo";
import { ehAniversarioReajuste, valorReajustado } from "@/modules/licitacoes/contrato/reajuste";
import { importarEditaisPNCP } from "@/modules/licitacoes/pncp/import";
import { fecharBancoDoMes } from "@/modules/rh/banco/service";
import { ehFeriado } from "@/modules/rh/feriados/queries";
import { resolverEscala } from "@/modules/ponto/service";
import { avaliarAlertasDoDia } from "@/modules/ponto/alertas";
import { diaLocalDate, diaLocal, horaLocal, minutosDoDia } from "@/modules/ponto/engine";
import { executarConversao } from "@/modules/coordenacao/conversao";
import { executarConversaoDwg } from "@/modules/dwg/conversao";
import { removerArquivo } from "@/lib/storage";
import { limitePurga } from "@/modules/uploads/lixeira";
import { executarImportacaoCusto } from "@/modules/custos/composicoes/service";
import { dispatcharAviso } from "@/modules/notificacoes/avisos/service";
import { Prisma } from "@/generated/prisma/client";
import { executarAutomacoesComerciais } from "@/modules/comercial/automacoes";
import { diasAvisoVencimentoContrato } from "@/modules/juridico/config";
import { vencimentoEfetivo } from "@/modules/juridico/contrato/estado";
import { inicioDoDiaUtc } from "@/lib/data";

/** Rotinas das automações (chamadas pelos jobs do pg-boss em lib/jobs.ts). */

async function gestores(roles: string[] = ["admin", "supervisor", "administrativo"]) {
  const us = await prisma.user.findMany({
    where: { ativo: true, role: { in: roles as never } },
    select: { id: true },
  });
  return us.map((u) => u.id);
}

/** Tick diário das seis regras determinísticas do Comercial (F7.3/F7.4). */
export async function automacoesComerciais(): Promise<number> {
  const resultado = await executarAutomacoesComerciais(new Date());
  console.log(
    `[comercial] automações avaliadas=${resultado.avaliadas} enviadas=${resultado.enviadas} ` +
      `duplicadas=${resultado.duplicadas} sem-responsável=${resultado.semResponsavel} ` +
      `responsável-inativo=${resultado.responsavelInativo} push-falhou=${resultado.pushFalhou}`,
  );
  return resultado.enviadas;
}

/**
 * Persiste exatamente um sino por destinatário/chave, inclusive em retry do
 * pg-boss. Sino + marca de dedup compartilham o mesmo commit; push é best-effort.
 */
async function notificarAlertaLicitacaoUmaVez(
  userIds: string[],
  chave: string,
  notificacao: Parameters<typeof notificarMuitos>[1],
  categoria: string,
): Promise<number> {
  const unicos = [...new Set(userIds)];
  const destinatarios = await filtrarPorCategoria(unicos, categoria);
  let enviados = 0;

  for (const userId of destinatarios) {
    const resultado = await persistirSinoLicitacaoUmaVez(
      (operacao) => prisma.$transaction(async (tx) => operacao(tx)),
      userId,
      chave,
      notificacao,
    );
    if (!resultado.criado) continue;

    enviados++;
    await entregarBestEffort(
      () => enviarPush(userId, {
        title: notificacao.titulo,
        body: notificacao.corpo,
        url: notificacao.href,
        tag: notificacao.tag,
      }),
      (erro) => {
        console.error(
          `[alertas-licitacao] push best-effort falhou (${userId}/${chave}):`,
          erro,
        );
      },
    );
  }

  return enviados;
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
          titulo: `Prazo em ${dias} dia(s): ${d.disciplinaTextoLegado}`,
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
      const venc = l.vencimento ? formatarData(l.vencimento) : "—";
      await enviarEmailTemplate(l.cliente.email, "lembrete-pagamento", {
        nomeCliente: l.cliente.nome,
        descricao: l.descricao,
        valor,
        vencimento: venc,
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

/** Certidões vencendo em 30/15/7 dias → gestores + responsável (se houver). */
export async function alertaCertidoes(): Promise<number> {
  let n = 0;
  const idsGestores = await gestores();
  for (const dias of [30, 15, 7]) {
    const certs = await prisma.certidao.findMany({
      where: { validade: diaAlvo(dias) },
      include: { tipo: true },
    });
    for (const c of certs) {
      const destinatarios = c.responsavelId ? [...idsGestores, c.responsavelId] : idsGestores;
      await notificarMuitos(
        destinatarios,
        {
          titulo: `Certidão vence em ${dias} dia(s)`,
          corpo: `${c.tipo.nome}${c.descricao ? ` — ${c.descricao}` : ""}`,
          href: "/certidoes",
          tag: `cert-${c.id}-${dias}`,
        },
        { categoria: "certidao" },
      );
      n++;
    }
  }
  return n;
}

/**
 * Propostas cuja validade venceu e que ainda estão vivas → avisa gestores + responsável (F5.7).
 *
 * ── "Expirar" aqui é AVISAR, não mudar de estado ────────────────────────────────────────────
 * Não existe `StatusProposta.expirada`, de propósito (02-schema §2.8; a ideia de origem, #m9,
 * pede "alerta de validade … ninguém avisa (job)"). Se a proposta expirou é uma pergunta que a
 * própria `validade` responde, via `propostaExpirada()` — mesmo princípio que manteve
 * "visualizada" fora do enum (§8.4). O que este job persiste é só que o AVISO saiu.
 *
 * ── Idempotência: compare-and-swap, igual a `dispararAvisosAgendados` ───────────────────────
 * `updateMany` com `alertaValidadeEm: null` no `where` e a data no `data`: só quem conseguir
 * trocar (count === 1) notifica. Dois ticks simultâneos, ou o retry do pg-boss depois de uma
 * falha no meio, resultam em UMA notificação por proposta — a corrida é resolvida pelo banco,
 * não por checar-antes-de-escrever (que teria janela entre o SELECT e o UPDATE).
 *
 * ── Quais propostas ────────────────────────────────────────────────────────────────────────
 * `aceita` nunca expira: o negócio fechou, a data de validade virou histórico. `recusada`
 * também fica de fora — avisar que expirou algo já perdido é ruído. Sobram `rascunho` e
 * `enviada` (e `em_negociacao` quando a F5.5 a criar, que entra sozinha por não estar na lista
 * de excluídos).
 */
export async function alertaPropostasExpiradas(agora: Date = new Date()): Promise<number> {
  const { propostaExpirada } = await import("@/modules/comercial/validade");

  const candidatas = await prisma.proposta.findMany({
    where: {
      validade: { not: null },
      alertaValidadeEm: null,
      status: { notIn: ["aceita", "recusada"] },
    },
    select: {
      id: true,
      numero: true,
      titulo: true,
      validade: true,
      autorId: true,
      cliente: { select: { nome: true } },
    },
    // `validade` ascendente: com a tabela grande (a carga sintética da F6.2 tem milhares de
    // propostas ainda não vencidas), um `take: 50` sem ordem é um scan arbitrário — a fila
    // "não vencida ainda" pode encher os 50 pra sempre e a mais vencida nunca chega a ser vista.
    // Ordenar garante que a mais atrasada entra primeiro nesta e em toda leva seguinte (achado
    // rodando `smoke-crm-fase5` contra o banco de dev depois da F6.2 existir).
    orderBy: { validade: "asc" },
    take: 50,
  });
  if (candidatas.length === 0) return 0;

  // O filtro fino é em memória de propósito: "expirou" depende do fuso de Recife, e o Postgres
  // compararia `date < now()` no fuso do servidor — exatamente o bug que a F5.6 corrigiu. O
  // `where` acima já reduziu o conjunto ao que pode importar.
  const expiradas = candidatas.filter((p) => propostaExpirada(p.validade, agora));
  if (expiradas.length === 0) return 0;

  const idsGestores = await gestores();
  let avisadas = 0;

  for (const p of expiradas) {
    const { count } = await prisma.proposta.updateMany({
      where: { id: p.id, alertaValidadeEm: null },
      data: { alertaValidadeEm: agora },
    });
    if (count !== 1) continue; // outro tick chegou primeiro

    const destinatarios = [...new Set([...idsGestores, p.autorId])];
    try {
      await notificarMuitos(
        destinatarios,
        {
          titulo: "Proposta com validade vencida",
          corpo: `${p.numero} — ${p.cliente.nome} (válida até ${formatarData(p.validade)})`,
          href: `/comercial/propostas/${p.id}`,
          tag: `proposta-validade-${p.id}`,
        },
        { categoria: "proposta" },
      );
      avisadas++;
    } catch (err) {
      // Fica marcado como avisado de propósito, igual a `dispararAvisosAgendados`: reenviar
      // arriscaria dobrar o sino, e um alerta perdido incomoda menos que um repetido todo dia.
      console.error(`[propostas] falha ao avisar validade vencida de ${p.numero}:`, err);
    }
  }
  return avisadas;
}

/**
 * Alerta de vencimento de CONTRATO DE EQUIPE (spec `2026-08-26-gerenciador-contratos.md`, Fase A).
 * Mesmo formato de `alertaPropostasExpiradas`: "vencer" é uma pergunta que `dataVencimento`
 * responde sozinha, o job só AVISA — não muda `statusContrato` (nenhum "vencido" automático;
 * quem decide renovar/rescindir é humano). Idempotência por compare-and-swap em
 * `alertaVencimentoEm`, igual a `alertaValidadeEm` — sem isso o tick reavisaria todo dia
 * enquanto a data estiver dentro da janela.
 *
 * Destinatário é sempre RH (`HR_ADMIN_ROLES`, via `gestores()`), nunca o dono do vínculo — avisar
 * o funcionário que o próprio contrato está vencendo é feature diferente (self-service, Fase E).
 *
 * ## Aditivo não vence — ele MUDA o vencimento (Fase B2)
 * Só documentos `tipo = "contrato"` são candidatos. O aditivo não é uma coisa que expira; é o que
 * prorroga (ou encurta) o prazo do contrato, e entra aqui através de `vencimentoEfetivo()`.
 * Alertar o aditivo separadamente daria dois avisos para o mesmo prazo. O que ele precisa —
 * assinatura pendente — é sinalizado pelo badge, não por este job.
 */
export async function alertaContratosEquipeVencendo(agora: Date = new Date()): Promise<number> {
  const dias = await diasAvisoVencimentoContrato();
  const limite = addDays(agora, dias);

  const candidatos = await prisma.documentoJuridico.findMany({
    where: {
      vinculoId: { not: null },
      tipo: "contrato",
      dataVencimento: { not: null, lte: limite },
      alertaVencimentoEm: null,
      statusContrato: { notIn: ["rescindido"] },
    },
    select: {
      id: true,
      titulo: true,
      dataVencimento: true,
      vinculo: { select: { user: { select: { name: true } }, contratacao: true } },
      // Aditivos ASSINADOS podem ter prorrogado o prazo — quem manda é o mais recente.
      aditivos: {
        where: { statusContrato: "assinado" },
        select: { assinadoEm: true, aditivoEquipe: { select: { novoVencimento: true } } },
      },
    },
    orderBy: { dataVencimento: "asc" },
    take: 50,
  });
  if (candidatos.length === 0) return 0;

  // Filtro fino em memória (mesmo padrão de `alertaPropostasExpiradas`): o `where` acima reduziu
  // pelo vencimento ORIGINAL, mas quem manda é o efetivo. Contrato já prorrogado por aditivo
  // assinado sai da lista — cobrar um prazo que não vale mais é ruído puro.
  const aVencer = candidatos
    .map((c) => ({
      ...c,
      vencimento: vencimentoEfetivo(
        c.dataVencimento,
        c.aditivos.map((a) => ({ vigenciaNova: a.aditivoEquipe?.novoVencimento ?? null, assinadoEm: a.assinadoEm })),
      ),
    }))
    .filter((c) => c.vencimento !== null && c.vencimento.getTime() <= limite.getTime());
  if (aVencer.length === 0) return 0;

  const idsRh = await gestores();
  let avisados = 0;

  for (const c of aVencer) {
    const { count } = await prisma.documentoJuridico.updateMany({
      where: { id: c.id, alertaVencimentoEm: null },
      data: { alertaVencimentoEm: agora },
    });
    if (count !== 1) continue; // outro tick chegou primeiro

    try {
      await notificarMuitos(
        idsRh,
        {
          titulo: "Contrato de equipe vencendo",
          corpo: `${c.vinculo?.user.name ?? c.titulo} (${c.vinculo?.contratacao ?? ""}) — vence em ${formatarData(c.vencimento!)}`,
          href: "/juridico",
          tag: `contrato-equipe-vencendo-${c.id}`,
        },
        { categoria: "contrato_equipe_vencendo" },
      );
      avisados++;
    } catch (err) {
      console.error(`[juridico] falha ao avisar vencimento de contrato ${c.id}:`, err);
    }
  }
  return avisados;
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

/**
 * RFQ `aberta` com prazo de resposta em 3/1 dia(s), e RFQ `aberta` cujo prazo venceu ONTEM com algum
 * convite ainda `convidado` (fornecedor nunca respondeu) → criador da RFQ + gestores de suprimentos.
 * Janela de 1 dia de calendário (como o D-3/D-1 acima) pra não reenviar todo dia enquanto a RFQ ficar aberta.
 */
export async function alertaCotacoesCusto(): Promise<number> {
  let n = 0;
  const ids = await gestores(["admin", "administrativo"]);

  for (const dias of [3, 1]) {
    const rfqs = await prisma.custoRfq.findMany({
      where: { status: "aberta", prazoResposta: diaAlvo(dias) },
      select: { id: true, titulo: true, criadoPorId: true },
    });
    for (const r of rfqs) {
      const destinatarios = [...new Set([...ids, r.criadoPorId])];
      await notificarMuitos(
        destinatarios,
        {
          titulo: `Cotação: prazo em ${dias} dia(s)`,
          corpo: r.titulo,
          href: `/custos/cotacoes/${r.id}`,
          tag: `rfq-${r.id}-${dias}`,
        },
        { categoria: "custos" },
      );
      n++;
    }
  }

  const semResposta = await prisma.custoRfq.findMany({
    where: { status: "aberta", prazoResposta: diaAlvo(-1), convites: { some: { status: "convidado" } } },
    select: { id: true, titulo: true, criadoPorId: true },
  });
  for (const r of semResposta) {
    const destinatarios = [...new Set([...ids, r.criadoPorId])];
    await notificarMuitos(
      destinatarios,
      {
        titulo: "Cotação com fornecedor sem resposta",
        corpo: `${r.titulo} — prazo vencido, ainda tem convite sem retorno.`,
        href: `/custos/cotacoes/${r.id}`,
        tag: `rfq-${r.id}-sem-resposta`,
      },
      { categoria: "custos" },
    );
    n++;
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
export async function rotinasRhDiarias(): Promise<{ propostas: number; ferias: number; contratosEquipe: number }> {
  // Fronteiras em meia-noite UTC: `validade`/`dataInicio` são colunas de data
  // (00:00Z). Com meia-noite local (03:00Z) a proposta vencia um dia antes.
  const hoje = inicioDoDiaUtc();
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
  const contratosEquipe = await alertaContratosEquipeVencendo(hoje);
  return { propostas: props.length, ferias: fer.length, contratosEquipe };
}

/** Diário: grava a foto dos KPIs do dashboard (série histórica). */
export async function snapshotDashboardDiario() {
  await gravarSnapshotDashboard();
}

/**
 * Dias úteis 09:15: CLT/estagiário sem batida de entrada hoje → lembrete.
 * Não dispara em feriado, nem para quem está de folga (escala inativa) ou em
 * férias aprovadas hoje — só faz sentido cobrar ponto em dia útil de trabalho.
 */
export async function lembretePontoNaoBatido(): Promise<number> {
  const agora = new Date();
  const hoje = diaLocalDate(agora);
  const hojeISO = diaLocal(agora);
  if (await ehFeriado(hojeISO)) return 0; // feriado → dia não útil
  const clts = await prisma.user.findMany({
    where: whereAudiencia("clt"),
    select: { id: true, role: true, contratacao: true },
  });
  let n = 0;
  for (const u of clts) {
    // Folga (escala do dia inativa) → sem lembrete.
    const grade = await resolverEscala(u.id, u.contratacao, agora);
    if (!grade.ativo) continue;
    // Férias aprovadas cobrindo hoje → sem lembrete.
    const ferias = await prisma.ferias.findFirst({
      where: { userId: u.id, status: "aprovado", inicio: { lte: hoje }, fim: { gte: hoje } },
      select: { id: true },
    });
    if (ferias) continue;
    const entrada = await prisma.batida.findFirst({
      where: { userId: u.id, dia: hoje, tipo: "entrada" },
    });
    if (!entrada) {
      await notificarMuitos(
        [u.id],
        {
          titulo: "Lembrete: bater o ponto",
          corpo: "Você ainda não iniciou a jornada de hoje.",
          href: "/ponto",
          tag: `ponto-${u.id}-${hojeISO}`,
        },
        { categoria: "lembrete_ponto" },
      );
      n++;
    }
  }
  return n;
}

// ── Ponto v2 — alertas de jornada (S1-S8/S10) ───────────────────────────────

type EmailModo = "todos" | "resumo_diario" | "nenhum";

/** Preferência de e-mail dos alertas de ponto por usuário (default "todos"). */
async function emailModosPorUsuario(userIds: string[]): Promise<Map<string, EmailModo>> {
  const prefs = await prisma.userPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, dados: true },
  });
  const mapa = new Map<string, EmailModo>();
  for (const p of prefs) {
    const modo = (p.dados as Record<string, unknown>)?.ponto_email_modo;
    if (modo === "resumo_diario" || modo === "nenhum") mapa.set(p.userId, modo);
  }
  return mapa;
}

/**
 * Tick de 5 em 5 minutos (janela 05h–23h): avalia alertas de jornada para
 * CLT/estagiário (entrada/descansos/saída próximos ou atingidos, jornada
 * cumprida). Sino+push sempre; e-mail conforme preferência (`ponto_email_modo`).
 * Dedup via `AlertaPontoEnviado` (unique userId+dia+chave) — cria ANTES de
 * enviar; se a criação falhar (já existe), o alerta já foi mandado nesta tick
 * ou numa anterior e é pulado.
 */
export async function alertasPontoTick(): Promise<number> {
  const agora = new Date();
  const agoraMin = minutosDoDia(horaLocal(agora));
  if (agoraMin < 5 * 60 || agoraMin > 23 * 60) return 0; // fora da janela 05h–23h
  if (await ehFeriado(diaLocal(agora))) return 0; // feriado → sem alerta de ponto

  const usuarios = await prisma.user.findMany({
    where: whereAudiencia("clt"),
    select: { id: true, role: true, contratacao: true, name: true, email: true },
  });
  if (usuarios.length === 0) return 0;

  const hoje = diaLocalDate(agora);
  const ids = usuarios.map((u) => u.id);

  const [batidasHoje, emailModos] = await Promise.all([
    prisma.batida.findMany({
      where: { userId: { in: ids }, dia: hoje },
      orderBy: { horario: "asc" },
      select: { userId: true, tipo: true, horario: true },
    }),
    emailModosPorUsuario(ids),
  ]);
  const batidasPorUser = new Map<string, { tipo: (typeof batidasHoje)[number]["tipo"]; horario: Date }[]>();
  for (const b of batidasHoje) {
    const arr = batidasPorUser.get(b.userId) ?? [];
    arr.push({ tipo: b.tipo, horario: b.horario });
    batidasPorUser.set(b.userId, arr);
  }

  let enviados = 0;
  for (const u of usuarios) {
    const grade = await resolverEscala(u.id, u.contratacao, agora);
    const eventos = avaliarAlertasDoDia({ agora, grade, batidasHoje: batidasPorUser.get(u.id) ?? [] });
    if (eventos.length === 0) continue;

    const modo = emailModos.get(u.id) ?? "todos";
    for (const evento of eventos) {
      try {
        await prisma.alertaPontoEnviado.create({ data: { userId: u.id, dia: hoje, chave: evento.chave } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // já enviado
        console.error(`[alertas-ponto] falha ao registrar dedup (${u.id}/${evento.chave}):`, err);
        continue;
      }

      // Resolve o modelo UMA vez (sorteio entre ativos) e usa o MESMO conteúdo
      // no sino/push e no e-mail — texto editável idêntico nos dois canais.
      const slug = slugAlertaPonto(evento.chave);
      const modelo = slug ? await resolverTemplate(slug, { hora: evento.hora }) : null;
      const titulo = modelo?.assunto ?? evento.titulo;
      const corpo = modelo?.corpo ?? evento.corpo;

      await notificar(u.id, {
        titulo,
        corpo,
        href: "/ponto",
        tag: `ponto-${evento.chave}-${diaLocal(agora)}`,
      });
      if (modo === "todos" && u.email && smtpConfigurado()) {
        await enviarEmail({ to: u.email, subject: titulo, html: markdownParaHtml(corpo) });
      }
      enviados++;
    }
  }
  return enviados;
}

/**
 * Dias úteis 19:30: para quem escolheu resumo diário (`ponto_email_modo` =
 * "resumo_diario"), envia 1 e-mail com os alertas de ponto do dia (se houver).
 */
export async function resumoPontoEmailDiario(): Promise<number> {
  if (!smtpConfigurado()) return 0;
  if (await ehFeriado(diaLocal(new Date()))) return 0; // feriado → sem resumo de ponto
  const hoje = diaLocalDate(new Date());

  const usuarios = await prisma.user.findMany({
    where: { ...whereAudiencia("clt"), email: { not: "" } },
    select: { id: true, email: true },
  });
  const modos = await emailModosPorUsuario(usuarios.map((u) => u.id));
  const alvo = usuarios.filter((u) => modos.get(u.id) === "resumo_diario");
  if (alvo.length === 0) return 0;

  let enviados = 0;
  for (const u of alvo) {
    const alertas = await prisma.alertaPontoEnviado.findMany({
      where: { userId: u.id, dia: hoje },
      orderBy: { enviadoEm: "asc" },
    });
    if (alertas.length === 0) continue;
    const linhas = alertas
      .map((a) => `- ${a.enviadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — ${a.chave}`)
      .join("\n");
    const ok = await enviarEmailTemplate(u.email, "resumo-ponto-diario", { linhas });
    if (ok) enviados++;
  }
  return enviados;
}

/** Jornada aberta há mais de este limite sem batida nova = considerada esquecida. */
const LIMITE_JORNADA_ESQUECIDA_MS = 16 * 60 * 60 * 1000;

/**
 * Diário 03:30: SessaoTrabalho aberta há mais de 16h → fecha com fim=início
 * (contribui 0, coerente com o motor que não extrapola dia incompleto) e avisa
 * o colaborador para corrigir via ajuste. Backstop para quem nunca mais bate
 * ponto depois de esquecer a saída (aplicarBatida só resolve isso reativamente,
 * na PRÓXIMA batida — este job cobre quem não volta a bater).
 */
export async function encerrarJornadasEsquecidas(): Promise<number> {
  const limite = new Date(Date.now() - LIMITE_JORNADA_ESQUECIDA_MS);
  const abertas = await prisma.sessaoTrabalho.findMany({
    where: { fim: null, inicio: { lt: limite } },
  });
  let n = 0;
  for (const s of abertas) {
    await prisma.sessaoTrabalho.update({ where: { id: s.id }, data: { fim: s.inicio } });
    await notificar(s.userId, {
      titulo: "Jornada não encerrada",
      corpo: "Detectamos uma jornada aberta há muito tempo. Corrija os horários em Ponto → Espelho.",
      href: "/ponto/espelho",
      tag: `jornada-esquecida-${s.id}`,
    });
    n++;
  }
  return n;
}

/** Alertas de eventos de licitação (datas-chave e recursos) em D-n → gestores. */
export async function alertaEventosLicitacao(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const hoje0 = inicioDoDiaUtc();
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

/**
 * Certidões vinculadas à habilitação que vencem antes da sessão.
 * Dispara nos mesmos D-n configurados para datas-chave e ignora itens já
 * atendidos manualmente.
 */
export async function alertaCertidoesAntesDaSessao(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const diasPadrao = [
    ...new Set(cfg.datasChave.alertaDiasPadrao.filter((dias) => Number.isInteger(dias) && dias >= 0)),
  ];

  // Meia-noite UTC: as colunas comparadas abaixo são datas (00:00Z).
  const hoje0 = inicioDoDiaUtc();
  const hojeISO = hoje0.toISOString().slice(0, 10);

  const sessoes = await prisma.licitacaoEvento.findMany({
    where: {
      tipo: "sessao",
      concluidoEm: null,
      data: { gte: hoje0 },
      licitacao: { status: "em_andamento" },
    },
    select: {
      id: true,
      data: true,
      alertaDias: true,
      licitacao: {
        select: {
          id: true,
          titulo: true,
          habilitacao: {
            where: { certidaoId: { not: null } },
            select: {
              id: true,
              exigencia: true,
              atendido: true,
              certidao: {
                select: {
                  validade: true,
                  descricao: true,
                  tipo: { select: { nome: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const mapeados = sessoes.flatMap((sessao) => {
    const sessaoISO = sessao.data.toISOString().slice(0, 10);
    return sessao.licitacao.habilitacao.flatMap((item) => {
      if (!item.certidao) return [];
      return [{
        itemId: item.id,
        sessaoId: sessao.id,
        sessaoISO,
        alertaDias: sessao.alertaDias,
        certidaoValidadeISO: item.certidao.validade.toISOString().slice(0, 10),
        atendido: item.atendido,
        licitacaoId: sessao.licitacao.id,
        licitacaoTitulo: sessao.licitacao.titulo,
        exigencia: item.exigencia,
        certidaoNome: item.certidao.tipo.nome,
        certidaoDescricao: item.certidao.descricao,
      }];
    });
  });

  const aNotificar = habilitacoesParaNotificar(mapeados, hojeISO, diasPadrao);
  if (aNotificar.length === 0) return 0;

  const ids = await gestores(["admin", "administrativo"]);
  const porChave = new Map(
    mapeados.map((item) => [`${item.sessaoId}:${item.itemId}`, item]),
  );
  let n = 0;
  for (const alerta of aNotificar) {
    const item = porChave.get(`${alerta.sessaoId}:${alerta.itemId}`);
    if (!item) continue;
    const certidao = `${item.certidaoNome}${item.certidaoDescricao ? ` — ${item.certidaoDescricao}` : ""}`;
    const verbo = verboVencimentoCertidao(item.certidaoValidadeISO, hojeISO);
    const chave = [
      "habil-cert",
      item.itemId,
      item.sessaoId,
      item.sessaoISO,
      item.certidaoValidadeISO,
      `d${alerta.dias}`,
    ].join(":");
    const enviados = await notificarAlertaLicitacaoUmaVez(
      ids,
      chave,
      {
        titulo: "Habilitação: certidão inválida para a sessão",
        corpo: `${item.licitacaoTitulo} — ${item.exigencia}: ${certidao} ${verbo} ${formatarData(item.certidaoValidadeISO)}, antes da sessão de ${formatarData(item.sessaoISO)}.`,
        href: `/licitacoes/${item.licitacaoId}`,
        tag: chave,
      },
      "certidao",
    );
    if (enviados > 0) n++;
  }
  return n;
}

/** Fim da vigência e validade da garantia contratual nos D-n configurados. */
export async function alertaVencimentosContrato(): Promise<number> {
  const cfg = await getConfigLicitacoes();
  const diasPadrao = [
    ...new Set(cfg.datasChave.alertaDiasPadrao.filter((dias) => Number.isInteger(dias) && dias >= 0)),
  ];
  if (diasPadrao.length === 0) return 0;

  // Meia-noite UTC: as colunas comparadas abaixo são datas (00:00Z).
  const hoje0 = inicioDoDiaUtc();
  const hojeISO = hoje0.toISOString().slice(0, 10);

  const contratos = await prisma.contratoLicitacao.findMany({
    where: {
      licitacao: { status: "em_execucao" },
      OR: diasPadrao.flatMap((dias) => [
        { vigenciaFim: diaAlvo(dias) },
        { garantiaValidade: diaAlvo(dias) },
        {
          aditivos: {
            some: {
              tipo: { in: ["prazo", "valor_prazo"] },
              novaVigencia: diaAlvo(dias),
            },
          },
        },
      ]),
    },
    select: {
      id: true,
      numeroContrato: true,
      vigenciaFim: true,
      garantiaValidade: true,
      aditivos: {
        where: {
          tipo: { in: ["prazo", "valor_prazo"] },
          novaVigencia: { not: null },
        },
        orderBy: [{ data: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          tipo: true,
          novaVigencia: true,
          data: true,
          createdAt: true,
        },
      },
      licitacao: { select: { id: true, titulo: true } },
    },
  });

  const mapeados = contratos.map((contrato) => {
    const vigenciaFimBaseISO = contrato.vigenciaFim?.toISOString().slice(0, 10) ?? null;
    const aditivos = contrato.aditivos.map((aditivo) => ({
      tipo: aditivo.tipo,
      novaVigenciaISO: aditivo.novaVigencia?.toISOString().slice(0, 10) ?? null,
      dataISO: aditivo.data.toISOString().slice(0, 10),
      createdAtISO: aditivo.createdAt.toISOString(),
    }));
    return {
      contratoId: contrato.id,
      vigenciaFimISO: vigenciaEfetivaContrato(vigenciaFimBaseISO, aditivos),
      garantiaValidadeISO: contrato.garantiaValidade?.toISOString().slice(0, 10) ?? null,
      licitacaoId: contrato.licitacao.id,
      licitacaoTitulo: contrato.licitacao.titulo,
      numeroContrato: contrato.numeroContrato,
    };
  });
  const aNotificar = vencimentosContratoParaNotificar(mapeados, hojeISO, diasPadrao);
  if (aNotificar.length === 0) return 0;

  const ids = await gestores(["admin", "administrativo"]);
  const porId = new Map(mapeados.map((contrato) => [contrato.contratoId, contrato]));
  let n = 0;
  for (const alerta of aNotificar) {
    const contrato = porId.get(alerta.contratoId);
    if (!contrato) continue;
    const numero = contrato.numeroContrato ? ` · contrato ${contrato.numeroContrato}` : "";
    const titulo = alerta.tipo === "vigencia"
      ? `Vigência contratual termina em ${alerta.dias} dia(s)`
      : `Garantia contratual vence em ${alerta.dias} dia(s)`;
    const chave = [
      "contrato",
      alerta.tipo,
      alerta.contratoId,
      alerta.dataISO,
      `d${alerta.dias}`,
    ].join(":");
    const enviados = await notificarAlertaLicitacaoUmaVez(
      ids,
      chave,
      {
        titulo,
        corpo: `${contrato.licitacaoTitulo}${numero} · ${formatarData(alerta.dataISO)}`,
        href: `/licitacoes/${contrato.licitacaoId}`,
        tag: chave,
      },
      "licitacao",
    );
    if (enviados > 0) n++;
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
      where: whereAudiencia("global"),
      select: { email: true },
    });
    for (const a of admins) {
      await enviarEmailTemplate(a.email, "resumo-semanal", { corpo });
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
  // Meia-noite UTC: as colunas comparadas abaixo são datas (00:00Z).
  const hoje0 = inicioDoDiaUtc();
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
          disciplinaTextoLegado: true,
          status: true,
          prazo: true,
          responsaveis: { select: { userId: true } },
        },
        orderBy: { ordem: "asc" },
      },
    },
  });

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
        ? ` Atrasadas: ${atrasadas.map((d) => d.disciplinaTextoLegado).join(", ")}.`
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

/**
 * Dia 1 às 02:00: fecha o banco de horas do mês anterior para todos os CLT/estagiários.
 * Idempotente (upsert) — seguro rodar múltiplas vezes.
 */
export async function fecharBancoHorasMesAnterior(): Promise<number> {
  const ref = subMonths(new Date(), 1);
  return fecharBancoDoMes(ref.getFullYear(), ref.getMonth() + 1);
}

// ── Coordenação BIM ────────────────────────────────────────────

/**
 * Handler da fila on-demand `converter-ifc` (lib/jobs.ts). Roda a conversão em
 * child process (executarConversao) e notifica autor + responsáveis da disciplina
 * quando conclui ou falha. Erros propagam para o pg-boss registrar a falha do job.
 */
export async function processarConversaoIfc(conversaoId: string): Promise<void> {
  const ctx = await executarConversao(conversaoId);
  const ok = ctx.status === "concluido";
  const alvo = ctx.destinatariosIds;
  if (alvo.length > 0) {
    await notificarMuitos(
      alvo,
      {
        titulo: ok ? "Modelo 3D pronto" : "Falha ao converter modelo 3D",
        corpo: ok
          ? `${ctx.disciplinaNome}: ${ctx.nomeArquivo} já pode ser aberto na maquete federada.`
          : `${ctx.disciplinaNome}: ${ctx.nomeArquivo} — ${ctx.erro ?? "erro na conversão"}.`,
        href: `/projetos/${ctx.projetoId}/coordenacao`,
        tag: `conversao-${ctx.uploadId}`,
      },
      { categoria: "coordenacao" },
    );
  }
  if (!ok) throw new Error(`Conversão ${conversaoId} falhou: ${ctx.erro ?? "erro desconhecido"}`);
}

// ── Visualizador DWG ───────────────────────────────────────────

/**
 * Handler da fila on-demand `converter-dwg` (lib/jobs.ts). Roda a conversão em
 * child process (executarConversaoDwg, subprocesso ODA File Converter) e notifica
 * autor + responsáveis (Upload) ou autor do documento (DocumentoVersao) quando
 * conclui ou falha. Erros propagam para o pg-boss registrar a falha do job.
 */
export async function processarConversaoDwg(conversaoId: string): Promise<void> {
  const ctx = await executarConversaoDwg(conversaoId);
  const ok = ctx.status === "concluido";
  const alvo = ctx.destinatariosIds;
  if (alvo.length > 0) {
    await notificarMuitos(
      alvo,
      {
        titulo: ok ? "Desenho DWG pronto" : "Falha ao converter DWG",
        corpo: ok
          ? `${ctx.disciplinaNome}: ${ctx.nomeArquivo} já pode ser visualizado.`
          : `${ctx.disciplinaNome}: ${ctx.nomeArquivo} — ${ctx.erro ?? "erro na conversão"}.`,
        href: ctx.href,
        tag: `conversao-dwg-${ctx.desenhoKey}`,
      },
      { categoria: "coordenacao" },
    );
  }
  if (!ok) throw new Error(`Conversão ${conversaoId} falhou: ${ctx.erro ?? "erro desconhecido"}`);
}

/**
 * Diário: remove arquivos .dxf órfãos em disco (upload/DocumentoVersao/
 * ConversaoDesenho já excluídos — a linha some por cascade, mas o .dxf em disco
 * fica). Varre as pastas `DWG` sob STORAGE_BASE_PATH; apaga os .dxf cujo nome
 * (uploadId ou documentoVersaoId) não tem mais ConversaoDesenho. Espelha
 * `limparFragsOrfaos`. Retorna quantos removeu.
 */
export async function limparDxfOrfaos(): Promise<number> {
  const base = process.env.STORAGE_BASE_PATH;
  if (!base) return 0;
  const { readdir, stat, unlink } = await import("node:fs/promises");
  const path = await import("node:path");

  const dxfsNoDisco: { abs: string; chave: string }[] = [];
  async function varrer(dir: string) {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await varrer(full);
      } else if (e.name.toLowerCase().endsWith(".dxf") && path.basename(dir) === "DWG") {
        dxfsNoDisco.push({ abs: full, chave: e.name.replace(/\.dxf$/i, "") });
      }
    }
  }
  await varrer(path.resolve(base));
  if (dxfsNoDisco.length === 0) return 0;

  const nomes = dxfsNoDisco.map((f) => f.chave);
  const vivos = await prisma.conversaoDesenho.findMany({
    where: { OR: [{ uploadId: { in: nomes } }, { documentoVersaoId: { in: nomes } }] },
    select: { uploadId: true, documentoVersaoId: true },
  });
  const vivoSet = new Set<string>();
  for (const v of vivos) {
    if (v.uploadId) vivoSet.add(v.uploadId);
    if (v.documentoVersaoId) vivoSet.add(v.documentoVersaoId);
  }

  let removidos = 0;
  const agora = Date.now();
  for (const f of dxfsNoDisco) {
    if (vivoSet.has(f.chave)) continue;
    // Só apaga se o arquivo tem >1h (evita corrida com uma conversão gravando agora).
    try {
      const info = await stat(f.abs);
      if (agora - info.mtimeMs < 60 * 60 * 1000) continue;
      await unlink(f.abs);
      removidos++;
    } catch {
      /* já removido / inacessível */
    }
  }
  return removidos;
}

/**
 * Diário: remove arquivos .frag órfãos em disco (upload/ConversaoModelo já excluídos
 * — a linha some por cascade, mas o .frag em disco fica). Varre as pastas COORDENACAO
 * sob STORAGE_BASE_PATH; apaga os .frag cujo uploadId (nome do arquivo) não tem mais
 * ConversaoModelo. Retorna quantos removeu.
 */
/**
 * Purga a lixeira do projeto: apaga EM DEFINITIVO os Uploads na lixeira há mais de
 * DIAS_LIXEIRA dias. Bypassa o filtro global via `excluidoEm: { not: null, lt }`.
 * Remove o registro (cascata: Pendencia/AceiteCliente/ConversaoModelo) e os arquivos
 * físicos (o próprio + o `.frag` da conversão IFC). Devolve quantos foram purgados.
 */
export async function purgarLixeiraArquivos(): Promise<number> {
  const vencidos = await prisma.upload.findMany({
    where: { excluidoEm: { not: null, lt: limitePurga() } },
    select: {
      id: true,
      caminho: true,
      conversao: { select: { caminhoFrag: true } },
      conversaoDesenho: { select: { caminhoDxf: true } },
    },
  });
  if (vencidos.length === 0) return 0;

  let removidos = 0;
  for (const u of vencidos) {
    try {
      await prisma.upload.delete({ where: { id: u.id } });
      await removerArquivo(u.caminho);
      if (u.conversao?.caminhoFrag) await removerArquivo(u.conversao.caminhoFrag);
      if (u.conversaoDesenho?.caminhoDxf) await removerArquivo(u.conversaoDesenho.caminhoDxf);
      removidos++;
    } catch (err) {
      console.error(`[lixeira] falha ao purgar upload ${u.id}:`, err);
    }
  }
  return removidos;
}

/**
 * Dispara os avisos gerais cuja hora agendada já passou.
 *
 * Cada aviso é CLAIMADO (updateMany condicional em `enviadoEm: null`) antes do
 * fan-out: o disparo pode demorar mais que o intervalo do tick (o envio de e-mail
 * é sequencial por destinatário) e um segundo tick não pode reenviar um modal
 * bloqueante para a empresa inteira. Devolve quantos foram disparados.
 */
export async function dispararAvisosAgendados(): Promise<number> {
  const vencidos = await prisma.aviso.findMany({
    where: { agendadoPara: { lte: new Date() }, enviadoEm: null, canceladoEm: null },
    select: { id: true },
    orderBy: { agendadoPara: "asc" },
    take: 20,
  });
  if (vencidos.length === 0) return 0;

  let disparados = 0;
  for (const { id } of vencidos) {
    const { count } = await prisma.aviso.updateMany({
      where: { id, enviadoEm: null, canceladoEm: null },
      data: { enviadoEm: new Date() },
    });
    if (count !== 1) continue; // outro tick pegou primeiro, ou foi cancelado no meio
    try {
      await dispatcharAviso(id);
      disparados++;
    } catch (err) {
      // Fica marcado como enviado de propósito: reenviar arriscaria dobrar o modal.
      console.error(`[avisos] falha ao disparar o aviso agendado ${id}:`, err);
    }
  }
  return disparados;
}

export async function limparFragsOrfaos(): Promise<number> {
  const base = process.env.STORAGE_BASE_PATH;
  if (!base) return 0;
  const { readdir, stat, unlink } = await import("node:fs/promises");
  const path = await import("node:path");

  // Encontra todos os .frag sob pastas chamadas COORDENACAO (varredura recursiva).
  const fragsNoDisco: { abs: string; uploadId: string }[] = [];
  async function varrer(dir: string) {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await varrer(full);
      } else if (e.name.toLowerCase().endsWith(".frag") && path.basename(dir) === "COORDENACAO") {
        fragsNoDisco.push({ abs: full, uploadId: e.name.replace(/\.frag$/i, "") });
      }
    }
  }
  await varrer(path.resolve(base));
  if (fragsNoDisco.length === 0) return 0;

  // O nome do .frag é o uploadId (IFC de disciplina) OU o documentoVersaoId (IFC
  // recebido do cliente). Um .frag está "vivo" se casar com QUALQUER dos dois.
  const nomes = fragsNoDisco.map((f) => f.uploadId);
  const vivos = await prisma.conversaoModelo.findMany({
    where: { OR: [{ uploadId: { in: nomes } }, { documentoVersaoId: { in: nomes } }] },
    select: { uploadId: true, documentoVersaoId: true },
  });
  const vivoSet = new Set<string>();
  for (const v of vivos) {
    if (v.uploadId) vivoSet.add(v.uploadId);
    if (v.documentoVersaoId) vivoSet.add(v.documentoVersaoId);
  }

  let removidos = 0;
  const agora = Date.now();
  for (const f of fragsNoDisco) {
    if (vivoSet.has(f.uploadId)) continue;
    // Só apaga se o arquivo tem >1h (evita corrida com uma conversão gravando agora).
    try {
      const info = await stat(f.abs);
      if (agora - info.mtimeMs < 60 * 60 * 1000) continue;
      await unlink(f.abs);
      removidos++;
    } catch {
      /* já removido / inacessível */
    }
  }
  return removidos;
}

/**
 * Envia uma mensagem de chat agendada (fila `chat-mensagem-agendada`). Cria a
 * mensagem, emite ao vivo para o canal e notifica os membros offline. Descarta
 * silenciosamente se o autor não é mais membro do canal.
 */
export async function processarMensagemAgendada(data: unknown): Promise<void> {
  const { canalId, autorId, conteudo } = (data ?? {}) as Partial<MensagemAgendadaJob>;
  if (!canalId || !autorId || !conteudo) return;

  const membro = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId: autorId } },
  });
  if (!membro) return; // autor saiu do canal → descarta

  const msg = await prisma.mensagem.create({
    data: { canalId, autorId, conteudo },
    include: { autor: { select: { id: true, name: true, image: true } } },
  });

  emitParaCanal(canalId, "mensagem", {
    id: msg.id,
    canalId,
    conteudo: msg.conteudo,
    fixada: false,
    editedAt: null,
    excluidaEm: null,
    encaminhada: false,
    anexoMime: null,
    anexoNome: null,
    anexos: [],
    autor: { id: msg.autor.id, name: msg.autor.name, image: msg.autor.image },
    createdAt: msg.createdAt,
    reacoes: [],
    respostaA: null,
  });

  // Notifica membros offline (os online já recebem via socket). Silenciados recebem
  // só o sino (sem push), honrando a preferência — igual ao envio ao vivo.
  const membros = await prisma.canalMembro.findMany({
    where: { canalId, userId: { not: autorId } },
    select: { userId: true, silenciado: true },
  });
  const offline = membros.filter((m) => !usuarioOnline(m.userId));
  const notif = {
    titulo: `Mensagem de ${msg.autor.name}`,
    corpo: textoParaPreview(conteudo).slice(0, 120),
    href: `/chat?c=${canalId}`,
    tag: `chat-${canalId}`,
  };
  const comPush = offline.filter((m) => !m.silenciado).map((m) => m.userId);
  const semPush = offline.filter((m) => m.silenciado).map((m) => m.userId);
  if (comPush.length > 0) await notificarMuitos(comPush, notif);
  if (semPush.length > 0) await notificarMuitos(semPush, notif, { push: false });
}

// ── Engenharia de Custos: import SINAPI ─────────────────────────

/**
 * Handler da fila on-demand `importar-base-custos` (lib/jobs.ts). Toda a lógica de
 * leitura/upsert mora em `modules/custos/composicoes/service.ts` (compartilhável se um dia
 * houver um recálculo em lote fora do job); aqui é só o encaixe com o pg-boss.
 */
export async function processarImportacaoCusto(importacaoId: string): Promise<void> {
  await executarImportacaoCusto(importacaoId);
}

// ── Apontamentos: prazo/SLA (item 18) ───────────────────────────

/**
 * Varredura diária dos apontamentos vencidos ou vencendo (item 18).
 *
 * **Uma notificação por PESSOA, não por apontamento.** Uma prancha com 12 apontamentos
 * vencidos viraria 12 pushes — a forma mais rápida de alguém desligar a categoria inteira.
 * Por isso o agrupamento (`agruparPorDestinatario`) é puro e testado à parte.
 *
 * Só entram apontamentos **publicados** (rascunho não tem relógio, item 31) e ainda em aberto
 * ou aguardando verificação; `fechada`/`descartada` saem porque o trabalho acabou. `adiado`
 * entra: adiar tira da fila de trabalho, não do radar de prazo — e o solicitante decidiu que
 * reativar PRESERVA o prazo, então o adiado continua com o relógio dele.
 */
export async function alertasPrazoApontamento(): Promise<number> {
  const limite = addDays(new Date(), DIAS_ALERTA_APONTAMENTO);
  const pendencias = await prisma.pendencia.findMany({
    where: {
      prazo: { not: null, lte: limite },
      publicadoEm: { not: null },
      excluidoEm: null,
      status: { notIn: ["fechada", "descartada"] },
    },
    select: {
      id: true,
      numero: true,
      texto: true,
      prazo: true,
      publicadoEm: true,
      status: true,
      projetoId: true,
      disciplinaId: true,
      uploadId: true,
    },
  });
  if (pendencias.length === 0) return 0;

  const disciplinaIds = [...new Set(pendencias.map((p) => p.disciplinaId))];
  const projetoIds = [...new Set(pendencias.map((p) => p.projetoId))];
  const [responsaveis, projetos] = await Promise.all([
    prisma.disciplinaResponsavel.findMany({
      where: { disciplinaId: { in: disciplinaIds } },
      select: { disciplinaId: true, userId: true },
    }),
    prisma.projeto.findMany({ where: { id: { in: projetoIds } }, select: { id: true, codigo: true, nome: true } }),
  ]);
  const porDisciplina = new Map<string, string[]>();
  for (const r of responsaveis) {
    const lista = porDisciplina.get(r.disciplinaId);
    if (lista) lista.push(r.userId);
    else porDisciplina.set(r.disciplinaId, [r.userId]);
  }
  const nomeProjeto = new Map(projetos.map((p) => [p.id, p]));

  const agrupado = agruparPorDestinatario(
    pendencias.map((p) => ({ item: p, destinatarios: porDisciplina.get(p.disciplinaId) ?? [] })),
  );

  let enviados = 0;
  for (const [userId, itens] of agrupado) {
    const vencidos = itens.filter((p) => situacaoPrazo(p, ["fechada", "descartada"]) === "vencido");
    const proximos = itens.length - vencidos.length;
    const proj = nomeProjeto.get(itens[0].projetoId);
    const partes = [
      vencidos.length > 0 ? `${vencidos.length} vencido(s)` : null,
      proximos > 0 ? `${proximos} vencendo` : null,
    ].filter(Boolean);
    await notificar(
      userId,
      {
        titulo: `Apontamentos com prazo: ${partes.join(" e ")}`,
        corpo:
          `${proj ? `${formatarCodigo(proj.codigo)} — ` : ""}` +
          itens
            .slice(0, 3)
            .map((p) => `#${p.numero} ${p.texto.slice(0, 40)}`)
            .join(" · ") +
          (itens.length > 3 ? ` … +${itens.length - 3}` : ""),
        href: "/pendencias",
        // Uma tag por dia e por pessoa: reexecução do job no mesmo dia não empilha push.
        tag: `prazo-apontamento-${userId}-${new Date().toISOString().slice(0, 10)}`,
      },
      { categoria: "apontamento" },
    );
    enviados++;
  }
  return enviados;
}

/**
 * Alertas do cofre de Acessos (§37/§43) — licença vencendo e credencial sem revisão.
 *
 * ── Para quem vai ─────────────────────────────────────────────────────────────────────────
 * Responsável pelo acesso + quem o alcança por compartilhamento com `podeVerCadastro`. NÃO vai
 * para "todos os gestores" como os outros alertas: o cofre é opt-in por compartilhamento, e
 * avisar gestor que não alcança o registro contaria que ele existe — a mesma fuga de existência
 * que o módulo fecha em toda leitura. Sem ninguém para avisar, o alerta é silencioso de
 * propósito; ele reaparece na tela, na área "Atenção necessária", para quem tem acesso.
 *
 * ── Idempotência ──────────────────────────────────────────────────────────────────────────
 * Pela `tag` da notificação (`acesso-<id>-venc-<dias>`), igual a `alertaCertidoes`. O job roda
 * uma vez ao dia e `diaAlvo` casa a data exata, então cada marco dispara num dia só; a `tag`
 * cobre o retry do pg-boss depois de uma falha no meio do fan-out.
 *
 * Não avisa sobre `bloqueado`/`inativo`: são estados declarados por gente, que já sabe.
 */
export async function alertaAcessos(): Promise<number> {
  const { DIAS_REVISAO } = await import("@/modules/acessos/service");
  let enviados = 0;

  async function destinatarios(credencialId: string, responsavelId: string | null) {
    const linhas = await prisma.credencialCompartilhamento.findMany({
      where: { credencialId, podeVerCadastro: true, tipoAlvo: "usuario" },
      select: { alvoId: true },
    });
    const ids = new Set(linhas.map((l) => l.alvoId));
    if (responsavelId) ids.add(responsavelId);
    return [...ids];
  }

  // §37 — marcos de aviso antes do vencimento.
  for (const dias of [90, 30, 7]) {
    const vencendo = await prisma.credencial.findMany({
      where: {
        deletadoEm: null,
        status: { notIn: ["bloqueado", "inativo"] },
        vencimentoEm: diaAlvo(dias),
      },
      select: { id: true, nome: true, responsavelId: true },
    });
    for (const c of vencendo) {
      const alvos = await destinatarios(c.id, c.responsavelId);
      if (alvos.length === 0) continue;
      await notificarMuitos(
        alvos,
        {
          titulo: `Acesso vence em ${dias} dia(s)`,
          corpo: c.nome,
          href: "/acessos",
          tag: `acesso-${c.id}-venc-${dias}`,
        },
        { categoria: "acessos" },
      );
      enviados++;
    }
  }

  // §43 — credencial sem revisão há muito tempo. Avisa uma vez por mês (dia 1) para não
  // repetir todo dia: passado o limite, a condição continua verdadeira indefinidamente.
  if (new Date().getDate() === 1) {
    const limite = addDays(new Date(), -DIAS_REVISAO);
    const semRevisao = await prisma.credencial.findMany({
      where: {
        deletadoEm: null,
        status: { notIn: ["bloqueado", "inativo"] },
        OR: [{ ultimaRevisaoEm: null }, { ultimaRevisaoEm: { lte: limite } }],
      },
      select: { id: true, nome: true, responsavelId: true },
      take: 200,
    });
    for (const c of semRevisao) {
      const alvos = await destinatarios(c.id, c.responsavelId);
      if (alvos.length === 0) continue;
      await notificarMuitos(
        alvos,
        {
          titulo: "Credencial sem revisão",
          corpo: `${c.nome} não é revisada há mais de ${DIAS_REVISAO} dias.`,
          href: "/acessos",
          tag: `acesso-${c.id}-revisao-${new Date().toISOString().slice(0, 7)}`,
        },
        { categoria: "acessos" },
      );
      enviados++;
    }
  }

  return enviados;
}
