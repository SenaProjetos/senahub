# Lançamento retroativo a partir do extrato (Claude prepara, SenaHub grava)

Data: 2026-11-10 · Status: rascunho para aprovação do dono

## 1. Intenção

O dono quer lançar no Financeiro do SenaHub o fluxo de caixa de **janeiro/2026 até hoje**, que hoje só existe em dois
lugares:

- o **extrato em Excel do banco** (um banco só, a conta principal), com data, histórico, nº do documento, valor com sinal
  e saldo corrente;
- a **planilha do Meu Dinheiro**, que tem as outras contas e parte das linhas da conta do banco, já categorizadas.

O que mais toma tempo é **categorizar cada linha**. A categoria quase nunca sai do valor: sai de saber quem é a
contraparte ("PIX ENVIADO GUSTAVO LUIZ MAURICIO INA" = projetista; "Pix Recebido 03325635539" = cliente pelo CPF;
"INSTITUTO EUVALDO LODI" = taxa do agente de estágio). O SenaHub já sabe a maior parte disso (sócios, pessoas, clientes,
fornecedores, regras de categorização).

Decisão do dono: **não** construir agora um assistente de IA dentro do sistema. O Claude (Claude Code no PC do servidor)
faz o trabalho de leitura e categorização **lendo o banco sem escrever**, e entrega planilhas prontas. Quem grava é o
importador do SenaHub, pela tela, com auditoria, trava de mês e lote que se desfaz. Se a categorização da IA se provar boa,
o assistente dentro do sistema vem depois, aproveitando as regras que este trabalho gerar.

Este trabalho também serve para avaliar se um assistente dentro do SenaHub vale a pena para conciliação, notas e cobrança
(fora de escopo aqui).

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Cada mês de jan/2026 até o mês corrente lançado, conta por conta.
- Na conta do banco, o saldo final de cada mês no Extrato por conta do SenaHub é igual ao saldo do extrato do banco no
  último dia do mês.
- Cada movimento entra uma vez só, nem mais nem menos.
- O dono responde só o que é ambíguo de verdade. Cada resposta vira conhecimento reaproveitado nos meses seguintes
  (respostas gravadas e regras sugeridas).
- O importador atual passa a servir para extrato de banco categorizado por fora, sem criar lixo no cadastro.

**Não-objetivos**
- Assistente de IA dentro do SenaHub (painel, rota, tool use). Fica para depois.
- Ler PDF de nota, cobrança, conciliação OFX do dia a dia.
- Ligar os pagamentos retroativos à folha CLT ou à tela de Produção (projetistas). Nesses meses eles existem só no
  extrato e entram como despesas pagas comuns.
- Rateio, caixinha, retenções na nota e cartão de crédito no importador.

**Anti-objetivos (falha, mesmo que "funcione")**
- Caixa em dobro: uma linha do extrato que também está no Meu Dinheiro, ou que já existe no SenaHub, entrando duas vezes.
- Cadastro lixo: categoria, conta ou fornecedor novo criado a partir de um nome truncado do banco.
- O Claude escrevendo no banco de dados, por SQL ou por script.
- Números do SenaHub que não batem com o banco e ninguém percebe.

## 3. Restrições e fatos do ambiente

- Produção é Windows nativo, PostgreSQL local. O Claude Code roda no PC do servidor, numa **pasta de trabalho própria**,
  fora da pasta do app, e nunca usa o `.env` de produção.
- Nenhum mês de 2026 está fechado no SenaHub, e há poucos lançamentos nesses meses (dono, 2026-11-10). A trava de mês
  fechado (N5) não deve atrapalhar, mas o importador continua respeitando ela.
- No Meu Dinheiro, um item que saiu da conta do banco está lançado na conta desse mesmo banco (dono). O casamento entre as
  duas fontes é feito **só dentro da mesma conta**.
- Pagamentos a sócio são sempre ambíguos: pró-labore, distribuição de lucros, adiantamento ou reembolso não se deduzem do
  valor nem do nome (dono). O Claude sempre pergunta.
- Folha CLT e pagamento de projetista desses meses só existem no extrato (dono).
- Dados financeiros e de clientes vão para a Anthropic no uso do Claude. O dono está ciente.

### O que o importador faz hoje (lido em 2026-11-10)

`src/modules/financeiro/importacao/` + `src/lib/import/`. Foi feito para migrar do Meu Dinheiro:

- Colunas: data, descrição, valor, valor efetivo, tipo, status, vencimento, data efetiva, categoria (**obrigatória**),
  subcategoria, conta, conta destino, contato, CPF/CNPJ, forma, centro, observação, tags, ID único.
- Cria por nome qualquer categoria, conta, forma, centro, fornecedor ou cliente que não encontra (`construirResolver` em
  `commit-core.ts`). A categoria é procurada por `tipo|nome`: o nome de uma categoria de despesa numa linha de receita
  cria uma categoria de receita nova com o mesmo nome.
- A chave anti-duplicata (`importHash`) é `md:<ID único>` ou o sha256 de `tipo|data|valor|descrição|categoria`. Ela só
  enxerga o que já foi importado, não lançamentos criados à mão ou por outros produtores.
- Respeita mês fechado, grava um lote que se desfaz (`executarDesfazer`), aplica as regras de categorização só nos campos
  vazios e gera as duas pernas da transferência (linha de tipo "Transferência" com conta destino).
- A linha "Saldo inicial" atualiza `ContaBancaria.saldoInicial`, mas **não** `saldoInicialEm`.
- A prévia mostra contagens e só 15 linhas de amostra.
- Não tem coluna de projeto, sócio nem nº do documento.

### Risco verificado: compromissos recorrentes

`competenciasAGerar` (`financeiro/recorrencia/calculo.ts`) gera, no job diário, um lançamento `previsto` para cada
competência **até 12 meses para trás** que esteja dentro da vigência e sem lançamento vinculado. Se existir um
`CompromissoRecorrente` ativo (pró-labore, aluguel, contador…) com `competenciaInicio` em ou antes de 2026-01, esses
meses provavelmente **já têm** lançamentos `previsto` no banco. O pagamento correspondente do extrato não deve entrar como
lançamento novo: deve dar baixa nesse previsto, senão o caixa conta em dobro (o previsto continua pendente na projeção).

## 4. O fluxo, mês a mês

Decisão (do agente, aceita implicitamente pelo dono): trabalhar **um mês por vez**, em ordem, começando em janeiro. Cada
mês é um lote de importação próprio, fecha com conferência de saldo antes do próximo, e as respostas de um mês alimentam o
seguinte.

```
 preparação única (seção 7)
        │
        ▼
 ┌─ para cada mês M ──────────────────────────────────────────────────┐
 │ 1. Claude lê extrato(M) + Meu Dinheiro(M) + SenaHub (só leitura)  │
 │ 2. Claude casa, categoriza e pergunta o ambíguo ao dono           │
 │ 3. Claude entrega planilhas + lista de revisão                    │
 │ 4. Dono resolve a lista de revisão (baixas/conciliações à mão)    │
 │ 5. Dono importa as planilhas pela tela                            │
 │ 6. Claude confere o saldo do mês no SenaHub × banco               │
 └────────────────────────────────────────────────────────────────────┘
```

## 5. Parte 1 — Ajustes no importador (código)

Tudo dentro de `importacao/` e `lib/import/mapeamento.ts`. Nada muda na migração do Meu Dinheiro além do que está escrito
aqui.

1. **Coluna `projeto`.** Recebe o código do projeto (`Projeto.codigo`) e preenche `Lancamento.projetoId`. Código
   desconhecido = erro na linha. Coluna vazia continua deixando as regras preencherem.
2. **Coluna `socio`.** Recebe o nome do sócio ou o e-mail do usuário dele e preenche `Lancamento.socioId` (sócio ativo
   ou inativo). Desconhecido ou mais de um = erro.
3. **Coluna `numeroDocumento`.** Texto livre, vai para `Lancamento.numeroDocumento`.
4. **Modo estrito**, uma opção na tela, **ligada por padrão**: "Criar cadastros que não existirem" desmarcado. Com ela
   desmarcada:
   - categoria, conta, forma e centro desconhecidos são erro na linha, com o texto "Categoria «X» não existe no plano de
     contas" (e equivalentes);
   - contato desconhecido **com CPF/CNPJ válido** pode ser criado, e a prévia mostra quantos serão criados. Sem
     documento válido, é erro. (Decisão do agente: fornecedor novo com documento é cadastro bom; com nome truncado do
     banco não é.)
5. **Categoria do tipo errado é sempre erro**, nos dois modos. Se o nome existe só no outro tipo, a linha falha com
   "Categoria «X» é de despesa, a linha é receita". Nunca cria a duplicata.
6. **Categoria também pelo código.** A coluna categoria aceita o `codigo` do plano de contas (ex.: `2.08`) além do nome.
   Código tem prioridade. Assim o Claude não depende de nome igual.
7. **Chave anti-duplicata sem a categoria.** Sem ID único: sha256 de `conta|data|valor em centavos|descrição
   normalizada|n`, onde `n` é a ordem da linha entre as idênticas do mesmo arquivo (duas transferências iguais no mesmo
   dia são dois lançamentos). A conferência de "já importado" continua aceitando também os hashes no formato antigo,
   para os lotes do Meu Dinheiro já gravados não voltarem.
8. **Saldo inicial com data.** A linha "Saldo inicial" com data preenche também `ContaBancaria.saldoInicialEm` com essa
   data (o saldo é o do início do dia, regra do M8). Sem data, segue como hoje.
9. **Prévia completa.** A prévia lista todas as linhas, paginada, com filtro "só com erro" e "só cadastros a criar". O
   resumo de contagens continua no topo.

10. **Trava do corte na folha** (fora do importador, em `rh/folha/fechamento-service.ts`): ver seção 7.3. Coberta por
    teste do serviço e pelo smoke `smoke:folha-financeiro` (fechar competência antes do corte é recusado).

Testes: os novos casos em `processar.test.ts` (normalização, hash, colunas) e um smoke novo
(`smoke:importacao-extrato`) que importa uma planilha de extrato com projeto, sócio, transferência, saldo inicial com
data, linha em modo estrito recusada e reimportação sem duplicar.

## 6. Parte 2 — O roteiro do Claude

Entregável: uma pasta `docs/financeiro/retroativo/` com:

- `ROTEIRO.md`: o passo a passo que o Claude segue a cada mês (abaixo), escrito para um agente;
- `papel-leitura.sql`: cria o usuário do Postgres só de leitura;
- `modelo-saida.csv`: o cabeçalho exato que o importador aceita, com as colunas novas (entregue em CSV; o importador
  lê CSV e XLSX com o mesmo cabeçalho).

### 6.1 Acesso ao banco, só de leitura

Usuário `senahub_leitura`, `LOGIN`, senha própria, `default_transaction_read_only = on`, e `SELECT` **só nas tabelas
necessárias**: lançamento, categoria financeira, conta bancária, forma de pagamento, centro de custo, fornecedor,
cliente, projeto, sócio, user (só `id`, `name`, `email`, por view ou `GRANT SELECT (colunas)`), regra de categorização,
compromisso recorrente, fechamento mensal. **Sem** acesso a `account` (senhas), `session`, cofre de acessos, RH e folha.
A string de conexão fica num `.env` da pasta de trabalho do Claude, nunca no `.env` do app.

### 6.2 Entradas por mês

- `extrato-AAAA-MM.xlsx`: o Excel do banco como o banco exporta.
- `meudinheiro-AAAA-MM.xlsx` (ou uma planilha só com o ano, filtrada pelo mês).

### 6.3 Passos por mês

1. **Ler o extrato** e normalizar (data, histórico, nº do documento, valor com sinal, saldo). Conferir o encadeamento:
   saldo da linha anterior + valor = saldo da linha, na ordem cronológica real (o banco pode listar fora de ordem dentro do
   dia). Não bateu: parar e avisar o dono antes de categorizar.
2. **Ler o Meu Dinheiro** do mês e separar os itens da conta do banco dos itens das outras contas.
3. **Casar Meu Dinheiro × extrato** (só na conta do banco): mesmo valor em centavos, até 3 dias de diferença, um único
   candidato de cada lado. O item casado não vira lançamento: empresta categoria, projeto, contato e observação para a
   linha do extrato. Dois candidatos: pergunta. Item do Meu Dinheiro na conta do banco sem linha no extrato: vai para a
   lista de revisão, nunca para a planilha.
4. **Procurar no SenaHub o que já existe**: lançamento não excluído, `previsto` ou `confirmado`, mesma conta ou sem
   conta, mesmo valor, até 5 dias (inclui os `previsto` gerados por compromisso recorrente). Achou um: a linha sai da
   planilha e vai para a lista de revisão como "dar baixa / conciliar à mão em <link>". Achou mais de um: pergunta.
5. **Transferências entre contas próprias** (ex.: "SENA PROJETOS DE ENGENHAR"): uma linha só na planilha, tipo
   "Transferência", com conta e conta destino. A perna correspondente nas outras contas do Meu Dinheiro sai da planilha
   das outras contas.
6. **Categorizar o resto**, nesta ordem, parando no primeiro que decide:
   1. respostas anteriores do dono (`respostas.md`, seção 6.4);
   2. documento na descrição (CPF/CNPJ) contra cliente ou fornecedor;
   3. nome da contraparte, aceitando o truncamento do banco, contra sócios (sempre pergunta a categoria), pessoas,
      fornecedores e clientes;
   4. regras ativas de categorização do SenaHub;
   5. histórico: o que o Meu Dinheiro e o SenaHub já categorizaram para a mesma contraparte;
   6. julgamento do Claude, marcado como sugestão.

   Categoria sempre do plano de contas existente, pelo código. Projeto quando a contraparte ou o histórico indica. Sócio
   preenchido em toda retirada de sócio.
7. **Perguntar ao dono em bloco**, uma lista por mês agrupada por contraparte, com valor, data e a sugestão do Claude.
   Sempre perguntar: pagamento a sócio, linha sem sugestão, sugestão vinda só do passo 6.6.
8. **Entregar** na pasta do mês:
   - `AAAA-MM-banco.xlsx` e `AAAA-MM-outras-contas.xlsx`, no formato de `modelo-saida.xlsx`, status "Pago", data efetiva
     = data;
   - `AAAA-MM-revisao.md`: já existe no SenaHub (com link), itens do Meu Dinheiro sem extrato, contatos que o importador
     vai criar, ambíguos resolvidos e como;
   - totais de conferência: entradas, saídas, saldo inicial e final esperados por conta.
9. **Depois da importação**, conferir pelo banco (só leitura) o saldo da conta no último dia do mês contra o extrato.
   Diferença: listar as linhas que explicam antes de seguir para o próximo mês.

### 6.4 Memória entre meses

- `respostas.md`: cada resposta do dono como "contraparte → categoria, projeto, sócio, observação" (ou "sempre
  perguntar"). Lido no passo 6.1.
- `regras-sugeridas.md`: regras de categorização propostas (condição + o que preenche), para o dono criar em
  Financeiro → Regras se quiser. O Claude nunca cria a regra.

## 7. Parte 3 — Preparação única e regras de convivência

1. **Saldo inicial das contas em 01/01/2026.** Conta do banco: saldo do extrato no fim de 31/12/2025, com
   `saldoInicialEm = 2026-01-01` (pela linha "Saldo inicial" do importador ajustado ou em Cadastros → Contas). Outras
   contas: saldo do Meu Dinheiro na mesma data.
2. **Compromissos recorrentes.** Antes de janeiro, o Claude lista os compromissos ativos com vigência em 2026 e os
   `previsto` que eles já geraram. Esses previstos são tratados no passo 4 (baixa à mão), nunca duplicados.
3. **Corte da folha: competência 10/2026** (dono, 2026-11-10). Hoje existem folhas mensais **abertas** de 07, 08 e 09/2026
   (07 e 09 com holerites importados) e nenhuma fechada.
   - Competências até 09/2026: salário líquido, INSS, IRRF, FGTS, bolsa e taxa do agente entram **pelo extrato**, como
     despesas pagas comuns. Essas folhas **nunca** são fechadas: o fechamento criaria as contas de novo.
   - **Trava no código** (decisão do agente, para o anti-objetivo "caixa em dobro"): `fecharFolha` recusa competência
     anterior ao corte, com a mensagem "A folha de MM/AAAA foi lançada no Financeiro pelo extrato. Fechar criaria as contas
     em dobro." O corte fica em `ConfigSistema` (`rh.folha.fechaNoFinanceiroDesde = "2026-10"`), não fixo no código. Os
     holerites dessas folhas continuam visíveis como histórico.
   - Competência 10/2026 em diante: vem do fechamento da folha. O salário de outubro, pago no começo de novembro, e as guias
     de outubro (dia 20/11) **não** entram pelo extrato: o Claude os põe na lista de revisão ("pagamento da folha de
     10/2026: dar baixa na conta gerada pelo fechamento"). Se a folha de outubro ainda não estiver fechada quando o
     extrato de novembro for preparado, a linha espera.
   - O mesmo vale para o Claude reconhecer a competência: pagamento de salário nos primeiros dias úteis do mês M é da
     competência M−1.
4. **Rendimento automático** ("Rendimento Liquido De Contamax"): receita na categoria de rendimento de aplicação, na
   própria conta corrente, sem cadastrar investimento. (Decisão do agente.)
5. **Receita com imposto retido na nota**: entra pelo valor líquido que o banco recebeu. (Decisão do agente: no
   retroativo não há a nota para registrar a retenção. A DRE desses meses fica pelo líquido.)
6. **Pagamento a pessoa** (projetista PJ, freelancer, colaborador, sócio): o `Lancamento` não tem contato do tipo pessoa
   e o Pix do banco não traz CPF. A linha vai **sem contato**, com o nome da pessoa na descrição e, quando é sócio, com
   `socio` preenchido. Nunca cria fornecedor com o nome de uma pessoa da equipe. (Decisão do agente.)

## 8. Critérios de pronto

- O importador ajustado passa no smoke novo e nos testes; a migração do Meu Dinheiro continua funcionando.
- Janeiro lançado de ponta a ponta com o roteiro: saldo final da conta do banco no Extrato por conta = saldo do banco em
  31/01; nenhuma categoria, conta ou centro novo no plano; lista de revisão resolvida.
- A partir daí, os meses seguintes repetem o roteiro.

## 9. Decisões tomadas pelo agente (para o dono conferir)

- Trabalhar mês a mês, um lote por mês.
- Modo estrito ligado por padrão; contato novo só com CPF/CNPJ válido.
- Categoria aceita código do plano de contas.
- Chave anti-duplicata sem categoria, com índice de ocorrência, aceitando também a chave antiga.
- Saldo inicial do importador também grava a data.
- Janela de 3 dias para casar Meu Dinheiro × extrato e de 5 dias para achar lançamento já existente no SenaHub.
- Rendimento automático como receita da própria conta; receita retida pelo líquido.
- Usuário de leitura com tabelas listadas, sem senhas, sessões, cofre, RH e folha.
- Pagamento a pessoa da equipe sem contato (nome na descrição); nunca vira fornecedor.
- Trava em `fecharFolha` para competência anterior ao corte, com o corte em `ConfigSistema`.
- Pagamentos da folha de 10/2026 em diante ficam fora da planilha e vão para a lista de revisão.

## 10. Deixado para quem construir

- Como mostrar o modo estrito e a prévia paginada na tela atual (`importador-view.tsx`), seguindo os padrões do
  CLAUDE.md (CabecalhoPagina, menu de contexto onde houver lista).
- Nome exato das tabelas e colunas no `papel-leitura.sql`.
- Formato interno de `respostas.md` e `regras-sugeridas.md`.

## 11. Respondido pelo dono em 2026-11-10

- Corte da folha: competência 10/2026 (seção 7.3).
- Não havia cartão de crédito da empresa no período. Existem só **reembolsos a sócios** por compras no cartão pessoal
  deles. Esses entram como despesa paga na **categoria do gasto** (software, material…), com `socio` preenchido e
  "Reembolso cartão pessoal" na descrição. Não se cadastram cartão nem fatura para o retroativo. O reembolso é uma das
  respostas possíveis da pergunta obrigatória sobre pagamento a sócio; quando o dono responde "reembolso", o Claude
  pergunta também a categoria do gasto.

## 12. Revisão de 2026-11-11 (respostas do dono e correções)

Revisão da branch antes do deploy. O dono respondeu:

- **Pessoas da equipe:** o papel de leitura enxerga o **nome** dos usuários internos (view `leitura_pessoa`, sem e-mail),
  além dos sócios. Vale no lugar do "só `id`, `name`, `email`" da §6.1.
- **Competência:** os meses retroativos ficam com DRE por competência igual ao caixa (a Data é a do movimento).
- **Status vazio** continua virando `previsto` (conta em aberto), também no modo estrito.
- **Cadastro inativo** (categoria, conta, forma, centro) é recusado no modo estrito.
- **Nº do documento entra na chave** anti-duplicata: `tipo|conta|data|centavos|descrição|nº do documento|n` (substitui a
  fórmula da §5.7).

Correções que entraram junto (todas no modo estrito, salvo a trava):

- Transferência precisa das duas pernas, cada uma numa conta, e contas diferentes.
- Linha paga sem conta e linha paga com data futura são erro.
- Sócio pelo começo do nome só em fim de palavra ou com duas palavras ou mais ("Ana" não casa com "Anabela").
- Uma importação por vez (`pg_advisory_xact_lock` no commit): duas ao mesmo tempo não duplicam.
- Folha anterior ao corte que esteja fechada não reabre (reaberta, não fecharia de novo).
- Roteiro: a chave não muda depois de importada (correção é na tela), ordem do extrato, previsto de compromisso
  recorrente casado por compromisso e competência, e a consulta do passo 4 ignora os lotes do próprio trabalho.

Fica como está, por decisão técnica: a chave antiga (`h:`) não tem a conta. Uma linha nova igual a uma linha antiga do
Meu Dinheiro em outra conta aparece como «Duplicada» na conferência (visível); o roteiro manda avisar o dono. Pôr a
conta nessa comparação faria uma conta renomeada reimportar o lote antigo inteiro, que é pior.
