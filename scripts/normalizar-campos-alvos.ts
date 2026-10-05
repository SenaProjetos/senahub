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

/** Motivo no relatório do valor válido que `podeReescrever` segura. */
export const MOTIVO_NAO_LIMPO = "revisar: contém informação além do número";

/** Só dígitos e a pontuação de máscara (espaço . - / ( ) +): nada que a normalização jogaria fora. */
const SO_NUMERO_E_MASCARA = /^[0-9\s./()+-]*$/;
/** RG: dígitos com . e -, terminando opcionalmente num único X (dígito verificador). */
const RG_LIMPO = /^[0-9.-]*[0-9][.-]?[Xx]?$/;
/** Agência/conta: dígitos e ., no máximo um -, X só como último caractere. */
const AGENCIA_CONTA_LIMPA = /^[0-9.]*(-[0-9.]*)?[Xx]?$/;

const digitos = (s: string) => s.replace(/\D/g, "").length;

/**
 * O valor gravado é "limpo" — só o número com pontuação de máscara — e pode ser reescrito no
 * formato padrão? A reescrita em produção não tem volta pela tela: um valor válido que traz algo
 * além do número ("(81) 99999-9999 Maria", "1234567 SSP/PE", "013-12345-6", "50000-000 Recife")
 * seria cortado ou grudado. Esses vão para o relatório para alguém revisar pela tela.
 *
 * `tipoPix` é o `pixTipo` da linha, quando a coluna é chave PIX. E-mail e chave PIX de e-mail ou
 * aleatória seguem a regra do catálogo (a normalização só apara e põe em minúscula).
 */
export function podeReescrever(tipo: NomeCampo | "pix", original: string, tipoPix?: string | null): boolean {
  const v = original.trim();
  const efetivo = tipo === "pix" ? tipoPix : tipo;
  switch (efetivo) {
    case "cpf":
    case "cnpj":
    case "cpfCnpj":
    case "cep":
    case "chaveNfe":
      return SO_NUMERO_E_MASCARA.test(v);
    case "telefone":
      // Mais de 11 dígitos só com "+" (DDI): "5533334444 12" pode ser número + ramal.
      return SO_NUMERO_E_MASCARA.test(v) && (digitos(v) <= 11 || v.includes("+"));
    case "rg":
      return RG_LIMPO.test(v);
    case "agencia":
    case "conta":
      return /\d/.test(v) && AGENCIA_CONTA_LIMPA.test(v);
    default:
      return true;
  }
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
