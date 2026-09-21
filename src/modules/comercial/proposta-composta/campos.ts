import { diasComExtenso, extensoMoeda } from "@/lib/extenso";
import {
  mensagemTokensNaoResolvidos,
  tokensNaoResolvidos,
  type CampoContrato,
  type TokenNaoResolvido,
} from "@/modules/juridico/contrato/campos";
import { extrairTokens, resolverTexto, splitFormato, type Escalar } from "@/modules/documentos/tokens";
import { arredondarMoeda } from "../honorarios";

/**
 * Campos que o texto de uma cláusula da proposta pode citar (`[Cidade]`, `[TotalExtenso]`…) e a
 * regra de resolvê-los — puro, sem I/O.
 *
 * Reusa o motor de tokens do Estúdio (`resolverTexto`) e o bloqueio de token sem valor do módulo
 * de contratos: o motor devolve string VAZIA para token desconhecido ou nulo, e numa proposta que
 * o cliente lê isso vira "obra em , " ou "no valor de  ()". Então, como nos contratos, **texto que
 * cita um campo sem valor não é gerado**: a validação vem antes da renderização.
 *
 * Dados da empresa (telefone, e-mail, banco, PIX, assinatura) NÃO estão aqui — nunca entram no
 * texto de cláusula; são lidos de `empresa.dados` na hora de imprimir (ADR-0006).
 */

export const CAMPOS_PROPOSTA: CampoContrato[] = [
  { chave: "Numero", label: "Número da proposta" },
  { chave: "Cliente", label: "Nome do cliente" },
  { chave: "Titulo", label: "Título da proposta" },
  { chave: "ObraEndereco", label: "Endereço da obra" },
  { chave: "Cidade", label: "Cidade da obra" },
  { chave: "UF", label: "UF da obra" },
  { chave: "AreaM2", label: "Área da obra (m²)" },
  { chave: "Total", label: "Valor total" },
  { chave: "TotalExtenso", label: "Valor total por extenso" },
  { chave: "ValidadeDias", label: "Validade (dias)" },
  { chave: "ValidadeExtenso", label: "Validade por extenso" },
];

export type DadosDaProposta = {
  numero?: string | null;
  cliente?: string | null;
  titulo?: string | null;
  obraEndereco?: string | null;
  obraCidade?: string | null;
  obraUF?: string | null;
  areaM2?: number | null;
  /** Valor final, já com desconto, em reais. */
  total?: number | null;
  validadeDias?: number | null;
};

const texto = (v: string | null | undefined) => (v && v.trim() !== "" ? v.trim() : null);

/**
 * Monta o `escalar` do motor a partir dos dados da proposta. Dado ausente vira `null` (e não `""`
 * nem `0`): é o `null` que o bloqueio reconhece como "falta preencher".
 *
 * `Total` fica numérico para o motor formatar (`[Total:c2]`); `TotalExtenso` é calculado daqui.
 */
export function escalaresDaProposta(d: DadosDaProposta): Escalar {
  const total = d.total != null && Number.isFinite(d.total) && d.total > 0 ? arredondarMoeda(d.total) : null;
  const validade = d.validadeDias != null && Number.isInteger(d.validadeDias) && d.validadeDias > 0 ? d.validadeDias : null;
  const area = d.areaM2 != null && Number.isFinite(d.areaM2) && d.areaM2 > 0 ? d.areaM2 : null;
  const uf = texto(d.obraUF)?.toUpperCase() ?? null;

  return {
    Numero: texto(d.numero),
    Cliente: texto(d.cliente),
    Titulo: texto(d.titulo),
    ObraEndereco: texto(d.obraEndereco),
    Cidade: texto(d.obraCidade),
    UF: uf,
    AreaM2: area,
    Total: total,
    TotalExtenso: total !== null ? extensoMoeda(total) : null,
    ValidadeDias: validade,
    ValidadeExtenso: validade !== null ? diasComExtenso(validade) : null,
  };
}

/**
 * Tokens que o texto cita e não têm valor (ou não existem no catálogo).
 *
 * Fecha um buraco que o bloqueio de contratos deixa: ele casa o catálogo sem diferenciar
 * maiúscula, mas o motor resolve por chave EXATA — então `[cidade]` passava na validação e saía
 * em branco. Aqui, token com a caixa diferente da do catálogo é reportado como inexistente.
 */
export function tokensNaoResolvidosProposta(textoCla: string, escalar: Escalar): TokenNaoResolvido[] {
  const chaves = new Set(CAMPOS_PROPOSTA.map((c) => c.chave));
  const caixaErrada: TokenNaoResolvido[] = [];
  const vistos = new Set<string>();

  for (const bruto of extrairTokens(textoCla)) {
    if (/^\s*=/.test(bruto)) continue;
    const [expr] = splitFormato(bruto);
    const chave = expr.includes(".") ? expr.split(".").pop()! : expr;
    if (!chave || vistos.has(chave)) continue;
    const canonica = CAMPOS_PROPOSTA.find((c) => c.chave.toLowerCase() === chave.toLowerCase());
    if (canonica && !chaves.has(chave)) {
      vistos.add(chave);
      caixaErrada.push({ token: `${expr} (o campo é [${canonica.chave}])`, motivo: "desconhecido" });
    }
  }

  const demais = tokensNaoResolvidos(textoCla, escalar, CAMPOS_PROPOSTA).filter(
    (t) => !caixaErrada.some((c) => c.token.startsWith(`${t.token} `)),
  );
  return [...caixaErrada, ...demais];
}

export type ResultadoTexto = { ok: true; texto: string } | { ok: false; mensagem: string; problemas: TokenNaoResolvido[] };

/**
 * Resolve o texto de uma cláusula, ou recusa. Nunca devolve texto com lacuna: se algum token
 * citado não tem valor, o resultado é `ok: false` com a mensagem pt-BR pronta para a tela.
 */
export function resolverTextoProposta(textoCla: string, escalar: Escalar): ResultadoTexto {
  const problemas = tokensNaoResolvidosProposta(textoCla, escalar);
  if (problemas.length > 0) return { ok: false, problemas, mensagem: mensagemTokensNaoResolvidos(problemas) };
  return { ok: true, texto: resolverTexto(textoCla, { escalar, linhas: [] }) };
}
