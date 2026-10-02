import "server-only";

/**
 * I/O dos avisos do Financeiro (M9). As regras são do puro `regras.ts`; aqui ficam a busca no banco, a
 * RESERVA do aviso (que impede o duplicado) e o envio. O envio é injetável (`enviar`, `notificar`) para o
 * smoke exercitar o mesmo código sem e-mail nem push de verdade.
 *
 * Ordem que garante "uma vez só": reserva a chave → envia → se o envio falhar, libera a chave para a
 * próxima rodada tentar de novo. Duas instâncias do job disputando o mesmo aviso: a chave única do banco
 * decide quem envia (P2002 = outra já reservou, não é erro).
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { wherePermissao } from "@/lib/audiencias";
import { SEM_TRANSFERENCIA } from "@/modules/financeiro/natureza";
import { somarDias } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import {
  agruparAvisosDePagar,
  CHAVE_CONFIG_AVISOS,
  cobrancaDeHoje,
  corpoDoAvisoDePagar,
  DESTINO_CLIENTE,
  frasesDoVencimento,
  normalizarConfigAvisos,
  pagarDeHoje,
  type ConfigAvisos,
  type ContaVencendo,
  type TipoDeAviso,
} from "@/modules/financeiro/avisos/regras";

type Db = Prisma.TransactionClient | typeof prisma;

const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getConfigAvisos(): Promise<ConfigAvisos> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_AVISOS } });
  return normalizarConfigAvisos(c?.valor);
}

export type ChaveDoAviso = { lancamentoId: string; tipo: TipoDeAviso; destino: string; vencimento: string };

/** Reserva o aviso. `true` = é seu, pode enviar; `false` = já foi (ou está sendo) enviado por outra rodada. */
export async function reservarAviso(db: Db, c: ChaveDoAviso): Promise<boolean> {
  try {
    await db.avisoFinanceiroEnviado.create({ data: { lancamentoId: c.lancamentoId, tipo: c.tipo, destino: c.destino, vencimento: dia(c.vencimento) } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

/** Devolve a reserva quando o envio falhou: a próxima rodada tenta de novo. */
export async function liberarAviso(db: Db, c: ChaveDoAviso): Promise<void> {
  await db.avisoFinanceiroEnviado.deleteMany({
    where: { lancamentoId: c.lancamentoId, tipo: c.tipo, destino: c.destino, vencimento: dia(c.vencimento) },
  });
}

const reais = (v: unknown) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dataBr = (d: string) => d.split("-").reverse().join("/");

/** `false` = o e-mail não saiu (o transporte devolve `false` em vez de lançar): a reserva é devolvida. */
export type EnviarEmail = (para: string, slug: string, variaveis: Record<string, string>) => Promise<boolean>;

export type ResultadoDaCobranca = { avaliadas: number; enviadas: number; duplicadas: number; semEmail: number; falhas: number };

/**
 * E-mail de cobrança ao cliente: antes, no dia e depois do vencimento, conforme a configuração. Só
 * recebível em aberto (previsto), do resultado (nunca transferência), de cliente com e-mail.
 */
export async function enviarCobrancasAoCliente(o: { hoje?: string; enviar: EnviarEmail }): Promise<ResultadoDaCobranca> {
  const hoje = o.hoje ?? diaDeSaoPaulo();
  const cfg = await getConfigAvisos();
  const r: ResultadoDaCobranca = { avaliadas: 0, enviadas: 0, duplicadas: 0, semEmail: 0, falhas: 0 };

  // Os dias-alvo vêm da configuração: só busca no banco o que algum aviso ligado pode querer.
  const alvos = new Set<string>();
  if (cfg.cobrancaAntes) alvos.add(somarDias(hoje, cfg.diasAntes));
  if (cfg.cobrancaNoDia) alvos.add(hoje);
  if (cfg.cobrancaApos) alvos.add(somarDias(hoje, -1));
  if (alvos.size === 0) return r;

  const recebiveis = await prisma.lancamento.findMany({
    where: { tipo: "receita", status: "previsto", vencimento: { in: [...alvos].map(dia) }, ...SEM_TRANSFERENCIA },
    select: { id: true, descricao: true, valor: true, vencimento: true, cliente: { select: { nome: true, email: true } } },
  });

  for (const l of recebiveis) {
    const venc = iso(l.vencimento!);
    const tipo = cobrancaDeHoje(hoje, venc, cfg);
    if (!tipo) continue;
    r.avaliadas += 1;
    if (!l.cliente?.email) {
      r.semEmail += 1;
      continue;
    }
    const chave: ChaveDoAviso = { lancamentoId: l.id, tipo, destino: DESTINO_CLIENTE, vencimento: venc };
    if (!(await reservarAviso(prisma, chave))) {
      r.duplicadas += 1;
      continue;
    }
    try {
      const saiu = await o.enviar(l.cliente.email, tipo === "cobranca_apos" ? "lembrete-pagamento" : "lembrete-vencimento", {
        nomeCliente: l.cliente.nome,
        descricao: l.descricao,
        valor: reais(l.valor),
        vencimento: dataBr(venc),
        situacao: frasesDoVencimento(tipo, cfg.diasAntes),
      });
      if (!saiu) throw new Error("o e-mail não saiu");
      r.enviadas += 1;
    } catch (e) {
      await liberarAviso(prisma, chave);
      r.falhas += 1;
      console.error("[avisos] cobrança ao cliente falhou:", e);
    }
  }
  return r;
}

export type NotificarPessoa = (userId: string, n: { titulo: string; corpo: string; href: string }, categoria: string) => Promise<void>;
export type ResultadoDosAvisosDePagar = { contas: number; notificacoes: number; duplicadas: number; semDestino: number; falhas: number };

/**
 * Sino de contas a pagar vencendo (D-3 e D-1) para quem lançou a conta; se quem lançou não vê o financeiro
 * (ou saiu), vai para quem gere. UMA notificação por pessoa e por dia. Compra de cartão entra como UMA conta
 * por fatura (o que vence é a fatura, não cada compra).
 */
export async function avisarContasAPagar(o: { hoje?: string; notificar: NotificarPessoa }): Promise<ResultadoDosAvisosDePagar> {
  const hoje = o.hoje ?? diaDeSaoPaulo();
  const r: ResultadoDosAvisosDePagar = { contas: 0, notificacoes: 0, duplicadas: 0, semDestino: 0, falhas: 0 };
  if (!(await getConfigAvisos()).contasAPagar) return r;

  const alvos = [somarDias(hoje, 1), somarDias(hoje, 3)];
  const ls = await prisma.lancamento.findMany({
    // `previsto` já exclui o que ainda aguarda aprovação (não dá para pagar) e o que foi pago.
    where: { tipo: "despesa", status: "previsto", vencimento: { in: alvos.map(dia) }, ...SEM_TRANSFERENCIA },
    select: { id: true, autorId: true, descricao: true, valor: true, vencimento: true, faturaId: true },
  });

  // Compras do mesmo cartão: uma conta por fatura, com o total e a primeira compra como âncora da reserva.
  const contas: (ContaVencendo & { vencimento: string })[] = [];
  const porFatura = new Map<string, (typeof contas)[number]>();
  for (const l of ls) {
    const venc = iso(l.vencimento!);
    const tipo = pagarDeHoje(hoje, venc);
    if (!tipo) continue;
    const centavos = paraCentavos(l.valor);
    if (l.faturaId) {
      const ja = porFatura.get(l.faturaId);
      if (ja) {
        ja.valor += centavos;
        continue;
      }
      const nova = { id: l.id, autorId: l.autorId, valor: centavos, descricao: l.descricao, tipo, vencimento: venc };
      porFatura.set(l.faturaId, nova);
      contas.push(nova);
      continue;
    }
    contas.push({ id: l.id, autorId: l.autorId, valor: centavos, descricao: l.descricao, tipo, vencimento: venc });
  }
  r.contas = contas.length;
  if (contas.length === 0) return r;

  // Quem recebe: o autor, se ainda está ativo e vê o financeiro; senão, quem gere o financeiro.
  const autores = [...new Set(contas.map((c) => c.autorId))];
  const [veemOsAutores, quemGere] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: autores }, ...wherePermissao("financeiro", "ver") }, select: { id: true } }),
    prisma.user.findMany({ where: wherePermissao("financeiro", "gerir"), select: { id: true } }),
  ]);
  const vee = new Set(veemOsAutores.map((u) => u.id));
  const gestores = quemGere.map((u) => u.id);
  const quemRecebe = (autorId: string) => (vee.has(autorId) ? [autorId] : gestores.length > 0 ? gestores : null);
  const semDestino = contas.filter((c) => quemRecebe(c.autorId) === null).length;
  r.semDestino = semDestino;

  const porId = new Map(contas.map((c) => [c.id, c]));
  for (const g of agruparAvisosDePagar(contas, quemRecebe)) {
    // Só entra no aviso o que ainda não foi avisado a esta pessoa para este vencimento.
    const reservadas: ChaveDoAviso[] = [];
    const novo = { d1: { quantidade: 0, valor: 0 }, d3: { quantidade: 0, valor: 0 } };
    for (const id of g.ids) {
      const c = porId.get(id)!;
      const chave: ChaveDoAviso = { lancamentoId: id, tipo: c.tipo, destino: g.destinatarioId, vencimento: c.vencimento };
      if (!(await reservarAviso(prisma, chave))) {
        r.duplicadas += 1;
        continue;
      }
      reservadas.push(chave);
      const alvo = c.tipo === "pagar_d1" ? novo.d1 : novo.d3;
      alvo.quantidade += 1;
      alvo.valor += c.valor;
    }
    if (reservadas.length === 0) continue;
    try {
      await o.notificar(g.destinatarioId, { titulo: "Contas a pagar vencendo", corpo: corpoDoAvisoDePagar(novo), href: "/financeiro/contas" }, "conta_a_pagar");
      r.notificacoes += 1;
    } catch (e) {
      for (const chave of reservadas) await liberarAviso(prisma, chave);
      r.falhas += 1;
      console.error("[avisos] aviso de conta a pagar falhou:", e);
    }
  }
  return r;
}

/**
 * D+1 interno (sino dos gestores): "recebimento vencido". Mesma garantia de uma vez só — o job que repete
 * não avisa de novo. A chave usa o destino "gestores".
 */
export async function reservarAvisoInterno(db: Db, lancamentoId: string, vencimento: string): Promise<boolean> {
  return reservarAviso(db, { lancamentoId, tipo: "inadimplencia_interna", destino: "gestores", vencimento });
}
