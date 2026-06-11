# Relatório do Sistema — SenaHub

> **Documento de análise da proposta do sistema.**
> Plataforma web integrada para empresa de engenharia BIM: gerencia projetos,
> pessoas, finanças, documentos jurídicos, RH e comunicação interna em um só lugar.
>
> Estrutura do relatório: a **Parte 1** usa linguagem simples (para quem vai avaliar o
> negócio e o fluxo). A **Parte 2** (apêndices) traz o detalhe técnico (para auditor/dev).
>
> Gerado em 2026-06-11. Baseado na leitura direta do código-fonte.

---

## Sumário

- [Parte 1 — Visão simplificada](#parte-1--visão-simplificada)
  - [1. Resumo em uma página](#1-resumo-em-uma-página)
  - [2. Quem usa o sistema (perfis de acesso)](#2-quem-usa-o-sistema-perfis-de-acesso)
  - [3. Como o acesso é controlado](#3-como-o-acesso-é-controlado)
  - [4. Os módulos do sistema](#4-os-módulos-do-sistema-o-que-cada-um-faz-e-quem-acessa)
  - [5. Como os dados andam entre os módulos](#5-como-os-dados-andam-entre-os-módulos)
  - [6. Como os dados trafegam (canais de transporte)](#6-como-os-dados-trafegam-canais-de-transporte)
- [Parte 2 — Apêndices técnicos](#parte-2--apêndices-técnicos)
  - [A. Tecnologias utilizadas](#apêndice-a--tecnologias-utilizadas)
  - [B. APIs internas (inventário das 284 rotas)](#apêndice-b--apis-internas-inventário-completo)
  - [C. APIs e serviços externos](#apêndice-c--apis-e-serviços-externos)
  - [D. Modelo de dados](#apêndice-d--modelo-de-dados-212-tabelasenums)
  - [E. Tarefas automáticas (cron)](#apêndice-e--tarefas-automáticas-agendadas-cron)
  - [F. Front-end (interface do usuário)](#apêndice-f--front-end-interface-do-usuário)
- [Suposições e observações](#suposições-e-observações)

---

# Parte 1 — Visão simplificada

## 1. Resumo em uma página

O SenaHub é um **ERP sob medida** para um escritório de engenharia/projetos BIM.
Tudo que a empresa faz no dia a dia acontece dentro dele:

- **Vender** (CRM: leads, funil, propostas, metas comerciais)
- **Executar projetos** (disciplinas, prazos, EAP/cronograma, arquivos)
- **Receber e validar entregas** (upload de plantas/backups, validação do supervisor)
- **Controlar o dinheiro** (contas a pagar/receber, fluxo de caixa, DRE, conciliação bancária)
- **Gerir pessoas** (RH: ponto, férias, folha de pagamento, onboarding)
- **Conversar** (chat interno em tempo real)
- **Guardar documentos legais** (contratos, certidões, licitações)
- **Acompanhar** (dashboards, relatórios, índice de qualidade, auditoria)

**Tamanho do sistema (números reais do código):**

| Indicador | Quantidade |
|---|---|
| Telas/páginas | 98 |
| Endpoints de API (funções de back-end) | 284 |
| Tabelas e tipos de dados | 212 |
| Perfis de acesso | 8 |
| Módulos principais | ~14 |

**Ideia central de arquitetura:** é uma aplicação **única** (Next.js) que roda no
servidor local do escritório (Windows + Docker). O navegador conversa com o servidor,
o servidor guarda tudo num banco PostgreSQL e os arquivos de projeto ficam numa
**pasta de rede local** (nunca em nuvem externa). O acesso de fora vem por um túnel
seguro (Cloudflare).

---

## 2. Quem usa o sistema (perfis de acesso)

Existem **8 perfis**. Cada um vê só o que precisa.

| Perfil | Em linguagem simples | O que enxerga |
|---|---|---|
| **admin** | Dono do sistema | Tudo, sem restrição |
| **supervisor** | Gestor de operação | Todos os projetos e dados, valida entregas, RH, relatórios |
| **administrativo** | Apoio administrativo/financeiro | Comercial, financeiro, RH, licitações, fornecedores |
| **clt** | Funcionário registrado | Seus projetos, ponto, folha (resumo próprio), chat |
| **estagiario** | Estagiário | Seus projetos, ponto, chat |
| **projetista_pj** | Projetista terceirizado (PJ) | Só seus projetos e seu financeiro, chat dos projetos |
| **freelancer** | Colaborador avulso | Só seus projetos e extrato; **não entra no chat geral** |
| **cliente** | Cliente externo | Só seus projetos (leitura) e seu extrato financeiro |

**Dois grupos importam para entender as regras:**

- **Perfis "globais"** = `admin` + `supervisor`. Enxergam **todos** os projetos e dados.
- **Perfis "administrativos do RH"** = `admin` + `supervisor` + `administrativo`. Podem
  administrar ponto, escala, folha e banco de horas.
- Todos os demais enxergam **apenas o que é deles** (seus projetos, seu financeiro).

> **Observação:** o perfil `administrativo` existe no código mas não constava na tabela
> original de perfis da documentação do projeto. Ele foi incluído aqui por ser real.

---

## 3. Como o acesso é controlado

O sistema controla acesso em **3 camadas** (uma reforça a outra):

```
  Usuário (navegador)
        │
        ▼
  [1] PORTÃO DE ENTRADA POR TELA  ── middleware
        "Esse perfil pode abrir essa tela?"  (ex.: só admin abre /auditoria)
        │  sim
        ▼
  [2] PERMISSÃO FINA POR AÇÃO  ── tabela de permissões (configurável)
        "Esse perfil pode CRIAR/EDITAR/APROVAR isso?"  (ex.: lançar no financeiro)
        │  sim
        ▼
  [3] ESCOPO DOS DADOS  ── regra de negócio
        "De QUEM são os dados que ele pode ver?"  (ex.: projetista vê só os projetos dele)
        │
        ▼
     Resposta com os dados permitidos
```

1. **Portão por tela (middleware):** antes de qualquer página abrir, o sistema confere o
   perfil. Se não pode, redireciona para "sem permissão". Também força a **troca de senha**
   no primeiro acesso e aplica políticas de segurança do navegador (CSP).

2. **Permissão fina por ação (tabela de permissões):** cada combinação *recurso + ação*
   (ex.: `financeiro:lancar`, `rh:ver_salario`, `uploads:validar`) é checada numa **tabela
   no banco**. O `admin` sempre passa. Essa tabela é **configurável dentro do sistema**
   (tela Configurações → Permissões), ou seja, dá para mudar quem pode o quê **sem mexer no
   código**. As respostas ficam em cache rápido (Redis) por 10 minutos.

3. **Escopo dos dados (regra de negócio):** mesmo podendo abrir a tela, um projetista PJ só
   recebe **os dados dos projetos dele**. Perfis globais (admin/supervisor) recebem tudo.

**Login:** e-mail + senha (senha guardada criptografada com bcrypt). A sessão dura 8 horas.
Há **trava anti-força-bruta**: 10 tentativas erradas por e-mail a cada 5 minutos bloqueiam
temporariamente. Todo login (certo, errado ou bloqueado) é registrado.

---

## 4. Os módulos do sistema (o que cada um faz e quem acessa)

> "Dados que entram / saem" = de onde a informação vem e para onde ela vai depois.
> O acesso indicado é o **nível de tela**; dentro da tela, ações específicas (criar, aprovar…)
> ainda passam pela permissão fina da camada 2.

### 4.1 Comercial (CRM)
- **O que faz:** capta leads, organiza o funil de vendas (Kanban), registra oportunidades e
  atividades, monta **propostas** (com itens, condições de pagamento, versões e PDF), define
  metas comerciais e mostra um dashboard de vendas.
- **Quem acessa:** `admin`, `administrativo`.
- **Entra:** dados de clientes/leads, catálogo de disciplinas e tabelas de preço.
- **Sai:** uma **proposta aceita vira um Projeto** (com disciplinas) automaticamente; envia
  proposta por **e-mail** e rastreia se o cliente abriu (pixel de visualização).

### 4.2 Clientes
- **O que faz:** cadastro de clientes PF/PJ, contatos, histórico de projetos e documentos.
  Pode **criar um login de cliente** para acesso externo.
- **Quem acessa:** `admin`, `supervisor`.
- **Entra:** conversão de leads do Comercial; preenchimento de endereço por **CEP automático**.
- **Sai:** alimenta Projetos, Financeiro (contratos) e Jurídico (contratos do cliente).

### 4.3 Projetos
- **O que faz:** coração da operação. Cada projeto tem **disciplinas** (estrutural,
  hidráulica…), cada uma com seu próprio ciclo de status (`Aguardando → Em andamento →
  Em revisão → Entregue → Aprovado`), responsáveis, prazos, **EAP/cronograma** com linha de
  base, arquivos versionados, membros e log de revisões.
- **Quem acessa:** todos os perfis internos veem; **dados filtrados por participação**
  (projetista vê só os seus). Cliente vê os seus em leitura.
- **Entra:** vem do Comercial (proposta→projeto), recebe arquivos de Uploads.
- **Sai:** dispara pagamentos (Financeiro), horas (RH), tarefas e métricas de qualidade.

### 4.4 Uploads & Validação
- **O que faz:** o projetista envia 2 pacotes por disciplina — **Pacote A** (plantas/memoriais)
  e **Pacote B** (backup do software). O supervisor **valida**. Cada arquivo gera um registro
  imutável com autor, data/hora e **impressão digital SHA-256** (garante que não foi trocado).
- **Quem acessa (validar):** `admin`, `supervisor`.
- **Entra:** arquivos enviados pelos projetistas.
- **Sai:** a **validação libera o pagamento** do projetista (ligação direta com o Financeiro).
- **Onde fica:** pasta de rede local do servidor (`/data/projetos/ano/cliente/projeto/disciplina/`).

### 4.5 Financeiro
- **O que faz:** módulo grande, tipo ERP financeiro. Inclui:
  - Plano de contas, centros de custo, contas bancárias, fornecedores, sócios
  - **Contas a pagar / a receber**, parcelas, despesas, formas de pagamento
  - **Lançamentos** (receita/despesa) com status e recorrência
  - **Fluxo de caixa**, **conciliação bancária** (importa extrato OFX e casa transações)
  - **Folha de projetistas** (pagamento por entrega validada)
  - Relatórios: **DRE, DFC, Balanço, Indicadores**, planejamento orçamentário
- **Quem acessa:** `admin`, `supervisor`, `administrativo`, `clt`, `projetista_pj` (visão
  completa por perfil/permissão); `freelancer` e `cliente` veem **só o próprio extrato**.
- **Entra:** pagamentos vindos da validação de uploads; recebimentos de contratos; extratos
  bancários (OFX).
- **Sai:** relatórios gerenciais (DRE/DFC), alertas de inadimplência.

### 4.6 RH & Equipe
- **O que faz:**
  - **Ponto digital** (cronômetro de entrada/saída, banco de horas, escala, espelho de ponto)
  - **Rateio** automático das horas CLT entre os projetos do mês
  - **Férias** (período aquisitivo, agendamento, calendário)
  - **Abono de faltas** com anexo de atestado
  - **Folha de pagamento** (rubricas, holerites, encargos, geração automática)
  - **Onboarding** (checklists de admissão), documentos, dependentes, **notas fiscais de PJ**
  - **Clima emocional** (registro anônimo de humor da equipe)
- **Quem acessa:** todos os internos batem ponto e veem seu resumo. Administração de folha,
  funcionários, onboarding e validação de abonos: `admin`, `supervisor`, `administrativo`.
- **Entra:** horas trabalhadas, projetos do mês.
- **Sai:** rateio de custo de horas para o Financeiro; holerites por **e-mail**.

### 4.7 Chat Interno
- **O que faz:** mensagens em **tempo real**. Canal **#geral**, canais por **projeto**, e
  **mensagens diretas (DM)**. Tem menções (@), fixar mensagem, anexos, presença online e
  notificações.
- **Quem acessa:** `admin`, `supervisor`, `administrativo`, `clt`, `estagiario`,
  `projetista_pj`. **Freelancer e cliente não entram no chat geral** (regra de negócio).
- **Entra:** acesso aos canais conforme participação no projeto.
- **Sai:** dispara **notificação push** no navegador quando há menção ou DM.

### 4.8 Jurídico
- **O que faz:** repositório de **contratos** versionados (minuta → assinado → aditivo),
  **certidões** com controle de validade, modelos de contrato, pastas organizadas.
- **Quem acessa:** `admin`, `supervisor`, `administrativo`.
- **Entra:** contratos por projeto/cliente.
- **Sai:** **alertas automáticos** de vencimento de certidões e contratos (push, 30/15/7 dias).

### 4.9 Licitações
- **O que faz:** gestão de processos de licitação (modalidade, documentos com versões,
  histórico, medições) — uma variação de "projeto público".
- **Quem acessa:** `admin`, `administrativo`.
- **Sai:** alertas de prazo (15/7/1 dia); medições alimentam o Financeiro.

### 4.10 Tarefas
- **O que faz:** Kanban configurável com colunas personalizáveis, **dependências entre
  tarefas**, checklist, responsáveis, comentários e anexos.
- **Quem acessa:** todos os internos.

### 4.11 Planejamento & Recursos
- **O que faz:** workspace de planejamento (Kanban + Gantt rascunho) e **matriz de recursos**
  (quem está alocado em quê, detecção de **superalocação**).
- **Quem acessa:** Workspace — todos exceto cliente/freelancer; Recursos — `admin`,
  `supervisor`, `administrativo`.

### 4.12 Agenda
- **O que faz:** compromissos, convites com confirmação, agenda do dia.
- **Quem acessa:** todos os internos.

### 4.13 Relatórios & Dashboard / Qualidade
- **O que faz:** painel executivo, **DRE**, **SLA de entregas**, **índice de qualidade**
  (mede retrabalho por disciplina, com fotos mensais e gráfico de tendência).
- **Quem acessa:** principalmente `admin`, `supervisor` (relatórios sensíveis).

### 4.14 Auditoria, Suporte e Configurações
- **Auditoria:** registro imutável de tudo que acontece (quem fez o quê, quando, de qual IP).
  Acesso: **só `admin`**.
- **Suporte:** abertura de tickets internos. Acesso: todos.
- **Configurações:** disciplinas, tabelas de preço, feriados, **permissões**, usuários,
  rubricas, status de tarefas, etc. Acesso administrativo.

---

## 5. Como os dados andam entre os módulos

Esta é a parte mais importante para entender o **fluxo do sistema**. Os módulos não são
ilhas — eles se conversam. As principais "pontes" automáticas:

### Fluxo A — Da venda à execução
```
COMERCIAL                          PROJETOS
┌──────────────┐  proposta aceita  ┌──────────────────────┐
│  Proposta    │ ────────────────▶ │ Projeto + Disciplinas │
│ (itens,preço)│   "gerar projeto" │ (responsáveis, prazos)│
└──────────────┘                   └──────────────────────┘
       │ leads vêm de                       │
       ▼                                     ▼
   CLIENTES ◀──────────────────────── alimenta tudo
```
Uma proposta aprovada no Comercial **vira um projeto** com suas disciplinas, sem redigitação.

### Fluxo B — Da entrega ao pagamento (a regra mais crítica)
```
UPLOADS              VALIDAÇÃO            FINANCEIRO
┌─────────┐ envia   ┌──────────┐ aprova  ┌─────────────────────────┐
│ Pacote A│────────▶│Supervisor│────────▶│ Pagamento liberado      │
│ Pacote B│         │  valida  │         │  → cria Lançamento       │
└─────────┘         └──────────┘         │     (despesa, pendente)  │
                                          │  → ao pagar: confirmado  │
                                          │     → entra no DRE/Caixa │
                                          └─────────────────────────┘
```
**Regra de ouro:** o pagamento do projetista **só é liberado depois** que o supervisor valida
os dois pacotes. Quando libera, o sistema **cria automaticamente um lançamento financeiro**
(despesa), com a categoria certa conforme o tipo de profissional (PJ, freelancer, CLT,
estagiário). Quando o pagamento é efetivado, o lançamento vira "confirmado" e entra no
fluxo de caixa e na DRE.

### Fluxo C — Do ponto ao custo
```
RH (Ponto)            RH (Rateio)              FINANCEIRO / RELATÓRIOS
┌──────────┐ soma    ┌────────────────┐ rateia ┌──────────────────────┐
│ Cronômetro│───────▶│ Horas do mês   │───────▶│ Custo de horas CLT    │
│ entra/sai │        │ por projeto    │        │ distribuído por projeto│
└──────────┘         └────────────────┘        └──────────────────────┘
```
As horas batidas no ponto são **rateadas entre os projetos** do mês, e esse custo entra no
cálculo de margem de cada projeto.

### Fluxo D — Notificações (3 caminhos)
```
Evento no sistema
   ├──▶ Notificação interna (sininho na tela)
   ├──▶ Push no navegador  (menção no chat, upload pendente, certidão vencendo)
   └──▶ E-mail            (proposta para cliente, holerite para funcionário)
```

### Mapa-resumo das integrações
| De onde | Para onde | O que passa |
|---|---|---|
| Comercial → Projetos | Proposta aceita | Vira projeto + disciplinas |
| Comercial → Clientes | Lead convertido | Vira cliente |
| Uploads → Financeiro | Validação do supervisor | Libera e cria pagamento |
| Financeiro (pagamento) → Lançamentos | Pagamento efetivado | Vira despesa confirmada → DRE/Caixa |
| RH (ponto) → Projetos/Financeiro | Fim do mês | Rateio de custo de horas |
| Licitações → Financeiro | Medições | Valores a receber |
| Projetos → Qualidade | Revisões de disciplina | Índice de retrabalho |
| Qualquer módulo → Auditoria | Toda alteração | Log imutável |
| Chat / prazos / RH → Notificações | Eventos | Push, e-mail, sininho |

---

## 6. Como os dados trafegam (canais de transporte)

Existem **5 canais** pelos quais a informação circula:

1. **Web/HTTP (o principal):** o navegador faz pedidos às 284 funções de API; elas conversam
   com o banco PostgreSQL e devolvem os dados em formato JSON. Toda alteração (criar, editar,
   apagar) é validada (Zod) e registrada na auditoria.

2. **Tempo real (WebSocket / Socket.io):** o chat não usa "atualizar a página" — as mensagens
   chegam instantaneamente por uma conexão permanente, autenticada pelo mesmo login. Quando há
   vários servidores, eles se sincronizam via Redis.

3. **Memória rápida (Redis):** guarda coisas temporárias para o sistema responder rápido —
   cache de permissões, cache de relatórios financeiros, fila de notificações, controle de
   tentativas de login e sincronização do chat.

4. **Arquivos (disco local):** plantas, backups, avatares, documentos de RH e atestados ficam
   numa **pasta do servidor local** (não em nuvem). Cada arquivo ganha uma impressão digital
   SHA-256 para garantir integridade, e o sistema bloqueia tentativas de acessar pastas fora
   da área permitida.

5. **Tarefas agendadas (cron):** rotinas que rodam sozinhas em horários definidos (backup
   diário, alertas de vencimento, fechamento de folha, fotos de qualidade). São protegidas por
   uma senha secreta (`CRON_SECRET`).

E **3 portas para o mundo externo:** consulta de CEP, envio de e-mail (SMTP) e notificações
push do navegador. Detalhes no [Apêndice C](#apêndice-c--apis-e-serviços-externos).

---

# Parte 2 — Apêndices técnicos

## Apêndice A — Tecnologias utilizadas

### Frontend
| Tecnologia | Versão | Para quê |
|---|---|---|
| Next.js (App Router) | ^15.5.18 | Framework full-stack (telas + API no mesmo projeto) |
| React | ^19.2.6 | Biblioteca de interface |
| Tailwind CSS | ^3.4.6 | Estilização utilitária (mobile-first) |
| shadcn/ui + Radix UI | vários | Componentes acessíveis (dialog, select, toast, tooltip…) |
| lucide-react | ^0.400.0 | Ícones |
| recharts | ^3.8.1 | Gráficos (dashboards, DRE, qualidade) |
| @dnd-kit | ^6/^10 | Arrastar-e-soltar (Kanban de tarefas/funil) |
| react-hook-form + @hookform/resolvers | ^7 / ^3 | Formulários |
| react-day-picker | ^10 | Seleção de datas |
| date-fns + date-fns-tz | ^3 | Datas e fuso horário |

### Backend / Plataforma
| Tecnologia | Versão | Para quê |
|---|---|---|
| Next.js API Routes | ^15 | 284 endpoints de back-end |
| Node.js + servidor custom (`server.ts`) | — | Sobe Next.js + Socket.io no mesmo processo |
| Socket.io + socket.io-client | ^4.7.5 | Chat em tempo real (WebSocket) |
| @socket.io/redis-adapter | ^8.3.0 | Sincroniza chat entre instâncias via Redis |
| Prisma ORM + @prisma/client | ^5.22 | Acesso ao banco (212 modelos) |
| PostgreSQL | (Docker) | Banco de dados principal |
| Redis (ioredis) | ^5.4.1 | Cache, filas, sessões de chat, rate-limit |
| NextAuth.js | ^4.24.7 | Autenticação (login por credenciais, JWT) |
| bcryptjs | ^2.4.3 | Criptografia de senhas |
| Zod | ^3.23.8 | Validação de dados de entrada |

### Geração de arquivos / Integrações
| Tecnologia | Versão | Para quê |
|---|---|---|
| nodemailer | ^8.0.10 | Envio de e-mail (SMTP) — propostas e holerites |
| web-push | ^3.6.7 | Notificações push no navegador (VAPID) |
| jsPDF + jspdf-autotable | ^4 / ^5 | Geração de PDF (propostas, relatórios) |
| exceljs + xlsx | ^4.4 / ^0.18 | Exportação para Excel (DRE, planejamento) |
| archiver | ^8.0.0 | Geração de ZIP (download de pacotes de arquivos) |
| sharp | ^0.33.4 | Processamento de imagens (avatares) |

### Infraestrutura (conforme documentação do projeto)
- **Servidor:** Windows 11 + WSL2 + Docker Desktop
- **Proxy reverso + HTTPS:** Nginx
- **Acesso externo:** Cloudflare Tunnel → `senahub.empresa.com.br`
- **Armazenamento de arquivos:** pasta de rede local (`/data/projetos`, via volume Docker)
- **Backup:** dump diário do PostgreSQL + rsync (cron no WSL2)

### Ferramentas de desenvolvimento
TypeScript ^5.5, ESLint, Vitest (testes), tsx (execução), Prisma CLI, PostCSS/Autoprefixer.

---

## Apêndice B — APIs internas (inventário completo)

**284 endpoints**, agrupados por módulo. Convenção REST: `GET` = consultar/listar,
`POST` = criar, `PUT`/`PATCH` = editar, `DELETE` = remover. **Toda mutação é auditada**
(via `withAudit`/`logAudit`); `[id]`, `[token]` etc. são parâmetros dinâmicos.

> O acesso fino de cada rota é resolvido em tempo de execução pela tabela de permissões
> (`recurso:ação`), configurável na tela Configurações → Permissões. A coluna "Acesso"
> abaixo reflete o nível de módulo (ver Parte 1, seção 4).

### Autenticação & Conta (`/api/auth`, `/api/user`, `/api/push`)
- `auth/[...nextauth]` — login/sessão (NextAuth)
- `auth/solicitar-cadastro` — pedido de cadastro
- `auth/solicitar-reset` — pedido de reset de senha
- `auth/trocar-senha` — troca de senha
- `user/preferences` — preferências do usuário
- `push/subscribe` — registrar dispositivo para push
- **Acesso:** público (login/solicitações) / usuário autenticado (demais)

### Comercial (`/api/comercial`) — admin, administrativo
- `dashboard`
- `leads`, `leads/[id]`, `leads/[id]/converter`
- `funil/etapas`, `funil/etapas/[id]`
- `oportunidades`, `oportunidades/[id]`, `.../atividades`, `.../historico`
- `propostas`, `propostas/[id]`, `propostas/buscar`
- `propostas/[id]/`: `status`, `versao`, `copiar`, `itens`, `condicoes`, `anexo`,
  `comparar`, `importar`, `email`, `visualizacoes`, `gerar-projeto`
- `metas`, `metas/[id]`

### Propostas públicas (`/api/a`, `/api/t`, `/api/p`) — acesso por token
- `a/proposta/[token]` — visualização pública da proposta pelo cliente
- `t/proposta/[token]`, `t/proposta/[token]/pixel` — rastreio de abertura
- `p/inputs/[token]` — formulário público de inputs do projeto

### Clientes (`/api/clientes`) — admin, supervisor
- `clientes`, `clientes/[id]`, `clientes/[id]/criar-usuario`

### Projetos (`/api/projetos`) — internos (dados filtrados por participação)
- `projetos`, `projetos/[id]`, `.../visao-geral`, `.../status`, `.../membros`
- `.../disciplinas`, `.../disciplinas/[disciplinaId]/status`, `.../revisao-solicitacoes`
- `.../arquivos`, `.../arquivos/[arquivoId]/versoes`, `.../versoes/[versaoId]/download`,
  `.../arquivos/download-zip`
- `.../eap`, `.../eap/[tarefaId]`, `.../eap/resumo`, `.../eap/linha-base`
- `.../inputs`, `.../inputs/link`, `.../inputs/link/[linkId]`
- `.../servicos-fornecedor`
- Disciplinas (transversal): `disciplinas/[id]`, `.../pagamento`, `.../responsaveis`,
  `disciplinas/catalogo`
- Pranchas: `pranchas/[id]`, `pranchas/disciplina/[disciplinaId]`, `.../importar`
- Config LM: `lm-config`, `lm-config/[id]`, `lm-config/projeto/[projetoId]`

### Uploads & Validação (`/api/uploads`) — validar: admin, supervisor
- `uploads`, `uploads/pendentes`, `uploads/[id]/download`, `uploads/[id]/validar`,
  `uploads/[id]/versoes`, `uploads/disciplina/[disciplinaId]/zip`, `uploads/nf-pj/[id]/download`

### Financeiro (`/api/financeiro`, `/api/relatorios`, `/api/fornecedores`)
admin, supervisor, administrativo (+ clt/projetista por permissão; freelancer/cliente: extrato)
- Cadastros: `centros-de-custo`, `contas-bancarias`(+`/extratos`), `contatos`, `formas-pagamento`,
  `fornecedores`, `socios`(+`/retiradas`), `tags`, `plano-de-contas`, `regras-categorizacao`
- A pagar: `contas-a-pagar`, `.../[id]`, `.../aprovar`, `.../anexos`
- A receber: `contas-a-receber`, `.../[id]`
- Lançamentos: `lancamentos`, `.../[id]`, `.../status`, `.../serie`, `.../anexos`
- Despesas/parcelas/pagamentos: `despesas`, `parcelas/[id]`, `pagamentos/[id]`
- Caixa & conciliação: `fluxo-caixa`, `visao-geral`, `extratos/[id]/transacoes`,
  `transacoes/[id]/conciliar`, `transacoes/[id]/sugestoes`
- Folha de projetistas: `folha-projetistas`, `.../[id]`, `.../aprovar`, `.../pagar`
- Por projeto: `projetos/[projetoId]`, `.../parcelas`
- Licitação: `medicoes-licitacao`, `.../[id]`
- Orçamento & planejamento: `orcamento`, `planejamento/itens`, `.../gastos`, `.../rascunho`,
  `.../importar-gastos`, `.../exportar`, `.../visualizacoes`
- Relatórios: `relatorios/dre`(+`/xlsx`), `relatorios/dfc`, `relatorios/balanco`,
  `relatorios/indicadores`; `relatorios/dre`, `relatorios/sla` (nível raiz)
- Fornecedores (raiz): `fornecedores`, `fornecedores/[id]`; serviços de fornecedor:
  `servicos-fornecedor`(+`/[id]`, `/anexos`)

### RH (`/api/rh`) — admin, supervisor, administrativo (autoatendimento: todos internos)
- Ponto: `ponto`, `ponto/registro`, `ponto/sessao`, `ponto/abertos`, `ponto/admin`,
  `ponto/banco`, `ponto/escala`, `ponto/espelho`
- Férias: `ferias`, `ferias/[id]`, `ferias/calendario`, `ferias/meu-pa`
- Abono: `abono`, `abono/[id]`, `abono/[id]/atestado`, `abono/faltas`
- Folha: `folha`, `folha/[id]`, `.../calcular-encargos`, `.../fechar`, `.../reabrir`,
  `.../gerar-automatico`, `.../holerite`
- Holerite: `holerite/[id]`, `.../itens`, `.../itens/[itemId]`, `.../copiar`, `.../email`
- Funcionários: `funcionarios`, `funcionarios/[id]`, `.../dependentes`, `.../documentos`,
  `.../desligar`; `docs/[id]/download`
- Onboarding: `onboarding`, `.../[id]`, `.../itens/[itemId]`, `templates`(+`/[id]`, `/itens`)
- NF de PJ: `notas-fiscais-pj`(+`/[id]`, `/status`, `/anexo`, `/pagamentos-disponiveis`)
- Equipe & clima: `equipe`, `feedbacks`, `rateio`, `resumo-individual`, `rubricas`(+`/[id]`),
  `usuarios`(+`/[id]`), `emocoes`(+`/hoje`, `/resumo`)

### Chat (`/api/chat`) — internos exceto freelancer/cliente
- `canais`, `[canalId]/mensagens`, `dm`, `usuarios`, `status`, `upload`, `files/[filename]`

### Jurídico (`/api/juridico`) — admin, supervisor, administrativo
- `pastas`, `modelos`, `alertas`
- `documentos`(+`/[id]`, `/download`, `/versoes`)
- `certidoes`(+`/[id]/download`, `/[id]/versoes`, `/tipos`, `/tipos/[id]`)

### Licitações (`/api/licitacoes`) — admin, administrativo
- `licitacoes`, `licitacoes/[id]`, `.../documentos`, `.../documentos/[docId]/versoes`,
  `.../versoes/[versaoId]/download`

### Tarefas (`/api/tarefas`) — internos
- `tarefas`, `tarefas/[id]`, `.../status`, `.../responsaveis`, `.../dependencias`,
  `.../itens`(+`/[itemId]`), `.../comentarios`, `.../anexos`, `tarefas/status` (config)

### Planejamento & Recursos — Workspace: internos (não cliente/freelancer); Recursos: gestores
- `planejamento/workspace`, `planejamento/aplicar`
- `recursos`, `recursos/[id]`, `recursos/matrix`
- `alocacoes`, `alocacoes/[id]`

### Agenda (`/api/agenda`) — internos
- `compromissos`, `compromissos/[id]`, `.../confirmar`, `dados`, `hoje`

### Qualidade (`/api/qualidade`) — gestores
- `projetista/[userId]`, `projeto/[projetoId]`

### Suporte (`/api/suporte`) — todos
- `tickets`, `tickets/[id]`, `.../anexos`, `.../anexos/[anexoId]`

### Configurações (`/api/configuracoes`) — administrativo/admin
- `usuarios`, `usuarios/reset-senha`, `permissoes`, `perfil`, `avatar`(+`/[userId]/[fileName]`),
  `sistema`, `solicitacoes`(+`/[id]`), `disciplinas`(+`/[id]`), `tabelas-preco`(+`/[id]`),
  `feriados`(+`/[id]`, `/seed`), `tarefas/status`

### Auditoria & Logs (`/api/logs`) — admin
- `logs`, `logs/stats`, `logs/client-error`

### Notificações & utilidades
- `notificacoes`, `notificacoes/[id]` — autenticado
- `search` — busca global, autenticado
- `cep/[cep]` — consulta de CEP (chama ViaCEP)
- `admin/criar-canais-projetos` — admin
- `cron/*` — ver Apêndice E

---

## Apêndice C — APIs e serviços externos

O sistema é **autocontido** e propositalmente depende pouco de serviços de terceiros.
Integrações externas (saída para fora do servidor):

| Serviço | Tipo | Para quê | Onde no código | Observação |
|---|---|---|---|---|
| **ViaCEP** (`viacep.com.br`) | HTTP GET público | Autopreencher endereço pelo CEP | `app/api/cep/[cep]/route.ts` | Sem chave; timeout 5s; cache 24h. Único serviço de dados externo. |
| **SMTP (e-mail)** | Protocolo SMTP via nodemailer | Enviar propostas ao cliente e holerites aos funcionários | `comercial/propostas/[id]/email`, `rh/holerite/[id]/email` | Servidor configurável por variáveis `SMTP_*`. |
| **Web Push (VAPID)** | Push do navegador | Notificar menções, uploads pendentes, vencimentos | `lib/push.ts` | Usa chaves `VAPID_*`; entrega via serviço de push do próprio navegador (Google/Mozilla/Apple). |
| **Cloudflare Tunnel** | Túnel de rede | Acesso externo seguro (HTTPS) ao servidor local | Infraestrutura (não no código) | Conforme documentação do projeto. |

**Não há** integração com gateway de pagamento, nuvem de arquivos (S3/Drive), API de NF-e,
bancos (Open Finance) ou redes sociais. Conciliação bancária é feita por **importação manual
de arquivo OFX** (offline), não por API bancária.

### Variáveis de ambiente (configuração / segredos)
`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `CRON_SECRET`,
`STORAGE_BASE_PATH`, `UPLOAD_PATH`, `AVATAR_BASE_PATH`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `PORT`, `NODE_ENV`.

---

## Apêndice D — Modelo de dados (212 tabelas/enums)

São **212 modelos e tipos** no Prisma. Agrupados por domínio:

- **Identidade & acesso:** User, UserPreference, Permissao, SolicitacaoCadastro,
  SolicitacaoResetSenha, AuditLog
- **Clientes & comercial:** Cliente, ContatoCliente, FunilEtapa, Lead, Oportunidade,
  AtividadeComercial, OportunidadeHistorico, Proposta (+ Condicao, Versao, VersaoItem, Anexo,
  StatusHistorico, Visualizacao), MetaComercial
- **Projetos:** Projeto, ProjetoMembro, InputProjeto, LinkPublicoInput, Disciplina (+ Catalogo,
  Responsavel, Status), SolicitacaoRevisao(+Anexo), ArquivoProjeto(+Versao), Prancha, LmConfig
- **EAP/Planejamento:** TarefaEAP(+Predecessora), LinhaBase, PlanejamentoItem,
  PlanejamentoRascunho/Gasto/Visualizacao, PlanoAplicado, Recurso, Alocacao
- **Tarefas:** TarefaStatus, Tarefa, TarefaResponsavel, TarefaDependencia, TarefaItem,
  TarefaComentario, TarefaAnexo, TarefaStatusHistorico
- **Uploads:** Upload
- **Financeiro:** Categoria, Centro, Conta, Contato, FormaPagamento, Tag, Fornecedor, Socio,
  ContaPagar(+Anexo), ContaReceber(+Retencao), RetiradaSocio, ExtratoBancario, TransacaoBancaria,
  RegraCategorizacao, Lancamento(+Tag, Anexo, StatusHistorico, RecorrenciaGrupo), Orcamento,
  ContratoFinanceiro, Parcela, PagamentoProjetista, FolhaProjetista(+Item), DespesaGeral,
  DisciplinaValorLicitacao, MedicaoLicitacao, FornecedorServico, ServicoFornecedor(+Anexo),
  TabelaPreco, ItemTabelaPreco, ProjetoComposicaoPreco, ItemComposicaoPreco
- **RH:** Funcionario(+Documento, Dependente), Onboarding (Template, ItemTemplate, Processo,
  ProcessoItem), PeriodoAquisitivo, Ferias, EscalaTrabalho, RegistroPonto, BancoHorasMensal,
  Feriado, SessaoTrabalho, RateioHora, Habilidade, UserHabilidade, FeedbackRH, AbonoFalta(+Registro),
  RubricaFolha, FolhaPagamento, Holerite(+Item, EnvioEmail), NotaFiscalPJ(+Historico),
  IndiceQualidadeSnapshot, RegistroEmocao
- **Jurídico:** PastaJuridica, DocumentoJuridico(+Versao), ModeloContrato, CertidaoTipo,
  Certidao(+Versao); Licitacao(+Documento, DocumentoVersao, Historico)
- **Chat & notificações:** Canal, Mensagem, MensagemLeitura, PushSubscription, Notificacao
- **Agenda & suporte & sistema:** Compromisso(+Participante), TicketSuporte(+Anexo),
  ConfigSistema

---

## Apêndice E — Tarefas automáticas (agendadas / cron)

Rodam sozinhas (Windows Task Scheduler chama a URL com a senha `CRON_SECRET`):

| Rotina | Frequência sugerida | O que faz |
|---|---|---|
| `cron/backup` | Diária | Recebe resultado do backup do banco; notifica admin se falhar |
| `cron/certidoes` | Diária 08:00 | Alerta de certidões vencendo em 30/15/7 dias (push) |
| `cron/licitacoes` | Diária | Alerta de prazos de licitação em 15/7/1 dia |
| `cron/notificacoes` | A cada 5 min | Esvazia a fila de notificações push agrupadas |
| `cron/qualidade` | Diária 02:00 (roda no dia 1º) | Grava as "fotos" mensais do índice de qualidade |
| `cron/rh` | Diária 01:00 | Períodos aquisitivos, transições de férias, banco de horas, rateio, geração de folha de projetistas, propostas atrasadas |

---

## Apêndice F — Front-end (interface do usuário)

> Em linguagem simples: é a "cara" do sistema — o que o usuário vê e toca. Foi feita para
> funcionar bem **no celular e no computador**, com visual próprio (não um template genérico),
> e pode ser **instalada como app** no telefone.

### F.1 Arquitetura da interface
- **Next.js App Router** com renderização híbrida: a maioria das telas é montada no
  **servidor** (Server Components, mais rápido e seguro) e só as partes interativas viram
  **componentes de cliente** (`'use client'`) — formulários, Kanban, chat, gráficos.
- **Grupos de rota** separam contextos: `(auth)` para login e `(dashboard)` para o sistema
  logado, cada um com seu layout.
- **205 componentes** organizados por módulo (`projetos/`, `financeiro/`, `rh/`, `chat/`…)
  mais uma base reutilizável em `components/ui/`.
- **Provedores globais** (`components/providers.tsx`): sessão de login (NextAuth),
  notificações *toast*, e um **capturador de erros** que envia falhas do navegador para o
  servidor (`/api/logs/client-error`) — ajuda a diagnosticar problemas em produção.

### F.2 Estrutura de tela (layout)
O "esqueleto" (`Shell`) combina:
- **Sidebar** (menu lateral) — no computador.
- **Bottom Nav** (barra inferior) — só no celular (`lg:hidden`), com os itens prioritários
  no mobile: **Início, Projetos, Tarefas, Planejar, Ponto, Configurações**.
- **Header** com título da tela, relógio e botão de chat.
- **Chat flutuante** disponível em qualquer tela.

### F.3 Mobile-first e PWA (app instalável)
- Layout pensado primeiro para o **celular**; respeita áreas seguras do aparelho
  (`safe-area-inset`, *notch*).
- **PWA** habilitado (`manifest.json`): instalável na tela inicial do telefone, abre em modo
  **standalone** (sem barra do navegador), orientação retrato, cor de tema `#07111D`.
- **Service Worker** (`public/sw.js`): recebe **notificações push** mesmo com o app fechado e,
  ao clicar na notificação, abre/foca a tela certa do sistema.

### F.4 Identidade visual — "Blueprint Navy"
- **Tema escuro por padrão**, com **alternância para tema claro** (botão *theme-toggle*); a
  preferência é lembrada e aplicada **antes** da tela aparecer (evita "piscar" de cor).
- **Paleta** definida em variáveis CSS (HSL): superfícies azul-marinho derivadas da marca,
  acento azul-aço, e **cores semânticas** (sucesso/alerta/perigo/info).
- **Cores específicas por status de disciplina** (Aguardando=violeta, Em andamento=ciano,
  Em revisão=rosa, Entregue=âmbar, Aprovado=verde) — leitura visual rápida do andamento.
- **Tipografia:** **Kanit** (texto e títulos) + **JetBrains Mono** (IDs, códigos, datas).
- **Escala de cantos** (6/10/14/20px) e **animações** próprias (fade-up, linhas de grade
  estilo "planta baixa", pulso de destaque) reforçam a estética de engenharia/blueprint.

### F.5 Componentes e bibliotecas de UI
- **Base shadcn/ui sobre Radix UI** (acessível por padrão): botões, cards, inputs, select,
  tabs, checkbox, avatar, badge, progress, skeleton, toast, tooltip, diálogos.
- **Componentes sob medida:** `kanban-board` (arrastar-e-soltar via **@dnd-kit**),
  `currency-input` (moeda BRL), `date-picker` (calendário pt-BR).
- **Formulários:** **react-hook-form** + validação **Zod** (mesma validação do back-end).
- **Gráficos:** **Recharts** (dashboards, DRE/DFC, medidor e linha do índice de qualidade).
- **Ícones:** lucide-react.

### F.6 Tempo real e feedback ao usuário
- **Chat ao vivo** via Socket.io no cliente (`lib/socket.ts`): mensagens, presença
  ("quem está online") e indicadores chegam sem recarregar a página.
- **Notificações** em três frentes percebidas pelo usuário: *toast* na tela, **push** no
  navegador/celular e o sininho interno.
- **Estados de carregamento** com *skeletons* e **tratamento de erro** padronizado.

### F.7 Segurança no front-end
- **CSP com nonce** por requisição (bloqueia scripts não autorizados).
- App marcado como **não indexável** (`robots: index:false`) — é uso interno.
- Acesso às telas é barrado **antes da renderização** pelo middleware (não depende de esconder
  botão no JavaScript); a navegação só **oculta** o que o perfil não pode ver.

---

## Suposições e observações

> Pontos onde a documentação do projeto e o código divergem, ou onde houve inferência.
> Sinalizados para transparência com quem for analisar.

1. **Versões da stack:** a documentação do projeto cita "Next.js 14". O código real
   (`package.json`) usa **Next.js 15.5.18 e React 19**. Este relatório usa as versões reais.

2. **Perfil `administrativo`:** existe no código e é amplamente usado (financeiro, RH,
   comercial, licitações), mas **não constava** na tabela original de perfis da documentação.
   Foi incluído por ser real.

3. **Granularidade de acesso:** o acesso por **tela** foi lido do controle de rotas
   (`middleware.ts`) e da navegação (`nav-config.ts`). O acesso por **ação** (criar, aprovar,
   ver salário…) é resolvido em tempo de execução por uma **tabela de permissões configurável
   no banco**, não fixa no código. Portanto a "matriz fina" exata vive no banco de dados e
   pode ser ajustada pelo admin sem deploy. **Não foi auditado cada um dos 284 handlers
   individualmente** — o acesso indicado é em nível de módulo.

4. **Pequenas divergências navegação × enforcement:** em alguns casos a barra lateral
   esconde um item de um perfil enquanto o controle de rotas ainda o permitiria (ex.: Jurídico,
   Relatórios para `administrativo`). O bloqueio efetivo é o do `middleware` + tabela de
   permissões; a navegação é só dica visual. Vale uma revisão de consistência.

5. **Conciliação bancária é offline:** não há conexão com API de banco. O extrato é importado
   por arquivo **OFX** e o sistema sugere a conciliação.

6. **Presença online do chat:** o mapa de quem está online é mantido em memória por instância;
   a documentação do código observa que cenário multi-instância exigiria mover isso para o
   Redis (o Redis já é usado para o pub/sub das mensagens).

7. **Frequências de cron** são as **sugeridas** nos comentários do código; o agendamento real
   depende da configuração do Task Scheduler no servidor.

8. **Nome da identidade visual:** o arquivo de estilos (`globals.css`) chama o tema de
   **"Blueprint Navy"**, enquanto a configuração do Tailwind e a documentação interna usam
   **"Blueprint Noir"**. É o mesmo tema (azul-marinho escuro) — apenas duas grafias do nome.
```