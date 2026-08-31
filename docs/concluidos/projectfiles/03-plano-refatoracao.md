## Objective

Transformar a auditoria e a matriz de gap em um plano de refatoração executável em 4 fases, com ordem de PRs, migrations, pontos de rollback e critérios de aceite verificáveis. O plano será revisado por um humano antes de qualquer linha de código ser escrita, então ele precisa ser específico o bastante para ser executado sem reinterpretação.

## Context

Leia integralmente, nesta ordem:
1. `docs/auditoria/01-arquitetura-atual.md`
2. `docs/auditoria/02-matriz-gap.md`
3. `docs/spec-documentos-senahub.md`

Restrições de negócio já definidas: desktop-first (1920/1600/1440/1366); sem mocks no produto final; preservar documentos e funcionalidades existentes; não criar sistema paralelo de permissões nem segundo sistema de arquivos; migrations somente quando necessárias.

## Target State

Um único arquivo novo: `docs/auditoria/03-plano-refatoracao.md`. Nenhum arquivo de código alterado.

## Estrutura obrigatória do plano

1. **Decisões de arquitetura** — para cada ponto de decisão aberto na matriz, a recomendação, a alternativa descartada e o motivo. Máximo 5 linhas por decisão.
2. **Modelo de dados final** — entidades, colunas novas, tabelas novas, o que é reaproveitado. Inclua o mapeamento dos dados legados: como um arquivo antigo sem revisão vira Documento + Revisão sem perder histórico e sem quebrar links existentes.
3. **Plano de migrations** — uma por vez, na ordem de execução, cada uma com: o que altera, se é reversível, estratégia de backfill, e como o sistema se comporta se ela rodar sem o código novo (expand/contract).
4. **Fases 1 a 4** — para cada fase:
   - objetivo em uma frase
   - PRs em ordem, com título e escopo de arquivos de cada um
   - o que **não** entra nessa fase
   - critérios de aceite binários (verificáveis clicando na tela ou rodando teste)
   - o que pode ser feito em paralelo e o que é sequencial
   - ponto de rollback
5. **Contratos de API** — endpoints novos e alterados, com payload e retorno. Marque quais são aditivos e quais são breaking, e a estratégia de compatibilidade para os breaking.
6. **Feature flag / convivência** — como a tela nova e a antiga convivem durante a transição e qual o critério para desligar a antiga.
7. **Estratégia de testes** — o que é coberto por teste automatizado e o que exige verificação manual, por fase.
8. **Riscos e mitigação** — no máximo 10, ordenados por severidade.
9. **Estimativa** — esforço relativo por fase (P/M/G por PR), sem prometer prazo em dias.

## Constraints

- O plano **DEVE** referenciar arquivos e tabelas reais do repositório. Nada genérico.
- **NUNCA** proponha reescrever o módulo inteiro. Se uma reescrita parecer necessária em algum ponto, justifique isoladamente e ofereça o caminho incremental como alternativa.
- Nenhuma fase pode depender de mock ou dado fake para funcionar.
- Nenhum PR do plano pode tocar em mais de uma fase.
- Fase 1 **NÃO** pode exigir migration. Se a matriz indicar que exige, mova o requisito para a Fase 2 e registre isso.
- Não escreva código, snippets de implementação ou diffs. O plano é texto e tabelas.
- Only make changes directly requested. Do not add features, abstractions, or files beyond what was asked.

## Acceptance Criteria

- [ ] `docs/auditoria/03-plano-refatoracao.md` contém as 9 seções acima
- [ ] Cada PR listado tem escopo de arquivos e critério de aceite binário
- [ ] Fase 1 é entregável sem migration e sem quebrar a tela atual
- [ ] Toda migration listada tem estratégia de reversão ou justificativa de irreversibilidade
- [ ] Cada item marcado como `CONFLITO` na matriz tem tratamento explícito no plano
- [ ] `git status` mostra apenas esse arquivo como novo

## Stop Conditions

Pare e pergunte antes de:
- Editar qualquer arquivo que não seja `docs/auditoria/03-plano-refatoracao.md`
- Propor qualquer dependência nova — liste e espere aprovação
- Propor remoção ou depreciação de funcionalidade em uso
- Rodar qualquer comando que altere estado

## Progress

Após cada seção concluída: ✅ [seção] — [fontes usadas]

## Session Strategy

Continuar. Se o contexto passar de 50%, rode `/compact` focando em matriz de gap e modelo de dados antes de seguir.
