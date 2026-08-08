/**
 * Regra de "cadastro completo" — **pura, sem I/O**, mesma família de `health.ts`/`aquisitivo.ts`.
 * Substitui a checagem antiga (só CPF + data de admissão) por uma lista de campos por
 * CONTRATAÇÃO, com fallback em `role` para quem ainda não tem `Vinculo` (mesmo padrão
 * documentado em `modules/ponto/apuracao.ts`).
 *
 * Buckets:
 * - **CLT / estágio**: vínculo empregatício pleno — inclui admissão, salário e ≥1 conta.
 * - **PJ**: só exige PJ vinculada quem realmente fatura por CNPJ (`contratacao === "pj"`);
 *   autônomo/RPA é pessoa física por definição, então não tem CNPJ a exigir.
 * - **Autônomo (RPA) / pró-labore (sócio)**: identidade + contato + cargo + conta, sem
 *   admissão/salário — RPA e pró-labore não passam por `User.salarioBase` (ver `Vinculo.remuneracao`).
 * - **Sem contratação** (admin sem vínculo, ou ainda não migrado e o `role` também não mapeia):
 *   só o mínimo universal — nome completo e CPF.
 * - **Cliente / externo**: nunca incompleto.
 */
import type { Contratacao } from "@/generated/prisma/client";
import type { Role } from "@/lib/roles";
import { CADASTRO_ROLES } from "@/lib/roles";
import { derivarEixos } from "@/modules/usuarios/vinculo/mapa";

export type CampoFaltante = { campo: string; label: string };

export type EntradaCompletude = {
  role: Role;
  /** `null` = ainda não migrado pelo backfill de vínculos; cai no fallback por `role`. */
  contratacao: Contratacao | null;
  nomeCompleto: string | null;
  cpf: string | null;
  rg: string | null;
  dataNascimento: string | null;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoBairro: string | null;
  enderecoCidade: string | null;
  enderecoUf: string | null;
  telefone: string | null;
  dataAdmissao: string | null;
  cargoId: string | null;
  departamentoId: string | null;
  /** Existência do salário — só é significativa quando `avaliarFolha` (ver abaixo). */
  temSalario: boolean;
  pjId: string | null;
  contasBancariasAtivas: number;
  /**
   * `false` quando quem está montando esta entrada não tem `rh:folha` (não conseguiu nem
   * consultar salário/contas). Nesse caso salário e conta bancária SAEM da lista de
   * obrigatórios — não porque deixaram de ser exigidos, mas porque este viewer não pode
   * verificá-los nem corrigi-los. Evita dois efeitos ruins: reportar "faltando" um dado que só
   * está oculto, ou (pior) inferir a partir do booleano se o salário está ou não preenchido
   * para quem não tem autorização de vê-lo.
   */
  avaliarFolha: boolean;
};

const preenchido = (v: string | null | undefined) => !!v?.trim();

/** Todos os pedaços do endereço — "Endereço completo" aparece como um item só na lista. */
function enderecoCompleto(e: EntradaCompletude): boolean {
  return (
    preenchido(e.enderecoCep) &&
    preenchido(e.enderecoLogradouro) &&
    preenchido(e.enderecoNumero) &&
    preenchido(e.enderecoBairro) &&
    preenchido(e.enderecoCidade) &&
    preenchido(e.enderecoUf)
  );
}

/** Contratação efetiva: a do vínculo se já migrado, senão a derivada do `role` legado. */
function contratacaoEfetiva(e: EntradaCompletude): Contratacao | null {
  return e.contratacao ?? derivarEixos(e.role).contratacao;
}

/**
 * Lista de campos obrigatórios vazios, na ordem em que aparecem no formulário. Vazio = cadastro
 * completo. `role` fora de `CADASTRO_ROLES` (cliente, ti) nunca entra aqui — quem chama já
 * filtra, mas a função também não falha se vier: só devolve `[]`.
 */
export function camposFaltantes(e: EntradaCompletude): CampoFaltante[] {
  if (!CADASTRO_ROLES.includes(e.role)) return [];

  const faltam: CampoFaltante[] = [];
  const add = (cond: boolean, campo: string, label: string) => {
    if (cond) faltam.push({ campo, label });
  };

  // Universal a todo mundo com cadastro, seja qual for a contratação.
  add(!preenchido(e.nomeCompleto), "nomeCompleto", "Nome completo");
  add(!preenchido(e.cpf), "cpf", "CPF");

  const contratacao = contratacaoEfetiva(e);

  if (contratacao === "clt" || contratacao === "estagio") {
    add(!preenchido(e.rg), "rg", "RG");
    add(!preenchido(e.dataNascimento), "dataNascimento", "Data de nascimento");
    add(!enderecoCompleto(e), "endereco", "Endereço completo");
    add(!preenchido(e.telefone), "telefone", "Telefone");
    add(!preenchido(e.dataAdmissao), "dataAdmissao", "Data de admissão");
    add(!e.cargoId, "cargoId", "Cargo");
    add(!e.departamentoId, "departamentoId", "Departamento");
    if (e.avaliarFolha) {
      add(!e.temSalario, "salario", "Salário");
      add(e.contasBancariasAtivas === 0, "contaBancaria", "Conta bancária");
    }
    return faltam;
  }

  if (contratacao === "pj" || contratacao === "autonomo_rpa") {
    add(!preenchido(e.telefone), "telefone", "Telefone");
    add(!enderecoCompleto(e), "endereco", "Endereço completo");
    add(!e.cargoId, "cargoId", "Cargo");
    // Só quem fatura por CNPJ precisa de PJ vinculada — RPA é pessoa física, sem CNPJ a exigir.
    if (contratacao === "pj") add(!e.pjId, "pjId", "Pessoa Jurídica vinculada");
    if (e.avaliarFolha) add(e.contasBancariasAtivas === 0, "contaBancaria", "Conta bancária");
    return faltam;
  }

  if (contratacao === "pro_labore") {
    add(!preenchido(e.telefone), "telefone", "Telefone");
    add(!enderecoCompleto(e), "endereco", "Endereço completo");
    add(!e.cargoId, "cargoId", "Cargo");
    if (e.avaliarFolha) add(e.contasBancariasAtivas === 0, "contaBancaria", "Conta bancária");
    return faltam;
  }

  // Sem contratação mapeável (admin sem vínculo, por exemplo): só o mínimo universal acima.
  return faltam;
}

/** Atalho: só interessa se falta algo, sem montar a lista. */
export function cadastroIncompleto(e: EntradaCompletude): boolean {
  return camposFaltantes(e).length > 0;
}
