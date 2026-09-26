# Plano — Área útil das telas e uso pelo celular

- **Data:** 2026-09-25
- **Origem:** dono apontou que, na aba Arquivos do projeto, menos da metade da tela é área útil e
  que monitores pequenos vivem com barra de rolagem; depois pediu a mesma análise em todas as telas,
  no menu lateral e no celular, com o objetivo de **incentivar o uso do sistema pelo celular**.
- **Evidência:** duas varreduras reais contra o dev (porta 3001, usuário admin de teste, dados de
  demonstração): 58 telas em 1366 × 768 (24/09) e as mesmas 58 em 390 × 844 com toque (25/09).
  Modelo de aprovação com capturas, números e antes/depois:
  <https://claude.ai/artifact/UjcN2Td32WFiQqkwTtVxmL> (abas Todas as telas, Celular, Menu lateral,
  Projeto).
- **Estado:** direção das Fases 1–3 aprovada; o dono mandou iniciar pelo lote 1 em 2026-09-25.
- **Branch:** `feat/area-util-celular`, a partir de `dev-vscode` (worktree `SENAHub-remake-vscode`).

---

## 0. Decisões do dono

1. **Card de ponto no Início do celular em lista, não em fichas soltas** (2026-09-25). A linha de
   cima mostra a atividade atual; as de baixo, as recentes, para trocar em um toque.
2. **1º nível da atividade = o que o ponto já grava** (projeto, reunião interna, reunião externa,
   sem projeto), trocado pela `trocarProjeto` existente: fecha a `SessaoTrabalho` atual e abre a
   nova no mesmo instante, sem nova batida e sem mudar o total do dia.
3. **2º nível (disciplina › atividade da EAP) fica previsto, mas bloqueado** pela reforma das EAPs
   em andamento na outra worktree (lote 9). Não criar schema antes de alinhar com aquele modelo.
4. **Modelo por lote**, com parada para troca de modelo sempre que o lote seguinte pede outro
   (regra do dono). Lote do mesmo modelo segue direto, sem pedir licença.

## 1. O que as varreduras mostraram

**Computador (1366 × 768, menu recolhido)**
- 50 das 58 telas abrem com um título grande que repete o da barra do topo.
- 32 das 58 rolam a página inteira; conteúdo começa, na mediana, em 212 px (28% da altura).
- Menu lateral: 45 itens; recolhido mostra 16 ícones sem nome (1798 px de itens para 655 px
  visíveis); aberto ocupa 256 px (19% de 1366) e ainda rola.
- O botão flutuante do chat cobre a última coluna das tabelas ("Pagar tudo", valores da DRE, ⋯).
- Compatibilização usa `h-[calc(100vh-160px)]`, mas o cabeçalho real tem ~300 px: o visualizador
  sempre passa da tela.

**Celular (390 × 844)**
- 19 telas são mais largas que o celular por fileiras de botões sem quebra (no projeto, o grupo
  `shrink-0` de Chat/Editar/Duplicar/Gerar documento): a viewport de layout alarga (524 px nas
  abas do projeto), a página balança para o lado e a `BottomNav` sai da tela.
- O nome do projeto some nas 12 abas (botões por cima).
- A barra do topo encavala o título com o relógio do ponto; a data quebra em 3 linhas.
- A barra de baixo mostra os 6 primeiros itens `mobile: true` (Início, Projetos, Meu trabalho,
  Tarefas, Chat, Ajuda): o Ponto fica de fora.
- 22% dos 1977 alvos de toque têm menos de 24 px; 49% menos de 32 px (botão padrão `h-8`).
- 79 campos em 22 telas com letra < 16 px (zoom no iPhone). O `Input` base já está certo
  (`text-base md:text-sm`); o problema são classes próprias.
- O app já é instalável (manifest + service worker), mas nada convida a instalar; o manifesto não
  tem `shortcuts`; push no iPhone só funciona com o app instalado.

## 2. Lotes

Dentro de cada lote as etapas têm o mesmo modelo e esforço e **não dependem umas das outras**;
dependência só entre lotes. Tamanho: P pequeno, M médio, G grande.

### Lote 1 · Opus 5.5 · esforço alto · sem dependências
| # | Etapa | Tam. |
|---|---|---|
| 1.1 | **Espaço do cabeçalho na barra do topo** — a página declara título, descrição curta e ações, e a barra do topo exibe. Base das Fases 1 e 4. Sem piscar ao navegar. | M |
| 1.2 | **Início "Hoje" no celular** com o card de ponto em lista (1º nível), reusando batida, `trocarProjeto` e a fila sem internet, mais consulta das atividades recentes. | G |

### Lote 2 · Haiku 4.5 · esforço baixo · sem dependências
| # | Etapa | Tam. |
|---|---|---|
| 2.1 | Fileiras de botões com quebra de linha: Projetos, Custos, Acessos, Licitações, Suporte, Folha CLT e a linha "Pagar tudo" da Produção. | P |
| 2.2 | Paliativo no cabeçalho do projeto: o grupo de botões quebra linha (acaba a página de 524 px; redesenho na 5.1). | P |
| 2.3 | Botão flutuante do chat escondido no celular. | P |
| 2.4 | Pessoas: tabela com rolagem lateral em vez de corte; Jurídico: botões dos contratos quebram linha. | P |
| 2.5 | Campos com 16 px no celular (79 campos em 22 telas: Escalas, Inputs, Jurídico…). | M |
| 2.6 | Diário do projeto: foto direto da câmera. | P |

### Lote 3 · Sonnet 5 · esforço médio · sem dependências (3.1 depois de 1.1: mesmo arquivo)
| # | Etapa | Tam. |
|---|---|---|
| 3.1 | Barra do topo no celular: saem relógio, data e tema (tema no menu da conta). | P |
| 3.2 | Barra de baixo: Início, Projetos, Tarefas, Ponto, Chat, Mais. | P |
| 3.3 | Tamanhos para toque (`pointer-coarse`) em botão, campo, lista de opções e caixas de seleção. | M |
| 3.4 | Agenda no celular abre na lista do dia. | M |
| 3.5 | App instalável: convite (Android e iPhone), atalhos no ícone, notificação depois de instalar, QR "abrir no celular". | M |
| 3.6 | Minha conta e Preferências em abas. | M |
| 3.7 | Números em grade 2 × 2 no celular (Financeiro, Licitações, Qualidade, Certidões); resumo recolhível em Licitações. | M |

### Lote 4 · Sonnet 5 · esforço alto · sem dependências
| # | Etapa | Tam. |
|---|---|---|
| 4.1 | **Fase 2** — barra única em Arquivos; etiquetas de filtro só com filtro ativo; aviso de Novidade como balão (componente usado em 17 telas). | M |
| 4.2 | Filtros em gaveta no celular ("Filtros · 2") em Projetos, Clientes, Produção, Auditoria. | M |
| 4.3 | Tabelas → cartões no celular: Clientes, Pessoas, Certidões; nome visível em Aprovações. | G |
| 4.4 | Visão Geral do projeto em grade de 2–3 colunas a partir de 1280 px. | M |
| 4.5 | Acesso registra celular × computador; "Uso por seção" dividido (migração aditiva, só no banco deste worktree). | M |

### Lote 5 · Sonnet 5 · esforço alto · depende dos lotes 1, 3 e 4
| # | Etapa | Depende de | Tam. |
|---|---|---|---|
| 5.1 | **Fase 1** — cabeçalho do projeto em uma linha; nome na barra do topo no celular; ações no ⋯; abas mais baixas; sem "← projeto" repetido em Histórico, Serviços, Extras. | 1.1 | M |
| 5.2 | **Fase 5** — menu lateral por seções: trilho com nome e lista flutuante, aberto com seções recolhíveis, atalhos fixados na conta, chat e "?" na barra do topo. | 3.1, 3.2 | G |
| 5.3 | **Fase 6a** — Funil na altura da tela; no celular, uma etapa por vez e "Mover para…". | 4.2 | G |
| 5.4 | **Fase 6b** — Tarefas, idem. | 4.2 | M |
| 5.5 | Tela Ponto com a mesma lista de atividades e botão grande. | 1.2 | M |

### Lote 6 · Sonnet 5 · esforço alto · depende de 4.1 e 5.1
| # | Etapa | Tam. |
|---|---|---|
| 6.1 | **Fase 3** — Arquivos e Compatibilização na altura da tela (rolagem interna, visualizador 3D redimensiona), modo foco. | M |

### Lote 7 · Haiku 4.5 · esforço médio · depende de 1.1 e 2.1
**Fase 4** — páginas migradas para o cabeçalho único, por módulo (sublotes independentes; podem
ser divididos entre as duas worktrees).
| # | Módulo | Tam. |
|---|---|---|
| 7.1 | Principal: Projetos, Meu trabalho, Arquivos, Aprovações, Clientes, Tarefas, Agenda, Guias, Ajuda | M |
| 7.2 | RH e Financeiro | M |
| 7.3 | Engenharia e Gestão (inclui margem de Ferramentas e Acessos) | M |
| 7.4 | Comercial e Sistema | P |

### Lote 8 · Sonnet 5 · esforço baixo · depende de todos
| # | Etapa | Tam. |
|---|---|---|
| 8.1 | Rodar de novo as duas varreduras, comparar com os números de hoje e atualizar a página de aprovação. | P |

### Lote 9 · Opus 5.5 · esforço alto · bloqueado pela reforma da EAP
| # | Etapa | Tam. |
|---|---|---|
| 9.1 | 2º nível do ponto: atividade da EAP na sessão de trabalho, com efeito no rateio. | M |

## 3. Ordem e regras de execução

- Ordem: **1 → 2 → 3 → 4, 5, 6 (uma sessão Sonnet alto) → 7 → 8**; 9 quando a EAP estiver pronta.
- Parar e pedir `/model` a cada troca de modelo. Mesmo modelo: seguir direto.
- Cada lote fecha com `npm run lint` + `npm test`. Build só com o `next dev` desta pasta parado
  (nunca `next build` com `next dev` ativo no mesmo `.next`).
- Commits semânticos em pt-BR, arquivos adicionados um a um, conferir `git show --stat`.

## 4. Progresso

- [x] **Lote 1 — concluído em 2026-09-25 (Opus 5.5).**
  - 1.1: `components/shell/cabecalho-pagina.tsx` + `data-titulo-padrao` e `--barra-global` no
    header + regra `:has()` em globals.css. Funde na barra a partir de `xl` (abaixo, linha
    própria; no celular as ações quebram linha). Piloto no Financeiro: números de 164 → 80 px em
    1366 × 768; HTML do servidor já sem título duplicado. Fusão no celular fica para o 3.1
    (hoje os controles globais ocupam ~324 px dos 390).
  - 1.2: `components/ponto/card-ponto-hoje.tsx` (só no celular) + `use-jornada.ts` (estado da
    jornada extraído da miniatura do header, que passou a usá-lo) + `alocacoesDistintas` (pura,
    testada) / `alocacoesRecentes` / `buscarAlocacoesRecentes` + `sessaoDesde` no resumo.
    Início no celular: ponto → "Para você hoje" → resto; números em 2 × 2. Testado em navegador
    celular com Carla (CLT: escolher → iniciar → trocar → encerrar com confirmação) e Ana (PJ:
    mesmo fluxo no apontamento) no banco de dev.
  - **Achado fora do escopo (não mexido):** `next.config.ts` manda
    `Permissions-Policy: geolocation=()`, então a geolocalização opcional das batidas (S6 do
    Ponto v2) nunca é capturada, nem em produção. Decisão do dono.
  - Dev: depois de criar export novo (Server Action, atributo no header), o `next dev` desta
    pasta serviu versão velha até ser reiniciado (500 `reading 'apply'` / hidratação).
- [x] **Lote 2 — concluído em 2026-09-25, exceto 2.6.**
  - Geolocalização das batidas liberada (Permissions-Policy sem `geolocation=()`; captura já
    existia em `use-batida.ts` e `Batida.geo` no schema). Fora do plano, a pedido do dono.
  - 2.1/2.2: ações do cabeçalho do projeto em coluna no celular; abas sem `shrink-0`.
    Não achei fileiras sem quebra em Custos, Acessos, Licitações, Suporte, Folha CLT nem
    "Pagar tudo" (já têm `flex-wrap`): reconferir na varredura do lote 8.
  - 2.3: chat flutuante só a partir de `md`.
  - 2.4: Pessoas com rolagem lateral; 3 fileiras de ações de contrato/aditivo do Jurídico
    quebram linha.
  - 2.5: 14 arquivos, `text-base md:text-xs|sm` em Input/InputMoeda/InputPercentual (o
    `className` do chamador vence o `text-base` do base). Medido em 390 px.
  - **2.6 reclassificada:** o Diário só tem texto (`DiarioEntrada` sem anexo). "Foto da câmera"
    exige campo/tabela de anexo, rota de upload e migração: é feature M/G, não ajuste P.
    Decisão do dono se entra (e em qual lote).
- [ ] **Lote 3 — em andamento (Sonnet 5): feitos 3.1, 3.2, 3.3, 3.7; faltam 3.4, 3.5, 3.6.**
  - 3.1: no celular saem relógio da jornada, data e tema da barra do topo (tema → menu da conta).
  - 3.2: barra de baixo = Início, Projetos, Tarefas, Ponto, Chat, Mais (ordem fixa; "Mais" abre
    o menu lateral por evento). Em dev, o botão do inspetor visual cobre o "Mais" (só dev).
  - 3.3: `pointer-coarse:` em Button, Input, Select e itens de menu (40/44 px); desktop igual.
    Na lista de Projetos em 390 px: 1 de 29 alvos abaixo de 32 px.
  - 3.7: grade 2 × 2 em Financeiro, Licitações e Qualidade. Certidões não tem cartões de
    números; resumo recolhível de Licitações não feito.
  - Sobras do 2.1 achadas aqui: fileiras de ações sem `flex-wrap` em Projetos (466 px) e
    Licitações (487 px), que empurravam a barra de baixo para fora; corrigidas. Reconferir as
    demais telas na varredura do lote 8.
- [ ] Lote 4
- [ ] Lote 5
- [ ] Lote 6
- [ ] Lote 7
- [ ] Lote 8
- [ ] Lote 9 (bloqueado)
