# PLANEJAMENTO SENAHUB — Migração e Evolução (versão nova / localhost)

> Documento gerado a partir de um conselho técnico simulado (🔴 Cético, 🟢 Executor,
> 🔵 Especialista, 🟡 Usuário + membros contextuais) que percorreu **todas as telas,
> botões, listas, gráficos, UX, estilos visuais, funcionalidades e integrações** das duas
> versões do SenaHub:
> - **Nova** = `localhost:3000` (Next.js)
> - **Antiga** = `devhub.senaprojetos.com.br`
>
> Perfil de teste: Projetista PJ. Objetivo: portar pontos fortes da antiga, remover/ajustar
> pontos fracos da nova, e analisar (sem comparação) o que só existe na nova.
>
> **Nota metodológica:** transições lentas, flash sem CSS (FOUC) e o balão "8 Issues" são
> artefatos do **modo de desenvolvimento do Next.js (Fast Refresh)** — validar em build de
> produção (`next build && next start`) antes de tratá-los como defeitos.
>
> **Legenda de dependência:** `[RBAC]` = depende do sistema central de papéis/permissões
> (`rbac-guard`) ser implementado primeiro.

---

## Ordem de implementação recomendada
1. **Fundação:** `rbac-guard` (papéis/permissões) + design tokens (Módulo 15).
2. **Quick wins de UI:** tabela responsiva, cards padrão, skeletons, empty states, ícones de disciplina.
3. **Conteúdo de projeto:** Inputs de Start (porte da antiga), Extras, Pranchas.
4. **Módulos novos:** Patrimônio/TI (Módulo 16).
5. **Refinos transversais:** acessibilidade, performance, notificações.

---

## Módulo 1 — Início / Dashboard

**Pontos fortes (nova):** saudação personalizada, aniversariantes do mês, KPIs, projetos recentes, gráfico de evolução.
**Da antiga a portar:** "Ações Rápidas" (Enviar Entrega, Abrir Chat); sparklines nos KPIs.
**A corrigir:** apenas 2 KPIs isolados num bloco grande; rótulo do eixo Y do gráfico ("%11"); humor disperso.

### Decisões
- Mover o seletor de humor "Como você está se sentindo hoje?" para o herocard, com campo de texto livre OPCIONAL (feedback à empresa). Privacidade: destino explícito (RH) + opção de anonimato.
- Adicionar KPIs do projetista: "Projetos em revisão", "Projetos aprovados no mês", "Validações pendentes" — cada um com SPARKLINE temporal.
- Adicionar "Ações Rápidas" (porte da antiga).
- Corrigir rótulo do eixo Y do gráfico Evolução.

### Prompt Claude Code
```
No dashboard (/), reorganizar o herocard para incluir o seletor de humor diário + textarea
opcional "quer comentar?" (feedback ao RH, com toggle de anonimato). Adicionar bloco de KPIs:
Projetos em revisão, Aprovados no mês, Validações pendentes — cada card com um sparkline
(série diária). Adicionar seção "Ações Rápidas" (Enviar Entrega, Abrir Chat). Corrigir o
rótulo do eixo Y do gráfico "Evolução" para formatar como porcentagem (ex.: "11%").
```

---

## Módulo 2 — Projetos (lista)

**Pontos fortes (nova):** tabela + kanban, indicador de Saúde, "Ordenar por risco", filtros.
**Da antiga a portar:** visualização em cards (Particular/Licitação).
**A corrigir:** tabela com scroll horizontal (coluna "Situação" cortada); pílulas de disciplina empilhadas aumentam a altura da linha; export só CSV.

### Decisões
- Visualização PADRÃO em cards; toggle Lista/Kanban; persistir preferência.
- Eliminar scroll horizontal: colunas prioritárias fixas + secundárias colapsáveis.
- Exibir PRAZO FINAL em todas as views, combinado com cor de risco.
- Export XLSX padrão; manter CSV como opção.
- [RBAC] Filtrar lista por papel (projetista só vê designados); ocultar botão "Meus projetos" só para projetista.
- Substituir contador de disciplinas por ÍCONES de disciplina coloridos pelo status (cor + tooltip/aria-label, nunca só cor).

### Prompt Claude Code
```
Refatorar /projetos: visualização padrão em cards, com toggle para Lista e Kanban (persistir
preferência). Na visão Lista, eliminar scroll horizontal (colunas prioritárias fixas + secundárias
colapsáveis). Exibir prazo final em todas as visualizações, com cor de risco. Trocar exportação
para XLSX padrão (manter CSV opcional). Substituir o contador de disciplinas por ícones de
disciplina coloridos pela cor do status (aguardando=cinza, em-andamento=azul, em-revisão=amarelo
calibrado p/ AA, aprovado=verde, etc.), sempre com tooltip/aria-label do status.
[RBAC] Filtrar a lista server-side pelo papel do usuário: projetista vê só projetos designados;
ocultar o botão "Meus projetos" para o papel projetista (manter para gestor/admin).
```

---

## Módulo 3 — Projeto (detalhe / abas)

**Pontos fortes (nova):** abas Visão Geral/Inputs/Pranchas/Serviços/Arquivos/Extras; KPIs; cronômetro; Gantt por disciplina; kanban de disciplinas; Extras ricos (qualidade/retrabalho, revisões, composição de preço, LM/BIM, baselines, checklist, riscos).
**Da antiga a portar (CRÍTICO):** os **Inputs de Start** da antiga são um briefing multi-etapas rico (Dados Gerais, Elétrico, Hidrossanitário, Climatização, Declaração de Start). Na nova, a aba Inputs está VAZIA.
**A corrigir:** empty states passivos; cronômetro discreto.

### Prompt Claude Code
```
Na aba Inputs do detalhe de projeto, implementar um briefing multi-etapas (porte da versão antiga):
seções Dados Gerais, Projeto Elétrico, Hidrossanitário, Climatização e Declaração de Start, com
progresso (ex.: 4/11) e validação. Destacar o cronômetro no topo da Visão Geral. Tornar os empty
states das abas Pranchas/Serviços/Arquivos acionáveis (CTA + ilustração).
```

---

## Módulo 4 — Meu trabalho
Disciplinas sob responsabilidade do usuário, agrupadas por status. Manter; integrar com os ícones de disciplina (Módulo 15) e filtros consistentes com Tarefas.

```
Padronizar /projetos/meu-trabalho com os mesmos ícones/cores de disciplina e os filtros usados em Tarefas.
```

---

## Módulo 5 — Tarefas

**Pontos fortes (nova):** kanban COM dependências (tarefas bloqueadas), filtros por projeto/responsável/prazo.
**Da antiga a portar:** estados "Em Revisão" e "Cancelada"; filtro de prioridade; presets de prazo.
**A corrigir:** kanban com scroll horizontal (3ª coluna cortada) e muito espaço vazio.

### Prompt Claude Code
```
Em /tarefas, tornar as colunas do kanban responsivas (sem corte da última coluna) ocupando a altura
útil. Adicionar os estados "Em Revisão" e "Cancelada", filtro de prioridade e presets de prazo
(porte da versão antiga). Manter a regra de dependências (bloqueio de conclusão).
```

---

## Módulo 6 — Agenda
**Nova** tem Mês/Semana/Dia + export .ics (superior à antiga, só mensal). Manter. Integrar prazos de projeto/tarefa.

```
Manter as visões Mês/Semana/Dia e o export .ics. Integrar marcos de prazo de projetos e tarefas no calendário.
```

---

## Módulo 7 — Chat
Estilo Slack: canais por projeto/disciplina, menções, reações, presença. Feature nova/superior — análise sem comparação. Manter; garantir acessibilidade e estados de loading.

```
Manter o chat por canais. Garantir aria-labels, foco por teclado e skeletons de carregamento.
```

---

## Módulo 8 — Ponto
Timer por projeto, banco de horas, espelho do mês, export CSV. Manter; export XLSX coerente com Módulo 2.

```
Manter o ponto por projeto e banco de horas. Oferecer export XLSX (além de CSV) no espelho do mês.
```

---

## Módulo 9 — RH
Clima/humor, abono, férias, minhas solicitações, notas fiscais (com status). Integrar humor ao herocard (Módulo 1). Manter NFs PJ.

```
Integrar o registro de humor ao herocard do dashboard (mantendo histórico no /rh). Preservar
abono, férias, solicitações e o fluxo de Notas Fiscais PJ com status.
```

---

## Módulo 10 — Financeiro
**Nova:** "Meu extrato" PJ (Total/Recebido/Em aberto por disciplina). **Antiga:** submenus completos (Lançamentos, A Pagar/Receber, Fluxo, DRE) mas com "Erro ao carregar dados" para PJ (permissão).
**A corrigir:** substituir erro genérico por mensagem clara de permissão.

```
[RBAC] No Financeiro, substituir qualquer "Erro ao carregar dados" por mensagem clara de
permissão quando o papel não tiver acesso. Manter "Meu extrato" do projetista.
```

---

## Módulo 11 — Ferramentas de Engenharia
**PONTO ALTO da nova:** 14+ calculadoras NBR (Conversor, Seção, Viga NBR6118, Pilar, Laje, Punção, Escada, Ancoragem, Resumo Aço NBR7480, Descida de Cargas NBR6120, Vento NBR6123, Combinações NBR8681, Sapatas, Estaca SPT). A página da calculadora é referência de UX (form guiado, guia de campos, unidades, estados desabilitados). Feature nova — análise sem comparação. Usar como TEMPLATE de formulário para o resto do sistema.

```
Manter e expandir as Ferramentas. Extrair o layout da calculadora "Viga de Concreto" como
template reutilizável de formulário (passos numerados + guia de campos + unidades + estados
de botão). Considerar a skill nbr-calc-engine para padronizar memórias de cálculo e exportação.
```

---

## Módulo 12 — Planejamento
EAP/Gantt por projeto com baseline, caminho crítico, desvio, Plano × real. Superior à antiga (que é somente leitura para PJ). Manter; respeitar permissões via RBAC.

```
Manter EAP/Gantt com baseline, caminho crítico e Plano×real. [RBAC] Aplicar permissões de
edição por papel (projetista pode ter leitura/escrita conforme regra).
```

---

## Módulo 13 — Suporte
**Nova:** tickets com status + resposta inline com anexo. **Da antiga a portar:** campo "Tipo" (Sugestão/Erro) e drag-and-drop de anexos.

```
Em /suporte, adicionar o campo "Tipo" (Sugestão/Erro) e suporte a drag-and-drop de anexos (porte
da versão antiga). Manter status e resposta inline.
```

---

## Módulo 14 — Preferências / Configurações
**Nova:** preferências de chat + motor de notificações automáticas (D-7/D-3/D-1, inadimplência, certidões, licitação, resumo semanal, atrasos) — excelente.
**Da antiga a portar:** "Meu Perfil" (foto, nome, telefone, ficha RH) e "Aparência/tema".
**Topbar:** exibir foto, nome e [RBAC] função (responsivo).

```
Em Preferências, adicionar "Meu Perfil" (foto, nome, e-mail bloqueado, telefone, ficha RH) e
"Aparência" (tema claro/escuro) — porte da versão antiga. Manter o motor de notificações.
Na topbar, exibir foto, nome e [RBAC] função do usuário; em telas estreitas mostrar só o avatar
e revelar nome/função no hover ou no dropdown (sem competir com o "Ctrl K").
```

---

## Módulo 15 — Design System & UI/UX (transversal)

**Diagnóstico:** identidade coesa, dark mode bem executado, tipografia legível; calculadora é referência interna. Problemas concentrados em densidade/responsividade, estados (loading/empty), acessibilidade e padronização semântica.

### Decisões
- **Modificar:** tabela de Projetos responsiva; kanban fluido; reduzir padrão hexagonal de fundo; contraste AA nos rótulos caixa-alta; corrigir eixo Y do gráfico; destacar cronômetro.
- **Acrescentar:** design tokens (status/disciplina/espaçamento/raio/tipografia); skeleton loaders; empty states acionáveis; foco de teclado + aria-labels; mapa único `disciplina -> {ícone, cor}`; guia de status semântico documentado.
- **Remover/corrigir:** overlay "8 Issues" (confirmar ausência em produção); setas de expandir em grupos de 1 item na sidebar; espaço vazio em listas/kanban curtos.

### Prompt Claude Code
```
Maturar o design system sem alterar a identidade visual:
1. Design tokens: cores semânticas de status e mapa disciplina->{icone,cor}, espaçamentos, raios,
   tipografia (CSS vars + Tailwind), com paridade claro/escuro. Substituir cores hardcoded.
2. Criar um set de ÍCONES por disciplina (Estrutural, Hidrossanitário, Elétrico, Arquitetônico,
   Fundações, Prevenção de Incêndio, ...).
3. Componentes <Skeleton/> e <EmptyState/> (ícone + título + descrição + CTA) reutilizáveis.
4. Acessibilidade: aria-label em botões só-ícone (sino, tema, FAB chat), focus-visible ring,
   contraste WCAG AA nos rótulos em caixa-alta; calibrar o amarelo de "em revisão".
5. Reduzir opacidade do padrão hexagonal e removê-lo em containers vazios grandes.
6. Sidebar: remover seta de expandir de grupos com item único.
Validar tudo em build de produção (next build && next start), confirmando que o overlay "8 Issues"
e o FOUC não aparecem fora do modo dev.
```

---

## Módulo 16 — Patrimônio / Ativos (NOVO — não existe em nenhuma versão)

> Feature inexistente nas duas versões; análise do conselho sem comparação.

### Decisões
- **Inventário do Escritório:** CRUD de itens (nome, categoria, localização, responsável, data de aquisição, valor, status), busca/filtros, export XLSX.
- **Gerenciamento de TI:** cadastro de PCs e peças/componentes; relatório por máquina (specs, peças, histórico de manutenção); responsável vinculado.
- **[RBAC] Cargo "TI":** novo papel com acesso ao submódulo de TI.

### Prompt Claude Code
```
Criar o módulo "Patrimônio" com dois submódulos:
1. Inventário do Escritório: CRUD de ativos (nome, categoria, localização, responsável, data de
   aquisição, valor, status), busca, filtros e export XLSX.
2. Gerenciamento de TI: cadastro de PCs e suas peças/componentes; relatório por máquina (specs,
   peças instaladas, histórico de manutenção/troca), com responsável.
[RBAC] Criar o papel "TI" com acesso ao submódulo de Gerenciamento de TI.
```

---

## Skills / Agentes transversais (consolidado)

- **`rbac-guard`** (PRÉ-REQUISITO): sistema central de papéis/permissões por rota/menu/ação.
  Habilita o cargo TI (Mód.16), o filtro de projetos por papel (Mód.2), "função" na topbar (Mód.14)
  e a permissão correta no Financeiro/Planejamento (Mód.10/12). Resolve o "Erro ao carregar dados"
  com mensagem clara de permissão.
- **`design-system-guardian`**: valida uso de tokens (sem cores hardcoded), o mapa
  disciplina->{ícone,cor} e a escala de status; bloqueia PRs fora do padrão; garante paridade de tema.
- **`a11y-auditor`**: contraste WCAG AA, foco de teclado, aria-labels em botões só-ícone; garante
  que status/disciplina nunca dependam só da cor (sempre tooltip/label).
- **`frontend-perf-auditor`**: roda em build de produção; mede LCP/CLS; detecta FOUC e listas sem
  skeleton; separa artefatos de dev de problemas reais.
- **`ui-state-linter`**: garante os 3 estados (loading/empty/erro) em toda lista, tabela e board.
- **`nbr-calc-engine`**: padroniza memórias de cálculo, unidades e exportação das Ferramentas (Mód.11).
- **`form-template`** (a partir da calculadora Viga): template de formulário guiado reutilizável.
- **`pdf-report-generator`**: geração de relatórios (relatório por PC do Mód.16, "Gerar documento" de projeto).