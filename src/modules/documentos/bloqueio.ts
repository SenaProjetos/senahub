/**
 * Bloqueio de geração por campo vazio — puro (spec
 * `docs/superpowers/specs/2026-08-27-contratos-no-estudio.md`, Fase E4 / M1).
 *
 * `resolverTexto` (motor de tokens) devolve string VAZIA tanto para token DESCONHECIDO quanto
 * para valor NULO — comportamento correto para um relatório gerencial (célula vazia é célula
 * vazia), errado para um documento assinável (`[Salario]` vazio vira "salário de R$ ", que é
 * entregável e por isso pior que um erro). `bloquearCamposVazios` é o opt-in que liga esta
 * checagem só onde faz sentido — a maioria dos modelos do Estúdio não deve bloquear nada.
 *
 * ## Escopo desta fase (deliberadamente menor que o caso geral)
 *
 * - Só verifica a fonte PRIMÁRIA do modelo. Elemento cujo `banda.fonteId` aponta para uma
 *   SUB-fonte (multi-coleção) não é conferido — cada sub-fonte teria seu próprio catálogo e
 *   escalar, e cobrir isso é trabalho de uma fase própria, não deste bloqueio simples.
 * - Elemento do tipo `tabela` fica de fora: `colunas[].campo` resolve por LINHA da coleção, não
 *   pelo escalar — célula vazia numa linha específica é um problema de dado da linha, não de
 *   token mal citado.
 * - **Elemento com `condicao` está ISENTO.** Quem colocou uma condição (ex.:
 *   `naoVazio([ClausulasAdicionais])`) já assumiu a responsabilidade de tratar a ausência —
 *   bloquear por cima disso seria travar exatamente o mecanismo desenhado para permitir campo
 *   opcional (mesmo princípio da Fase E3: "cita → precisa ter valor" continua valendo para quem
 *   NÃO usou o mecanismo de escape que o Estúdio já oferece).
 */

import { extrairTokens, splitFormato, type Escalar } from "@/modules/documentos/tokens";
import { fonteDef, type CampoDoc } from "@/modules/documentos/fontes-meta";
import type { DocSchema } from "@/modules/documentos/schema";

export type MotivoBloqueio = "desconhecido" | "vazio";
export type CampoBloqueado = { token: string; motivo: MotivoBloqueio; label?: string };

const BUILTINS = /^(pagina|paginas|grupo|hoje)$/i;
const RE_AGREGADO = /^(Sum|Count|Avg|Min|Max)\(/i;

/** Textos citáveis: elementos sem `condicao`, sem contar `tabela` (token de linha, não escalar). */
function textosCitaveis(schema: DocSchema): string[] {
  const out: string[] = [];
  for (const banda of schema.bandas) {
    // Banda com fonte PRÓPRIA (multi-coleção) fica fora do escopo desta fase — ver o comentário
    // do arquivo. `fonteId` ausente/"" = usa a fonte primária, então essas entram normalmente.
    if (banda.fonteId) continue;
    for (const el of banda.elementos) {
      if (el.condicao) continue;
      if (el.tipo === "tabela") continue;
      if (el.texto) out.push(el.texto);
    }
  }
  return out;
}

/**
 * Campos citados que ficariam vazios ou desconhecidos, se o modelo pediu bloqueio.
 *
 * `[]` quando `bloquearCamposVazios` não está ligado — chamar isto sempre é seguro e barato; o
 * early-return é o que mantém a imensa maioria dos modelos (que nunca ligam a flag) sem custo
 * nenhum.
 */
export function camposBloqueados(
  schema: DocSchema,
  fontePrimaria: string | null | undefined,
  escalarPrimaria: Escalar,
): CampoBloqueado[] {
  if (schema.pagina.bloquearCamposVazios !== true) return [];

  const def = fonteDef(fontePrimaria);
  const catalogo: CampoDoc[] = def?.escalares ?? [];
  const porChave = new Map(catalogo.map((c) => [c.chave.toLowerCase(), c]));

  const achados: CampoBloqueado[] = [];
  const vistos = new Set<string>();

  for (const texto of textosCitaveis(schema)) {
    for (const bruto of extrairTokens(texto)) {
      if (/^\s*=/.test(bruto)) continue; // calculado — os tokens internos já aparecem soltos
      const [expr] = splitFormato(bruto);
      if (!expr || BUILTINS.test(expr) || RE_AGREGADO.test(expr)) continue;

      const chave = expr.includes(".") ? expr.split(".").pop()! : expr;
      if (vistos.has(chave.toLowerCase())) continue;
      vistos.add(chave.toLowerCase());

      const campo = porChave.get(chave.toLowerCase());
      if (!campo) {
        achados.push({ token: expr, motivo: "desconhecido" });
        continue;
      }

      const valor = escalarPrimaria[campo.chave];
      if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) {
        achados.push({ token: expr, motivo: "vazio", label: campo.label });
      }
    }
  }

  return achados;
}

/** Mensagem pt-BR pronta para o usuário — separa erro de modelo de falta de dado. */
export function mensagemCamposBloqueados(itens: CampoBloqueado[]): string {
  const desconhecidos = itens.filter((i) => i.motivo === "desconhecido").map((i) => `[${i.token}]`);
  const vazios = itens.filter((i) => i.motivo === "vazio").map((i) => i.label ?? i.token);
  const partes: string[] = [];
  if (desconhecidos.length > 0) partes.push(`Campo inexistente na fonte: ${desconhecidos.join(", ")}.`);
  if (vazios.length > 0) partes.push(`Sem dado para preencher: ${vazios.join(", ")}.`);
  return partes.join(" ");
}
