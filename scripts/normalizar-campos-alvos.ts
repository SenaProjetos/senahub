import type { NomeCampo } from "../src/lib/campos";

/** Colunas que o `normalizar-campos.ts` reescreve no formato padrão (spec 2026-10-04 §6). */
export type Alvo = {
  /** Nome do model no `schema.prisma` (delegate do Prisma em minúscula inicial). */
  modelo: string;
  colunas: Record<string, NomeCampo | "pix">;
  /** Colunas com `@unique`: colisão depois de normalizar não é gravada, vai para o relatório. */
  unicas?: string[];
  /**
   * Model com lixeira (`excluidoEm`, filtro automático em `lib/prisma.ts`): o script lê também os
   * excluídos, para um registro restaurado depois não voltar no formato antigo.
   */
  lixeira?: true;
};

export const ALVOS: readonly Alvo[] = [
  { modelo: "User", colunas: { cpf: "cpf", rg: "rg", enderecoCep: "cep", telefone: "telefone", telefoneEmergencia: "telefone", emailPessoal: "email" } },
  { modelo: "ContaBancariaColaborador", colunas: { agencia: "agencia", conta: "conta", pixChave: "pix" } },
  // `documento` do cliente fica fora: é gravado só com dígitos (unicidade do ADR-03 do CRM) — ver SO_RELATORIO.
  { modelo: "Cliente", colunas: { email: "email", telefone: "telefone", cep: "cep" }, lixeira: true },
  { modelo: "ContatoCliente", colunas: { email: "email", telefone: "telefone" }, lixeira: true },
  { modelo: "ContaBancaria", colunas: { agencia: "agencia" } },
  { modelo: "Fornecedor", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" } },
  { modelo: "CustoFornecedor", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" } },
  { modelo: "CustoFornecedorRepresentante", colunas: { email: "email", telefone: "telefone" } },
  { modelo: "Parceiro", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" }, lixeira: true },
  { modelo: "PessoaJuridica", colunas: { cnpj: "cnpj", email: "email", telefone: "telefone" }, unicas: ["cnpj"] },
  { modelo: "Lead", colunas: { email: "email", telefone: "telefone" }, lixeira: true },
  { modelo: "SolicitacaoCadastro", colunas: { telefone: "telefone" } },
  { modelo: "LinkPublicoAssinatura", colunas: { email: "email" } },
  { modelo: "Dependente", colunas: { cpf: "cpf" } },
  { modelo: "Lancamento", colunas: { chaveNfe: "chaveNfe" }, lixeira: true },
];

/** Motivo no relatório do valor que `podeJuntarInformacoes` segura. */
export const MOTIVO_JUNTAR = "revisar: pode juntar duas informações";

/**
 * RG, agência e conta com espaço ou "/" entre partes (ex.: "1234567 SSP/PE", "013 12345-6"):
 * normalizar juntaria o número com outra informação (órgão emissor, operação) num texto só, sem
 * volta. O script não reescreve; manda para o relatório para alguém revisar pela tela.
 */
export function podeJuntarInformacoes(tipo: NomeCampo | "pix", valor: string): boolean {
  if (tipo !== "rg" && tipo !== "agencia" && tipo !== "conta") return false;
  return /[0-9A-Za-z][\s/]+[0-9A-Za-z]/.test(valor);
}

/**
 * Só relatório (lista o inválido, nunca reescreve):
 * - `AceiteExternoDocumento.cpf`: a prova do aceite guarda o CPF como foi aceito (spec §6).
 * - `Cliente.documento`: gravado só com dígitos de propósito (spec §10, ADR-03 do CRM).
 */
export const SO_RELATORIO: readonly Alvo[] = [
  { modelo: "AceiteExternoDocumento", colunas: { cpf: "cpf" } },
  { modelo: "Cliente", colunas: { documento: "cpfCnpj" }, lixeira: true },
];
