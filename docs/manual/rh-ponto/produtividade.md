---
titulo: Produtividade — Projetistas
descricao: Acompanhamento da produtividade e das horas diárias dos projetistas.
resumo: Painel que mostra a produtividade dos projetistas por semana ou mês, as horas de qualquer período por projeto e permite comparar até cinco projetistas.
tags: [produtividade, projetistas, desempenho, horas, gráfico, semana, mês]
palavras-chave: [produtividade, projetista, desempenho, horas diárias, gráfico de horas, comparação, entregas, semana, mês, granularidade]
sinonimos: [desempenho, rendimento, performance]
---

# Produtividade — Projetistas

## Objetivo

Acompanhar a **produtividade dos projetistas** e o ritmo de horas registradas ao longo do tempo.

## Como acessar

- Menu → **Produtividade** (`/rh/produtividade`). Exige a permissão **"Ver horas e produtividade dos
  projetistas"** (`rh:produtividade`), que já vem para Coordenador e Administrativo.

## O que a tela mostra

- **Horas no período**: escolha 7 dias, 14 dias, 30 dias, mês atual, mês anterior ou um intervalo
  livre (De / Até). Não há limite de período; acima de 92 dias o gráfico passa a mostrar **por semana**.
- **Ranking**: todos os projetistas com horas no período, do maior total para o menor, com a média por
  dia com registro e quantos dias tiveram registro.
- **Comparar**: clique em até **cinco** nomes para ver as linhas de horas por dia lado a lado.
- **Por projeto**: com um nome só selecionado, o gráfico separa as horas por projeto (os cinco maiores,
  "Outros projetos", "Reuniões" e "Sem projeto"). Em "Ver os números" ficam os mesmos valores em tabela.
- Botão direito (ou toque longo, ou o `...`) numa linha do ranking: Comparar / Tirar da comparação, Ver
  por projeto e Abrir espelho de ponto.
- Embaixo continua a produtividade por **semana** ou **mês** (entregas, tarefas, horas e atrasos).

## Permissões

- `rh:produtividade`. O projetista vê só as próprias horas em **Ponto → Minhas horas**.

## Funcionalidades relacionadas

- [Recursos](../projetos/recursos.md) · [RH — administração](rh-admin.md)

## FAQ

**Posso ver por mês?** Sim — alterne a granularidade para mensal.

**Como comparo as horas de duas pessoas?** No ranking de **Horas no período**, clique nos dois nomes.
A legenda identifica cada linha.

**Por que o gráfico ficou por semana?** O período passou de 92 dias; dia a dia as barras ficariam finas
demais para ler.

**O que entra em "Sem projeto"?** Horas de ponto sem projeto escolhido. Reuniões internas e externas
aparecem juntas em "Reuniões".
