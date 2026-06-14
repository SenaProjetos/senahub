# SenaHub — AP/AR: Prompts Claude Code (Fases 2–5)

Stack de referência: Next.js 14 App Router · TypeScript · Tailwind CSS · shadcn/ui · Prisma ORM · PostgreSQL · NextAuth · Socket.io

---

## FASE 2 — Vincular Lançamento a Documento (NF / Contrato / Proposta)

```
Objetivo:
Adicionar ao módulo financeiro do SenaHub a capacidade de vincular um Lançamento a um documento-fonte (Nota Fiscal, Contrato, Proposta ou Medição), mantendo rastreabilidade de origem para cada movimentação financeira.

## Contexto (manter adiante)
- Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL, NextAuth
- Modelo atual: tabela `Lancamento` com campos status (PREVISTO | CONFIRMADO), valorPrevisto, valorEfetivo, recorrenciaGrupo
- Nenhum vínculo documento-lançamento existe hoje
- Uploads de arquivo já existem no projeto (reutilizar o mecanismo existente)
- NUNCA altere tabelas fora do módulo financeiro

## Estado Inicial:
- `prisma/schema.prisma` com modelo `Lancamento` sem relação de documento
- Rotas de API em `app/api/financeiro/`
- Componentes de formulário de lançamento em `components/financeiro/`

## Estado-Alvo:
1. Novo modelo Prisma `DocumentoFinanceiro` com campos:
   - id, tipo (enum: NF_ENTRADA | NF_SERVICO | CONTRATO | PROPOSTA | MEDICAO), numero (string, nullable), dataEmissao (DateTime, nullable), valorDocumento (Decimal, nullable), arquivoUrl (string, nullable), observacao (string, nullable)
   - Relação 1-para-muitos com Lancamento (um documento pode gerar N lançamentos, ex: parcelamento)
2. Migration Prisma aplicada
3. Campo `documentoId` (opcional) adicionado ao modelo `Lancamento`
4. No formulário de criação/edição de Lançamento: seção colapsável "Documento de origem" com select de tipo + campos condicionais + upload de arquivo
5. Na listagem de lançamentos: coluna "Doc." exibindo badge com tipo do documento quando vinculado, com tooltip mostrando número e valor
6. Server action `vincularDocumento(lancamentoId, documentoData)` que cria ou reutiliza documento existente

## Ações Permitidas:
- Criar e rodar migration Prisma
- Criar novos arquivos em `components/financeiro/`, `app/api/financeiro/`, `lib/financeiro/`
- Modificar formulário de lançamento existente para adicionar seção de documento
- Modificar listagem de lançamentos para adicionar coluna Doc.
- Reutilizar componente de upload de arquivo existente

## Ações Proibidas:
- NÃO modifique modelos Prisma fora do módulo financeiro
- NÃO altere o modelo `Projeto`, `Usuario` ou qualquer tabela de outros módulos
- NÃO execute o servidor de desenvolvimento
- NÃO faça push para o git
- NÃO torne o vínculo de documento obrigatório — deve ser sempre opcional
- NÃO crie novo sistema de upload se já existir um no projeto

## Condições de Parada:
Pause e peça revisão humana quando:
- O schema existente tiver relação conflitante não identificada neste prompt
- O mecanismo de upload existente usar provider diferente do esperado (S3, local, etc.)
- Existirem dois padrões de server action no projeto e a escolha afetar consistência
- Um erro de migration não puder ser resolvido em 2 tentativas
- Qualquer mudança exigir alterar arquivos fora de `financeiro/`

## Pontos de Verificação:
Após cada etapa principal, emita: ✅ [o que foi concluído]
No final, emita resumo completo de cada arquivo criado ou alterado com descrição de uma linha por arquivo.
```

🎯 Ferramenta: Claude Code · 💡 Rastreabilidade de origem sem quebrar o modelo atual — documento é sempre opcional e reutilizável entre lançamentos de parcelamento.

---

## FASE 3 — Aging Automático + Dashboard de Vencidos

```
Objetivo:
Implementar cálculo automático de aging de recebíveis e pagáveis no SenaHub, com dashboard mostrando distribuição por faixa de vencimento e lista de itens vencidos críticos.

## Contexto (manter adiante)
- Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL, NextAuth
- Lançamentos com status PREVISTO e dataVencimento no passado = vencidos
- Aging = dias entre dataVencimento e hoje (Date.now())
- Faixas: A Vencer | 1-30 dias | 31-60 dias | 61-90 dias | 91-120 dias | 120+ dias
- Receitas vencidas = AR aging; Despesas vencidas = AP aging
- Sem sistema de notificação automática nesta fase — apenas visualização

## Estado Inicial:
- Tabela `Lancamento` com campos: tipo (RECEITA | DESPESA), status, dataVencimento, valorPrevisto, valorEfetivo
- Dashboard financeiro existente em `app/(dashboard)/financeiro/`
- Nenhum cálculo de aging existe hoje

## Estado-Alvo:
1. Função utilitária `calcularAging(dataVencimento: Date): AgingBucket` em `lib/financeiro/aging.ts`
   - Retorna: { faixa: string, diasAtraso: number, cor: 'green' | 'yellow' | 'orange' | 'red' | 'critical' }
2. Server action `getAgingReport(tipo: 'RECEITA' | 'DESPESA'): AgingReport` que:
   - Agrupa lançamentos PREVISTO por faixa de aging
   - Retorna { totalVencido: Decimal, porFaixa: AgingFaixa[], topVencidos: Lancamento[] }
3. Componente `AgingWidget` em `components/financeiro/aging-widget.tsx`:
   - Duas abas: Recebíveis (AR) e Pagáveis (AP)
   - Gráfico de barras horizontal por faixa (use Recharts se já estiver no projeto, senão use barras CSS puras com Tailwind)
   - Lista dos 5 itens mais vencidos com nome, valor, dias de atraso e badge de cor
4. Widget integrado ao dashboard financeiro existente (adicionar como seção, não substituir o que existe)
5. Rota de API `GET /api/financeiro/aging?tipo=RECEITA` retornando o AgingReport como JSON

## Ações Permitidas:
- Criar arquivos em `lib/financeiro/`, `components/financeiro/`, `app/api/financeiro/`
- Adicionar seção ao dashboard financeiro existente sem remover nada
- Usar Recharts se já estiver em package.json; se não estiver, implementar com Tailwind CSS puro
- Instalar apenas pacotes já listados em package.json

## Ações Proibidas:
- NÃO instale novas bibliotecas de gráfico sem aprovação
- NÃO altere o cálculo de valorEfetivo ou status dos lançamentos
- NÃO crie jobs agendados ou cron nesta fase
- NÃO execute o servidor de desenvolvimento
- NÃO faça push para o git
- NÃO mova ou renomeie arquivos de dashboard existentes

## Condições de Parada:
Pause e peça revisão humana quando:
- O campo dataVencimento não existir na tabela Lancamento (informar o nome real do campo)
- Recharts não estiver em package.json e existir outra lib de gráfico instalada
- O dashboard existente usar padrão de layout incompatível com adição de nova seção
- Um erro de query não puder ser resolvido em 2 tentativas

## Pontos de Verificação:
Após cada etapa principal, emita: ✅ [o que foi concluído]
No final, emita resumo de cada arquivo criado ou alterado e o valor total de cada faixa de aging para uma amostra fictícia de 5 lançamentos vencidos como teste de sanidade.
```

🎯 Ferramenta: Claude Code · 💡 Aging sem dependência nova — usa Recharts se disponível, senão CSS puro, e nunca altera dados, só os lê e agrupa.

---

## FASE 4 — Workflow de Aprovação por Valor

```
Objetivo:
Implementar workflow de aprovação por alçada para despesas no SenaHub: despesas acima de um limite configurável entram em status AGUARDANDO_APROVACAO antes de poderem ser CONFIRMADAS, e o aprovador recebe notificação via painel.

## Contexto (manter adiante)
- Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL, NextAuth, Socket.io
- Modelo Lancamento atual: status enum com valores PREVISTO | CONFIRMADO
- Roles existentes no sistema: verificar enum Role no schema — provavelmente inclui ADMIN, SOCIO ou similar
- O aprovador é qualquer usuário com role ADMIN ou SOCIO (confirmar nomes reais dos roles antes de codificar)
- Limite padrão configurável: R$ 5.000,00 (deve ser editável por configuração, não hardcoded)
- Esta fase NÃO envolve e-mail — apenas notificação in-app via painel e/ou Socket.io

## Estado Inicial:
- Enum `StatusLancamento` com PREVISTO e CONFIRMADO
- Nenhum workflow de aprovação existe
- Sistema de roles já implementado via NextAuth

## Estado-Alvo:
1. Migration Prisma adicionando:
   - Valor AGUARDANDO_APROVACAO ao enum StatusLancamento
   - Campo `aprovadoPor` (userId, nullable, FK para User) no modelo Lancamento
   - Campo `dataAprovacao` (DateTime, nullable) no modelo Lancamento
   - Campo `motivoRejeicao` (string, nullable) no modelo Lancamento
   - Tabela `ConfiguracaoAprovacao` com campos: id, limiteValor (Decimal, default 5000), ativo (Boolean, default true), updatedAt
2. Lógica de negócio em `lib/financeiro/aprovacao.ts`:
   - `devePassarPorAprovacao(lancamento): boolean` — verifica tipo DESPESA e valor >= limite configurado
   - `aprovar(lancamentoId, aprovadorId): Promise<Lancamento>`
   - `rejeitar(lancamentoId, aprovadorId, motivo: string): Promise<Lancamento>`
3. Ao criar/editar uma despesa: se `devePassarPorAprovacao` for true, salvar com status AGUARDANDO_APROVACAO em vez de PREVISTO
4. Painel de aprovações em `app/(dashboard)/financeiro/aprovacoes/page.tsx`:
   - Lista de despesas AGUARDANDO_APROVACAO com valor, descrição, solicitante, data
   - Botões Aprovar e Rejeitar (rejeitar abre modal para informar motivo)
   - Visível apenas para roles ADMIN/SOCIO
5. Badge de contagem no menu lateral (ex: "Aprovações (3)") usando o contador de lançamentos pendentes
6. Notificação via Socket.io emitida para o room dos aprovadores quando uma nova despesa entrar em AGUARDANDO_APROVACAO

## Ações Permitidas:
- Criar e rodar migration Prisma
- Criar arquivos em `lib/financeiro/`, `components/financeiro/`, `app/(dashboard)/financeiro/aprovacoes/`
- Modificar formulário de lançamento para aplicar a lógica de alçada
- Modificar sidebar para adicionar badge de contagem
- Emitir eventos Socket.io para rooms de aprovadores

## Ações Proibidas:
- NÃO altere modelos Prisma fora do módulo financeiro
- NÃO implemente envio de e-mail nesta fase
- NÃO torne o workflow de aprovação aplicável a RECEITAS — somente DESPESAS
- NÃO execute o servidor de desenvolvimento
- NÃO faça push para o git
- NÃO hardcode o valor limite de R$5.000 — deve vir da tabela ConfiguracaoAprovacao

## Condições de Parada:
Pause e peça revisão humana quando:
- Os nomes reais dos roles no schema forem diferentes de ADMIN/SOCIO
- O padrão de Socket.io rooms no projeto for diferente do esperado (verificar implementação existente antes de emitir)
- A migration de enum causar conflito com dados existentes
- Existir middleware de autorização que precise ser atualizado para a nova rota /aprovacoes
- Um erro não puder ser resolvido em 2 tentativas

## Pontos de Verificação:
Após cada etapa principal, emita: ✅ [o que foi concluído]
No final, descreva o fluxo completo: criação de despesa R$6.000 → status resultante → quem vê a notificação → ações possíveis → status final após aprovação/rejeição.
```

🎯 Ferramenta: Claude Code · 💡 Limite de alçada configurável em banco de dados (não hardcoded), workflow só para despesas, notificação Socket.io sem e-mail.

---

## FASE 5 — Conciliação Bancária (OFX Import)

```
Objetivo:
Implementar importação e conciliação de extrato bancário no formato OFX no SenaHub: o usuário faz upload de um arquivo OFX, o sistema parseia as transações, as exibe lado a lado com lançamentos não conciliados e permite vinculação manual ou sugestão automática por valor/data.

## Contexto (manter adiante)
- Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL, NextAuth
- OFX (Open Financial Exchange) é formato XML/SGML exportado por bancos brasileiros (Itaú, Santander, BB, etc.)
- Estratégia de match: sugerir automaticamente quando valor e data coincidem dentro de ±3 dias e diferença de valor < R$0,01
- Conciliação é sempre confirmada manualmente pelo usuário — nunca automática
- Lançamentos já conciliados recebem flag `conciliado: true` e referência à transação bancária
- Esta fase NÃO faz integração com API bancária — apenas upload de arquivo

## Estado Inicial:
- Tabela Lancamento sem campo de conciliação
- Nenhum parser OFX no projeto
- Upload de arquivo já existe no projeto (reutilizar)

## Estado-Alvo:
1. Migration Prisma adicionando ao modelo Lancamento:
   - `conciliado` (Boolean, default false)
   - `transacaoBancariaId` (string, nullable) — ID da transação no OFX (FITID)
   - `dataConciliacao` (DateTime, nullable)
2. Novo modelo Prisma `ExtratoBancario`:
   - id, nomeArquivo, banco (string), dataInicio, dataFim, totalTransacoes (Int), importadoEm (DateTime), importadoPor (FK User)
3. Parser OFX em `lib/financeiro/ofx-parser.ts`:
   - Função `parseOFX(fileContent: string): TransacaoOFX[]`
   - TransacaoOFX: { fitid: string, tipo: 'DEBIT' | 'CREDIT', valor: Decimal, data: Date, memo: string }
   - Usar parsing de string puro (OFX antigo não é XML válido) — NÃO use biblioteca de XML genérica sem validar compatibilidade
4. Server action `importarOFX(arquivo: File, userId: string)` que:
   - Parseia o arquivo
   - Salva registro ExtratoBancario
   - Retorna lista de transações com sugestão de match para cada uma
5. Página `app/(dashboard)/financeiro/conciliacao/page.tsx`:
   - Upload de arquivo OFX com drag-and-drop
   - Após upload: tabela em duas colunas — Transação Bancária | Lançamento SenaHub
   - Linhas com match sugerido em verde; sem match em amarelo
   - Botão "Vincular" por linha (abre modal de busca de lançamento se sem sugestão)
   - Botão "Ignorar" para transações sem lançamento correspondente
   - Botão "Confirmar Conciliação" aplica todos os vínculos confirmados
6. Indicador visual na listagem de lançamentos: ícone de check verde quando `conciliado: true`

## Ações Permitidas:
- Criar e rodar migration Prisma
- Criar `lib/financeiro/ofx-parser.ts` com parser próprio (string-based)
- Criar arquivos em `components/financeiro/`, `app/(dashboard)/financeiro/conciliacao/`
- Reutilizar o mecanismo de upload de arquivo existente para receber o OFX
- Modificar listagem de lançamentos para adicionar indicador de conciliação

## Ações Proibidas:
- NÃO instale biblioteca de parsing OFX/XML sem aprovação — implementar parser string-based próprio
- NÃO concilie lançamentos automaticamente sem confirmação manual do usuário
- NÃO altere o campo `status` ou `valorEfetivo` dos lançamentos durante a conciliação
- NÃO execute o servidor de desenvolvimento
- NÃO faça push para o git
- NÃO crie integração com API de banco nesta fase

## Condições de Parada:
Pause e peça revisão humana quando:
- O formato OFX do arquivo de teste for SGML (não XML) e precisar de estratégia de parsing diferente
- O mecanismo de upload existente não suportar arquivos .ofx (verificar extensões aceitas)
- A tabela Lancamento não tiver campo dataVencimento ou dataLancamento para o matching por data
- O algoritmo de sugestão automática produzir mais de 30% de falsos positivos em um exemplo real
- Um erro não puder ser resolvido em 2 tentativas

## Pontos de Verificação:
Após cada etapa principal, emita: ✅ [o que foi concluído]
No final, descreva o fluxo completo com um exemplo: arquivo OFX com 10 transações → quantas com match sugerido → como o usuário confirma → o que muda na base de dados após confirmar.
```

🎯 Ferramenta: Claude Code · 💡 Parser OFX string-based próprio (bancos BR exportam SGML, não XML puro), conciliação sempre manual, sem integração com API bancária.

---

## Ordem de execução recomendada

```
Fase 2 → Fase 3 → Fase 4 → Fase 5
```

- **Fase 2 primeiro** porque `DocumentoFinanceiro` pode ser referenciado no aging (ex: mostrar número da NF no aging report)
- **Fase 3 antes de Fase 4** porque o dashboard de aging pode incluir uma faixa "Aguardando Aprovação"
- **Fase 5 por último** porque depende de lançamentos já existentes e idealmente de dados confirmados (Fase 4)

Cada prompt é independente e pode ser executado isoladamente se a dependência não for necessária no seu contexto atual.
