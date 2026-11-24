# 100% sem datas reais = concluída como planejado (Gantt de Controle)

Pedido do dono (2026-11-24, WhatsApp): "Quando a gente preencher 100% da tarefa sem marcar data de início e fim, seria bom
ele considerar como se tudo tivesse ocorrido como planejado, preenchendo a data de início e fim real com base nas datas da
linha de base."

## Por quê

Hoje o 100% digitado na célula ou no painel grava só o número: a linha fica com Iníc./Térm. real vazios, status sem
"concluída", Dur. real 0 — e o verificador acusa "concluída sem término real". No "Atualizar tarefa" o 100% sem término é
recusado (decisão do Lote 7, "marcar 100% não diz que terminou como planejado"). O dono desfaz essa decisão: 100% sem datas
QUER dizer "terminou como planejado".

## Regra (pura, `planejamento/concluir-pelo-planejado.ts`)

- Referência: a linha de base da linha (`inicioBaseline`/`fimBaseline`, cache da versão mais recente) quando tem as duas
  datas; senão as datas previstas do motor (`inicioPrevisto`/`fimPrevisto`) — linha criada depois da aprovação.
- Término real = término da referência, limitado a HOJE (real não pode ser no futuro: tarefa que acabou antes do previsto
  termina hoje — decisão do dono).
- Início real já gravado (pelo ponto ou digitado) é mantido; senão = início da referência, limitado ao término.
- Término nunca antes do início real já gravado.
- Conclui: status `con`, 100%.

## Quando vale

- O % passa de < 100 para 100 (célula do Gantt, painel da linha, "Atualizar tarefa").
- Só atividade (não marco, não agrupamento), sem término real, status fora de `sus/can/arq/blq/con`.
- Só para quem tem `cronograma:executado` (datas reais são dessa permissão). Sem ela, ou linha bloqueada, o 100% continua
  gravando só o número, como hoje. No "Atualizar tarefa" a bloqueada segue recusando ("Desbloqueie…").
- A tela avisa de onde vieram as datas (linha de base × previsto).

## Proteção nova (minha decisão)

Baixar o % de uma linha concluída pela célula/painel deixaria 90% com status concluída e término real. Passa a recusar com a
frase que a célula do término já usa: "Para reabrir a tarefa, use Atualizar tarefa e informe o % concluído."

## Linhas antigas

Script `npm run eap:concluir-pelo-planejado [-- --gravar]`: linhas que já estão em 100% sem término real (as do print),
mesma regra, simula primeiro, grava com AuditLog na transação e reagenda cada projeto tocado.

## Abordagens

1. **Regra pura + chamada nos três caminhos do % (escolhida)** — uma regra testada, cada serviço grava na mesma transação do %.
2. Converter o 100% da célula/painel numa chamada a `registrarExecucao` no cliente — duplicaria a lógica na tela e mudaria a
   permissão da célula.
3. Só calcular na leitura (sem gravar) — o verificador, o Valor Agregado e o motor continuariam sem o término real.

## Fora

Marco (não tem %), agrupamento (% derivado), desfazer (Ctrl+Z é só do plano, como o "Atualizar tarefa").
