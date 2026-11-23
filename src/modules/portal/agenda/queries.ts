import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { contaPodeVerConversa, podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import {
  itensFixos,
  marcosDaAgenda,
  motivoSemMarcos,
  type EntradaDaAgenda,
  type MarcoDaAgenda,
  type MarcoEntrada,
} from "./marcos";
import { motivoParaNaoEditar, motivoParaNaoImportarAta, situacaoDaReuniao, type SituacaoDaReuniao } from "./reunioes";

/**
 * Leituras da agenda do portal, uma por lado (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md). A
 * porta é a mesma das atas: o cliente pela regra do portal (`contaPodeVerConversa`), a equipe pela audiência da conversa
 * (`podeVerConversaDoProjeto`); fora dela, `null`.
 *
 * O lado do CLIENTE é por allow-list: nunca valor ou percentual da parcela, id nem nome de linha da EAP, nem o nome de quem
 * escreveu a nota ou agendou a reunião. O marco é identificado pelo id da PARCELA do contrato.
 */

const dia = (d: Date): string => d.toISOString().slice(0, 10);
const diaOuNulo = (d: Date | null): string | null => (d ? dia(d) : null);

// ── Entrada comum ──────────────────────────────────────────────────────────────────────────

/** Tudo de que as regras puras precisam, lido em consultas planas. `null` = projeto inexistente. */
export async function carregarEntradaDaAgenda(projetoId: string): Promise<EntradaDaAgenda | null> {
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, clienteId: true, prazoContrato: true } });
  if (!projeto) return null;
  const cronograma = await prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { aprovado: true, emRevisao: true } });
  const contratos = await prisma.documentoJuridico.findMany({
    where: { projetoId, clienteId: projeto.clienteId, vinculoId: null, tipo: "contrato" },
    select: {
      id: true,
      titulo: true,
      tipo: true,
      statusContrato: true,
      formaCobranca: true,
      clienteId: true,
      projetoId: true,
      vinculoId: true,
      assinadoEm: true,
      dataVencimento: true,
      parcelasEntrega: { select: { id: true, descricao: true, ordem: true, naAssinatura: true, marcoId: true } },
    },
  });
  const marcoIds = [...new Set(contratos.flatMap((c) => c.parcelasEntrega.map((p) => p.marcoId)).filter((x): x is string => x != null))];

  const marcos = new Map<string, MarcoEntrada>();
  const combinado = new Map<string, string>();
  if (marcoIds.length > 0) {
    const tarefas = await prisma.eapTarefa.findMany({
      where: { id: { in: marcoIds }, projetoId },
      select: { id: true, projetoId: true, status: true, fimPrevisto: true, fimReal: true },
    });
    for (const t of tarefas) {
      marcos.set(t.id, { id: t.id, projetoId: t.projetoId, status: t.status, fimPrevisto: dia(t.fimPrevisto), fimReal: diaOuNulo(t.fimReal) });
    }
    // "Combinado" é sempre a BL-00 (a original, nunca sobrescrita); sem ela, sem combinado.
    const bl0 = await prisma.eapBaseline.findUnique({ where: { projetoId_numero: { projetoId, numero: 0 } }, select: { id: true } });
    if (bl0) {
      const linhas = await prisma.eapBaselineLinha.findMany({
        where: { baselineId: bl0.id, tarefaId: { in: marcoIds } },
        select: { tarefaId: true, fim: true },
      });
      for (const l of linhas) if (l.tarefaId) combinado.set(l.tarefaId, dia(l.fim));
    }
  }

  return {
    projetoId,
    clienteId: projeto.clienteId,
    prazoContrato: projeto.prazoContrato,
    cronograma,
    contratos: contratos.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      tipo: c.tipo,
      statusContrato: c.statusContrato,
      formaCobranca: c.formaCobranca,
      clienteId: c.clienteId,
      projetoId: c.projetoId,
      vinculoId: c.vinculoId,
      assinadoEm: c.assinadoEm,
      dataVencimento: c.dataVencimento,
      parcelas: c.parcelasEntrega.map((p) => ({ id: p.id, descricao: p.descricao, ordem: p.ordem, naAssinatura: p.naAssinatura, marcoId: p.marcoId })),
    })),
    marcos,
    combinado,
  };
}

type LinhaDaReuniao = Awaited<ReturnType<typeof reunioesDoProjeto>>[number];

async function reunioesDoProjeto(projetoId: string) {
  return prisma.reuniaoAgendada.findMany({
    where: { projetoId },
    orderBy: [{ dia: "asc" }, { horaInicio: "asc" }],
    select: {
      id: true,
      titulo: true,
      dia: true,
      horaInicio: true,
      duracaoMinutos: true,
      link: true,
      local: true,
      pauta: true,
      estado: true,
      motivoCancelamento: true,
      diaAnterior: true,
      horaAnterior: true,
      mudancaEm: true,
      mudancaTipo: true,
      criadaPorId: true,
      criadaEm: true,
      reuniaoId: true,
    },
  });
}

/** Reuniões agendadas cuja ata está publicada e não foi retirada (o atalho "Ver ata"). */
async function comAtaPublicada(reuniaoIds: (string | null)[]): Promise<Set<string>> {
  const ids = reuniaoIds.filter((x): x is string => x != null);
  if (ids.length === 0) return new Set();
  const vigentes = await prisma.reuniaoProjeto.findMany({ where: { id: { in: ids }, retiradaEm: null }, select: { id: true } });
  const publicadas = await prisma.ataVersao.findMany({
    where: { reuniaoId: { in: vigentes.map((r) => r.id) }, estado: "publicada" },
    select: { reuniaoId: true },
  });
  return new Set(publicadas.map((v) => v.reuniaoId));
}

const estadoDaReuniao = (r: LinhaDaReuniao) => ({
  estado: r.estado,
  dia: dia(r.dia),
  diaAnterior: diaOuNulo(r.diaAnterior),
  horaAnterior: r.horaAnterior,
});

// ── Cliente ────────────────────────────────────────────────────────────────────────────────

export type ItemAgendaCliente =
  | { tipo: "assinatura" | "prazo" | "vigencia"; dia: string }
  | {
      tipo: "marco";
      /** Id da parcela do contrato — nunca o id da linha da EAP. */
      chave: string;
      titulo: string;
      combinado: string | null;
      previsao: string;
      diferencaDias: number | null;
      situacao: MarcoDaAgenda["situacao"];
      entregueEm: string | null;
      nota: string | null;
    }
  | {
      tipo: "reuniao";
      id: string;
      titulo: string;
      dia: string;
      horaInicio: string;
      duracaoMinutos: number | null;
      link: string | null;
      local: string | null;
      pauta: string | null;
      situacao: SituacaoDaReuniao;
      diaAnterior: string | null;
      horaAnterior: string | null;
      motivoCancelamento: string | null;
      temAta: boolean;
    };

const diaDoItem = (i: ItemAgendaCliente): string => (i.tipo === "marco" ? i.previsao : i.dia);
const horaDoItem = (i: ItemAgendaCliente): string => (i.tipo === "reuniao" ? i.horaInicio : "");
/** Passado = recolhido no cartão: fato já ocorrido, marco entregue ou reunião de dia anterior. */
const ehPassado = (i: ItemAgendaCliente, hoje: string): boolean => (i.tipo === "marco" ? i.situacao === "entregue" : i.dia < hoje);

/** Os de hoje em diante em ordem crescente; os passados depois, do mais recente para o mais antigo. */
function ordenar(itens: ItemAgendaCliente[], hoje: string): ItemAgendaCliente[] {
  const porData = (a: ItemAgendaCliente, b: ItemAgendaCliente) =>
    diaDoItem(a).localeCompare(diaDoItem(b)) || horaDoItem(a).localeCompare(horaDoItem(b));
  const futuros = itens.filter((i) => !ehPassado(i, hoje)).sort(porData);
  const passados = itens.filter((i) => ehPassado(i, hoje)).sort((a, b) => porData(b, a));
  return [...futuros, ...passados];
}

export async function agendaParaCliente(projetoId: string, userId: string): Promise<ItemAgendaCliente[] | null> {
  if (!(await contaPodeVerConversa(userId, projetoId))) return null;
  const entrada = await carregarEntradaDaAgenda(projetoId);
  if (!entrada) return null;
  const hoje = diaDeSaoPaulo();

  const marcos = marcosDaAgenda(entrada);
  const notas = marcos.length
    ? await prisma.marcoAgendaPortal.findMany({ where: { marcoId: { in: marcos.map((m) => m.marcoId) } }, select: { marcoId: true, nota: true } })
    : [];
  const notaDoMarco = new Map(notas.map((n) => [n.marcoId, n.nota]));
  const reunioes = await reunioesDoProjeto(projetoId);
  const comAta = await comAtaPublicada(reunioes.map((r) => r.reuniaoId));

  const itens: ItemAgendaCliente[] = [
    ...itensFixos(entrada).map((i) => ({ tipo: i.tipo, dia: i.dia }) as ItemAgendaCliente),
    ...marcos.map(
      (m): ItemAgendaCliente => ({
        tipo: "marco",
        chave: m.parcelaId,
        titulo: m.titulo,
        combinado: m.combinado,
        previsao: m.previsao,
        diferencaDias: m.diferencaDias,
        situacao: m.situacao,
        entregueEm: m.entregueEm,
        // Marco entregue: a nota continua guardada, mas o cliente não a vê.
        nota: m.situacao === "entregue" ? null : (notaDoMarco.get(m.marcoId) ?? null),
      }),
    ),
    ...reunioes.map(
      (r): ItemAgendaCliente => ({
        tipo: "reuniao",
        id: r.id,
        titulo: r.titulo,
        dia: dia(r.dia),
        horaInicio: r.horaInicio,
        duracaoMinutos: r.duracaoMinutos,
        link: r.link,
        local: r.local,
        pauta: r.pauta,
        situacao: situacaoDaReuniao(estadoDaReuniao(r), hoje),
        diaAnterior: diaOuNulo(r.diaAnterior),
        horaAnterior: r.horaAnterior,
        motivoCancelamento: r.estado === "cancelada" ? r.motivoCancelamento : null,
        temAta: r.reuniaoId != null && comAta.has(r.reuniaoId),
      }),
    ),
  ];
  return ordenar(itens, hoje);
}

// ── Equipe ─────────────────────────────────────────────────────────────────────────────────

export type MarcoParaEquipe = MarcoDaAgenda & { nota: string | null; notaPorNome: string | null; notaEm: string | null };

export type ReuniaoParaEquipe = {
  id: string;
  titulo: string;
  dia: string;
  horaInicio: string;
  duracaoMinutos: number | null;
  link: string | null;
  local: string | null;
  pauta: string | null;
  situacao: SituacaoDaReuniao;
  diaAnterior: string | null;
  horaAnterior: string | null;
  motivoCancelamento: string | null;
  criadaPorNome: string | null;
  /** `ReuniaoProjeto` da ata ligada, se houver. */
  reuniaoId: string | null;
  temAta: boolean;
  /** Motivo (frase do servidor) de a ação estar desabilitada; nulo = pode. */
  motivoNaoEditar: string | null;
  podeImportarAta: string | null;
};

export type AgendaParaEquipe = { marcos: MarcoParaEquipe[]; reunioes: ReuniaoParaEquipe[]; semMarcosPorque: string | null };

export async function agendaParaEquipe(projetoId: string, userId: string): Promise<AgendaParaEquipe | null> {
  if (!(await podeVerConversaDoProjeto(userId, projetoId))) return null;
  const entrada = await carregarEntradaDaAgenda(projetoId);
  if (!entrada) return null;
  const hoje = diaDeSaoPaulo();

  const marcos = marcosDaAgenda(entrada);
  const linhas = marcos.length
    ? await prisma.marcoAgendaPortal.findMany({
        where: { marcoId: { in: marcos.map((m) => m.marcoId) } },
        select: { marcoId: true, nota: true, notaPorId: true, notaEm: true },
      })
    : [];
  const reunioes = await reunioesDoProjeto(projetoId);
  const comAta = await comAtaPublicada(reunioes.map((r) => r.reuniaoId));

  const pessoaIds = [...new Set([...linhas.map((l) => l.notaPorId), ...reunioes.map((r) => r.criadaPorId)].filter((x): x is string => x != null))];
  const pessoas = pessoaIds.length ? await prisma.user.findMany({ where: { id: { in: pessoaIds } }, select: { id: true, name: true } }) : [];
  const nome = new Map(pessoas.map((p) => [p.id, p.name]));
  const linhaDoMarco = new Map(linhas.map((l) => [l.marcoId, l]));

  return {
    marcos: marcos.map((m) => {
      const l = linhaDoMarco.get(m.marcoId);
      return { ...m, nota: l?.nota ?? null, notaPorNome: l?.notaPorId ? (nome.get(l.notaPorId) ?? null) : null, notaEm: l?.notaEm ? l.notaEm.toISOString() : null };
    }),
    reunioes: reunioes.map((r) => {
      const estado = estadoDaReuniao(r);
      return {
        id: r.id,
        titulo: r.titulo,
        dia: estado.dia,
        horaInicio: r.horaInicio,
        duracaoMinutos: r.duracaoMinutos,
        link: r.link,
        local: r.local,
        pauta: r.pauta,
        situacao: situacaoDaReuniao(estado, hoje),
        diaAnterior: estado.diaAnterior,
        horaAnterior: estado.horaAnterior,
        motivoCancelamento: r.estado === "cancelada" ? r.motivoCancelamento : null,
        criadaPorNome: r.criadaPorId ? (nome.get(r.criadaPorId) ?? null) : null,
        reuniaoId: r.reuniaoId,
        temAta: r.reuniaoId != null && comAta.has(r.reuniaoId),
        motivoNaoEditar: motivoParaNaoEditar(estado, hoje),
        podeImportarAta: motivoParaNaoImportarAta({ ...estado, reuniaoId: r.reuniaoId }, hoje),
      };
    }),
    semMarcosPorque: motivoSemMarcos(entrada),
  };
}
