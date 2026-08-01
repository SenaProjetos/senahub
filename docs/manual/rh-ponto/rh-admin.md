---
titulo: RH — administração
descricao: Aprovação de abonos/férias, banco de horas, feedback, ponto manual, onboarding e validação de NFs.
resumo: Central administrativa do RH — aprova solicitações, fecha banco de horas, acompanha clima/humor, dá feedback, lança ponto manual, gerencia onboarding e valida notas fiscais de PJ.
tags: [rh admin, abonos, férias, banco de horas, clima, feedback, ponto manual, onboarding, nota fiscal]
palavras-chave: [rh administração, aprovar abono, aprovar férias, banco de horas, fechamento, clima, feedback, ponto manual, onboarding, validar nf]
sinonimos: [administração de rh, gestão de pessoas, dp]
---

# RH — administração

## Objetivo

Reunir as rotinas administrativas de RH em um só lugar.

## Como acessar

- Menu → **RH — admin** (`/rh/admin`). Restrito aos **gestores de RH**: admin, supervisor
  e administrativo.

## O que a tela oferece

- **Aprovações:** abonos e férias **pendentes** (aprovar/recusar).
- **Alterações de férias:** mudanças de data em férias **já aprovadas**. Valem por **dupla
  aprovação** — o card lista as propostas feitas pelos colaboradores, mostrando as datas
  originais riscadas e as novas ao lado; ao **Aprovar**, a nova data entra em vigor na hora.
  O RH também pode **propor** uma alteração pela ficha do colaborador; nesse caso quem
  precisa aprovar é o **funcionário**. Recusar mantém as datas originais.
- **Clima e humor:** resumo do clima e os feedbacks de humor dos colaboradores.
- **Banco de horas:** duas colunas por colaborador — o **saldo fechado** do mês anterior e o
  **saldo corrente** do mês atual (ao vivo, até hoje, sem precisar fechar nada) — mais o
  acumulado. Entram apenas os **vínculos CLT e de estágio** vigentes no mês. **Recalcular
  histórico** refaz todos os meses já fechados a partir dos registros de ponto (útil depois
  de corrigir escala, feriado ou data de admissão).
- **Feedback:** registrar feedback para colaboradores internos.
- **Ponto manual:** lançar/ajustar batidas de ponto (colaborador + projeto) — útil para
  esquecimentos.
- **Onboarding:** iniciar processos a partir de **templates** e acompanhar a conclusão.
- **Notas fiscais (NF):** validar (aprovar/rejeitar) as NFs enviadas por prestadores PJ;
  ver o histórico das validadas.

## Permissões

- Tela inteira gated em **HR_ADMIN_ROLES** (admin, supervisor, administrativo).

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
