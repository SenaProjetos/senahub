---
titulo: Lançamentos (receitas e despesas)
descricao: Cadastro de receitas e despesas, com previsto/confirmado, recorrência, campos obrigatórios e exclusão reversível.
resumo: Registre receitas e despesas (previstas ou já confirmadas), com categoria, conta, forma, projeto, fornecedor/cliente; confirme o realizado, use recorrência mensal e exclua com segurança (soft delete).
tags: [lançamentos, receita, despesa, previsto, confirmado, recorrência, categoria, conta, forma de pagamento, soft delete]
palavras-chave: [lançamento, receita, despesa, previsto, confirmado, realizado, recorrência, vencimento, competência, categoria, fornecedor, cliente, estornar, estorno, reabrir, desfazer pagamento, histórico]
sinonimos: [movimentações, entradas e saídas, transações]
---

# Lançamentos (receitas e despesas)

## Objetivo

Registrar todas as **receitas** e **despesas** do escritório — a base de todo o módulo
financeiro (DRE, caixa, aging, relatórios).

## Como acessar

- Menu → **Financeiro** → cartão **Lançamentos** (`/financeiro/lancamentos`). Exige
  `financeiro:ver` para ver; **criar/editar/confirmar exige `financeiro:gerir`**.

## Criar um lançamento

Campos:

- **Tipo:** receita ou despesa.
- **Descrição**, **valor** (> 0), **data**.
- **Vencimento** e **data de competência** (opcionais).
- **Categoria** (obrigatória), **centro de custo**, **conta**, **forma de pagamento**.
- **Projeto**, **fornecedor** (despesa) ou **cliente** (receita), **observação**.
- **Nº do documento** (boleto, NF, recibo) e **chave da NF** (44 dígitos — o sistema confere o dígito verificador
  e avisa se a chave foi digitada errada).
- **Confirmado:** marque para já lançar como **realizado** (senão entra como
  **previsto**).
- **Recorrência mensal:** nº de ocorrências (1 = sem recorrência; até 60), que gera
  lançamentos mensais repetidos.

> **Campos obrigatórios são configuráveis.** O administrador pode exigir centro de custo,
> forma, projeto, contato (fornecedor/cliente) e/ou observação — veja Configurações do
> financeiro. Se faltar um campo exigido, o sistema avisa qual é.

## Filtros do livro caixa

- **Conta:** marque as contas que quer ver. Lançamento **sem conta** tem a própria caixa "Sem conta" e não entra
  mais quando você escolhe só uma conta.
- **Tag:** filtra pelas etiquetas dos lançamentos (a lista mostra só as que existem).

## Estados do lançamento

| Estado | Significado |
| --- | --- |
| **Previsto** (em aberto) | Lançado, ainda não realizado (entra no aging e na projeção) |
| **Aguardando aprovação** | Despesa acima da alçada: não se paga nem se concilia até ser aprovada |
| **Pago / Recebido** | Realizado (entra no caixa, no resultado e na DRE). No filtro do livro caixa aparece como "Pagos e recebidos" e, no painel por conta, como "Realizado" |
| **Cancelado** | Fora do caixa e das contas; pode ser reaberto |

Cada mudança de estado fica no **histórico** do lançamento (em **Detalhes**), com quem fez e quando.

- **Confirmar** (dar baixa) num lançamento previsto pede: conta, forma, **data** e o **valor do título quitado**
  (deixe o total para quitar tudo; menos que o total é **pagamento parcial** e o resto fica em aberto).
- **Juros, multa e desconto** (seção dobrável da baixa) ficam **separados do título**: cada um vira um lançamento
  próprio, na mesma conta e data, ligado ao principal. Na **despesa**, juros e multa vão para *Juros e multas pagos*
  (despesa) e o desconto para *Descontos obtidos* (receita); no **recebimento**, juros e multa vão para *Juros e multas
  recebidos* (receita) e o desconto para *Descontos concedidos* (despesa). A tela mostra antes de confirmar quanto
  sai (ou entra) na conta. **Quitar com desconto** só vale quitando o título inteiro.
- Os juros/multa/desconto de uma baixa **andam junto com o principal**: estornar, excluir ou corrigir o pagamento
  do principal leva eles; sozinhos não se mexem.

## Editar e excluir

- **Editar:** descrição, valor, datas, categoria, centro, projeto, contato, observação.
- **Excluir:** é **reversível** — o lançamento é marcado como excluído (soft delete) e
  some das listas, mas permanece registrado internamente.

## Estornar e reabrir

- **Estornar** (lançamento pago ou recebido): ele volta a ficar **em aberto**, sem data nem valor
  pagos. Use quando a baixa foi feita por engano.
  - **Baixa parcial:** o saldo restante que ainda estava em aberto sai junto e o lançamento volta ao
    valor cheio. Se o saldo restante já foi pago, estorne ele primeiro.
  - **Receita distribuída entre as caixinhas:** a distribuição é desfeita junto. Se uma caixinha já
    liberou ou transferiu o que recebeu, reserve de volta antes.
  - **Conciliado com o extrato** não se estorna: desconcilie a transação antes.
  - **Pagamento de produção** (projetista) se estorna pela tela de [Produção](producao.md).
- **Reabrir** (lançamento cancelado): volta a ficar em aberto. Despesa **rejeitada** na aprovação
  volta para a **fila de aprovação**.
- Lançamento **pago não se cancela**: estorne antes. Conciliado também não se exclui.

## Menu de ações e seleção em lote

Clique com o **botão direito** num lançamento (ou use o botão **⋯**) para **abrir os detalhes**,
**editar**, **confirmar** (quando está previsto), **estornar** (quando está pago), **reabrir** (quando
está cancelado), **copiar a descrição**, **duplicar** (abre o formulário de um lançamento novo com os mesmos dados — data de hoje,
sem vencimento nem nº do documento), **ratear entre centros e projetos**, **cancelar** ou **excluir**. O que o estado do
lançamento não permite aparece esmaecido, com o motivo.

**Rateio:** divide um lançamento entre centros de custo e/ou projetos por percentual (a soma tem que fechar 100%).
Muda só o **Relatório por dimensão** (centro e projeto); o centro e o projeto do cadastro continuam valendo no livro
caixa, nas contas a pagar e no resto do sistema.

**Comprovante na baixa:** se **Configurações → Comprovante na baixa** estiver ligado, não dá para confirmar um
lançamento lançado à mão (uma baixa, em lote ou em Pagamentos em lote) sem anexar pelo menos um comprovante.
Folha, projetistas, ART, recorrências e compras no cartão não entram nessa regra.

Marque vários lançamentos e a barra da parte de baixo da tela oferece **baixar**, **cancelar** e
**excluir** todos de uma vez, com a contagem na confirmação. A seleção continua valendo ao mudar
de filtro ou de página, e o botão **Selecionados (N)** mostra só os marcados, de qualquer filtro (nessa
visão o saldo corrido fica oculto). O resultado mostra quantos deram certo e quais falharam.

## Aprovação de despesas

Despesas acima de determinada faixa de valor exigem **aprovação por alçada** antes de
seguir. Veja [Aprovações](aprovacoes.md).

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver lançamentos | `financeiro:ver` |
| Criar / editar / confirmar / estornar / reabrir / excluir | `financeiro:gerir` |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Valor deve ser maior que zero." | Valor ≤ 0 | Informar valor positivo |
| "Selecione a categoria." | Categoria vazia | Escolher categoria |
| Avisa que falta um campo (ex.: "Centro de custo") | Campo obrigatório pela configuração | Preencher o campo exigido |
| Despesa fica "aguardando aprovação" | Valor acima da alçada | Aguardar aprovador |
| "Já foi pago ou recebido: estorne antes." | Cancelar um lançamento pago | Estornar e depois cancelar |
| "Conciliado com o extrato: desconcilie a transação antes." | Estornar, cancelar ou excluir um conciliado | Desconciliar em Conciliação |
| "Lançamento cancelado: reabra antes." | Baixar, conciliar ou editar um cancelado | Reabrir |
| "O saldo restante desta baixa parcial já foi pago: estorne ele antes." | Estornar a primeira parte de uma baixa parcial | Estornar o saldo restante primeiro |
| "As caixinhas já liberaram ou transferiram parte do que esta receita reservou…" | Estornar receita distribuída | Reservar de volta nas caixinhas |

## Funcionalidades relacionadas

- [Contas e Aging](contas-e-aging.md) · [Conciliação](conciliacao-ofx.md) · [Aprovações](aprovacoes.md) · [Relatórios](relatorios.md)

## FAQ

**Qual a diferença entre previsto e confirmado?** Previsto é o que deve acontecer (agenda
de caixa); confirmado é o que de fato ocorreu (entra no resultado).

**Excluí um lançamento por engano.** A exclusão é lógica (soft delete); peça ao
administrador para recuperar.
