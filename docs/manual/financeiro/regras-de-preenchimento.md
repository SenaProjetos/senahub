---
titulo: Regras de preenchimento
descricao: Regras que preenchem categoria, centro de custo, contato, forma de pagamento, projeto e tags a partir da descrição, do valor ou da conta do lançamento.
resumo: Cadastre "quando a descrição contiver CREA, preencher a categoria ART" uma vez e o sistema aplica na conciliação do extrato, na importação de planilha e ao lançar. A primeira regra da lista que casa vale, e nenhuma regra sobrescreve o que você já escolheu.
tags: [financeiro, regras, preenchimento, categoria, conciliação, importação, automação]
palavras-chave: [regras de preenchimento, regra de categorização, preencher categoria, preencher sozinho, criar regra a partir do lançamento, ordem das regras, regra pausada]
sinonimos: [categorização automática, regra automática, autopreenchimento, preenchimento automático]
---

# Regras de preenchimento

## Objetivo

Parar de escolher a mesma categoria, o mesmo centro de custo e o mesmo fornecedor toda vez que aparece o mesmo tipo
de lançamento. Você descreve **quando** (a descrição contém um texto, o valor passa de um número, a conta é tal) e
**o que preencher**; o sistema faz o resto.

## Como acessar

- Menu → **Financeiro** → **Mais** → **Regras de preenchimento** (`/financeiro/regras`).
- Ver a lista exige `financeiro:ver`. Criar, editar, ordenar, pausar e excluir exigem `financeiro:gerir`.

## Como uma regra funciona

Uma regra tem duas partes:

- **Quando** — de 1 a 5 condições, e **todas** precisam bater. Cada condição compara um campo:
  **Descrição** (contém, é igual a, começa com — sem diferenciar maiúscula nem acento), **Tipo** (entrada ou saída),
  **Valor** (igual, maior ou menor que) ou **Conta**.
- **Então preencher** — categoria, centro de custo, contato (fornecedor numa saída, cliente numa entrada),
  forma de pagamento, projeto e tags. Escolha ao menos um.

Duas garantias:

1. **A primeira regra da lista que casa é a que vale.** As seguintes não completam o que sobrou. A posição de cada
   regra aparece à esquerda; use **Subir na ordem** no menu da regra para dar prioridade a ela.
2. **Nunca sobrescreve.** A regra só preenche o que está **vazio**. Se você já escolheu a categoria, ela fica; as tags
   da regra apenas **somam** as que faltam.

## Onde as regras valem

| Onde | O que acontece |
| --- | --- |
| **Conciliação do extrato (OFX)** | A categoria da regra vem sugerida na transação; ao **criar o lançamento** a partir dela, centro, contato, forma, projeto e tags da regra também entram. |
| **Importação de planilha** | O que a planilha deixou vazio (centro, contato, forma, projeto, tags) é completado. A categoria que veio na planilha não é trocada. Linhas de transferência entre contas ficam fora. |
| **Lançar à mão** | Ao sair do campo **Descrição** de um lançamento novo, o formulário preenche o que estiver vazio e avisa "Uma regra preencheu …". Você pode trocar. |

> Regra nova só vale **daqui para frente**: lançamentos antigos não mudam.

## Criar e editar

1. **Nova regra** (ou **Editar** no menu de uma regra).
2. Monte as condições em **Quando**; use **+ condição** para acrescentar outra.
3. Escolha o que preencher em **Então preencher**. "Não preencher" deixa o campo de fora.
4. A faixa cinza mostra **"Casaria com N lançamentos dos últimos 12 meses"**; **Ver os N** abre a lista. É só uma
   prévia: nada é alterado.
5. **Salvar regra**. Desmarque **Regra ativa** para guardá-la sem usar.

### Criar a regra a partir de um lançamento

No menu de um lançamento (botão direito ou `...`) no livro caixa, em Contas ou em Pagas e recebidas, escolha
**Criar regra a partir deste lançamento…**. O sistema sugere o trecho da descrição que identifica o lançamento
(sem "PAG", "BOLETO", "PIX" e sem números) e você marca se a regra preenche a **categoria** e/ou o **centro de custo
e o projeto** daquele lançamento. A regra entra no fim da lista.

## Menu da regra (botão direito ou `...`)

**Editar**, **Ver os lançamentos que casam**, **Duplicar** (a cópia nasce pausada, para você ajustar),
**Subir na ordem**, **Pausar / Ativar** e **Excluir…**. Excluir pede confirmação e não altera lançamentos já
preenchidos.

## Perguntas frequentes

**Duas regras casam com o mesmo lançamento. Qual vale?** A que está mais acima na lista. Use **Subir na ordem**.

**A regra trocou uma categoria que eu tinha escolhido?** Não troca: regra só preenche campo vazio.

**Uma regra deixou de aparecer na conciliação.** Veja se ela não está **Pausada** e se as condições (tipo, valor e
conta) ainda batem com a transação do banco.

**As regras antigas (termo → categoria) sumiram?** Não: viraram regras com a condição "descrição contém …", na ordem
em que existiam.
