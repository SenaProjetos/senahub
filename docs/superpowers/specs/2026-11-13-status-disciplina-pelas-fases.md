# Status da disciplina vem das fases

Data: 2026-11-13 (revisado no mesmo dia) · Branch: `feat/status-disciplina-fases`, a partir de `dev` ·
Estado: **aprovado pelo dono (2026-11-13, os 5 pontos da seção 9 como recomendados) e implementado**

## 1. Origem

Ponto levantado olhando o card da disciplina "Incêndio (PPCI)": a pílula da disciplina diz **Em revisão** e,
logo abaixo, a fase EX diz **Aguardando**. Dois status ao mesmo tempo, que parecem se contradizer. Sugestão
original: tirar o status da disciplina e deixar só o das fases.

Decisão do dono (2026-11-13): **o status da disciplina passa a ser calculado a partir das fases e gravado no
banco**. Disciplina com fases perde a troca manual; o trilho continua no card e mostra o status calculado.

## 2. Por que não é só uma mudança de tela

Hoje a disciplina e cada fase têm **duas máquinas de estado independentes** sobre o mesmo enum
`StatusDisciplina` (`aguardando · em_andamento · em_revisao · entregue · aprovado`):

- `Disciplina.status`: escrito pela troca manual, pela edição em massa, pela aprovação (validação por arquivo e
  fluxo de pastas), pela reabertura e pelo envio de apontamentos. Lido pelo % do projeto (`PESO_STATUS`), pela
  saúde do projeto, por "concluir projeto", pelo próximo passo do card (`proximo-passo.ts`), pelos dashboards,
  pelo portal do cliente e pelo cronograma.
- `DisciplinaEtapa.status` (a fase): escrito pelo editor de etapas, pelo "Enviei os documentos", pela aprovação
  da fase ou da disciplina (pagamento por fase) e pelo marco da EAP.

O que mostra o buraco, no código atual:

| Situação | O que grava hoje | Efeito no card |
| --- | --- | --- |
| Reabrir disciplina aprovada (`reabrirDisciplina`) | só `Disciplina.status = em_revisao`; as fases seguem como estavam | pílula "Em revisão", fases "Aprovado" (ou "Aguardando", se a disciplina foi paga inteira antes das fases) |
| Coordenação envia apontamentos numa disciplina aprovada (`enviarApontamentos`, ramo `eraAprovada`) | só `Disciplina.status = em_revisao` | o mesmo |
| Troca manual para "Em revisão" | só a disciplina | o mesmo; qualquer um dos três produz o print |
| Projetista trabalhando, sem clicar em nada | nada nas fases; a disciplina só vai a "Em andamento" por clique | disciplina "Aguardando" com trabalho em curso |
| Aprovar a disciplina inteira sem ninguém pagável (100% CLT) | `liberarPagamentosProjetista` sai cedo e **não aprova as fases** | disciplina "Aprovado", fases "Aguardando" |

Uma regra ingênua ("aprovado se todas as fases estão aprovadas…") daria "Aprovado" para uma disciplina
reaberta e esconderia a revisão. Por isso a regra vem junto com ajustes nos escritores (seção 4).

## 3. Regra

Função pura `statusDaDisciplinaPelasFases(fases, atual)` em `modules/projetos/status-pelas-fases.ts`
(sem Prisma/Next, testada). As regras são lidas em ordem e a primeira que vale decide:

1. **Sem fase** → `atual`. A disciplina continua manual, como hoje.
2. **Alguma fase `em_revisao`** → `em_revisao`.
3. **Todas `aprovado`** → `aprovado`.
4. **`atual` é `aprovado`** → continua `aprovado`. Cobre a disciplina aprovada antes de ganhar fases e a fase
   nova acrescentada depois da aprovação. Recalcular nunca tira uma disciplina de aprovado; só a regra 2 tira.
5. **Todas `entregue` ou `aprovado`** → `entregue`. Como a regra 3 não valeu, há pelo menos uma `entregue`.
6. **Alguma fase fora de `aguardando`** → `em_andamento`. Inclui uma fase aprovada ou entregue com as outras
   ainda pendentes.
7. Senão → `aguardando`.

Exemplos:
- EP aprovada, BS e EX aguardando → Em andamento.
- EP e BS entregues, EX aguardando → Em andamento.
- As três entregues → Entregue.
- EX em revisão → Em revisão.
- O print do PPCI (EX aguardando, nenhuma outra fase andando) → Aguardando. A revisão só aparece se uma fase
  estiver de fato em revisão (seção 4).

A derivação **não passa pela tabela `TRANSICOES_DISCIPLINA`**: o resultado pode saltar, por exemplo de
aguardando para entregue quando a única fase é enviada. A tabela continua valendo para disciplina sem fase.

### Escopo

Vale para disciplina que **tem pelo menos uma fase e não usa o fluxo de pastas** (`disciplinaUsaPastas`).
O fluxo de aprovação em 2 etapas (tipos aprovação e laudo) grava `entregue` e `em_andamento` por conta própria e
guarda `aprovacaoSolicitadaEm`. As fases nascem sozinhas só em projeto `particular`/`licitacao`, então os dois
mundos quase não se cruzam. Quando se cruzarem, a disciplina fica **fora** da derivação (ponto 1 da seção 9).

## 4. Ajustes nos escritores

Para a regra não mentir, a fase precisa carregar a revisão:

- **Fase `aprovado → em_revisao` vira exceção sancionada**, só pelos dois caminhos abaixo. A fase mantém
  `liberadaEm`, `valorPagamento` e os `PagamentoProjetista`: o pagamento já liberado não se mexe, como
  `reabrirDisciplina` faz hoje. O editor (`transicaoEtapaPermitida`) continua sem aceitar essa transição.
- **`reabrirDisciplina`** põe em `em_revisao` a fase que **define o prazo** (`etapaQueDefineOPrazo`, a mesma que
  recebe o novo prazo), **qualquer que seja o status dela**. Exemplo: disciplina paga inteira antes das fases,
  com as fases ainda em "aguardando". O `Disciplina.status = em_revisao` passa a sair do recálculo. Disciplina
  sem fase mantém a escrita direta de hoje.
- **`enviarApontamentos` em disciplina aprovada** põe em `em_revisao` a fase do documento apontado
  (`upload.documento.faseId`, de `DocumentoDisciplina`). Upload sem documento, ou documento sem fase, usa a fase
  que define o prazo.
- **Reaprovação global** (`validarEntrega` e `confirmarAprovacaoDisciplina`, no ramo `jaTemPagamento`): além de
  gravar a disciplina `aprovado`, leva a `aprovado` **toda fase que ainda não está aprovada**, sem pagamento novo
  e sem mexer em `liberadaEm`. Nesse ramo, no modo por fase, toda fase já foi liberada. No modo "disciplina
  inteira", nenhuma fase libera pagamento. Assim, aprovado e pagamento continuam coerentes.
- **Reaprovação de uma fase** (`aprovarEtapaDisciplina`): fase em revisão com `liberadaEm` preenchido volta a
  `aprovado` **sem pagamento novo**. A mesma checagem de publicação (`documentosPendentesDePublicacao`)
  continua valendo. Hoje a ação recusa com "Esta fase já foi aprovada". `liberarPagamentosDaFase` devolve
  `jaLiberada` **sem gravar status**, então essa volta precisa de escrita própria, condicionada ao status
  `em_revisao` lido.
- **Primeira aprovação global** (`liberarPagamentosProjetista`): aprova as fases que faltam **também no ramo
  100% CLT**, e também a fase já liberada que voltou a revisão (sem pagamento novo). Hoje esse ramo sai cedo, sem tocar nas fases. `liberarPagamentosDaFase` já sabe liberar uma fase
  sem pagável com R$ 0 (decisão #9), sem exigir que os percentuais fechem 100%. Basta chamá-la para cada fase
  pendente, nos dois ramos.
- **Marco da EAP concluído** (`execucao-service.ts`): já põe a fase em `entregue`; só ganha a chamada de recálculo.

O que não muda:
- "Enviei os documentos" (`aguardando`, `em_andamento` ou `em_revisao` → `entregue`).
- Desfazer o envio (volta a `em_andamento`).
- Pagamento por fase e pool congelado.
- Fluxo de pastas.

## 5. Um único ponto de recálculo

`recalcularStatusDisciplina(tx, disciplinaId, { autorId, motivo })` em
`modules/projetos/status-pelas-fases-service.ts`:

- **Trava a linha da disciplina** (`SELECT … FROM "Disciplina" WHERE id = $1 FOR UPDATE`) e **só depois** lê as
  fases. Grava o resultado sem condição. Condicionar a escrita ao status lido (`updateMany where status = lido`)
  estaria **errado** aqui: duas fases mudando ao mesmo tempo leriam cada uma a sua versão das fases, a segunda
  escrita daria `count 0` e o status final ficaria calculado sem a mudança da outra. Com a trava, os recálculos
  da mesma disciplina rodam em fila. Cada um lê as fases depois de pegar a trava (no READ COMMITTED cada comando
  vê o que já foi confirmado), então o último a gravar enxerga todas as mudanças.
- Recebe SEMPRE a transação de quem mudou a fase: a mudança da fase e o recálculo confirmam juntos. Quem antes
  escrevia a fase sem transação (`envio-etapa-service.ts`, `execucao-service.ts`) passou a abrir uma em volta da
  escrita e do recálculo.
- **Ordem única das travas:** toda transação que escreve fase chama `travarDisciplina(tx, id)` ANTES de tocar na
  fase (envio/desfazer, editor, excluir, aprovar/reaprovar fase, aprovação global, marco, reabertura,
  apontamentos). Todos travam disciplina → fases, e dois caminhos cruzados esperam um pelo outro em vez de dar
  deadlock. As reaprovações releem `situacaoPagamento` sob a trava (fase nova no meio recusa com "A disciplina
  mudou…") e gravam a disciplina com `updateMany` condicionado a `status ≠ aprovado`.
- Mantém a regra de `entregueEm` de hoje:
  - guarda a 1ª data ao ir a `entregue`;
  - limpa ao voltar para antes da entrega;
  - em `aprovado`, grava a data da aprovação.
- Só escreve quando o status muda. Quando muda, grava `AuditLog`: `acao: "status-derivado-das-fases"`,
  `entidade: "Disciplina"`, antes e depois, e o `motivo` (qual fase mudou e por qual ação). A mutação derivada
  precisa de auditoria mesmo sem passar pelo `defineAction` da disciplina.
- **Não notifica por si.** Quem muda a fase já notifica (envio, aprovação da fase, reabertura, apontamentos). A
  exceção é o aviso "Entrega aguardando validação" que a troca manual para Entregue mandava aos validadores: ele
  passa a sair de `avisarSeDisciplinaEntregue`, chamado depois da transação quando o recálculo leva a disciplina a
  `entregue` (envio da fase, editor e marco da EAP), com a mesma audiência, categoria e tag.

Chamadores, ou seja, todo caminho que muda o status de uma fase ou o conjunto de fases:

1. `salvarEtapaDisciplina` (status e criação de fase) e `excluirEtapaDisciplina` (muda o conjunto).
2. `enviarEtapaParaAnalise` e `desfazerEnvioEtapa` (`envio-etapa-service.ts`).
3. `aprovarEtapaDisciplina` → `liberarPagamentosDaFase`, ramos PJ e 100% CLT, e a reaprovação da seção 4.
4. `liberarPagamentosProjetista` e a reaprovação global (`validarEntrega`, `confirmarAprovacaoDisciplina`).
5. `execucao-service.ts` (marco → fase entregue).
6. `reabrirDisciplina` e o ramo `eraAprovada` de `enviarApontamentos`.
7. Criação de fases em lote: `etapas-service.ts` (semear), `planejamento/modelos/service.ts`,
   `planejamento/modelos/disciplina-service.ts`, `projetos/duplicar-service.ts`. A fase nova nasce `aguardando`;
   numa disciplina `aprovado`, a regra 4 mantém aprovado.

**Guarda em teste** (mesmo desenho de `responsaveis-guarda.test.ts` e do `natureza-ok:` do financeiro): toda
chamada a `disciplinaEtapa.(update|updateMany|create|createMany|upsert|delete|deleteMany)` em `src/` precisa
estar num arquivo que chama `recalcularStatusDisciplina`, ou ter `// recalculo-ok: <motivo>` na linha ou acima.
Escritas que **não** mexem em status nem no conjunto, e por isso levam o marcador:
- `uploads/pagamento.ts` (`valorPagamento` no write-back);
- `planejamento/actions.ts` (prazo vindo do cronograma);
- `projetos/actions.ts`, na reabertura (o prazo; o status sai da chamada nova);
- `planejamento/modelos/service.ts` (percentual).

A guarda é uma rede, não uma prova, como as outras do repo.

## 6. Troca manual do status da disciplina

- `atualizarStatusDisciplina`: se a disciplina tem fases e não usa pastas, **recusa** com "O status desta
  disciplina vem das fases. Mude o status da fase." A mesma frase é o motivo do item desabilitado. Sem fase,
  continua como hoje.
- Edição em massa de status (`projetos/actions.ts`, junto da trava do prazo em massa): mesma recusa, nomeando a
  disciplina, no padrão que já existe para o prazo ("tem etapas — o prazo dela vem das etapas e não muda em
  massa").
- Descritor puro (ADR-0002): `DisciplinaParaAcoes` ganha `statusDasFases: boolean`. Com ele, "Mudar status" de
  `itensDeDisciplina` fica **desabilitado com o motivo** (`MOTIVO_STATUS_DAS_FASES`): ter fases é estado da
  disciplina (some ao remover as fases), e o ADR-0002 manda desabilitar o que o estado impede.

## 7. Tela

- Pílula no cabeçalho do card: com `statusDasFases`, **sem dropdown**, só rótulo, no mesmo visual e sem chevron,
  com `title` "Calculado a partir das fases". Disciplina sem fase mantém o dropdown.
- **Trilho** (`TrilhoEtapas`): fica e mostra o status calculado. O componente não muda, só a fonte.
- Selo da fase em `EtapasDoCard`: igual. A contradição do print some porque os dois passam a falar do mesmo dado:
  disciplina "Em revisão" sempre terá uma fase "Em revisão" na lista.
- Próximo passo, dashboards, portal do cliente e cronograma passam a ler o status calculado sem mudança de código.
  O portal do cliente vai ver a mudança. Fica registrado para o dono.
- Guia de Projetos (`guia-projetos-view.tsx`, blocos do fluxo de status) e `docs/manual/`: atualizar a explicação
  do status da disciplina. Em `docs/manual/novidades.md`, uma linha em linguagem de usuário.

## 8. Migração dos dados existentes

`scripts/recalcular-status-disciplinas.ts` (`npm run disciplinas:recalcular-status [-- --gravar]`):

- **Só lê por padrão**, numa transação `READ ONLY`, e só grava com `--gravar`. Imprime, por projeto, as
  disciplinas cujo status mudaria (de → para, com as fases) para o dono conferir antes.
- O que se espera:
  - disciplina hoje em `em_andamento` ou `em_revisao` por clique manual, com todas as fases em "aguardando", cai
    para `aguardando` (o próprio caso do print). Isso baixa o % do projeto;
  - disciplina `aprovado` não muda (regra 4).
- Com `--gravar`, usa o mesmo `recalcularStatusDisciplina`: mesma trava e mesma auditoria, com `motivo:
  "migração"` e `autorId` nulo.
- Sem correção de fase: fase antiga fica como está. O que estiver errado, o dono vê no relatório e corrige pela
  fase.
- Roda uma vez no deploy, depois do código, como `converter-duracao-eap.ts`.

## 9. Pontos a confirmar com o dono

1. **Disciplina com pastas e fases fica fora da derivação** (seção 3). A alternativa é derivar também e fazer o
   fluxo de pastas escrever nas fases. Recomendação: fora, até aparecer um caso real.
2. **A reabertura marca só a fase que define o prazo**, não todas. A alternativa é todas as fases aprovadas
   voltarem a revisão. Recomendação: só uma, coerente com onde o novo prazo é gravado.
3. **A pílula do cabeçalho fica como rótulo.** Com a derivação, ela e o trilho dizem o mesmo. Se ficar
   redundante, removê-la é uma linha. Recomendação: manter por ora, porque é a leitura rápida no celular, onde o
   trilho mostra só a etapa atual.
4. **% do projeto continua por status** (`PESO_STATUS`: em andamento 40%, entregue 85%). Com o status calculado,
   "uma fase de três aprovada" vale 40%, e não a fatia das fases aprovadas. Recomendação: fora deste escopo. Se o
   dono quiser, o passo seguinte é o progresso pelos percentuais das fases.
5. **Apontamentos numa disciplina NÃO aprovada.** Hoje não mudam status nenhum. Com as fases, o natural é a fase
   `entregue` do documento apontado ir a `em_revisao`: a análise devolveu ajustes, e é isso que "Em revisão"
   quer dizer. Recomendação: incluir, porque sem isso uma disciplina com ajustes pendentes segue mostrando
   "Entregue". Custa uma escrita a mais no mesmo ponto da seção 4.

## 10. Verificação

- Testes puros:
  - `status-pelas-fases.test.ts`: as 7 regras, os exemplos da seção 3, aprovado que não sai sem revisão, sem fase;
  - descritor de ações sem o submenu de status;
  - guarda do `disciplinaEtapa`.
- Smoke novo, `npm run smoke:status-pelas-fases`:
  - envio → disciplina entregue só quando todas as fases estão entregues;
  - aprovar uma fase;
  - aprovação global PJ e 100% CLT deixa fases e disciplina aprovadas;
  - reabrir → fase e disciplina em revisão, pagamento intacto, inclusive na disciplina paga inteira;
  - reaprovar (global e por fase) → aprovado sem pagamento novo;
  - apontamentos em disciplina aprovada;
  - troca manual e em massa recusadas;
  - disciplina sem fase intacta;
  - **corrida**: duas fases enviadas em paralelo terminam com o status que considera as duas;
  - script de migração em modo só leitura não grava.
- Rodar de novo: `smoke:etapas-card`, `smoke:pagamento-fase`, `smoke:ciclo-documental`, `smoke:eap-integracao`,
  `smoke:pendencias-ciclo`, `smoke:sync-pagamento`.
- Tela: card do PPCI em 390×844 e em 1366×768 com o menu aberto, no dev server da porta 3001.

## 11. Fora do escopo

- Progresso do projeto por percentual de fase.
- Mudanças no fluxo de pastas (aprovação/laudo).
- Status `em_andamento` automático para a fase quando chega o primeiro arquivo. Hoje é manual no editor ou fica
  implícito no "Enviei".
- Remover a pílula do cabeçalho.

## 12. Ordem de entrega

1. Função pura, testes e guarda.
2. `recalcularStatusDisciplina` e os chamadores da seção 5.
3. Ajustes de reabertura, apontamentos, reaprovação e CLT (seção 4, com os pontos 2 e 5 já decididos).
4. Recusa da troca manual e descritor (seção 6).
5. Tela e guia (seção 7).
6. Script de migração em modo só leitura e conferência com o dono.
7. Smoke e auditoria final (`docs/PROTOCOLO_AUDITORIA_FINAL.md`).
