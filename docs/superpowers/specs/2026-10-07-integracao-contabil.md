# Integração contábil (M5) e retenções na NF

**Data:** 2026-10-07 · **Branch:** `feat/integracao-contabil` (de `dev`) · **Status:** C0, C2 e C3 feitas; C1 só no que o mock aprovou (ver §12); C4 e C5 aguardam o dono e o contador

Fecha as duas pendências que o plano do Financeiro deixou para o contador: a fase **M5 (integração contábil)** e as
**retenções na NF** (decisão 5 de 2026-10-02). Base: as respostas do contador (GAMA CONTABIL, 2026-10-05 e 2026-10-07),
o plano de contas dele (`docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv`, transcrito do PDF enviado) e a
prancha "Integração contábil" do mock aprovado (artifact `GjR9EYC2HCt91NjFFCXTFm`, página Gestão e resultados).

## 1. O que o contador decidiu

| Tema | Resposta | Consequência |
|---|---|---|
| Sistema | Alterdata, importa Excel/TXT | Exportação genérica agora; layout Alterdata quando vier o exemplo (§9, C5) |
| Lançamento | Partida dobrada, regime de competência | Cada linha do arquivo tem conta de débito e de crédito |
| Títulos | **Dois lançamentos**: reconhecimento e baixa | Conta a pagar/receber gera uma linha na competência e outra no pagamento |
| Regime | Simples Nacional | — |
| Retenção sofrida (cliente retém na nossa NF) | Retido vai para **ISS/INSS a compensar**, no ativo | Recebemos o líquido; o título fecha inteiro |
| Retenção feita (nós retemos do fornecedor) | **Conta separada de imposto a recolher** | Gera conta a pagar do imposto: ISS dia 10, demais dia 15 do mês seguinte |
| Juros, multa, desconto | Dentro da receita/despesa financeira | M7 fica igual; só o de-para aponta para as contas financeiras |
| Cartão pessoal de sócio | Adiantamento de sócio | Contrapartida da compra é a conta do sócio, não fornecedor |
| Investimentos | Valor de custo; rendimento **todo mês pelo extrato** | M4 já faz assim |
| Folha CLT | **Não exportar** — o contador processa a folha | Categoria da folha fica fora do arquivo |
| Frequência | Mensal, só mês fechado; nós fechamos, eles conferem | N5 já trava o mês |
| NF | Número e chave de acesso no lançamento | M7 já tem `numeroDocumento`/`chaveNfe` |
| Centro de custo | Centro e projeto **em hierarquia** | Linha leva centro e subcentro (projeto) |

## 2. O plano de contas do contador

- Formato Alterdata: classificação (`1.1.1.02.0004`), nome e **código reduzido** (o número entre parênteses, `3941`).
- **A classificação se repete** (`2.1.3.01.0003` = PIS, COFINS, ICMS, IPI e IE). Só o reduzido é único → o sistema
  guarda e exporta o **reduzido**; a classificação é só para leitura na tela.
- Só conta **analítica** (Tipo `A`) recebe lançamento; sintética (`S`) é grupo.
- Há uma conta por cliente (`1.1.2.01.xxxx`) e "Clientes Diversos" (1659); fornecedores quase todos em "Fornecedores
  Diversos" (2142).
- **Faltam** contas para o que o próprio contador pediu: ISS a compensar, INSS a compensar, ISS a recolher, adiantamento
  de sócio, cartão de crédito a pagar, analíticas de aplicação (1.1.4 só tem sintéticas) e IR sobre aplicação.
- **Nenhuma conta tem C.Cus = S**: centro de custo não está habilitado. Sem isso a hierarquia não entra no Alterdata.

As faltas viram **pendências do de-para** (o arquivo sai com a conta em branco e o aviso, como no mock) até o contador
criar as contas e mandar o plano de novo (re-importar, §4.1).

## 3. Princípios

1. **O sistema não vira contabilidade.** Não há razão, balancete nem saldo contábil gravado. As partidas são
   **derivadas** dos lançamentos do mês fechado por uma função pura, a cada exportação. Quem escritura é o Alterdata.
2. **Uma regra para cada evento** (§5), testada sem banco, como o motor do planejador e o de baixa.
3. **Mês fechado = arquivo estável.** N5 trava valor, categoria, datas, conta, centro e projeto; o que ainda muda num
   mês fechado (descrição, contato, documento) é detectado pelo hash da exportação (§6).
4. **De-para é dado, não código.** Nenhuma conta contábil fica fixa no código; a migração só sugere.
5. **Centavos inteiros**, datas `YYYY-MM-DD` no motor (mesma regra do `liquidez/`).

## 4. Modelo de dados

### 4.1 Plano do contador — `ContaContabil`

```prisma
model ContaContabil {
  id                String  @id @default(cuid())
  reduzido          Int     @unique   // código reduzido do Alterdata (único)
  classificacao     String            // "1.1.1.02.0004" — pode repetir
  nome              String
  analitica         Boolean           // Tipo A
  natureza          String            // "D" | "C" | "I"
  aceitaCentroCusto Boolean @default(false)
  ativa             Boolean @default(true) // saiu do último plano importado → false (nunca apaga)
  @@map("conta_contabil")
}
```

Importação: CSV/XLSX com `classificacao;reduzido;nome;tipo;natureza;centro_custo` (o CSV deste spec é a carga
inicial). Re-importar faz upsert por `reduzido`; conta que sumiu vira `ativa = false` e continua resolvendo o de-para
antigo, com aviso. Parser puro (`contabil/plano.ts`), testado.

### 4.2 De-para — `DeParaContabil`

```prisma
model DeParaContabil {
  id            String       @id @default(cuid())
  alvo          AlvoDePara   // ver tabela abaixo
  alvoId        String       // id da entidade, ou chave fixa (imposto, padrão)
  contaReduzido Int?         // conta do plano (FK lógica por reduzido: sobrevive à re-importação)
  codigoCentro  String?      // só alvo centro/projeto
  naoExportar   Boolean      @default(false) // só alvo categoria
  @@unique([alvo, alvoId])
  @@map("de_para_contabil")
}
```

| `alvo` | `alvoId` | Para quê |
|---|---|---|
| `categoria` | `CategoriaFinanceira.id` | Conta de resultado (ou de PL, p/ lucros). **Nula herda da mãe**, como `tipoCusto` |
| `categoria_contrapartida` | `CategoriaFinanceira.id` | Contrapartida própria (impostos → Simples a recolher; pró-labore → Pró-labore a pagar; lucros → Dividendos a pagar). Herda da mãe |
| `conta_bancaria` | `ContaBancaria.id` | Banco/caixa — **inclui as contas de investimento** (cada aplicação é uma conta) |
| `cartao` | `CartaoCredito.id` | Empresa → cartão a pagar; pessoal → adiantamento de sócio |
| `cliente` / `fornecedor` | id | Conta própria do contato (opcional) |
| `padrao` | `clientes` / `fornecedores` | Clientes Diversos (1659) / Fornecedores Diversos (2142) |
| `imposto_recolher` | `iss`, `inss`, `irrf`, `pis`, `cofins`, `csll` | Retenção feita (passivo) |
| `imposto_compensar` | `iss`, `inss`, … | Retenção sofrida (ativo) |
| `centro` / `projeto` | id | Código do centro (nível 1) e do subcentro (nível 2) |

A migração cria `naoExportar = true` em `despesa_folha_clt` (decisão do contador). Pró-labore, estagiários e encargos
aguardam a pergunta 5 (§10).

### 4.3 Exportação — `ExportacaoContabil`

```prisma
model ExportacaoContabil {
  id           String   @id @default(cuid())
  competencia  String   // "YYYY-MM"
  formato      String   // "xlsx" | "csv" | "alterdata"
  linhas       Json     // as linhas exatamente como saíram
  hash         String   // sha256 das linhas — detecta mudança depois
  pendencias   Int      // contas em branco no arquivo
  geradoPorId  String
  createdAt    DateTime @default(now())
  @@index([competencia])
  @@map("exportacao_contabil")
}
```

Histórico, nunca sobrescrito. A tela mostra "Exportado em dd/mm por Fulano" e, se o motor hoje der outro hash para o
mesmo mês, "Mudou desde a última exportação" com o diff de linhas.

### 4.4 Retenções — `RetencaoLancamento` (fase C4)

```prisma
model RetencaoLancamento {
  id           String        @id @default(cuid())
  lancamentoId String
  lancamento   Lancamento    @relation(fields: [lancamentoId], references: [id], onDelete: Cascade)
  imposto      ImpostoRetido // iss | inss | irrf | pis | cofins | csll
  valor        Decimal       @db.Decimal(14, 2)
  @@unique([lancamentoId, imposto])
  @@map("lancamento_retencao")
}
```

E em `Lancamento`: `retencaoDeId String?` + `retencaoImposto ImpostoRetido?` na conta do imposto gerada — **escalar,
sem relação Prisma** (mesmo motivo do `acessorioDeId`: heap do `tsc`).

## 5. Motor de partidas (`financeiro/contabil/partidas.ts`, puro)

Entrada: lançamentos do mês (já com categoria e cadeia de mães, conta, cartão, contato, rateio, retenções), o de-para e o
plano. Saída: `Linha[]` (`data, debito, credito, valorCentavos, historico, documento, chaveNfe, centro, subcentro,
lancamentoId, evento`) + `Pendencia[]` (alvo sem conta, com quantos lançamentos afeta) + resumo do que ficou fora.

| # | Evento | Quando entra no mês M | Débito / Crédito |
|---|---|---|---|
| E1 | **Reconhecimento** | `previsto`/`confirmado`, competência (`dataCompetencia ?? data`) em M | Despesa: D categoria / C contrapartida · Receita: D contrapartida / C categoria. Valor do título (`valor`) |
| E2 | **Baixa** | `confirmado`, `dataConfirmacao` em M | Despesa: D contrapartida / C banco · Receita: D banco / C contrapartida. Valor pago (`valorEfetivo ?? valor`) |
| E3 | **Transferência** | par realizado em M — **uma** linha por par | D conta destino / C conta origem (aporte/resgate de investimento incluídos) |
| E4 | **Movimento** (linha única) | acessório M7, acessório de retenção, rendimento/IR na conta de investimento | Despesa: D categoria / C banco · Receita: D banco / C categoria |
| E5 | **Imposto retido pago** | conta gerada por retenção, paga em M | D imposto a recolher / C banco (sem E1) |

Regras:
- **Fora do arquivo** (contados no resumo): `aguardando_aprovacao` (aviso: "N contas aguardando aprovação"),
  `cancelado`, `previsao`, excluídos, categoria `naoExportar` (inclusive por herança).
- **Resto de pagamento parcial não é reconhecido** (`restanteDeId` preenchido): o título nasce uma vez, pelo `valor`
  do original; cada pagamento (original e restos) gera a sua baixa. Σ baixas = valor do título.
- **Contrapartida**, nesta ordem: cartão (compra com `cartaoId`) → `categoria_contrapartida` (com herança) → conta do
  contato (cliente na receita, fornecedor na despesa) → `padrao`. Sem nenhuma → pendência.
- **Compras de cartão**: E1 por compra (no dia da compra); a baixa vem **agregada por fatura** (uma linha por
  `faturaId` + data + conta): D cartão / C banco.
- **Centro de custo**: só nas linhas com conta de resultado (E1, E4). `centro` = código do `centroId`, `subcentro` =
  código do `projetoId`. Com **rateio** (M10), a linha se divide por `ratearValor` (centavo restante na última),
  cada parte com o seu centro/projeto.
- Linha de valor zero não sai. Histórico = descrição + contato + "NF nº". Documento = `numeroDocumento`.
- **Invariante** (teste + smoke): para cada conta bancária mapeada, Σ débitos − Σ créditos na conta contábil dela
  no mês = entradas − saídas do **Extrato por conta** (`extrato/calculo.ts`) no mesmo mês. Se não bater, há um bug
  num dos dois.

Casos de borda decididos:
- Baixa antes do reconhecimento (pagou em setembro um título de competência outubro): E2 sai em setembro, E1 em
  outubro; o fornecedor fica devedor um mês. Correto contabilmente (adiantamento) e o contador vê.
- Título "pago na criação" (manual): E1 + E2 no mesmo dia, como pedido ("sempre dois").
- Conta de investimento sem ativo ligado (legado M4): tratada como conta bancária comum.

## 6. Exportação (tela, conforme o mock)

`/financeiro/contabil`, item "Integração contábil" em **Mais**, gate `financeiro:fechar` (o do Fechamento mensal: quem fecha o mês o entrega ao contador — sem par novo de permissão).
Duas abas como no mock:
- **De-para** — "Categorias → conta contábil" (filtro Todas | Sem conta contábil, contador "N faltam") e "Contas
  bancárias → conta contábil"; menu de contexto da linha: Escolher conta contábil…, Copiar de outra categoria…, Ver
  lançamentos do mês, Limpar conta. O seletor só oferece conta **analítica e ativa** do plano.
- **Exportação** — mês fechado escolhido, formato Excel | CSV | Layout do contador, aviso das pendências, prévia das
  linhas e "Exportar <mês>". Mês aberto: botão desabilitado com o motivo ("Só meses fechados exportam…").

**Acréscimos ao mock** (precisam de OK do dono antes da C1 — mock aprovado é contrato; desvio só com OK prévio):
1. Blocos de de-para além de categorias e contas: **Cartões**, **Impostos retidos** (a recolher / a compensar),
   **Contrapartida por categoria**, **Clientes e fornecedores** (só os que têm conta própria + os dois padrões) e
   **Centros e projetos**.
2. Estado "**Não exportar (o contador lança)**" na categoria (folha), no menu da linha.
3. "**Importar plano do contador**" no `⋯` do cabeçalho, com o resultado (novas, alteradas, desativadas).
4. Selo "Exportado em … / Mudou desde a última exportação" na aba Exportação.

## 7. Retenções na NF (fase C4)

- **Onde se informa:** no título (formulário do lançamento, seção "Retenções na nota", recolhida por padrão), valor por
  imposto. Receita = o cliente retém; despesa = nós retemos.
- **Baixa:** retenção só quitando o título inteiro (como o desconto). `planejarBaixa` ganha as retenções:
  - receita: acessório **despesa** por imposto, categoria do sistema `retencao_sofrida` (`fora_do_resultado`), na mesma
    conta/data → caixa = principal − retido; DRE intacta (receita bruta);
  - despesa: acessório **receita** por imposto, categoria `retencao_feita` (`fora_do_resultado`) → caixa = principal −
    retido; e **uma conta a pagar por imposto** (`previsto`, categoria `retencao_a_recolher`, `fora_do_resultado`,
    `retencaoDeId`/`retencaoImposto`), vencimento = dia configurado do **mês seguinte ao da baixa** (ISS 10, demais 15 —
    `ConfigFinanceiro.vencimentoRetencao`, editável; a lei permite até o dia 20 para IRRF/INSS).
- **Todo caminho de baixa** passa por `baixarNoTx` com as retenções (livro caixa, lote, conciliação, OFX, lote de
  pagamentos) — mesma regra do comprovante (M10).
- **Valor líquido** (`valor − Σretenções`) é o que o planejador projeta, o que a conciliação casa com o OFX e o que a
  cobrança ao cliente (M9) informa. A DRE e o aging seguem o valor do título.
- **Estorno** do principal leva os acessórios (já é M7) e exclui as contas de imposto **em aberto**; se alguma já foi
  paga, o estorno é recusado ("O imposto retido já foi recolhido: estorne o recolhimento primeiro.").
- **Trava:** retenção de título pago não muda; num mês fechado, entra em `CAMPOS_TRAVADOS`.
- **Fora:** cálculo automático de alíquota (o valor vem da NF), DAS/Simples, compensação do retido no DAS (é do contador).
- Tela nova → **mock antes de codar** (formulário + diálogo de baixa + conta de imposto gerada).

## 8. O que NÃO entra

Razão, balancete ou DRE contábil no SenaHub · importação de volta do Alterdata · depreciação, provisões de férias/13º
(o contador lança) · folha CLT · reabrir mês por causa da exportação (fechar/reabrir segue o N5).

## 9. Fases

| Fase | Modelo | Entrega | Depende de |
|---|---|---|---|
| **C0** | Sonnet | `ContaContabil` + parser + importar plano (script e ação) + carga do CSV deste spec | — |
| **C1** | Sonnet | Mock revisado (§6 acréscimos) → `DeParaContabil` + aba De-para + migração (sugestões do §11, folha `naoExportar`) | OK do mock |
| **C2** | **Opus** | Motor de partidas puro (§5) com testes + smoke `smoke:contabil` (invariante do extrato, parcial, cartão, transferência, rateio, folha fora) | C0 |
| **C3** | Sonnet | Aba Exportação (Excel/CSV genérico, prévia, só mês fechado) + `ExportacaoContabil` + hash/diff | C1, C2 |
| **C4** | **Opus** | Mock → retenções (§7) + E4/E5 no motor + smoke | OK do mock, contas do contador |
| **C5** | Sonnet | Layout Alterdata | arquivo de exemplo do contador |

Verificação por fase: tsc (`NODE_OPTIONS=--max-old-space-size=8192`), lint sem `--quiet`, suíte, smoke da fase,
`smoke:financeiro-core`, build, Chrome 1366 (menu aberto) e 390 nas telas.

## 10. Perguntas que ainda estão com o contador

1. Arquivo/layout de importação do Alterdata (trava a C5).
2. A importação usa o código reduzido? (premissa deste spec)
3. Criação das contas que faltam (§2).
4. Habilitar centro de custo no plano; quem cria os códigos de centro e projeto.
5. Pró-labore, FGTS/INSS e bolsa de estágio também ficam fora? Grupo 3.1.1 ou 3.1.2 para pessoal?
6. Cliente novo: Clientes Diversos ou conta própria?
7. Projetistas PJ: 2954 (Serviços de terceiros) ou 3787 (Custos), contrapartida 4221?

## 11. Sugestão inicial do de-para (a migração da C1 grava; o dono confere)

| SenaHub | Reduzido | Conta |
|---|---|---|
| Receita — projetos particulares / licitações / outras | 3108 | Serviços Prestados - Mercado Interno |
| Juros e multas recebidos | 3262 | Juros Ativos |
| Descontos obtidos | 3269 | Descontos Financeiros Obtidos |
| Rendimento de aplicação | 3955 | Rendimento s/ Aplicação |
| Projetistas PJ / freelancers | 2954 | Serviços Prestados por Terceiros (pergunta 7) |
| Administrativas | 3451 | Despesas Administrativas |
| Impostos | 3577 · contrapartida 3486 | Simples Nacional / Simples a Recolher |
| Pró-labore | 2793 · contrapartida 2233 | Pró-Labore / Pró-Labore a Pagar |
| Estagiários | 4081 | Bolsa Estágio |
| Juros e multas pagos | 2982 | Juros Passivos |
| Descontos concedidos | 3003 | Descontos Concedidos |
| Distribuição de lucros | 3374 · contrapartida 3423 | Lucros Acumulados / Dividendos a Pagar |
| Folha CLT | — | Não exportar |
| Padrão clientes / fornecedores | 1659 / 2142 | Clientes Diversos / Fornecedores Diversos |
| Contas bancárias | 3395 · 3402 · 3941 · 11 | Caixa Econômica · Santander · Itaú · Caixa (o dono liga cada conta) |
| IRRF / PIS / COFINS / CSLL / INSS a recolher | 2163 · 2177 · 2184 · 2170 · 2254 | (ISS a recolher falta no plano) |

## 12. O que foi feito (2026-10-07)

| Fase | Entrega |
|---|---|
| C0 | `ContaContabil` + `lerPlanoCsv`/`planejarImportacao` (`contabil/plano.ts`) + `npm run contabil:importar-plano [csv]` (sem argumento, o CSV deste spec). Migração `20261007120000_integracao_contabil`. |
| C1 (parcial) | `DeParaContabil` + aba De-para do mock: categorias (filtro Todas / Sem conta contábil, menu Escolher · Copiar · Ver lançamentos do mês · Limpar) e contas bancárias (Escolher · Ver extrato do mês · Limpar). A migração grava as sugestões do §11, a folha "não exportar" e os dois padrões. |
| C2 | `gerarPartidas` (`contabil/partidas.ts`, puro, 22 testes) + `partidasDoMes` (service) + `npm run smoke:contabil` (16 checagens, inclusive a invariante do extrato). |
| C3 | Card Exportação + prévia (aba Exportação = prévia completa), `exportarMesContabil` grava `ExportacaoContabil` (linhas + hash) e a rota `/api/financeiro/contabil/arquivo?id=` serve exatamente o registro (Excel ou CSV `;` com vírgula decimal). |

Escolhas tomadas na implementação (dizer ao dono):
- **Exportar fica bloqueado só por categoria sem conta** (o mock desabilita com pendência). Pendência que depende de conta
  que o contador ainda vai criar (cartão, por exemplo) só avisa — senão nenhum mês com compra no cartão exportaria.
- **Seletor de mês** no card Exportação (o mock não tinha: sem ele não há como exportar outro mês além do último fechado).
- **Categoria grupo** (com filhas) sem conta mostra "Grupo — vale a conta de cada filha" e não conta como falta, a menos que
  algum lançamento do mês use o próprio grupo.
- **"Não exportar"** aparece como texto na linha da folha; escolher uma conta para ela tira o "não exportar". Não há botão
  para marcar outra categoria como "não exportar" — é acréscimo ao mock (§6, item 2) e espera o OK.
- A tela mostra a classificação e o nome; a prévia e o arquivo usam o **reduzido** (passar o mouse mostra o nome).

Ainda fora (esperam o OK do mock ou o contador): blocos de cartões, impostos, contrapartida, clientes/fornecedores e
centros/projetos (§6 item 1), importar plano pela tela (§6 item 3), selo "mudou desde a última exportação" (§6 item 4 — o
hash já é gravado), retenções (C4) e layout Alterdata (C5).

**Deploy:** `prisma migrate deploy` + `npm run contabil:importar-plano` uma vez (carrega o plano do CSV). Sem o plano a
tela avisa e o seletor fica vazio; as sugestões da migração já estão gravadas pelo reduzido.
