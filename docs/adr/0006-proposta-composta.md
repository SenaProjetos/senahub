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

1. **Estúdio de Documentos.** Já tem tokens, condições e blocos, mas é um gerador por bandas de
   altura fixa: texto de tamanho variável é cortado (`doc-render.tsx`, `overflow: hidden`). Servir às
   propostas exigiria mudar o motor e a paginação do Estúdio, que outros documentos usam. Rejeitado
   para esta fase; o layout da proposta é um só e muda raramente, então um template de fluxo (HTML
   que pagina sozinho) é mais simples e seguro.
2. **Word gerado pelo sistema, finalizado à mão.** Rejeitado pelo dono: o que é editado no Word volta
   a poder divergir dos números.
3. **Só escolher cláusulas, sem editar.** Rejeitado pelo dono: toda variação pontual viraria pedido de
   cláusula nova.

## Consequências

- O editor legado (`proposta-editor.tsx`) e a proposta externa (ADR-0005) continuam funcionando; a
  composta é um terceiro formato, e passa a ser o caminho padrão para propostas novas.
- O aceite não muda: a proposta composta tem itens por disciplina, dos quais o projeto nasce.
- Dados da empresa (razão social, CNPJ, endereço, telefone, e-mail, **conta bancária**, assinatura)
  saem de um lugar só (`empresa.dados`); nenhuma proposta os carrega copiados.
- Cada versão guarda o documento inteiro (snapshot) e o PDF enviado; comparar versões passa a mostrar
  o que mudou — hoje, quase sempre, o plano de pagamento.

Plano de execução: [`docs/superpowers/specs/2026-09-19-proposta-composta.md`](../superpowers/specs/2026-09-19-proposta-composta.md).
