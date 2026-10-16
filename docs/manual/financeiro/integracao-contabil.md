---
titulo: Integração contábil
descricao: Ligar as categorias e as contas bancárias ao plano de contas do contador e exportar o mês fechado num arquivo de lançamentos para o Alterdata.
resumo: Escolha uma vez a conta contábil de cada categoria e de cada conta bancária; depois de fechar o mês, exporte o arquivo (Excel ou CSV) com cada conta a pagar ou a receber em dois lançamentos, na competência e no pagamento. A folha CLT fica de fora, porque o contador lança.
tags: [financeiro, contabilidade, contador, exportação, de-para, plano de contas, alterdata]
palavras-chave: [integração contábil, de-para, conta contábil, plano de contas do contador, exportar para o contador, layout do contador, partida dobrada, classificação, mês fechado]
sinonimos: [exportação contábil, arquivo do contador, lançamentos contábeis, Alterdata]
---

# Integração contábil

## Objetivo

Entregar ao contador, todo mês, os lançamentos do Financeiro já em partida dobrada (conta de débito e conta de
crédito), no plano de contas dele. O contador importa o arquivo no Alterdata e confere, em vez de redigitar.

## Como acessar

- Menu → **Financeiro** → **Mais** → **Integração contábil** (`/financeiro/contabil`).
- Exige `financeiro:fechar`, a mesma permissão do Fechamento mensal: quem fecha o mês é quem o entrega ao contador.

## De-para: ligar categorias e contas ao plano do contador

A aba **De-para** lista as categorias do Financeiro e, ao lado, as contas bancárias. Para cada uma, clique com o botão
direito (ou no `⋯`):

- **Escolher conta contábil…** — abre o plano do contador já no grupo que faz sentido (despesa no grupo 3, receita no
  4, banco no 1.1). Busque pelo nome, pela classificação ou pelo código. Só aparecem contas **analíticas** (as que
  recebem lançamento).
- **Copiar de outra categoria…** — usa a conta de outra categoria do mesmo tipo.
- **Ver lançamentos de &lt;mês&gt;** — os lançamentos da categoria (e das filhas) no mês escolhido.
- **Limpar conta** — tira a conta; a categoria volta a usar a da categoria mãe, se houver.

Regras que valem:

- **A conta da mãe vale para as filhas** que não tiverem a própria. Ligue "2.06 Despesas administrativas" uma vez e
  todas as filhas dela saem nessa conta.
- Uma categoria **grupo** (que tem filhas) sem conta não falta: cada filha usa a sua.
- **Folha CLT: "Não exportar — o contador lança".** O contador processa a folha; ela não entra no arquivo.
- Cliente sem conta própria sai em **Clientes Diversos**; fornecedor, em **Fornecedores Diversos**.
- Impostos, pró-labore e distribuição de lucros têm a contrapartida própria (Simples a recolher, Pró-labore a pagar,
  Dividendos a pagar), não "fornecedor".

No arquivo, a conta sai pela **classificação** do plano do contador ("3.1.2.03.0009"), como ele pediu. Por dentro, o
SenaHub guarda o código reduzido (o número entre parênteses no plano), que nunca se repete.

No plano do contador, PIS, COFINS, ICMS, IPI e IE a recolher têm a mesma classificação (`2.1.3.01.0003`). Está certo: no
Simples Nacional esses tributos vêm juntos no DAS, então para o Alterdata são uma conta só.

## Exportar o mês

1. Feche o mês em **Fechamento mensal**. Mês aberto não exporta, para o arquivo bater com o que o contador já
   recebeu.
2. Na **Integração contábil**, escolha o mês e o formato (**Layout do contador**, **Excel** ou **CSV**) e clique em **Exportar &lt;mês&gt;**.
3. O arquivo baixa na hora e a exportação fica registrada (quem gerou, quando e as linhas como saíram).

Como os lançamentos viram linhas:

- **Conta a pagar ou a receber = duas linhas**: o reconhecimento, na data de competência (despesa contra o
  fornecedor; cliente contra a receita), e a baixa, no dia do pagamento (fornecedor contra o banco; banco contra o
  cliente). Em aberto, só o reconhecimento. Pago antes da competência, a baixa sai no mês do pagamento e o
  reconhecimento no da competência.
- **Pagamento parcial**: o título é reconhecido uma vez, pelo valor inteiro; cada pagamento é uma baixa.
- **Cartão de crédito**: cada compra é reconhecida no dia da compra contra o cartão; o pagamento da fatura sai numa
  linha só.
- **Transferência entre contas** (inclusive aplicar e resgatar investimento): uma linha, banco de destino contra banco
  de origem.
- **Juros, multa e desconto** da baixa e **rendimento/IR** do investimento: uma linha contra o banco.
- **Centro de custo e projeto** vão nas linhas de despesa e receita (com rateio, a linha se divide).
- Ficam de fora: **folha CLT**, contas **aguardando aprovação**, canceladas e a previsão do cronograma.

Conta sem de-para sai **em branco** no arquivo, e a tela lista o que falta. Com categoria sem conta, a exportação fica
bloqueada até você escolher; o que depende de conta que o contador ainda vai criar (cartão, por exemplo) só avisa.

## Formatos do arquivo

- **Layout do contador** (o padrão): o modelo de importação que o contador mandou. Cinco colunas — `debito`, `credito`, `data`,
  `valor`, `complemento historico` — na aba `Planilha1`, mais **três colunas à direita**: `centro de custo`, `projeto` e `chave de
  acesso`. Débito e crédito saem pela classificação do plano. O complemento tem **até 200 caracteres** e leva a descrição e o
  número do documento; se passar, a descrição é encurtada (…) e o número do documento fica inteiro — a tela avisa quantas
  linhas foram encurtadas. A chave de acesso da NF-e vai na coluna própria. Centro de custo e projeto aparecem só nas linhas
  de receita e despesa (o reconhecimento); a linha do pagamento, que é entre banco e cliente ou fornecedor, fica sem. Sem um
  código definido pelo contador, saem o nome do centro de custo e o código do projeto no SenaHub. Esse formato **não aceita
  conta em branco**: o botão Exportar fica desabilitado e diz quantas linhas faltam.
- **Excel** e **CSV** (genérico): as mesmas partidas, com colunas separadas para documento, chave da NF-e, centro de custo e
  subcentro. Conta sem de-para sai em branco.

## O que ainda depende do contador

- Contas que faltam no plano dele (ISS/INSS a compensar, ISS a recolher, adiantamento de sócio, cartão a pagar,
  aplicações) e a habilitação de centro de custo.
- Que o Alterdata aceite as três colunas extras à direita (`centro de custo`, `projeto` e `chave de acesso`); se recusar, o primeiro teste de
  importação mostra, e tiramos as colunas.
- **Retenções na nota** (ISS, INSS, IRRF…): entram numa próxima etapa.
