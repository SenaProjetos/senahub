# 00 — Auditoria do módulo Comercial

> Gerado pelo prompt P1 (`docs/crm/senahub-crm-playbook-claude-code.md`). Nenhum código foi alterado.
> Banco de dev não estava acessível nesta sessão (`ECONNREFUSED` ao conectar via Prisma) — contagens de
> volume não puderam ser coletadas. Comando para reproduzir quando o Postgres de dev estiver de pé:
>
> ```ts
> // rode um script tsx temporário (não commitar) chamando prisma.lead.count(), prisma.oportunidade.count(),
> // prisma.proposta.count(), prisma.cliente.count(), prisma.propostaItem.count() etc.
> ```

---

## A) Modelo de dados

Todos os models abaixo vivem em `prisma/schema.prisma`. Nenhum tem `tenantId`/`organizationId` (sistema não é multi-tenant).

### Lead (linha 3442) — hoje é prospecção **e** oportunidade misturadas
```
id, nome, contato?, email?, telefone?, origem? (texto livre), valorEstimado?,
etapaId → FunilEtapa, clienteId? → Cliente, observacoes?, motivoPerda?, arquivado
```
- Sem `responsavelId` — ninguém é "dono" formal de um lead no schema (só quem criou/editou via audit).
- `origem` é `String?` livre — não existe Canal/Origem detalhada/Campanha estruturados em lugar nenhum do banco.
- Índice: `@@index([etapaId, arquivado])`. Sem índice em `clienteId`.
- Relações: `AtividadeLead[]` (notas), `AnexoLead[]` (arquivos), `Proposta[]` (propostas geradas a partir do lead).

### FunilEtapa (linha 3430)
```
id, nome (unique), ordem, cor?, ativo
```
- Etapas seedadas (`prisma/seed.ts:252`): **Orçamento → Em negociação → Proposta enviada → Contratado / Perdido**.
- Isso é **um funil só**, misturando o que no CRM alvo seriam dois funis (Prospecção e Oportunidade) — confirma a lacuna #2 do diagnóstico do playbook.
- "Perdido" não é uma flag no schema — é detectado por **substring no nome** (`etapaEhPerdido`, ver seção B). Renomear a etapa quebra a regra de negócio.

### Oportunidade (linha 2332) — existe, mas está isolada
```
id, titulo, clienteId? (FK escalar, sem relation Prisma — comentário no schema diz
"p/ não inflar Cliente"), valorEstimado?, etapa (string livre, default "qualificacao"),
status (enum StatusOportunidade: aberta|ganha|perdida), responsavelId? (string solto,
sem FK), observacao?, AtividadeOportunidade[]
```
- Comentário no schema (linha 2331): *"Oportunidade comercial (estágio entre Lead e Proposta) com atividades próprias (C1)"* — a intenção documentada é ser a ponte entre Lead e Proposta.
- **Na prática não é.** Não existe `leadId` em `Oportunidade` nem `oportunidadeId` em `Proposta`. É uma terceira entidade totalmente desconectada, com seu próprio Kanban (`/comercial/oportunidades`), etapas fixas hardcoded no código (`ETAPAS_OPORTUNIDADE`, ver B) e nenhuma ligação de dados com Lead ou Proposta.

### Proposta (linha 3550)
```
id, ano, sequencial, numero (unique, "PR-260001"), titulo, clienteId (obrigatório),
leadId? → Lead, status (enum: rascunho|enviada|aceita|recusada), areaM2?, validade?,
observacoes?, token (unique, link público), autorId, projetoId? (unique — projeto
gerado no aceite), enviadaEm?, aceitaEm?
```
+ `PropostaItem` (disciplina **texto livre**, descricao?, valor), `PropostaCondicao`
(percentual|valor), `PropostaVersao` (snapshot JSON a cada save), `PropostaVisualizacao`
(IP + userAgent do pixel de abertura — sem retenção/anonimização definida),
`PropostaSequencia` (contador anual `PR-AANNNN`, estado sequencial sensível).
- `clienteId` é **obrigatório** — uma proposta sempre pressupõe um Cliente já existente (força a conversão do lead antes).
- `disciplina` em `PropostaItem` é string livre, **não** FK para um catálogo — não existe catálogo de disciplinas compartilhado no sistema (ver nota abaixo).

### Cliente (linha 820) — já cumpre o papel de "Company"
```
id, tipo (PF|PJ), nome, nomeFantasia?, documento? (CPF/CNPJ, texto livre, SEM unique),
email?, telefone?, endereço completo, observacoes?, categoria? (texto livre), ativo,
usuarioId? (login de portal), contatos: ContatoCliente[], + relations p/ Projeto,
Lancamento, Lead, Proposta, User, DocumentoJuridico, Documento, CustoOrcamento
```
- `ContatoCliente` (linha ~862) já é 1:N com `principal: Boolean` — o pedaço "Contact" do CRM alvo já existe aqui, sem nenhum campo de LGPD (`optOut`, origem/data de coleta).
- **Sem unicidade em `documento` (CNPJ/CPF)** — nem total nem parcial. Sem unicidade em `nome`. Nenhuma checagem de duplicata em lugar nenhum do código (ver E).

### Disciplina — o catálogo EXISTE (correção)

> ⚠️ **Correção de 2026-08-13.** A versão original desta seção afirmava que não existia catálogo
> compartilhado de disciplinas. **Estava errado.**

- `DisciplinaCatalogo` (linha 906) **é** o catálogo compartilhado, e é mais rico do que o mínimo
  necessário: `nome` (@unique), `codigo` (sigla p/ nomenclatura de arquivo: ARQ, EST, ELE…),
  `numeracao` (bloco-base da folha: Estrutural = 4000 → 4001, 4002…), `categoria` (ARQUITETURA,
  CIVIL, ELÉTRICA, MECÂNICA), `icone`/`iconeSvg`, `ativo`, `ordem`.
- Vem **seedado com 20 disciplinas** (`prisma/seed.ts:285`), com reconciliação de renomeações
  (`RENOMES`, que já aplicou `Lógica` → `Cabeamento`).
- É usado por `PadraoTecnico` (biblioteca técnica), `modules/engenharia`, `modules/projetos`,
  `modules/ferramentas/auto-store`, `app/api/uploads`.
- **O que de fato falta** não é o catálogo, e sim a **FK**: `Disciplina.nome` (por-projeto),
  `PropostaItem.disciplina` e `ItemTabelaPreco.disciplina` continuam sendo **strings livres**, sem
  referência ao catálogo. É daí que vem a divergência de grafia — o catálogo existe, mas nada obriga
  a usá-lo.

### Permissão
Uma única entrada no catálogo (`src/lib/permissions-catalog.ts:92`):
```
recurso: "comercial" → ações "ver" (leitura) e "gerir" (tudo mais)
```
Sem granularidade por dono, sem distinção Lead/Oportunidade/Proposta/Tabela de preço — **todo o Comercial é um único par ver/gerir**. `podeGerir` controla literalmente tudo (criar lead, mover etapa, editar proposta, aceitar proposta, mexer em tabela de preço, definir meta).

---

## B) Código

### Server layer
- `src/modules/comercial/actions.ts` (607 linhas) — Leads, Etapas do funil, Tabelas de preço, Propostas (criar/salvar versão/copiar/enviar e-mail/**aceitar**).
- `src/modules/comercial/queries.ts` (138 linhas) — `funilCompleto`, `obterLead`, `resumoComercial` (dashboard/metas), `listarPropostas`, `obterProposta`, `listarTabelasPreco`, `listarEtapasFunil`.
- `src/modules/comercial/schemas.ts` (101 linhas) — todo o Zod do módulo.
- `src/modules/comercial/oportunidades/actions.ts` (89 linhas) + `queries.ts` (52 linhas) — CRUD isolado de Oportunidade, mesmo `base` de permissão (`comercial:gerir`). `ETAPAS_OPORTUNIDADE` é um array hardcoded no código (`["qualificacao","proposta","negociacao","fechamento"]`), não vem de tabela — diferente do funil de Lead, que usa `FunilEtapa` configurável.
- `src/modules/comercial/propostas-extras/queries.ts` (23 linhas) — só `versoesComparaveis` (diff entre `PropostaVersao`). Comentário no topo já registra que `anexosDaProposta` **migrou** para `modules/documentos-cliente/queries.ts` (`documentosDaProposta`) — os anexos de proposta viraram `Documento` genérico ancorado no cliente.

### Rotas API (fora do padrão Server Action — corretamente, pois são multipart/token público)
- `src/app/api/comercial/anexos/route.ts` + `[id]/download/route.ts` — upload/download de `AnexoLead`.
- `src/app/api/t/proposta/[token]/pdf/route.ts` — gera PDF via `puppeteer-core` **renderizando a própria página pública ao vivo** (`page.goto` em `/a/proposta/[token]`, `CHROME_PATH` obrigatório). Não há PDF arquivado/imutável por versão — o PDF baixado hoje pode diferir do PDF baixado amanhã se `PropostaItem`/`PropostaCondicao` mudarem.
- `src/app/api/t/proposta/[token]/pixel/route.ts` — grava `PropostaVisualizacao` (IP + UA) na abertura.
- `src/app/api/t/proposta/[token]/documentos/route.ts` — upload do cliente (sem login) direto na proposta.

### UI
- `src/app/(dashboard)/comercial/page.tsx` — home: `MetaCard` + `FunilBoard` (Kanban de Lead).
- `src/app/(dashboard)/comercial/oportunidades/page.tsx` → `OportunidadesView` — Kanban paralelo e desconectado (ver A).
- `src/app/(dashboard)/comercial/propostas/` (lista + detalhe) → `PropostasView`, `PropostaEditor`.
- `src/app/(dashboard)/comercial/tabelas/page.tsx` → `TabelasView` (preço por m²/disciplina).
- `src/app/(dashboard)/comercial/[id]/page.tsx` → `LeadDetalheView` (ficha do lead: dados, notas via `NotasHistorico`, anexos, propostas vinculadas).
- `src/app/a/proposta/[token]/page.tsx` — página pública (sem login, fora do `(dashboard)`): mostra itens/condições/total, upload de arquivo, download de PDF, pixel de abertura.

### Geração de proposta / envio / link público / aceite / conversão em projeto
Fluxo real, rastreado ponta a ponta:
1. `criarPropostaDeLead` (`actions.ts:320`) — converte o lead em `Cliente` se ainda não tiver (`criouCliente`), cria `Proposta` com `token` aleatório (`randomBytes(18)`).
2. `salvarProposta` (`actions.ts:368`) — grava itens/condições e um snapshot em `PropostaVersao` a cada save (histórico completo, mas **sem diff granular**, só JSON bruto).
3. `enviarPropostaEmail` (`actions.ts:503`) — manda e-mail com o link `/a/proposta/[token]`, marca `status: enviada`.
4. Cliente abre o link público — **sem login** — vê totais por disciplina (nunca valor unitário, comentário explícito no código: `"Mostra só totais por disciplina — nunca valores unitários (regra de negócio)"`), pode baixar PDF, pode subir arquivos.
5. **Não existe botão de aceite na página pública.** `aceitarProposta` (`actions.ts:541`) é uma Server Action gated por `comercial:gerir` chamada só de dentro do `proposta-editor.tsx` (uso interno) — ou seja, o aceite hoje é **100% manual pelo time interno**, depois de o cliente confirmar por fora (e-mail/WhatsApp/telefone). Isso contradiz a suposição implícita do prompt original de que "aceite" é algo que o cliente faz na tela.
6. Ao aceitar: numa transação, cria `Projeto` (código sequencial via `proximoCodigoProjeto`), cria uma `Disciplina` por `PropostaItem` (copiando `nome`/`valor` — aqui nasce a string livre de disciplina no Projeto), marca `Proposta.status = aceita` + `projetoId`, cria canais de chat (`ensureCanaisProjeto`), notifica quem bate `whereAudiencia("gestao_operacional")`.
7. Perda: **não há ação de "perder proposta" com motivo estruturado.** `mudarStatusProposta` aceita `status: "recusada"` mas o schema (`statusPropostaSchema`) não pede motivo nenhum — motivo de perda só existe hoje no **Lead** (`Lead.motivoPerda`, texto livre, obrigatório só quando a etapa vira "Perdido", validado em `moverLead`).

### Permissões — quem pode o quê
`requirePermission("comercial", "ver")` em toda página; `can(user, "comercial", "gerir")` decide se mostra botões de mutação. Não há distinção entre "vejo só os meus leads" e "vejo tudo" — **todo usuário com `comercial:ver` vê o funil inteiro**; não há filtro por `responsavelId` em nenhuma query (aliás `Lead` nem tem `responsavelId`).

---

## C) Comportamento real

- **O que o Lead representa hoje:** os dois ao mesmo tempo. `FunilEtapa` seedada mistura estágios de prospecção fria ("Orçamento") com estágios de negociação avançada ("Proposta enviada", "Contratado") num único funil linear. Não há ponto de corte formal entre "ainda estou prospectando" e "isso é uma oportunidade real".
- **Onde nasce o "Cliente":** em **três** lugares independentes, nenhum com checagem de duplicata:
  1. `converterLead` (`actions.ts:170`) — botão manual na ficha do lead.
  2. `criarPropostaDeLead` (`actions.ts:320`) — conversão automática/implícita ao criar a primeira proposta.
  3. Cadastro direto em `/clientes` (fora do módulo comercial, não auditado aqui em profundidade).
  Resultado esperado em produção: **clientes duplicados** sempre que alguém cadastra manualmente um cliente que já tinha vindo de um lead (ou vice-versa).
- **Como a origem é registrada hoje:** um campo de texto livre (`Lead.origem`), sem lista fechada, sem Canal/Campanha. Impossível hoje responder "quanto fechamos vindo do Sales Navigator" de forma confiável — depende de quem digitou o quê.
- **Onde o histórico comercial está sendo perdido:**
  - `AtividadeLead.nota` é texto livre sem tipo — não dá para distinguir "liguei" de "mandei e-mail" de "reunião" programaticamente, só ler o texto.
  - `AtividadeOportunidade` tem `tipo` (também string livre, default `"nota"`) mas está no ramo isolado (Oportunidade) que ninguém preenche na prática de fluxo Lead→Proposta.
  - Nenhuma das duas (`AtividadeLead`/`AtividadeOportunidade`) é o "AuditLog" imutável do sistema — esse é outro mecanismo (`AuditLog` via `defineAction`), e a maioria das actions do Comercial **não** passa `entidadeId` na config (só `salvarProposta` e `aceitarProposta` passam) — logo, para as demais (`criarLead`, `editarLead`, `moverLead`, `arquivarLead`, `mudarStatusProposta`, `enviarPropostaEmail`, tudo em `oportunidades/actions.ts`...) o `AuditLog` não amarra de forma confiável ao registro específico (ver [[historico-projeto-idset]] — mesmo padrão de risco já mapeado noutro módulo).

---

## D) Classificação

| Artefato | Classificação | Justificativa |
|---|---|---|
| `Cliente` + `ContatoCliente` | **REAPROVEITAR** | Já é exatamente o par Company/Contact do CRM alvo (1:N, contato principal). Só falta LGPD e dedup. |
| `Lead` (model) | **EVOLUIR** (split) | Campos certos (nome, contato, valor, origem) mas funil misto — vira a base do novo `Lead`(prospecção) mantendo dados, ganhando funil próprio. |
| `FunilEtapa` | **EVOLUIR** (split em 2) | Mesmo mecanismo (tabela configurável de estágios) serve pros dois funis novos; hoje é 1 tabela pra 1 funil só. |
| `AtividadeLead` | **EVOLUIR** | Vira base da nova `Activity`, mas precisa de `tipo` estruturado e de resolver para Empresa (não só Lead). |
| `AnexoLead` | **MIGRAR** | Mesmo padrão de `FuncionarioDocumento` citado no comentário do schema — provavelmente absorve por `Documento` genérico, como já aconteceu com anexo de proposta (ver `propostas-extras/queries.ts`). |
| `Oportunidade` + `AtividadeOportunidade` (model + `oportunidades/actions.ts` + `oportunidades/queries.ts` + `oportunidades-view.tsx`) | **DEPRECIAR ou MIGRAR sob decisão explícita** | Feature construída (C1) mas nunca ligada a Lead/Proposta — é uma ilha morta na prática. Decidir na P2 se vira o novo model `Opportunity` (reaproveitando o nome, reescrevendo o conteúdo) ou se é abandonada; ou marcada `needsReview`. **Não decidir sozinho — está na lista de perguntas da P2.** |
| `Proposta` + `PropostaItem`/`Condicao`/`Versao`/`Visualizacao`/`Sequencia` | **EVOLUIR** | Núcleo funcional sólido (numeração, versionamento, link público, pixel, PDF) — não pode quebrar. Ganha `opportunityId` obrigatório (com oportunidade sintética p/ histórico), catálogo de disciplina no lugar do texto livre. |
| `/a/proposta/[token]` + rotas `api/t/proposta/*` | **REAPROVEITAR** | Fluxo público funcionando (view, upload, PDF, pixel) — não mexer fora do escopo da P14. |
| `TabelaPreco`/`ItemTabelaPreco` | **REAPROVEITAR** | Sem relação direta com a reforma de funil; só precisa de disciplina vinda do catálogo novo em vez de string livre. |
| `MetaComercial` | **REAPROVEITAR** | Simples, funciona, sem acoplamento aos pontos problemáticos. |
| Disciplina como string livre (`PropostaItem.disciplina`, `Projeto.Disciplina.nome`) | **MIGRAR** | Precisa virar catálogo (`Discipline`) com de-para dos valores digitados historicamente — sem isso o P3/P17 (análise por disciplina) não tem chão. |
| Permissão única `comercial:ver`/`gerir` | **EVOLUIR** | Suficiente hoje só porque tudo é "vê tudo, edita quem tem gerir" — decisão da P2 (item 15 da tabela A.3) precisa dizer se isso muda. |

---

## E) Inconsistências e dívidas

1. **`etapaEhPerdido()` (`actions.ts:48`) é string-matching frágil** — decide se uma etapa é "Perdido" comparando `nome.toLowerCase().includes("perdid")`. Renomear a etapa no admin (`criarEtapaFunil`/`editarEtapaFunil`, sem nenhuma validação de nome único-significado) quebra silenciosamente a exigência de motivo de perda.
2. **`Oportunidade` é uma feature órfã** — schema, actions, queries e UI existem e funcionam isoladamente, mas nunca se conectam ao fluxo real Lead→Proposta. Qualquer contagem/dashboard que inclua "oportunidades" hoje mostraria dados de um Kanban paralelo que ninguém necessariamente usa no dia a dia comercial.
3. **Zero deduplicação de `Cliente`** — nem por `documento` (sem unique), nem por nome, em nenhum dos 3 pontos de criação.
4. **Zero campos LGPD** em `Cliente`/`ContatoCliente`/`Lead` — nenhum `optOut`, `origem da coleta`, `data da coleta`. `PropostaVisualizacao` grava IP+UserAgent sem política de retenção.
5. **`AuditLog` incompleto no Comercial** — a maioria das actions não passa `entidadeId`; rastreabilidade "quem mudou o quê nesse Lead específico" não é garantida pelo mecanismo automático fora de `salvarProposta`/`aceitarProposta`.
6. **PDF não é imutável** — é renderizado ao vivo a partir da página pública atual; não há arquivo congelado por versão enviada.
7. **Motivo de perda existe só no Lead, não na Proposta** — `mudarStatusProposta(status: "recusada")` não pede motivo. Se uma proposta é recusada sem o lead correspondente passar pela etapa "Perdido", a perda fica sem motivo registrado.
8. **`Disciplina` sem catálogo compartilhado** — mesma disciplina digitada com grafias diferentes em `PropostaItem`, `TabelaPreco`/`ItemTabelaPreco` e `Projeto.Disciplina` (por projeto). Nenhuma dessas três é fonte de verdade da outra.
9. **`ETAPAS_OPORTUNIDADE` hardcoded no código** (`oportunidades/queries.ts:4`) enquanto o funil de Lead é configurável via tabela — inconsistência de padrão entre os dois "funis" que já existem.
10. **`Oportunidade.clienteId`/`responsavelId` são strings soltas sem `@relation`** (comentário explícito: "p/ não inflar Cliente") — quebra a garantia de integridade referencial que o resto do schema tem; se o cliente for excluído, a FK morta não é pega pelo Postgres.
11. **Zero testes no módulo comercial** — nenhum dos 186 arquivos `*.test.ts` do repo cobre `Lead`, `Oportunidade` ou `Proposta`. Qualquer refactor aqui é "às cegas" até que a Fase de fundação crie a primeira suíte.

---

## F) Riscos de migração

1. **Split Lead → Prospecção/Oportunidade depende inteiramente de qual `FunilEtapa` cada lead está.** Regra de classificação (P4) precisa mapear as 5 etapas seedadas hoje ("Orçamento", "Em negociação", "Proposta enviada", "Contratado", "Perdido") para os dois funis novos — mas etapas **customizadas** que clientes/admins possam ter criado via `criarEtapaFunil` não têm significado conhecido a priori; viram candidatas a `needsReview`.
2. **Deduplicação de Cliente vai encontrar duplicatas reais** — não há histórico de qual registro é "canônico"; a fusão (merge) descrita na P8 vai precisar de critério de desempate manual em casos ambíguos.
3. **Numeração de Proposta (`PropostaSequencia`, formato `PR-AANNNN`) é estado sequencial externo-facing** (já mandado por e-mail a clientes) — qualquer migração de schema que toque nessa tabela precisa preservar o contador exatamente, sob risco de colidir número em propostas novas.
4. **Token público (`Proposta.token`) e o link `/a/proposta/[token]` já foram enviados a clientes reais** — não pode expirar/mudar de formato numa migração; qualquer `opportunityId` novo obrigatório em `Proposta` precisa ser **retroativamente preenchido** (oportunidade sintética, como o P14 já prevê) sem tocar no token.
5. **Disciplina livre em 3 lugares sem de-para** — migração para catálogo `Discipline` vai exigir normalização textual (acentuação, plural, sinônimos como "Elétrica"/"Elétrico") e provavelmente sobra de "Outro" com texto original preservado.
6. **`Oportunidade` órfã** — decisão de produto pendente (reaproveitar o nome para o novo model, ou descartar os dados existentes como ruído) muda o volume e a complexidade do backfill; **não assumir, perguntar na P2**.
7. **PDF ao vivo via Puppeteer depende de `CHROME_PATH`** — qualquer mudança na página pública durante a janela de convivência (feature flag) já muda o PDF gerado a partir dali; não há como comparar PDF "antes" vs "depois" de forma determinística.
8. **`MetaComercial` é só um número por mês, sem `responsavelId`** — se o P16 (Home "Meu Dia") assumir meta por responsável, é campo novo, não migração de dado existente.
9. **Contagem de volume real não coletada nesta sessão** (banco de dev fora do ar) — antes de qualquer backfill, rodar a contagem por bucket exigida pelo P4 item 1 contra o banco real.

---

*Próximo passo: P2 — fechar as decisões de produto em `docs/crm/01-decisoes.md`, usando a tabela da seção A.3 do playbook. Aguardando as respostas do usuário antes de prosseguir (conforme guardrail: "não decida por mim; pergunte").*
