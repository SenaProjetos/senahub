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
- [x] **Lote 3 — concluído em 2026-09-26 (Sonnet 5).**
  - 3.4: Agenda abre em "Dia" no celular, no mês corrente.
  - 3.5: convite Instalar (Android, prompt do navegador) e passo a passo do Safari (iPhone) no
    Início; com o app instalado, convite de notificações; atalhos no manifesto; QR "Abrir no
    celular" no menu da conta (computador). Testado com iPhone e Android simulados; o prompt
    real do Android e o "Adicionar à Tela de Início" real não foram exercitados.
  - 3.6: Preferências em 2 abas só no celular (o tour aponta cartões das duas metades). Minha
    conta já era em abas.
  - Dev: o login tem limite de 10 por 5 min por IP em memória; reiniciar o `next dev` zera.
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
- [x] **Lote 4 — concluído em 2026-09-26 (Sonnet 5).**
  - 4.1: Arquivos com barra única (busca, Filtros, fases, Colunas na mesma linha a partir de
    1280 px; tabela ~70 px mais acima); Novidade virou pílula com balão (17 telas).
  - 4.2: `FiltrosGaveta` (botão "Filtros · N" no celular) em Projetos, Clientes, Produção e
    Auditoria. Corrigida a linha de cada projetista em Produção (alargava a página, 420 px).
  - 4.3: cartões no celular em Clientes e Pessoas; Aprovações com nome do arquivo visível.
    Certidões já era lista.
  - 4.4: grade de painéis da Visão Geral liga com contêiner ≥ 960 px (antes 1280): 3620 → ~1880
    px em 1366. No limite, o cartão "Indicadores críticos" corta o último indicador; ajustar
    tamanho padrão se incomodar.
  - 4.5: `AcessoPagina.dispositivo` (migração `20260926090000`, aditiva) + beacon + coluna
    "Celular" e total em /auditoria/uso. **Deploy: `npx prisma migrate deploy`** (sem backfill).
- [x] **Lote 5 — concluído em 2026-09-26 (Sonnet 5).**
  - 5.1: cabeçalho do projeto sem breadcrumb próprio, com abas ~35 px mais acima; no celular
    ações atrás de "Ações". Não fiz "nome do projeto na barra do topo" no celular: o nome já
    aparece em até 2 linhas no cabeçalho. Histórico, Serviços e Extras sem o "← projeto".
  - 5.2: trilho com nome sob o ícone e seções em lista flutuante; menu aberto com alfinete
    para "Fixados" (UserPreference `menu_fixados`); Chat e Ajuda na barra do topo (computador).
    O trilho ainda rola em 768 px de altura (17 entradas).
  - 5.3: Funil na altura da tela; no celular uma etapa por vez, filtros em gaveta. "Mover
    para…" já existia no menu do cartão.
  - 5.4: Tarefas idem (altura a partir de 1280 px).
  - 5.5: tela Ponto no celular com o cartão em lista. Apontamento de PJ não foi trocado.
  - Aviso de hidratação de id no botão do menu (dev): intermitente e anterior a este lote.
- [x] **Lote 6 — concluído em 2026-09-26 (Sonnet 5).**
  - 6.1: Arquivos na altura da tela (768 = 768 em 1366 × 768) e modo foco (menu, topo e
    cabeçalho do projeto somem; Esc sai). Compatibilização usa a altura medida e o botão de
    foco, mas o visualizador 3D não foi visto no navegador (sem IFC no projeto de teste).
- [x] **Lote 7 — quase concluído em 2026-09-26 (Sonnet 5, não Haiku — dono mandou seguir sem trocar).**
  - Migradas ~40 páginas de RH, Financeiro, Engenharia, Custos, Patrimônio, Planejamento,
    Licitações, Qualidade, Suporte, Jurídico, Recursos, Auditoria, Certidões,
    Configurações, Documentos, Clientes, Tarefas e Projetos — codemod (padrão
    `<div><h2/><p/></div>`) + revisão manual de cada arquivo.
  - **2 correções no próprio `CabecalhoPagina`** (valem para todos os usos, inclusive os
    pilotos do lote 1.1): piso de 10rem no título (tinha `min-w-0`, sumia por completo
    com 3+ botões de ação) e o título nunca mais cede espaço para a descrição.
  - **Comercial (8 páginas) ficou de fora, revertido**: o layout do módulo tem uma barra
    de abas própria (`ComercialNav`) antes do conteúdo, e o cabeçalho exige ser o
    primeiro elemento da página. Falta decidir a abordagem (mover a barra, ou um
    cabeçalho por módulo em vez de por página) antes de migrar.
  - Avisos (tabs com 2 cabeçalhos), Ponto/Espelho (sub-abas fora do componente) e Ajuda
    (ícone solto antes do título) também revertidos pelo mesmo motivo, por ora.
  - Achado não corrigido (pré-existente, fora do escopo): `/financeiro/lancamentos`
    passa de 1366 px — para o lote 8.
  - Verificação: as 110 rotas do menu percorridas em 1366×768, lint + tsc + 3981 testes.
  - **Falta:** achar uma abordagem para Comercial/Avisos/Ponto/Ajuda, e rodar tudo de
    novo no celular (só testei desktop neste lote).
- [x] **Lote 8 — varredura de comparação feita em 2026-09-26** (mesmos scripts da auditoria,
  dev :3001, admin de teste; `/arquivos` e `/chat` fora da conta por 500 de dev a frio que
  some ao reiniciar o servidor — artefato de HMR, não de código).

  | Computador (1366 × 768) | Antes | Depois |
  |---|---|---|
  | Telas com título grande repetindo o da barra | 53 de 58 | 20 de 56 |
  | Início do conteúdo (mediana) | 212 px (28%) | 133 px (17%) |
  | Telas que rolam a página inteira | 32 de 58 | 27 de 56 |
  | Menu minimizado | 45 ícones sem nome, 1798 px | 12 entradas com nome, 805 px |
  | Telas que pioraram | | 0 |

  | Celular (390 × 844) | Antes | Depois |
  |---|---|---|
  | Telas mais largas que o celular | 19 de 56 | 0 de 56 |
  | Alvos de toque < 32 px | 48% | 27% |
  | Campos com letra < 16 px | 77 em 20 telas | 71 em 18 telas (só contam os que o script alcança) |
  | Tabelas mais largas que a tela | 16 | 16 (rolam por dentro) |
  | Barra de baixo com Ponto | 0 telas | 56 telas |

  Sobras: os 71 campos < 16 px continuam (não investiguei de onde vêm — o 2.5 só cobriu
  `Input`/`InputMoeda`/`InputPercentual`); os títulos grandes que restam estão no Comercial, no
  Início, nas abas do projeto e em telas com formato fora do codemod.
  Não atualizei o artefato de aprovação (fica com os números antigos).
- [x] **Depois do lote 8 (2026-09-26, Sonnet 5 → revisão Opus 5.5).**
  - Campos < 16 px: regra global em `globals.css` para `pointer: coarse` — 52 → 1 nas 110
    rotas (o que sobra é um `input[type=color]`, sem teclado).
  - Largura: Lançamentos e Contas (grade sem `minmax`), Relatórios, Rentabilidade e Recursos
    (filtros sem `flex-wrap`). Varredura das 111 rotas: 0 mais largas que 390 px e 0 que
    1366 px, 0 sobreposições do cabeçalho.
  - Avisos: o `CabecalhoPagina` tinha ficado dentro da aba "Novo aviso" (sobrepunha as abas);
    voltou o `h2` antigo até a decisão.
  - `dev` (reforma da EAP) incorporado na branch; conflitos em Planejamento, Cronograma geral,
    Recursos e `resumoJornada` (`sessaoDesde` + `tarefaAtiva`/`retomarTarefa` convivem).
  - Artefato de aprovação atualizado com a aba "Resultado e decisões" e as opções A/B/C de
    Comercial (11 telas; barra de 49 px + título de 52–72 px em 1366 × 768) e Avisos.
- [x] **Revisão com Opus 5.5 (2026-09-26, segunda rodada).**
  - Com o menu **aberto** a 1366 px, 18 de 74 cabeçalhos estouravam a barra (botões quebrando
    linha por cima do relógio e da busca). A varredura do lote 7 só olhava o menu recolhido e a
    caixa do cabeçalho, não os filhos. Corrigido com `AjusteCabecalho` (`data-apertado` → linha
    própria); com o menu aberto, 15 telas descem e 6 continuam na barra.
  - 51 de 73 descrições saem cortadas na barra. O texto inteiro virou dica (title); Recursos
    (avisos de superalocação e botão da carga planejada) e Jurídico (link) tinham conteúdo
    clicável escondido e foram corrigidos. Encurtar as descrições longas fica como pendência.
  - Regras viraram padrão no CLAUDE.md ("Page header and screen layout").
  - Modelo interativo de Comercial e Avisos (A/B/C, computador e celular) e antes/depois por tela
    na página de aprovação.
- [ ] Lote 9 — **escopo menor:** a EAP (F6) já grava `SessaoTrabalho.tarefaId` (opcional, card
  de `Tarefa`). Falta só levar essa escolha para a lista do card de ponto (Início e Ponto no
  celular), no lugar da prévia "disciplina › atividade". Sem schema novo.
- [x] **Comercial = opção A, Avisos = opção B** (decisão do dono, 2026-09-27; implementado e
  conferido em navegador). Comercial: `NavComercial` logo depois do cabeçalho, layout só com o
  portão; Funil com menu Exportar. Avisos: página abre na lista, Novo aviso em janela
  (`NovoAvisoDialog`), guia de primeiro acesso v2. Com o menu aberto a 1366 px o cabeçalho do
  Funil desce uma linha — some quando data e tema saírem da barra (desvio abaixo).
- [x] **Lote de correção: executado ≠ aprovado** (dono apontou em 2026-09-27; corrigido no mesmo dia, Opus 5.5). Os lotes seguiram o
  texto resumido do plano e a verificação mediu números, não conformidade com o mock. Desvios:
  1. Menu recolhido: aprovado 9 seções nomeadas sem rolagem → feito 12 itens soltos + 5 seções,
     rótulos cortados, ainda rola a 768 px.
  2. Menu aberto: aprovado 224 px, só a seção atual aberta, sem Guias/Ajuda/Minha conta/
     Preferências → feito 256 px e os 4 itens continuam.
  3. Barra do topo no computador: aprovado data só como ícone da agenda e tema no menu da conta →
     feito só no celular (causa raiz do cabeçalho que não cabe na barra).
  4. Chat: aprovado sem botão flutuante → continua no computador.
  5. Cabeçalho do projeto: aprovado Duplicar/Gerar documento no ⋯ e nome na barra no celular →
     Duplicar continua botão; nome na barra do celular não feito.
  6. Arquivos: aprovado Nomenclatura/Lista Mestre/Link público no ⋯ → continuam botões.
  Fechar só depois de comparar cada tela, lado a lado, com a imagem aprovada.
  **Feito** (conferido por medida contra o modelo, sem depender de imagem — `comparar-modelo.cjs`):
  barra do topo 56 px só com ícones (data na dica da agenda, tema e Minha conta/Preferências no menu
  da conta, "?" com Ajuda e Guias, chat sem botão flutuante e abrindo pela barra); menu recolhido
  64 px com as 9 seções sem rolagem, abrindo no hover e no clique, com seta nas seções; aberto
  224 px com só a seção atual; cabeçalho do projeto 56–100 (modelo 56–100), abas 100–137
  (100–139), barra de ferramentas de Arquivos 150 (151), tabela 195 (191); ⋯ do projeto e de
  Arquivos; Novidade como balão sem linha; Arquivos no celular com pastas na linha da busca e
  Enviar flutuante (lista de 305 → 221 px). Cabeçalho na barra: 74/74 com menu recolhido, 72/74
  aberto (Relatórios e Rentabilidade descem). 111 rotas sem sobreposição e sem estourar 1366/390.
  **Ainda diferente do modelo (pergunta ao dono):** o modo foco esconde menu, barra e abas; o
  modelo só recolhia o cabeçalho do projeto no computador.
