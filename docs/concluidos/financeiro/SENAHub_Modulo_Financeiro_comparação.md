# Sistema Financeiro Integrado — SenaHub
## Análise Comparativa e Guia de Implementação
> **Referência:** Meu Dinheiro Web (app.meudinheiroweb.com.br) — versão 8.4.3.3.2  
> **Destino:** SenaHub (localhost:3000) — módulo /financeiro  
> **Data da análise:** 18/06/2026

---

## 1. Visão Geral do Sistema de Referência

O **Meu Dinheiro Web** é um sistema de gestão financeira empresarial com foco em controle de caixa, contas a pagar/receber, DRE, orçamento e relatórios gerenciais. Está estruturado em módulos acessíveis via menu lateral e barra de navegação superior, com suporte a múltiplas contas bancárias e centros de custo.

O **SenaHub** já possui a estrutura base do módulo financeiro implementada, porém com funcionalidades ainda em evolução. Este documento mapeia as principais características do sistema de referência e aponta como cada uma pode ser aplicada ou aprimorada no SenaHub.

---

## 2. Módulos e Funcionalidades Principais

### 2.1 Dashboard / Visão Geral

**O que o sistema de referência possui:**
- Painel unificado com DRE resumido (Receitas Operacionais, Despesas, EBITDA, Resultado Líquido)
- Análise horizontal (AH) e vertical (AV) dos indicadores
- Saldos de caixa por conta bancária (confirmado vs. projetado)
- Lista de últimos lançamentos com atalho para novo lançamento
- Contas a pagar listadas com vencimento, categoria, centro e valor
- Contas a receber com status de confirmação pendente
- Gráfico de Fluxo de Caixa com projeção por semana/mês
- Despesas por categoria (gráfico de rosca com percentuais)
- Despesas por centro de custo (gráfico de rosca)
- Resultado do mês: receitas vs. despesas (gráfico de barras)
- Resultados por centros (receitas, despesas e resultado por centro)
- Alertas de vencimento de contas em destaque (banner vermelho)
- Navegação temporal: seleção de mês/período com setas

**Aplicação no SenaHub:**
- O SenaHub já tem o Aging (vencidos x a vencer) no dashboard financeiro ✓
- Implementar cards de DRE resumido no topo
- Adicionar gráfico de resultado do mês (receitas vs. despesas em barras)
- Adicionar gráfico de despesas por categoria (rosca com top categorias)
- Incluir painel de saldos por conta bancária com valores confirmado/projetado
- Implementar alerta de vencimento destacado (banner ou notificação)
- Exibir os últimos 5–10 lançamentos com atalho rápido para novo lançamento

---

### 2.2 Lançamentos de Caixa

**O que o sistema de referência possui:**
- Extrato cronológico com saldo acumulado por linha
- Status por cor: Pendente (vermelho), Agendado (amarelo), Confirmado (verde), Conciliado (azul)
- Filtros por status (Pendentes, Agendados, Confirmados, Conciliados)
- Painel lateral com seleção de período (ex: jan–jun 2026)
- Seleção de contas bancárias com checkbox individual
- Resumo do período: Entradas (Receitas + Transferências), Saídas (Despesas + Transferências), Resultado
- Saldo confirmado e projetado por conta
- Cada lançamento exibe: data, descrição, conta, categoria, subcategoria, centro, forma de pagamento, contato, valor, saldo acumulado
- Badges especiais coloridos: FOLHA DE PGTO, REEMBOLSO, CONFIRMAR
- Ação rápida de confirmação inline (ícone de check na linha)
- Indicador de lançamento recorrente/parcelado
- Exportação: XLSX, CSV, PDF e impressão
- Paginação de registros
- Botão flutuante "+" para novo lançamento

**Status dos lançamentos:**
- **Pendente:** agendado, não confirmado
- **Agendado:** com data futura definida
- **Confirmado:** efetivado manualmente
- **Conciliado:** conciliado via extrato bancário (OFX)
- **Aguardando aprovação:** acima do limite de alçada
- **Cancelado:** estornado/cancelado

**Aplicação no SenaHub:**
- O SenaHub já implementa: todos os status, filtros, busca textual, exportação, saldo acumulado e painel lateral ✓
- **Melhorias sugeridas:**
  - Adicionar badge visual de tipos especiais (FOLHA DE PGTO, REEMBOLSO)
  - Implementar confirmação rápida inline (ícone de check diretamente na linha)
  - Mostrar forma de pagamento e contato na linha do extrato
  - Adicionar seleção múltipla para ações em lote (confirmar vários de uma vez)
  - Exibir badge com número de parcela (ex: "4/60") para lançamentos parcelados

---

### 2.3 Contas a Pagar e Receber

**O que o sistema de referência possui:**
- Abas separadas: "A pagar" e "A receber"
- Filtros: Pendentes, Agendados
- Painel lateral com resultado do período (a pagar, a receber, resultado líquido)
- Agrupamento por tipo de conta (Reembolsos, Produção/Salário, Impostos, Contas à Pagar)
- Cada item exibe: data de vencimento, descrição, número de parcela, categoria, subcategoria, centro, contato, forma de pagamento, valor
- Badge de recorrência com número de ocorrências
- Status visual: vermelho = atrasado, amarelo = a vencer
- Botão de ação rápida "Pagar/Receber" diretamente na linha
- Filtros avançados: Fornecedor/Cliente, Centro, Forma de Pagamento, Projeto, Valor mín/máx
- Exportação e impressão
- Opção de exibir/ocultar coluna Saldo

**Aplicação no SenaHub:**
- O SenaHub já possui a estrutura base com abas, filtros e exportação ✓
- **Melhorias sugeridas:**
  - Adicionar agrupamento por tipo de conta no painel lateral
  - Implementar badge de número de parcelas (ex: "4/60")
  - Adicionar botão "Pagar" / "Receber" inline na linha da tabela
  - Exibir fornecedor/contato como coluna na tabela
  - Implementar filtro por Valor mínimo e máximo
  - Adicionar opção de agrupamento (por categoria, por centro, por fornecedor)

---

### 2.4 Fluxo de Caixa

**O que o sistema de referência possui:**
- Gráfico de linha temporal mostrando o saldo projetado das contas bancárias
- Filtro por conta bancária (checkbox individual)
- Projeção de saldo futuro com base em contas pendentes/agendadas
- Valor do saldo projetado em data futura específica
- Visão semanal/mensal configurável

**Aplicação no SenaHub:**
- O SenaHub já tem Fluxo de Caixa com projeção de 8 semanas em tabela e movimentos recentes ✓
- **Melhorias sugeridas:**
  - Adicionar gráfico de linha/área do saldo projetado ao longo do tempo
  - Permitir filtro por conta bancária na visualização
  - Mostrar projeção de saldo em data selecionável pelo usuário
  - Adicionar visão gráfica comparativa: realizado vs. projetado

---

### 2.5 Relatórios (20+ tipos disponíveis)

**Gerenciais e Estratégicos:**
- DRE — Demonstrativo dos Resultados do Exercício (com AH e AV)
- DFC — Demonstrativo do Fluxo de Caixa (operacional, investimento, financiamento)
- Balanço Patrimonial (ativos, passivos e patrimônio líquido)
- Indicadores do Negócio (KPIs visuais)
- Evolução do Balanço Patrimonial
- Comparação entre Períodos
- Evolução das Metas de Categorias
- Evolução das Metas de Centros

**Por Agrupamento:**
- Totais por Categoria (gráfico)
- Evolução por Categoria (tendência ao longo dos meses)
- Totais por Centro (gráfico)
- Evolução por Centro
- Totais por Projeto / Resultados dos Projetos
- Totais por Contato / Evolução por Contato
- Lançamentos por Categoria, Centro, Contato e Projeto (listas detalhadas)

**Controle de Caixa:**
- Fluxo de Caixa (gráfico de entradas/saídas)
- Lançamentos de Caixa (extrato completo)
- Contas a Pagar / Contas a Receber (com vencimentos futuros)
- Contas Pagas / Contas Recebidas (históricos)

**Funcionalidades da tela de relatórios:**
- Busca por nome de relatório
- Filtro por categoria (Gerenciais, Controle de Caixa, Receitas e Despesas)
- Sistema de favoritos (estrela nos relatórios preferidos)

**Aplicação no SenaHub:**
- O SenaHub já possui DRE básico por período ✓
- **Melhorias sugeridas:**
  - Adicionar análise horizontal (AH%) e vertical (AV%) no DRE
  - Implementar Comparação entre Períodos
  - Adicionar Totais por Categoria (gráfico de rosca)
  - Implementar Evolução por Categoria ao longo dos meses
  - Adicionar Lançamentos por Projeto
  - Criar sistema de favoritos e busca na tela de relatórios
  - Adicionar filtros por categoria de relatório

---

### 2.6 DRE — Demonstrativo de Resultado

**O que o sistema de referência possui:**
- Receitas Operacionais e não operacionais
- Custos Diretos (CPV/CSV)
- Lucro Bruto
- Despesas Operacionais (por subcategoria)
- EBITDA
- Resultado Financeiro
- Resultado Líquido
- Análise Horizontal (AH): variação % vs. período anterior
- Análise Vertical (AV): % de cada linha sobre a receita total
- Detalhamento navegável por categoria com drill-down

**Aplicação no SenaHub:**
- O SenaHub já tem DRE com receitas, despesas e resultado ✓
- **Melhorias sugeridas:**
  - Adicionar análise horizontal (% variação vs. período anterior)
  - Adicionar análise vertical (% de participação sobre receita)
  - Implementar EBITDA como indicador específico
  - Expandir estrutura para incluir receitas não operacionais e resultado financeiro
  - Adicionar drill-down: clicar em uma categoria para ver os lançamentos daquele período

---

### 2.7 DFC — Demonstrativo do Fluxo de Caixa

**O que o sistema de referência possui:**
- Classificação por atividade: Operacional, Investimento, Financiamento
- Variação total de caixa no período/ano
- Configuração de qual categoria pertence a qual atividade
- Visão anual com seleção de ano

**Aplicação no SenaHub:**
- O SenaHub já tem DFC com três atividades e classificação por categoria ✓
- **Melhorias sugeridas:**
  - Adicionar gráfico visual das três categorias em barras
  - Implementar comparativo mensal dentro do ano selecionado

---

### 2.8 Balanço Gerencial

**O que o sistema de referência possui:**
- Ativo: caixa/bancos, contas a receber, investimentos
- Passivo: contas a pagar, empréstimos
- Patrimônio Líquido = Ativo − Passivo
- Visão simplificada de base caixa

**Aplicação no SenaHub:**
- O SenaHub já tem Balanço Gerencial com Ativo, Passivo e PL ✓
- **Melhorias sugeridas:**
  - Adicionar evolução histórica do PL ao longo dos meses
  - Implementar gráfico visual do balanço
  - Adicionar Investimentos como subcategoria do Ativo

---

### 2.9 Orçamento Anual

**O que o sistema de referência possui:**
- Meta anual por categoria (receitas e despesas)
- Comparativo: Planejado × Previsto × Realizado
- Percentual do orçado realizado (barra de progresso)
- Gráfico de resultado mensal ao longo do ano
- Adição de novas categorias ao orçamento

**Aplicação no SenaHub:**
- O SenaHub já implementa Orçamento anual com gráfico mensal e % realizado ✓
- **Melhorias sugeridas:**
  - Adicionar coluna "Previsto" (soma dos lançamentos futuros pendentes/agendados)
  - Adicionar barra de progresso visual no % realizado
  - Permitir metas por subcategoria
  - Exibir variação colorida: verde = dentro do orçamento, vermelho = estourado

---

### 2.10 Conciliação Bancária

**O que o sistema de referência possui:**
- Importação de extrato bancário no formato OFX
- Conciliação automática de transações por valor e data
- Status "Conciliado" nos lançamentos após a conciliação

**Aplicação no SenaHub:**
- O SenaHub já tem Conciliação Bancária com importação OFX ✓
- **Melhorias sugeridas:**
  - Implementar sugestão automática de match por valor + data + descrição
  - Adicionar histórico de conciliações anteriores
  - Exibir indicador do número de pendentes no card do dashboard financeiro

---

### 2.11 Aprovações Financeiras (Alçada)

**Funcionalidade exclusiva do SenaHub:**
- Limite de alçada configurável por valor
- Despesas acima do limite ficam com status "Aguardando aprovação"
- **Evoluções sugeridas:**
  - Adicionar notificação por e-mail/push para aprovadores
  - Implementar log de aprovações com quem aprovou e quando
  - Permitir múltiplos níveis de alçada (ex: até R$ 5.000 = gerente, acima = diretoria)
  - Adicionar campo de justificativa na aprovação/rejeição

---

### 2.12 Folha de Projetistas

**Funcionalidade exclusiva do SenaHub:**
- Lotes mensais de pagamento agrupados
- Pagamentos liberados por entregas validadas nos projetos
- Integração com o módulo de Projetos
- **Evoluções sugeridas:**
  - Integrar com lançamentos de caixa (baixa automática ao confirmar lote)
  - Exportar folha em PDF para envio aos projetistas
  - Adicionar histórico de lotes gerados anteriores

---

### 2.13 Cadastros Financeiros

**O que o sistema de referência possui:**
- **Categorias (Plano de Contas):** hierárquico (categoria > subcategoria), tipo receita/despesa
- **Centros de custo/lucro:** agrupamento de lançamentos
- **Contas bancárias:** nome, banco, tipo (corrente, poupança, caixa, investimento)
- **Contatos:** clientes e fornecedores vinculados aos lançamentos
- **Formas de pagamento:** PIX, boleto, transferência, cartão etc.
- **Projetos:** para vincular lançamentos a projetos
- **Tags:** para classificação livre

**Aplicação no SenaHub:**
- O SenaHub já possui: Plano de contas hierárquico, Contas bancárias, Fornecedores, Sócios, Centros de custo, Formas de pagamento ✓
- **Melhorias sugeridas:**
  - Implementar cadastro de Tags para lançamentos
  - Vincular Clientes do módulo de Clientes como contatos financeiros (receitas)
  - Expandir Centros com tipo (custo vs. lucro)
  - Adicionar saldo inicial configurável por conta bancária

---

## 3. Configurações do Módulo Financeiro

**Configurações identificadas no sistema de referência:**
- **Data de competência:** campo separado da data de caixa nos lançamentos
- **Obrigatoriedade de campos:** Contatos, Centros, Formas de pagamento, Projetos, Número de documento
- **Tags:** habilitar/desabilitar campo nos lançamentos
- **Campo de observações:** habilitar/desabilitar
- **Senha para exclusão de cadastros:** proteção contra exclusão acidental
- **Metas de receitas e despesas:** considerar apenas categorias com metas na apuração
- **Lançamentos pendentes no presente:** exibir no dia atual ou no dia do vencimento
- **Forçar uso de subcategorias:** desabilitar seleção de categoria pai
- **Padrão de parcelamento:** valor da parcela ou valor total no cadastro

**Implementação no SenaHub:**
- Criar página de Configurações do módulo financeiro
- Prioridade: Data de competência, Obrigatoriedade de campos, Senha para exclusão

---

## 4. Funcionalidades Transversais

### 4.1 Aging (Vencidos e a Vencer)
- Faixas: A vencer, 1-30 dias, 31-60 dias, 61-90 dias, 91-120 dias, 120+ dias
- Separação entre Recebíveis e Pagáveis em abas
- O SenaHub já implementa este módulo ✓

### 4.2 Exportação de Dados
- XLSX, CSV e PDF disponíveis em todas as telas de listagem
- O SenaHub já implementa nas telas principais ✓

### 4.3 Busca e Filtros
- Busca textual por descrição, contato, número de documento
- Filtros combinados: Categoria, Centro, Forma de Pagamento, Projeto, Valor mín/máx
- Agrupamento configurável (por categoria, por data, por centro)
- O SenaHub já implementa os filtros principais ✓

### 4.4 Status dos Lançamentos
- Pendente, Agendado, Confirmado, Conciliado, Aguardando aprovação, Cancelado
- Indicação visual por cor (bolinhas coloridas)
- O SenaHub já implementa todos os status ✓

### 4.5 Recorrência e Parcelamento
- Lançamentos recorrentes com badge de agrupamento (ex: "4/60")
- Edição individual ou em série
- A verificar/implementar no SenaHub

### 4.6 Multi-conta Bancária
- Seleção e filtragem por conta bancária
- Saldo individual e total (confirmado e projetado)
- O SenaHub já implementa ✓

---

## 5. Priorização de Implementação

### Alta Prioridade (impacto imediato no uso diário)
1. Dashboard financeiro: cards de DRE resumido + gráficos de resultado e despesas por categoria
2. DRE expandido: análise horizontal (AH%) e vertical (AV%), EBITDA
3. Badge de parcelas nos lançamentos (ex: "4/60")
4. Botão de confirmar pagamento inline nas contas a pagar/receber
5. Alerta visual de vencimento no dashboard financeiro
6. Relatório de Comparação entre Períodos
7. Relatório de Totais por Categoria (gráfico de rosca)

### Média Prioridade
8. Relatório de Evolução por Categoria ao longo dos meses
9. Relatório de Lançamentos por Projeto
10. Tags nos lançamentos
11. Gráfico de linha no Fluxo de Caixa (visão temporal)
12. Página de Configurações do módulo financeiro
13. Histórico de conciliações bancárias
14. Múltiplos níveis de alçada nas aprovações
15. Notificações de vencimento (push/e-mail)

### Baixa Prioridade (evolução futura)
16. Módulo de Investimentos
17. Integração contábil (exportação SPED)
18. Evolução histórica do Balanço Patrimonial (PL ao longo do tempo)
19. Drill-down no DRE (clicar na categoria e ver os lançamentos)
20. Comparativo mensal no DFC

---

## 6. Diferenciais do SenaHub vs. Sistema de Referência

O SenaHub possui funcionalidades que o sistema de referência **não possui**, representando diferenciais competitivos importantes:

| Funcionalidade | SenaHub | Meu Dinheiro Web |
|---|---|---|
| Módulo de Projetos integrado ao financeiro | ✓ | — |
| Folha de Projetistas | ✓ | — |
| Aprovações financeiras com alçada configurável | ✓ | — |
| Módulo de RH (Ponto, Funcionários, Folha CLT) | ✓ | — |
| Módulo Jurídico | ✓ | — |
| Módulo de Licitações | ✓ | — |
| Módulo de Qualidade | ✓ | — |
| Chat integrado | ✓ | — |
| Auditoria de ações | ✓ | — |
| Cadastro de Clientes integrado ao financeiro | ✓ | — |

---

## 7. Estrutura de Dados Recomendada

### Entidade: Lançamento Financeiro
```json
{
  "id": "string",
  "descricao": "string",
  "valor": "number (positivo = receita, negativo = despesa)",
  "data": "date (data de caixa)",
  "dataCompetencia": "date (opcional)",
  "tipo": "receita | despesa | transferencia",
  "status": "pendente | agendado | confirmado | conciliado | aguardando_aprovacao | cancelado",
  "conta_id": "string (conta bancária)",
  "categoria_id": "string (plano de contas)",
  "centro_id": "string (opcional)",
  "projeto_id": "string (opcional)",
  "contato_id": "string (fornecedor ou cliente, opcional)",
  "forma_pagamento_id": "string (opcional)",
  "numero_documento": "string (opcional)",
  "observacoes": "string (opcional)",
  "tags": ["string"],
  "recorrencia": {
    "parcela_atual": "number",
    "total_parcelas": "number",
    "grupo_id": "string"
  },
  "aprovado_por": "string (opcional)",
  "aprovado_em": "date (opcional)",
  "criado_por": "string",
  "criado_em": "datetime",
  "atualizado_em": "datetime"
}
```

---

## 8. Padrões de UI/UX Recomendados

### Paleta de Status (cores dos indicadores)
- **Vermelho:** vencido, pendente em atraso, despesa
- **Amarelo/Laranja:** agendado, a vencer, alerta
- **Verde:** confirmado, receita, resultado positivo
- **Azul escuro:** conciliado
- **Cinza:** cancelado, inativo

### Padrões de Layout
- Painel lateral esquerdo com filtros, saldos e resumos do período
- Área central com listagem principal ordenada cronologicamente
- Botão flutuante "+" no canto inferior direito para novo lançamento
- Abas para separar visões complementares (A pagar / A receber)
- Badges coloridos para status especiais nos lançamentos
- Gráficos de rosca para distribuição por categoria/centro
- Gráficos de barras para comparativo receitas vs. despesas
- Gráficos de linha/área para evolução temporal do saldo

---

*Documento gerado por análise comparativa automatizada — SenaHub Financial Module Planning — 18/06/2026*