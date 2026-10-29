# Lote 6 — Refinos da EAP e do Gantt de controle (desenho)

Origem: reunião de análise do Hub de 26/10/2026 (feedback complementar) e roadmap em
[2026-10-26-reuniao-hub-roadmap.md](2026-10-26-reuniao-hub-roadmap.md). Três pedidos pequenos na mesma tela
(planejamento do projeto, `plano-gantt.tsx`), fechados com o dono em 28–29/10/2026. Nada aqui muda esquema do banco.

## Intenção

A equipe elogiou a criação da EAP dentro do projeto. Os três refinos tiram trabalho repetido e pesos visuais:

- **6a.** Definir a disciplina de um agrupamento uma vez, em vez de linha a linha.
- **6b.** Escolher a data de uma célula num calendário, sem abandonar a digitação nem a colagem.
- **6c.** No Gantt de controle, a linha de base e a execução passam a ter a mesma espessura.

## Fora do escopo (não fazer)

- Datas reais, colunas de execução e modo de variação do Gantt: é o **Lote 7**, desenhado depois.
- Destacar o atraso com cor própria nas barras. Ninguém pediu; fica para o Lote 7.
- Trocar responsáveis, apagar ponto, horas ou card ao propagar a disciplina (veja 6a).
- Criar um componente de calendário próprio.

## 6a — Disciplina do agrupamento vale para as linhas de dentro

**Decisão do dono:** as subtarefas se movem junto com a disciplina da mãe. Vale para todas as linhas de dentro, em
qualquer nível, mesmo as que tinham outra disciplina de propósito.

**Comportamento**

1. Hoje o painel da linha (`eap-linha-painel.tsx`) salva por `salvarLinhaEap` → `salvarLinhaNoBanco` →
   `editarLinhaNoBanco` (`planejamento/linha-service.ts`). Quando quem muda a disciplina é uma linha que **é
   agrupamento** (tem filhas), todas as descendentes passam para a mesma disciplina, na mesma gravação.
2. Descendentes = filhas, netas etc., incluindo subagrupamentos e linhas que estavam sem disciplina.
3. **Fase** (EP/BS/EX): cada linha mantém a própria fase se a disciplina nova a tem cadastrada; senão usa a do
   agrupamento, se tiver; senão fica sem fase. É a regra `faseQueAcompanha` (`disciplina-linha.ts`), a mesma do botão
   do achado "disciplina diferente do agrupamento".
4. **Pessoas e histórico ficam.** Responsáveis já atribuídos, ponto, horas apontadas e cards concluídos não são
   trocados nem apagados. A linha que ficar sem ninguém recebe o responsável da disciplina nova
   (`herdarResponsaveisNoProjeto`, D22), como já acontece quando uma linha muda de disciplina.
5. **Confirmação antes de gravar.** A tela conta as descendentes que realmente mudam de disciplina e pergunta, por
   exemplo: "12 linhas de dentro vão para Hidro. Continuar?". Cancelar não grava nada. Se nenhuma descendente muda,
   não pergunta.
6. **Um passo de desfazer.** O Ctrl+Z da EAP desfaz a troca do agrupamento e das descendentes juntas
   (`comPassoDaAction` já tira a foto do plano).
7. **Tudo ou nada.** O agrupamento e as descendentes são gravados na mesma transação. As descendentes são lidas de
   novo dentro da transação (edição concorrente da árvore não pode deixar linha para trás).
8. **Plano aprovado:** a troca continua bloqueada, como hoje (`mudaCampoDoPlano` + `exigirPlanoEditavel`). Nada novo.
9. O teto de linhas por chamada é o `MAX_LINHAS` já existente (500). Acima disso, recusa com mensagem clara.

**Casos de borda (decisões minhas, a conferir):**

- **Fase do agrupamento.** O "fallback" da regra 3 usa a fase que o agrupamento tem **depois** de salvar (a que o
  painel mandou junto). Se o agrupamento ficou sem fase, a descendente mantém a própria se a disciplina nova a tem,
  senão fica sem.
- **Tirar a disciplina do agrupamento não propaga.** Só a troca para uma disciplina nova propaga. Se limpar a
  disciplina do agrupamento limpasse as de dentro, as pessoas ficariam em linhas sem disciplina (responsável só
  existe com disciplina). As descendentes ficam como estão e não há confirmação.
- **Contagem confirmada.** A tela manda, junto com o pedido, quantas linhas viu mudando. O servidor relê a árvore na
  transação e **recusa** se o número real for diferente ("A EAP mudou enquanto você confirmava; confira e tente
  de novo"), em vez de gravar em linhas que a pessoa não viu. O teto de 500 vale para as descendentes que mudam.
- **Cards abertos e sincronização.** A troca segue o mesmo caminho do botão do achado: pessoas ficam, linha sem
  ninguém ganha o responsável novo, e o ciclo normal pós-edição (`aposMudarEap`) sincroniza os cards. O builder
  confere que cards ainda abertos de linhas que mudaram ficam coerentes e documenta o resultado.
- **Achado "disciplina diferente do agrupamento" e seu botão ficam como estão.** Continuam servindo a árvore que
  alguém mexeu por outro caminho (mover, recuar). A propagação não os substitui.
- **"Salvar" do painel é tudo ou nada.** Se qualquer campo falhar na validação, nada é gravado, nem a propagação.

**Onde fica o código (sugestão):** função pura em `planejamento/disciplina-linha.ts` que, dada a árvore e o id do
agrupamento, devolve as descendentes e a fase de cada uma (com teste); a gravação em `linha-service.ts` dentro da
transação do `editarLinhaNoBanco`. Chamada explícita: a action ganha um campo que a tela envia depois de confirmar
(**decisão minha**, para que scripts e chamadas antigas não propaguem sem querer).

**Verificação:** ampliar `npm run smoke:disciplina-eap` com: troca em agrupamento de dois níveis; descendente com
outra disciplina e com responsável (continua com ele); descendente sem ninguém (recebe o da nova disciplina); fase que
a nova disciplina não tem; plano aprovado recusa; tudo ou nada; Ctrl+Z restaura o conjunto.

## 6b — Datas da grade escolhidas num calendário

**Decisão do dono:** há três jeitos de trabalhar e todos devem existir: colar, digitar e escolher no calendário.
A digitação mantém a máscara `DD/MM/AAAA`.

**Comportamento** (colunas Início e Término, `plano-gantt.tsx` → `CelulaEditavel`)

1. A célula em edição continua sendo um campo de texto. Ao **digitar**, a máscara insere as barras sozinha
   (`05112026` vira `05/11/2026`) e só aceita dígitos.
2. **Colar** não passa pela máscara destrutiva: o texto colado vai como veio e é lido por `lerDataDigitada`
   (`datas-linha.ts`), que já aceita `dd/mm/aaaa`, `dd/mm/aa`, `dd/mm` e `aaaa-mm-dd`.
3. A célula em edição mostra um **ícone de calendário** que abre o seletor de data **nativo do navegador**, o mesmo
   usado no painel da linha (`<input type="date">`) e na faixa do cronograma. Escolher o dia grava como confirmar com
   Enter. A data atual da linha vem pré-selecionada.
4. As regras de gravação **não mudam** (`datas-linha.ts`): término digitado vira duração em dias úteis; início
   digitado vira a restrição "não iniciar antes de" (o alfinete); agrupamento e marco continuam recusando.
5. Enter, Tab, Esc e sair do campo mantêm o comportamento atual. Clicar no ícone **não pode** disparar a gravação por
   perda de foco (hoje sair do campo grava): o clique no ícone precisa manter o foco da edição.

**Fora do escopo:** marcar feriados e dias não úteis dentro do calendário (o seletor nativo não permite).

**Verificação:** teste puro da máscara (digitar, apagar no meio, entradas parciais) e do caminho colar; conferência em
tela das três formas de entrada na mesma célula, em computador e em 390 px.

## 6c — Barras do Gantt de controle

**Decisão do dono:** opção **B** do mock de 29/10/2026 — duas barras empilhadas, de mesma espessura, **linha
compacta**.

**Geometria e aparência** (`planejamento/gantt-barra.tsx`, modo `controle`)

- A altura da linha continua `ROW_H` = 28. A barra de execução e a de base têm **9 px** cada, com 2 px entre elas e
  4 px de folga acima e abaixo: execução em cima, base embaixo.
- **Execução:** como hoje (borda e fundo suaves, preenchimento sólido até o % concluído), só mais baixa. Crítica
  continua vermelha; bloqueada continua listrada.
- **Base:** cinza cheio (`bg-muted-foreground`), mesma altura e mesmo raio de canto (`rounded-sm`) da execução.
- **Agrupamento:** continua a barra preta com as pontas; a base fica logo abaixo, com a mesma espessura de 9 px.
- **Marco:** não tem base (como hoje).
- O modo `planejamento` **não muda**: uma barra só, de 14 px.
- O rótulo à direita (o %) não muda. A dica (title) da base passa a trazer as datas: "Linha de base: 10/11 a 21/11".
- A legenda em `plano-gantt.tsx` (`Legenda`) é atualizada: base e execução com a mesma espessura.
- `gantt-barra.tsx` é compartilhado com o Cronograma geral (`gantt-mini.tsx`): o builder confere que o resultado
  vale nas duas telas e que o modo não-controle não muda.

**Registro de decisão:** isto **reverte** a decisão da reunião de 29/09/2026 ("base fininha sob a barra grossa"). O
comentário em `gantt-barra.tsx` que registra aquela decisão deve ser atualizado para esta.

**Verificação:** conferir em tela, no Chrome, as linhas em dia, atrasada, adiantada, crítica, agrupamento e marco no
modo controle, com a grade em 1366×768; sem rolagem horizontal nova em 390×844.

## O que fica a cargo de quem for construir

- Nomes de funções, divisão em arquivos e testes, dentro das camadas do projeto (puro em `lib/`/`modules`, sem I/O).
- Texto exato das mensagens de erro e da confirmação (pt-BR).
- Detalhes da máscara de data e de como manter o foco ao clicar no ícone.
- Ordem de entrega: 6a, 6b e 6c são independentes; podem ir em commits separados.

## Auditoria

Nível 3 do protocolo (a propagação de disciplina grava dados existentes e mexe em responsável de linha).
