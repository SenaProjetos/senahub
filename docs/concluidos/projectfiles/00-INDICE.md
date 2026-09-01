# Prompts — Refatoração do módulo de Documentos do SENAHub

Sequência de prompts para Claude Code. Cada arquivo é um prompt completo, pronto para colar.
Não junte dois prompts na mesma sessão.

## Preparação (uma vez)

1. Salve a especificação completa da refatoração no repositório como `docs/spec-documentos-senahub.md`.
   Todos os prompts abaixo referenciam esse caminho.
2. Confirme que o repositório está limpo (`git status`) e crie a branch:
   `git checkout -b refactor/documentos-cde`

## Ordem de execução

| # | Arquivo | O que faz | Sessão | Escreve código? |
|---|---------|-----------|--------|-----------------|
| 1 | `01-auditoria-modulo-documentos.md` | Mapeia rotas, páginas, componentes, APIs, modelos, permissões, upload/storage e visualizadores existentes | Nova sessão | Não — só gera `docs/auditoria/01-arquitetura-atual.md` |
| 2 | `02-matriz-reuso-vs-implementar.md` | Cruza a auditoria com a spec e classifica cada requisito em REUTILIZAR / ESTENDER / IMPLEMENTAR / CONFLITO | Continuar a sessão 1 (ou nova, lendo o arquivo da auditoria) | Não — só gera `docs/auditoria/02-matriz-gap.md` |
| 3 | `03-plano-refatoracao.md` | Transforma a matriz em plano de execução por fases, com migrations, riscos e ordem de PRs | Continuar | Não — só gera `docs/auditoria/03-plano-refatoracao.md` |
| 4 | `04-fase1-execucao.md` | Implementa somente a FASE 1 (tela principal) com base no plano aprovado | Nova sessão | Sim |

Entre o passo 3 e o 4: **leia e edite o plano você mesmo**. O passo 4 executa o que estiver escrito lá.

## Avisos

- Estes prompts são para uma ferramenta agêntica com acesso real ao sistema. Revise os escopos, ações proibidas e condições de parada antes de colar. Confirme se os caminhos de arquivos e diretórios batem com o projeto real.
- Os prompts 1 a 3 são **read-only por contrato**: se o agente tentar editar código-fonte neles, interrompa e reinicie a sessão.
- Rode `/compact` por volta de 50% do contexto, não em 90%.
- Se precisar corrigir o rumo no meio de uma sessão, prefira `/rewind` a acumular correções no histórico.
