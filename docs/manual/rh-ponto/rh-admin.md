---
titulo: RH — administração
descricao: Aprovação e lançamento de abonos/atestados e férias, banco de horas, feedback, ponto manual, onboarding e validação de NFs.
resumo: Central administrativa do RH — aprova solicitações, fecha banco de horas, acompanha clima/humor, dá feedback, lança ponto manual, gerencia onboarding e valida notas fiscais de PJ.
tags: [rh admin, abonos, férias, banco de horas, clima, feedback, ponto manual, onboarding, nota fiscal]
palavras-chave: [rh administração, aprovar abono, lançar abono, lançar atestado, aprovar férias, banco de horas, fechamento, clima, feedback, ponto manual, onboarding, validar nf]
sinonimos: [administração de rh, gestão de pessoas, dp]
---

# RH — administração

## Objetivo

Reunir as rotinas administrativas de RH em um só lugar.

## Como acessar

- Menu → **RH — admin** (`/rh/admin`). Restrito a quem tem a **Gestão de RH**, concedida pessoa
  a pessoa em Configurações → Usuários, e aos administradores.

## O que a tela oferece

- **Aprovações:** abonos e férias **pendentes** (aprovar/recusar). Um item decidido sai da
  fila; se outra pessoa do RH já o decidiu, a tela avisa e não muda a decisão dela.
  - **Quem é do RH tem ausência e férias decididas por um administrador** (superusuário). A sua
    própria solicitação e a de um colega do RH aparecem na fila sem botões, com o motivo, e o
    aviso do pedido vai para os administradores. O administrador decide qualquer uma, inclusive
    a dele.
  - Pelo mesmo motivo, **Lançar férias** e **Lançar abono** não oferecem você mesmo nem quem é
    do RH na lista (a não ser para o administrador).
  - Aprovar um abono por cima de uma ausência **já aprovada** da mesma pessoa no mesmo período é
    recusado: as horas contariam duas vezes. Rejeite a solicitação repetida.
  - Também é recusado aprovar um abono num período em que a pessoa está de **férias aprovadas**
    (o dia já não é cobrado), e aprovar férias que cruzam **outras férias aprovadas** da mesma
    pessoa (os dias sairiam duas vezes do período aquisitivo).
  - Um período de férias tem no máximo **30 dias corridos**, ao lançar, ao editar e ao propor nova
    data. Períodos acumulados entram como períodos separados, um logo depois do outro.
  - **Atestado:** só abre quem pode decidir a ausência. O atestado de quem é do RH só um
    administrador abre; para os demais, a fila e a ficha mostram "Atestado anexado: só um
    administrador abre." no lugar de **Ver** e **Baixar**. A própria pessoa sempre abre o dela.
- **Lançar abono:** registra um atestado ou uma ausência de alguém **sem depender da
  solicitação** do colaborador (por exemplo, o atestado entregue em mãos). Escolha a pessoa, as
  datas (ou o horário, para um único dia), o motivo, o tratamento das horas — **abonar** (não
  cobra) ou **banco de horas** (as horas continuam devidas) — e, se houver, anexe o atestado. A
  ausência já entra **aprovada**, aparece como "Lançado pelo RH" e o colaborador é notificado. O
  mesmo botão está na aba **Ausências** da ficha da pessoa. A sua própria ausência e a de quem é
  do RH não podem ser lançadas assim (só pelo administrador): elas passam pela solicitação em
  **RH**, que um administrador aprova. Um campo preenchido errado fica marcado em vermelho, com a
  explicação logo abaixo. Se a pessoa
  já tem uma ausência pendente ou aprovada no mesmo período, o lançamento é recusado — decida a
  solicitação pendente em vez de lançar outra, para as horas não contarem duas vezes. Também é
  recusado se a pessoa está de férias aprovadas nesse período. O atestado
  aceita PDF ou imagem (JPG, PNG, WEBP, GIF ou HEIC) de até 25 MB.
- **Alterações de férias:** mudanças de data em férias **já aprovadas**. Valem por **dupla
  aprovação** — o card lista as propostas feitas pelos colaboradores, mostrando as datas
  originais riscadas e as novas ao lado; ao **Aprovar**, a nova data entra em vigor na hora.
  O RH também pode **propor** uma alteração pela ficha do colaborador; nesse caso quem
  precisa aprovar é o **funcionário**. Recusar mantém as datas originais. A nova data não pode
  cruzar outras férias aprovadas da mesma pessoa. Nas férias de quem é do
  RH, o lado da empresa é sempre de um administrador: o próprio RH pode propor mudar as dele, mas
  quem aprova é um administrador.
- **Clima e humor:** resumo do clima e os feedbacks de humor dos colaboradores.
- **Banco de horas:** duas colunas por colaborador — o **saldo fechado** do mês anterior e o
  **saldo corrente** do mês atual (ao vivo, até hoje, sem precisar fechar nada) — mais o
  acumulado. Entram apenas os **vínculos CLT e de estágio** vigentes no mês. **Recalcular
  histórico** refaz todos os meses já fechados a partir dos registros de ponto (útil depois
  de corrigir escala, feriado ou data de admissão).
- **Feedback:** registrar feedback para colaboradores internos.
- **Ponto manual:** lançar/ajustar batidas de ponto (colaborador + projeto) — útil para
  esquecimentos.
- **Entrada e saída:** fila das listas de admissão e desligamento abertas, pendências por
  responsável (RH, TI, a própria pessoa) com os atrasos, e **Abrir lista** para qualquer pessoa.
- **Listas-modelo:** criar, editar e arquivar as listas de entrada e saída, com responsável e
  prazo por item. Veja [Entrada e saída de pessoas](entrada-e-saida.md).
- **Notas fiscais (NF):** validar (aprovar/rejeitar) as NFs enviadas por prestadores PJ;
  ver o histórico das validadas.

## Permissões

- A tela inteira exige a **Gestão de RH** (ou ser administrador).
- Ausência e férias de quem tem a Gestão de RH só um **administrador** decide ou lança.

## Funcionalidades relacionadas

- [RH — autoatendimento](rh-autoatendimento.md) · [Ponto](ponto.md) · [Folha CLT](folha-clt.md) · [Funcionários](funcionarios.md)

## FAQ

**Por que o banco de horas mostra o mês anterior?** O fechamento padrão é do mês já
encerrado — o prazo (último dia útil do mês corrente) aparece no aviso do card. Para
acompanhar o mês em andamento use a coluna **saldo corrente**.

**Por que fulano não aparece no banco de horas?** Só entram vínculos **CLT** e de
**estágio** vigentes no mês. PJ, autônomo e pró-labore não têm jornada controlada e não
acumulam falta. Quem foi admitido ou desligado no meio do mês aparece, mas só deve horas
**dentro do período do vínculo**.

**Como corrijo um ponto esquecido?** Use **Ponto manual** nesta tela.

**O colaborador me entregou o atestado em mãos. Preciso pedir para ele solicitar?** Não. Use
**Lançar abono** e anexe o atestado. Não use o ponto manual para cobrir falta: ele cria batidas
que não aconteceram e não guarda o atestado.

**Lancei um abono num mês com o banco de horas já fechado. O saldo muda?** Sim, sozinho. Aprovar
ou lançar um abono ou férias, ou aprovar uma nova data de férias, refaz o saldo dessa pessoa nos
meses já fechados a partir do mês da ausência. **Recalcular histórico** continua disponível para
os outros casos (correção de escala, feriado ou data de admissão).

**Sou do RH. Quem aprova as minhas férias e ausências?** Um administrador. Peça pela tela **RH**,
como qualquer colaborador: o aviso vai para os administradores.
