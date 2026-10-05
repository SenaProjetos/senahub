import { ActionError } from "@/lib/action-error";
import { CAMPOS, mensagemDe, mesmoValor, type NomeCampo } from "./index";

/**
 * Regra de edição (spec D4): o inválido que já estava gravado passa; o inválido novo é recusado
 * com a mensagem no campo. "Igual" = mesmo texto, ou mesma essência não vazia (o legado
 * `12345678900` exibido como `123.456.789-00` pela máscara conta como não mexido).
 *
 * Uso no handler de uma action de editar, com o schema em `campo.x({ legado: true })`:
 *   const antes = await prisma.cliente.findUnique({ where: { id: i.id }, select: { documento: true } });
 *   exigirCamposValidos(i, antes, { documento: "cpfCnpj" });
 */
export function exigirCamposValidos(
  novo: Record<string, unknown>,
  antes: Record<string, unknown> | null | undefined,
  mapa: Record<string, NomeCampo>,
): void {
  const campos: Record<string, string> = {};
  for (const [chave, nome] of Object.entries(mapa)) {
    const v = novo[chave];
    if (typeof v !== "string" || v.trim() === "") continue;
    const tipo = CAMPOS[nome];
    if (tipo.validar(v)) continue;
    const gravado = antes?.[chave];
    if (typeof gravado === "string" && mesmoValor(tipo, v, gravado)) continue;
    campos[chave] = mensagemDe(tipo, v);
  }
  const primeira = Object.values(campos)[0];
  if (primeira) throw new ActionError(primeira, campos);
}
