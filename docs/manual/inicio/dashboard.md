---
titulo: Início (Dashboard)
descricao: Página inicial do colaborador — saudação, KPIs, projetos recentes, receita e evolução.
resumo: O painel de abertura mostra indicadores pessoais e do escritório, ações rápidas, projetos recentes e gráficos; o que aparece depende do perfil e da permissão financeira.
tags: [início, dashboard, painel, kpi, indicadores, home, aniversariantes, humor, ações rápidas]
palavras-chave: [início, dashboard, painel inicial, kpi, indicador, receita prevista, projetos ativos, sparkline, aniversário, humor]
sinonimos: [home, tela inicial, painel, página inicial]
---

# Início (Dashboard)

## Objetivo

Dar, na abertura do sistema, uma visão rápida do que importa para você: indicadores
pessoais e do escritório, projetos em andamento, ações rápidas e a evolução do período.

## Quando utilizar

- Ao entrar no sistema, para ter o panorama do dia.
- Para pular direto a uma área (cada cartão é um atalho clicável).

## Quando não utilizar

- Para operações detalhadas (lançar conta, editar projeto): use o módulo específico.
- O cliente externo **não** vê este painel — é redirecionado para o [Portal](portal-cliente.md).

## Como acessar

- Menu lateral → **Início**, ou o ícone de casa, ou a rota `/`.
- Disponível para todos os perfis internos: admin, supervisor, administrativo, clt,
  estagiário, projetista_pj, freelancer. O perfil **cliente** é enviado ao `/portal`.

## Pré-requisitos

- Estar autenticado. Os cartões financeiros e alguns gráficos exigem **permissão
  financeira** (ver abaixo).

## O que a tela mostra

### 1. Cartão de boas-vindas (HeroCard)
- **Saudação** com o seu nome.
- **Aniversariantes do mês** (e do dia), a partir da data de nascimento de
  colaboradores ativos (não clientes). Compara apenas dia/mês.
- **Seletor de humor (1 a 5)** — registra como você está se sentindo **hoje** (um
  registro por dia).

### 2. Ações rápidas
Atalhos: **Enviar entrega** (Meu trabalho), **Abrir chat**, **Registrar ponto**,
**Nova tarefa**.

### 3. Seus KPIs (com mini-gráfico de 14 dias)
Baseados nas **disciplinas sob sua responsabilidade**:
- **Projetos em revisão** — disciplinas no status *em revisão*.
- **Aprovados no mês** — disciplinas *aprovadas* com entrega no mês corrente.
- **Validações pendentes** — disciplinas *entregues* aguardando validação.

Cada cartão leva a **Meu trabalho**. As séries são contagens reais de eventos por dia,
não estimativas.

### 4. KPIs do escritório
- **Projetos ativos** — projetos em andamento → `/projetos?situacao=em_andamento`.
- **Entregas pendentes** — disciplinas com prazo em **≤ 7 dias ou vencido**, ainda não
  entregues/aprovadas.
- **Receita prevista** *(só com permissão financeira)* — contas a receber em aberto.
- **Contas vencidas** *(só com permissão financeira)* — receitas a receber em atraso →
  `/financeiro#aging`.

### 5. Gráfico "Receita — 6 meses" *(só com permissão financeira)*
Realizado (caixa) × previsto (a receber) nos últimos 6 meses.

### 6. Projetos recentes
Os projetos **em andamento** do seu escopo, por última atualização (até 6). Mostra
código, nome, **status do gargalo** (a disciplina menos avançada) e **progresso %**
(média ponderada pelo status das disciplinas).

### 7. Carteira de projetos *(só admin/supervisor/sócio, com permissão financeira)*
Painel com todos os projetos em andamento do escritório.

### 8. Evolução — projetos ativos
Série histórica diária dos KPIs (aparece quando há ao menos 2 dias de histórico). Os
"retratos" diários são gravados automaticamente por uma rotina do sistema.

## Permissões e escopo

| Recurso da tela | Quem vê |
| --- | --- |
| KPIs pessoais, projetos recentes, evolução | Todos os perfis internos |
| Cartões e gráfico financeiros | Quem tem `financeiro:ver` **ou** é sócio ativo |
| Carteira de projetos | admin, supervisor **ou** sócio — e com permissão financeira |
| Projetos listados | Escopo do usuário: global (admin/supervisor/sócio) vê tudo; demais veem só projetos onde são membros ou responsáveis por disciplina |

## Regras de negócio

- **Progresso** = média do peso de status das disciplinas (× 100). Projeto sem
  disciplina = 0%.
- **Gargalo** = disciplina de menor avanço entre as não aprovadas.
- **Entregas pendentes** considera prazo ≤ 7 dias **ou** vencido, em projetos em
  andamento, status diferente de aprovado/entregue.
- **Receita prevista** = soma de lançamentos de receita com status *previsto*.

## Casos especiais

- Sem projetos no escopo → "Nenhum projeto ativo.".
- Sem permissão financeira → os blocos financeiros simplesmente não aparecem (não é
  erro).
- Menos de 2 dias de histórico → o gráfico de evolução fica oculto.

## Erros possíveis e soluções

| Situação | Causa provável | Solução |
| --- | --- | --- |
| Não vejo cartões de receita | Sem `financeiro:ver` e não é sócio | Solicitar permissão ao admin |
| Sou cliente e caio noutra tela | Comportamento esperado | Cliente usa o [Portal](portal-cliente.md) |
| KPIs pessoais zerados | Você não é responsável por disciplinas | Normal para perfis administrativos |

## Funcionalidades relacionadas

- [Portal do cliente](portal-cliente.md)
- [Projetos](../projetos/README.md) · [Financeiro](../financeiro/README.md)

## FAQ

**O humor é anônimo?** É um registro pessoal por dia (1–5) ligado ao seu usuário.

**Por que não vejo o gráfico de receita?** Falta permissão financeira, ou não há dados
no período.
