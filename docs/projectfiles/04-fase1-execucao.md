## Objective

Implementar a FASE 1 da refatoração da tela de Documentos do SENAHub — e somente ela — seguindo `docs/auditoria/03-plano-refatoracao.md`. Fase 1 é experiência da tela principal: painel de disciplinas/listas, seletor de fases, pesquisa, filtros, tabela densa, seleção múltipla e ações. Sem mudança de modelo de dados.

## Context

Leia antes de escrever qualquer código:
1. `docs/auditoria/03-plano-refatoracao.md` — este é o contrato desta sessão; a seção "Fase 1" define os PRs e o escopo
2. `docs/auditoria/02-matriz-gap.md` — o que é REUTILIZAR e o que é IMPLEMENTAR
3. `docs/auditoria/01-arquitetura-atual.md` — onde estão os componentes e padrões existentes
4. Os arquivos de código citados no escopo da Fase 1, antes de editá-los

Se o plano e esta instrução divergirem, o plano vence — e você me avisa da divergência antes de prosseguir.

## Target State

- Tela de documentos funcionando com painel esquerdo (abas Disciplinas / Listas), seletor horizontal de fases, pesquisa com debounce, drawer de filtros com chips e "Limpar todos", tabela densa com colunas configuráveis, checkbox e toolbar de seleção múltipla.
- Dados reais, vindos das APIs existentes. **Zero mock** no código entregue.
- Nenhuma funcionalidade atual do módulo removida.
- Nenhuma migration.

## Scope

- Work only in: os arquivos e diretórios listados no escopo dos PRs da Fase 1 em `docs/auditoria/03-plano-refatoracao.md`.
- Do NOT touch: migrations, schema, `.env`, lockfiles, CI, módulos fora de Documentos, contratos de API consumidos por outros módulos, o visualizador de documentos (Fase 3).

## Constraints

- Use exclusivamente componentes e tokens do design system existente do SENAHub. **NUNCA** introduza cor, tipografia, raio ou espaçamento fora dos tokens. A tela deve parecer nativa do sistema.
- Nenhuma dependência nova sem aprovação explícita.
- Filtros, status, fases e disciplinas vêm de configuração/backend. **NUNCA** hardcode labels ou listas em componentes.
- Pesquisa com debounce; listagem com paginação ou virtualização conforme o plano; skeleton nos estados de carregamento.
- Estados obrigatórios implementados: loading, vazio, erro, sem resultado de filtro, sem permissão.
- Toda ação nova respeita o sistema de permissões existente. Ação não permitida não aparece no menu.
- Um PR por vez. Ao terminar um PR do plano, pare, reporte e espere a próxima instrução — **NÃO** emende o próximo automaticamente.
- Only make changes directly requested. Do not add features, abstractions, or files beyond what was asked. Nada de Fase 2, 3 ou 4 nesta sessão.

## Acceptance Criteria

- [ ] Todos os critérios de aceite da Fase 1 do plano estão marcados
- [ ] Busca por código, título, descrição, disciplina e tags retorna resultado correto e não dispara request por tecla
- [ ] Filtros combinados funcionam, geram chips removíveis e contador no botão
- [ ] Seleção múltipla exibe contagem e toolbar; operações destrutivas passam por modal de confirmação
- [ ] Tabela permanece utilizável em 1366px sem scroll horizontal indevido; painel esquerdo recolhível
- [ ] `grep` por mock/fixture/dado fake no diff volta vazio
- [ ] Fluxos existentes (upload, download, abrir documento) continuam funcionando
- [ ] Build e testes passam; nenhum arquivo fora do escopo alterado no diff

## Stop Conditions

Pare e pergunte antes de:
- Deletar qualquer arquivo
- Adicionar qualquer dependência
- Criar ou alterar migration, schema ou qualquer estrutura de banco
- Alterar contrato de endpoint existente
- Tocar em qualquer arquivo fora do escopo dos PRs da Fase 1
- Concluir que um requisito da Fase 1 é inviável sem mudança de dados — nesse caso, relate e pare

## Progress

Após cada etapa: ✅ [o que foi feito] — [arquivos afetados]
Ao final de cada PR: resumo do diff, critérios atendidos, o que ficou pendente.

## Session Strategy

Nova sessão, dedicada à Fase 1. Um PR por vez. Se precisar investigar um componente ou padrão do design system, use subagente para a busca e traga só a conclusão.
