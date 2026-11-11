# Roteiro do lançamento retroativo (para o agente)

Você é o Claude Code rodando no PC do servidor do SenaHub. Seu trabalho é preparar, mês a mês, as planilhas que o dono
importa no Financeiro do SenaHub para lançar o fluxo de caixa de **janeiro/2026 até hoje**. Você **lê** o banco (só
leitura), **categoriza** e **entrega planilhas**. Quem grava é o dono, pela tela **Financeiro → Mais → Importar
planilha**, com a opção «Criar cadastros que não existirem» **desmarcada**.

Decisão e motivo: `docs/superpowers/specs/2026-11-10-lancamento-retroativo-extrato-design.md` (no repositório do app).
Este roteiro é o que vale para você.

## Como rodar

- **Onde:** Claude Code (CLI ou o app desktop, aba Code) no PC do servidor, aberto numa **pasta de trabalho própria**
  (ex.: `D:\financeiro-retroativo\`), com o `CLAUDE.md` de `CLAUDE.md.modelo`. **Nunca** abra o Claude na pasta do app.
  O chat comum do Claude Desktop não serve: ele não roda `psql` nem gera os arquivos.
- **Banco:** `.env` da pasta de trabalho com `LEITURA_DATABASE_URL` (usuário `senahub_leitura`, criado por
  `papel-leitura.sql`). Consultas por `psql "$LEITURA_DATABASE_URL" -c "SELECT ..."`. Só `SELECT`; o usuário já recusa
  qualquer escrita, mas não tente.
- **Planilhas de saída:** CSV com `;` e cabeçalho igual a `modelo-saida.csv` (o importador mapeia sozinho), ou `.xlsx`
  gerado por script Node com `exceljs` com o mesmo cabeçalho. Valores com vírgula decimal (`-1.500,00` ou `-1500,00`),
  datas `DD/MM/AAAA`.

### Colunas da planilha de saída

| Coluna | O que vai |
|---|---|
| Data | dia do movimento no banco |
| Descrição | o histórico do banco (pode completar com o nome da pessoa ou "Reembolso cartão pessoal") |
| Valor | com sinal: negativo sai, positivo entra |
| Tipo | vazio (o sinal decide), `Transferência` para transferência entre contas próprias, `Saldo inicial` para o saldo de abertura |
| Status | `Pago` |
| Data efetiva | igual à Data |
| Categoria | o **código** do plano de contas (ex.: `2.08`). Nunca um nome novo |
| Subcategoria | vazio (o código já aponta a categoria certa) |
| Conta | nome exato da conta bancária no SenaHub |
| Conta destino | só em transferência |
| Contato | fornecedor ou cliente que já existe, ou novo **com** CPF/CNPJ válido. Vazio para pessoa da equipe |
| CPF/CNPJ | do contato, quando houver |
| Projeto | código do projeto (`Projeto.codigo`, ex.: `260031`), quando a contraparte ou o histórico indica |
| Sócio | nome ou e-mail do sócio, em toda retirada ou reembolso de sócio |
| Nº documento | o nº do documento do extrato |
| Observação | de onde veio a categoria quando não é óbvio (ex.: "Meu Dinheiro", "resposta do dono 2026-02") |

## Preparação (uma vez, antes de janeiro)

1. **Saldo inicial em 01/01/2026.** Conta do banco: o saldo do extrato no fim de 31/12/2025, numa linha
   `Saldo inicial` com Data `01/01/2026` (o importador grava o saldo e a data de início). Outras contas: o saldo do Meu
   Dinheiro na mesma data. Entregue isso em `saidas/2026-01/2026-01-saldos-iniciais.csv`.
2. **Compromissos recorrentes.** Liste os ativos com vigência em 2026 e os lançamentos `previsto` que já geraram:
   ```sql
   SELECT c.id, c.descricao, c.valor, c."competenciaInicio", c."competenciaFim"
     FROM compromisso_recorrente c WHERE c.ativo AND (c."competenciaFim" IS NULL OR c."competenciaFim" >= '2026-01');
   SELECT l.id, l.descricao, l.valor, l.vencimento, l."recorrenciaCompetencia", l.status
     FROM lancamento l WHERE l."recorrenciaOrigemId" IS NOT NULL AND l."excluidoEm" IS NULL
      AND l."recorrenciaCompetencia" >= '2026-01' ORDER BY l."recorrenciaCompetencia";
   ```
   O pagamento desses previstos **não** entra na planilha: vai para a lista de revisão como baixa à mão (passo 4).
3. **Folha CLT.** O corte é a competência **10/2026** (`rh.folha.fechaNoFinanceiroDesde`). Até 09/2026, salário,
   INSS, IRRF, FGTS, bolsa e taxa do agente entram pelo extrato como despesas pagas comuns. De 10/2026 em diante vêm do
   fechamento da folha: o pagamento do salário de outubro (início de novembro) e as guias de outubro (dia 20/11) **não**
   entram na planilha — vão para a lista de revisão como "pagamento da folha de 10/2026: dar baixa na conta gerada pelo
   fechamento". Salário pago nos primeiros dias úteis do mês M é da competência M−1.
4. **Cadastros de referência** (releia a cada mês, podem ter mudado):
   ```sql
   SELECT codigo, nome, tipo, natureza FROM categoria_financeira WHERE ativo ORDER BY codigo;
   SELECT nome, tipo, "saldoInicial", "saldoInicialEm" FROM conta_bancaria WHERE ativo;
   SELECT codigo, nome FROM projeto ORDER BY codigo;
   SELECT s.id, u.name, u.email, s.ativo FROM socio s JOIN leitura_usuario u ON u.id = s."userId";
   SELECT nome, documento FROM fornecedor;   SELECT nome, documento FROM cliente;
   SELECT termo, condicoes, "categoriaId", "projetoId", ordem FROM regra_categorizacao WHERE ativo ORDER BY ordem;
   SELECT ano, mes, status FROM fechamento_mensal WHERE ano = 2026;
   ```
   Se algum mês de 2026 estiver **fechado**, avise o dono antes: o importador recusa lançamento em mês fechado.

## Entradas de cada mês

- `entradas/AAAA-MM/extrato-AAAA-MM.xlsx`: o Excel do banco como o banco exporta (data, histórico, nº do documento,
  valor com sinal, saldo corrente).
- `entradas/AAAA-MM/meudinheiro-AAAA-MM.xlsx` (ou uma planilha com o ano todo, filtrada pelo mês).

## Passos de cada mês M

1. **Ler o extrato** e normalizar (data, histórico, nº do documento, valor com sinal, saldo). Conferir o encadeamento:
   saldo da linha anterior + valor = saldo da linha, na ordem cronológica real (o banco pode listar fora de ordem dentro
   do dia). **Não bateu: pare** e mostre ao dono as linhas que não fecham, antes de categorizar.
2. **Ler o Meu Dinheiro** do mês e separar os itens da conta do banco dos itens das outras contas.
3. **Casar Meu Dinheiro × extrato**, só dentro da conta do banco: mesmo valor em centavos, até 3 dias de diferença, um
   único candidato de cada lado. O item casado não vira lançamento: empresta categoria, projeto, contato e observação
   para a linha do extrato. Dois candidatos: pergunte. Item do Meu Dinheiro na conta do banco sem linha no extrato: vai
   para a lista de revisão, nunca para a planilha.
4. **Procurar no SenaHub o que já existe:** lançamento não excluído, `previsto` ou `confirmado`, mesma conta ou sem
   conta, mesmo valor, até 5 dias (inclui os previstos dos compromissos recorrentes):
   ```sql
   SELECT l.id, l.tipo, l.descricao, l.valor, l.data, l.vencimento, l.status, l."contaId"
     FROM lancamento l
    WHERE l."excluidoEm" IS NULL AND l.status IN ('previsto', 'confirmado')
      AND l.valor = <valor sem sinal> AND l.tipo = '<receita|despesa>'
      AND (l."contaId" = '<id da conta>' OR l."contaId" IS NULL)
      AND COALESCE(l."dataConfirmacao", l.vencimento, l.data) BETWEEN '<dia − 5>' AND '<dia + 5>';
   ```
   Achou um: a linha **sai da planilha** e vai para a lista de revisão como "dar baixa / conciliar à mão" com o link
   `/financeiro/lancamentos?lancamento=<id>`. Achou mais de um: pergunte.
5. **Transferências entre contas próprias** (ex.: "SENA PROJETOS DE ENGENHAR"): uma linha só na planilha, Tipo
   `Transferência`, com Conta e Conta destino. A perna correspondente nas outras contas do Meu Dinheiro sai da planilha
   das outras contas (senão entra duas vezes).
6. **Categorizar o resto**, nesta ordem, parando no primeiro que decide:
   1. respostas anteriores do dono (`respostas.md`);
   2. documento na descrição (CPF/CNPJ) contra cliente ou fornecedor;
   3. nome da contraparte, aceitando o truncamento do banco, contra sócios (sempre pergunte a categoria), pessoas,
      fornecedores e clientes;
   4. regras ativas de categorização do SenaHub;
   5. histórico: o que o Meu Dinheiro e o SenaHub já categorizaram para a mesma contraparte;
   6. seu julgamento, marcado como sugestão.

   Categoria sempre do plano existente, **pelo código**. Projeto quando a contraparte ou o histórico indica. Sócio
   preenchido em toda retirada de sócio. Casos fixos:
   - **Rendimento automático** ("Rendimento Liquido De Contamax"): receita na categoria de rendimento de aplicação, na
     própria conta corrente.
   - **Receita com imposto retido na nota:** entra pelo valor líquido que o banco recebeu.
   - **Pagamento a pessoa** (projetista PJ, freelancer, colaborador, sócio): **sem contato**, com o nome da pessoa na
     descrição; se for sócio, coluna Sócio preenchida. Nunca crie fornecedor com nome de pessoa da equipe.
   - **Reembolso a sócio** por compra no cartão pessoal: despesa paga na **categoria do gasto** (software, material…),
     Sócio preenchido, "Reembolso cartão pessoal" na descrição. Não se cadastra cartão nem fatura.
7. **Perguntar ao dono em bloco:** uma lista por mês, agrupada por contraparte, com valor, data e a sua sugestão.
   Sempre pergunte: pagamento a sócio (pró-labore, distribuição de lucros, adiantamento ou reembolso — quando a resposta
   for reembolso, pergunte também a categoria do gasto), linha sem sugestão, sugestão vinda só do seu julgamento.
8. **Entregar** em `saidas/AAAA-MM/`:
   - `AAAA-MM-banco.csv` e `AAAA-MM-outras-contas.csv`, no formato de `modelo-saida.csv`, Status `Pago`, Data efetiva =
     Data;
   - `AAAA-MM-revisao.md`: o que já existe no SenaHub (com link), itens do Meu Dinheiro sem extrato, contatos que o
     importador vai criar (só com CPF/CNPJ válido), ambíguos resolvidos e como, pagamentos da folha a dar baixa;
   - totais de conferência por conta: entradas, saídas, saldo inicial e saldo final esperados.
9. **Depois da importação**, confira pelo banco o saldo da conta no último dia do mês contra o extrato:
   ```sql
   SELECT c."saldoInicial"
        + COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN COALESCE(l."valorEfetivo", l.valor) ELSE -COALESCE(l."valorEfetivo", l.valor) END), 0) AS saldo
     FROM conta_bancaria c
     LEFT JOIN lancamento l ON l."contaId" = c.id AND l."excluidoEm" IS NULL AND l.status = 'confirmado'
      AND l."dataConfirmacao" <= '<último dia do mês>'
      AND (c."saldoInicialEm" IS NULL OR l."dataConfirmacao" >= c."saldoInicialEm")
    WHERE c.nome = '<conta>' GROUP BY c."saldoInicial";
   ```
   O número tem de bater com o Extrato por conta da tela e com o saldo do banco no último dia. Diferença: liste as
   linhas que a explicam antes de seguir para o próximo mês.

## Memória entre os meses

- `respostas.md` — uma linha por resposta do dono, lida no passo 6.1:
  `contraparte (como aparece no banco) → categoria <código>, projeto <código|—>, sócio <nome|—>, observação | ou "sempre perguntar"`.
- `regras-sugeridas.md` — regras de categorização que o dono pode criar em Financeiro → Regras:
  `QUANDO descrição contém "<termo>" [e tipo = despesa] [e valor = …] → ENTÃO categoria <código>, projeto <código>, contato <nome>`
  com quantas linhas do mês ela teria acertado. Você nunca cria a regra.

## O que nunca fazer

- Escrever no banco, por SQL, script ou qualquer outro caminho.
- Pôr numa planilha uma linha que já existe no SenaHub ou que está nas duas fontes (caixa em dobro).
- Inventar categoria, conta ou centro (o importador recusa no modo estrito — e a linha some da importação).
- Seguir para o mês seguinte com saldo que não bate.
