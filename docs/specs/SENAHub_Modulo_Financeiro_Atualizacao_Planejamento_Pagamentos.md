

---

# Módulo Estratégico — Planejamento de Pagamentos

## Objetivo

Permitir ao financeiro planejar a utilização do caixa disponível para pagamentos pendentes, simulando diferentes cenários antes da efetivação dos pagamentos.

Este módulo deve funcionar como uma mesa de planejamento financeiro operacional.

---

## Tela: Planejamento de Pagamentos

### Configurações Iniciais

Campos:

- Período inicial
- Período final
- Saldo disponível para planejamento
- Conta bancária (opcional)
- Centro de custo (opcional)
- Projeto (opcional)

Após informar o saldo disponível, o sistema deverá carregar todas as contas em aberto dentro do período selecionado.

---

## Grid Principal

Colunas:

- Ordem
- Selecionar
- Favorecido
- Tipo
- Projeto
- Disciplina
- Vencimento
- Valor Original
- Valor Planejado
- Saldo da Conta
- Saldo Acumulado Disponível
- Status

---

## Regras de Funcionamento

O usuário informa um saldo inicial.

Exemplo:

Saldo disponível = R$ 100.000,00

O sistema percorre as linhas do planejamento e vai debitando os valores planejados.

Exemplo:

Conta A = R$ 20.000
Saldo restante = R$ 80.000

Conta B = R$ 15.000
Saldo restante = R$ 65.000

Conta C = R$ 30.000
Saldo restante = R$ 35.000

O saldo acumulado deve ser recalculado em tempo real.

---

## Pagamento Parcial

O usuário pode alterar o valor planejado.

Exemplo:

Conta original = R$ 20.000

Valor planejado = R$ 5.000

Saldo da conta = R$ 15.000

O saldo remanescente da obrigação deve permanecer em aberto.

---

## Reordenação Livre

As linhas devem permitir:

- Drag and drop
- Reordenação manual
- Priorização por arraste

A ordem das linhas impacta diretamente o consumo do saldo disponível.

---

## Agrupamentos

Permitir agrupamento por:

- Projeto
- Cliente
- Projetista
- Fornecedor
- Centro de custo
- Tipo de despesa
- Coordenador

Os grupos devem ser expansíveis e recolhíveis.

---

## Simulações

O usuário pode criar múltiplos cenários.

Exemplos:

- Cenário Conservador
- Cenário Operacional
- Cenário Projetistas
- Cenário Fechamento Mensal

Cada cenário deve possuir:

- Nome
- Responsável
- Data de criação
- Observações

---

## Indicadores da Simulação

Exibir:

- Saldo inicial
- Total planejado
- Saldo remanescente
- Total de contas contempladas
- Total de contas não contempladas
- Percentual de cobertura financeira

---

## Aprovação

Permitir status:

- Rascunho
- Em análise
- Aprovado
- Executado
- Cancelado

---

## Execução

Após aprovação:

- Gerar contas a pagar programadas
- Gerar lote de pagamento
- Gerar relatório financeiro
- Registrar histórico da execução

---

## Relatórios

- Planejamento realizado
- Contas contempladas
- Contas não contempladas
- Histórico de cenários
- Evolução do caixa projetado

---

## Diferenciais

- Drag and drop em tempo real
- Simulação de caixa futura
- Pagamentos parciais
- Agrupamentos livres
- Recalculo instantâneo dos saldos
- Integração com fluxo de caixa
- Integração com fechamento mensal
- Integração com pagamentos de projetistas

Este módulo deve ser tratado como um dos principais diferenciais do SENAHub, permitindo planejamento financeiro operacional avançado sem necessidade de planilhas externas.
