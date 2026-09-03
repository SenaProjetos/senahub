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
  /**
   * Tela (ou telas) que esta permissão abre — o rótulo curto, como a pessoa lê no menu.
   * Ausente = não abre tela nenhuma: é funcionalidade DENTRO de uma tela que a pessoa já
   * alcança por outra permissão.
   *
   * É **propriedade, não categoria**: `configuracoes:gerir` abre tela *e* é ação de escrita, e
   * as duas coisas são verdade ao mesmo tempo — não force um balde só. Guarda o rótulo e não o
   * `href` de propósito: o href já vive em `nav-config.ts`, e duplicá-lo criaria duas verdades
   * que divergem. `permissions-catalog.test.ts` garante que todo `permissao` usado pelo menu
   * cai numa ação marcada aqui.
   */
  abre?: string;
  /**
   * Escopo de DADOS: não abre tela nem executa ação — amplia o conjunto de registros visíveis
   * nas telas que a pessoa já alcança. Punhado pequeno e fechado (`escopo:global`,
   * `arquivos:ver_todas_disciplinas`); na dúvida, não marque.
   */
  dados?: boolean;
};

export type RecursoCatalogo = {
  recurso: string;
  label: string;
  acoes: AcaoCatalogo[];
};

function acaoDoCatalogo(recurso: string, acao: string): AcaoCatalogo | undefined {
  return PERMISSOES_CATALOGO.find((x) => x.recurso === recurso)?.acoes.find((a) => a.acao === acao);
}

/** Rótulo da tela que `recurso:acao` abre, ou `null` se ela só habilita funcionalidade. */
export function telaQueAbre(recurso: string, acao: string): string | null {
  return acaoDoCatalogo(recurso, acao)?.abre ?? null;
}

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
      { acao: "ver", label: "Ver clientes", abre: "Clientes", leitura: true },
      { acao: "gerir", label: "Criar/editar clientes" },
    ],
  },
  {
    recurso: "projetos",
    label: "Projetos",
    acoes: [
      { acao: "ver", label: "Ver projetos", abre: "Projetos · Apontamentos", leitura: true },
      { acao: "gerir", label: "Criar/editar projetos e disciplinas" },
      { acao: "historico", label: "Ver o histórico (CDE) de documentos do projeto", abre: "Aba Histórico do projeto", leitura: true },
      // F4 (2026-09-02): abas que apareciam para todo mundo, sem gate nenhum. A permissão é o
      // TETO (decisão do dono, opção C) e o `abasConfig` do projeto recorta DENTRO dela: quem
      // não tem a permissão nunca vê a aba; quem tem, vê se aquele projeto a mantiver ligada.
      { acao: "servicos", label: "Ver a aba Serviços do projeto", abre: "Aba Serviços do projeto", leitura: true },
      { acao: "arts", label: "Ver a aba ARTs do projeto", abre: "Aba ARTs do projeto", leitura: true },
      { acao: "diario", label: "Ver o Diário de obra do projeto", abre: "Aba Diário do projeto", leitura: true },
      { acao: "extras", label: "Ver a aba Extras do projeto", abre: "Aba Extras do projeto", leitura: true },
      { acao: "pastas", label: "Redesenhar a árvore de pastas do projeto" },
    ],
  },
  {
    // `tarefas:ver` era consultado em `modules/busca/actions.ts` sem existir no catálogo: como
    // par ausente resolve `false`, tarefa nunca aparecia na busca global (Ctrl+K) para ninguém
    // além de `superUsuario` — apesar de a própria pessoa poder abrir `/tarefas` e ver as
    // mesmas tarefas. A rota `/tarefas` NÃO usa este par (é `requireRole(...INTERNAL_ROLES)`),
    // por isso não há `abre` aqui: hoje ele governa só a busca. Os resultados já saem
    // recortados por `escopoTarefa(user)` — o par decide se a seção aparece, não o que ela mostra.
    recurso: "tarefas",
    label: "Tarefas",
    acoes: [{ acao: "ver", label: "Ver tarefas na busca global (Ctrl+K)", leitura: true }],
  },
  {
    recurso: "uploads",
    label: "Uploads & Validação",
    acoes: [{ acao: "validar", label: "Validar entregas (libera pagamento)", abre: "Aprovações" }],
  },
  {
    recurso: "arquivos_gerais",
    label: "Arquivos gerais do projeto",
    acoes: [
      { acao: "ver", label: 'Ver a pasta "Geral" do projeto', abre: "Aba Geral do projeto", leitura: true },
      { acao: "gerir", label: 'Adicionar/editar/excluir arquivos gerais' },
    ],
  },
  {
    recurso: "arquivos",
    label: "Arquivos do projeto (Diretório)",
    acoes: [
      { acao: "ver", label: "Ver o Diretório de arquivos", abre: "Arquivos", leitura: true },
      { acao: "baixar", label: "Baixar/abrir arquivos", leitura: true },
      {
        acao: "ver_todas_disciplinas",
        label: "Ver arquivos de todas as disciplinas do projeto (senão, só as próprias)",
        dados: true,
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
      { acao: "ver", label: "Ver financeiro (cadastros, lançamentos, relatórios)", abre: "Financeiro", leitura: true },
      { acao: "gerir", label: "Lançar e gerir financeiro" },
      // Estava em `requirePermission("financeiro","aprovar")` (`/financeiro/aprovacoes`) e em
      // `financeiro/aprovacao/actions.ts` SEM linha aqui — logo era ingrantável: sem par no
      // catálogo, nenhuma tela conseguia conceder e só `superUsuario` passava, apesar de a
      // alçada padrão (`getNiveisAprovacao`) já notificar admin+supervisor para aprovar.
      // Separada de `gerir` de propósito: quem lança a despesa não é quem a aprova.
      // ATENÇÃO: este é o gate de ENTRADA. Quem aprova QUAL valor continua saindo da alçada
      // por faixa (`papeisAprovadores`), configurável em Financeiro → Configurações.
      { acao: "aprovar", label: "Aprovar despesas acima da alçada", abre: "Financeiro → Aprovações" },
      // F4 (2026-09-02): recorte fino do que era um `gerir` só. 20 sub-áreas atrás de dois
      // interruptores fazia quem lança um boleto ganhar junto conciliação bancária, fechamento
      // de mês e importação de OFX. Cada par abaixo foi semeado exatamente para quem tinha
      // `gerir`/`ver` antes — ampliar configurabilidade não redistribui acesso.
      { acao: "conciliar", label: "Conciliar extrato bancário e importar OFX", abre: "Financeiro → Conciliação" },
      { acao: "fechar", label: "Fechar o mês (ato contábil, não lançamento)", abre: "Financeiro → Fechamento" },
      {
        acao: "resultados",
        label: "Ver rentabilidade, balanço, DFC e relatórios",
        abre: "Financeiro → Rentabilidade · Balanço · DFC · Relatórios",
        leitura: true,
      },
      { acao: "folha_pj", label: "Gerir a folha de projetistas (libera pagamento a terceiro)", abre: "Financeiro → Folha de projetistas" },
      { acao: "extrato", label: "Ver apenas o próprio extrato", abre: "Financeiro (só o próprio extrato)", leitura: true },
    ],
  },
  {
    recurso: "comercial",
    label: "Comercial (CRM)",
    acoes: [
      { acao: "ver", label: "Ver funil e propostas", abre: "Comercial", leitura: true },
      { acao: "gerir", label: "Gerir leads, propostas e tabelas de preço" },
    ],
  },
  {
    recurso: "juridico",
    label: "Jurídico",
    acoes: [
      { acao: "ver", label: "Ver documentos jurídicos", abre: "Jurídico", leitura: true },
      { acao: "gerir", label: "Gerir documentos jurídicos" },
    ],
  },
  {
    recurso: "certidoes",
    label: "Certidões",
    acoes: [
      { acao: "ver", label: "Ver certidões e histórico de versões", abre: "Certidões", leitura: true },
      { acao: "gerir", label: "Registrar, renovar e excluir certidões" },
    ],
  },
  {
    recurso: "licitacoes",
    label: "Licitações",
    acoes: [
      { acao: "ver", label: "Ver licitações", abre: "Licitações", leitura: true },
      { acao: "gerir", label: "Gerir licitações e medições" },
    ],
  },
  {
    recurso: "qualidade",
    label: "Qualidade",
    acoes: [{ acao: "ver", label: "Ver índice de qualidade", abre: "Qualidade", leitura: true }],
  },
  {
    recurso: "planejamento",
    label: "Planejamento",
    acoes: [
      { acao: "ver", label: "Ver EAP e cronograma dos projetos", abre: "Planejamento", leitura: true },
      { acao: "gerir", label: "Editar EAP, linha de base e aplicar plano" },
    ],
  },
  {
    recurso: "coordenacao",
    label: "Coordenação BIM",
    acoes: [
      { acao: "ver", label: "Ver maquete federada e apontamentos", abre: "Aba Coordenação do projeto", leitura: true },
      { acao: "gerir", label: "Criar apontamentos, converter modelos e exportar BCF" },
    ],
  },
  {
    recurso: "recursos",
    label: "Recursos",
    acoes: [
      { acao: "ver", label: "Ver matriz de recursos", abre: "Recursos", leitura: true },
      { acao: "gerir", label: "Gerir capacidade e alocações" },
    ],
  },
  {
    recurso: "documentos",
    label: "Estúdio de Documentos",
    acoes: [
      { acao: "ver", label: "Ver e gerar documentos", abre: "Doc Studio" },
      { acao: "gerir", label: "Criar/editar modelos de documento" },
    ],
  },
  {
    recurso: "usuarios",
    label: "Usuários",
    acoes: [{ acao: "gerir", label: "Gerir usuários", abre: "Configurações → Usuários" }],
  },
  {
    recurso: "configuracoes",
    label: "Configurações",
    acoes: [
      { acao: "gerir", label: "Gerir configurações", abre: "Configurações" },
      // F4: eram `requireRole` fixos, fora da matriz.
      { acao: "disciplinas", label: "Administrar o catálogo de disciplinas", abre: "Configurações → Disciplinas" },
      { acao: "licitacoes", label: "Administrar modalidades e critérios de licitação", abre: "Configurações → Licitações" },
    ],
  },
  {
    // Quem RECEBE as notificações de escalonamento (F5, 2026-09-02). Eixo próprio de propósito:
    // as audiências de `lib/audiencias.ts` decidiam isso por papel, fora de `can()` e fora da
    // tela — o risco R2 documentado lá. Mapeá-las para permissões que já existiam não servia:
    // `rh:cadastro` só está no administrativo (o coordenador sumiria das notificações de RH) e
    // `escopo:global` não está em ninguém (a audiência `global` esvaziaria). Nos dois casos a
    // falha seria silenciosa, que é exatamente o que o arnês existe para impedir.
    //
    // Não contradiz "não invente par para o que não é acesso": receber escalonamento É uma
    // decisão de quem-faz-o-quê, distinta de poder abrir a tela, e é a pergunta que mais volta
    // ("por que fulano não recebeu?"). Semeados para os mesmos papéis de hoje — zero mudança.
    recurso: "notificacoes",
    label: "Notificações de gestão",
    acoes: [
      { acao: "gestao", label: "Receber avisos de gestão global (aprovações, digest semanal, suporte)", leitura: true },
      { acao: "rh", label: "Receber avisos de RH (NF, abono, conta bancária, pedido de cadastro)", leitura: true },
      { acao: "operacional", label: "Receber avisos de operação (entregas, pagamentos, certidões, projeto ganho)", leitura: true },
    ],
  },
  {
    recurso: "avisos",
    label: "Avisos gerais",
    acoes: [{ acao: "enviar", label: "Enviar avisos e ver confirmações de leitura", abre: "Configurações → Avisos" }],
  },
  {
    // Participar do chat. Era regra de negócio em código (`CHAT_ROLES`, que excluía cliente,
    // freelancer e ti) e virou permissão de verdade na F2/F3 (2026-09-02): os 5 gates de tela e
    // API passaram a ler `chat:usar`, e `CHAT_ROLES` deixou de existir. Ver
    // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
    recurso: "chat",
    label: "Chat",
    acoes: [
      { acao: "usar", label: "Participar do chat interno", abre: "Chat", leitura: true },
      // Quebra por TipoCanal (F3, 2026-09-02): "entrar no chat" e "estar no #geral" eram a
      // mesma coisa em código, e não são a mesma decisão. Um freelancer pode participar dos
      // canais dos projetos dele sem entrar no canal da empresa inteira nem abrir DM.
      //
      // `projeto` e `disciplina` NÃO viram par de propósito: quem está no projeto está no
      // canal, e isso é `CanalMembro` — escopo por registro, que já é o granular certo. Uma
      // permissão global "ver canais de projeto" não saberia DE QUAL projeto se trata.
      { acao: "geral", label: "Participar do canal #geral (toda a empresa)", leitura: true },
      { acao: "dm", label: "Abrir e receber conversa direta (DM)", leitura: true },
      { acao: "grupo", label: "Criar grupos de conversa avulsos" },
    ],
  },
  {
    // Entrou no catálogo na Onda D junto com o menu: `/auditoria` era `roles: ["admin"]` e não
    // tinha permissão correspondente. Só `superUsuario` a recebe hoje (bypass), que reproduz
    // exatamente a visibilidade anterior.
    recurso: "auditoria",
    label: "Auditoria",
    acoes: [{ acao: "ver", label: "Ver o log de auditoria e o uso por seção", abre: "Auditoria · Uso por seção", leitura: true }],
  },
  {
    recurso: "ferramentas",
    label: "Ferramentas de Engenharia",
    acoes: [
      { acao: "usar", label: "Usar ferramentas e salvar cálculos", abre: "Ferramentas" },
      { acao: "gerir", label: "Ver cálculos de todos / administrar" },
    ],
  },
  {
    recurso: "biblioteca_tecnica",
    label: "Biblioteca técnica (Padrões, Normas e Referências)",
    acoes: [
      { acao: "ver", label: "Ver padrões, normas e referências catalogadas", abre: "Padrões, Normas e Referências", leitura: true },
      { acao: "incluir", label: "Incluir novos padrões, normas e referências" },
      { acao: "gerir", label: "Editar/excluir padrões, normas e referências de qualquer autor" },
    ],
  },
  {
    recurso: "custos",
    label: "Engenharia de Custos",
    acoes: [
      { acao: "ver", label: "Ver orçamentos, composições e insumos", abre: "Engenharia de Custos", leitura: true },
      { acao: "gerir", label: "Criar/editar orçamentos, quantitativos e revisões" },
      { acao: "bancos", label: "Administrar bancos de composições, insumos e bases de preço" },
      { acao: "cotacao", label: "Criar RFQs, receber propostas e escolher vencedor" },
    ],
  },
  {
    recurso: "patrimonio",
    label: "Patrimônio / Ativos",
    acoes: [
      { acao: "ver", label: "Ver inventário de ativos", abre: "Patrimônio", leitura: true },
      { acao: "gerir", label: "Criar/editar ativos do inventário" },
      { acao: "ti", label: "Gerenciar TI (máquinas, peças, manutenção)", abre: "Patrimônio → TI" },
    ],
  },
  {
    recurso: "ponto",
    label: "Ponto",
    acoes: [
      { acao: "rateio", label: "Ver rateio de horas da equipe por projeto", abre: "Aba Rateio do Ponto", leitura: true },
      { acao: "espelho_equipe", label: "Ver espelho de ponto de outros usuários", abre: "Espelho de ponto da equipe", leitura: true },
      { acao: "gerir_escalas", label: "Configurar escalas de trabalho (por perfil e por usuário)", abre: "Escalas" },
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
    acoes: [{
      acao: "global",
      label: "Ver todos os projetos da empresa (não só os próprios)",
      dados: true,
      leitura: true,
    }],
  },
  {
    recurso: "rh",
    label: "RH — Pessoas",
    acoes: [
      { acao: "cadastro", label: "Ver a ficha de pessoas (cadastro, ausências, escala)", abre: "Pessoas · RH — admin · Produtividade · Pessoas Jurídicas", leitura: true },
      { acao: "folha", label: "Ver dados de folha/salário na ficha da pessoa", abre: "Folha CLT", leitura: true },
      { acao: "catalogos", label: "Administrar os catálogos de cargos e departamentos", abre: "Cargos e departamentos" },
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
      { acao: "ver", label: "Ver a Central de Acessos", abre: "Acessos", leitura: true },
      { acao: "gerir", label: "Criar/editar acessos (sem revelar senha)" },
      // NÃO é `leitura: true`: o piso de sócio materializa override em toda ação marcada como
      // leitura (ver `AcaoCatalogo.leitura` no topo), e revelar credencial é exatamente o que
      // não pode ser concedido por piso automático. Ler senha do cofre é ato auditado, não
      // consulta. Mesmo espírito de `documentos:ver`/`ferramentas:usar` acima.
      { acao: "credencial", label: "Revelar/copiar credenciais (ação auditada)" },
      { acao: "permissoes", label: "Definir com quem cada acesso é compartilhado" },
      { acao: "auditoria", label: "Ver o histórico de auditoria do cofre", abre: "Acessos → Auditoria", leitura: true },
      { acao: "categorias", label: "Gerenciar as categorias de acesso", abre: "Acessos → Categorias" },
    ],
  },
];
