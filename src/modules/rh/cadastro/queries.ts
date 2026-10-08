import "server-only";
import { prisma } from "@/lib/prisma";

export type AlteracaoPendente = { alteracoes: Record<string, string>; propostoEm: string };

/**
 * O pendente guardado: `alteracoes` (mudar o que existe, Fase 4) e `preenchimentos` (CPF/RG que
 * estavam vazios, preenchidos pela pessoa a pedido do RH). Qualquer um dos dois pode estar vazio.
 */
type PendenteGuardado = { alteracoes: Record<string, string>; preenchimentos: Record<string, string>; propostoEm: string };

function lerPendente(dados: unknown): PendenteGuardado | null {
  const d = (dados as Record<string, unknown> | null) ?? {};
  const p = d["cadastroPendente"] as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const alteracoes = (p.alteracoes as Record<string, string> | undefined) ?? {};
  const preenchimentos = (p.preenchimentos as Record<string, string> | undefined) ?? {};
  if (Object.keys(alteracoes).length === 0 && Object.keys(preenchimentos).length === 0) return null;
  return { alteracoes, preenchimentos, propostoEm: String(p.propostoEm ?? "") };
}

/**
 * Alteração de cadastro pendente do próprio usuário (para o banner em /minha-ficha). Só as
 * ALTERAÇÕES: CPF/RG preenchidos aguardando o RH não travam a edição de contato e endereço.
 */
export async function minhaAlteracaoPendente(userId: string): Promise<AlteracaoPendente | null> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const p = lerPendente(pref?.dados);
  if (!p || Object.keys(p.alteracoes).length === 0) return null;
  return { alteracoes: p.alteracoes, propostoEm: p.propostoEm };
}

const CAMPOS_SELECT = {
  telefone: true, emailPessoal: true, telefoneEmergencia: true, contatoEmergenciaNome: true,
  enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
  enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
  // Os 4 campos bancários saíram (2.2) junto com as colunas: hoje são `ContaBancariaColaborador`,
  // e o auto-serviço não os propõe mais. Ver `rh/cadastro/whitelist.ts`.
} as const;

/** Fila de validação do RH: todas as alterações pendentes, com valor atual × proposto. */
export async function alteracoesPendentes() {
  // Base pequena de usuários → busca todas as prefs e filtra em memória (sem query JSON).
  const prefs = await prisma.userPreference.findMany({ select: { userId: true, dados: true } });
  const comPend = prefs
    .map((p) => ({ userId: p.userId, pend: lerPendente(p.dados) }))
    .filter((x): x is { userId: string; pend: PendenteGuardado } => x.pend !== null);
  if (comPend.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: comPend.map((x) => x.userId) } },
    select: { id: true, name: true, ...CAMPOS_SELECT },
  });
  const byId = new Map(users.map((u) => [u.id, u as Record<string, unknown>]));

  return comPend
    .map((x) => {
      const u = byId.get(x.userId);
      return {
        userId: x.userId,
        nome: (u?.name as string) ?? "—",
        propostoEm: x.pend.propostoEm,
        alteracoes: [
          ...Object.entries(x.pend.alteracoes).map(([campo, novo]) => ({
            campo,
            novo,
            atual: (u?.[campo] as string | null) ?? null,
          })),
          // CPF/RG preenchidos a pedido do RH: o campo estava vazio quando a pessoa mandou.
          ...Object.entries(x.pend.preenchimentos).map(([campo, novo]) => ({ campo, novo, atual: null })),
        ],
      };
    })
    .sort((a, b) => a.propostoEm.localeCompare(b.propostoEm));
}
export type PendenciaCadastro = Awaited<ReturnType<typeof alteracoesPendentes>>[number];

// ── Pedidos "Atualize seus dados" ───────────────────────────────

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Pedidos para a tela do RH: os abertos (com o que ainda falta, calculado agora) e os fechados
 * nos últimos 30 dias. Base pequena: a situação de cada aberto é calculada uma a uma.
 */
export async function pedidosDeDados() {
  const { situacaoDaPessoa } = await import("./pedido-service");
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const pedidos = await prisma.pedidoDadosCadastro.findMany({
    where: { OR: [{ status: "aberto" }, { atendidoEm: { gte: desde } }, { status: "cancelado", criadoEm: { gte: desde } }] },
    select: {
      id: true, userId: true, status: true, tipo: true, prazo: true, mensagem: true, criadoEm: true, atendidoEm: true, lembradoEm: true,
      solicitadoPorId: true, user: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
  });
  const autores = await prisma.user.findMany({
    where: { id: { in: [...new Set(pedidos.map((p) => p.solicitadoPorId))] } },
    select: { id: true, name: true },
  });
  const nomeAutor = new Map(autores.map((a) => [a.id, a.name]));
  const linhas = [];
  for (const p of pedidos) {
    const s = p.status === "aberto" && p.tipo === "completar" ? await situacaoDaPessoa(p.userId) : null;
    linhas.push({
      id: p.id,
      userId: p.userId,
      nome: p.user.name,
      status: p.status,
      tipo: p.tipo,
      prazo: ymd(p.prazo),
      mensagem: p.mensagem,
      criadoEm: p.criadoEm.toISOString(),
      atendidoEm: p.atendidoEm?.toISOString() ?? null,
      lembradoEm: p.lembradoEm?.toISOString() ?? null,
      solicitadoPor: p.solicitadoPorId === "sistema" ? "sistema (anual)" : (nomeAutor.get(p.solicitadoPorId) ?? "—"),
      faltam: s?.pendenteDaPessoa ?? 0,
      aguardandoRh: s?.aguardandoRh ?? [],
    });
  }
  return linhas;
}
export type PedidoDadosLinha = Awaited<ReturnType<typeof pedidosDeDados>>[number];

/** Pedido aberto da pessoa e o que falta — para o cartão na ficha. */
export async function pedidoDaPessoa(userId: string) {
  const { situacaoDaPessoa } = await import("./pedido-service");
  const [aberto, situacao] = await Promise.all([
    prisma.pedidoDadosCadastro.findFirst({
      where: { userId, status: "aberto" },
      select: { id: true, prazo: true, criadoEm: true, lembradoEm: true },
    }),
    situacaoDaPessoa(userId),
  ]);
  if (!situacao) return null;
  return {
    aberto: aberto
      ? { id: aberto.id, prazo: ymd(aberto.prazo), criadoEm: aberto.criadoEm.toISOString(), lembradoEm: aberto.lembradoEm?.toISOString() ?? null }
      : null,
    faltam: situacao.pendenteDaPessoa,
    campos: situacao.aPreencher.filter((c) => !c.opcional).map((c) => c.label),
    contaBancaria: situacao.contaBancaria,
    aguardandoRh: situacao.aguardandoRh,
    soRh: situacao.soRh,
  };
}
export type PedidoDaPessoa = Awaited<ReturnType<typeof pedidoDaPessoa>>;
