import "server-only";
import { prisma } from "@/lib/prisma";
import { ehLeitura } from "@/lib/permissions-catalog";

/**
 * O **piso de sócio**: o que um sócio ativo alcança ALÉM do que o Perfil de acesso dele concede.
 *
 * `requirePermission` (`lib/session.ts`) resolve
 * `can(user, …) || (user.ehSocio && canRole("supervisor", …))`, e `canRole` lê a tabela legada
 * `Permissao` — por isso a linha do papel `supervisor` naquela tabela É o piso, literalmente.
 * Não existe outro lugar no sistema que mostre este eixo de acesso.
 *
 * Duas limitações do piso que a tela precisa dizer, porque são fonte de confusão real:
 *   - vale só em `requirePermission` (gates de PÁGINA). `defineAction` não aplica piso nenhum,
 *     então o sócio pode abrir uma tela de gestão e ser negado na ação dentro dela;
 *   - a decisão do dono de 2026-08-08 (§15.7) é que o piso é **só de leitura** — mas nada no
 *     código filtra por isso, então par de escrita na linha do `supervisor` vira piso de escrita.
 *     `escrita: true` marca exatamente esses.
 */
export type ParDoPiso = {
  recurso: string;
  acao: string;
  /** `true` = o par NÃO é de leitura, contrariando a regra de piso read-only. */
  escrita: boolean;
};

export type SocioDoPiso = {
  id: string;
  nome: string;
  /**
   * `true` = o piso é INERTE para esta pessoa. `requirePermission` resolve
   * `can(user, …) || (ehSocio && canRole(…))`, e para um superusuário o `can()` já devolve true
   * — o `||` nem chega a consultar o piso. Marcar evita ler a lista como "estas N pessoas
   * dependem do piso" quando parte delas já passa por bypass.
   */
  bypass: boolean;
};

export async function pisoDeSocio(): Promise<{ pares: ParDoPiso[]; socios: SocioDoPiso[] }> {
  const [rows, socios] = await Promise.all([
    prisma.permissao.findMany({
      where: { role: "supervisor", permitido: true },
      select: { recurso: true, acao: true },
      orderBy: [{ recurso: "asc" }, { acao: "asc" }],
    }),
    prisma.socio.findMany({
      where: { ativo: true, user: { ativo: true } },
      select: { user: { select: { id: true, name: true, superUsuario: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return {
    pares: rows.map((r) => ({ recurso: r.recurso, acao: r.acao, escrita: !ehLeitura(r.recurso, r.acao) })),
    socios: socios.map((s) => ({ id: s.user.id, nome: s.user.name, bypass: s.user.superUsuario })),
  };
}
