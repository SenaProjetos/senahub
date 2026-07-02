---
titulo: Deliberação — Fundação do manual e Guia de Início Rápido
descricao: Ata técnica do Conselho sobre a criação da estrutura do manual e do Quick Start.
resumo: Descobertas, opiniões dos especialistas, divergências e decisão final sobre a fundação da documentação.
tags: [deliberação, conselho, quick-start, fundação, ata]
palavras-chave: [deliberação, ata, conselho, decisão, quick start, estrutura]
sinonimos: [ata técnica, registro de discussão]
---

# Deliberação — Fundação do manual e Guia de Início Rápido

- **Data:** 2026-06-30

## Funcionalidade analisada

Fundação da base de conhecimento do usuário: árvore de pastas, páginas-âncora
(`README`, `quick-start`, `faq`, `glossary`, `search-index.json`) e o **Guia de Início
Rápido**, cobrindo acesso, navegação, CRUD, busca e filtros — transversais a todo o
sistema.

## Participantes

Presidente, Usuário Iniciante, Usuário Experiente, UX, Backend, Frontend, QA, Analista
de Negócios, Diretor, Especialista em Treinamento, Revisor Técnico, Arquiteto,
Acessibilidade, Pesquisa, Documentação Técnica, Product Owner, Suporte.

## Descobertas

Levantadas por inspeção direta do código:

- **Acesso:** login por e-mail/senha (`better-auth`) em `components/auth/login-form.tsx`.
  Erro 401/403 → toast "E-mail ou senha incorretos."; sucesso → redireciona para
  `?from` ou `/`. Há **Esqueci minha senha** (dialog) e **Solicitar acesso**
  (`/solicitar-cadastro`). Existe fluxo de **troca de senha** (`/trocar-senha`).
- **Navegação:** `src/lib/nav-config.ts` define os grupos (Topo, RH, Financeiro,
  Engenharia, Gestão, Sistema) e filtra itens por perfil (`navItemsForRole`).
- **Barra do topo** (`components/shell/header.tsx`): botão **Buscar (Ctrl K)**, resumo
  da Agenda, sino de notificações, alternar tema e menu da conta.
- **Menu da conta** (`components/shell/user-menu.tsx`): Alterar foto, Trocar senha, Sair.
- **Busca global** (`components/shell/command-palette.tsx`): **Ctrl/Cmd+K**, mínimo 2
  caracteres, debounce ~220ms; resultados em Projetos, Clientes, Tarefas, Documentos,
  Lançamentos, Licitações e Propostas.
- **Listas** (`src/lib/list-params.ts`): paginação 12/24/48 (padrão 12), ordenação por
  whitelist de campos, estado na URL; mudar filtro **reseta para página 1**.
- **Perfis** (`src/lib/roles.ts`): **9 perfis** — admin, supervisor, administrativo,
  clt, estagiario, projetista_pj, freelancer, cliente, **ti**. `admin` ignora
  permissões; permissões finas `recurso:ação`.

## Questionamentos

- Onde hospedar o manual sem colidir com o `docs/` de desenvolvimento? → ver
  [ADR-001](../decisions/ADR-001-estrutura-documentacao.md).
- O CLAUDE.md cita **8 perfis**; o código tem **9** (`ti`). Qual vale? → o **código**.
- Documentar credenciais padrão de acesso? → **não**: são valores administrativos
  internos; o manual descreve o fluxo, não segredos.
- O efeito visual de recarregamento (FOUC/Fast Refresh) é defeito? → **não**, é artefato
  de desenvolvimento; descrito como tal no FAQ.

## Opiniões dos Especialistas

### Usuário Iniciante
Precisa saber **onde clicar**. Pediu seção explícita "Conhecendo a tela" e o caminho do
menu da conta para trocar senha. Atendido.

### Usuário Experiente
Quer atalhos. Destacou **Ctrl K** e o compartilhamento de listas por URL como ganhos de
produtividade — promovidos a seções próprias.

### UX
Aprovou agrupar por seções iguais às do menu real (familiaridade). Alertou contra
descrever só a interface — o guia explica **comportamento** (ex.: reset de página).

### Backend
Confirmou regras: enforcement real é server-side; "botão sumido = permissão" é a
explicação correta para o usuário. Auditoria é automática e inescapável.

### Frontend
Validou textos e rótulos exatos (mensagem de erro de login, "Buscar", "Ctrl K",
itens do menu da conta) contra os componentes.

### QA
Exigiu cobrir o **caminho de erro** (login inválido, sem permissão, tempo real
indisponível) — incorporado na seção 12 e no FAQ. Marcou como pendência a confirmação
de quais telas ainda **não** pedem confirmação ao excluir.

### Analista de Negócios / Diretor
Objetivo: reduzir suporte e treinamento. Guia curto e orientado a tarefa atende; FAQ
ataca as dúvidas recorrentes (senha, permissão).

### Especialista em Treinamento
Pediu tabelas (menus, perfis, atalhos, erros) em vez de texto corrido — adotado.

### Acessibilidade / Pesquisa / Documentação Técnica
Metadados (`tags`/`palavras-chave`/`sinonimos`) em todas as páginas + `search-index.json`
para busca por sinônimos (ex.: "boleto" → financeiro). Linguagem clara e títulos
padronizados.

### Product Owner
Confirmou que a fundação reflete a intenção do produto e abre caminho para os módulos.

### Suporte
Validou o FAQ como primeira linha de atendimento; pediu manter a coluna "o que fazer".

## Discussão

O ponto central foi **localização do manual**. UX e Arquiteto defenderam isolar do
`docs/` técnico; Documentação Técnica lembrou a compatibilidade com geradores estáticos.
Consenso: `docs/manual/` como docs root próprio. Sobre **profundidade**, acordou-se que
o Quick Start é transversal (não entra em regras específicas de módulo), deixando o
detalhe para as seções, que nascem como índices honestos marcados 🚧.

## Divergências

- **Raiz `docs/` (spec literal) × `docs/manual/`.** Defensores da literalidade: aderência
  ao spec. Defensores de `docs/manual/` (UX, Arquiteto, Documentação Técnica): evitar
  mistura de públicos e risco sobre os arquivos de dev. **Decisão:** `docs/manual/`,
  registrada no ADR-001 com a justificativa.

## Decisão Final

- Criada a fundação em `docs/manual/` (estrutura do ADR-001).
- Publicado o **Guia de Início Rápido** validado contra o código.
- Seções por módulo criadas como índices 🚧, alinhadas ao menu real.

## Melhorias Sugeridas

### Para a documentação
- Adicionar capturas de tela ao Quick Start quando houver ambiente de produção estável.
- Evoluir o `search-index.json` para incluir âncoras de seção (não só páginas).

### Para o sistema (não altera comportamento atual)
- Padronizar **confirmação em todas** as ações destrutivas (QA observou exclusões diretas
  em algumas telas — ver `docs/revisao-telas-por-perfil.md`).
- Avaliar um link **"Ajuda"** no app apontando para este manual.

## Pendências

- Confirmar exatamente **quais** telas ainda excluem sem confirmação (auditar
  `agenda-view`, `clientes-view` e afins) antes de afirmar no manual de cada módulo.
- Confirmar o gatilho preciso da **troca de senha obrigatória** (primeiro acesso vs.
  redefinição) para detalhar no módulo de conta/sistema.
- Alinhar CLAUDE.md (cita 8 perfis) com o código (9, inclui `ti`) — divergência de doc,
  não de comportamento.
