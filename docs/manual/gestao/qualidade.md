---
titulo: Qualidade (retrabalho e SLA)
descricao: Índice de retrabalho (revisões), SLA de entregas e histórico mensal da qualidade.
resumo: Mede a qualidade pelo retrabalho (% de disciplinas com revisão) e pelo SLA de entregas (no prazo × atrasadas), com revisões por disciplina e tendência mensal.
tags: [qualidade, retrabalho, revisão, sla, prazo, indicador, snapshot]
palavras-chave: [qualidade, retrabalho, revisão, sla, no prazo, atraso, índice, indicador, tendência]
sinonimos: [indicadores de qualidade, kpi de qualidade, desempenho de entregas]
---

# Qualidade (retrabalho e SLA)

## Objetivo

Medir a qualidade das entregas pelo **retrabalho** (revisões) e pelo **cumprimento de
prazos (SLA)**.

## Como acessar

- Menu → **Qualidade** (`/qualidade`). Exige `qualidade:ver`.
- Disponível a **admin e supervisor**.

## Indicadores

### Índice de retrabalho
- **% de disciplinas ativas com ao menos uma revisão (RVxx)**. **Menor é melhor.**
- Cores: verde (≤15%), amarelo (15–30%), vermelho (>30%).
- Mostra também **disciplinas ativas** e quantas estão **com revisão**.

### SLA de entregas
- **% no prazo**, **entregues no prazo**, **entregues atrasadas**, **pendentes vencidas**
  e **pendentes em dia**.
- **Maiores atrasos:** disciplinas entregues após o prazo ou pendentes vencidas, com os
  dias de atraso.

### Revisões por disciplina
- Ranking de revisões por nome de disciplina.

### Histórico mensal
- Tendência do índice de retrabalho por mês (**snapshot gravado automaticamente todo dia
  1º**).

## Regras de negócio

- "Retrabalho" considera disciplinas **ativas** com ao menos uma revisão.
- O histórico é alimentado por um **snapshot mensal** automático.

## Funcionalidades relacionadas

- [Projetos](../projetos/projetos.md) (revisões e prazos) · [Início (Dashboard)](../inicio/dashboard.md)

## FAQ

**O que é o índice de retrabalho?** A porcentagem de disciplinas ativas que precisaram de
ao menos uma revisão — quanto menor, melhor a qualidade.

**De onde vem o histórico?** De um snapshot automático no dia 1º de cada mês.
