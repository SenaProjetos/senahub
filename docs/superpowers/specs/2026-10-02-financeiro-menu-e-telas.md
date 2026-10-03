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

## M2 — regras de preenchimento (Sonnet) — concluída

- **Modelo** (migração `20261002240000_regras_de_preenchimento`): `RegraCategorizacao` ganha `condicoes` (JSON),
  `ordem`, `categoriaId` opcional e os campos `centroId`, `formaId`, `projetoId`, `fornecedorId`, `clienteId`, `tags`,
  além de `usos`/`ultimoUsoEm`/`ativo`. As regras antigas viram uma condição "descrição contém <termo>" na ordem em que
  existiam; `termo` segue gravado.
- **Motor puro** `regras/motor.ts` (12 testes): `regraCasa` (condição vazia nunca casa), `primeiraQueCasa`,
  `sugerirPreenchimento` (nunca sobrescreve; contato único por tipo), `sugerirTermo` (ignora PAG/BOLETO/PIX e números).
- **Onde vale:** conciliação do OFX (sugestão + criar lançamento), importação de planilha (só campos vazios) e
  formulário de lançamento novo (ao sair da descrição). Forma e tags só se aplicam onde o formulário/importação as aceita:
  o formulário manual aplica forma, mas não tags.
- **Tela** `/financeiro/regras` (Mais → Regras de preenchimento, gate `gerir` para editar; `ver` lê): lista numerada com
  menu de contexto e `...` (`itensDeRegraDePreenchimento`: Editar, Ver os lançamentos, Duplicar (nasce pausada), Subir
  na ordem, Pausar/Ativar, Excluir), editor Quando/Então com prévia "Casaria com N lançamentos dos últimos 12 meses" e
  diálogo "Criar regra a partir deste lançamento" nos menus do livro caixa, de Contas e de Pagas.
- **Desvio do mock:** reordenar é por **Subir na ordem** no menu, não por arrastar (o texto da tela explica). Arrastar
  entra quando houver biblioteca de arrastar no Financeiro; não bloqueia o uso.
- **Verificação:** `motor.test.ts`, `acoes.test.ts`, `nav.test.ts`, `smoke:financeiro-core` (9 checagens novas: primeira
  que casa, nunca sobrescreve, pausada, prévia, conciliação, importação, uso contado).

## M8 — transferência pela tela, data do saldo inicial, corrigir pagamento (Sonnet) — concluída

- **Transferência** (`financeiro/transferencias/`): par de lançamentos (`transferenciaId`) nas categorias de natureza
  transferência; dialog "Transferir entre contas" no livro caixa e no extrato; menu de contexto da perna oferece as ações
  do par (`itensDaTransferencia`). Estado puro em `calculo.ts` (`motivoParaNaoMexer`), gravação atômica das duas pernas em
  `service.ts`. A máquina de situações ganhou `origem = "transferencia"`: perna solta recusa baixar, estornar, cancelar,
  excluir, editar e corrigir (conciliar continua valendo).
- **Data do saldo inicial** (migração `20261002280000_saldo_inicial_data`, coluna `saldoInicialEm`, nula por padrão =
  comportamento de sempre): campo "Saldo vale em" em Cadastros → Contas; honrado por `saldoBase`, `saldoDoSistema` e Extrato.
- **Corrigir pagamento** (`lancamentos/corrigir-pagamento.ts`): conta, forma e data de um pago, sem estornar; menu do livro
  caixa, de Pagas e do Extrato; regras de conciliado, mês fechado, data futura e produção.
- **Fica de fora:** corrigir o VALOR de um pago (segue pelo estorno + nova baixa, ou pelo formulário de edição quando permitido) e
  transferência entre moedas.
- **Verificação:** `calculo.test.ts`, `acoes.test.ts` (transferência), `transicoes.test.ts`, `saldo-base.test.ts` e
  `smoke:financeiro-core` (25 checagens novas: saldo com e sem data, par de pernas, perna solta recusada, editar, estornar,
  baixar, conciliada, excluir, agendada, corrigir conta/forma/data, conciliado, futura, perna de transferência).

## M9 — avisos (Sonnet) — concluída

- **Cobrança ao cliente** (e-mail): antes (1–15 dias, padrão 3), no dia e no dia seguinte, ligados em Configurações → Avisos de vencimento.
  Padrão preserva o que existia (só o D+1); antes e no dia vêm DESLIGADOS por serem e-mail para fora. Novo modelo de e-mail
  `lembrete-vencimento`; o D+1 segue em `lembrete-pagamento`.
- **Contas a pagar vencendo** (sino): D-3 e D-1, uma notificação por pessoa e por dia, para quem lançou a conta (ou quem gere,
  se o autor não vê o financeiro); fatura de cartão conta como UMA conta; categoria de preferência `conta_a_pagar`.
- **Sem duplicar**: migração `20261002300000_avisos_financeiros` (`AvisoFinanceiroEnviado`, chave única com o vencimento).
  A reserva vem antes do envio e é devolvida se o e-mail não saiu. O sino interno D+1 dos gestores também reserva.
- **Resumo semanal**: já excluía transferência (`SEM_TRANSFERENCIA`); conferido, sem mudança.
- **Decisão pendente do dono:** ligar os e-mails de antes e no dia, e quantos dias antes (padrão 3).
- **Verificação:** `regras.test.ts` e `smoke:financeiro-core` (13 checagens novas: padrão, repetição, antes/no dia, sem e-mail,
  transferência, falha libera a reserva, vencimento novo, D-1/D-3 agrupados, categoria, desligado).

## M4 — investimentos (Opus) — concluída

Contrato próprio em `2026-10-02-financeiro-investimentos.md`. Migração `20261002320000_investimentos` (`Investimento`,
enums de tipo e liquidez, categorias `receita_rendimento_aplicacao` e `despesa_ir_aplicacao` por chave). Telas
`/financeiro/investimentos` e `/financeiro/investimentos/[id]` com menus de contexto; Balanço com a linha Investimentos;
vencimento no planejador. Verificação: `calculo.test.ts` (números do mock: 80.000 + 3.920 − 784 = 83.136, 200 dias → 20%),
`acoes.test.ts` e `smoke:financeiro-core` (22 checagens novas: caixa, DRE, carteira, IR, planejador, Balanço, resgates,
arquivar/excluir, isento, opções de lançamento).

## M7 — baixa completa (Opus) — concluída, sem retenções

- Escopo seguido (proposta ao dono em 2026-10-02, padrão aceito no "continue"): juros, multa e desconto separados na baixa e
  nº do documento + chave da NF no lançamento. **Retenções na NF ficam para quando o contador responder** (decisão 5).
- Contabilização: categorias próprias (juros pagos = despesa; desconto obtido = receita; juros recebidos = receita;
  desconto concedido = despesa), criadas por chave na migração `20261002340000_baixa_completa`. Se o contador preferir
  abater do próprio título, muda só o `planejarBaixa` (puro).
- O caso B2 da auditoria (`valorEfetivo` com três papéis) acaba: parcial = `principal`, acréscimo = juros/multa, desconto
  = desconto. Legado `valorEfetivo > valor` vira juros.
- Achados no caminho: "Recebido" (KPI de Resultados e foto diária do painel) contava rendimento lançado na conta de um
  investimento (M4) como dinheiro que entrou — agora fica de fora; o smoke usava o "hoje" em UTC (depois das 21h em São
  Paulo era amanhã) — agora usa `diaDeSaoPaulo()`.
- Fora: conciliação do OFX casando uma baixa com juros/desconto (o banco mostra o líquido, o título tem o valor cheio):
  segue manual.
- Verificação: `baixa.test.ts` (11), descritores, `parcial.test.ts` (guarda atualizada) e `smoke:financeiro-core` (+14).

## M6 — indicadores, relatório por dimensão, orçamento por centro, atalho Clientes (Sonnet) — concluída

- **Escolha de fase:** M5 (integração contábil) depende do formato do sistema do contador, ainda sem resposta; a ordem do
  plano previa "senão M6" — seguida sem nova confirmação do dono (trabalho faseado em andamento).
- **Indicadores** (`/financeiro/indicadores`, `financeiro/relatorios/indicadores-gerenciais.ts` puro + `queries.ts`):
  8 cartões (margem líquida, resultado operacional, dias de caixa, inadimplência 12 meses, prazo médio de recebimento e
  de pagamento, ponto de equilíbrio, receita por projeto ativo) montados a partir de peças já existentes — `linhasDREPeriodo`
  (mês atual + anterior, para o delta de margem), `baseDoPlanejador`/`diasDeCaixa`, `agingReport("receita")`. Ponto de
  equilíbrio e prazo médio são simplificações documentadas (ponto de equilíbrio = despesa do mês, sem separar custo fixo
  de variável; prazo médio é média simples em dias, não ponderada pelo valor). Tabela de evolução dos últimos 6 meses
  (`evolucaoReceitaDespesaMeses`, janela ROLANTE via `somarMesesUtc` — diferente da `serieMensalResultado(ano)` por ano
  civil já existente) com gráfico de barras e menu de contexto por mês: **Ver DRE do mês**, **Comparar com** (mostra a
  diferença na própria tela, sem navegar) e **Exportar** (reaproveita a rota de export do DRE).
- **Relatório por dimensão** (`/financeiro/relatorio-dimensao`, `relatorioPorDimensao` em `queries.ts`): agrupa
  lançamentos confirmados do período por categoria, centro de custo, contato (fornecedor/cliente), projeto ou tag; tag é
  o único caso em que um lançamento pode entrar em mais de uma linha (soma pode passar do total — aviso na tela). Export
  Excel própria (`/api/financeiro/relatorios/dimensao/xlsx`). Menu de contexto por linha (`itensDaLinhaDeDimensao`) só
  liga de verdade para centro e projeto: o filtro de categoria do livro caixa combina com o CÓDIGO de nível 1, não com
  um id de categoria qualquer, e não existe filtro por contato — um link que parecesse funcionar e desse resultado errado
  seria pior que não ter o link, então o item fica desabilitado com `MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA` (mesma frase no
  menu e no `…`).
- **Orçamento por centro de custo** (`orcamentoPorCentro` em `queries.ts`, aba nova em `orcamento-view.tsx`): leitura
  previsto × realizado por centro, só despesas. Decisão de escopo: `OrcamentoItem` não tem `centroId` — criar a coluna
  para uma funcionalidade que a auditoria original marcou "baixa prioridade" não valeu a migração; o planejado continua
  só por categoria, e a aba de centro é read-only.
- **Atalho de Clientes**: item novo no menu Mais do Financeiro (`/clientes`, gate `ver`).
- **Achado no caminho:** a trilha (breadcrumb) de `/financeiro/relatorio-dimensao` saía "Relatorio dimensao" (sem acento,
  derivado cru do segmento da URL) — igual ao caso já resolvido para `/financeiro/cenarios`/`distribuicao`; entrada nova
  em `ROTULO_POR_ROTA` (`components/shell/breadcrumb.tsx`).
- **Sem smoke novo:** M6 é só leitura (nenhuma mutação de dinheiro) — coberto por `indicadores-gerenciais.test.ts` (11
  testes, números do mock) e `acoes.test.ts` (4 testes), sem o mesmo risco das fases que escrevem lançamento.
- **Verificação:** tsc (app e server), `npm run lint` sem `--quiet`, suíte completa (5677, com `nav.test.ts` atualizado
  para os 2 itens novos de Resultados e o atalho de Clientes em Mais), `smoke:financeiro-core`, build de produção, Chrome
  em 1366 (menu aberto) e 390 nas 3 telas (Indicadores, Relatório por dimensão, Orçamento com a aba nova).

## M10 — rateio, comprovante obrigatório na baixa, duplicar lançamento (Sonnet) — concluída

- **Rateio** (migração `20261002360000_financeiro_m10_rateio`, tabela `lancamento_rateio`): divide um lançamento entre centros
  e/ou projetos por percentual. Só o Relatório por dimensão (centro e projeto) usa; o centro/projeto do cadastro continua o
  principal no livro caixa, aging e EVM. Escopo deliberado: não replicou o rateio para DRE/aging para não tocar dezenas de leitores.
- **Comprovante obrigatório na baixa** (Configurações → Comprovante na baixa, `ConfigFinanceiro.comprovanteObrigatorioNaBaixa`):
  vale para baixa única, em lote e Pagamentos em lote; produtores e conciliação OFX isentos por origem (mesma regra da alçada, N3).
- **Duplicar lançamento**: menu de contexto abre o formulário de criação pré-preenchido (sem caminho server novo).
- **Verificação:** `rateio.test.ts` (9), `validacao.test.ts` (+3), `acoes.test.ts` (+1 + ordem atualizada), `smoke:financeiro-core`
  (bloco M10: soma, pro-rata, remoção, comprovante desligado/ligado, baixa recusada sem anexo), Chrome 1366 (menu com as duas
  ações, diálogo de rateio, duplicar pré-preenchido, Configurações) e 390 sem rolagem lateral.
