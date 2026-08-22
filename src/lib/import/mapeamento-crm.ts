/**
 * Auto-detecção de mapeamento de colunas da planilha → campos do CRM (F4.4).
 *
 * ⚠️ NÃO é `mapeamento.ts` com nomes trocados. Aquele arquivo é do FINANCEIRO — `CAMPOS`/
 * `CampoSenaHub`/`CAMPOS_OBRIGATORIOS` de lá são campos de `Lancamento` (data, valor, categoria…),
 * sem nada em comum com "empresa que eu quero prospectar". Reaproveitar aqueles tipos faria um
 * cabeçalho "E-mail do contato" mapear para nada, ou pior, para o campo errado por coincidência
 * de sinônimo.
 *
 * O que É reusado é o ALGORITMO — `autoMapearGenerico` (extraído de dentro de `mapeamento.ts`
 * nesta mesma tarefa): igualdade exata → fallback por inclusão → cada coluna usada uma vez.
 * Escrever esse dois-passadas de novo aqui seria a duplicação que a tarefa pede pra evitar.
 */
import { autoMapearGenerico } from "@/lib/import/mapeamento";

export type CampoCrm =
  | "empresa"
  | "documento"
  | "nomeContato"
  | "cargo"
  | "emailContato"
  | "telefone"
  | "segmento"
  | "cidade"
  | "uf"
  | "linkedinUrl"
  | "observacao";

export type CampoCrmDef = {
  campo: CampoCrm;
  label: string;
  obrigatorio: boolean;
  sinonimos: string[];
};

/**
 * O mínimo pra uma linha virar prospecção de verdade: sem nome de empresa não há o que
 * cadastrar, sem nome de contato não há quem abordar (mesmo par que `criarProspeccaoRapida`,
 * F4.3, exige — os dois "Informe o nome…" que a service lança). O resto é enriquecimento.
 */
export const CAMPOS_OBRIGATORIOS_CRM: CampoCrm[] = ["empresa", "nomeContato"];

export const CAMPOS_CRM: CampoCrmDef[] = [
  {
    campo: "empresa",
    label: "Empresa",
    obrigatorio: true,
    sinonimos: ["empresa", "nome da empresa", "razao social", "company", "companhia", "nome"],
  },
  {
    campo: "documento",
    label: "CNPJ",
    obrigatorio: false,
    sinonimos: ["cnpj", "cpf/cnpj", "cpf cnpj", "documento"],
  },
  {
    campo: "nomeContato",
    label: "Nome do contato",
    obrigatorio: true,
    sinonimos: ["nome do contato", "contato", "responsavel", "nome"],
  },
  {
    campo: "cargo",
    label: "Cargo",
    obrigatorio: false,
    sinonimos: ["cargo", "funcao", "posicao", "job title"],
  },
  {
    campo: "emailContato",
    label: "E-mail do contato",
    obrigatorio: false,
    sinonimos: ["e-mail do contato", "email do contato", "e-mail", "email"],
  },
  {
    campo: "telefone",
    label: "Telefone",
    obrigatorio: false,
    sinonimos: ["telefone", "celular", "whatsapp", "fone", "tel"],
  },
  {
    campo: "segmento",
    label: "Segmento",
    obrigatorio: false,
    sinonimos: ["segmento", "setor", "ramo", "area de atuacao", "industry"],
  },
  {
    campo: "cidade",
    label: "Cidade",
    obrigatorio: false,
    sinonimos: ["cidade", "municipio", "city"],
  },
  {
    campo: "uf",
    label: "UF",
    obrigatorio: false,
    sinonimos: ["uf", "estado", "state"],
  },
  {
    campo: "linkedinUrl",
    label: "LinkedIn / Sales Navigator",
    obrigatorio: false,
    sinonimos: ["linkedin", "sales navigator", "url linkedin", "perfil linkedin", "profile url"],
  },
  {
    campo: "observacao",
    label: "Observação",
    obrigatorio: false,
    sinonimos: ["observacao", "observacoes", "obs", "nota", "comentario"],
  },
];

/**
 * `nome` é sinônimo tanto de `empresa` quanto de `nomeContato` DE PROPÓSITO — exports reais
 * variam entre planilha-por-empresa (uma coluna "Nome" = razão social) e planilha-por-pessoa
 * (uma coluna "Nome" = quem abordar). `autoMapearGenerico` resolve a ambiguidade pela ORDEM de
 * `CAMPOS_CRM`: `empresa` vem primeiro, então uma única coluna "Nome" mapeia para empresa — e
 * `nomeContato` fica sem mapeamento automático nesse caso, o que é mais seguro que adivinhar
 * "esta pessoa é o nome da empresa" ou vice-versa. Cabe ao usuário mapear à mão o que sobrar.
 */
export function autoMapearCrm(headers: string[]): Partial<Record<CampoCrm, number>> {
  return autoMapearGenerico(headers, CAMPOS_CRM);
}
