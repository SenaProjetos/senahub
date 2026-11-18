# Início real pelo ponto e "falta o término real" no Gantt de Controle

Data: 2026-11-17. Pedido do dono, na conversa sobre o Gantt de Controle.

## Por quê

Hoje a coordenação digita à mão o início e o término reais de cada atividade no Gantt de Controle. O ponto já sabe
quando a pessoa começou a trabalhar numa atividade: a sessão aponta para o card, e o card aponta para a linha da EAP.
O objetivo é que o ponto faça a maior parte desse registro e que a tela peça o término real quando a próxima atividade
já começou.

## O que foi decidido

1. **Início real = dia da primeira hora apontada** na atividade (pelo card dela). O sistema **grava** a data, não só
   sugere.
   - Só preenche o campo **vazio**. A data digitada pela coordenação vence sempre e pode ser corrigida.
   - Ficam de fora: marco, agrupamento e tarefa concluída, suspensa, cancelada ou arquivada.
   - Status `nin` vira `and`. Os status `agu`, `rev`, `apr` e `blq` ficam como estão. O % não muda (D19).
   - Gravar reagenda o projeto (`aposMudarEap`), como qualquer data real (D6).
2. **"Próxima atividade" = sucessora na EAP por vínculo término → início** (opção (a) escolhida pelo dono). Foram
   descartadas: (b) qualquer outra atividade da mesma pessoa, que gera alarme falso porque o trabalho corre em paralelo;
   (c) perguntar à pessoa no ponto, que põe um clique a mais no ponto.
   - A sucessora começou = tem início real ou hora apontada. Uma sucessora agrupamento começou quando qualquer atividade
     de dentro começou.
   - Quando a sucessora começou e a atividade segue sem término real, a célula **Térm. real** fica **amarela** no Gantt
     de Controle.
   - A sugestão é o **último dia com hora apontada** na atividade. Sem hora apontada, ou com esse dia antes do início
     real digitado, não há sugestão: a célula mostra "informar".
   - **Nada é gravado sozinho.** O término real conclui a tarefa e, no marco, entrega a fase, então a coordenação
     confirma. Enter grava a sugestão. Tab e clicar fora passam sem gravar.
   - O amarelo aparece só para quem tem `cronograma:executado`, nunca na linha verde (card concluído: um sinal por vez)
     e não sai do servidor para quem não vê datas.

## Calls do agente (corrigíveis)

- A hora apontada **sem escolher o card** não conta: o ponto não sabe a atividade.
- A **correção do dia** não preenche o início real. Ela só herda a tarefa de uma sessão que já existia, e a primeira
  hora dessa sessão já preencheu a data.
- Uma sessão apagada depois não desfaz o início real. A coordenação corrige a data.
- Marco não entra no amarelo. Ele tem uma data só, não recebe hora, e o fato de a sucessora começar não prova que o marco
  aconteceu (por exemplo, a aprovação do cliente).
- Não há botão de "dispensar" o amarelo. Ele some quando a coordenação informa o término real ou ajusta o vínculo.
- As horas apontadas antes desta regra entram por uma carga única no deploy: `npm run eap:inicio-pelo-ponto -- --gravar`.

## Onde está

- `src/modules/planejamento/inicio-pelo-ponto.ts` contém a regra pura do início.
- `src/modules/planejamento/inicio-pelo-ponto-service.ts` grava o início.
- `src/modules/planejamento/pos-ponto.ts` contém `depoisDoPontoNaTarefa`, chamado pelas actions de ponto e de
  apontamento depois de abrir a sessão.
- `src/modules/planejamento/termino-pendente.ts` contém a regra pura do amarelo. A leitura dela fica em `queries.ts`, no
  campo `EapTarefaDTO.terminoPendente`.
- `src/components/planejamento/plano-gantt.tsx` desenha a célula amarela, e `CelulaEditavel` recebe `sugerido`.
- A guarda `inicio-pelo-ponto-guarda.test.ts` exige que toda `sessaoTrabalho.create` traga o comentário
  `inicio-pelo-ponto:`.
- Para verificar: `npm run smoke:inicio-pelo-ponto`.
