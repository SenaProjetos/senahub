import "server-only";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, CLT_ROLES, type Role } from "@/lib/roles";

/** Preferências (chave-valor) do usuário (E8). */
export async function getPreferencias(userId: string): Promise<Record<string, unknown>> {
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  return (p?.dados as Record<string, unknown> | null) ?? {};
}

/**
 * Bundle pronto para a `PreferenciasView` (perfil + flags de notificação + ponto).
 * Fonte única usada por /preferencias e pela aba Preferências da Minha conta.
 */
export async function carregarPreferenciasDaConta(userId: string) {
  const [prefs, perfilDb] = await Promise.all([
    getPreferencias(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true, telefone: true, cargo: true, departamento: true, dataAdmissao: true, role: true },
    }),
  ]);
  const role = (perfilDb?.role ?? "clt") as Role;
  const modoValido = prefs.ponto_email_modo === "resumo_diario" || prefs.ponto_email_modo === "nenhum";
  return {
    perfil: {
      name: perfilDb?.name ?? "",
      email: perfilDb?.email ?? "",
      image: perfilDb?.image ?? null,
      telefone: perfilDb?.telefone ?? "",
      cargo: perfilDb?.cargo ?? null,
      departamento: perfilDb?.departamento ?? null,
      dataAdmissao: perfilDb?.dataAdmissao ? perfilDb.dataAdmissao.toISOString().slice(0, 10) : null,
      papel: ROLE_LABELS[role],
    },
    somChat: prefs.somChat !== false,
    mostrarRecibos: prefs.mostrarRecibos !== false,
    notifPrazoDisciplina: prefs.notif_prazo_disciplina !== false,
    notifInadimplencia: prefs.notif_inadimplencia !== false,
    notifCertidao: prefs.notif_certidao !== false,
    notifLicitacao: prefs.notif_licitacao !== false,
    notifDigestSemanal: prefs.notif_digest_semanal !== false,
    notifRiscoProjeto: prefs.notif_risco_projeto !== false,
    notifLembretePonto: prefs.notif_lembrete_ponto !== false,
    notifCoordenacao: prefs.notif_coordenacao !== false,
    notifAprovacaoArquivo: prefs.notif_aprovacao_arquivo !== false,
    pontoEmailModo: (modoValido ? prefs.ponto_email_modo : "todos") as "todos" | "resumo_diario" | "nenhum",
    mostrarAlertasPonto: CLT_ROLES.includes(role),
  };
}

/**
 * Filtra `userIds` mantendo apenas os que NÃO optaram por sair da categoria.
 * Por padrão (sem pref salva) o usuário RECEBE a notificação.
 * Chave de pref = `notif_<categoria>`, valor `false` = opt-out.
 */
export async function filtrarPorCategoria(userIds: string[], categoria: string): Promise<string[]> {
  if (userIds.length === 0) return [];
  const chave = `notif_${categoria}`;
  const prefs = await prisma.userPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, dados: true },
  });
  const optOut = new Set(
    prefs
      .filter((p) => (p.dados as Record<string, unknown>)?.[chave] === false)
      .map((p) => p.userId),
  );
  return userIds.filter((id) => !optOut.has(id));
}
