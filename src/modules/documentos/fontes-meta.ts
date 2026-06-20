/**
 * Metadados das fontes de dados (puro — usado no editor client e no server).
 * A resolução com Prisma fica em fontes.ts (server-only).
 */

export type ParamFonte = {
  id: string;
  label: string;
  tipo: "projeto" | "cliente" | "usuario" | "mes" | "proposta" | "licitacao" | "holerite";
};
export type CampoDoc = { chave: string; label: string };

export type FonteDef = {
  id: string;
  label: string;
  params: ParamFonte[];
  escalares: CampoDoc[];
  colecao: { label: string; campos: CampoDoc[] } | null;
  /**
   * Permissão (recurso:acao) que o usuário precisa para VER/usar esta fonte.
   * Ausente = liberada para qualquer um com acesso a documentos.
   * Aplicada no editor (listagem), no preview e na geração (server).
   */
  permissao?: { recurso: string; acao: string };
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
    permissao: { recurso: "projetos", acao: "ver" },
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
    permissao: { recurso: "comercial", acao: "ver" },
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
    permissao: { recurso: "financeiro", acao: "ver" },
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
    permissao: { recurso: "financeiro", acao: "ver" },
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
  {
    id: "cliente",
    label: "Cliente (+ projetos como linhas)",
    permissao: { recurso: "clientes", acao: "ver" },
    params: [{ id: "clienteId", label: "Cliente", tipo: "cliente" }],
    escalares: [
      { chave: "Nome", label: "Nome / razão social" },
      { chave: "NomeFantasia", label: "Nome fantasia" },
      { chave: "Documento", label: "CPF/CNPJ" },
      { chave: "Email", label: "E-mail" },
      { chave: "Telefone", label: "Telefone" },
      { chave: "Endereco", label: "Endereço" },
    ],
    colecao: {
      label: "Projetos do cliente",
      campos: [
        { chave: "Codigo", label: "Código" },
        { chave: "Projeto", label: "Projeto" },
        { chave: "Situacao", label: "Situação" },
        { chave: "PrazoFinal", label: "Prazo final" },
      ],
    },
  },
  {
    id: "licitacao",
    label: "Licitação (+ medições como linhas)",
    permissao: { recurso: "licitacoes", acao: "ver" },
    params: [{ id: "licitacaoId", label: "Licitação", tipo: "licitacao" }],
    escalares: [
      { chave: "Titulo", label: "Título" },
      { chave: "Orgao", label: "Órgão" },
      { chave: "Modalidade", label: "Modalidade" },
      { chave: "NumeroEdital", label: "Nº do edital" },
      { chave: "PrazoProposta", label: "Prazo da proposta" },
      { chave: "ValorEstimado", label: "Valor estimado" },
      { chave: "Status", label: "Status" },
      { chave: "TotalMedido", label: "Total medido" },
      { chave: "ValorHomologado", label: "Valor homologado" },
      { chave: "SaldoContratual", label: "Saldo contratual" },
      { chave: "NumeroContrato", label: "Nº do contrato" },
      { chave: "VigenciaFim", label: "Fim da vigência" },
      { chave: "TotalComposicao", label: "Total da composição" },
      { chave: "DecisaoViabilidade", label: "Decisão (go/no-go)" },
      { chave: "Vencedor", label: "Vencedor" },
      { chave: "ValorVencedor", label: "Valor do vencedor" },
      { chave: "NumeroControlePNCP", label: "Nº de controle PNCP" },
      { chave: "PublicadoPNCP", label: "Publicado no PNCP" },
    ],
    colecao: {
      label: "Medições",
      campos: [
        { chave: "Numero", label: "Nº" },
        { chave: "Descricao", label: "Descrição" },
        { chave: "Valor", label: "Valor" },
        { chave: "Data", label: "Data" },
      ],
    },
  },
  {
    id: "dre",
    label: "DRE do mês (+ categorias como linhas)",
    permissao: { recurso: "financeiro", acao: "ver" },
    params: [{ id: "mes", label: "Competência (AAAA-MM)", tipo: "mes" }],
    escalares: [
      { chave: "Competencia", label: "Competência" },
      { chave: "TotalReceitas", label: "Total de receitas" },
      { chave: "TotalDespesas", label: "Total de despesas" },
      { chave: "Resultado", label: "Resultado" },
    ],
    colecao: {
      label: "Categorias (DRE)",
      campos: [
        { chave: "Codigo", label: "Código" },
        { chave: "Categoria", label: "Categoria" },
        { chave: "Tipo", label: "Tipo (receita/despesa)" },
        { chave: "Valor", label: "Valor" },
      ],
    },
  },
  {
    id: "holerite",
    label: "Holerite (+ itens como linhas)",
    permissao: { recurso: "financeiro", acao: "ver" },
    params: [{ id: "holeriteId", label: "Holerite", tipo: "holerite" }],
    escalares: [
      { chave: "Colaborador", label: "Colaborador" },
      { chave: "Competencia", label: "Competência (MM/AAAA)" },
      { chave: "TotalProventos", label: "Total de proventos" },
      { chave: "TotalDescontos", label: "Total de descontos" },
      { chave: "Liquido", label: "Líquido" },
    ],
    colecao: {
      label: "Itens do holerite",
      campos: [
        { chave: "Descricao", label: "Descrição" },
        { chave: "TipoRubrica", label: "Tipo (provento/desconto)" },
        { chave: "Valor", label: "Valor" },
      ],
    },
  },
];

export function fonteDef(id: string | null | undefined): FonteDef | null {
  return FONTES.find((f) => f.id === id) ?? null;
}

/**
 * MULTI-COLEÇÃO — convenção de chave de PARÂMETRO por fonte na URL do preview.
 *
 * A fonte PRIMÁRIA mantém as chaves atuais (sem prefixo) p/ retrocompat. As
 * demais fontes (sub-relatórios) usam o prefixo `f_<fonteId>_<paramId>` para não
 * colidir quando duas fontes têm params homônimos (ex.: dois `mes`).
 *
 * @param fonteId   id da fonte (ex.: "licitacao").
 * @param paramId   id do parâmetro (ex.: "licitacaoId").
 * @param primaria  true → chave sem prefixo (fonte primária do modelo).
 */
export const PARAM_FONTE_PREFIX = "f_";
export function chaveParamFonte(fonteId: string, paramId: string, primaria: boolean): string {
  return primaria ? paramId : `${PARAM_FONTE_PREFIX}${fonteId}_${paramId}`;
}
