# SENAHub — Especificação Completa do Módulo Financeiro

## Contexto

O SENAHub é um ERP interno para uma empresa de projetos de engenharia.

O módulo financeiro deve ser completamente integrado ao módulo operacional de projetos.

Toda movimentação financeira deve estar vinculada a um projeto, disciplina, cliente, fornecedor ou projetista.

O sistema deve permitir rastreabilidade total de receitas, despesas, pagamentos, recebimentos e rentabilidade.

---

# Perfis de Acesso

## Sócio
Acesso total.

## Financeiro
Acesso completo ao módulo financeiro.

## Coordenador
Visualização financeira dos projetos sob sua responsabilidade.

## Projetista
Visualização apenas dos seus pagamentos e recebimentos.

---

# Estrutura Principal

1. Dashboard Financeiro
2. Contas a Receber
3. Contas a Pagar
4. Fluxo de Caixa
5. Controle Financeiro por Projeto
6. Controle de Pagamentos de Projetistas
7. Fechamento Mensal
8. Centro de Custos
9. Relatórios
10. Configurações Financeiras

---

# Dashboard Financeiro

## Indicadores
- Receita do mês
- Receita prevista
- Receita recebida
- Despesas do mês
- Lucro bruto
- Lucro líquido
- Projetos em execução
- Projetos inadimplentes
- Pagamentos pendentes
- Contas vencidas

## Gráficos
- Receita por mês
- Despesa por mês
- Margem por projeto
- Margem por cliente
- Rentabilidade por disciplina
- Evolução financeira anual

---

# Contas a Receber

## Campos
- Cliente
- Projeto
- Contrato
- Valor
- Data de emissão
- Vencimento
- Status
- Observações

## Status
- Previsto
- Faturado
- Recebido
- Atrasado
- Cancelado

## Funcionalidades
- Cadastrar recebimento
- Editar recebimento
- Excluir (soft delete)
- Registrar recebimento
- Anexar nota fiscal
- Anexar comprovantes
- Parcelamento
- Histórico completo

---

# Contas a Pagar

## Campos
- Fornecedor
- Projetista
- Tipo de despesa
- Projeto relacionado
- Disciplina relacionada
- Valor
- Vencimento
- Status

## Categorias
- Projetistas
- Softwares
- Infraestrutura
- Marketing
- Jurídico
- Contabilidade
- Tributos
- Administrativo
- Outros

## Funcionalidades
- Cadastro
- Edição
- Parcelamento
- Comprovantes
- Registro de pagamento
- Histórico

---

# Controle Financeiro por Projeto

## Dados Financeiros
- Valor contratado
- Valor recebido
- Valor pendente
- Custos internos
- Custos externos
- Pagamentos de projetistas
- Despesas gerais
- Lucro bruto
- Lucro líquido
- Margem percentual

## Visualizações
- Gráfico de receitas
- Gráfico de custos
- Linha do tempo financeira

---

# Controle por Disciplina

Cada disciplina deve possuir:

- Responsável
- Valor previsto
- Valor pago
- Status
- Margem individual

---

# Portal Financeiro do Projetista

## Minha Remuneração
- Projetos atribuídos
- Disciplinas atribuídas
- Valor acordado
- Valor pago
- Saldo pendente
- Data prevista

## Extrato Financeiro
- Histórico de pagamentos
- Pagamentos futuros
- Comprovantes

---

# Fechamento Mensal

## Processo
1. Selecionar mês
2. Consolidar projetos
3. Consolidar disciplinas
4. Calcular valores
5. Aplicar descontos
6. Aplicar retenções
7. Gerar relatório
8. Gerar comprovantes

## Resultado
- Valor bruto
- Descontos
- Valor líquido
- Status de pagamento

---

# Fluxo de Caixa

## Visão
- Entradas previstas
- Entradas realizadas
- Saídas previstas
- Saídas realizadas
- Saldo acumulado
- Saldo projetado

## Filtros
- Período
- Cliente
- Projeto
- Disciplina
- Centro de custo

---

# Centro de Custos

- Operação
- Projetos
- Marketing
- Administrativo
- Tecnologia
- Jurídico
- Financeiro

---

# Relatórios

## Financeiro Geral
- Receitas
- Despesas
- Lucro
- Margem

## Por Cliente
- Receita
- Lucro
- Ticket médio

## Por Projeto
- Receitas
- Custos
- Lucro
- Margem

## Por Projetista
- Valor recebido
- Projetos executados
- Produtividade financeira

## Exportações
- PDF
- Excel
- CSV

---

# Auditoria

Registrar obrigatoriamente:

- Usuário
- Data
- Hora
- Valor anterior
- Valor novo
- Ação realizada
- IP

---

# Notificações

- Conta vencendo
- Conta vencida
- Projeto inadimplente
- Pagamento pendente
- Fechamento mensal disponível
- Novo recebimento registrado

---

# Banco de Dados

## Entidades

- Cliente
- Projeto
- Disciplina
- Contrato
- Receita
- Despesa
- PagamentoProjetista
- Fornecedor
- CentroCusto
- ContaReceber
- ContaPagar
- FluxoCaixa
- FechamentoMensal
- AuditoriaFinanceira

---

# Regras Obrigatórias

- Soft delete em todos os lançamentos
- Log de auditoria obrigatório
- Histórico completo de alterações
- Vínculo entre receitas e projetos
- Vínculo entre pagamentos e disciplinas
- Relatórios exportáveis
- Busca e filtros avançados
- PostgreSQL
- Django ORM
- Django REST Framework
- Frontend Next.js

---

# Diferencial Estratégico — DRE por Projeto

## Objetivo

Permitir que a diretoria saiba exatamente quais projetos, clientes e disciplinas geram lucro.

## Indicadores da DRE

### Receitas
- Valor contratado
- Aditivos
- Receita total
- Receita recebida
- Receita pendente

### Custos Diretos
- Projetistas
- Consultorias
- ART/RRT
- Despesas específicas

### Custos Indiretos Rateados
- Softwares
- Administração
- Comercial
- Jurídico
- Infraestrutura

### Resultado
- Lucro bruto
- Lucro líquido
- Margem bruta (%)
- Margem líquida (%)
- ROI

## Dashboards

- Ranking dos projetos mais lucrativos
- Ranking dos clientes mais lucrativos
- Rentabilidade por disciplina
- Rentabilidade por coordenador
- Evolução da margem ao longo do tempo

## Alertas

- Projeto com margem negativa
- Projeto abaixo da margem mínima definida
- Projeto com custo acima do orçamento previsto

Essa funcionalidade deve ser considerada estratégica e fazer parte do núcleo financeiro do SENAHub.
