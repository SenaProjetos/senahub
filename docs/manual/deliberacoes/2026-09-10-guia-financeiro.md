---
titulo: Deliberação — Guia de uso do Financeiro (F2)
descricao: Ata sobre o guia de formação do Financeiro e o alcance real do seletor Caixa/Competência.
resumo: Guia do Financeiro publicado; a conferência mostrou que a base de competência alimenta um único relatório.
tags: [deliberação, conselho, financeiro, guia de uso, competência, caixa, alçada]
palavras-chave: [deliberação, ata, guia de uso, financeiro, competência, regime de caixa, alçada, aging, conciliação]
sinonimos: [ata técnica]
---

# Deliberação — Guia de uso do Financeiro (F2)

- **Data:** 2026-09-10
- **Funcionalidades:** `/guias/financeiro`, botão "Guia de uso" nas duas ramificações de `/financeiro`.
- **Plano:** [`2026-09-09-guias-de-uso-in-app.md`](../../superpowers/plans/2026-09-09-guias-de-uso-in-app.md) (F2)

## Participantes
Presidente, Iniciante, Treinamento, Financeiro, Backend, Segurança, Revisor Técnico.

## Contexto

Terceira fase do plano de Guias de uso. Financeiro foi escolhido pela densidade de jargão: aging,
alçada, conciliação, DRE, DFC, regime de caixa × competência.

## Descobertas (inspeção de código)

- **O seletor Caixa/Competência alimenta um relatório só.** `/financeiro/relatorios` expõe um
  `Select` com "Caixa" e "Competência", que chega a `relatorioDREComparativo(de, ate, base)` e daí a
  `linhasDREPeriodo` — a **única** função do módulo que lê `dataCompetencia`. `relatorioDRE`, o
  fluxo de caixa, o DFC, o balanço, a série mensal de resultado e a rentabilidade filtram por
  `dataConfirmacao`, sem parâmetro de base. O campo **Data de competência** do formulário de
  lançamento é gravado e ignorado por todo o resto.
- **`devePassarPorAprovacao` tem duas leituras contraintuitivas**, ambas corretas em código:
  `limite > 0` faz o **zero desligar** a alçada (em vez de exigir aprovação de tudo), e
  `valor >= limite` faz o valor exatamente igual ao limite travar.
- **Só `confirmado` entra no resultado.** O enum `StatusLancamento` documenta isso na própria
  definição (`confirmado // pago/recebido (entra no caixa e na DRE)`), e as queries confirmam:
  previsto aparece na projeção de caixa (por `vencimento`) e no aging, em nenhum relatório de
  resultado.
- **Aging só olha previstos**, por `vencimento ?? data`. Confirmar tira a conta do aging, e o atraso
  histórico não fica registrado ali.
- **O fechamento são duas contas independentes:** `resultadoBruto` é receita menos despesa
  confirmadas; ISS/INSS/IR e desconto incidem **só sobre a folha bruta** dos projetistas.
- `parseOfx` extrai o `FITID` de cada transação, o que sustenta a promessa de reimportação sem
  duplicar.

## Opiniões dos Especialistas

- **Financeiro:** o descompasso do seletor de competência é o achado mais caro da fase — alguém pode
  ter preenchido o campo por meses achando que os relatórios mudariam.
- **Iniciante:** "previsto não é dinheiro" precisa ser a regra do topo. É a primeira coisa que
  confunde quem lança uma conta e não vê o resultado mudar.
- **Segurança / Backend:** o botão do guia **não** pode usar `podeVerFinanceiro` como gate. Quem cai
  no "Meu extrato" — o projetista PJ — é justamente o leitor que a N5 quer alcançar; e `cliente`
  também renderiza essa tela, então o eixo tem de ser `tipoEfetivo`.
- **Treinamento:** manter a mecânica de soft delete fora do guia. O fato do usuário é "excluído some
  da tela mas continua no histórico"; o resto é manual.

## Discussão

Consenso em documentar F2-1 como armadilha e registrá-la como divergência aberta, sem tentar
resolvê-la na fase de documentação — estender a base de competência aos demais relatórios é decisão
de produto com efeito em número que a diretoria lê.

Sobre o botão: a solução de colocá-lo nas **duas** ramificações da página, com um único sinal
calculado antes do fork, ficou mais simples que duplicar a decisão — e é o primeiro caso em que o
precedente de F1-2 foi aplicado antes de virar defeito, não depois.

## Divergências

Nenhuma. Registrada a observação de **Financeiro** de que F2-1 deve virar issue assim que o `gh`
estiver autenticado — hoje `gh auth status` falha e nenhuma issue pôde ser aberta.

## Decisão Final

- Publicado o guia em `/guias/financeiro` (`components/financeiro/guia-financeiro-view.tsx`):
  13 termos, 5 etapas (Prever → Aprovar → Realizar → Conciliar → Fechar), 6 armadilhas, 7 dúvidas.
- `lib/guias.ts`: setor `financeiro` passa a `estado: "pronto"`; entrada no `VIEWS` de `[setor]`.
- Botão "Guia de uso" nas duas ramificações de `/financeiro`, atrás de `tipoEfetivo`.
- Stub `docs/manual/financeiro/guia-iniciante.md` + entrada no `search-index.json`.
- Divergências F2-1, F2-2 e F2-3 registradas na §12 do plano.

## Melhorias Sugeridas

- Decidir o destino de F2-1: estender a base de competência, restringir o campo, ou rotulá-lo
  dizendo onde vale.
- A tela de configuração do limite de alçada poderia dizer que zero desliga a trava (F2-2).

## Pendências

- F2-1 e F2-2 seguem abertas (ver §12 do plano).
- Issues de F0-1, F1-1 e F2-1 pendentes de `gh auth login`.
