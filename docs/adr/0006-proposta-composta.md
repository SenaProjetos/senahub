---
status: proposed
date: 2026-09-19
---

# ADR-0006 — Proposta composta: montada no sistema a partir de modelo, cláusulas e plano de pagamento calculado

A proposta comercial passa a ser **montada no sistema** e o PDF sai dele — não é mais escrita no
Word. Ela é composta de três peças estruturadas e só o texto é derivado delas:

1. **Modelo de proposta** (por família: projetos multidisciplinares, estrutural, laudo, aprovação no
   Corpo de Bombeiros, cliente corporativo) — quais seções, em que ordem, que cláusulas vêm por
   padrão, plano de pagamento sugerido e validade.
2. **Biblioteca de cláusulas** — parágrafos por seção (escopo por disciplina, não inclusos,
   competências, alterações…), com tokens (`[Cidade]`, `[UF]`, `[AreaM2]`…) e, quando a norma
   depende do estado, uma variante por UF. **Só a gestão mantém** a biblioteca e os modelos.
3. **Plano de pagamento estruturado** — marcos com percentual; o sistema **calcula** o valor e o
   extenso de cada parcela e **recusa** percentuais que não somam 100%.

Dentro de uma proposta, o texto de cada cláusula **pode ser editado**; a edição fica só naquela
proposta (é copiada para ela) e não altera a biblioteca.

## Contexto

A análise das 163 propostas reais (`docs/superpowers/specs/2026-09-19-propostas-analise.md`) mostrou
que o documento é o mesmo esqueleto de 10 seções em quase todas, que metade dele é texto padrão, e
que os erros enviados a clientes são todos de montagem manual: plano de pagamento cobrando R$ 4.750
a mais que o total, percentuais que somam 105%/110%, 12 valores por extenso errados (vários com o
número atualizado e o extenso da proposta copiada), norma de incêndio de Pernambuco em obra de
Alagoas, e dois e-mails e duas contas bancárias circulando.

Decisões do dono (2026-09-19): PDF gerado pelo sistema; biblioteca só pela gestão; texto editável
por proposta; **com link público**.

## Decisão sobre a página pública (relação com o ADR-21 §6)

O ADR-21 §6 congelou a renderização de `/a/proposta/[token]`, porque o PDF é impresso dela ao vivo
e mudá-la reescreveria o PDF de propostas já enviadas. A proposta composta **reusa a mesma rota**,
com um ramo novo escolhido por `Proposta.formato = COMPOSTA` — valor que nenhuma proposta anterior
tem. O ramo antigo não muda uma linha; por isso o congelamento continua valendo para todas as
propostas existentes. Reusar a rota (em vez de criar outra) mantém de graça o que já funciona: o
arquivamento do PDF por versão no envio (F5.13), a contagem de visualizações e o token já existente.

## Alternativas consideradas

1. **Template de fluxo escrito em código, só para a proposta.** Era a primeira escolha, revista
   pelo dono em 2026-09-19 com o argumento de que contratos e memoriais vêm depois e cairiam no
   mesmo problema. Rejeitada: o template seria refeito na primeira vez que outro documento de texto
   corrido precisasse do mesmo.
2. **Word gerado pelo sistema, finalizado à mão.** Rejeitado pelo dono: o que é editado no Word volta
   a poder divergir dos números.
3. **Só escolher cláusulas, sem editar.** Rejeitado pelo dono: toda variação pontual viraria pedido de
   cláusula nova.

## O Estúdio passa a ser o motor (decidido em 2026-09-19)

O Estúdio já renderiza em HTML, com as faixas empilhadas e a paginação feita pelo navegador. O que
impede texto de tamanho variável são duas escolhas de posicionamento: a faixa tem altura fixa e o
parágrafo é desenhado com `height: 100%; overflow: hidden` (`elemento-view.tsx`).

**O defeito já existe hoje, fora das propostas:** os quatro modelos de contrato de fábrica
(`modelos-fabrica-contrato.ts`) estimam a altura de cada parágrafo **contando caracteres**
(`alturaEstimada()`). Quando um token resolve mais longo que o chute — cláusula adicional, razão
social comprida —, o texto é cortado em silêncio num documento assinável.

Decisão: **faixa em fluxo**, opção por faixa (`banda.fluxo`), desligada por padrão. Marcada, a faixa
cresce com o conteúdo e seus elementos são empilhados na ordem do desenho, em vez de posicionados em
caixas fixas. Nenhum modelo existente muda de saída, porque nenhum tem a opção ligada. Proposta,
contrato, memorial e laudo passam a usar o mesmo motor.

Limite aceito: o editor continua desenhando caixas fixas, então a **pré-visualização passa a ser a
fonte da verdade** para faixas em fluxo — o editor avisa isso na própria faixa.

## Consequências

- O editor legado (`proposta-editor.tsx`) e a proposta externa (ADR-0005) continuam funcionando; a
  composta é um terceiro formato, e passa a ser o caminho padrão para propostas novas.
- O aceite não muda: a proposta composta tem itens por disciplina, dos quais o projeto nasce.
- Dados da empresa (razão social, CNPJ, endereço, telefone, e-mail, **conta bancária**, assinatura)
  saem de um lugar só (`empresa.dados`); nenhuma proposta os carrega copiados.
- Cada versão guarda o documento inteiro (snapshot) e o PDF enviado; comparar versões passa a mostrar
  o que mudou — hoje, quase sempre, o plano de pagamento.

Plano de execução: [`docs/superpowers/specs/2026-09-19-proposta-composta.md`](../superpowers/specs/2026-09-19-proposta-composta.md).
