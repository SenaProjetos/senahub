import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { OpcaoSeletor } from "@/components/ui/seletor-multiplo-filtro";

/**
 * Pessoas internas como opções do `SeletorMultiplo`: o perfil vai no detalhe — distingue
 * homônimos e entra na busca ("pj" acha os projetistas).
 */
export function opcoesDePessoas(pessoas: readonly { id: string; name: string; role?: string | null }[]): OpcaoSeletor[] {
  return pessoas.map((p) => ({
    id: p.id,
    rotulo: p.name,
    detalhe: p.role && p.role in ROLE_LABELS ? ROLE_LABELS[p.role as Role] : null,
  }));
}
