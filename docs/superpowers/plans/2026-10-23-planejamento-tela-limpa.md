# Planejamento — tela limpa e painel da linha

**Mock aprovado pelo dono em 2026-10-23:** https://claude.ai/artifact/4d2JHehTMcX2wcXuVeTVKY (7 telas). O mock é o contrato;
desvio só com OK prévio.

**Objetivo:** a tela `/planejamento/[projetoId]` segue o padrão novo (cabeçalho na barra do topo, uma faixa de status, uma barra
de ferramentas, tabela na altura da tela) e o modal de editar tarefa vira um painel lateral com um jeito só de gravar.

## Fases (um commit por fase)

### F1 — Cabeçalho e menu ⋯
- `modules/planejamento/acoes-planejamento.ts` (puro, ADR-0002) + teste: `itensDoPlanejamento(ctx)` devolve Novas tarefas,
  Exportar Excel, Exportar PDF, Gerar EAP das disciplinas, Reagendar, Herdar responsáveis, Aplicar ao projeto, Salvar como
  modelo e Apagar EAP. Perfil sem `planejamento:gerir` vê só os exportar; plano travado desabilita o que muda a estrutura com
  `MOTIVO_PLANO_TRAVADO`; Apagar EAP desabilitado com o `impedimentoApagar`.
- `EapWorkspace` (fora da aba do projeto) abre com `CabecalhoPagina`: trilha Início › Planejamento › código, título
  `código · nome`, descrição "EAP e cronograma", ações **+ Nova tarefa** e o ⋯. Sai o "← Planejamento" e o `h2` antigo.
- `GerarEapDisciplinasDialog` aceita `aberto`/`onAbertoChange` (controlado, sem gatilho) para abrir pelo menu.

### F2 — Faixa de status e painel "Saúde do cronograma"
- `FaixaCronograma` substitui `SaudePainel`: nota + "N achados ›" (abre o painel), situação (rascunho / aprovado BL-xx /
  plano travado / em revisão) com a ação dela (Definir início, Aprovar, Revisar planejamento), Data de Status ✎ e Início ✎
  (popover), custo previsto à direita. Revisão aberta = linha amarela com Cancelar revisão e "Fechar com nova linha de
  base…" (diálogo com o motivo).
- `SaudeCronogramaPainel` (Sheet à direita): nota, achados agrupados (com "Usar a disciplina do agrupamento"), comparativo
  com a linha de base (o antigo bloco N-47) e as versões. O bloco N-47 sai da tela.

### F3 — Barra única, altura da tela e visão Indicadores
- `PlanoGantt` recebe `barraInicio`/`barraFim` (nós) e desenha tudo numa barra só; Recolher/Expandir viram ícones;
  "Tabela compacta" vira "Compacta". O quadro ocupa a altura que sobra (`useAlturaRestante`) em vez de `72vh`.
- Período (Tudo/7/15/30) vira seletor; "Comparar com" fica ao lado da visão no Controle; Desfazer vai para a barra.
- Visão **Indicadores** (Valor Agregado + Plano vs Real), que a página passa pronta como nó (`indicadores`). Sem ela (aba EAP
  do projeto), o seletor tem só Gantt e Controle; na aba, "Editar/Abrir no Planejamento" e os exportar ficam na ponta da barra.

### F4 — Painel da linha (substitui `EapDialog`)
- Ação `salvarLinhaEap` (um passo de desfazer, um reagendamento): nome, tipo, disciplina, fase, duração, %, predecessoras
  (conjunto inteiro), início (= restrição "não iniciar antes de"), término (= duração) e restrição explícita — só o que
  mudou. Mesmas regras e travas das ações separadas (`regrasDeEdicao`, `mudaCampoDoPlano`, `exigirPlanoEditavel`).
- `EapLinhaPainel` (Sheet à direita, a tabela continua visível): navegação ↑↓ entre linhas (Alt+↑/↓), sinais da linha,
  seções Prazo, Andamento (0/25/50/75/100 + outro + sugestão), Depende de (só os vínculos da linha + "Escolher na árvore"),
  Pessoas e horas (grava na hora, como hoje) e Bloqueio (ação própria, com aviso). Rodapé: Excluir, "N alterações não
  salvas", Descartar, Salvar (Ctrl+Enter). Trocar de linha com alteração pendente pergunta antes.
- Nova tarefa usa o mesmo painel (com "Subtarefa de" e "Não iniciar antes de").
- Smoke `smoke:salvar-linha-eap`: um passo só, travas, término × duração, início vira restrição.

### F5 — Manual, auditoria e tela
- `docs/manual/projetos/planejamento.md` + `novidades.md`. Auditoria (protocolo), prints 1366×768 (menu aberto) e 390×844.
