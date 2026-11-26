# Pool de recursos, parte 6: parceiro externo com nome

Data: 27/11/2026. Branch `feat/pool-recursos`. Fontes: decisão 4 do Ryan (`specs/2026-11-25-pool-de-recursos-decisoes-ryan.md`),
item 3.3.6 de `docs/melhoria-pool-de-recursos.md` e §1, §3.8 e §4 de `specs/2026-11-25-pool-de-recursos-design.md`.

## O que entra

- **Cadastro simples** em Recursos → aba **Parceiros externos** (`/recursos/parceiros`): nome e disciplina (catálogo,
  opcional). É uma lista única para todos os projetos.
  - Vê quem vê Recursos.
  - Cadastra, edita, arquiva e exclui quem gere Recursos (`recursos:gerir`, só interno). Não há permissão nova.
- **Na EAP**, a etapa de terceiro (o recurso Externo) ganha o nome do parceiro ("Externo: Eqp. Climatização"). O Externo
  sem nome continua valendo. Tudo o que vale para a linha de terceiro continua igual: sem horas, sem card, sem custo e sem
  alerta.
- **Tela por pessoa:** cada parceiro tem uma faixa própria com o selo "Só prazos · sem horas e sem alerta".
  - Na faixa, só se muda o início, com as mesmas regras do arrasto.
  - O parceiro se troca na EAP.
- **Planejamento geral e coluna Recursos da EAP:** mostram o nome do parceiro.

## Regras

- **Nome:** único sem diferença de maiúscula (índice `lower(btrim(nome))`). Os espaços são juntados. Tem de 2 a 80
  caracteres.
- **Só no Externo:** `EapAtribuicao.parceiroId` só existe no papel `ext` (CHECK no banco). A FK é `Restrict`, e por isso
  o parceiro em uso se arquiva, não se exclui.
- **Arquivado:**
  - sai das escolhas da EAP e só fica nas tarefas que já o tinham;
  - na tela por pessoa, tem faixa só com tarefa na janela (o ativo tem faixa sempre);
  - não entra em tarefa nova (duplicar o projeto e colar um bloco gravam o Externo sem nome).
- **Ctrl+Z da EAP:** o parceiro vai na foto. Se ele foi excluído depois da foto, a etapa volta como Externo sem nome.
- **Arrasto entre faixas:** da faixa do parceiro para a de uma pessoa, ou ao contrário, é recusado com o motivo.

## Código

- Migração `20261127120000_pool_recursos_parceiro_externo`.
- `modules/planejamento/parceiros/` (`regras.ts` + teste, `service.ts`, `actions.ts`, `queries.ts`).
- `salvarAtribuicao.parceiroId`.
- `montarPlanejador.parceiros` e `LinhaAgendada.parceiro`.
- `textoRecursos` diz "terceiro: X".
- Smoke `npm run smoke:parceiro-externo`.
