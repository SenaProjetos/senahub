# Dividir tarefa (pausa na atividade da EAP) — design

Data: 2026-11-27 · Pedido: Ryan (planejamento), conversa com o dono · Ramo: `feat/pool-recursos`

## Intenção

O Ryan quer o "Dividir tarefa" do MS Project: quebrar a barra de uma atividade da EAP em dois ou mais pedaços,
com uma pausa entre eles.

**Por quê** (palavras do dono): a pausa é para **fugir de conflito de recurso** e **liberar a pessoa para outro
projeto**. O projeto A avança até certo ponto, pausa, a pessoa faz o projeto B, e quando B termina o A
**continua exatamente de onde parou**. É uma ferramenta do pool de recursos, não um enfeite do Gantt.

## Objetivos

- Uma atividade da EAP pode ter **uma ou mais pausas**. Cada pausa = "depois de N dias de trabalho, continua em DD/MM".
- O **trabalho não muda**: duração (dias úteis), horas, %, custo e pessoas são os mesmos. Só o término anda
  (duração + dias de pausa).
- **Dia de pausa não tem hora**: a carga por dia, os conflitos, a tela por pessoa, o Planejamento geral, o aviso de
  férias × alocação e a sugestão do ponto deixam de ver a atividade nos dias pausados.
- Criar e editar nos **dois lugares**: tela por pessoa (Recursos), onde o conflito aparece, e EAP (painel da linha).
  O Gantt da EAP **desenha** os pedaços.

## Não-objetivos

- Retomada ligada a atividade de OUTRO projeto (vínculo entre cronogramas). Descartado: não existe hoje e é bem maior.
- Pausa de tamanho fixo que anda com a atividade (comportamento do MS Project). Descartado: a pausa deixaria de
  coincidir com o projeto B e o conflito voltaria sem ninguém ver.
- Arrastar barra no Gantt da EAP. Continua só na tela por pessoa (como hoje).
- Pausa na linha de base: a BL guarda o início/término como hoje (o término já inclui a pausa vigente na hora de
  congelar). A curva do Valor Agregado continua espalhando por igual entre início e término da BL.
- Pausa em agrupamento (resumo) ou marco.

## Antiobjetivos (falharia mesmo "funcionando")

- A pausa esconder hora: as horas da atividade precisam continuar todas na carga, só em outros dias. Hora que some é
  sobrecarga que ninguém vê (mesma regra de `distribuirHoras`).
- Uma atividade virar duas linhas (duplicaria card, %, horas, ID corporativo e quebraria a comparação com a BL).
- As ~50 telas que leem `inicioPrevisto`/`fimPrevisto` mudarem de significado: início continua sendo o do 1º pedaço,
  término o do último.

## Abordagens consideradas

1. **Lista de pausas na própria linha (`EapTarefa.pausas`, JSON) — ESCOLHIDA.** O motor lê, devolve os pedaços de
   cada linha. A pausa anda sempre com a linha: desfazer, trava otimista e auditoria já trabalham com a linha inteira.
2. Tabela `EapPausa`. Mesmo motor e telas, mas mais uma leitura em todo caminho (e leitura à parte dentro de
   transação, regra do Prisma 7 + adapter-pg) e mais um item em cada cópia, sem ganho — a pausa nunca é lida sozinha.
3. Duas linhas de verdade (parte 2 ligada FS + alfinete). Zero mudança no motor, mas é o antiobjetivo acima.

## Decisões do dono

- **D1 — Retomada em data fixa.** A pausa guarda `aposDias` (dias de trabalho antes da pausa) e `retomaEm` (data).
  O começo da pausa anda com a atividade; a retomada fica parada. Se a parte de antes terminar em/depois de
  `retomaEm`, a pausa **some** (pedaços colam) e a linha ganha um aviso "pausa absorvida".
- **D2 — Nos dois lugares**: tela por pessoa e EAP.
- **D3 — Pausa é ACOMPANHAMENTO, livre no aprovado** (como data real e Data de Status, fora da `trava-plano`).
  Não pede "Revisar planejamento", não cria linha de base, não conta em `revisaoAlterada`. A BL fica como está: o
  término que anda aparece em "atrasada" e no Valor Agregado, que é para isso. Rastro = AuditLog. Conflito novo em
  outro aprovado → aviso em cascata. Marco de parcela que anda → "Previsão atual" do portal muda e entra no resumo
  diário pelo `conferirPrevisoes`, como já acontece com qualquer mudança líquida da previsão.

## Modelo de dados

- `EapTarefa.pausas Json?` — `null` ou `[]` = sem pausa. Formato (Zod em `modules/planejamento/pausas.ts`, puro):
  `{ aposDias: int, retomaEm: "YYYY-MM-DD" }[]`, ordenado por `aposDias`, `aposDias` estritamente crescente,
  `0 < aposDias < diasOcupados(duracaoDias)`, `retomaEm` estritamente crescente. Máximo 10 pausas (chamada minha).
- `EapTarefa.trechosPrevistos Json?` — saída do motor gravada por `reagendarProjeto` junto com `inicioPrevisto`/
  `fimPrevisto` (`null` = um pedaço só). Só para quem lê do banco sem rodar o motor (ponto, exportação Excel).
  Quem roda `planoDoProjeto` usa a saída do motor. Formato: `{ inicio: Dia; fim: Dia }[]`.
- Migração aditiva (duas colunas nulas). Sem carga de dados.

## Motor (`motor.ts`)

- `LinhaEntrada.pausas?: { aposDias: number; retomaEm: Dia }[]`; `LinhaAgendada.trechos: { inicio: Dia; fim: Dia }[]`
  (sempre ≥ 1; linha sem pausa = um trecho igual a `[inicio, fim]`) e `pausasAbsorvidas: number`.
- **Regra única, dia de trabalho por dia de trabalho**: cada dia útil `k` (1..duração) da linha cai no primeiro dia útil
  ≥ ao dia anterior + 1 e ≥ ao **piso** do dia `k`. Piso = maior `retomaEm` entre as pausas com `aposDias < k`
  (normalizado ao próximo dia útil) e, para o trabalho ainda não feito, o dia útil após a Data de Status (regra que
  já existe em `motor.ts:400-411`). Os pedaços são as corridas contínuas de dias úteis.
- Consequência deliberada (chamada minha): o salto que a Data de Status já cria numa atividade em andamento passa a
  aparecer como pedaço também — hoje as horas dela caem em dias do passado em que ninguém trabalhou.
- **Trabalho feito nunca anda** (chamada minha, após a revisão do builder): os dias feitos (`feitos`, pelo %)
  ficam a partir do início, sem piso de pausa. Pausa com `aposDias ≤ feitos` é **passada**: o motor a ignora, ela
  fica guardada, a tela mostra "pausa já passou" e só permite removê-la. O % não é limitado pela pausa.
- Concluída pelo **término real**: as datas reais vencem (D6) → um trecho `[inicioReal, fimReal]`, pausas ignoradas.
- Resumo: início/fim pelo rollup como hoje; trechos de resumo = um trecho (o resumo não é dividido).
- Passe para trás (folga): usa o término com pausas; a pausa é como uma restrição "não iniciar antes de" no meio da
  linha. A linha com pausa **não absorvida** deixa de ser crítica só se tiver folga pelo cálculo; nada especial.
- Restrições de término (`terminar_em`, …) derivam o início "de volta" pela duração: com pausa, o motor ignora a pausa
  nessa conta e a tela mostra conflito se a data não fechar (chamada minha, caso raro).

## Quem passa a ler os pedaços

| Leitor | Arquivo | Mudança |
|---|---|---|
| Horas por dia | `recursos.ts` `distribuirHoras`, `parcelasDasLinhas`, `parcelasDiariasDasLinhas`, `parcelasDePerfis` | espalha só nos dias úteis dos trechos |
| Conflitos / sobrecarga | `conflitos-recursos.ts`, `detectarSobrecargasPorDia` | vêm das parcelas acima, sem mudança própria |
| Tela por pessoa | `planejador-equipe.ts` + `components/recursos/planejador-equipe-view.tsx` | barra em pedaços com tracejado entre eles |
| Planejamento geral | `planejamento-geral-queries.ts` + view | idem |
| Gantt da EAP | `gantt-barra.tsx`, `plano-gantt.tsx` | pedaços + tracejado; tooltip lista as pausas |
| Aviso férias × alocação | `impacto-ausencia-service.ts` | via `distribuirHoras` |
| Sugestões de recurso | `sugestoes-recursos.ts` | via `distribuirHoras` |
| Ponto | `ponto/tarefa-ponto*.ts` | "atividade de hoje" só se hoje cai num trecho; janela ±7 e atrasada continuam por início/fim |
| Exportação Excel | `api/planejamento/[projetoId]/eap-export` | coluna "Pausas" (texto) |
| Horas automáticas | `horas-automaticas.ts` | **nada**: já usa `duracaoDias` × 8 h, não o intervalo |

Leitores de início/término (atrasada, sinais, Saúde, portal/agenda, EVM, BL, cards) **não mudam**.

## Telas

**Tela por pessoa (Recursos).** Menu da barra (ADR-0002, `itensDe…` puro, mesma lista no ⋯ e no clique direito):
- "Pausar aqui…" — o dia clicado vira o começo da pausa (`aposDias` = dias úteis de trabalho antes dele); diálogo
  pede "Continua em" (data). Recusado se o dia clicado não é de trabalho futuro da linha.
- Em pedaço depois de pausa: "Mudar retomada…", "Tirar esta pausa". Arrastar o pedaço = mudar `retomaEm` (o
  arrasto de barra existente continua movendo o início, como hoje).
- Regra própria em `planejador-acoes.ts` (`motivoParaNaoPausar`, mesma frase na tela e no servidor): recusa sem
  permissão no projeto (`MOTIVO_SEM_PERMISSAO_NO_PROJETO`), agrupamento/marco, linha concluída, dia que não é
  trabalho futuro. **Não** recusa por aprovado sem revisão (D3) nem por "já começou". Aviso à coordenação de quem
  não coordena (`avisarCoordenacaoDaMudanca`, nova `mudanca.tipo = "pausa"`), um passo de desfazer.
- Faixa de parceiro externo: pausa permitida (é prazo de terceiro, sem hora da casa); chamada minha.

**EAP.** Painel da linha: seção "Pausas" — lista "Depois de [N] dias · continua em [DD/MM]", adicionar/remover,
entra no "Salvar" do painel (um passo de desfazer, tudo ou nada, `salvarLinhaNoBanco`). Gantt desenha os pedaços;
ícone de pausa absorvida com o motivo. Agrupamento e marco: seção ausente.

## Regras de escrita

- Escritor único: `definirPausasNoTx` (serviço novo em `planejamento/`), chamado pelas actions da tela por pessoa e
  pelo `salvarLinhaNoBanco`. Valida com o Zod puro, recusa agrupamento/marco/linha concluída, `updateMany` condicionado
  ao `updatedAt` lido, depois `aposMudarEap` (reagenda + card + previsões).
- **Pausa em atividade já começada é permitida** (é o caso central: "avançou até certo ponto"), desde que o começo da
  pausa seja trabalho ainda não feito (depois da Data de Status). Pausa que já ficou no passado continua guardada e
  só é removível.
- **Sucessoras** (chamada minha, mesmo padrão do arrasto): as ligadas por vínculo andam sozinhas pelo motor; as com
  data fixada (alfinete) recebem a mesma pergunta "Mover também as seguintes?" do arrasto (`seguintesFixadas`).
- **Aviso em cascata** (D3): pausa gravada num aprovado entra no
  `cascata-service.ts` como a data real e a Data de Status: conflito NOVO criado em outro aprovado avisa a
  coordenação dele.
- Desfazer: `pausas` entra em `desfazer/estado.ts` (campos da foto). Duplicar projeto e salvar modelo **não** copiam
  pausas (são datas absolutas, como as restrições — `duplicar-eap.ts`).
- Auditoria pelo `defineAction` com `capturarAntes` das pausas.


## Para quem constrói

- Componente visual do tracejado e do diálogo; nomes de arquivos/funções; textos exatos (pt-BR, mesma frase no menu
  desabilitado e no `ActionError`).
- Smoke `smoke:pausa-tarefa` cobrindo: pedaços pelo motor, pausa absorvida, pausa passada (% passou dela), Data de
  Status, horas fora dos dias de pausa, conflito some, ponto não sugere no dia pausado, desfazer, livre no aprovado
  sem nova BL, aviso em cascata, duplicar não copia.
- Manual: `docs/manual/` (planejamento e recursos) + `docs/manual/novidades.md`.
- `verify:motor-cronograma` contra os projetos reais (nenhum tem pausa: saída idêntica exceto o salto da Data de Status).
