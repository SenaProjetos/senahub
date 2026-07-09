import "server-only";
import { prisma } from "@/lib/prisma";

export type AlteracaoPendente = { alteracoes: Record<string, string>; propostoEm: string };

function lerPendente(dados: unknown): AlteracaoPendente | null {
  const d = (dados as Record<string, unknown> | null) ?? {};
  const p = d["cadastroPendente"];
  if (p && typeof p === "object" && "alteracoes" in (p as object)) return p as AlteracaoPendente;
  return null;
}

/** Alteração de cadastro pendente do próprio usuário (para o banner em /minha-ficha). */
export async function minhaAlteracaoPendente(userId: string): Promise<AlteracaoPendente | null> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  return lerPendente(pref?.dados);
}

const CAMPOS_SELECT = {
  telefone: true, emailPessoal: true, telefoneEmergencia: true, contatoEmergenciaNome: true,
  enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
  enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
  banco: true, agencia: true, conta: true, tipoContaBancaria: true,
} as const;

/** Fila de validação do RH: todas as alterações pendentes, com valor atual × proposto. */
export async function alteracoesPendentes() {
  // Base pequena de usuários → busca todas as prefs e filtra em memória (sem query JSON).
  const prefs = await prisma.userPreference.findMany({ select: { userId: true, dados: true } });
  const comPend = prefs
    .map((p) => ({ userId: p.userId, pend: lerPendente(p.dados) }))
    .filter((x): x is { userId: string; pend: AlteracaoPendente } => x.pend !== null);
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
        alteracoes: Object.entries(x.pend.alteracoes).map(([campo, novo]) => ({
          campo,
          novo,
          atual: (u?.[campo] as string | null) ?? null,
        })),
      };
    })
    .sort((a, b) => a.propostoEm.localeCompare(b.propostoEm));
}
export type PendenciaCadastro = Awaited<ReturnType<typeof alteracoesPendentes>>[number];
