# Revisão de telas por perfil — apontamentos

> **Como preencher:** percorra cada tela e escreva após o **Apont.:** o que precisa ser
> corrigido/implementado. Deixe em branco o que estiver OK. Ao terminar, me devolva este
> arquivo que eu consolido tudo num plano de correção/implementação (por módulo, com
> prioridade e arquivos-alvo).
>
> Base de acesso: `src/lib/nav-config.ts` (menu) + gates de cada `page.tsx`
> (`requireRole`/`requirePermission`) + matriz padrão do seed (`prisma/seed.ts`).
> `admin` ignora permissões. Gates marcados como `(perm: …)`, `(role: HR_ADMIN)`, `(só admin)`.
> Perfis: **admin, supervisor, administrativo, clt, estagiário, projetista_pj, freelancer, cliente**.

---

## 0. Apontamentos pré-identificados (análise de código — Claude)

> Estes são apontamentos que **eu** levantei lendo o código (não substituem sua revisão visual).
> Cada um traz o arquivo/efeito e uma sugestão. Marque ✅/❌/decisão ao lado conforme for revisando.

### 0.A — Acesso & permissões _(a confirmar/decidir)_

1. **Cliente enxerga "Suporte" no menu.** O item Suporte em `src/lib/nav-config.ts` não tem `roles`,
   então aparece para **todos** (inclusive cliente); a página `/suporte` é só `requireUser()`.
   → Decidir: ocultar de cliente (`roles` sem `cliente`) **ou** manter (cliente abre chamado ao escritório). · **Decisão:**

2. **`/configuracoes/avisos` exige `avisos:enviar`, recurso que não existe.** Não está em
   `src/lib/permissions-catalog.ts` nem no seed `prisma/seed.ts`. Efeito: **só admin** (bypass) acessa —
   nem supervisor/administrativo, mesmo com `configuracoes:gerir`.
   → Adicionar `avisos` ao catálogo+seed, ou trocar o gate por `configuracoes:gerir`/`HR_ADMIN_ROLES`. · **Decisão:**

3. **Estagiário sem acesso ao próprio extrato.** O seed concede `financeiro:extrato` a
   clt/projetista_pj/freelancer/cliente, mas **não** a `estagiario`; e o item Financeiro do menu não inclui `estagiario`.
   → Confirmar se estagiário deve ver "Meu extrato"/holerite; se sim, incluir em `financeiro:extrato` (seed) e no `roles` do item (nav-config). · **Decisão:**

4. **Supervisor sem `gerir` em Comercial/Licitações.** O seed dá a supervisor só `comercial:ver` e
   `licitacoes:ver`; administrativo tem os dois `gerir`. Efeito: supervisor (perfil "alto") **não** cria/edita
   propostas, tabelas de preço, nem acessa `/configuracoes/funil-etapas`, `/configuracoes/habilitacao`, `/configuracoes/modalidades`.
   → Confirmar intenção; se não, conceder `comercial:gerir`/`licitacoes:gerir` a supervisor. · **Decisão:**

5. **`/configuracoes/licitacoes` é `requireRole("admin")`** enquanto as demais telas de licitação usam
   `licitacoes:gerir`. Efeito: administrativo gere licitações mas **não** abre os parâmetros gerais.
   → Confirmar se deve ser `licitacoes:gerir`. · **Decisão:**

### 0.B — Transversais de UX/UI _(valem para várias telas)_

1. **Sem `loading.tsx` em nenhuma rota.** A navegação entre páginas não mostra skeleton de carregamento
   (o primitivo `src/components/ui/skeleton.tsx` existe, mas é subutilizado).
   → Add `loading.tsx` por módulo (lista → skeleton de tabela; detalhe → skeleton de cards). · **Apont.:**

2. **`error.tsx` ausente em `ferramentas` e `preferencias`** (quase todos os outros módulos têm). Erros
   nesses módulos caem no boundary global do `(dashboard)` — mensagem menos contextual. · **Apont.:**

3. **Ações destrutivas sem confirmação.** Ex.: excluir compromisso (`agenda-view.tsx` → `CompRow.excluir`)
   e desativar cliente (`clientes-view.tsx` → `alternarAtivo`) executam direto. Já existe `ConfirmProvider` +
   `ui/confirm-dialog` (usado noutros pontos). → Padronizar confirmação em excluir/desativar. · **Apont.:**

4. **`EmptyState` inconsistente.** Projetos, Ponto, Agenda e Home usam `<EmptyState>`; já `clientes-view`
   e a lista de `tarefas` usam `<TableCell>` com texto puro. → Padronizar `<EmptyState>` (com ação "Novo…" quando couber). · **Apont.:**

5. **Ordenação/filtro client-side só na página atual.** `projetos-view` "Ordenar por risco" reordena apenas
   os itens já carregados; com paginação, o resultado engana. → Mover ordenação ao servidor (ou desabilitar com >1 página). · **Apont.:**

6. **Bottom-nav corta no 6º item** (`bottom-nav.tsx` → `.slice(0, 6)`). Admin tem 7 itens `mobile:true`,
   então **"Configurações" some da barra inferior** (só pelo menu hambúrguer). → Escolher os 6 certos ou um item "Mais". · **Apont.:**

7. **Busca sem debounce e inconsistente.** Projetos/Clientes só buscam no Enter/clique; Tarefas usa
   Enter+blur. → Padronizar (idealmente type-to-search com debounce). · **Apont.:**

8. **Início de semana inconsistente na Agenda.** A grade mensal começa no **domingo** (`getDay()`), mas a
   vista semanal começa na **segunda** (`inicioSemana`). → Unificar (provavelmente segunda). · **Apont.:**

9. **Home pouco útil para colaborador.** `(dashboard)/page.tsx` monta KPIs/cartões focados em gestão;
   colaborador (sem financeiro/global) vê a home "esvaziada". → Add blocos pessoais: minhas tarefas
   (abertas/atrasadas), meu ponto de hoje, meus próximos prazos. · **Apont.:**

10. **Filtros ocupam muito em telas estreitas.** Várias listas têm 4–5 `Select` lado a lado; no mobile
    empilham e empurram a tabela. → Considerar "Filtros" recolhíveis (sheet) no mobile. · **Apont.:**

### 0.C — UX/UI por tela _(pré-análise; profundidade indicada)_

> **revisado em código** = li o componente e os apontamentos são específicos.
> **herda 0.B** = não revisei a fundo; aplicar os transversais e revisar manualmente.

- **Início `/`** _(revisado)_ — ver 0.B-9. "Projetos recentes" usa `<table>` própria em vez do `ui/table`
  (inconsistência menor). Bloco "Evolução" só aparece com ≥2 snapshots (some em base nova — ok). · **Apont.:**
- **Projetos `/projetos`** _(revisado)_ — Kanban é **read-only** (sem arrastar p/ mudar situação, ao contrário de Tarefas);
  "Ordenar por risco" só na página (0.B-5); muitos selects de filtro (0.B-10). · **Apont.:**
- **Projeto detalhe `/projetos/[id]` + abas** _(herda 0.B)_ — revisar abas Pranchas/Serviços/Arquivos/Extras/Inputs/Financeiro. · **Apont.:**
- **Clientes `/clientes`** _(revisado)_ — empty-state plano (0.B-4); desativar sem confirm (0.B-3); sem ação em massa. · **Apont.:**
- **Tarefas `/tarefas`** _(revisado — referência boa)_ — tem "Limpar filtros", drag-drop e toggle quadro/lista;
  só ajustar empty-state da lista (0.B-4). · **Apont.:**
- **Agenda `/agenda`** _(revisado)_ — excluir sem confirm (0.B-3); início de semana (0.B-8); sugerir
  clicar no dia da grade p/ criar compromisso ali. · **Apont.:**
- **Ponto `/ponto`** _(revisado — bom)_ — offline + cronômetro + tooltip do banco de horas; o "Espelho do mês"
  mostra só total/dia (entrada/saída só no CSV) → considerar expandir por dia na tela. · **Apont.:**
- **Comercial** (`/comercial`, oportunidades, propostas, tabelas) _(herda 0.B)_ — revisar manualmente. · **Apont.:**
- **Financeiro** (`/financeiro` + ~18 sub-telas) _(herda 0.B)_ — muitas telas densas; priorizar contas, lançamentos, relatórios. · **Apont.:**
- **RH** (`/rh`, admin, folha, funcionários, produtividade, PJs) _(herda 0.B)_ — revisar manualmente. · **Apont.:**
- **Licitações** (`/licitacoes` + detalhe/processo/sanções) _(herda 0.B)_ — revisar manualmente. · **Apont.:**
- **Documentos/Estúdio** (`/documentos` + editor/preview/datasets/carimbos/gerados) _(herda 0.B)_ — revisar manualmente (editor é a tela mais complexa). · **Apont.:**
- **Planejamento** (`/planejamento` + cronograma/EAP/print) _(herda 0.B)_ — revisar Gantt em telas estreitas. · **Apont.:**
- **Jurídico, Qualidade, Recursos, Suporte, Chat, Preferências, Configurações** _(herda 0.B)_ — revisar manualmente. · **Apont.:**

---

## 1. ADMIN — _vê tudo; ignora a matriz de permissões_

### Geral
- `/` — Início (dashboard gestor: carteira, KPIs financeiros, aniversariantes) · **Apont.:**
- `/projetos` — Lista de projetos (filtros, saúde, exportação) · **Apont.:**
- `/projetos/[id]` — Detalhe do projeto (visão geral) · **Apont.:**
  - `/projetos/[id]/pranchas` — Aba Pranchas · **Apont.:**
  - `/projetos/[id]/servicos` — Aba Serviços terceirizados · **Apont.:**
  - `/projetos/[id]/arquivos` — Aba Arquivos · **Apont.:**
  - `/projetos/[id]/extras` — Aba Extras · **Apont.:**
  - `/projetos/[id]/inputs` — Aba Inputs (questionário do cliente) · **Apont.:**
  - `/projetos/[id]/financeiro` — Aba Financeiro do projeto (receita, margem, EVM) · **Apont.:**
- `/clientes` — Lista de clientes · **Apont.:**
- `/clientes/[id]` — Detalhe do cliente (cadastro, contatos, projetos, financeiro) · **Apont.:**
- `/comercial` — Funil de vendas (Kanban, metas) · **Apont.:**
  - `/comercial/oportunidades` — Pipeline de leads por etapa · **Apont.:**
  - `/comercial/[id]` — Detalhe do lead · **Apont.:**
  - `/comercial/propostas` — Lista de propostas · **Apont.:**
  - `/comercial/propostas/[id]` — Editor de proposta · **Apont.:**
  - `/comercial/tabelas` — Tabelas de preço por disciplina · **Apont.:**
- `/tarefas` — Quadro Kanban de tarefas · **Apont.:**
- `/agenda` — Agenda pessoal (compromissos + prazos) · **Apont.:**
- `/chat` — Mensageria em tempo real · **Apont.:**

### RH
- `/ponto` — Registro de ponto (abrir/fechar, espelho mensal) · **Apont.:**
- `/rh` — Visão pessoal (abonos, férias, onboarding, humor) · **Apont.:**
- `/rh/admin` — Painel administrativo de RH · **Apont.:**
- `/rh/folha` — Folha CLT (lista por mês/ano) · **Apont.:**
- `/rh/folha/[id]` — Detalhe da folha (rubricas, holerites, INSS/IRRF) · **Apont.:**
- `/rh/funcionarios` — Cadastro de funcionários · **Apont.:**
- `/rh/produtividade` — Produtividade dos projetistas · **Apont.:**
- `/rh/pessoas-juridicas` — Cadastro de PJs · **Apont.:**

### Financeiro
- `/financeiro` — Visão geral (DRE, caixa, aging, atalhos) · **Apont.:**
  - `/financeiro/contas` — Contas a pagar/receber (abas) · **Apont.:**
  - `/financeiro/lancamentos` — Livro caixa (lançamento manual) · **Apont.:**
  - `/financeiro/conciliacao` — Importação OFX + conciliação · **Apont.:**
  - `/financeiro/aprovacoes` — Despesas aguardando aprovação por alçada · **Apont.:**
  - `/financeiro/cadastros` — Plano de contas, contas, fornecedores, sócios · **Apont.:**
  - `/financeiro/importar` — Importação histórica (planilha) · **Apont.:**
  - `/financeiro/dfc` — Demonstração de fluxo de caixa · **Apont.:**
  - `/financeiro/fluxo-caixa` — Saldos + projeção 8 semanas · **Apont.:**
  - `/financeiro/orcamento` — Orçado × realizado por categoria · **Apont.:**
  - `/financeiro/planejamento` — Cenários de planejamento de caixa · **Apont.:**
  - `/financeiro/planejamento/[id]` — Detalhe do cenário · **Apont.:**
  - `/financeiro/fechamento` — Consolidação mensal + retenções · **Apont.:**
  - `/financeiro/relatorios` — DRE comparativo, indicadores · **Apont.:**
  - `/financeiro/rentabilidade` — Margem por projeto/disciplina · **Apont.:**
  - `/financeiro/balanco` — Balanço gerencial (base caixa) · **Apont.:**
  - `/financeiro/documentos` — Documentos financeiros (NF, contratos) · **Apont.:**
  - `/financeiro/configuracoes` — Regras, alíquotas, níveis de aprovação · **Apont.:**
  - `/financeiro/folha-projetistas` — Pagamentos por entrega a PJ/freelancer · **Apont.:**
- `/documentos` — Estúdio: lista de modelos · **Apont.:**
  - `/documentos/carimbos` — Carimbo de prancha · **Apont.:**
  - `/documentos/datasets` — Datasets (CSV) reutilizáveis · **Apont.:**
  - `/documentos/[id]` — Editor de modelo · **Apont.:**
  - `/documentos/[id]/preview` — Preview com dados reais · **Apont.:**
  - `/documentos/gerados` — Histórico de documentos gerados · **Apont.:**
  - `/documentos/gerados/[id]` — Documento gerado (snapshot) · **Apont.:**

### Engenharia
- `/ferramentas` — Galeria de ferramentas de engenharia · **Apont.:**
- `/ferramentas/[key]` — Detalhe/uso de uma ferramenta · **Apont.:**

### Gestão
- `/planejamento` — Projetos com EAP · **Apont.:**
  - `/planejamento/cronograma` — Gantt geral dos projetos ativos · **Apont.:**
  - `/planejamento/[projetoId]` — EAP + Plano × Real do projeto · **Apont.:**
  - `/planejamento/[projetoId]/print` — Versão impressão do Gantt · **Apont.:**
- `/recursos` — Matriz de recursos (carga semanal, skills) · **Apont.:**
- `/juridico` — Documentos e certidões · **Apont.:**
- `/licitacoes` — Lista de licitações (KPIs, filtros) · **Apont.:**
  - `/licitacoes/sancoes` — Registro de sanções · **Apont.:**
  - `/licitacoes/[id]` — Detalhe da licitação · **Apont.:**
  - `/licitacoes/[id]/processo` — Resumo do processo (impressão A4) · **Apont.:**
- `/qualidade` — Índice de qualidade, SLA, revisões · **Apont.:**
- `/suporte` — Chamados de suporte · **Apont.:**

### Sistema
- `/preferencias` — Preferências pessoais (chat, notificações) · **Apont.:**
- `/configuracoes` — Hub de configurações · **Apont.:**
  - `/configuracoes/permissoes` — Matriz de permissões · **Apont.:**
  - `/configuracoes/usuarios` — Usuários + solicitações de cadastro · **Apont.:**
  - `/configuracoes/feriados` — Calendário de feriados · **Apont.:**
  - `/configuracoes/encargos` — Faixas INSS/IRRF · **Apont.:**
  - `/configuracoes/avisos` — Aviso geral (sino + push) · **Apont.:**
  - `/configuracoes/inputs` — Modelos de inputs por disciplina · **Apont.:**
  - `/configuracoes/habilitacao` — Checklist de habilitação (licitações) · **Apont.:**
  - `/configuracoes/licitacoes` — Parâmetros de licitação · **Apont.:**
  - `/configuracoes/modalidades` — Modalidades de licitação · **Apont.:**
  - `/configuracoes/documentos` — Modelos padrão por fonte · **Apont.:**
  - `/configuracoes/funil-etapas` — Etapas do funil comercial · **Apont.:**
- `/auditoria` — Log imutável de atividades · **Apont.:**
  - `/auditoria/uso` — Uso por seção (page-views, heatmaps) · **Apont.:**
  - `/auditoria/uso/[secao]` — Detalhe de uso de uma seção · **Apont.:**

---

## 2. SUPERVISOR — _global; quase tudo, sem Auditoria_

> Igual ao admin, **exceto** as exclusões abaixo. Tem `comercial:ver` (sem `gerir`),
> `licitacoes:ver` (sem `gerir`) por padrão.

### Geral
- `/` — Início (dashboard gestor) · **Apont.:**
- `/projetos` + `/projetos/[id]` (todas as abas, inclui Financeiro) · **Apont.:**
- `/clientes` + `/clientes/[id]` · **Apont.:**
- `/comercial` + `/comercial/oportunidades` + `/comercial/[id]` + `/comercial/propostas` (+`/[id]`) · **Apont.:**
  - `/comercial/tabelas` — _(perm: comercial:gerir — **não** tem por padrão)_ · **Apont.:**
- `/tarefas` · `/agenda` · `/chat` · **Apont.:**

### RH (igual ao admin)
- `/ponto` · `/rh` · `/rh/admin` · `/rh/folha` (+`/[id]`) · `/rh/funcionarios` · `/rh/produtividade` · `/rh/pessoas-juridicas` · **Apont.:**

### Financeiro (igual ao admin — todas as ~18 sub-telas)
- `/financeiro` e sub-telas (contas, lançamentos, conciliação, dfc, relatórios, rentabilidade, etc.) · **Apont.:**
- `/documentos` + sub-telas (carimbos, datasets, editor, preview, gerados) · **Apont.:**

### Engenharia
- `/ferramentas` (+`/[key]`) · **Apont.:**

### Gestão
- `/planejamento` (+ cronograma, `/[projetoId]`, print) · **Apont.:**
- `/recursos` · **Apont.:**
- `/juridico` · **Apont.:**
- `/licitacoes` (+ sancoes, `/[id]`, processo) — leitura; `gerir` não por padrão · **Apont.:**
- `/qualidade` · **Apont.:**
- `/suporte` (como gestor: vê todos os chamados) · **Apont.:**

### Sistema
- `/preferencias` · **Apont.:**
- `/configuracoes` (hub) · **Apont.:**
  - `/configuracoes/permissoes` · `/configuracoes/usuarios` · `/configuracoes/feriados` · `/configuracoes/encargos` · `/configuracoes/inputs` · `/configuracoes/documentos` · **Apont.:**
  - **Sem acesso por padrão:** `avisos` (só admin), `licitacoes` (só admin), `habilitacao`/`modalidades` (perm licitacoes:gerir), `funil-etapas` (perm comercial:gerir) · **Apont.:**
- **Sem Auditoria** (`/auditoria*` é só admin) · **Apont.:**

---

## 3. ADMINISTRATIVO — _gestão completa, sem Qualidade nem Auditoria_

> Tem `comercial:gerir`, `licitacoes:gerir`, `juridico:gerir`. **Não** tem `qualidade:ver`,
> nem `uploads:validar`.

### Geral
- `/` — Início · **Apont.:**
- `/projetos` + `/projetos/[id]` (todas as abas) · **Apont.:**
- `/clientes` + `/clientes/[id]` · **Apont.:**
- `/comercial` + oportunidades + `/[id]` + propostas (+`/[id]`) + **`/comercial/tabelas`** (tem gerir) · **Apont.:**
- `/tarefas` · `/agenda` · `/chat` · **Apont.:**

### RH (igual ao admin)
- `/ponto` · `/rh` · `/rh/admin` · `/rh/folha` (+`/[id]`) · `/rh/funcionarios` · `/rh/produtividade` · `/rh/pessoas-juridicas` · **Apont.:**

### Financeiro
- `/financeiro` + todas as sub-telas · **Apont.:**
- `/documentos` + todas as sub-telas · **Apont.:**

### Engenharia
- `/ferramentas` (+`/[key]`) · **Apont.:**

### Gestão
- `/planejamento` (+ cronograma, `/[projetoId]`, print) · **Apont.:**
- `/recursos` · **Apont.:**
- `/juridico` · **Apont.:**
- `/licitacoes` (+ sancoes, `/[id]`, processo) — com gerir · **Apont.:**
- **Sem Qualidade** (não tem `qualidade:ver`; não aparece no menu) · **Apont.:**
- `/suporte` (gestor) · **Apont.:**

### Sistema
- `/preferencias` · **Apont.:**
- `/configuracoes` (hub) · **Apont.:**
  - Acessa: `permissoes`, `usuarios`, `feriados`, `encargos`, `inputs`, `documentos`, `habilitacao`, `modalidades`, `funil-etapas` · **Apont.:**
  - **Sem acesso:** `avisos` e `licitacoes` (ambos só admin) · **Apont.:**
- **Sem Auditoria** · **Apont.:**

---

## 4. CLT — _colaborador interno_

- `/` — Início (versão colaborador) · **Apont.:**
- `/projetos` — Lista (escopo: projetos onde participa) · **Apont.:**
  - `/projetos/[id]` — Detalhe (abas Pranchas/Serviços/Arquivos/Extras/Inputs; **sem** aba Financeiro) · **Apont.:**
- `/projetos/meu-trabalho` — Minhas disciplinas em projetos ativos · **Apont.:**
- `/tarefas` — Quadro de tarefas · **Apont.:**
- `/agenda` — Agenda pessoal · **Apont.:**
- `/chat` — Mensageria (canais dos seus projetos) · **Apont.:**
- `/ponto` — Registro de ponto · **Apont.:**
- `/rh` — Visão pessoal (abonos, férias, onboarding, humor) · **Apont.:**
- `/financeiro` — **Meu extrato** pessoal (perm: financeiro:extrato) · **Apont.:**
- `/ferramentas` (+`/[key]`) — Ferramentas de engenharia · **Apont.:**
- `/planejamento` — EAP/cronograma (leitura) · **Apont.:**
  - `/planejamento/cronograma` · `/planejamento/[projetoId]` (+ print) — leitura · **Apont.:**
- `/suporte` — Meus chamados · **Apont.:**
- `/preferencias` — Preferências pessoais · **Apont.:**

---

## 5. ESTAGIÁRIO — _como CLT, porém sem Financeiro_

- `/` — Início · **Apont.:**
- `/projetos` + `/projetos/[id]` (sem aba Financeiro) · **Apont.:**
- `/projetos/meu-trabalho` · **Apont.:**
- `/tarefas` · `/agenda` · `/chat` · **Apont.:**
- `/ponto` · `/rh` (visão pessoal) · **Apont.:**
- **Sem Financeiro** (não tem `financeiro:extrato`; não aparece no menu) · **Apont.:**
- `/ferramentas` (+`/[key]`) · **Apont.:**
- `/planejamento` (+ cronograma, `/[projetoId]`, print) — leitura · **Apont.:**
- `/suporte` · `/preferencias` · **Apont.:**

---

## 6. PROJETISTA_PJ — _colaborador PJ_

- `/` — Início · **Apont.:**
- `/projetos` + `/projetos/[id]` (sem aba Financeiro) · **Apont.:**
- `/projetos/meu-trabalho` · **Apont.:**
- `/tarefas` · `/agenda` · `/chat` · **Apont.:**
- `/ponto` · **Apont.:**
- `/rh` — Visão pessoal (inclui card de NF para PJ) · **Apont.:**
- `/financeiro` — **Meu extrato** (perm: financeiro:extrato) · **Apont.:**
- `/ferramentas` (+`/[key]`) · **Apont.:**
- `/planejamento` (+ cronograma, `/[projetoId]`, print) — leitura · **Apont.:**
- `/suporte` · `/preferencias` · **Apont.:**

---

## 7. FREELANCER — _como PJ, sem Chat e sem Planejamento_

- `/` — Início · **Apont.:**
- `/projetos` + `/projetos/[id]` (sem aba Financeiro) · **Apont.:**
- `/projetos/meu-trabalho` · **Apont.:**
- `/tarefas` · `/agenda` · **Apont.:**
- **Sem Chat** (freelancer excluído do chat) · **Apont.:**
- `/ponto` · **Apont.:**
- `/rh` — Visão pessoal (card de NF) · **Apont.:**
- `/financeiro` — **Meu extrato** (perm: financeiro:extrato) · **Apont.:**
- `/ferramentas` (+`/[key]`) · **Apont.:**
- **Sem Planejamento** (não tem `planejamento:ver`) · **Apont.:**
- `/suporte` · `/preferencias` · **Apont.:**

---

## 8. CLIENTE — _portal externo, somente leitura_

- `/portal` — "Meus projetos" (lista escopada ao `clienteId`) · **Apont.:**
- `/portal/[projetoId]` — Detalhe do projeto (disciplinas, status, prazos) · **Apont.:**
- `/financeiro` — **Meu extrato** (perm: financeiro:extrato) · **Apont.:**
- `/suporte` — Chamados _(visível no menu por não ter `roles`; **verificar se deveria** — possível apontamento)_ · **Apont.:**
- _Não vê:_ Início, Projetos internos, Chat, Preferências, Agenda, Tarefas, Ponto, RH · **Apont.:**

---

## 9. Telas públicas / token — _fora do perfil logado_

> Acessadas sem login ou via link com token (cliente/colaborador em onboarding).

- `/login` — Login · **Apont.:**
- `/solicitar-cadastro` — Solicitar cadastro (público) · **Apont.:**
- `/trocar-senha` — Troca de senha forçada (primeiro acesso) · **Apont.:**
- `/termo` — Aceite de termo de uso · **Apont.:**
- `/sem-permissao` — Acesso negado · **Apont.:**
- `/p/inputs/[token]` — Formulário de inputs do cliente (token) · **Apont.:**
- `/a/proposta/[token]` — Visualização de proposta (token) · **Apont.:**
- `/p/aceite/[token]` — Aceite de proposta (token) · **Apont.:**
