# Editar o modelo de EAP na plataforma

**Pedido do dono (2026-09-27):** "permitir edição manual do modelo já na plataforma como se editando uma EAP
em um projeto, com visualização dos Gantts, predecessores, etc. Evita o trabalho de editar um detalhe em um
novo arquivo."

Muda a regra da decisão #5 ("editar um modelo é reimportar o arquivo; a autoria continua no MS Project",
`docs/superpowers/specs/2026-09-25-planejamento-motor-pendencias.md` §Modelos de EAP). A importação continua
existindo e continua criando um modelo novo; o que muda é que um modelo gravado passa a ser editável aqui.

## Decisões (tomadas na implementação; o dono confere em tela)

| # | Decisão | Por quê |
|---|---|---|
| M1 | A edição acontece **na tela, em memória**, e grava o modelo inteiro em **Salvar**. Aviso de alteração não salva; **Descartar** volta ao gravado. | O modelo é um documento JSON só (`ModeloEap.estrutura`). Gravar a cada célula seria uma Server Action por tecla, sem ganho: nada fora da tela depende do modelo enquanto ele é editado. |
| M2 | O Gantt mostra datas calculadas pelo **mesmo motor** (`agendar`) a partir de um **início de referência** (padrão: próximo dia útil; ajustável), com os feriados do servidor. As datas **não são gravadas**. | O modelo não tem data (quem manda é o motor, no projeto). As datas servem para ver a forma do cronograma: caminho crítico, sobreposição, término em dias úteis. |
| M3 | Edita-se o que o modelo tem: **nome, duração (0 = marco), predecessoras** (tipo e defasagem), **inserir acima, adicionar no fim, recuar, avançar, excluir** (com as subtarefas), e na janela da linha **disciplina, fase e etapa de terceiro**. | Pessoas, horas, %, datas reais e restrições (datas absolutas) não existem no modelo — são decisão do projeto (manual, "O que vem do arquivo"). |
| M4 | As regras de árvore e de duração são **as mesmas do projeto** (`arvore-eap.ts`, `edicao-linha.ts`, `ciclo-dependencias.ts`), aplicadas ao JSON por funções puras (`modelos/edicao.ts`). | Um modelo editado aqui se comporta como uma EAP editada no projeto — e aplicar o modelo depois dá o mesmo resultado. |
| M5 | O servidor valida **integridade**, não só formato: ids únicos, pai e predecessora existentes, sem ciclo na árvore nem nas dependências, pai que não é marco, disciplina e fase existentes no catálogo. | O schema Zod da estrutura confere a forma; um JSON bem formado com uma predecessora apontando para uma linha excluída quebraria a aplicação no projeto. |
| M6 | **Conflito de edição:** a tela manda a versão (`updatedAt`) que abriu; se o modelo mudou depois, o servidor recusa com frase ("recarregue"). | Duas pessoas editando o mesmo modelo: a segunda apagaria o trabalho da primeira sem saber. |
| M7 | Mesma permissão dos modelos (`planejamento:gerir`). Quem só vê (`planejamento:ver`) tem o Gantt em leitura. Auditoria só do cabeçalho e totais, como `salvarModeloEap` (a estrutura tem ~100 KB). | Quem monta a EAP é quem guarda o molde dela (actions.ts). |

## Fases

- [x] **F1 — regras puras** (`modules/planejamento/modelos/edicao.ts` + teste): as operações de M3 sobre
  `LinhaModelo[]`, a validação de integridade de M5 e o id de linha nova (`novo-N`, determinístico).
- [x] **F2 — linhas do Gantt** (`modelos/gantt-modelo.ts` + teste): `LinhaModelo[]` → entrada do motor →
  linhas no formato do `PlanoGantt` (`EapTarefaDTO`), com código EAP, disciplina e fase pelo nome.
- [x] **F3 — gravar** (`editarEstruturaModeloEap` em `modelos/actions.ts`, serviço `salvarEdicaoDoModelo`):
  M5, M6, M7.
- [x] **F4 — tela** (`components/planejamento/modelos/modelo-eap-editor.tsx`): `PlanoGantt` com as edições,
  menu da linha (ADR-0002, descritor puro `itensDeLinhaModelo`), janela da linha, início de referência,
  Salvar/Descartar, aviso ao sair com alteração. A página `/planejamento/modelos/[id]` troca a árvore
  somente leitura por ela.
- [x] **F5 — manual** (`docs/manual/projetos/modelos-de-eap.md`): seção "Editar o modelo".

## Verificação

Testes das funções puras; no navegador, com um modelo real: editar nome e duração na célula, predecessora
por texto (`3TI+2d`), inserir, recuar, avançar, excluir, janela da linha, salvar e recarregar, conflito com
duas abas, e a 390 px a página sem rolagem lateral.

**Feito em 2026-09-27 (Opus 5.5):** 25 testes novos (`edicao`, `gantt-modelo`, `acoes-modelo`) e o roteiro
no navegador com uma cópia do modelo real EDIFÍCIO (184 linhas, 29 marcos) — 21 conferências, todas
passando: nome/duração/marco/predecessora na célula, ciclo recusado, Insert, menu da linha sem os itens do
projeto (datas reais, card), excluir com confirmação, janela da linha, salvar e recarregar, aviso de conflito
na segunda aba, 390 px sem rolagem lateral. De quebra: o `Breadcrumb` não cortava (truncate em elemento em
linha) e o título longo do `CabecalhoPagina` corria por baixo das ações no celular.

**Falta:** o dono conferir em tela; ver com alguém só `planejamento:ver` que o Gantt fica em leitura (não
testado em navegador — o admin de teste tem `gerir`).
