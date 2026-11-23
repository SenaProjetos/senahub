# Portal do cliente — agenda do contrato

Pedido do dono em 2026-11-23. Item 3 da série "próximos 6 do portal" (ordem combinada: aprovação da entrega ✓ → atas ✓ →
**agenda** → conta de obra → confirmação de recebimento → comparar revisões).

## Por quê

A ideia original era uma agenda com as próximas reuniões e os marcos que a equipe quisesse compartilhar. O dono reduziu o
escopo, e foi a decisão certa: o cliente deve ver **apenas as datas estabelecidas em contrato**. Nada de cronograma interno,
nada de reunião futura.

O portal hoje evita datas de cronograma de propósito (a EAP muda toda semana e uma data solta vira promessa; a única data
futura que ele mostra é o "Prazo" do projeto, no cabeçalho). Esta agenda é a exceção deliberada, e só para o que foi
combinado.

**Limite a ter claro:** o contrato por entrega guarda o marco da EAP, não a data. Então "Combinado" é a data do marco na
`BL-00` (a linha de base que a coordenação congela ao aprovar o cronograma), não uma data escrita no contrato. O dono aceitou
isso ao escolher a `BL-00` (decisão 7). Se um dia o contrato ganhar um campo de data por parcela, ele passa a mandar.

O problema que ela resolve: o cliente não tem um lugar para ver "o que foi combinado e quando", e quando um marco escorrega
ele só descobre na conversa. O dono observou que **na maior parte das vezes o atraso é do próprio cliente** (aprovação,
informação ou pagamento que não veio). Por isso a agenda mostra o combinado e a previsão atual lado a lado e deixa a
coordenação explicar o motivo, em vez de só mostrar um número que cresce.

Sucesso = o cliente abre o portal e vê, num cartão, as datas do contrato; quando um marco combinado desliza, ele vê a data
original, a nova previsão, quantos dias de diferença e (se a coordenação escreveu) o motivo; e fica sabendo pelo resumo diário,
sem e-mail novo.

## Decisões do dono (2026-11-23)

1. **Só datas de contrato.** Sem reunião futura, sem cronograma interno. A fonte são o contrato e os marcos da EAP que o
   contrato por entrega aponta (`ContratoParcelaEntrega.marcoId`).
2. **Marco que escorrega mostra as duas datas** (opção C): "Combinado" e "Previsão atual", com os dias de diferença.
3. **Nota de motivo opcional por marco**, escrita pela coordenação, visível ao cliente. Sem nota, nada aparece. (Motivo
   automático pelo estado do sistema fica como evolução, não entra agora.)
4. **A agenda tem só prazos do projeto**: assinatura do contrato, marcos de entrega ligados a parcelas, prazo final do
   projeto e vencimento da vigência. Pagamento fica no Financeiro do portal (que já existe), sem duplicar data.
5. **Aviso dentro do resumo diário que já existe** (opção B): "marco em 7 dias" e "previsão alterada" (com a nota, se
   houver). Sem e-mail novo, e o cliente continua podendo desligar o resumo.
6. **Quem escreve a nota**: coordenação do projeto e gestores globais (a mesma audiência da conversa e das atas). O
   projetista não escreve para o cliente.
7. **"Combinado" é sempre a `BL-00`** (a linha de base original, nunca sobrescrita). Replanejar (`BL-01`…) só mexe na
   "Previsão atual". Só um aditivo de contrato mudaria o combinado, e isso é outro assunto.
8. **Construção: abordagem 1** (ver "Abordagens"): tabela própria por marco, com a nota e a última previsão que o cliente
   viu; o job diário compara e detecta a mudança.

## O que o cliente vê (`/portal/[projetoId]`, cartão "Agenda do contrato")

O cartão fica no topo da página, abaixo das aprovações/atas/contratos e acima do Andamento (âncora `#agenda`, para o sino e
o e-mail). Não aparece quando não há nenhum item. Leitura e limite de erro próprios, como os outros cartões.

Itens, em ordem de data (o mais próximo primeiro; entregues e passados no fim, recolhidos):

| Item | Data mostrada | Quando existe |
|---|---|---|
| Assinatura do contrato | `assinadoEm` | contrato do cliente neste projeto, assinado ou vencido |
| Entrega (marco) | Combinado + Previsão atual | contrato **por entrega** vigente, cronograma **aprovado**, parcela com marco |
| Prazo do projeto | `Projeto.prazoContrato` | projeto com prazo de contrato |
| Fim da vigência | vencimento efetivo do contrato (com aditivos) | contrato com `dataVencimento` |

Cada **marco de entrega** mostra:

- o nome que o cliente reconhece: a **descrição da parcela** do contrato ("Entrega do projeto básico"), nunca o nome da linha
  da EAP;
- **Combinado** = fim da linha na `BL-00`; **Previsão atual** = onde o marco cai hoje; **diferença** em dias corridos
  ("+18 dias" / "2 dias antes");
- situação: **No prazo** (previsão ≤ combinado), **Previsão alterada** (previsão > combinado), **Entregue em dd/mm** (marco
  concluído; o combinado continua à vista e a nota deixa de aparecer);
- a **nota da coordenação**, quando existe e o marco não foi entregue, assinada só como "Coordenação" (nunca o nome da
  pessoa).

Nada de valor, percentual da parcela, status de cobrança, nome de linha da EAP, responsável, horas ou disciplina.

## O que a equipe vê (`/projetos/[id]/cliente`, seção "Agenda do contrato")

Abaixo de "Reuniões e atas". Lista os mesmos marcos, na visão da equipe: descrição da parcela, contrato, combinado,
previsão atual, diferença, nota atual (e quem escreveu e quando) e a situação. Ações por marco:

- **Escrever nota** / **Editar nota** (texto simples, até 500 caracteres, obrigatório não vazio ao salvar);
- **Remover nota**.

Recusas com a mesma frase na ação e no item desabilitado do menu: "Este marco já foi entregue — a nota não aparece mais para
o cliente." (editar) e "Este marco não tem nota." (remover). Segue o ADR-0002: `itensDeMarcoAgenda` puro e testado, o mesmo
array no menu de contexto e no `...`.

A seção mostra também um aviso quando o contrato por entrega existe mas o cliente não vê nada ainda, e **o porquê**: "O
cronograma do projeto ainda está em rascunho — os marcos aparecem para o cliente quando ele for aprovado." / "O contrato
ainda não foi assinado." / "Parcela sem marco." Mesma ideia do motivo que a previsão de recebimento já devolve.

## Regras

### Quais marcos entram (função pura, testada)

Um marco entra na agenda do cliente quando **todas** valem:

1. contrato é de cliente (`tipo = "contrato"` — aditivo, proposta e procuração não entram —, `clienteId` = cliente da
   conta, `vinculoId` nulo), `projetoId` = o projeto, `formaCobranca = por_entrega`, `statusContrato` ∈ {`assinado`,
   `vencido`} (o mesmo conjunto das previsões de recebimento). Vale também para quem foi assinado fora do portal: o que
   importa é ser contrato assinado do cliente, não ter passado pelo pedido de assinatura do portal;
2. a parcela não é `naAssinatura` e tem `marcoId`; o marco é do mesmo projeto do contrato;
3. o cronograma do projeto está **aprovado** (sem aprovação não existe `BL-00`);
4. o cliente está ativo e a conta é externa ativa (o mesmo portão das outras telas do portal).

Dois contratos podem apontar o mesmo marco; ele aparece uma vez, com a descrição da primeira parcela (por `ordem`, depois
`id`). A nota é por **marco**, não por parcela.

Marco cuja linha da EAP foi apagada some da agenda (a parcela fica "sem marco" no contrato, e isso é assunto da equipe).

### Datas

- **Combinado**: `EapBaselineLinha.fim` da baseline de `numero = 0` daquele `tarefaId`. Marco que não está na `BL-00`
  (entrou na EAP depois da aprovação) mostra só **Previsão**, sem "Combinado", sem diferença e sem a situação "Previsão
  alterada" — nunca se inventa um combinado.
- **Previsão atual**: a mesma que a previsão de recebimento usa para o marco (`dataDoMarco` do plano / `fimPrevisto`). O
  construtor confirma qual das duas fontes é a certa e usa UMA só nas duas telas, para o portal nunca discordar do
  financeiro da equipe. Enquanto o cronograma está **em revisão** (`CronogramaProjeto.emRevisao`), a tela mostra a
  previsão ao vivo, mas a rotina de aviso **não compara nem avisa** (ver "Previsão alterada"): a coordenação ainda está
  montando o replanejamento.
- **Entregue**: marco concluído (mesma noção de "concluído" que a linha da EAP usa); data = o fim real.
- Dias de diferença em **dias corridos** (é como o cliente conta), com sinal. Todas as datas são dias de São Paulo
  (`lib/data.ts`). As colunas da EAP e `dataVencimento` são `@db.Date`; `Projeto.prazoContrato` e
  `DocumentoJuridico.assinadoEm` são `DateTime` com hora e passam por `diaDeSaoPaulo` antes de virar dia (o smoke cobre uma
  data perto da meia-noite).

### Nota de motivo

- Uma por marco (`marcoId` único), texto simples, 1 a 500 caracteres depois de aparar, sem formatação.
- Escrever, editar e remover são `defineAction`, `interno: true`, com a mesma audiência da conversa
  (`podeVerConversaDoProjeto`); sem permissão nova no catálogo. A auditoria é automática e o texto vai em `redact`
  (é texto que sai ao cliente).
- Guarda autor e momento; o cliente nunca recebe o autor.
- Marco entregue: a nota continua guardada (histórico), mas não é mostrada ao cliente nem editável.

### Previsão alterada (a parte que exige guardar estado)

A previsão é calculada, e ninguém guarda o valor anterior. Cada marco da agenda tem uma linha em `MarcoAgendaPortal` com
`previsaoVista` (o último valor que a rotina de aviso conferiu).

Rotina (primeiro passo da rodada do resumo diário, antes de montar os itens):

- cronograma **em revisão**: não faz nada com o marco (nem grava, nem avisa); quando a revisão fecha, a próxima rodada
  compara com o último valor visto e avisa a diferença líquida;
- sem linha, ou `previsaoVista` nulo: grava a previsão de hoje como `previsaoVista` e **não avisa** (primeira vez nunca
  avisa);
- previsão de hoje = `previsaoVista`: nada;
- diferente: grava `previsaoAnterior = previsaoVista`, `previsaoVista = hoje`, `previsaoAlteradaEm = ontem` (o resumo
  avalia dias até ontem, então o aviso sai na mesma manhã). Vale nos dois sentidos (adiantou ou atrasou). Marco entregue
  não avisa.

Isto soma só a diferença líquida entre duas rodadas: a coordenação pode mexer na EAP dez vezes ao dia e o cliente recebe, no
máximo, um aviso por dia por marco.

### Avisos no resumo diário

O resumo continua o job `portal-resumo-diario` (07:00), as mesmas reservas por conta/projeto/dia/canal (`AvisoPortalEnviado`),
o mesmo opt-out (`portal_resumo`) e o mesmo sino. Dois tipos de item novos, que entram na mesma lista por dia:

- **Marco próximo**: o resumo só avalia dias até ontem, então o item tem `dia` = previsão atual − 8 dias (corridos) e sai na
  manhã de previsão − 7. O texto **não conta dias** (a rodada pode recuperar dias perdidos e o número ficaria errado):
  "Entrega do projeto básico prevista para 15/03/2026." Não gera item para marco entregue nem para marco sem previsão. Marco
  que já está a menos de 7 dias no deploy, ou que foi adiantado para dentro da janela, não gera este aviso (o de
  "previsão alterada" cobre o segundo caso).
- **Previsão alterada**: dia do item = `previsaoAlteradaEm`. Texto: "Entrega do projeto básico: previsão alterada de 02/04
  para 20/04 (combinado: 15/03)" e, se houver nota, a nota na linha seguinte. Marco fora da `BL-00` sai sem o trecho
  "(combinado: …)". Texto escapado para Markdown, como o resto do resumo.

A fonte dos itens do aviso é a mesma da tela (a mesma função de leitura, e o mesmo filtro de "quais marcos entram"). O
aviso nunca fala de marco que a agenda não mostra.

## Audiência e permissões

- **Cliente**: conta externa ativa de cliente ativo, projeto do próprio cliente. Recusa uniforme ("não encontrada"); sem
  rota nova — a leitura é da página.
- **Equipe**: leitura e escrita pela audiência da conversa. O projetista não vê a seção. Gestores globais veem todos os
  projetos.
- `portal` continua sem permissão no catálogo; o gate é o do serviço, como nas atas.

## Não-objetivos

- Reuniões futuras e convites (`.ics`): ficam fora. As reuniões continuam nas atas.
- Qualquer data de cronograma interno (fases, atividades, marcos sem parcela, restrições, caminho crítico).
- Valor, percentual ou situação de cobrança de parcela.
- Motivo automático do atraso. É evolução possível (ex.: "Aguardando sua aprovação" pelo estado de uma aprovação de
  entrega pendente), não entra agora.
- Aviso imediato por e-mail/sino quando a previsão muda.
- Editar datas pelo portal; o cliente só lê.
- Histórico de todas as mudanças de previsão (só a última mudança fica guardada).
- Marco novo de contrato por data (contrato por data não tem marcos; só prazo e vigência).

## Anti-objetivos

- A previsão aparecer como promessa: o cartão sempre diz qual data é a combinada e qual é a previsão.
- Alarme: nenhum aviso por ajuste interno intermediário; no máximo um por marco por dia.
- Vazar o interno: nome de linha da EAP, pessoa da equipe, horas, custo, valor da parcela.
- Divergir do financeiro: a previsão da agenda tem de ser a mesma que alimenta a previsão de recebimento.
- Nota que acusa: o texto é da coordenação, escrito e revisado por ela; o sistema nunca gera frase de culpa.

## Abordagens

1. **Tabela própria `MarcoAgendaPortal`, uma linha por marco (escolhida).** Guarda a nota (autor e momento) e o estado de
   previsão (`previsaoVista`, `previsaoAnterior`, `previsaoAlteradaEm`). A rotina diária compara e detecta. Não mexe na EAP
   nem na parcela do contrato; só a diferença líquida do dia chega ao cliente.
2. Nota como coluna em `ContratoParcelaEntrega` + tabela de eventos gravada dentro de `aposMudarEap`. Rejeitada: toca o
   caminho de toda edição da EAP (o mais sensível do sistema), gera um evento por ajuste intermediário e o aviso teria de
   filtrar ruído; histórico completo ninguém pediu.
3. Calcular tudo na hora, sem guardar nada. Rejeitada: o aviso "previsão alterada" é impossível sem um valor anterior.

## Modelo de dados (migração aditiva)

`MarcoAgendaPortal` (tabela `marco_agenda_portal`):

- `id`, `projetoId` (FK `Projeto`, cascade, índice), `marcoId` (`EapTarefa`, **único**, cascade);
- `nota` (texto, nulo), `notaPorId` (FK `User`, SetNull), `notaEm` (timestamp);
- `previsaoVista` (`@db.Date`, nulo), `previsaoAnterior` (`@db.Date`, nulo), `previsaoAlteradaEm` (`@db.Date`, nulo);
- `createdAt`, `updatedAt`.

A linha nasce sob demanda (rotina de aviso ou primeira nota). Só objetos novos; nenhuma coluna existente muda. Checar no
`migration.sql` que não há `ALTER` de tabela existente.

## Decisões do agente (corrigíveis)

Coisas que o dono não decidiu e eu escolhi, para ele conferir:

1. **Nome do marco = descrição da parcela do contrato**, não o nome da linha da EAP: é o texto escrito para o cliente.
2. **Dias corridos** na diferença, não úteis.
3. **Marco fora da `BL-00`** mostra só a previsão (sem "Combinado").
4. **Marco entregue** mostra "Entregue em", mantém o combinado e esconde a nota; não gera aviso.
5. **Previsão alterada vale nos dois sentidos** (adiantar também avisa).
6. **Marco próximo**: aviso 7 dias corridos antes da previsão atual, sem contar dias no texto.
13. **Cronograma em revisão** segura o aviso de "previsão alterada" (a tela segue ao vivo).
14. **Só `tipo = "contrato"`** conta para assinatura, vigência e marcos (aditivo/proposta/procuração ficam fora), assinado
    dentro ou fora do portal.
15. **O item "Prazo do projeto" fica na agenda e o "Prazo" do cabeçalho continua como está** (não mexo em outra tela); a
    pequena repetição é aceita.
7. **Primeira conferência nunca avisa** (senão o deploy dispara um aviso por marco).
8. **Aviso de alteração sai na mesma manhã** (`dia = ontem` do passo de conferência).
9. **Sem `.ics`**, sem lembrete próprio, sem rota de API nova.
10. **Assinatura do contrato e prazos aparecem como fatos**, sem "Combinado × Previsão" (não há previsão para eles).
11. **Sem permissão nova no catálogo**; o gate é o da conversa.
12. Lista com **no máximo uma linha por marco** mesmo com dois contratos apontando o mesmo marco.

## O que fica para quem constrói

- Confirmar a fonte única da "Previsão atual" (plano do motor × `fimPrevisto` gravado) e usar a mesma na agenda, na previsão
  de recebimento e no aviso.
- Conferir se editar o plano de parcelas do contrato **recria** as parcelas (por isso a chave da nota é o `marcoId`, não a
  parcela) e garantir que a nota sobrevive.
- Estender o item do resumo (`ItemLinhaDoTempo` hoje exige disciplina) ou criar um tipo irmão, sem poluir o cartão "Linha
  do tempo" da tela.
- Onde chamar a rotina de conferência: dentro de `rodarResumoDiario`, antes de `resumirProjeto`, idempotente e sem derrubar a
  rodada se falhar (loga, segue).
- Smoke `smoke:portal-agenda` (entra no `package.json` e na lista do CLAUDE.md): cronograma em rascunho = vazio; combinado ×
  previsão; marco fora da `BL-00`; marco entregue; marco apagado; contrato por data (sem marcos); outro cliente/cliente
  inativo; allow-list do DTO (sem valor, percentual, nome de linha, pessoa); nota (audiência, 500, entregue recusa, remover);
  primeira conferência sem aviso; mudança e volta ao mesmo valor sem aviso; alteração nos dois sentidos; itens do resumo
  ("em 7 dias" e "alterada") com a reserva por dia.
- Manual (`docs/manual/...`, inclusive `inicio/portal-cliente.md` pela rotina de stage por HEAD) e `novidades.md`.
- Tela: 390×844 sem rolagem horizontal; 1366×768 com o menu aberto; o cartão e a seção seguem `CabecalhoPagina`/a ordem das
  outras seções.
