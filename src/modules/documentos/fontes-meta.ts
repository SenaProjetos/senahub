/**
 * Metadados das fontes de dados (puro — usado no editor client e no server).
 * A resolução com Prisma fica em fontes.ts (server-only).
 */

export type ParamFonte = {
  id: string;
  label: string;
  tipo: "projeto" | "cliente" | "usuario" | "mes" | "proposta";
};
export type CampoDoc = { chave: string; label: string };

export type FonteDef = {
  id: string;
  label: string;
  params: ParamFonte[];
  escalares: CampoDoc[];
  colecao: { label: string; campos: CampoDoc[] } | null;
};

export const FONTES: FonteDef[] = [
  {
    id: "empresa",
    label: "Empresa (sem parâmetros)",
    params: [],
    escalares: [
      { chave: "EmpresaNome", label: "Nome da empresa" },
      { chave: "Hoje", label: "Data de hoje" },
    ],
    colecao: null,
  },
  {
    id: "projeto",
    label: "Projeto (+ disciplinas como linhas)",
    params: [{ id: "projetoId", label: "Projeto", tipo: "projeto" }],
    escalares: [
      { chave: "Codigo", label: "Código (26-0142)" },
      { chave: "Nome", label: "Nome do projeto" },
      { chave: "Tipo", label: "Tipo (particular/licitação)" },
      { chave: "AreaM2", label: "Área (m²)" },
      { chave: "Endereco", label: "Endereço" },
      { chave: "PrazoFinal", label: "Prazo final" },
      { chave: "ClienteNome", label: "Cliente — nome" },
      { chave: "ClienteDocumento", label: "Cliente — CPF/CNPJ" },
      { chave: "ClienteEmail", label: "Cliente — e-mail" },
      { chave: "ClienteEndereco", label: "Cliente — endereço" },
    ],
    colecao: {
      label: "Disciplinas",
      campos: [
        { chave: "Disciplina", label: "Disciplina" },
        { chave: "Status", label: "Status" },
        { chave: "Prazo", label: "Prazo" },
        { chave: "Valor", label: "Valor (R$)" },
        { chave: "Responsaveis", label: "Responsáveis" },
      ],
    },
  },
  {
    id: "proposta",
    label: "Proposta comercial (+ itens como linhas)",
    params: [{ id: "propostaId", label: "Proposta", tipo: "proposta" }],
    escalares: [
      { chave: "Numero", label: "Número (PR-260001)" },
      { chave: "Titulo", label: "Título" },
      { chave: "ClienteNome", label: "Cliente — nome" },
      { chave: "ClienteDocumento", label: "Cliente — CPF/CNPJ" },
      { chave: "ClienteEndereco", label: "Cliente — endereço" },
      { chave: "AreaM2", label: "Área (m²)" },
      { chave: "Validade", label: "Validade" },
      { chave: "Total", label: "Valor total" },
      { chave: "Condicoes", label: "Condições (texto)" },
      { chave: "Observacoes", label: "Observações" },
    ],
    colecao: {
      label: "Itens da proposta",
      campos: [
        { chave: "Disciplina", label: "Disciplina" },
        { chave: "Descricao", label: "Descrição" },
        { chave: "Valor", label: "Valor" },
      ],
    },
  },
  {
    id: "extrato",
    label: "Extrato do projetista (+ pagamentos como linhas)",
    params: [{ id: "userId", label: "Projetista", tipo: "usuario" }],
    escalares: [
      { chave: "ProjetistaNome", label: "Projetista — nome" },
      { chave: "TotalPendente", label: "Total pendente" },
      { chave: "TotalPago", label: "Total pago" },
    ],
    colecao: {
      label: "Pagamentos",
      campos: [
        { chave: "Projeto", label: "Projeto" },
        { chave: "Disciplina", label: "Disciplina" },
        { chave: "Valor", label: "Valor" },
        { chave: "Status", label: "Status" },
        { chave: "LiberadoEm", label: "Liberado em" },
      ],
    },
  },
  {
    id: "lancamentos",
    label: "Lançamentos do mês (+ linhas)",
    params: [{ id: "mes", label: "Competência (AAAA-MM)", tipo: "mes" }],
    escalares: [
      { chave: "Competencia", label: "Competência" },
      { chave: "TotalReceitas", label: "Total de receitas" },
      { chave: "TotalDespesas", label: "Total de despesas" },
      { chave: "Resultado", label: "Resultado" },
    ],
    colecao: {
      label: "Lançamentos confirmados",
      campos: [
        { chave: "Data", label: "Data" },
        { chave: "Descricao", label: "Descrição" },
        { chave: "Categoria", label: "Categoria" },
        { chave: "TipoMov", label: "Tipo" },
        { chave: "Valor", label: "Valor" },
      ],
    },
  },
];

export function fonteDef(id: string | null | undefined): FonteDef | null {
  return FONTES.find((f) => f.id === id) ?? null;
}
