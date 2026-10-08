/**
 * "Atualize seus dados" — regras puras do preenchimento pedido pelo RH (decisões de 2026-10-08):
 *
 * - A pessoa PREENCHE campo vazio do próprio cadastro; ALTERAR o que já existe continua no fluxo
 *   da Fase 4 (proposta + aprovação do RH).
 * - Vazio e não sensível → vale direto (auditado). Sensível (CPF, RG) → vai para a aprovação do
 *   RH mesmo vazio. Conta bancária tem fluxo próprio (proposta de conta).
 * - Salário, cargo, departamento, admissão e PJ vinculada nunca: não é a pessoa quem informa.
 *
 * "O que falta" vem de `camposFaltantes` (completude.ts), a mesma regra do selo de cadastro
 * incompleto — o pedido não guarda lista própria.
 *
 * Pura e client-safe: a tela monta o formulário com as mesmas definições que a action valida.
 */
import { ActionError } from "@/lib/action-error";
import { CAMPOS, type NomeCampo } from "@/lib/campos";
import { exigirCamposValidos } from "@/lib/campos/exigir";
import { UFS } from "@/modules/usuarios/registro";

export type TipoEntrada = "texto" | "data" | "uf";

export type CampoPreenchivel = {
  campo: string;
  label: string;
  /** Chave de `camposFaltantes` que este campo resolve (endereço = vários campos, uma chave). */
  faltante: string;
  sensivel: boolean;
  formato?: NomeCampo;
  tipo: TipoEntrada;
  /** Não conta para "falta algo" (complemento do endereço). */
  opcional?: boolean;
};

export const CAMPOS_PREENCHIVEIS: readonly CampoPreenchivel[] = [
  { campo: "nomeCompleto", label: "Nome completo", faltante: "nomeCompleto", sensivel: false, tipo: "texto" },
  { campo: "cpf", label: "CPF", faltante: "cpf", sensivel: true, formato: "cpf", tipo: "texto" },
  { campo: "rg", label: "RG", faltante: "rg", sensivel: true, formato: "rg", tipo: "texto" },
  { campo: "dataNascimento", label: "Data de nascimento", faltante: "dataNascimento", sensivel: false, tipo: "data" },
  { campo: "telefone", label: "Telefone", faltante: "telefone", sensivel: false, formato: "telefone", tipo: "texto" },
  { campo: "enderecoCep", label: "CEP", faltante: "endereco", sensivel: false, formato: "cep", tipo: "texto" },
  { campo: "enderecoLogradouro", label: "Logradouro", faltante: "endereco", sensivel: false, tipo: "texto" },
  { campo: "enderecoNumero", label: "Número", faltante: "endereco", sensivel: false, tipo: "texto" },
  { campo: "enderecoComplemento", label: "Complemento", faltante: "endereco", sensivel: false, tipo: "texto", opcional: true },
  { campo: "enderecoBairro", label: "Bairro", faltante: "endereco", sensivel: false, tipo: "texto" },
  { campo: "enderecoCidade", label: "Cidade", faltante: "endereco", sensivel: false, tipo: "texto" },
  { campo: "enderecoUf", label: "UF", faltante: "endereco", sensivel: false, tipo: "uf" },
];

const POR_CAMPO = new Map(CAMPOS_PREENCHIVEIS.map((c) => [c.campo, c]));
export const LABEL_PREENCHIVEL: Record<string, string> = Object.fromEntries(CAMPOS_PREENCHIVEIS.map((c) => [c.campo, c.label]));

/** Faltantes que só o RH completa — a pessoa vê a lista, mas não preenche. */
export const SO_RH = new Set(["dataAdmissao", "cargoId", "departamentoId", "salario", "pjId"]);

const vazio = (v: string | null | undefined) => !v || !v.trim();

export type Faltante = { campo: string; label: string };

export type SituacaoPreenchimento = {
  /** Campos que a pessoa pode preencher agora (vazios, sem proposta pendente). */
  aPreencher: CampoPreenchivel[];
  /** Preenchidos pela pessoa, esperando o RH (CPF, RG). */
  aguardandoRh: string[];
  /** `falta` = sem conta e sem proposta; `aguardando` = proposta de conta pendente. */
  contaBancaria: "falta" | "aguardando" | null;
  /** O que falta e só o RH completa (rótulos). */
  soRh: string[];
  /** Quanto ainda depende da pessoa (obrigatórios a preencher + conta que falta). 0 = pedido atendido. */
  pendenteDaPessoa: number;
};

export function situacaoDoPreenchimento(
  faltantes: readonly Faltante[],
  atual: Readonly<Record<string, string | null | undefined>>,
  pendentes: ReadonlySet<string>,
  contaPendente: boolean,
): SituacaoPreenchimento {
  const chaves = new Set(faltantes.map((f) => f.campo));
  const aPreencher = CAMPOS_PREENCHIVEIS.filter((c) => chaves.has(c.faltante) && vazio(atual[c.campo]) && !pendentes.has(c.campo));
  const aguardandoRh = CAMPOS_PREENCHIVEIS.filter((c) => pendentes.has(c.campo) && vazio(atual[c.campo])).map((c) => c.label);
  const contaBancaria = chaves.has("contaBancaria") ? (contaPendente ? "aguardando" : "falta") : null;
  const soRh = faltantes.filter((f) => SO_RH.has(f.campo)).map((f) => f.label);
  const pendenteDaPessoa = aPreencher.filter((c) => !c.opcional).length + (contaBancaria === "falta" ? 1 : 0);
  return { aPreencher, aguardandoRh, contaBancaria, soRh, pendenteDaPessoa };
}

/** Há algo que a PESSOA possa fazer? Sem isso o RH não pede (nada a pedir). */
export function temAlgoAPedir(s: SituacaoPreenchimento): boolean {
  return s.pendenteDaPessoa > 0;
}

export const MOTIVO_NADA_A_PREENCHER = "Preencha pelo menos um campo.";
export const MOTIVO_NADA_A_PEDIR =
  "Não há nada que a pessoa possa preencher: o cadastro está completo, ou o que falta só o RH completa.";
export const MOTIVO_PEDIDO_ABERTO = "Já existe um pedido aberto para esta pessoa.";

/**
 * Valida e separa o que a pessoa mandou: o que vale direto (`aplicar`) e o que vai para o RH
 * (`aprovar`). Só entra campo da lista E vazio no cadastro — preenchido segue o fluxo de alteração.
 * Erro de formato volta no campo (`ActionError` com `campos`), como em todo formulário.
 */
export function planoDePreenchimento(
  valores: Readonly<Record<string, string>>,
  atual: Readonly<Record<string, string | null | undefined>>,
  hoje: string,
): { aplicar: Record<string, string>; aprovar: Record<string, string> } {
  const limpo: Record<string, string> = {};
  for (const [campo, v] of Object.entries(valores)) {
    if (!POR_CAMPO.has(campo) || typeof v !== "string" || !v.trim()) continue;
    if (!vazio(atual[campo])) continue;
    limpo[campo] = v.trim();
  }

  const mapa: Record<string, NomeCampo> = {};
  for (const c of CAMPOS_PREENCHIVEIS) if (c.formato && limpo[c.campo]) mapa[c.campo] = c.formato;
  exigirCamposValidos(limpo, null, mapa);

  const erros: Record<string, string> = {};
  for (const [campo, v] of Object.entries(limpo)) {
    const def = POR_CAMPO.get(campo)!;
    if (def.formato) limpo[campo] = CAMPOS[def.formato].normalizar(v);
    if (def.tipo === "data") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) erros[campo] = "Data inválida.";
      else if (v < "1900-01-01" || v > hoje) erros[campo] = "A data precisa estar entre 1900 e hoje.";
    }
    if (def.tipo === "uf") {
      const uf = v.toUpperCase();
      if (!(UFS as readonly string[]).includes(uf)) erros[campo] = "UF inválida.";
      else limpo[campo] = uf;
    }
    if (def.tipo === "texto" && !def.formato && v.length > 200) erros[campo] = "Texto longo demais para este campo.";
  }
  const primeiro = Object.values(erros)[0];
  if (primeiro) throw new ActionError(primeiro, erros);
  if (Object.keys(limpo).length === 0) throw new ActionError(MOTIVO_NADA_A_PREENCHER);

  const aplicar: Record<string, string> = {};
  const aprovar: Record<string, string> = {};
  for (const [campo, v] of Object.entries(limpo)) (POR_CAMPO.get(campo)!.sensivel ? aprovar : aplicar)[campo] = v;
  return { aplicar, aprovar };
}

/** Texto da faixa no topo. Prazo vencido = destaque (nunca bloqueia). */
export function textoDaFaixa(pendentes: number, prazo: string | null, hoje: string): { texto: string; vencido: boolean } {
  const vencido = !!prazo && prazo < hoje;
  const quanto = pendentes === 1 ? "falta 1 informação" : `faltam ${pendentes} informações`;
  const quando = prazo ? (vencido ? " O prazo já passou." : ` Prazo: ${prazo.slice(8, 10)}/${prazo.slice(5, 7)}.`) : "";
  return { texto: `O RH pediu para você completar seus dados: ${quanto}.${quando}`, vencido };
}
