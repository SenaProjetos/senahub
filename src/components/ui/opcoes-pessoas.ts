import type { OpcaoSeletor } from "@/components/ui/seletor-multiplo-filtro";
import type { Contratacao } from "@/generated/prisma/enums";
import { rotuloContratacao } from "@/modules/usuarios/vinculo/labels";

/**
 * Pessoas internas como opções do `SeletorMultiplo`: a contratação vai no detalhe — distingue
 * homônimos e entra na busca ("PJ" acha os prestadores).
 */
export function opcoesDePessoas(
  pessoas: readonly { id: string; name: string; contratacao?: Contratacao | null }[],
): OpcaoSeletor[] {
  return pessoas.map((p) => ({
    id: p.id,
    rotulo: p.name,
    detalhe: p.contratacao ? rotuloContratacao(p.contratacao) : null,
  }));
}
