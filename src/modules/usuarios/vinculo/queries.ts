import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { CONTRATACAO_LABELS, SETOR_LABELS } from "./labels";

/**
 * "Meu acesso": o que a pessoa é no sistema e o que o perfil dela libera, em português.
 *
 * Existe porque hoje ninguém tem visibilidade nenhuma do próprio acesso — a pedido da cadeira
 * de usuária final no conselho: *"é a única coisa que me tira de 'confio às cegas' para
 * 'eu vejo o que sou no sistema'"*. É LEITURA PURA: não concede nem altera nada.
 *
 * Os rótulos vêm de `permissions-catalog.ts`, que já é escrito em pt-BR de negócio
 * ("Validar entregas (libera pagamento)") — a tela nunca mostra `recurso:acao`.
 */
export async function meuAcesso(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tipo: true,
      setor: true,
      contratacao: true,
      vinculoAtivo: {
        select: { cargo: true, dataInicio: true, cargaSemanal: true, pj: { select: { razaoSocial: true } } },
      },
    },
  });
  if (!u) return null;

  const role = u.role as Role;
  const grupos = await Promise.all(
    PERMISSOES_CATALOGO.map(async (r) => ({
      recurso: r.recurso,
      label: r.label,
      acoes: await Promise.all(
        r.acoes.map(async (a) => ({ label: a.label, permitido: await can(role, r.recurso, a.acao) })),
      ),
    })),
  );

  const permitidas = grupos.reduce((n, g) => n + g.acoes.filter((a) => a.permitido).length, 0);
  const total = grupos.reduce((n, g) => n + g.acoes.length, 0);

  return {
    perfil: ROLE_LABELS[role],
    /** admin tem bypass total no código — a matriz não se aplica a ele. */
    acessoTotal: role === "admin",
    tipo: u.tipo,
    setor: u.setor ? SETOR_LABELS[u.setor] : null,
    contratacao: u.contratacao ? CONTRATACAO_LABELS[u.contratacao] : null,
    cargo: u.vinculoAtivo?.cargo ?? null,
    desde: u.vinculoAtivo?.dataInicio ?? null,
    pj: u.vinculoAtivo?.pj?.razaoSocial ?? null,
    permitidas,
    total,
    // Só grupos com ao menos uma ação liberada — a tela responde "o que EU posso",
    // não "tudo que existe e você não pode".
    grupos: grupos.filter((g) => g.acoes.some((a) => a.permitido)),
  };
}
