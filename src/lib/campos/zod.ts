import { z } from "zod";
import { CAMPOS, mensagemDe, type NomeCampo, type TipoCampo } from "./index";

export type OpcoesCampo = {
  obrigatorio?: boolean;
  /** Schema de edição: o inválido passa sem mexer; a action decide com `exigirCamposValidos`. */
  legado?: boolean;
  mensagemObrigatorio?: string;
};

type Obrigatorio = OpcoesCampo & { obrigatorio: true };

function montar(tipo: TipoCampo, o: OpcoesCampo) {
  const { obrigatorio = false, legado = false, mensagemObrigatorio = "Campo obrigatório." } = o;
  return z
    // Obrigatório ausente cai aqui (não no superRefine): sem isto a frase seria a do Zod, em inglês.
    .string(obrigatorio ? { error: mensagemObrigatorio } : undefined)
    .trim()
    .superRefine((v, ctx) => {
      if (v === "") {
        if (obrigatorio) ctx.addIssue({ code: "custom", message: mensagemObrigatorio });
        return;
      }
      if (!legado && !tipo.validar(v)) ctx.addIssue({ code: "custom", message: mensagemDe(tipo, v) });
    })
    .transform((v) => (v === "" ? v : tipo.normalizar(v)));
}

/** Schema de um campo obrigatório; com `.optional()` quando o campo é opcional. */
export type EsquemaCampo = ReturnType<typeof montar>;

/**
 * Campo com formato no schema da action: apara, recusa o inválido (salvo `legado`) com a mesma
 * frase da tela e grava o formato padrão. `""` continua `""` (limpar o campo); ausente continua
 * ausente. As sobrecargas fazem o `z.object` ver a chave opcional como opcional — com um retorno
 * em união, ele a tomaria por obrigatória e quem chama a action sem ela quebraria no tipo.
 */
export function campoZod(tipo: TipoCampo, o: Obrigatorio): EsquemaCampo;
export function campoZod(tipo: TipoCampo, o?: OpcoesCampo): z.ZodOptional<EsquemaCampo>;
export function campoZod(tipo: TipoCampo, o: OpcoesCampo = {}): EsquemaCampo | z.ZodOptional<EsquemaCampo> {
  const s = montar(tipo, o);
  return o.obrigatorio ? s : s.optional();
}

export type FabricaCampo = {
  (o: Obrigatorio): EsquemaCampo;
  (o?: OpcoesCampo): z.ZodOptional<EsquemaCampo>;
};

function fabrica(tipo: TipoCampo): FabricaCampo {
  function f(o: Obrigatorio): EsquemaCampo;
  function f(o?: OpcoesCampo): z.ZodOptional<EsquemaCampo>;
  function f(o?: OpcoesCampo): EsquemaCampo | z.ZodOptional<EsquemaCampo> {
    return campoZod(tipo, o);
  }
  return f;
}

/** `campo.cpf()`, `campo.telefone({ obrigatorio: true })`… — um por campo do catálogo. */
export const campo = Object.fromEntries(
  (Object.keys(CAMPOS) as NomeCampo[]).map((nome) => [nome, fabrica(CAMPOS[nome])]),
) as Record<NomeCampo, FabricaCampo>;
