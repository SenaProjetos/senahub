## Objective

Cruzar a auditoria do módulo atual com a especificação da refatoração e classificar, requisito por requisito, o que já existe e pode ser reutilizado, o que precisa apenas ser estendido, o que precisa ser implementado do zero e o que conflita com a arquitetura atual. O objetivo é impedir que a refatoração recrie funções que já existem ou duplique tabelas.

## Context

- Auditoria do estado atual: `docs/auditoria/01-arquitetura-atual.md` — leia integralmente antes de qualquer coisa.
- Especificação alvo: `docs/spec-documentos-senahub.md` — leia integralmente.
- Se alguma seção da auditoria estiver marcada como `NÃO ENCONTRADO`, verifique você mesmo no código antes de classificar como IMPLEMENTAR. Ausência no relatório não é prova de ausência no repositório.

## Target State

Um único arquivo novo: `docs/auditoria/02-matriz-gap.md`, com a matriz completa e as análises abaixo. Nenhum arquivo de código alterado.

## Scope

- Leitura: todo o repositório + os dois documentos acima.
- Escrita: **exclusivamente** `docs/auditoria/02-matriz-gap.md`.
- Do NOT touch: código-fonte, migrations, `.env`, lockfiles, banco.

## Formato da matriz

Uma linha por requisito da especificação. Percorra a spec do item 1 ao 36 e não pule nenhum item numerado — inclusive os que forem óbvios.

| Item | Requisito | Situação | Ativo existente (arquivo/tabela/função) | Esforço | Risco de regressão | Fase | Observação |

Valores permitidos em **Situação**:

- `REUTILIZAR` — já existe e atende sem alteração. Obrigatório citar o caminho do ativo.
- `ESTENDER` — existe base aproveitável; descreva em uma frase exatamente o que muda.
- `IMPLEMENTAR` — não existe nada equivalente no repositório.
- `CONFLITO` — a spec contraria algo que já está em uso (contrato de API consumido por outro módulo, modelo de dados, permissão, comportamento em produção). Descreva o conflito e proponha duas saídas.
- `INDEFINIDO` — não é possível decidir sem informação humana. Formule a pergunta.

**Esforço**: P / M / G, com a régua declarada no topo do documento.
**Risco de regressão**: baixo / médio / alto, considerando o que já está em produção.
**Fase**: 1 a 4, conforme a estratégia de fases da spec.

## Análises obrigatórias além da matriz

Depois da matriz, inclua estas seções:

1. **Modelo de dados — decisão** — para o trio Documento / Revisão / Arquivo da spec: quais tabelas existentes cobrem o quê, o que precisa de coluna nova, o que precisa de tabela nova e o que **não** deve ser criado porque duplicaria estrutura existente. Apresente o mapeamento entidade-alvo → estrutura atual em tabela.
2. **Migrations mínimas** — lista das migrations realmente necessárias, com justificativa de uma linha cada. Se alguma exigir backfill de dados legados, diga qual e como os registros sem revisão identificável seriam tratados (nunca descartados).
3. **Compatibilidade retroativa** — endpoints e componentes consumidos por outros módulos que a refatoração toca, e como manter o contrato.
4. **Reaproveitamento de UI** — quais componentes do design system cobrem tabela densa, drawer de filtros, chips, árvore, badges, painel recolhível e modal de confirmação; e quais precisariam ser criados como componentes novos do design system (não como componentes soltos da tela).
5. **Top 10 reaproveitamentos** — os dez ativos existentes que mais reduzem trabalho, em ordem de impacto.
6. **Top 10 riscos** — os dez pontos com maior chance de quebrar algo em produção, com mitigação de uma linha.

## Constraints

- Toda classificação `REUTILIZAR` ou `ESTENDER` **DEVE** citar caminho de arquivo, tabela ou função. Sem citação, a classificação vira `INDEFINIDO`.
- **NUNCA** afirme que algo existe sem ter aberto o arquivo. Se não verificou, marque `INDEFINIDO`.
- Não escreva código, não crie migrations, não proponha diffs.
- Não recomende dependências novas nesta etapa; se achar que alguma é inevitável, liste em "pontos de decisão" ao final, com alternativa nativa.
- Only make changes directly requested. Do not add features, abstractions, or files beyond what was asked.

## Acceptance Criteria

- [ ] `docs/auditoria/02-matriz-gap.md` cobre todos os itens de 1 a 36 da spec
- [ ] Nenhuma linha com Situação vazia
- [ ] Toda linha `REUTILIZAR`/`ESTENDER` tem ativo citado com caminho
- [ ] Seções 1 a 6 presentes após a matriz
- [ ] `git status` mostra apenas esse arquivo como novo
- [ ] Existe uma lista final de perguntas para decisão humana

## Stop Conditions

Pare e pergunte antes de:
- Editar qualquer arquivo que não seja `docs/auditoria/02-matriz-gap.md`
- Rodar migration, seed, install ou qualquer comando que altere estado
- Assumir uma decisão de arquitetura quando existirem dois caminhos válidos — registre como ponto de decisão em vez de escolher sozinho

## Progress

Após cada bloco de itens da spec: ✅ [itens classificados] — [arquivos consultados]

## Session Strategy

Continuar a sessão da auditoria, se ela ainda estiver ativa e abaixo de 50% de contexto. Caso contrário, nova sessão lendo `docs/auditoria/01-arquitetura-atual.md` do início.
