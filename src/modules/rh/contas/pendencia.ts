/**
 * Auto-serviço de conta bancária (2.2f): o colaborador PROPÕE (criar/editar/remover uma conta),
 * o RH aprova ou recusa. Mesmo padrão de `modules/rh/cadastro/actions.ts` (propor → JSON em
 * `UserPreference.dados` → RH aplica), mas por CONTA — o diff campo-a-campo do fluxo antigo não
 * existe mais desde que os 4 escalares viraram `ContaBancariaColaborador` (2.2).
 *
 * Uma proposta pendente por vez, como o cadastro geral: propor de novo só depois do RH decidir
 * a anterior — evita duas propostas conflitantes na fila.
 *
 * Sem `server-only`: os helpers de leitura/escrita são puro acesso a `UserPreference.dados`,
 * usados por actions e queries.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContaNormalizada } from "./service";

export type PropostaConta =
  | { tipo: "criar"; dados: ContaNormalizada; propostoEm: string }
  | { tipo: "editar"; contaId: string; dados: ContaNormalizada; propostoEm: string }
  | { tipo: "remover"; contaId: string; propostoEm: string };

function ehPropostaConta(v: unknown): v is PropostaConta {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return p.tipo === "criar" || p.tipo === "editar" || p.tipo === "remover";
}

export async function lerContaPendente(userId: string): Promise<PropostaConta | null> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const d = (pref?.dados as Record<string, unknown> | null) ?? {};
  const p = d["contaPendente"];
  return ehPropostaConta(p) ? p : null;
}

/** Grava/limpa a proposta sem tocar no resto do blob `dados` (contato/endereço etc.). */
export async function gravarContaPendente(userId: string, proposta: PropostaConta | null): Promise<void> {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { dados: true } });
  const dados = { ...((pref?.dados as Record<string, unknown> | null) ?? {}) };
  if (proposta) dados["contaPendente"] = proposta;
  else delete dados["contaPendente"];
  const valor = dados as Prisma.InputJsonObject;
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, dados: valor },
    update: { dados: valor },
  });
}
