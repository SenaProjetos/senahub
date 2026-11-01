# EAP — apontamentos da equipe no primeiro uso (2026-10-22)

## Por que

A equipe começou a montar EAPs reais no SenaHub (ex.: REFORMA WCS - SHP GUARARAPES, 260035) e
devolveu uma lista de atritos. O objetivo é que montar e ajustar um cronograma no SenaHub seja tão
rápido quanto no MS Project, sem medo de errar (desfazer) e sem efeitos colaterais escondidos
(disciplina errada puxando responsável e card).

Parte da lista **já existe** e só não é encontrada; parte é editor novo; dois itens são defeitos de
regra. Este documento cobre tudo, em fases.

## O que já existe (não reconstruir — só tornar visível)

| Pedido da equipe | Estado hoje |
|---|---|
| Marco = tarefa de 0 dias | Digitar `0` ou `marco` na célula Duração já vira marco (`lerDuracao`, `gantt-linhas.ts`); o diálogo tem a caixa "Marco". |
| Recuar/avançar tarefa | Ações `recuarEapTarefa`/`avancarEapTarefa`, no menu de contexto e em Alt+Shift+→/←. **Falta botão visível** (fase E2). |
| Alterar a data de início do projeto, e o cronograma acompanhar | `definirInicioProjeto` + `aposMudarEap` reagendam tudo. Linha sem predecessora e sem restrição nasce no início do projeto. |
| "Primeira tarefa puxa a data de início do projeto" | É o comportamento do motor. Entra só como **conferência** (fase D): nenhum caminho (modelo, importação, duplicar) pode deixar a primeira linha presa a uma data. |
| "Recurso nenhum" para atividade de externo | Existe o recurso **Externo** (`papel = ext`, zero hora, ninguém da casa). Linha sem responsável gera só **alerta** na qualidade, não impede aprovar. Ação: deixar o Externo fácil de achar na célula Recursos (fase E2), sem criar recurso novo. |
| Ligação datas da EAP × data do contrato | **Fora de escopo** por ora (decisão do dono: "pode deixar solto no 1º momento"). |

## Goals

1. Corrigir as duas regras de disciplina (fase A).
2. Desfazer as últimas ações com Ctrl+Z (fase B).
3. Editor mais rápido: seleção múltipla, setas na barra, várias tarefas de uma vez, copiar agrupamento
   com o que tem dentro, escolher predecessora numa árvore (fases C e E2).
4. Editar início e término direto na célula, com a regra combinada (fase D).
5. Salvar a EAP de um projeto como modelo (fase E).

## Non-goals

- Ligar datas da EAP à data do contrato / prazo do projeto.
- Ligar o card da DISCIPLINA à EAP (continua manual — decisão de 2026-10-10).
- Recuperar o que a equipe apagou nos testes em produção (dono: eram testes, pode perder).
- Desfazer no cronograma aprovado e travado (lá o plano já não muda; ver fase B).

## Anti-goals (seria fracasso mesmo funcionando)

- Linha que muda de disciplina **em silêncio** (troca responsável, card e pagamento sem ninguém ver).
- Desfazer que restaura a linha com **outro** `idCorporativo` (quebra a identidade permanente) ou que
  restaura só a linha e esquece filhas, vínculos e pessoas.
- Mudar o início do projeto e uma data fixada a mão sumir sem aviso.
- Uma segunda regra de agendamento fora do motor (`agendar()` continua a única).

---

## Fase A — Disciplina (defeitos)

### A1. Linha nova recebe a disciplina do agrupamento, não da vizinha

**Causa encontrada:** `inserirLinhaAcima` (`arvore-service.ts`) cria a linha com a `disciplinaId` da
linha de referência, e `herdarResponsaveisNoProjeto` traz o responsável dessa disciplina (D22). Inserir
"Visita técnica" acima de uma linha de Hidro gera uma visita de Hidro, com o responsável de Hidro, e
— com cronograma aprovado — um card para essa pessoa. Ainda não confirmado no 260035 (está em
produção; confirmar com export/consulta antes de fechar a fase), mas explica o sintoma.

**Regra (decidida com o dono):** toda linha NOVA nasce com a disciplina do **agrupamento-pai**; pai sem
disciplina (ex.: "Gestão") ou linha na raiz = sem disciplina. Vale para: inserir acima, nova tarefa
com pai, várias tarefas de uma vez (C3), colar agrupamento copiado (C4). A fase (`etapaId`) segue a
mesma regra pela `faseDaLinha` existente. Uma única função pura decide (ex.: `disciplinaParaLinhaNova`),
testada, usada por todos esses caminhos.

O diálogo "Nova tarefa" continua permitindo escolher outra disciplina à mão; a regra só define o
valor inicial.

### A2. Mover/recuar mantém a disciplina, e a qualidade aponta a divergência

Mover, recuar e avançar **não** trocam a disciplina (troca mexe em responsável, card e pagamento).
O verificador de qualidade (`qualidade.ts`) ganha a regra `disciplina_diferente_do_agrupamento`
(severidade alerta): linha com disciplina definida cujo agrupamento-pai mais próximo COM disciplina
tem outra. Linha sem disciplina dentro de agrupamento com disciplina **não** é achado (pode ser
proposital). O achado traz a ação "Usar a disciplina do agrupamento", que passa pelo caminho normal
de editar disciplina da linha (com o que ele já faz em responsável/card).

### A3. Disciplina repetida em fases: o card e o ponto mostram a fase

O motor e "Aplicar ao projeto" já tratam disciplina+fase como par — nada quebra lá. O problema é de
leitura: `sincronizarCards` usa `titulo = l.nome`, então "Modelagem" de Hidro no BS e no EX viram
dois cards indistinguíveis no quadro de tarefas e na lista do ponto.

**Regra:** onde aparece o card/atividade da EAP (quadro `/tarefas`, card aberto, lista do ponto,
"Meu trabalho", sugestão do ponto), mostrar a **sigla da fase** ao lado do nome, resolvida pela
versão de nomenclatura do projeto (como a EAP já faz). Escolha do construtor: chip ao lado do título
(preferido — o título continua igual à linha, e a sincronização não precisa mudar) ou prefixo no título.
Não gravar a sigla no banco.

---

## Fase B — Desfazer (Ctrl+Z)

Pedido do dono depois de apagar linhas por engano nos testes. Hoje `excluirEapTarefa` é delete físico
com cascade (filhas, `EapDependencia`, `EapAtribuicao`…) e a auditoria não guarda cópia.

**Comportamento:**
- Ctrl+Z na tela da EAP (fora de célula em edição — dentro da célula, Ctrl+Z é do campo de texto) e um
  botão "Desfazer" na barra, com o nome da ação ("Desfazer: excluir 'Visita técnica'").
- Pilha das **últimas 20 ações por pessoa e por projeto**, guardada no SERVIDOR (sobrevive a recarregar
  a página; some ao aprovar o cronograma e ao fechar a revisão com nova linha de base).
- Só quando o plano está editável (`planoTravado` = falso: rascunho ou revisão aberta). Em plano travado
  o botão fica desabilitado com a frase de `MOTIVO_PLANO_TRAVADO`.
- Cobre toda mutação do PLANO feita pela tela: excluir, inserir, nova(s) tarefa(s), colar, mover,
  recuar/avançar, nome, duração/marco, datas (fase D), predecessoras, restrição, disciplina/fase,
  pessoas e horas. Ações em lote (fase C) desfazem **de uma vez**.
- Fora do desfazer: % concluído e datas reais (acompanhamento), aprovar/replanejar, aplicar modelo,
  gerar EAP das disciplinas, apagar a EAP inteira (esta já tem confirmação própria). Escolha do
  construtor se aplicar modelo entra depois.
- Refazer (Ctrl+Y / Ctrl+Shift+Z): **escolha do construtor** — desejável, não obrigatório.

**Regras de integridade:**
- Cada passo grava uma foto ANTES das linhas atingidas, com tudo que cai em cascade (linha, filhas,
  vínculos que entram e saem, atribuições e as demais tabelas com FK para `EapTarefa`). Restaurar
  recria com os **mesmos ids e o mesmo `idCorporativo`** — nunca reserva id novo.
- O desfazer só aplica se o estado atual das linhas ainda for o que o passo deixou (outra pessoa pode
  ter editado depois). Divergiu → recusa com frase clara e descarta aquele passo; nunca sobrescreve
  trabalho de outro.
- Tudo numa transação; depois, `aposMudarEap` (reagenda + cards + previsões), como qualquer mutação.
- Passa por `defineAction` (auditoria automática). Card de linha excluída nunca foi apagado
  (`sincronizarCards` não apaga card); ao restaurar a linha, o card volta a apontar para ela se ainda
  existir sem vínculo — detalhe do construtor conferir a FK `Tarefa.eapTarefaId`.
- O passo grava se mudou o plano durante revisão (`revisaoAlterada`): desfazer não "limpa" essa marca.

Formato de armazenamento (tabela nova com JSON por passo, ou outra forma): escolha do construtor,
respeitando as regras acima.

---

## Fase C — Editor: seleção e lote

### C1. Selecionar várias linhas
Ctrl+clique alterna, Shift+clique seleciona o intervalo, no padrão de planilha/MS Project. A seleção
vive só na tela. As ações de linha passam a aceitar várias: recuar, avançar, mover para cima/baixo,
excluir (um confirm com a contagem), copiar. Recuar/avançar em lote respeita a árvore: selecionar uma
mãe e as filhas move o bloco junto, sem recuar as filhas duas vezes. Cada lote é UMA chamada ao
servidor e UM reagendamento (não repetir a ação por linha no cliente como o `useLote` faz — com 30
linhas seriam 30 reagendamentos) e UM passo de desfazer.

Segue a ADR-0002 (descritor puro `acoes-eap.ts`, mesmo array no menu, no `...` e na barra de seleção).

### C2. Setas na barra
Botões ← → ↑ ↓ (avançar, recuar, mover acima, mover abaixo) na barra da EAP, agindo sobre a seleção,
com o atalho no tooltip. Desabilitados com a frase do motivo quando não se aplicam (plano travado,
sem seleção, primeira linha não recua etc.).

### C3. Várias tarefas de uma vez
"Novas tarefas" abre um campo onde se cola ou digita **uma tarefa por linha** (vindo do Excel, do
Word ou do e-mail). Opcional na mesma linha: duração separada por tab (`Visita técnica<TAB>2`).
Inserção abaixo da linha selecionada, no mesmo nível (ou dentro, se a selecionada é agrupamento —
escolha do construtor, mostrada na prévia). Disciplina pela regra A1. Prévia com a contagem antes de
gravar. Um passo de desfazer. Teto razoável (ex.: 200 linhas).

### C4. Copiar agrupamento com tudo dentro
Copiar a(s) linha(s) selecionada(s) e colar abaixo de outra linha (ou dentro de um agrupamento). Copia
a estrutura: nomes, durações, marcos, tipo, fase e **vínculos internos ao bloco** (A→B dentro do bloco
vira A'→B'). Não copia: % e datas reais, restrições (são datas absolutas), bloqueio, pessoas e horas,
vínculos com linhas de fora do bloco — mesma filosofia de `duplicar-eap.ts`, que deve ser reaproveitado.
Cada linha nova recebe `idCorporativo` via `reservarIdsParaLinhas`. Disciplina pela regra A1 (o bloco
colado sob o agrupamento de Elétrica vira Elétrica). Um passo de desfazer.

### C5. Escolher predecessora numa árvore
A célula Predecessoras continua aceitando texto (`1.2.3FS+2`). Ao editar, abre junto uma lista em
árvore da EAP (código + nome, recolhível, com busca por nome ou código) para marcar as predecessoras
com clique; o texto e a árvore ficam em sincronia. A própria linha e as que formariam ciclo aparecem
desabilitadas com o motivo (`ciclo-dependencias.ts`). Tipo de vínculo e defasagem continuam editáveis
pelo texto e pelo diálogo.

---

## Fase D — Datas na célula

Decidido com o dono:
- **Término digitado** → recalcula a duração em dias úteis (calendário do projeto, feriados) a partir
  do início atual. Não cria restrição. Término antes do início → recusa com frase. Término que dá
  0 dias úteis → vira marco? **Não**: recusa e sugere digitar 0 na duração (marco é decisão explícita).
- **Início digitado** → cria a restrição "Não iniciar antes de" (o alfinete que já existe) e o motor
  reagenda. A duração se mantém.
- **Mudar o início do projeto** com N linhas que têm data fixada: aviso antes de gravar — "N tarefas
  têm data fixada. Mover junto (desloca essas datas pelo mesmo número de dias úteis) ou manter?".
  Mover junto desloca `restricaoData` de todas as restrições de data do projeto (escolha do construtor
  se inclui os 6 tipos ou só os de início; a regra precisa ser uma só e testada).
- Agrupamento e plano travado: início/término não editáveis (como a duração hoje).
- Conferência do "primeira tarefa puxa o início do projeto": nenhum caminho de criação (modelo,
  importação, duplicar, gerar das disciplinas) grava restrição na primeira linha sem que o usuário a
  tenha posto. Teste ou smoke cobrindo.

---

## Fase E — Salvar a EAP do projeto como modelo

Ação "Salvar como modelo" na EAP do projeto. Converte as linhas para `estruturaModeloSchema`
(`modelos/estrutura.ts`, versão 1 — o MESMO formato da importação, sem formato novo): nome, tipo,
duração, árvore, vínculos internos, fase, disciplina traduzida para `disciplinaCatalogoId` (catálogo
global), `deTerceiro` a partir do recurso Externo. Não leva: pessoas, horas, %, datas reais,
restrições. Pede nome, descrição e tipo de empreendimento. Grava por `salvarModeloDeEap` existente.
Disciplina do projeto sem par no catálogo: listar na prévia e gravar a linha sem disciplina (não
adivinhar). Teto de 1200 linhas do schema vale.

### E2 — Descoberta do que já existe
- Botões de seta (C2) cobrem recuar/avançar.
- Célula Recursos: "Externo (sem pessoa da casa)" visível no topo da escolha.
- Dica curta na célula Duração: "0 = marco".

---

## Ordem e entregas

A (disciplina) → B (desfazer) → C (seleção, setas, várias tarefas, copiar, árvore) → D (datas) → E
(modelo + descoberta). B antes de C porque o lote só é seguro com desfazer. Cada fase é entregável
sozinha; atualizar `docs/manual/` e o guia da EAP em cada uma.

## Verificação

- Puros com teste: `disciplinaParaLinhaNova`, a regra de qualidade A2, o plano do desfazer (foto,
  divergência), recuar/avançar em lote na árvore, parser de "várias tarefas", cópia do bloco com
  remapeamento de vínculos, término → duração, deslocar restrições.
- Smoke novo `smoke:eap-edicao` cobrindo: inserir acima sob agrupamento sem disciplina; excluir mãe
  com filhas e desfazer (mesmos ids e `idCorporativo`, vínculos e pessoas de volta); desfazer recusado
  depois de outra edição; colar bloco com vínculos internos; mudar início com "mover junto".
- Tela conferida pelo agente (protocolo de auditoria final), incluindo 390 px e o atalho Ctrl+Z.

## Escolhas deixadas ao construtor (já marcadas acima)

Formato do armazenamento do desfazer; refazer; se "aplicar modelo" entra no desfazer; chip × prefixo da
fase no card; onde as várias tarefas entram quando a selecionada é agrupamento; quais tipos de
restrição o "mover junto" desloca.
