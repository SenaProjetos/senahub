# Financeiro: menu novo e telas M0–M10 — spec

Data: 2026-10-02 · Branch: `feat/financeiro-nucleo` · Mock aprovado: canvas "Financeiro — menu e novas telas"
(`claude.ai/artifact/GjR9EYC2HCt91NjFFCXTFm`, v6, conferido no Chrome). O mock é o contrato visual de cada fase.

## Decisões do dono (2026-10-02)

1. **Menu:** como no mock — 3 links diretos (Visão geral, Lançamentos, Contas) e 4 menus (Movimentações,
   Planejamento, Resultados, Mais).
2. **Cartão pessoal (M3):** híbrido — despesa na DRE na data da compra (sem caixa) + reembolso ao sócio; os
   reembolsos se acumulam numa "fatura do sócio" com vencimento, pagos juntos ou um a um. O mock do cartão pessoal
   precisa ser revisto para isso antes da M3.
3. **Investimentos (M4):** carteira detalhada como no mock; valor atualizado à mão ou pelo extrato, sem cotação.
4. **Ordem:** M0 → M2 (regras de preenchimento) → M3 → M8 → M9 → M4 → M7 → M5 → M6 → M10.
5. **Toda tela com lista nasce com menu de contexto** (botão direito, ADR-0002), desenhado aberto no mock.

## M0 — menu, Pagas e recebidas, Extrato por conta (Sonnet) — concluída

- **Barra** (`financeiro/nav.ts` + `financeiro-nav.tsx`): `principais` + `movimentacoes` + `planejamento` +
  `resultados` + `mais`, cada item com o gate da página e uma linha de descrição; itens "novo" marcados; selos de
  pendência em Contas (vencidas), Movimentações→Conciliação e Mais→Aprovações. Só entram no menu telas que existem
  (teste confere cada `href` → `page.tsx`); Cartões, Investimentos, Indicadores, Integração contábil e Regras de
  preenchimento entram nas fases delas. A faixa de abas dos Resultados continua com 5 abas (o Orçamento mora em
  Planejamento).
- **Contas** (`/financeiro/contas`): abas **Em aberto** | **Pagas e recebidas** (`?situacao=pagas&mes=YYYY-MM`).
  Pagas: `dadosPagas` (realizado do mês pela data do pagamento, sem transferência), filtros de tipo, mês, busca e
  conciliação, totais pelo valor pago, menu de contexto `itensDePaga` (detalhes, ver no extrato, copiar, estornar —
  desabilitado com a frase do servidor quando conciliado ou de produção).
- **Extrato por conta** (`/financeiro/extrato?conta=&mes=`): `extrato/calculo.ts` (puro, centavos): saldo inicial da
  conta + realizado antes do mês; entradas, saídas e saldo final fecham; transferência conta, sem conta fica fora.
  Conferência com o banco: `ExtratoBancario.saldoBanco/saldoBancoEm` (migração `20261002220000_extrato_saldo_banco`),
  gravados pela importação do OFX. Menu de contexto `itensDeLinhaDoExtrato`.
- **Livro caixa:** escolher contas não traz mais lançamento **sem conta** (caixa própria "Sem conta"); **filtro por tag**.
- **Rótulo:** "Importar extrato" → **Importar planilha** (menu, título da tela, manual).
- Fica para a M8: corrigir conta/forma/data de um pago e a transferência entre contas pela tela (itens do mock, não
  da M0).
- Verificação: `nav.test.ts`, `acoes-paga.test.ts`, `extrato/*.test.ts`, `smoke:financeiro-core` (7 checagens novas) e
  as telas no Chrome em produção (1366 com menu aberto e 390 sem rolagem lateral). Achado: `sr-only` em `<th>` sem
  `relative` escapa do `overflow-x-auto` (ver memória sr-only-escapa-rolagem).
