import "server-only";
import { redirect } from "next/navigation";
import { can, canRole } from "@/lib/permissions";
import { requireUser, type SessionUser } from "@/lib/session";

/**
 * Quem abre a tela de nomenclatura (spec 2026-09-30, E10): quem administra o catálogo de disciplinas
 * (`configuracoes:disciplinas`) ou a configuração em geral (`configuracoes:gerir`). Cada ação mantém o
 * gate que já tinha; aqui só se descobre o que mostrar — o que o perfil não pode, a tela omite.
 */
export async function exigirAcessoNomenclatura(): Promise<{
  user: SessionUser;
  /** `configuracoes:gerir` — siglas, subs, tirar/voltar, importar, versões. */
  podeGerir: boolean;
  /** `projetos:gerir` — cadastro do card (lápis). */
  podeEditarCard: boolean;
  /** Abre o cadastro inteiro (`/configuracoes/disciplinas`, a lente "Todas as versões" até a F3). */
  podeVerCadastro: boolean;
}> {
  const user = await requireUser();
  const [gerir, disciplinas, projetos] = await Promise.all([
    can(user, "configuracoes", "gerir"),
    can(user, "configuracoes", "disciplinas"),
    can(user, "projetos", "gerir"),
  ]);
  // Piso de leitura do sócio, como em `requirePermission`: abre como o supervisor, sem ganhar escrita.
  const piso = user.ehSocio && (await canRole("supervisor", "configuracoes", "disciplinas"));
  if (!gerir && !disciplinas && !piso) redirect("/sem-permissao");
  return { user, podeGerir: gerir, podeEditarCard: projetos, podeVerCadastro: disciplinas || piso };
}
