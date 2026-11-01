import { can, type SubjectAutorizacao } from "@/lib/permissions";

/**
 * Quem vê o custo das horas em reais (rateio, horas por disciplina): admin (superusuário) e sócios
 * (decisão 26 do spec 2026-09-15-rateio-horas-decisoes.md); qualquer outro só com `ponto:custo`
 * concedido pessoa a pessoa. Nenhum perfil nasce com o par. Ver horas é outra coisa (`ponto:rateio`).
 */
export async function podeVerCusto(u: SubjectAutorizacao & { ehSocio: boolean }): Promise<boolean> {
  if (u.superUsuario || u.ehSocio) return true;
  return can(u, "ponto", "custo");
}
