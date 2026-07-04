# SenaHub — Análise de Melhorias (Referência para Claude Code)

> **Data da análise:** 19/06/2026  
> **Ambiente:** localhost:3000  
> **Escopo:** Levantamento completo de UX/UI, funcionalidades e integrações em todas as rotas do sistema.

---

## 1. Visão Geral do Sistema

O **SenaHub** é um ERP para escritórios de arquitetura/engenharia com os seguintes módulos:

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/` | KPIs, receita, projetos recentes |
| Projetos | `/projetos` | Listagem e detalhe com disciplinas |
| Lista Mestre | `/projetos/:id/lista-mestre` | Folhas técnicas por disciplina (ex-"Pranchas") |
| Clientes | `/clientes` | Cadastro de PF e PJ |
| Comercial | `/comercial` | Funil de vendas (Kanban) |
| Tarefas | `/tarefas` | Kanban com dependências |
| Agenda | `/agenda` | Calendário mensal de compromissos |
| Chat | `/chat` | Canais por projeto/disciplina |
| Ponto | `/ponto` | Registro de jornada com timer |
| RH | `/rh` | Abono, férias e clima |
| RH Admin | `/rh/admin` | Validações, feedback, ponto manual |
| Folha CLT | `/rh/folha` | Holerites mensais |
| Funcionários | `/rh/funcionarios` | **BUG: redireciona errado** |
| Financeiro | `/financeiro` | Dashboard financeiro completo |
| Documentos | `/documentos` | Estúdio de modelos/templates |
| Planejamento | `/planejamento` | EAP + Gantt por projeto |
| Recursos | `/recursos` | Matriz de alocação de equipe |
| Jurídico | `/juridico` | Contratos, certidões, modelos |
| Licitações | `/licitacoes` | Funil de processos licitatórios |
| Qualidade | `/qualidade` | Índice de retrabalho e SLA |
| Suporte | `/suporte` | Tickets internos |
| Preferências | `/preferencias` | Configurações pessoais |
| Configurações | `/configuracoes` | Administração do sistema |
| Auditoria | `/auditoria` | Log imutável de ações |

---

## 2. Bugs Identificados

### 2.1 Rota `/rh/funcionarios` — Redirecionamento Incorreto
**Severidade:** Alta  
**Descrição:** A rota `/rh/funcionarios` redireciona para `/auditoria` em vez de exibir a listagem de funcionários.  
**Impacto:** O item "Funcionários" no menu lateral é inacessível por navegação direta.  
**Ação:** Verificar o arquivo de rotas (`app/rh/funcionarios/page.tsx` ou equivalente) e corrigir o redirect.

### 2.2 Página de Detalhe de Cliente sem Rota Paginada
**Severidade:** Média  
**Descrição:** A URL `/clientes/[id]` funciona quando navegada via clique na listagem, mas ao acessar diretamente uma URL com ID gerado manualmente, retorna 404. Não há validação amigável — a mensagem é o padrão do Next.js.  
**Ação:** Adicionar uma página de erro 404 personalizada e/ou redirecionar `/clientes/[id-inválido]` para a listagem com toast de erro.

### 2.3 Auditoria — Registro de Falhas em `gerar-folha-lote`
**Severidade:** Alta  
**Descrição:** O log de auditoria mostra 3 falhas consecutivas na ação `gerar-folha-lote (FolhaProjetista)` em 18/06 às 18:25. Não há feedback visual para o usuário na tela de Folha CLT.  
**Ação:** Tratar a exceção no servidor, retornar mensagem de erro descritiva e exibir feedback na UI.

### 2.4 Dashboard — Gráfico de Receita com Previsto zerado para meses passados
**Severidade:** Baixa  
**Descrição:** No gráfico "Receita — 6 meses", os meses passados (Jan–Mai) mostram "Previsto: R$ 0" mesmo tendo valores realizados.  
**Ação:** Revisar a query para distinguir "previsto original" de "previsto em aberto".

---

## 3. Melhorias Funcionais por Módulo

### 3.1 Dashboard (`/`)

**Problemas:**
- KPIs sem link de drill-down (clicar em "Projetos ativos: 6" deveria filtrar a listagem)
- "Entregas pendentes: 1" não leva a nenhuma tela de detalhe
- Gráfico "Evolução — projetos ativos" sem legenda explicando o índice
- Falta KPI de inadimplência (contas vencidas) no topo
- A citação do dia ocupa espaço nobre sem valor operacional

**Ações sugeridas:**
- Tornar todos os cards KPI clicáveis com filtro pré-aplicado
- Adicionar tooltip explicativo no gráfico de evolução
- Adicionar card "Contas vencidas" linkando para `/financeiro#aging`
- Opção de ocultar o card de citação

### 3.2 Projetos (`/projetos` e `/projetos/:id`)

**Problemas:**
- Listagem sem ordenação de colunas por clique no cabeçalho
- Filtro por situação único — falta filtro por cliente e responsável
- Sem visualização em cards/kanban como alternativa à tabela
- Botão "Mais" no header sem indicação visual do conteúdo
- Seção "Inputs do projeto" fica vazia e ocupa espaço desnecessário
- Sem barra de progresso global do projeto no topo
- Sem contadores nos botões "Arquivos" e "Revisões"
- Sem botão de duplicar projeto
- Sem histórico de mudanças de status por disciplina

**Ações sugeridas:**
- Adicionar ordenação por clique no header da tabela
- Adicionar filtros multi-seleção (cliente, responsável, disciplina)
- Implementar toggle lista/kanban
- Mostrar progresso geral no topo do detalhe
- Adicionar badge com contagem em "Arquivos (0)" e "Revisões (0)"
- Colapsar "Inputs do projeto" quando vazia

### 3.3 Pranchas → Lista Mestre (`/projetos/:id/lista-mestre`)

> Reestruturada como **Lista Mestre** (catálogo de siglas folha/tipo/fase + código composto).
> Os pontos abaixo referem-se à versão antiga "Pranchas".

**Problemas:**
- Estado vazio apenas com texto "Sem pranchas." sem orientação visual
- Sem indicação de para que servem as pranchas
- Sem fluxo guiado de criação

**Ações sugeridas:**
- Adicionar empty state com ícone e texto descritivo
- Adicionar tooltip ou modal de ajuda sobre o fluxo de pranchas

### 3.4 Clientes (`/clientes`)

**Problemas:**
- Sem filtro por tipo (PF/PJ) ou cidade/UF
- Sem paginação — lista crescerá indefinidamente
- Detalhe sem aba de histórico de interações
- Seção "Contatos" sem botão de adicionar no detalhe
- Sem campo de categoria do cliente
- Texto de roadmap interno visível na UI: "Integra com o Financeiro na Onda 2"

**Ações sugeridas:**
- Adicionar filtros por tipo, cidade e situação
- Implementar paginação ou infinite scroll
- Adicionar botão "+ Contato" na seção Contatos
- Remover textos de roadmap interno da interface
- Adicionar aba "Histórico" com timeline de interações

### 3.5 Comercial (`/comercial`)

**Problemas:**
- Lead abre em modal simples — para leads complexos, seria melhor uma página dedicada
- Modal sem histórico de atividades exibido
- Sem filtro por responsável ou origem
- Lead "Perdido" não solicita motivo da perda
- Sem KPI de tempo médio de conversão
- Sem integração com Agenda para follow-ups

**Ações sugeridas:**
- Criar página de detalhe dedicada `/comercial/:id`
- Adicionar campo obrigatório "motivo da perda" ao mover para Perdido
- Adicionar filtro por responsável e origem
- Integrar ação "Agendar follow-up" com a Agenda
- Exibir histórico de notas dentro do modal do lead

### 3.6 Tarefas (`/tarefas`)

**Problemas:**
- Kanban sem filtro por projeto — mistura todas as tarefas
- Sem filtro por responsável ou data de vencimento
- Sem visualização em lista com ordenação por data
- Sem busca por texto
- Tarefas atrasadas sem agrupamento destacado

**Ações sugeridas:**
- Adicionar filtros por projeto, responsável e período
- Implementar visualização lista/tabela como alternativa
- Adicionar busca full-text
- Agrupar ou destacar tarefas atrasadas

### 3.7 Agenda (`/agenda`)

**Problemas:**
- Apenas visualização mensal — sem semanal ou diária
- Sem busca de compromissos passados
- Sem integração com Google Calendar ou Outlook
- Sem notificação/lembrete configurável por compromisso
- Sem opção de convidar participantes externos

**Ações sugeridas:**
- Adicionar vistas semanal e diária
- Implementar integração com Google Calendar (OAuth)
- Adicionar campo de notificação/lembrete (X minutos antes)

### 3.8 Chat (`/chat`)

**Problemas:**
- Canal `#geral` vazio sem estado vazio informativo
- Lista de canais muito extensa sem colapso automático
- Sem busca de mensagens no histórico
- Sem indicação de mensagens não lidas (badge)
- Sem suporte a thread/resposta
- Status online incorreto (mostra "Ninguém online" mesmo logado)
- Histórico não carregado ao abrir um canal

**Ações sugeridas:**
- Adicionar badge de mensagens não lidas nos canais
- Implementar busca full-text no histórico
- Adicionar suporte a threads/replies
- Colapsar projetos sem atividade recente
- Corrigir status online do usuário atual
- Carregar últimas N mensagens ao abrir canal

### 3.9 Ponto (`/ponto`)

**Problemas:**
- Saldo negativo (-64h12) sem explicação do cálculo ou ação para regularizar
- Espelho do mês com apenas 2 entradas (possível bug de exibição)
- Colaborador não pode solicitar correção de ponto diretamente
- Timer não persiste ao navegar para outra aba
- Sem exportação do espelho de ponto

**Ações sugeridas:**
- Tooltip explicando o cálculo do banco de horas
- Persistir timer no localStorage/service worker
- Botão "Solicitar correção" para o colaborador
- Exportação do espelho de ponto (PDF/Excel)
- Exibir todos os dias do mês no espelho

### 3.10 RH (`/rh`)

**Problemas:**
- Input file nativo no abono de falta (inconsistente visualmente)
- Sem histórico de solicitações do colaborador
- Emojis do clima sem aria-label (acessibilidade)
- Sem confirmação visual após envio de solicitação

**Ações sugeridas:**
- Substituir input file nativo por componente de upload customizado
- Adicionar seção "Minhas solicitações" com histórico
- Adicionar aria-label nos botões de emoji
- Exibir toast de sucesso/erro após envio

### 3.11 RH Admin (`/rh/admin`)

**Problemas:**
- Banco de horas sem indicação de prazo para fechamento
- Feedback/1:1 apenas texto livre sem estrutura
- NFs de PJ sem histórico das já validadas
- Onboarding sem progresso visual

**Ações sugeridas:**
- Indicação de prazo para fechamento do banco de horas
- Estruturar feedback com campos pré-definidos
- Histórico de NFs validadas
- Progresso do onboarding (X/Y itens)

### 3.12 Folha CLT (`/rh/folha`)

**Problemas:**
- Apenas uma folha exibida sem histórico completo
- Falha em `gerar-folha-lote` sem feedback na UI
- Sem preview do holerite antes de fechar

**Ações sugeridas:**
- Exibir histórico de todos os meses (paginado)
- Preview do holerite em modal antes do fechamento
- Mensagem de erro quando gerar-folha-lote falhar

### 3.13 Financeiro (`/financeiro`)

**Problemas:**
- Quicklinks sem contadores de itens pendentes
- Gráfico de despesas sem subcategorias (100% em "Despesas")
- Projeção de caixa sem explicação da metodologia
- Sem filtro de período no dashboard
- Sem DRE resumido

**Ações sugeridas:**
- Badges de contagem nos quicklinks (ex: "Aprovações (3 pendentes)")
- Subcategorias de despesas no gráfico donut
- Tooltip explicando a projeção de caixa
- Seletor de período no dashboard (mês, trimestre, ano)
- Bloco de DRE resumido

### 3.14 Documentos (`/documentos`)

**Problemas:**
- Sem categorias/filtros quando a lista crescer
- "Novo modelo" sem documentação de variáveis suportadas
- Lixeira sem confirmação de exclusão
- Sem preview rápido do template

**Ações sugeridas:**
- Categorias e filtros de templates
- Documentação de variáveis disponíveis
- Confirmação antes de excluir template
- Preview hover do documento

### 3.15 Planejamento (`/planejamento` e `/planejamento/:id`)

**Problemas:**
- Projetos sem tarefas sem call-to-action para iniciar o planejamento
- Gantt sem exportação (PDF/Excel/imagem)
- Sem indicação de caminho crítico
- "Aplicar ao projeto" sem confirmação detalhada
- Barra de rolagem horizontal com pouco espaço

**Ações sugeridas:**
- CTA "Iniciar planejamento" em projetos vazios
- Exportação do Gantt em PDF/PNG
- Destacar caminho crítico
- Confirmação com descrição antes de "Aplicar ao projeto"

### 3.16 Recursos (`/recursos`)

**Problemas:**
- 3/5 recursos superalocados sem ação sugerida
- Sem visualização temporal da alocação
- Sem filtro por projeto

**Ações sugeridas:**
- Botão "Rebalancear" com sugestão de redistribuição
- View de linha do tempo / heat map de disponibilidade
- Filtro por projeto

### 3.17 Jurídico (`/juridico`)

**Problemas:**
- Sem alerta de vencimento próximo em certidões
- Sem preview inline de documentos PDF
- Sem integração com assinatura digital

**Ações sugeridas:**
- Alerta visual para certidões a vencer (30/15/7 dias)
- Preview inline de PDFs
- Integração com DocuSign/ClickSign/D4Sign

### 3.18 Licitações (`/licitacoes`)

**Problemas:**
- Sem alerta de prazo iminente (Pregão 012/2026 com prazo hoje, 19/06/2026)
- Sem link para consulta no PNCP/Comprasnet
- "Sanções" sem indicação da fonte dos dados

**Ações sugeridas:**
- Badge/alerta vermelho para licitações com prazo hoje ou vencido
- Link para consulta externa do edital (PNCP)
- Documentar a fonte de dados de sanções

### 3.19 Qualidade (`/qualidade`)

**Problemas:**
- Disciplinas vencidas sem link direto para o projeto
- Gráfico histórico sem eixo Y rotulado
- Sem alertas automáticos por threshold

**Ações sugeridas:**
- Linhas de "Maiores atrasos" clicáveis (link para projeto/disciplina)
- Rótulo no eixo Y do gráfico
- Alerta configurável por threshold de retrabalho

### 3.20 Suporte (`/suporte`)

**Problemas:**
- Todos os tickets visíveis para todos sem separação
- Sem prioridade ou categoria nos tickets
- Sem notificação ao criador quando ticket é atualizado
- Sem SLA visível

**Ações sugeridas:**
- Filtros: "Meus tickets" vs "Todos"
- Campo de prioridade e categoria ao abrir ticket
- Notificação por email/push ao atualizar ticket
- SLA visível por ticket

### 3.21 Configurações (`/configuracoes`)

**Problemas:**
- Grade sem separação por criticidade
- Sem seção de integrações externas
- Sem preview do aviso geral antes de enviar
- Alterações de config não registradas no log de auditoria

**Ações sugeridas:**
- Reorganizar em grupos: Usuários, Financeiro, Projetos, Sistema
- Adicionar seção de Integrações (email SMTP, Google, WhatsApp, API keys)
- Preview do aviso geral antes de enviar
- Registrar alterações de configuração no log de auditoria

### 3.22 Auditoria (`/auditoria`)

**Problemas:**
- Sem exportação do log (Excel/CSV)
- Sem filtro por período (apenas módulo e resultado)
- Nomes técnicos de ações sem descrição legível
- Linhas de "falha" sem destaque visual suficiente

**Ações sugeridas:**
- Exportação do log em CSV/Excel
- Filtro de período (de/até)
- Mapear nomes técnicos para descrições em português
- Destacar linhas com resultado "falha" em vermelho intenso

---

## 4. Melhorias de UX/UI Globais

### 4.1 Navegação e Estrutura
- Menu lateral com 20+ itens sem hierarquia clara — colapsar por grupo com ícone
- Breadcrumb inconsistente entre páginas
- Bottom navigation mobile insuficiente para cobrir todos os módulos

### 4.2 Busca Global
- `Ctrl+K` existe mas comportamento não verificado em profundidade
- Garantir indexação de: projetos, clientes, tarefas, lançamentos, documentos
- Adicionar sugestões recentes e atalhos

### 4.3 Estados Vazios
Múltiplos módulos com estados vazios apenas em texto simples.  
**Ação:** Criar componente `<EmptyState>` padrão com ícone SVG, título, descrição e CTA contextual.

### 4.4 Feedback de Ações
- Ações sem toast/snackbar de confirmação
- Botões de formulário sem estado `loading` visível
- Ações destrutivas sem modal de confirmação consistente

### 4.5 Responsividade
- Sistema otimizado para desktop (1260px+)
- Kanban e Gantt transbordam em telas menores
- Menu lateral deveria virar drawer/offcanvas em mobile

### 4.6 Acessibilidade
- Tema escuro: verificar implementação completa em todos os componentes
- Contraste de textos secundários pode ser insuficiente para WCAG AA
- Emojis do RH precisam de `aria-label`
- Tags de status usam apenas cor — adicionar ícone para daltonismo

### 4.7 Consistência Visual
- Valores monetários inconsistentes: "R$ 81.000,00" vs "R$ 81k" — definir padrão por contexto
- Botões secundários variam entre outlined e ghost sem critério
- Formato de data inconsistente: "07/08/2026" vs "07/06" vs "19 de jun."

---

## 5. Melhorias de Integração

### 5.1 Integrações Ausentes (Alta Prioridade)

| Integração | Módulo Beneficiado | Descrição |
|---|---|---|
| **Email (SMTP)** | RH, Suporte, Comercial | Notificações de status, aprovações, follow-ups |
| **Google Calendar / Outlook** | Agenda | Sincronização bidirecional |
| **WhatsApp Business API** | Comercial | Envio de propostas e follow-up |
| **PNCP (API Gov)** | Licitações | Importação automática de editais |
| **Banco (OFX/CNAB automatizado)** | Financeiro | Conciliação bancária automática |
| **Assinatura Digital** | Jurídico | DocuSign, ClickSign ou D4Sign |
| **Storage externo** | Projetos/Jurídico | S3, Google Drive ou Dropbox |

### 5.2 Integrações Existentes a Melhorar
- **Financeiro ↔ Projetos:** Lançamentos avulsos não referenciam projeto automaticamente
- **RH ↔ Ponto ↔ Folha:** Banco de horas negativo sem ação clara de aprovação/compensação
- **Qualidade ↔ Projetos:** Atrasos de disciplina não geram alertas no detalhe do projeto
- **Planejamento ↔ Tarefas:** Verificar se são a mesma fonte de dados — unificar se não forem

---

## 6. Performance e Técnico

- **Bundle size:** Verificar imports de gráficos (tree-shaking de recharts/chart.js)
- **Lazy loading de rotas:** Com 20+ rotas, garantir carregamento sob demanda
- **Cache/SWR:** Invalidação adequada dos KPIs do dashboard ao mudar dados em outros módulos
- **Formulários:** Padronizar `react-hook-form` + `zod` em todos os forms — alguns parecem validar só no servidor
- **Error boundaries:** Por módulo, para evitar que erro em Financeiro quebre o Chat
- **Paginação:** Cursor-based pagination nas listagens para suportar escala

---

## 7. Priorização Sugerida

### Sprint Imediata (bugs críticos)
1. Corrigir redirect de `/rh/funcionarios`
2. Tratar erro de `gerar-folha-lote` com feedback na UI
3. Adicionar página 404 personalizada

### Curto Prazo (1–2 sprints)
1. Componente `<EmptyState>` padrão em todos os módulos
2. Toast/snackbar de feedback consistente em todos os formulários
3. KPIs do dashboard clicáveis com filtro pré-aplicado
4. Filtros e ordenação nas listagens (Projetos, Clientes, Tarefas)
5. Histórico de solicitações no RH (abono, férias)

### Médio Prazo (3–5 sprints)
1. Integração com email (notificações de suporte, abono, leads)
2. Visualização semanal/diária na Agenda
3. Exportação de Gantt (PDF/PNG)
4. Alertas automáticos de qualidade e jurídico (vencimentos)
5. Página de detalhe dedicada para leads do Comercial (`/comercial/:id`)
6. Unificação Planejamento ↔ Tarefas (mesma fonte de dados)

### Longo Prazo (roadmap)
1. Integração Google Calendar / WhatsApp Business
2. Assinatura digital nos contratos (DocuSign/ClickSign)
3. Integração PNCP para licitações
4. Módulo Funcionários completo (atualmente inacessível)
5. PWA com suporte offline para registro de ponto
