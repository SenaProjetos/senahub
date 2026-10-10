# Reunião de 08/10/2026 sobre a EAP — levantamento antes de decidir

Reunião do dono com o Tadrio testando a EAP no projeto **Arapiraca**. Este documento confronta cada pedido da
reunião com o que o sistema já faz, diz o que é forte e o que é fraco em cada caminho e recomenda uma decisão.
Nada foi implementado ainda. O paralelo com o MS Project é usado quando ajuda.

Legenda de esforço: **P** = pequeno (horas), **M** = médio (1–2 dias), **G** = grande (vários dias).

---

## 1. Responsável de cada linha vem do card da disciplina

**Reunião:** o sistema copiou a Maria Luíza (responsável do card de Estrutural) para todas as linhas de Estrutural.
Não tem como adivinhar quem faz cada atividade quando o card tem três pessoas. Conclusão: o coordenador define à mão.
Mudar na EAP não muda o card.

**Hoje:** igual ao que foi dito. "Herdar responsáveis" só preenche linha vazia, a partir do card. A EAP nunca escreve de
volta no card da disciplina.

**Forte:** é o comportamento certo. O card diz quem responde pela disciplina; a EAP diz quem faz cada atividade.
**Fraco:** nenhum relevante.

**Recomendação:** manter. Nenhum trabalho.

---

## 2. Escolher o recurso direto na célula da tabela completa

**Reunião:** clicar no recurso abre a configuração da linha inteira. Querem uma lista só de nomes, como no MS Project.
Na hora, a alocação "não salvou".

**Hoje:** a coluna "Nomes dos recursos" só mostra. Para alocar abre o diálogo da linha, escolhe a pessoa, clica
**Adicionar** e só então **Salvar**. Na reunião faltou o "Adicionar" — por isso "não atualizou".

**Forte:** o diálogo guarda papel e horas por pessoa, que o MS Project também guarda (no formulário de tarefa).
**Fraco:** dois cliques de confirmação seguidos são uma armadilha; quem vem do MS Project espera escolher na célula.

**Recomendação:** lista de nomes na célula, que grava ao escolher (como o MS Project). Papel e horas continuam no
diálogo, para quem precisa. Esforço **M**.

---

## 3. A lista de nomes vir do "pool de recursos"

**Reunião:** no MS Project existe um arquivo só de recursos compartilhado entre os projetos. Querem que a lista da
célula venha da lista de recursos do SenaHub.

**Hoje:** a lista mostra **todas as pessoas ativas da casa** (exceto clientes). Não depende de a pessoa estar cadastrada
em `/recursos`.

**Forte de hoje:** ninguém some da lista por falta de cadastro.
**Fraco de hoje:** a lista é longa e não ajuda a escolher.
**Fraco do pool estrito:** quem não foi cadastrado em `/recursos` não aparece, e alguém precisa manter esse cadastro.

**Recomendação:** continuar listando todas as pessoas da casa, mas pôr no topo quem tem a habilidade da disciplina da
linha (ver item 5) e mostrar a capacidade ao lado do nome. Esforço **P** depois do item 5.

---

## 4. Tela `/recursos`: só leitura, sem filtro por projeto

**Reunião:** a tela deve ser o pool de pessoas (capacidade, habilidades), só leitura. O filtro por projeto não carrega
ninguém, nem quem já está alocado. O "+" de alocação não serve, porque quem aloca é a EAP. O mapa de calor e a carga
real "não estão funcionando". O desempenho em horas é para olhar dentro de cada projeto.

**Hoje — o que explica o que vocês viram:**
- A carga vinda da EAP só conta para projetos com cronograma **aprovado**. O Arapiraca ainda está em rascunho, então
  o filtro, o mapa de calor e a carga planejada não mostram ninguém nele. Não é defeito de cálculo; falta a aprovação.
- O "+" é a **alocação digitada** ("Fulano 50% no projeto X"). Ela vale só para projetos **sem** cronograma aprovado; quando
  o cronograma é aprovado, a EAP passa a mandar e a digitada sai da soma.

**Conflito importante:** ficou decidido em 25/09 que os projetos já existentes **não vão ter EAP**. Para esses projetos,
a alocação digitada é a única forma de a carga das pessoas aparecer. Tirar o "+" faz esses projetos sumirem da carga e
do aviso de férias × alocação.

**Recomendação:**
- Manter a alocação digitada, mas só oferecer o "+" para projeto sem EAP. Em projeto com EAP, a célula diz "vem da EAP".
- Mostrar no filtro e no mapa de calor também a carga de cronograma em **rascunho**, em cor mais clara, para o
  planejamento ser visível antes de aprovar.
- Deixar a tela com cara de "pool": pessoas, capacidade, habilidades em primeiro plano.
- Julgar o mapa de calor de novo depois que o Arapiraca for aprovado.

Esforço **M**.

---

## 5. Uma habilidade por disciplina

**Reunião:** "Hidrossanitária e PPCI" foi cadastrada como uma habilidade só; cada disciplina deve ser separada.

**Hoje:** a habilidade é um nome livre, com uma categoria (software, disciplina, norma, outra).

**Recomendação:** criar automaticamente uma habilidade de categoria "disciplina" para cada disciplina do catálogo e
separar a combinada. É o que permite o item 3 ordenar a lista. Esforço **P**.

---

## 6. Recurso "Estagiário"

**Reunião:** "é importante criar o recurso estagiário".

**Hoje:** duas leituras possíveis.
- **A pessoa estagiária:** já aparece na lista de nomes (a lista tem todas as pessoas da casa).
- **O perfil "Estagiário" sem nome:** quando se planeja "um estagiário vai fazer isto" sem saber quem. Os perfis
  existentes são Diretor, Gerente, Coordenador, Engenheiro, Projetista, Modelador BIM, Revisor, Aprovador e Externo.
  Estagiário não existe.

**Recomendação:** se a intenção é a segunda, criar o perfil Estagiário. Esforço **P**.

---

## 7. Tipo de empreendimento gera as etapas sozinho

**Reunião:** ao criar o projeto, escolher o tipo (prédio, casa) e o sistema já criar as etapas (prédio: estudo
preliminar, básico e executivo; casa: básico e executivo). Gestão, iniciação e encerramento valem para todos, mas não
viram card de disciplina. O Tadrio alertou que essa regra muda com o tempo.

**Hoje — já existe quase tudo, em outro lugar:**
- O tipo de empreendimento está no cadastro do projeto (Residencial multifamiliar, unifamiliar, Comercial, …).
- O tipo **sugere** o modelo de EAP na aba Planejamento. Aplicar o modelo monta a EAP inteira (Gestão, Básico, Executivo,
  …) e cria as etapas de cada disciplina com o percentual de pagamento.
- Fase sem disciplina (Gestão, Encerramento) não gera card — exatamente o que foi pedido.
- O modelo vem do MS Project (XML) e é editável no sistema. Isso resolve a preocupação do Tadrio: mudar a regra é
  editar o modelo, não pedir programação.

**Fraco:** é preciso ir à aba Planejamento e aplicar o modelo à mão. E só existe o modelo de prédio; falta o de casa.

**Recomendação:** não fixar "prédio = EP+BAS+EXE" no código. Na criação do projeto, depois de escolher o tipo, oferecer
"Montar a EAP com o modelo X" já marcado. A EAP nasce em rascunho, com as etapas. Cadastrar o modelo de casa.
Esforço **M**.

---

## 8. Ponto: bloco da etapa × janela de 7 dias

**Reunião:** primeiro defenderam mostrar a tarefa conforme a data. Depois perceberam que, se a pessoa adianta ou atrasa,
ela aponta hora na atividade errada. Concluíram: mostrar a lista inteira da etapa atual (todas as atividades do Básico).

**Hoje:** o ponto mostra os cards abertos da pessoa naquele projeto cuja atividade cobre hoje **com 7 dias de folga para
cada lado**, no máximo 8. Card manual (sem cronograma) aparece sempre. Os cards só existem com cronograma aprovado.

**O que a janela de 7 dias já resolve:** quem adianta ou atrasa até uma semana continua vendo a atividade. A lista
continua curta, o que evita o problema que vocês mesmos levantaram: lista longa faz a pessoa escolher qualquer coisa.

**Pontos fracos reais de hoje:**
1. **Atividade atrasada some.** Se a atividade terminou no cronograma há mais de 7 dias e ninguém concluiu o card, ela
   sai da lista — justamente quando a pessoa ainda está trabalhando nela.
2. **O padrão do ponto é "Sem projeto".** Essa é a causa do "muita gente bate ponto sem projeto, porque é o que
   aparece primeiro". O sistema não sugere o projeto em que a pessoa tem atividade hoje.

**Pontos fracos do bloco inteiro da etapa:**
- Uma etapa de uma disciplina pode ter 10 a 15 atividades; a lista volta a ser longa.
- "Etapa atual" precisa de uma regra (pela data? pelo marco da etapa?) e erra do mesmo jeito quando a pessoa adianta
  ou atrasa a etapa inteira.

**Recomendação (híbrido):**
- Manter a janela de 7 dias como lista principal.
- Atividade **atrasada e ainda aberta nunca some**: aparece no topo, marcada "atrasada".
- Um "ver as outras da etapa" recolhido, para o caso raro de adiantar mais de uma semana.
- O ponto já abre com o projeto e a atividade de hoje sugeridos, em vez de "Sem projeto".

Esforço **M**.

---

## 9. "Terminei" × validação dos 100%

**Reunião:** a pessoa marca que terminou; quem gerencia valida os 100%. Verde = terminou e falta validar. Vermelho =
prazo estourado sem conclusão. O Gantt só anda com o que o gestor preenche.

**Hoje:**
- A pessoa conclui movendo o card para "Concluído" em Tarefas. Isso **não** muda o % da EAP. A separação pedida já
  existe.
- O % da EAP é informado pelo coordenador. O sistema já **sugere** um % a partir do checklist do card, e o coordenador
  confirma.
- O Gantt anda pelo % informado — como descrito na reunião.

**Fraco:** a EAP não mostra que o card foi concluído, então o gestor não sabe o que validar. Não há vermelho na linha.

**Recomendação:**
- Card concluído vira sugestão de 100% ("concluída por Fulano em 10/10") e deixa a linha **verde** até o gestor confirmar.
- Filtro "aguardando validação" na tabela da EAP.
- Texto **vermelho** quando o término previsto atual passou e a linha não chegou a 100%.
- Ponto a decidir: o vermelho compara com o término **atual** (o que a pessoa vê) ou com a **linha de base**? A tela de
  Saúde já compara com a linha de base. Recomendo o término atual na linha e deixar a linha de base na Saúde.

Esforço **M**.

---

## 10. "Meu trabalho" aparece vazio

**Reunião:** apareceu vazio para todos os perfis testados.

**Hoje — a causa:** a tela lista só as **disciplinas** em que a pessoa é responsável no card. Ela não lista nenhuma
atividade da EAP. Os usuários de teste foram atribuídos só nas linhas da EAP, e o admin não é responsável de
disciplina. Por isso fica vazia. Não é falta de permissão.

**Recomendação:** acrescentar "Minhas atividades" na tela: a mesma lista do ponto (item 8), com o botão "Terminei". Isso
dá à pessoa um lugar natural para concluir, sem ir ao quadro de Tarefas. Quem tem acesso a Recursos já consegue ver o
trabalho de outra pessoa nesta tela. Esforço **M** (reaproveita o item 8).

---

## 11. Card da disciplina mostrar o prazo da etapa atual

**Reunião:** o projetista vê o prazo da etapa em que está; coordenação vê todos.

**Hoje:** o card mostra o prazo final da disciplina (o maior das etapas). O prazo de cada etapa fica na janela "Etapas".
O botão "Aplicar ao projeto" do Planejamento leva as datas da EAP para os prazos da disciplina e das etapas, à mão.

**Recomendação:** mostrar "Etapa atual: Básico · prazo 15/11" no card **para todos**. Esconder os outros prazos do
projetista cria regra de acesso a mais para pouco ganho — eles continuam na janela "Etapas". O "Aplicar ao projeto"
continua manual: o prazo do card é compromisso com o cliente e não deve mudar sozinho a cada ajuste da EAP.
Esforço **P**.

---

## 12. Notificações

**Reunião:** avisar o responsável 2 dias antes do prazo (análise de projeto) e na troca de etapa. Avisar quando alguém
conclui e quando o prazo estoura. Preocupação: mudar a data gera aviso repetido.

**Hoje:** existe só o aviso de prazo da **disciplina**, 7, 3 e 1 dia antes, para os responsáveis do card e para admin e
supervisor. Nada por atividade da EAP nem por etapa.

**Risco:** um aviso por atividade gera muitas notificações; o projeto tem centenas de linhas.

**Recomendação:**
- **Um resumo diário por pessoa**, em vez de um aviso por linha: "vencem em 2 dias: A, B; atrasadas: C".
- Aviso ao coordenador quando alguém conclui (item 9): um por card.
- Atrasou: um aviso no dia seguinte ao prazo, não todo dia.
- Troca de etapa: quando o marco da etapa é concluído, avisar quem tem atividade na etapa seguinte.
- Mudar a data só gera novo aviso se a nova data cair de novo na faixa de 2 dias — é o comportamento atual.
- Decidir se o aviso da disciplina passa de 7/3/1 para 2 dias, por coerência.

Esforço **M**.

---

## 13. Como testar no Arapiraca

Os cards da EAP só nascem quando o cronograma é **aprovado**. Sem aprovar, nada chega ao ponto nem ao "Meu trabalho".
Aprovar grava a linha de base, que não se apaga; o "Replanejar" cria uma nova versão depois. Para testar sem risco,
dá para fazer o primeiro ensaio no banco de desenvolvimento com uma cópia do projeto e só depois aprovar o Arapiraca.

---

## Resumo: o que vale a pena

| Item | Valor | Esforço | Recomendação |
|---|---|---|---|
| 8 — ponto sugere o projeto e a atividade de hoje; atrasada não some | Alto | M | Fazer primeiro |
| 9 — verde, vermelho e sugestão de 100% pelo card concluído | Alto | M | Fazer |
| 10 — "Minhas atividades" com "Terminei" | Alto | M | Fazer junto com o 8 |
| 2 — recurso na célula | Alto | M | Fazer |
| 11 — etapa atual no card | Médio | P | Fazer |
| 12 — notificações em resumo diário | Médio | M | Fazer depois do 9 |
| 7 — modelo de EAP na criação do projeto | Médio | M | Fazer; cadastrar o modelo de casa |
| 5 e 3 — habilidade por disciplina e lista ordenada | Médio | P | Fazer |
| 4 — `/recursos` como pool, rascunho visível | Médio | M | Fazer sem remover a alocação digitada |
| 6 — perfil Estagiário | Baixo | P | Só se for o perfil sem nome |
| 8 — bloco inteiro da etapa no ponto | Baixo | M | Não fazer como lista principal |
| 11 — esconder prazos das outras etapas do projetista | Baixo | M | Não fazer |
| 4 — remover a alocação digitada | Negativo | P | Não fazer (quebra os projetos sem EAP) |

## Decisões do dono (09/10/2026)

1. **Ponto:** aceito o híbrido do item 8 — janela de 7 dias, atrasada aberta nunca some, "outras da etapa" recolhido,
   ponto abre com o projeto e a atividade de hoje.
2. **Vermelho:** compara com o término **atual** (previsto pelo motor). A linha de base fica na tela de Saúde.
3. **Estagiário:** é a **função** na linha da EAP. Hoje o seletor do diálogo da linha oferece Diretor, Gerente de
   projetos, Coordenador, Engenheiro, Projetista, Modelador BIM, Revisor e Aprovador; falta Estagiário.
4. **Notificação:** é a da **etapa que está por vir** — avisar antes de a próxima etapa começar. Não é aviso de prazo
   vencendo. O item 12 fica reduzido a isso (sem resumo de vencimentos, sem aviso de atraso).
5. **Teste:** ensaiar antes no banco de desenvolvimento, depois aprovar o Arapiraca.

## Plano de execução (modelo e esforço por fase)

Ordem agrupada por modelo, para trocar de modelo o mínimo possível. Opus fica com o que tem regra delicada (horas do
ponto, aviso que não pode repetir, transação entre módulos, soma de carga sem contar em dobro). Sonnet fica com tela e
ajuste pequeno, sempre a partir de regra já escrita.

| Fase | O quê | Itens | Modelo | Esforço |
|---|---|---|---|---|
| E1 | Ponto híbrido: atrasada aberta nunca some, "outras da etapa" recolhido, ponto abre com projeto e atividade de hoje. Regra pura `tarefa-ponto.ts` + testes | 8 | Opus | médio |
| E2 | Aviso da etapa que vem: 2 dias úteis antes do início da etapa, para quem tem atividade nela + coordenador; uma vez por etapa e data, mudar a data rearma | 4 (dec.) | Opus | médio |
| E3 | "Montar a EAP com o modelo X" na criação do projeto (EAP em rascunho + etapas) | 7 | Opus | médio |
| E4 | `/recursos`: carga de cronograma em rascunho visível em cor clara, sem somar em dobro com a alocação digitada | 4 | Opus | médio |
| E5 | Função Estagiário no seletor da linha (migração `ADD VALUE`) | 3 (dec.) | Sonnet | baixo |
| E6 | Verde (concluída, falta validar), vermelho (passou do término atual sem 100%), sugestão de 100% pelo card concluído, filtro "aguardando validação" | 9 | Sonnet | médio |
| E7 | "Minhas atividades" no Meu trabalho com botão "Terminei" (reusa a lista da E1) | 10 | Sonnet | médio |
| E8 | Recurso escolhido na célula da tabela, grava ao escolher; quem tem a habilidade da disciplina no topo | 2, 3 | Sonnet | médio |
| E9 | Etapa atual e prazo dela no card da disciplina | 11 | Sonnet | baixo |
| E10 | Habilidade por disciplina do catálogo; "+" de alocação só em projeto sem EAP; tela com cara de pool | 4, 5 | Sonnet | baixo |
| E11 | Ensaio no banco de dev: projeto parecido com o Arapiraca, EAP aprovada, usuários de teste por perfil, roteiro em navegador | 13 | Sonnet | médio |
| R | Revisão final do branch (`/code-review`) antes do merge | — | Opus | alto |

## Andamento

**Bloco Opus concluído (2026-10-10), branch `feat/eap-reuniao-0810`:**
- E1 `2a142fac` — ponto híbrido. Regras puras em `ponto/tarefa-ponto.ts` (`listaDoPonto`, `sugestaoDoPonto`,
  `estaAtrasada`); `tarefasParaPonto` devolve `atrasada` e `grupo` (`periodo`|`etapa`); `sugestaoParaPonto` alimenta o
  resumo do header, o card do celular e a tela /ponto. `projetosDoUsuario` passou a incluir projeto onde a pessoa só
  tem card aberto. Smoke: `smoke:ponto-tarefa`.
- E2 `75e47622` — aviso da etapa que vem. `planejamento/etapa-proxima.ts` (puro) + `etapa-proxima-service.ts`, job
  diário `aviso-etapa-proxima` 07:00, tabela `AvisoEtapaEnviado` (migração `20261010100000_aviso_etapa_enviado`),
  categoria `etapa_proxima`. Smoke: `smoke:etapa-proxima`.
- E3 `8ffd08f9` — "Montar a EAP com o modelo" na criação do projeto (exige `planejamento:gerir`; falha vira aviso,
  o projeto fica criado).
- E4 `669d56ff` — `/recursos`: carga de EAP em rascunho à parte (`PessoaCarga.rascunho`, `projetosEmRascunho`,
  chip "rasc" na matriz). Smoke: `smoke:recursos-eap`.

**Notas para o bloco Sonnet:**
- E6 (verde/vermelho): "concluída pelo responsável" = card da linha (`Tarefa.eapTarefaId`) com status `concluido` e
  linha com `progresso < 100`. Sugestão de 100% entra em `progresso-sugerido.ts` como nova origem (`card_concluido`),
  com o mesmo cuidado do arquivo: só sugere, nunca grava. Vermelho = `fim` do motor (`plano.resultado.linhas`) < hoje e
  `progresso < 100` — término ATUAL, não a linha de base (decisão 2). Regra pura com teste.
- E7 (Minhas atividades): reusar `listaDoPonto` por projeto, ou uma leitura nova em `projetos/meu-trabalho/queries.ts`
  que chame `candidatasDaPessoa` (hoje privado em `tarefa-ponto-service.ts` — exportar). "Terminei" = mover o card para
  a coluna concluída pela action existente de tarefas.
- E5 (Estagiário): `PapelEap` ganha `est`; migração só `ALTER TYPE "PapelEap" ADD VALUE 'est'` (arquivo próprio);
  atualizar `Papel`, `ROTULO_PAPEL`, `PAPEIS_DE_PESSOA`, `ORDEM_PRINCIPAL` (`recursos.ts`) e `PAPEIS`
  (`recursos-actions.ts`). O banco de dev tem drift: aplicar com `prisma db execute` + `migrate resolve --applied`.
- E10: o "+" de alocação digitada só para projeto SEM cronograma (`projetosCalculados` + `projetosEmRascunho`).

## Áudio do dono (2026-10-10) e respostas

- Por ora **não** ligar EAP → card da disciplina: coordenador e assistente alimentam os prazos do card à mão, olhando
  a EAP. PJ não bate ponto (não registra horas), mas **é inserido na EAP** pelo coordenador — o aviso da etapa que vem
  (E2) continua lendo a EAP.
- Card de cada disciplina mostra **todas as etapas com início e fim**, para o projetista saber o prazo.
- Etapas padrão: Estudo Preliminar + Básico + Executivo em todo projeto (particular e licitação); **Residencial
  unifamiliar** só Básico + Executivo (multifamiliar tem EP). Nascem a **0%**; o pagamento por fase espera a soma
  fechar 100%.
- Botão "Enviei os documentos desta etapa para análise": só **responsáveis da disciplina**; desfaz enquanto a
  coordenação não aprovou; avisa **coordenação do projeto e projetista**.

**Feito em Opus:** C1 `d6cda2be` (etapas padrão em toda criação de disciplina — `semearEtapasPadrao`; `DisciplinaEtapa.
inicio`; `TipoEmpreendimento.semEstudoPreliminar`, migração `20261010110000_etapa_inicio_tipo_sem_ep` marca o
unifamiliar) e C2 `8593530e` (`envio-etapa*.ts`, actions `enviarEtapaAnalise` / `desfazerEnvioEtapaAnalise`). Smoke:
`smoke:etapas-card`.

**Efeitos a lembrar:** disciplina com etapa tem o prazo = maior prazo das etapas e não se edita direto (F4); com as
etapas a 0%, o pagamento da disciplina passa a ser por fase e fica bloqueado até a soma fechar 100%.

**C3 (Sonnet, médio) — card da disciplina** (`components/projetos/disciplina-card.tsx`): listar todas as etapas
(`EtapaParaTela`, agora com `inicio`) com início, fim e situação, para todo mundo que vê o card; botão "Enviei os
documentos" / "Desfazer envio" só para responsável, desabilitado com a frase de `envio-etapa.ts`; editor de etapas
(`disciplina-etapas-dialog.tsx`) ganha o campo de início (`salvarEtapaDisciplina` já aceita `inicio`).

## Estado final (2026-10-10)

Tudo o que a reunião, o áudio e as respostas do dono pediram está implementado em `feat/eap-reuniao-0810` (sem push):
E1–E11, C1–C3, o aviso ao gestor quando alguém conclui, e o preenchimento dos percentuais do modelo nas etapas zeradas.
Verificação: `smoke:eap-integracao` (ponta a ponta), `smoke:ponto-tarefa`, `smoke:etapa-proxima`, `smoke:etapas-card`,
`smoke:conclusao-eap`, `smoke:recursos-eap`, testes unitários e conferência em tela com `ensaio:eap`.

**Deploy:** 4 migrações aditivas (`aviso_etapa_enviado`, `etapa_inicio_tipo_sem_ep`, `papel_eap_estagiario`,
`habilidade_por_disciplina`), sem seed. Disciplinas já existentes NÃO ganham as etapas padrão.

**Tipos de empreendimento na tela (pedido do dono, 2026-10-10 — "quanto mais personalizável sem SQL, melhor"):**
`/configuracoes/tipos-empreendimento` (nome, etapas em que a disciplina nasce, ordem, ativar/desativar, excluir sem uso).
A flag `semEstudoPreliminar` foi substituída por `etapasPadraoIds` (migração `20261010140000`, que converte e remove a flag).
Com isso a conferência do nome "unifamiliar" em produção deixa de ser necessária: se o nome não casar, o time ajusta na tela.

**Em aberto (fora desta entrega):**
- Cadastrar um modelo de EAP de CASA (o EDIFÍCIO aplicado em unifamiliar traz linhas de Estudo Preliminar sem fase).
- O modelo EDIFÍCIO não traz percentual do Estudo Preliminar: em multifamiliar as etapas seguem a 0% até o coordenador
  preencher (ou o percentual do EP entrar no modelo).
- Separar a habilidade combinada "Hidrossanitária e PPCI" (RH).
- Testar com o Arapiraca de verdade só depois do ensaio conferido pelo time; aprovar grava a linha de base.
