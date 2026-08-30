/**
 * Catálogo de recursos:ações sujeitos à permissão fina.
 * Cresce a cada onda conforme novos módulos entram. A matriz de permissões
 * (Configurações → Permissões) é montada a partir daqui.
 */
export type AcaoCatalogo = {
  acao: string;
  label: string;
  /**
   * Ação de LEITURA (não muda estado de negócio). Marcada **explicitamente**, e o default é
   * `false` — fail-closed: uma ação nova que ninguém classificou não vira leitura por descuido.
   *
   * Existe por causa do piso de sócio (§15.7 do plano de Setor × Contratação × Perfil):
   * decisão do dono em 2026-08-08 é que o piso é **só de leitura**, alinhado ao que
   * `roles.ts` já dizia ("nunca use para gates de escrita/destrutivos"). `backfill-perfis-acesso.ts`
   * só materializa override de piso onde `leitura === true`.
   *
   * Casos de fronteira decididos como NÃO-leitura, de propósito:
   *   - `documentos:ver` — "ver e **gerar**" documentos; gerar persiste arquivo.
   *   - `ferramentas:usar` — "usar e **salvar** cálculos".
   */
  leitura?: boolean;
};

export type RecursoCatalogo = {
  recurso: string;
  label: string;
  acoes: AcaoCatalogo[];
};

/** `recurso:acao` é ação de leitura? Default fail-closed: o que não está marcado, não é. */
export function ehLeitura(recurso: string, acao: string): boolean {
  const r = PERMISSOES_CATALOGO.find((x) => x.recurso === recurso);
  return r?.acoes.find((a) => a.acao === acao)?.leitura === true;
}

export const PERMISSOES_CATALOGO: RecursoCatalogo[] = [
  {
    recurso: "clientes",
    label: "Clientes",
    acoes: [
      { acao: "ver", label: "Ver clientes", leitura: true },
      { acao: "gerir", label: "Criar/editar clientes" },
    ],
  },
  {
    recurso: "projetos",
    label: "Projetos",
    acoes: [
      { acao: "ver", label: "Ver projetos", leitura: true },
      { acao: "gerir", label: "Criar/editar projetos e disciplinas" },
      { acao: "historico", label: "Ver o histórico (CDE) de documentos do projeto", leitura: true },
    ],
  },
  {
    recurso: "uploads",
    label: "Uploads & Validação",
    acoes: [{ acao: "validar", label: "Validar entregas (libera pagamento)" }],
  },
  {
    recurso: "arquivos_gerais",
    label: "Arquivos gerais do projeto",
    acoes: [
      { acao: "ver", label: 'Ver a pasta "Geral" do projeto', leitura: true },
      { acao: "gerir", label: 'Adicionar/editar/excluir arquivos gerais' },
    ],
  },
  {
    recurso: "arquivos",
    label: "Arquivos do projeto (Diretório)",
    acoes: [
      { acao: "ver", label: "Ver o Diretório de arquivos", leitura: true },
      { acao: "baixar", label: "Baixar/abrir arquivos", leitura: true },
      {
        acao: "ver_todas_disciplinas",
        label: "Ver arquivos de todas as disciplinas do projeto (senão, só as próprias)",
        leitura: true,
      },
      { acao: "enviar", label: "Enviar arquivos (pelo projeto)" },
      // Estas duas eram regra fixa em código (`role === "admin"` / "global ou responsável"),
      // fora da matriz — ver docs/auditoria/01-arquitetura-atual.md §10b. Entram no catálogo
      // para poderem ser concedidas pela tela de Permissões, sem que ninguém perca o que já
      // tinha: os gates antigos continuam valendo e estas ações apenas SOMAM a eles.
      { acao: "renomear", label: "Renomear arquivos de qualquer disciplina" },
      { acao: "excluir", label: "Excluir/restaurar arquivos (lixeira do projeto)" },
      // Fase 2: metadados do documento lógico (título, descrição, fase) e o status documental,
      // que é o eixo do fluxo de aprovação — separado de "enviar" de propósito, porque quem
      // sobe arquivo não é necessariamente quem declara que ele foi aprovado.
      { acao: "editar_metadados", label: "Editar título, descrição e fase dos documentos" },
      { acao: "alterar_status", label: "Alterar o status documental (Em análise, Aprovado, Liberado...)" },
    ],
  },
  {
    recurso: "financeiro",
    label: "Financeiro",
    acoes: [
      { acao: "ver", label: "Ver financeiro (cadastros, lançamentos, relatórios)", leitura: true },
      { acao: "gerir", label: "Lançar e gerir financeiro" },
      { acao: "extrato", label: "Ver apenas o próprio extrato", leitura: true },
    ],
  },
  {
    recurso: "comercial",
    label: "Comercial (CRM)",
    acoes: [
      { acao: "ver", label: "Ver funil e propostas", leitura: true },
      { acao: "gerir", label: "Gerir leads, propostas e tabelas de preço" },
    ],
  },
  {
    recurso: "juridico",
    label: "Jurídico",
    acoes: [
      { acao: "ver", label: "Ver documentos jurídicos", leitura: true },
      { acao: "gerir", label: "Gerir documentos jurídicos" },
    ],
  },
  {
    recurso: "certidoes",
    label: "Certidões",
    acoes: [
      { acao: "ver", label: "Ver certidões e histórico de versões", leitura: true },
      { acao: "gerir", label: "Registrar, renovar e excluir certidões" },
    ],
  },
  {
    recurso: "licitacoes",
    label: "Licitações",
    acoes: [
      { acao: "ver", label: "Ver licitações", leitura: true },
      { acao: "gerir", label: "Gerir licitações e medições" },
    ],
  },
  {
    recurso: "qualidade",
    label: "Qualidade",
    acoes: [{ acao: "ver", label: "Ver índice de qualidade", leitura: true }],
  },
  {
    recurso: "planejamento",
    label: "Planejamento",
    acoes: [
      { acao: "ver", label: "Ver EAP e cronograma dos projetos", leitura: true },
      { acao: "gerir", label: "Editar EAP, linha de base e aplicar plano" },
    ],
  },
  {
    recurso: "coordenacao",
    label: "Coordenação BIM",
    acoes: [
      { acao: "ver", label: "Ver maquete federada e apontamentos", leitura: true },
      { acao: "gerir", label: "Criar apontamentos, converter modelos e exportar BCF" },
    ],
  },
  {
    recurso: "recursos",
    label: "Recursos",
    acoes: [
      { acao: "ver", label: "Ver matriz de recursos", leitura: true },
      { acao: "gerir", label: "Gerir capacidade e alocações" },
    ],
  },
  {
    recurso: "documentos",
    label: "Estúdio de Documentos",
    acoes: [
      { acao: "ver", label: "Ver e gerar documentos" },
      { acao: "gerir", label: "Criar/editar modelos de documento" },
    ],
  },
  {
    recurso: "usuarios",
    label: "Usuários",
    acoes: [{ acao: "gerir", label: "Gerir usuários" }],
  },
  {
    recurso: "configuracoes",
    label: "Configurações",
    acoes: [{ acao: "gerir", label: "Gerir configurações" }],
  },
  {
    recurso: "avisos",
    label: "Avisos gerais",
    acoes: [{ acao: "enviar", label: "Enviar avisos e ver confirmações de leitura" }],
  },
  {
    recurso: "permissoes",
    label: "Permissões",
    acoes: [{ acao: "gerir", label: "Editar matriz de permissões" }],
  },
  {
    // Participar do chat. Era regra de negócio em código (`CHAT_ROLES` exclui cliente,
    // freelancer e ti) e virou permissão na Onda D. Não é permissão inventada para o menu: o
    // chat tem gate real no `service.ts`, e o item de menu só passou a consultar o mesmo eixo.
    recurso: "chat",
    label: "Chat",
    acoes: [{ acao: "usar", label: "Participar do chat interno", leitura: true }],
  },
  {
    // Entrou no catálogo na Onda D junto com o menu: `/auditoria` era `roles: ["admin"]` e não
    // tinha permissão correspondente. Só `superUsuario` a recebe hoje (bypass), que reproduz
    // exatamente a visibilidade anterior.
    recurso: "auditoria",
    label: "Auditoria",
    acoes: [{ acao: "ver", label: "Ver o log de auditoria e o uso por seção", leitura: true }],
  },
  {
    recurso: "ferramentas",
    label: "Ferramentas de Engenharia",
    acoes: [
      { acao: "usar", label: "Usar ferramentas e salvar cálculos" },
      { acao: "gerir", label: "Ver cálculos de todos / administrar" },
    ],
  },
  {
    recurso: "biblioteca_tecnica",
    label: "Biblioteca técnica (Padrões, Normas e Referências)",
    acoes: [
      { acao: "ver", label: "Ver padrões, normas e referências catalogadas", leitura: true },
      { acao: "incluir", label: "Incluir novos padrões, normas e referências" },
      { acao: "gerir", label: "Editar/excluir padrões, normas e referências de qualquer autor" },
    ],
  },
  {
    recurso: "custos",
    label: "Engenharia de Custos",
    acoes: [
      { acao: "ver", label: "Ver orçamentos, composições e insumos", leitura: true },
      { acao: "gerir", label: "Criar/editar orçamentos, quantitativos e revisões" },
      { acao: "bancos", label: "Administrar bancos de composições, insumos e bases de preço" },
      { acao: "cotacao", label: "Criar RFQs, receber propostas e escolher vencedor" },
    ],
  },
  {
    recurso: "patrimonio",
    label: "Patrimônio / Ativos",
    acoes: [
      { acao: "ver", label: "Ver inventário de ativos", leitura: true },
      { acao: "gerir", label: "Criar/editar ativos do inventário" },
      { acao: "ti", label: "Gerenciar TI (máquinas, peças, manutenção)" },
    ],
  },
  {
    recurso: "ponto",
    label: "Ponto",
    acoes: [
      { acao: "rateio", label: "Ver rateio de horas da equipe por projeto", leitura: true },
      { acao: "espelho_equipe", label: "Ver espelho de ponto de outros usuários", leitura: true },
      { acao: "gerir_escalas", label: "Configurar escalas de trabalho (por perfil e por usuário)" },
      { acao: "ajustar", label: "Editar batidas de ponto de outros usuários (com ciência)" },
    ],
  },
  {
    // Escopo de DADOS, não de tela: quem tem isto enxerga todos os projetos da empresa; quem não
    // tem enxerga os projetos em que é membro ou responsável. Era o único eixo de acesso que
    // vivia só em código (`GLOBAL_ROLES`/`ehSocio` em `acessoGlobal`), fora da tela de Permissões
    // e fora do arnês de equivalência. Entrou no catálogo na Onda D para deixar de ser invisível.
    recurso: "escopo",
    label: "Escopo de dados",
    acoes: [{ acao: "global", label: "Ver todos os projetos da empresa (não só os próprios)", leitura: true }],
  },
  {
    recurso: "rh",
    label: "RH — Pessoas",
    acoes: [
      { acao: "cadastro", label: "Ver a ficha de pessoas (cadastro, ausências, escala)", leitura: true },
      { acao: "folha", label: "Ver dados de folha/salário na ficha da pessoa", leitura: true },
      { acao: "catalogos", label: "Administrar os catálogos de cargos e departamentos" },
    ],
  },
  {
    // Cofre corporativo de credenciais. Duas regras que não são óbvias pela lista:
    //
    // 1. NENHUMA destas ações decide QUAIS registros a pessoa vê — isso sai de
    //    `CredencialCompartilhamento`, por registro. Aqui é só o gate de tela.
    // 2. `credencial` (revelar senha) é INDEPENDENTE de `gerir` (§27/§29/§91): quem
    //    administra o cofre não revela senha por consequência. Por isso ela fica fora
    //    da semente do `db:seed` — é concessão explícita, nunca herdada.
    recurso: "acessos",
    label: "Acessos e Credenciais",
    acoes: [
      { acao: "ver", label: "Ver a Central de Acessos", leitura: true },
      { acao: "gerir", label: "Criar/editar acessos (sem revelar senha)" },
      // NÃO é `leitura: true`: o piso de sócio materializa override em toda ação marcada como
      // leitura (ver `AcaoCatalogo.leitura` no topo), e revelar credencial é exatamente o que
      // não pode ser concedido por piso automático. Ler senha do cofre é ato auditado, não
      // consulta. Mesmo espírito de `documentos:ver`/`ferramentas:usar` acima.
      { acao: "credencial", label: "Revelar/copiar credenciais (ação auditada)" },
      { acao: "permissoes", label: "Definir com quem cada acesso é compartilhado" },
      { acao: "auditoria", label: "Ver o histórico de auditoria do cofre", leitura: true },
      { acao: "categorias", label: "Gerenciar as categorias de acesso" },
    ],
  },
];
