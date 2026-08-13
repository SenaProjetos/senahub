# SENAHub — Reformulação do Comercial em CRM B2B

## Playbook de execução com Claude Code

Este documento tem três partes:

- **Parte A** — Diagnóstico do seu prompt: o que está bom, o que falta e quais decisões precisam ser fechadas _antes_ de qualquer linha de código.
- **Parte B** — Preparação do ambiente do Claude Code (o que fazer antes do primeiro prompt).
- **Parte C** — Os prompts prontos, numerados, com modelo de IA recomendado, modo de execução e critério de aceite de cada um.

---

# PARTE A — DIAGNÓSTICO DO PROMPT ORIGINAL

## A.1 O que já está muito bom (mantenha)

- A separação conceitual Empresa → Contato → Prospecção → Oportunidade é **a decisão certa** e é a raiz de 80% do valor da reforma.
- Exigir auditoria antes de codar (itens 1, 42 e 46).
- Proibir explicitamente IA/lead scoring nesta etapa (item 38). Isso evita que o agente gaste esforço em coisa não verificável.
- Canal / Origem detalhada / Campanha separados (item 12) — é exatamente o que permite medir aquisição depois.
- Motivo de perda obrigatório e padronizado (item 18).
- Critérios de aceitação em forma de fluxo narrativo (item 44) — excelente, é testável.
- Proibição de scraping do LinkedIn (item 13).

## A.2 Lacunas críticas do prompt

### 1. Falta o contexto técnico do projeto

O prompt não diz o stack (Next.js? App Router? Prisma? Drizzle? Postgres? Supabase? tRPC? server actions?), como é a autenticação, se há multi-tenant, como são as permissões, se há testes. O agente vai descobrir sozinho — e vai gastar contexto caro fazendo isso em toda sessão nova.
**Correção:** a Fase 0 deve produzir um `docs/crm/00-auditoria.md` e um `CLAUDE.md` na raiz com o stack e as convenções. Todo prompt seguinte lê esses arquivos em vez de redescobrir.

### 2. É um prompt único e gigante — vai estourar o contexto

Um único prompt com 46 seções faz o agente começar bem e degradar no meio. Claude Code trabalha melhor com **memória em disco**: o plano vive em `docs/crm/`, não no histórico da conversa.
**Correção:** dividir em ~18 prompts, cada um com entrada e saída em arquivo. Rodar `/clear` entre fases.

### 3. Não há "definition of done" verificável por fase

Não existe instrução de rodar typecheck, lint, build, testes, nem de como provar que nada quebrou.
**Correção:** bloco padrão de guardrails em todo prompt (Parte B.3).

### 4. Migração descrita como intenção, não como estratégia

"Criar migration segura" não é executável. Migração de dados em produção precisa de padrão **expand → backfill → migrate → contract**: primeiro adiciona colunas/tabelas novas sem remover nada, depois preenche, depois troca a leitura, e só semanas depois remove o antigo.
**Correção:** prompt dedicado (P3) com esse padrão explícito, script de auditoria pré-migração que gera relatório de contagem por bucket, flag `needsReview`, e reversibilidade.

### 5. Falta feature flag / estratégia de convivência

Durante semanas o Comercial antigo e o novo vão coexistir. Sem flag, ou você quebra a operação ou trava a entrega.
**Correção:** `NEXT_PUBLIC_CRM_V2` (ou equivalente) desde a Fase 1; rota nova em `/comercial/v2` até virar a chave.

### 6. Definições ambíguas de métrica

"Taxa de conversão" e "ticket médio" têm 3 leituras cada. Conversão medida por coorte de criação ou por fechamento no período? Ticket médio por contrato ou por empresa? Se você não definir, o agente escolhe — e o dashboard vira número bonito e inútil.
**Correção:** um **dicionário de métricas** (P12) escrito antes de qualquer gráfico, com a fórmula e a query de cada KPI.

### 7. LGPD ausente

Você vai armazenar dados pessoais de contatos captados em prospecção fria. Precisa de: base legal registrada (legítimo interesse), campo de _opt-out_/descadastro, data e origem da coleta, e capacidade de exclusão a pedido.
**Correção:** campos `optOut`, `optOutAt`, `dataCollectionSource`, `dataCollectedAt` no Contato desde a Fase 1, e respeito ao opt-out nas listas de ação.

### 8. Permissões/visibilidade não especificadas

"Toda oportunidade tem responsável" (item 37) não responde: um comercial vê o pipeline do outro? Quem pode alterar valor? Quem pode aprovar desconto acima de X%?
**Correção:** decidir na P1 (sugestão padrão: todos veem tudo, só o responsável e admin editam; desconto acima de um limite exige registro de justificativa).

### 9. Falta padronização de dados básicos

Moeda e precisão (usar `Decimal`, nunca `Float`, para valores), timezone (America/Recife — cuidado com cálculo de "dias sem contato" e "hoje"), formatação pt-BR, enums em inglês no banco com rótulos pt-BR na UI (senão você fica preso a `NEGOCIACAO` com acento no banco).

### 10. Falta política de histórico/auditoria unificada

O item 15 (timeline) e o item 39 (auditoria) são **coisas diferentes** e o prompt trata como se fossem quase a mesma. Timeline = narrativa de negócio para humanos. Auditoria = log técnico imutável de quem mudou o quê.
**Correção:** duas tabelas (`Activity` e `AuditLog`), decidido explicitamente na P2.

### 11. "Contrato" aparece no fluxo mas não tem entidade

Seção 45 diz que o SENAHub é fonte oficial de Contratos, mas nenhuma seção define a entidade Contrato. Hoje provavelmente Projeto faz esse papel.
**Correção:** decidir na P1. Sugestão: **não criar entidade Contrato na v1** — proposta aceita + Projeto cobrem o caso; deixe o gancho no schema.

### 12. Falta instrução de versionamento e granularidade de commit

**Correção:** uma branch por fase, commits pequenos com mensagem convencional, nunca commitar migration junto com refactor de UI.

## A.3 Decisões que precisam ser fechadas ANTES do código

Leve estas ao agente na P2 e responda uma a uma. Sugiro um padrão para cada, para você só confirmar ou mudar:

| #   | Questão                                                         | Sugestão de default                                                                                      |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Prospecção pertence à Empresa ou ao Contato?                    | À **Empresa**, com N contatos vinculados; contato principal opcional                                     |
| 2   | Pode haver 2 prospecções abertas para a mesma empresa?          | Não. Uma ativa por empresa+campanha; as demais viram interações                                          |
| 3   | CNPJ é obrigatório?                                             | **Não.** Prospect de Sales Navigator raramente tem. Único _quando preenchido_ (índice parcial)           |
| 4   | Oportunidade tem 1 ou N empreendimentos?                        | **1**. Vários empreendimentos = várias oportunidades                                                     |
| 5   | Versionamento de proposta: nova tabela ou auto-relacionamento?  | Tabela `ProposalVersion` filha de `Proposal`; `Proposal` é 1:1 com a negociação, versões são o histórico |
| 6   | Oportunidade → Projeto é 1:1 ou 1:N?                            | **1:N** (um contrato pode gerar projetos por disciplina), mas na v1 crie 1 e permita mais                |
| 7   | Existe entidade Contrato?                                       | Não na v1                                                                                                |
| 8   | Status da Empresa (PROSPECT/CLIENTE) é manual ou derivado?      | **Derivado** de ter ao menos 1 proposta aceita, com override manual                                      |
| 9   | Temperatura existe em Lead e Oportunidade?                      | Sim, campos independentes, ambos manuais                                                                 |
| 10  | Oportunidade perdida pode ser reaberta?                         | Sim, com registro na timeline e no audit log                                                             |
| 11  | Exclusão de registros                                           | **Soft delete** em Empresa, Contato, Lead, Oportunidade                                                  |
| 12  | Probabilidade                                                   | Default por estágio vindo de tabela de configuração; override manual por oportunidade                    |
| 13  | Disciplinas na oportunidade têm valor individual?               | Sim, valor opcional por disciplina (habilita o item 28 do seu prompt)                                    |
| 14  | Moeda                                                           | BRL apenas, `Decimal(14,2)`                                                                              |
| 15  | Quem vê o pipeline?                                             | Todos veem; edita o responsável + admin                                                                  |
| 16  | O que acontece com Leads atuais que já são oportunidades reais? | Regra determinística de classificação + flag `needsReview` para os ambíguos                              |

---

# PARTE B — PREPARAÇÃO DO AMBIENTE

## B.1 Estrutura de documentação que o agente vai manter

Crie a pasta `docs/crm/`. Os prompts abaixo produzem e consomem estes arquivos:

```
docs/crm/
  00-auditoria.md        # o que existe hoje
  01-decisoes.md         # ADRs — respostas da tabela A.3
  02-schema.md           # schema alvo + ERD
  03-migracao.md         # plano expand/backfill/contract
  04-plano-fases.md      # backlog por fase, com checkboxes
  05-metricas.md         # dicionário de KPIs
  06-progresso.md        # log de execução, atualizado ao fim de cada prompt
```

## B.2 CLAUDE.md

Depois da P1, o agente cria/atualiza um `CLAUDE.md` na raiz com: stack, comandos (dev, build, typecheck, lint, test, migrate), convenções de nomenclatura, regra de enums em inglês, regra de `Decimal` para dinheiro, timezone, e o link para `docs/crm/`. Isso é o que impede o agente de reaprender tudo a cada sessão.

## B.3 Bloco padrão de guardrails

Cole isto **no fim de todo prompt de implementação**:

```
REGRAS OBRIGATÓRIAS DESTA TAREFA
- Não apague dados, tabelas ou colunas existentes. Depreciação é aditiva.
- Não refatore arquivos fora do escopo desta tarefa.
- Antes de começar, leia docs/crm/01-decisoes.md e docs/crm/02-schema.md e siga-os. Se algo nesta tarefa contradisser esses documentos, PARE e me pergunte em vez de decidir sozinho.
- Trabalhe na branch indicada. Commits pequenos e atômicos, mensagem convencional (feat:, fix:, chore:, refactor:).
- Ao final: rode typecheck, lint e build. Se houver testes, rode. Cole o resultado.
- Não marque a tarefa como concluída se algum desses comandos falhar.
- Se precisar de uma decisão de produto que não está documentada, pergunte. Não invente.
- Ao final, atualize docs/crm/06-progresso.md com: o que foi feito, arquivos tocados, o que ficou pendente, riscos.
- Valores monetários: Decimal(14,2). Datas: sempre com timezone, referência America/Recife.
- Enums e nomes de código em inglês; rótulos visíveis ao usuário em pt-BR, centralizados em um arquivo de labels.
```

## B.4 Como usar os modelos

| Modelo     | Use para                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opus**   | Auditoria de código legado, desenho de schema, plano de migração de dados, dicionário de métricas, decisões arquiteturais, revisão de segurança/permissões, refactors arriscados, e sempre que uma tarefa falhar duas vezes com Sonnet |
| **Sonnet** | Implementação já especificada: CRUD, server actions, telas, formulários, Kanban, dashboards, testes. É o cavalo de trabalho — ~70% das horas                                                                                           |
| **Haiku**  | Trabalho mecânico: seeds de catálogos, arquivos de labels pt-BR, fixtures, renomeação em massa, checklists, scripts simples, formatação                                                                                                |

Você troca de modelo dentro do Claude Code com `/model`. Regra prática: **planeje com Opus, execute com Sonnet, encha tabela com Haiku.** Use o modo de planejamento (plan mode) em todos os prompts marcados como PLANEJAMENTO — eles não devem escrever código.

---

# PARTE C — OS PROMPTS

---

## P0 — Reconhecimento do repositório

**Modelo: Sonnet** · **Modo: planejamento (sem escrever código)** · **Saída: resposta em chat**

```
Você vai trabalhar em um sistema chamado SENAHub. Antes de qualquer coisa, faça um reconhecimento do repositório e me responda em no máximo 40 linhas:

1. Stack: framework, versão, roteamento, ORM, banco, biblioteca de UI, gerenciamento de estado, autenticação.
2. Como o código está organizado (pastas principais e o que vive em cada uma).
3. Como são feitas as mutações hoje: server actions, route handlers, tRPC, outro?
4. Existe camada de services? Existe validação com Zod ou similar?
5. Comandos disponíveis: dev, build, typecheck, lint, test, migrate, seed.
6. Existe suíte de testes? Cobertura aproximada de que áreas?
7. Como funcionam permissões e papéis de usuário hoje?
8. É multi-tenant? Há isolamento por organização?
9. Como são tratados timezone e formatação de moeda hoje?
10. Riscos que você já percebe para uma refatoração grande neste repositório.

Não escreva nem altere nenhum arquivo. Não proponha soluções ainda.
```

---

## P1 — Auditoria profunda do módulo Comercial

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/00-auditoria.md`**

```
Faça uma auditoria completa e honesta do módulo Comercial do SENAHub. Não altere código. Produza o arquivo docs/crm/00-auditoria.md.

MAPEIE:

A) Modelo de dados
- Todas as tabelas/models ligadas a Comercial: Lead, Oportunidade, Proposta, Projeto, Cliente, usuários/responsáveis, follow-ups, compromissos, notificações, histórico.
- Para cada uma: campos, tipos, enums, relações, índices, campos obsoletos, campos de texto livre que deveriam ser estruturados.
- Volume atual de registros por tabela (rode uma query de contagem se houver acesso ao banco; se não, diga que precisa).

B) Código
- Páginas, rotas, componentes, dialogs, Kanban, dashboards.
- APIs, server actions, services, hooks.
- Geração de proposta (PDF), envio, link público, aceite, conversão em projeto.
- Permissões e quem pode fazer o quê.

C) Comportamento real
- O que o Lead representa hoje na prática? Ele é prospecção, oportunidade ou os dois misturados?
- Onde nasce o "Cliente"? Ele é duplicado a cada nova oportunidade?
- Como a origem é registrada hoje?
- Onde o histórico comercial está sendo perdido (campos de observação, ausência de log)?

D) Classificação
Monte uma tabela com TODOS os artefatos encontrados e classifique cada um como:
REAPROVEITAR | EVOLUIR | MIGRAR | DEPRECIAR
com uma justificativa de uma linha cada.

E) Inconsistências e dívidas
Liste tudo que estiver quebrado, duplicado, morto (código não referenciado), ou conflitante com a arquitetura de CRM que vamos construir.

F) Riscos de migração
O que pode dar errado ao mexer nisso com dados em produção.

Seja específico: cite caminhos de arquivo e nomes de campo reais. Nada de generalidades.
```

---

## P2 — Fechamento das decisões de produto (ADR)

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/01-decisoes.md`**

Cole aqui, junto do prompt, a tabela da seção **A.3** deste documento com as suas respostas.

```
Leia docs/crm/00-auditoria.md.

Vamos fechar as decisões de arquitetura de produto antes de escrever qualquer código. Abaixo estão as minhas respostas para as questões em aberto. Sua tarefa:

1. Registrar cada decisão em docs/crm/01-decisoes.md no formato ADR: contexto, decisão, consequências, alternativas descartadas.
2. Apontar TODA decisão minha que entre em conflito com o código atual, e explicar o custo de cada conflito.
3. Levantar as decisões que EU AINDA NÃO TOMEI e que você precisa para desenhar o schema — liste como perguntas objetivas, com sua recomendação e o motivo. Não decida por mim; pergunte.
4. Registrar também as decisões transversais: LGPD (opt-out de contatos, origem e data da coleta), permissões e visibilidade de pipeline, soft delete, moeda em Decimal, timezone, enums em inglês com labels pt-BR, separação entre Timeline (narrativa de negócio) e AuditLog (log técnico imutável).

MINHAS DECISÕES:
[cole aqui a tabela A.3 preenchida]
```

---

## P3 — Schema alvo

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/02-schema.md`**

```
Leia docs/crm/00-auditoria.md e docs/crm/01-decisoes.md.

Proponha o schema completo do CRM em docs/crm/02-schema.md. Ainda NÃO altere o schema real do projeto nem gere migrations.

Inclua:

1. Diagrama ER em Mermaid.
2. Definição de cada entidade no formato do ORM que o projeto usa, com todos os campos, tipos, obrigatoriedade, defaults, enums, relações e índices.

Entidades esperadas (ajuste se a auditoria indicar melhor caminho, justificando):
- Company, Contact, Lead (prospecção), Opportunity, Proposal, ProposalVersion, Activity (timeline), AuditLog, NextAction (ou reaproveitamento do sistema de compromissos existente), Campaign
- Catálogos: PropertyType (tipo de empreendimento), Discipline, LossReason, AcquisitionChannel, Segment
- Tabelas de junção: OpportunityDiscipline (com valor opcional por disciplina), LeadContact
- Tabela de configuração: StageProbability (probabilidade padrão por estágio, configurável, nunca hardcoded)

3. Para cada entidade nova, diga qual entidade atual ela substitui, evolui ou complementa.
4. Índices propostos, com a query que cada índice serve: companyId, contactId, ownerId, status, stage, nextActionDate, createdAt, closedAt, acquisitionChannel, campaignId.
5. Restrições de unicidade — atenção: CNPJ é único apenas quando preenchido (índice parcial), pois prospects frios não têm CNPJ.
6. Como o status comercial da Empresa (PROSPECT/CLIENTE/EX_CLIENTE/PARCEIRO) é derivado, e onde o override manual entra.
7. Campos de LGPD no Contact.
8. Riscos e pontos onde você teve que escolher entre duas modelagens — explique a escolha.

Não implemente. Quero revisar o schema antes.
```

---

## P4 — Plano de migração de dados

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/03-migracao.md`**

```
Leia docs/crm/00-auditoria.md, 01-decisoes.md e 02-schema.md.

Escreva o plano de migração de dados em docs/crm/03-migracao.md, usando o padrão EXPAND → BACKFILL → SWITCH → CONTRACT:

FASE EXPAND — só adiciona. Novas tabelas e colunas, nada removido, nada renomeado. O sistema atual continua funcionando sem alteração.
FASE BACKFILL — scripts idempotentes que populam o novo modelo a partir do antigo, podendo rodar várias vezes sem duplicar.
FASE SWITCH — a UI nova passa a ler do modelo novo, atrás de feature flag.
FASE CONTRACT — só depois de semanas de operação estável, remoção do que ficou órfão. Esta fase NÃO será executada agora.

O plano deve conter:

1. Script de auditoria pré-migração: uma query/relatório que classifica cada Lead atual em um bucket (é prospecção pura / é oportunidade real / é ambíguo) segundo regras determinísticas explícitas, e retorna a contagem de cada bucket. Quero rodar isso e ver os números ANTES de migrar.
2. As regras de classificação, escritas de forma explícita e discutível.
3. Como Empresas serão deduplicadas a partir dos clientes/leads atuais (normalização de nome, CNPJ, domínio do e-mail e do site) e o que fazer quando houver empate.
4. Como o campo de texto livre "Origem" será convertido em Canal + Origem detalhada + Campanha, com tabela de-para. O que não casar vai para "Outro" com o texto original preservado em um campo de observação.
5. Preservação de IDs e relações existentes.
6. Flag needsReview em todo registro migrado com ambiguidade, e uma tela/lista onde revisar isso depois.
7. Reversibilidade: como desfazer cada etapa.
8. Backup obrigatório antes de cada etapa e como validar que o backup presta.
9. Checklist de validação pós-migração: contagens antes/depois, nenhum registro órfão, nenhum valor monetário alterado, nenhuma proposta perdida.

Não escreva as migrations ainda.
```

---

## P5 — Plano de fases e backlog

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/04-plano-fases.md` + `CLAUDE.md`**

```
Leia os documentos de docs/crm/.

1. Gere docs/crm/04-plano-fases.md: o backlog completo, dividido nas 7 fases abaixo, em tarefas de no máximo meio dia cada, com checkbox, dependências entre tarefas e critério de aceite verificável por tarefa.

FASE 1 Fundação: catálogos, Empresa, Contato, relações, responsável, canal/origem/campanha, deduplicação
FASE 2 Jornada: separação prospecção x oportunidade, dois funis, próxima ação, dias sem contato, temperatura
FASE 3 Relacionamento: timeline, atividades, notas, reuniões, anexos
FASE 4 Sales Navigator: URLs, listas, campanhas, fluxo de prospecção, import/export CSV
FASE 5 Propostas: vínculo com oportunidade, versionamento, negociação, aceite, perda, conversão em projeto
FASE 6 Inteligência comercial: dashboards, conversão, aquisição, disciplinas, novos x recorrentes, pipeline ponderado
FASE 7 Preparação para automações (sem IA)

2. Marque explicitamente quais tarefas são de risco alto (tocam dados de produção ou fluxo de proposta/aceite existente).
3. Defina a estratégia de feature flag: nome da flag, o que ela controla, como o Comercial antigo e o novo convivem, e quando cada tela vira a chave.
4. Crie ou atualize o CLAUDE.md na raiz do projeto com: stack, comandos, convenções de código, regra de Decimal para dinheiro, timezone America/Recife, enums em inglês com labels pt-BR centralizados, padrão de commits, e a instrução de sempre ler docs/crm/ antes de trabalhar no Comercial.
5. Crie docs/crm/06-progresso.md vazio, com o cabeçalho e o formato de entrada.
```

> **PARADA OBRIGATÓRIA.** Revise 00 a 04 pessoalmente antes de seguir. É aqui que você corrige rumo barato. Depois deste ponto, cada correção custa código.

---

## P6 — Fase 1a: catálogos e enums

**Modelo: Haiku** (Sonnet se o ORM exigir mais cuidado) · **Branch: `feat/crm-fase1-catalogos`**

```
Implemente a primeira parte da FASE 1 conforme docs/crm/02-schema.md.

ESCOPO — apenas catálogos e enums, nada de UI:
1. Enums e tabelas de catálogo: tipo de empreendimento, disciplina, motivo de perda, canal de aquisição, segmento, porte, classificação da empresa, tipo de empresa, papel na decisão do contato, status de relacionamento do contato, status de prospecção, estágio de oportunidade, status de proposta, temperatura, tipo de próxima ação, tipo de atividade.
2. Tabela StageProbability com os defaults: Escopo 20, Orçamento 35, Proposta 55, Negociação 75, Contratado 100 — configurável, nunca hardcoded na UI.
3. Migration aditiva (nada removido).
4. Seed idempotente com todos os valores listados no meu documento de requisitos.
5. Arquivo central de labels pt-BR mapeando cada valor de enum para o rótulo exibido.

Enums e nomes de código em inglês. Rótulos em pt-BR só no arquivo de labels.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P7 — Fase 1b: Empresa e Contato

**Modelo: Sonnet** · **Branch: `feat/crm-fase1-empresa-contato`**

```
Implemente Empresa e Contato conforme docs/crm/02-schema.md.

BACKEND
1. Models Company e Contact com todos os campos definidos no schema, incluindo campos de LinkedIn/Sales Navigator e campos de LGPD do contato (optOut, optOutAt, origem e data da coleta).
2. Migration aditiva. Índices definidos no schema.
3. Validação (Zod ou o padrão do projeto) com CNPJ opcional mas validado quando preenchido; unicidade de CNPJ apenas quando não nulo.
4. Services/actions: criar, editar, arquivar (soft delete), listar com paginação e filtros, buscar.
5. Contato principal por empresa; um contato pertence a exatamente uma empresa.
6. Derivação do status comercial da empresa a partir dos dados, com campo de override manual.

FRONTEND
7. Lista de Empresas: busca, filtros (classificação, tipo, segmento, UF, responsável), paginação server-side, ordenação.
8. Formulário de Empresa em seções/abas — NÃO um modal gigante. Progressive disclosure: identificação, comercial, LinkedIn, observações.
9. Aba de Contatos dentro da Empresa, com criação inline e edição inline dos campos simples.
10. Rotas atrás da feature flag definida no plano de fases.

Não toque ainda em Lead, Oportunidade ou Proposta.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P8 — Fase 1c: deduplicação

**Modelo: Sonnet** · **Branch: `feat/crm-fase1-dedupe`**

```
Implemente o controle de duplicidade descrito no requisito, seguindo docs/crm/02-schema.md.

1. Serviço de detecção de possível duplicata de Empresa por: CNPJ normalizado, nome normalizado (sem acento, sem sufixos societários, sem pontuação, com similaridade), domínio do site e domínio do e-mail dos contatos.
2. Serviço equivalente para Contato: e-mail, telefone normalizado (E.164), nome + empresa.
3. Comportamento na UI: ao digitar CNPJ/nome/e-mail, mostrar alerta não bloqueante com os candidatos encontrados e as opções "usar o registro existente" ou "criar mesmo assim". Nunca bloquear agressivamente.
4. Ação de mesclar duas empresas: move contatos, prospecções, oportunidades, propostas, projetos e timeline para a empresa mantida; registra a mesclagem no AuditLog; mantém o registro absorvido como arquivado com referência ao sobrevivente. Nada é apagado.
5. Testes para as funções de normalização e de similaridade.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P9 — Fase 2a: Prospecção e Oportunidade (backend)

**Modelo: Opus para revisar o desenho, Sonnet para implementar** · **Branch: `feat/crm-fase2-jornada`**

Tarefa de risco alto: aqui é onde o Lead atual é partido em dois.

```
Esta é a mudança mais delicada da reforma: separar Prospecção de Oportunidade. Leia docs/crm/02-schema.md e 03-migracao.md antes.

1. Model Lead (prospecção), vinculado a Empresa, com N contatos, responsável, canal, origem detalhada, campanha; funil IDENTIFICADO → CONTATO_INICIADO → EM_CONTATO → QUALIFICADO → OPORTUNIDADE_CRIADA e estados SEM_OPORTUNIDADE, EM_ESPERA, DESCARTADO.
2. Model Opportunity, vinculado a Empresa e contatos, com dados do empreendimento, N disciplinas (com valor opcional por disciplina), informações comerciais (valor estimado, proposto, negociado, desconto, probabilidade, temperatura, estágio, previsão de fechamento, datas), motivo de perda obrigatório quando PERDIDO e concorrente opcional quando o motivo for concorrente escolhido.
3. Funil de oportunidade: LEVANTAMENTO → ORCAMENTO → PROPOSTA_ENVIADA → NEGOCIACAO → CONTRATADO, mais PERDIDO, EM_ESPERA, CANCELADO.
4. Ação "qualificar prospecção e criar oportunidade": herda empresa, contatos, canal, origem e campanha; a prospecção NÃO é destruída, ela vai para OPORTUNIDADE_CRIADA e mantém a referência.
5. Campos calculados: dias sem interação, follow-up atrasado, próxima ação hoje/futura. Decida com justificativa se são calculados na query ou materializados — considere o custo no Kanban.
6. Probabilidade: default vindo de StageProbability, override manual por oportunidade.
7. Transições de estágio passam por um único service que registra Activity (timeline) e AuditLog. Não permita mudar estágio direto pelo update genérico.
8. Testes das regras de transição e da qualificação.

Ainda sem UI. Ao final, me mostre a assinatura pública dos services criados.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P10 — Fase 2b: os dois funis (UI)

**Modelo: Sonnet** · **Branch: `feat/crm-fase2-funis`**

```
Implemente as duas telas de funil, completamente separadas.

FUNIL DE PROSPECÇÃO — Kanban: Identificados → Contato iniciado → Em contato → Qualificados → Oportunidade criada.
FUNIL DE OPORTUNIDADES — Kanban: Escopo → Orçamento → Proposta → Negociação → Contratado.

Requisitos comuns:
1. Drag-and-drop com atualização otimista e rollback em caso de erro.
2. Filtros reutilizáveis num componente único compartilhado: responsável, campanha, canal, empresa, temperatura, período, disciplina, região. Filtros persistidos na URL.
3. Busca.
4. Cards enxutos. No funil de oportunidades o card mostra apenas: empresa, nome da oportunidade, responsável (avatar), valor, próxima ação, dias sem contato, temperatura. Nada além disso.
5. Sinal visual para follow-up atrasado e para oportunidade parada há muito tempo.
6. Contador e soma de valores por coluna.
7. Carregamento paginado por coluna — não traga o pipeline inteiro de uma vez.
8. Comportamento em tela pequena: abas ou lista por estágio em vez de colunas horizontais. Desktop é a prioridade, mas mobile precisa ser utilizável.
9. Sem consultas N+1: uma query traz o que o card precisa.

Atrás da feature flag.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P11 — Fase 2c: Próxima Ação

**Modelo: Sonnet** · **Branch: `feat/crm-fase2-proxima-acao`**

```
Implemente o sistema de Próxima Ação.

1. ANTES de criar qualquer coisa: verifique o sistema de compromissos/follow-ups/notificações que já existe no SENAHub (ver docs/crm/00-auditoria.md) e me diga se devemos reaproveitá-lo ou criar entidade nova. Justifique. Prefira reaproveitar. Espere minha confirmação se a resposta for "criar novo".
2. Toda prospecção e oportunidade aberta pode ter uma próxima ação: tipo, data, hora opcional, responsável, observação.
3. Tipos: ligação, WhatsApp, e-mail, LinkedIn, reunião, follow-up, cobrar documentação, cobrar arquitetura, enviar proposta, revisar proposta, retorno ao cliente, outro.
4. Ao concluir uma próxima ação: registra Activity na timeline, atualiza última interação, e sugere agendar a próxima sem sair da tela.
5. Cálculos determinísticos, respeitando o fuso America/Recife: atrasada, para hoje, futura, dias sem interação.
6. Integração com as notificações existentes — não crie um segundo mecanismo de notificação.
7. Testes das regras de data, incluindo virada de dia e fim de semana.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P12 — Fase 3: Timeline, atividades e Empresa 360

**Modelo: Sonnet** · **Branch: `feat/crm-fase3-timeline`**

```
Implemente a camada de relacionamento.

1. Model Activity: tipo, data/hora, usuário, descrição, entidade relacionada (empresa, contato, lead ou oportunidade) e metadata em JSON. Toda Activity resolve para uma empresa, para que a timeline da empresa agregue tudo.
2. Registro automático de eventos: empresa e contato cadastrados, prospecção criada, mudança de etapa, ligação, WhatsApp, e-mail, LinkedIn, nota, reunião, anexo, oportunidade criada, escopo recebido, proposta criada/enviada/revisada, negociação, desconto, aceite, perda, contrato, projeto criado.
3. Registro manual de interação em 2 cliques a partir de qualquer card ou página de detalhe.
4. AuditLog separado da timeline: imutável, registra mudança de estágio, de valor, de responsável, de probabilidade, envio e aceite de proposta, perda. Guarda valor anterior e novo, usuário e horário.
5. Página EMPRESA 360 com: resumo (classificação, responsável, cidade/UF, segmento, último contato, próxima ação, temperatura, data do último contrato); indicadores (contatos, oportunidades abertas e históricas, propostas emitidas, contratos fechados, projetos, valor contratado acumulado, ticket médio, última contratação); e abas Contatos, Prospecções, Oportunidades, Propostas, Projetos, Timeline, Anexos, Informações comerciais.
6. Timeline paginada com scroll infinito e filtro por tipo de evento. Nunca carregue a timeline inteira.
7. Sem N+1 na Empresa 360: os indicadores vêm de queries agregadas, não de laço sobre relações.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P13 — Fase 4: Sales Navigator e CSV

**Modelo: Sonnet** (import/export CSV pode ir com Haiku se o parser for trivial) · **Branch: `feat/crm-fase4-sales-navigator`**

```
Implemente o suporte operacional ao LinkedIn Sales Navigator. NADA de scraping, automação de navegador ou integração não autorizada com o LinkedIn. Apenas campos, listas e importação manual de arquivo.

1. Campos já definidos no schema: LinkedIn e URL do Sales Navigator para empresa e para contato, lista do Sales Navigator, data de inclusão, status da abordagem.
2. Entidade Campaign: nome, canal, período, responsável, meta opcional, observação. Prospecções e oportunidades referenciam a campanha.
3. Fluxo rápido de prospecção em uma tela: colar URL → buscar empresa existente por nome/domínio → criar ou vincular empresa → criar ou vincular contato → criar prospecção → registrar abordagem. Meta: menos de 60 segundos por prospect, sem sair da tela.
4. Importação de CSV: upload, mapeamento de colunas pelo usuário, pré-visualização com detecção de duplicatas por empresa e por contato, importação transacional, relatório final de criados/vinculados/ignorados/erros. Nada é sobrescrito silenciosamente.
5. Exportação CSV de empresas, contatos, prospecções e oportunidades respeitando os filtros ativos.
6. Contatos com optOut nunca entram em listas de abordagem nem em exportações de prospecção.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P14 — Fase 5: Propostas com versionamento

**Modelo: Opus** (é onde há mais risco de quebrar o que já funciona) · **Branch: `feat/crm-fase5-propostas`**

```
Tarefa de risco alto: o SENAHub já gera propostas em PDF, envia link público e registra aceite. NADA disso pode quebrar.

1. Antes de codar, me apresente um plano curto de como vincular as propostas existentes a oportunidades sem quebrar a geração de PDF, o link público e o aceite atuais. Espere minha aprovação.
2. Toda Proposal passa a exigir opportunityId. Propostas históricas sem oportunidade recebem uma oportunidade sintética criada a partir dos seus próprios dados, marcada com needsReview.
3. ProposalVersion: número da versão, data, valor original, valor da versão, desconto, status, validade, data de envio, responsável, observação. A versão vigente é derivada, não duplicada.
4. Status: RASCUNHO, ENVIADA, VISUALIZADA (só se o rastreio já existir hoje — não invente), EM_NEGOCIACAO, ACEITA, RECUSADA, EXPIRADA.
5. Expiração automática determinística por data de validade, via job/cron ou verificação na leitura — escolha e justifique.
6. Ao aceitar uma proposta, em uma única transação: marcar oportunidade como CONTRATADA, registrar timeline e AuditLog, atualizar a empresa para CLIENTE se aplicável, gravar os valores comerciais finais, preservar a versão aceita imutável, e criar o Projeto a partir dos dados da oportunidade sem duplicar empresa nem contatos.
7. Ao perder: motivo obrigatório do catálogo, concorrente opcional quando o motivo for concorrente escolhido, observação livre adicional, timeline e AuditLog.
8. Permitir reabrir oportunidade perdida, com registro.
9. Testes cobrindo: aceite, perda, criação de versão, expiração, e o caminho completo proposta → projeto.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P15 — Dicionário de métricas

**Modelo: Opus** · **Modo: planejamento** · **Saída: `docs/crm/05-metricas.md`**

Faça isto **antes** de qualquer dashboard. É o prompt que separa dashboard útil de gráfico decorativo.

```
Escreva docs/crm/05-metricas.md: o dicionário de métricas do Comercial. Para CADA indicador abaixo, defina com precisão: definição em uma frase, fórmula, qual campo de data governa o período (criação, envio, fechamento), o que entra e o que fica de fora, tratamento de nulos, granularidade e a query SQL de referência.

Indicadores: novos prospects, contatos realizados, oportunidades criadas, propostas enviadas, contratos fechados, valor contratado, pipeline aberto, pipeline ponderado (soma de valor x probabilidade), ticket médio, taxa de conversão entre cada etapa do funil (prospect → contato → oportunidade → proposta → contrato, e prospect → contrato), tempo médio de fechamento, desconto médio, taxa de recompra em 6/12/24 meses.

Resolva explicitamente as ambiguidades e me diga qual escolheu:
- Conversão por coorte de criação ou por eventos ocorridos no período? (recomendo coorte, e explique o efeito na leitura)
- Ticket médio por contrato ou por empresa?
- Cliente "novo" x "recorrente": qual é o marco e qual a janela?
- Oportunidades canceladas e em espera entram no denominador da conversão?
- Pipeline aberto inclui EM_ESPERA?
- Valor contratado é o valor negociado final ou o da versão aceita?

Depois defina os recortes de análise: por canal, campanha, tipo de empreendimento, disciplina, segmento, região, responsável, cliente novo x recorrente.

Nada de código ainda.
```

---

## P16 — Fase 6a: Home do Comercial e "Meu Dia"

**Modelo: Sonnet** · **Branch: `feat/crm-fase6-home`**

```
Reformule a tela inicial do Comercial. Ela deixa de ser um Kanban e vira uma central operacional. Use docs/crm/05-metricas.md como fonte única das fórmulas.

1. Cards superiores: contratado no mês, pipeline aberto, pipeline ponderado, conversão de propostas, contratos fechados, ticket médio, follow-ups hoje, follow-ups atrasados. Cada card mostra comparação com o período anterior e leva para a lista filtrada correspondente.
2. Seção MEU DIA: follow-ups atrasados, contatos para hoje, próximas ações, propostas aguardando retorno, propostas próximas do vencimento, oportunidades sem contato há muitos dias. Cada item navega direto para o registro, e permite concluir/reagendar a ação sem sair da tela.
3. Alternância "meus" x "todos".
4. Os limites de dias (sem contato, proposta vencendo) vêm de configuração, não de número mágico no código.
5. Performance: a home inteira em poucas queries agregadas. Nada de N+1. Meça e me diga o tempo e o número de queries.
6. Estados de carregamento e de vazio bem resolvidos.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P17 — Fase 6b: Inteligência Comercial

**Modelo: Sonnet** · **Branch: `feat/crm-fase6-inteligencia`**

```
Crie a página Comercial → Inteligência Comercial, implementando exatamente as definições de docs/crm/05-metricas.md. Se alguma métrica não estiver definida lá, PARE e me pergunte — não invente fórmula.

1. Filtros globais persistidos na URL: período, responsável, canal, campanha, segmento, tipo de empreendimento, disciplina, região, cliente novo/recorrente.
2. Métricas executivas.
3. Funil de conversão visual com a taxa entre cada etapa e a taxa ponta a ponta.
4. Análise por canal e por campanha: prospecções, oportunidades, propostas, contratos, conversão, receita contratada, ticket médio, tempo médio de fechamento. O canal não pode ser julgado só por quantidade de contratos — mostre as taxas.
5. Análise por tipo de empreendimento e por disciplina (incluindo desconto médio por disciplina).
6. Novos x recorrentes: clientes conquistados, recorrentes, receita de cada grupo, taxa de recompra em 6/12/24 meses.
7. Listas de reativação por regra determinística: prospects qualificados sem contato recente, empresas sem interação há mais de X dias, clientes sem nova contratação, oportunidades em espera, ex-clientes com potencial de recompra. Filtros salvos com nome ("Prospects esquecidos", "Clientes inativos", "Sem contato há mais de 90 dias"). X configurável.
8. Exportação CSV de qualquer recorte.
9. Toda métrica vem de registro real. Zero dado mockado. Se um número não puder ser calculado com os dados existentes, mostre estado vazio explicando o motivo — não estime.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P18 — Fase 7: automações determinísticas

**Modelo: Sonnet** · **Branch: `feat/crm-fase7-automacoes`**

```
Implemente apenas automações determinísticas, reaproveitando o sistema de notificações existente. NENHUMA IA, nenhum lead scoring, nenhuma geração automática de mensagem, nenhuma previsão por machine learning.

1. Regras: follow-up vencido, proposta próxima da validade, oportunidade sem interação há X dias, cliente inativo há Y dias, oportunidade parada no mesmo estágio há Z dias, cliente elegível a reativação.
2. Cada regra tem parâmetros configuráveis em tabela, nunca hardcoded.
3. Motor de regras único e extensível, executado por job agendado, idempotente (não notifica duas vezes o mesmo fato).
4. Notificações vão para o responsável, com link direto para o registro.
5. Preparar a arquitetura para automações futuras (interface de regra, ponto de extensão), mas sem implementar nada de IA.
6. Testes das regras com datas fixas.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P19 — Performance e índices

**Modelo: Opus** · **Branch: `perf/crm`**

```
Faça uma auditoria de performance do Comercial novo, com números, não com opinião.

1. Para as telas Empresa 360, Kanban de prospecção, Kanban de oportunidades, Home do Comercial e Inteligência Comercial: conte as queries executadas e meça o tempo com um volume realista.
2. Gere dados sintéticos suficientes para o teste ser honesto (ex.: 2.000 empresas, 6.000 contatos, 4.000 prospecções, 1.500 oportunidades, 3.000 propostas, 50.000 atividades) num seed separado, nunca no banco de produção.
3. Elimine todo N+1 encontrado.
4. Valide se os índices propostos em docs/crm/02-schema.md estão sendo usados de fato — rode EXPLAIN nas queries mais caras e me mostre.
5. Pagine tudo que pode crescer sem limite (timeline, listas, colunas de Kanban).
6. Entregue um antes/depois com números.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P20 — Validação dos critérios de aceitação

**Modelo: Sonnet**

```
Valide os 20 critérios de aceitação do CRM executando o fluxo ponta a ponta. Para cada um, diga PASSA / FALHA / PARCIAL, com a evidência (caminho de arquivo, teste, ou passo a passo reproduzível na UI).

1. Cadastrar a Empresa uma única vez a partir de uma busca do Sales Navigator
2. Adicionar vários contatos da mesma Empresa
3. Criar prospecção associada ao contato
4. Registrar abordagem
5. Registrar próximas ações
6. Registrar interações na timeline
7. Qualificar a prospecção
8. Criar oportunidade real
9. Informar empreendimento e disciplinas
10. Elaborar orçamento
11. Gerar proposta
12. Criar novas versões da proposta
13. Negociar
14. Aceitar ou perder a oportunidade
15. Em caso de aceite, transformar em Projeto
16. Manter todo o histórico disponível na Empresa
17. Medir de onde aquele contrato veio
18. Medir conversão, ticket e receita do canal
19. Voltar meses depois e criar outra oportunidade para a mesma Empresa
20. Fazer tudo isso sem nenhuma duplicação de cadastro

Onde houver FALHA ou PARCIAL, liste a correção necessária em ordem de esforço. Depois, escreva um teste end-to-end que cubra o fluxo completo do critério 1 ao 20.

[cole o BLOCO PADRÃO DE GUARDRAILS]
```

---

## P21 — Retomada de sessão (use sempre que abrir o Claude Code do zero)

**Modelo: o mesmo da fase em que você está**

```
Leia CLAUDE.md e todos os arquivos de docs/crm/, em especial 04-plano-fases.md e 06-progresso.md.

Me diga em no máximo 15 linhas:
1. Em que fase e tarefa estamos.
2. O que ficou pendente ou com risco na última sessão.
3. Qual é a próxima tarefa do plano e o que ela exige.
4. Qualquer inconsistência entre o que está no código e o que está documentado.

Não comece a implementar até eu confirmar.
```

---

# Resumo da ordem de execução

| Prompt | Fase                           | Modelo                           | Modo         |
| ------ | ------------------------------ | -------------------------------- | ------------ |
| P0     | Reconhecimento                 | Sonnet                           | Planejamento |
| P1     | Auditoria do Comercial         | **Opus**                         | Planejamento |
| P2     | Decisões / ADR                 | **Opus**                         | Planejamento |
| P3     | Schema alvo                    | **Opus**                         | Planejamento |
| P4     | Plano de migração              | **Opus**                         | Planejamento |
| P5     | Plano de fases + CLAUDE.md     | **Opus**                         | Planejamento |
| —      | **PARADA — revisão humana**    | —                                | —            |
| P6     | Fase 1a catálogos              | Haiku                            | Execução     |
| P7     | Fase 1b Empresa/Contato        | Sonnet                           | Execução     |
| P8     | Fase 1c deduplicação           | Sonnet                           | Execução     |
| P9     | Fase 2a jornada (backend)      | **Opus** desenho / Sonnet código | Execução     |
| P10    | Fase 2b funis (UI)             | Sonnet                           | Execução     |
| P11    | Fase 2c próxima ação           | Sonnet                           | Execução     |
| P12    | Fase 3 timeline + Empresa 360  | Sonnet                           | Execução     |
| P13    | Fase 4 Sales Navigator + CSV   | Sonnet / Haiku                   | Execução     |
| P14    | Fase 5 propostas               | **Opus**                         | Execução     |
| P15    | Dicionário de métricas         | **Opus**                         | Planejamento |
| P16    | Fase 6a home + meu dia         | Sonnet                           | Execução     |
| P17    | Fase 6b inteligência comercial | Sonnet                           | Execução     |
| P18    | Fase 7 automações              | Sonnet                           | Execução     |
| P19    | Performance                    | **Opus**                         | Execução     |
| P20    | Critérios de aceitação         | Sonnet                           | Execução     |
| P21    | Retomada de sessão             | conforme a fase                  | —            |

**Regra de escalonamento:** se uma tarefa falhar duas vezes com Sonnet, não insista — troque para Opus e peça um diagnóstico da causa antes de tentar de novo.
