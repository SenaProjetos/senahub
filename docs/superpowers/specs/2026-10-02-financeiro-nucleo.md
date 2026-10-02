# Núcleo do Financeiro (N0–N7) — spec

Data: 2026-10-02 · Branch: `feat/financeiro-nucleo` (a partir de `feat/planejador-financeiro`, PR #6)
Plano: auditoria do Financeiro inteiro (defeitos A1–A14, ambiguidades B, lacunas C, permissões D) e
fases N0–N7 do núcleo, antes das telas novas M0–M10. Cada fase acrescenta a sua seção aqui.

## Decisões do dono (2026-10-02)

1. **Alçada: isentas por origem.** Folha CLT, projetistas, ART, serviços, recorrência, parcelas de
   documento e distribuição de lucros não passam pela alçada. Passam o lançamento manual e qualquer
   despesa cujo valor mude depois de criada (N3).
2. **Autoaprovação: só admin** (N3).
3. **Folha do mês M é paga em M+1, até o 5º dia útil**, com **adiantamento de salário** previsto.
4. **DRE por competência = competência pura** (pago e em aberto, no mês a que pertence).
5. **Fechar a folha define o valor; pagar é outro passo.**
6. Retenções na NF ficam para quando o contador responder (com M5).

## N0 — correções urgentes (Opus) — concluída

### A1 · Folha CLT × recorrência (defeito da F6D)

Causa: a recorrência gravava como competência o mês do VENCIMENTO, a folha procurava pelo próprio mês.
A folha de setembro, paga em outubro, não achava a conta e criava outra.

- `CompromissoRecorrente.regraVencimento` (`dia_fixo | dia_util`) e `mesesAteVencimento` (0–2):
  vencimento = N-ésimo dia (fixo, com o último dia do mês como teto) ou N-ésimo dia útil (feriados do RH,
  `lib/calendario-trabalho.ts`; teto no último dia útil) do mês `competência + mesesAteVencimento`.
  `recorrenciaCompetencia` passa a ser a competência de verdade; `competenciaDoVencimento` faz o caminho
  inverso (vínculo manual, candidatos). Dia útil vai do 1º ao 23º (validação do formulário).
- `CompromissoRecorrente.adiantamento`: o compromisso do adiantamento de salário (ex.: dia 20, mesmo
  mês). O fechamento da folha nunca usa a conta dele.
- Fechar a folha mensal (`fecharFolhaNoBanco`, decisão pura em `quitacao.ts`):
  - candidatas: contas da categoria da folha (por `chave`) ligadas à competência, ou sem vínculo vencendo
    entre o dia 1 e 15 de M+1; nunca as de adiantamento;
  - vinculada já paga → `ja_paga` (nada nasce; o aviso mostra a diferença a acertar);
  - vinculada em aberto ganha; uma sem vínculo sozinha é usada; duas sem vínculo → nenhuma (aviso);
    `aguardando_aprovacao` nunca recebe o valor;
  - a escolhida recebe o líquido (centavos), a descrição e a `dataCompetencia`, e o vínculo à recorrência
    se faltava — `updateMany` condicionado a `previsto` (mudou no meio: erro, tente de novo);
  - sem escolhida: nasce uma `previsto`, ligada à recorrência (o gerador não cria o mês de novo),
    vencendo pela regra da recorrência ou no 5º dia útil de M+1;
  - 13º: conta própria, vencendo hoje, sem procurar a da competência.
- Reabrir: nunca apaga nem reverte a conta; com a conta paga é recusado ("estorne o pagamento") — o
  estorno chega no N1.

### A13 · Reabrir a folha apagava o lançamento pago

Resolvido pelo item acima (reabrir não apaga nada e recusa depois de pago).

### A6 · Regenerar parcelas do projeto apagava recebíveis

- `ehParcelaGerada(tags)`: tag `contrato` sem `entrega:` (o faturamento por entrega tem a mesma tag).
- Regenerar e limpar mexem só nas geradas em aberto, por exclusão LÓGICA condicionada a `previsto`.
- Regenerar parcela o que falta: total − recebido pelas parcelas geradas (`saldoAParcelar`, centavos);
  recebido ≥ total é recusado. As parcelas nascem com o cliente do projeto.
- Lógica em `projetos/receita/parcelas-service.ts` (a action só chama), coberta pelo smoke.

### A7 · Serviço terceirizado reescrevia despesa paga

`planoDaDespesaServico` (puro): despesa paga só acompanha descrição e fornecedor; voltar para contratado,
cancelar, tirar o valor ou excluir o serviço é recusado ("estorne o pagamento"); mudar o valor é recusado
com o valor pago na frase. A escrita em aberto é condicionada a não estar paga. Cancelada é reaberta (o
vínculo do serviço segue o mesmo lançamento).

### A11 · Somas com o valor errado

`somaPaga()` (`financeiro/valor-pago.ts`) soma linha a linha `valorEfetivo ?? valor` em centavos.
Aplicada em "Recebido" dos indicadores, no snapshot do painel e no custo real do EVM (o atalho
`_sum.valorEfetivo ?? _sum.valor` ignorava todas as despesas sem valor pago assim que uma tinha). Aging e
inadimplência leem contas em aberto, onde `valor` é o certo.

### A5 · Pagamento de projetista pago duas vezes

- Toda baixa no Financeiro de despesa de projetista marca o `PagamentoProjetista` como pago, com a data da
  baixa (`pagamentoPagoNoFinanceiro`): confirmar, baixar em lote, conciliar, OFX automático, executar lote
  de pagamentos.
- `confirmarDespesaProjetista` não confirma de novo o que já está pago (a folha de projetistas não move a
  data).
- A sincronização da disciplina recusa quando algum lançamento já foi pago e nunca escreve em pago.
- Aprovar a disciplina (validação por arquivo e aprovação em 2 etapas) é `updateMany(status ≠ aprovado)`:
  a segunda aprovação simultânea espera o lock da linha e é recusada.

### Verificação do N0

- Testes puros: recorrência (dia útil, mês seguinte, adiantamento), `quitacao.ts`, `valor-pago`,
  `planoDaDespesaServico`, `ehParcelaGerada`/`saldoAParcelar`.
- `npm run smoke:planejador` (folha: competência julho vence em agosto, fechar não paga, adiantamento
  intocado, já paga, reabrir recusado, 5º dia útil com feriado, vínculo à recorrência, 13º).
- `npm run smoke:financeiro-core` (A6, A5 com corrida real de duas aprovações, A11).
- `scripts/verify-custo-projeto.ts` (A7).

### Deploy

Migração `20261002100000_recorrencia_dia_util` (aditiva: enum + 3 colunas com default). Depois do deploy,
ajustar o compromisso recorrente da folha para **Dia útil 5, vence no mês seguinte** e cadastrar o do
adiantamento, se houver. Os compromissos recorrentes (F6A) ainda não estão em produção, então não há conta
gerada pela regra antiga para corrigir.

## N1 — máquina de situações única (Opus) — concluída

### Regra (`financeiro/lancamentos/transicoes.ts`, pura)

`motivoParaNao(operação, estado)` e `situacaoDepois(operação, estado)` para baixar, conciliar, estornar,
cancelar, reabrir, excluir, editar, aprovar e rejeitar. O estado (`estadoDoLancamento`) vem das colunas:
situação, excluído, conciliado (tem transação), distribuído (tem distribuição), origem (produção, ART,
previsão do cronograma, manual) e rejeitado (tem motivo de rejeição).

| Operação | Pode | Não pode (frase) |
| --- | --- | --- |
| baixar | previsto | em aprovação, pago, cancelado ("reabra antes") |
| conciliar | previsto, pago (G1c) | já conciliado, em aprovação, cancelado |
| estornar | pago | conciliado ("desconcilie antes"), produção (tela de Produção) |
| cancelar | previsto, em aprovação | pago ("estorne antes"), conciliado, produção, ART |
| reabrir | cancelado | produção, ART |
| excluir | o resto | conciliado, receita distribuída, produção, ART |
| editar | o resto | cancelado; conciliado não muda o valor |

Excluído e previsão do cronograma recusam tudo. Reabrir rejeitado volta à aprovação, limpo.

### Onde se aplica

Confirmar, baixar em lote, cancelar, excluir, editar, estornar e reabrir (livro caixa), conciliar com
lançamento (conciliação), aprovar e rejeitar (Aprovações). Toda escrita é `updateMany` condicionada à
situação lida e grava `LancamentoStatusHistorico` — também na criação, na conciliação, no OFX automático
e no lançamento criado da transação.

### Estorno (`estornarNoBanco`)

- Volta a `previsto`, sem `dataConfirmacao` nem `valorEfetivo`.
- Baixa parcial: o resto em aberto sai junto (exclusão lógica). O resto é achado por
  `Lancamento.restanteDeId` (migração `20261002120000_lancamento_restante_de`, gravado pela baixa e pelo
  lote de pagamentos) ou, para restos antigos, por `recorrenciaGrupo = id` + a marca da observação. Resto
  pago recusa; parcial antigo sem resto achado estorna e avisa para conferir.
- Receita distribuída: apaga os movimentos de alocação e a distribuição, com lock das caixinhas; recusa
  se o alocado de alguma ficaria negativo.

### A8 · Desfazer importação

Exclusão lógica do lote, recusada (`motivoParaNaoDesfazer`) se algum lançamento foi conciliado,
distribuído ou alterado depois da importação (`updatedAt` mais de 5 s depois de `createdAt`). Dedup conta
os excluídos à mão e ignora os de lote desfeito.

### Tela

Livro caixa: **Estornar** (pago, com confirmação) e **Reabrir** (cancelado) no menu de contexto e no ⋯;
cancelar pago e estornar/cancelar/excluir conciliado aparecem desabilitados com a frase do servidor.

### Fica para as fases seguintes

- Desconciliar devolvendo ao estado anterior, OFX por conta e sem empate automático: N4.
- Alçada ao mudar valor e por total do parcelamento: N3.
- Produtores (ART, serviço, folha, projetista) gravando histórico na criação: N6/N7.

### Verificação do N1

`transicoes.test.ts`, `acoes.test.ts`, `desfazer.test.ts`; `smoke:financeiro-core` (19 checagens novas,
com corrida de dois estornos); smokes planejador, sync-pagamento, pagamento-fase, previsão, onda1/2/4/5 e
onda3efg verdes. `smoke:onda3` falha em "#geral inclui CLT" (chat, permissão `chat:geral`), fora do
Financeiro.

### Deploy do N1

Migração `20261002120000_lancamento_restante_de` (aditiva). Nada a rodar à mão.
