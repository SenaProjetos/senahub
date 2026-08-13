## Objective

Auditar a implementação atual do módulo de arquivos/documentos de projeto do SENAHub e produzir um relatório factual da arquitetura existente. Esta auditoria é a base de uma refatoração para gestão documental de engenharia (Documento → Revisão → Arquivos → Status → Histórico → Tarefas), então o relatório precisa deixar claro o que já existe e pode ser reaproveitado — reescrever o que já funciona é o principal risco do projeto.

## Context

- Repositório: este projeto (SENAHub, sistema interno da Sena Projetos).
- A especificação completa da refatoração pretendida está em `docs/spec-documentos-senahub.md`. Leia-a antes de começar, apenas para saber o que procurar. **Não implemente nada dela nesta sessão.**
- Hoje o módulo se comporta como um gerenciador de arquivos/pastas. O alvo é um CDE/GED, mas isso é assunto das próximas sessões.

## Target State

Um único arquivo novo: `docs/auditoria/01-arquitetura-atual.md`, contendo o mapa completo abaixo. Nenhum outro arquivo do repositório alterado.

## Scope

- Leitura: todo o repositório (código, migrations, schema, configs de storage, rotas, testes).
- Escrita: **exclusivamente** `docs/auditoria/01-arquitetura-atual.md`.
- Do NOT touch: qualquer arquivo de código-fonte, `.env`, migrations, lockfiles, CI, banco de dados.

## Method

Leia antes de concluir qualquer coisa. Não deduza a arquitetura pelo nome dos arquivos.

1. Localize os pontos de entrada: procure por rotas, páginas e controllers que contenham `document`, `documento`, `arquivo`, `file`, `upload`, `attachment`, `anexo`, `prancha`, `revisao`/`revision`, `drawing`, `plot`.
2. Abra os arquivos encontrados. Siga os imports até as camadas de baixo (serviços, repositórios, models).
3. Para o schema, leia as migrations e o schema real, não apenas os models.
4. Use um subagente para varrer o diretório de migrations/histórico de schema e resumir só as tabelas relacionadas a arquivos/documentos/tarefas — isso mantém o output intermediário fora do contexto principal.
5. Se encontrar duas implementações concorrentes do mesmo conceito (ex.: dois uploads), registre as duas e diga qual está em uso pelas telas ativas.

## Conteúdo obrigatório do relatório

Estruture `docs/auditoria/01-arquitetura-atual.md` exatamente nestas seções:

1. **Resumo executivo** — 10 linhas no máximo: como o módulo funciona hoje, em linguagem direta.
2. **Rotas e páginas** — tabela: rota | arquivo | o que renderiza | quem consome.
3. **Componentes de UI** — tabela: componente | caminho | responsabilidade | reutilizável fora do módulo (sim/não).
4. **APIs / endpoints** — tabela: método+path | handler | payload de entrada | retorno | consumidores conhecidos (indique se algum outro módulo depende do contrato).
5. **Modelo de dados** — tabelas e colunas relacionadas a documentos, arquivos, versões, tarefas, comentários, tags/listas, permissões. Inclua chaves estrangeiras, índices e volume aproximado se conseguir consultar. Diga explicitamente: **já existe algum conceito de revisão/versão? já existe alguma coleção lógica (lista, tag, conjunto)? já existe entidade de tarefa/apontamento?**
6. **Upload, download e storage** — biblioteca usada, destino (S3, disco local, outro), convenção de path, limites de tamanho, tipos aceitos, processamento assíncrono/filas, geração de thumbnails/preview.
7. **Visualizadores** — o que existe hoje para PDF, DWG, IFC e imagens; bibliotecas e versões; suporte a zoom/pan/página; se há markup, medição ou anotação implementados.
8. **Versionamento existente** — se houver qualquer mecanismo de versão/substituição de arquivo, descreva com precisão como ele grava e o que ele sobrescreve.
9. **Análise de pranchas / nomenclatura** — qualquer função que já leia nome de arquivo, extraia código, disciplina, revisão ou metadados.
10. **Permissões** — como o sistema autoriza ações neste módulo hoje (roles, policies, middleware), e quais verbos já existem.
11. **Auditoria/log** — o que já é registrado (quem, quando, o quê) e onde.
12. **Design system** — nome e caminho dos componentes base (tabela, modal, dropdown, tooltip, badge, drawer, botão), tokens de cor/tipografia/raio, e como um novo painel lateral deveria ser construído para parecer nativo.
13. **Padrões de dados no front** — biblioteca de data fetching, cache, paginação, virtualização, debounce e skeletons já usados em outras telas.
14. **Dívidas e riscos observados** — pontos frágeis, código morto, duplicações, ausência de testes.
15. **Perguntas em aberto** — o que não deu para determinar lendo o código e precisa de resposta humana.

## Constraints

- Cada afirmação do relatório deve citar caminho de arquivo e, quando útil, número de linha. Sem citação, não afirme.
- Se não encontrar algo, escreva `NÃO ENCONTRADO` na seção correspondente. **NUNCA** invente estrutura, tabela ou função que você não leu.
- Não proponha soluções, não desenhe o novo modelo, não escreva plano de migração. Isso é da próxima sessão.
- Não instale dependências. Não rode migrations. Não execute nada que escreva no banco.
- Only make changes directly requested. Do not add features, abstractions, or files beyond what was asked.

## Acceptance Criteria

- [ ] `docs/auditoria/01-arquitetura-atual.md` existe e contém as 15 seções na ordem acima
- [ ] `git status` mostra apenas esse arquivo como novo/alterado
- [ ] Seções 5, 8 e 10 respondem explicitamente se já existem revisão, listas, tarefas e permissões granulares
- [ ] Toda tabela do relatório tem pelo menos a coluna de caminho de arquivo preenchida
- [ ] Nenhuma afirmação sem referência a arquivo

## Stop Conditions

Pare e pergunte antes de:
- Editar qualquer arquivo que não seja `docs/auditoria/01-arquitetura-atual.md`
- Rodar qualquer comando que altere estado (migration, seed, install, build que gere artefatos versionados)
- Consultar o banco de produção
- Continuar se o repositório tiver alterações não commitadas ao iniciar

## Progress

Após cada etapa: ✅ [o que foi mapeado] — [arquivos lidos]

## Session Strategy

Nova sessão. Use subagente para a varredura de migrations e para a listagem exaustiva de componentes, de modo que só o resumo entre no contexto principal.
