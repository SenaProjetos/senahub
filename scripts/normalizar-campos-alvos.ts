import { CAMPOS, type NomeCampo } from "../src/lib/campos";
import { campoPix } from "../src/lib/campos/chave-pix";
import { TIPOS_PIX, type TipoPix } from "../src/modules/rh/contas/pix";

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

/** Motivo no relatório do valor que não é limpo (`podeReescrever` = `limpo` do catálogo). */
export const MOTIVO_NAO_LIMPO = "revisar: contém informação além do número";

/**
 * O valor gravado é "limpo" — só o valor com a pontuação da máscara — e pode ser reescrito no
 * formato padrão? A regra é a do catálogo (`TipoCampo.limpo`), a mesma que faz a tela e as actions
 * tratarem esse valor como "inválido não mexido": um valor com algo além do número ("(81) 99999-9999
 * Maria", "1234567 SSP/PE", "013-12345-6", "3333-4444 12") seria cortado ou grudado, então vai para
 * o relatório para alguém revisar pela tela.
 *
 * `tipoPix` é o `pixTipo` da linha, quando a coluna é chave PIX; sem tipo conhecido, quem decide é
 * o script (relata "Chave PIX sem tipo").
 */
export function podeReescrever(tipo: NomeCampo | "pix", original: string, tipoPix?: string | null): boolean {
  if (tipo !== "pix") return CAMPOS[tipo].limpo(original);
  if (!tipoPix || !(TIPOS_PIX as readonly string[]).includes(tipoPix)) return true;
  return campoPix(tipoPix as TipoPix).limpo(original);
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
