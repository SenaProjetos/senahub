---
titulo: Projetos
descricao: Cadastro e acompanhamento de projetos, disciplinas, responsáveis, revisões e ciclo de vida.
resumo: Liste e filtre projetos, crie/edite, gerencie disciplinas e seus status, responsáveis, membros, revisões, duplicação e cancelamento/arquivamento.
tags: [projetos, disciplinas, status, responsáveis, membros, revisões, duplicar, cancelar, arquivar, progresso]
palavras-chave: [projeto, disciplina, status, em andamento, em revisão, entregue, aprovado, responsável, membro, revisão, duplicar projeto, cancelar projeto, prazo]
sinonimos: [obras, jobs, contratos de projeto]
---

# Projetos

## Objetivo

Centralizar o cadastro e o acompanhamento dos projetos do escritório: dados do projeto,
disciplinas técnicas, responsáveis, prazos, progresso, revisões e situação.

## Quando utilizar

- Para criar um projeto, acompanhar o andamento das disciplinas e atualizar status.
- Para gerenciar a equipe (membros) e registrar revisões.

## Quando não utilizar

- O **cliente** não usa esta tela; ele acompanha pelo [Portal](../inicio/portal-cliente.md).
- Para o cronograma detalhado (gantt/EAP), use [Planejamento](planejamento.md).

## Como acessar

- Menu → **Projetos** (`/projetos`). Exige a permissão **`projetos:ver`**.
- Perfis disponíveis: admin, supervisor, administrativo, clt, estagiário, projetista_pj,
  freelancer.

## Escopo (quem vê quais projetos)

- **Global** (admin, supervisor ou sócio ativo): vê **todos** os projetos.
- Demais perfis: veem apenas projetos onde são **membros** ou **responsáveis por uma
  disciplina**.

## A lista de projetos

- **Busca** por texto e **filtros**: situação, cliente, responsável, disciplina e
  **"meus projetos"** (onde você é membro).
- **Ordenação** por código, nome, situação ou cliente.
- **Paginação** padrão (12/24/48 por página).
- O botão **Novo projeto** e as ações de edição aparecem apenas para quem tem
  **`projetos:gerir`**.

## Criar um projeto

1. Clique em **Novo projeto**.
2. Preencha: tipo, **nome**, **cliente**, descrição, área (m²), endereço, **prazo
   final**, valor de contrato.
3. Defina os **membros** da equipe e as **disciplinas** (nome, prazo, valor e
   responsáveis de cada uma).
4. **Salvar**. O sistema gera automaticamente o **código** no formato `AAXXXX`
   (ano + sequencial) e cria os canais de chat do projeto.

> Exige `projetos:gerir`.

## Disciplinas e fluxo de status

Cada disciplina passa por um ciclo de status:

| Status | Significado | Progresso |
| --- | --- | --- |
| Aguardando | Ainda não iniciada | 0% |
| Em andamento | Em execução | 40% |
| Em revisão | Sob revisão | 60% |
| Entregue | Entregue, aguardando validação | 85% |
| Aprovado | Validada (status final) | 100% |

- O **progresso do projeto** é a média desses pesos entre suas disciplinas.
- **Quem altera o status:** gestores (admin/supervisor) **ou** os **responsáveis** pela
  disciplina.
- **Transições para não-gestores** são limitadas: Aguardando→Em andamento; Em
  andamento→Entregue/Em revisão; Em revisão→Em andamento/Entregue; Entregue→Em revisão.
- **Aprovado é terminal** — só é atingido pela **validação da entrega** (não se marca
  "aprovado" manualmente no status).
- Ao marcar **Entregue**, os validadores (admin/supervisor/administrativo) são
  **notificados**. Ao pedir **Em revisão**, os responsáveis são notificados.

### Gerenciar disciplinas (exige `projetos:gerir`)

- **Criar / editar / excluir** disciplina.
- **Adicionar do catálogo** (ignora nomes que já existem no projeto).
- **Editar em massa** (status, prazo e responsável de várias de uma vez).
- **Regras:** o **prazo da disciplina não pode ultrapassar o prazo do projeto**; não é
  possível **excluir** disciplina que já tenha **arquivos enviados** ou **pagamentos
  liberados**.

## Responsáveis, membros e revisões

- **Responsáveis** por disciplina: definidos por quem tem `projetos:gerir`; ao atribuir,
  a pessoa é notificada.
- **Membros** do projeto: equipe com papel; sincroniza os canais de chat do projeto.
- **Revisões (R0, R1, …):** qualquer **responsável** ou gestor registra uma revisão com
  motivo; os demais responsáveis são notificados.

## Outras ações do projeto

- **Duplicar projeto:** cria uma cópia (`nome (cópia)`, novo código), com disciplinas;
  opcionalmente copia responsáveis, membros, EAP e composição de preço. **Nunca** copia
  arquivos, revisões ou pagamentos.
- **Cancelar / Arquivar:** muda a situação e notifica os membros; o motivo é registrado
  na descrição.

## Abas do detalhe do projeto

Ao abrir um projeto, a **Visão Geral** mostra a situação executiva: progresso, prazo final,
área, disciplinas entregues, pendências que requerem atenção, última atualização, riscos,
equipe e atividade recente.

- O progresso é estimado pelos status das disciplinas.
- A **Linha do tempo** usa somente o planejamento cadastrado na EAP. Sem planejamento,
  ela informa que o cronograma ainda não foi cadastrado.
- O total de pendências reúne somente itens abertos aos quais você tem acesso: apontamentos,
  apontamentos de compatibilização, tarefas, solicitações de revisão e aprovações pendentes.
- A tabela **Disciplinas do projeto** é um resumo. Clique em uma disciplina ou em
  **Abrir disciplinas** para acompanhar e trabalhar nos detalhes.

A aba **Disciplinas** concentra o trabalho operacional: kanban, alteração de status,
responsáveis, arquivos, validações, revisões, tarefas e diário. Ela preserva todas as ações
do acompanhamento detalhado em uma área própria.

### Organizar a Visão Geral

Em uma tela ampla, use **Personalizar painel** para ajustar a Visão Geral à sua rotina.

- Arraste cada bloco pelo marcador no canto superior direito.
- Para trocar dois blocos, mantenha um sobre o outro até aparecer **Solte para trocar** e então solte.
  Uma passagem rápida não reorganiza o painel, e o sistema só oferece a troca quando os dois tamanhos
  cabem nos respectivos espaços.
- Redimensione o bloco pelo canto inferior direito. O sistema mantém tamanhos mínimos para
  que tabelas, cronograma e indicadores continuem legíveis.
- Clique em **Concluir personalização** quando terminar. As alterações são salvas apenas
  para você e somente naquele projeto; os demais membros continuam com seus próprios painéis.
- Use **Restaurar padrão** para voltar ao arranjo inicial.

No celular, a Visão Geral permanece em uma coluna para leitura. A personalização volta a
ficar disponível ao abrir o projeto em uma tela ampla.

### Horas registradas no projeto

Para **Administrador**, **Coordenador** e **Administrativo**, a Visão Geral mostra o bloco
**Horas registradas no projeto**. Ele reúne os registros dos últimos 7 dias, separados por
dia e pessoa:

- jornadas de colaboradores CLT e estagiários;
- apontamentos de horas de projetistas PJ e freelancers;
- horário de início e fim, ou a indicação **Em andamento** quando o registro ainda está aberto;
- duração de cada registro e o total acumulado em cada dia.

Essa lista é apenas para acompanhamento: ela não altera jornadas nem apontamentos. Quem trabalha
no projeto continua vendo somente o próprio bloco **Ponto no projeto**. Os perfis **TI** e
**Cliente** não veem registros de horas da equipe.

### Resultado financeiro

Quem tem acesso ao financeiro do projeto vê o bloco **Resultado financeiro** quando houver
faturamento confirmado. Além do resumo de faturamento, despesas, rateio de horas e margem
realizada, o card exibe a composição confirmada automaticamente quando está largo o suficiente:

- pagamentos a projetistas;
- serviços terceirizados;
- custos extras;
- rateio de horas de CLT e estagiários;
- rateio dos demais colaboradores.

Em um card menor, o resumo permanece compacto. Use **Ver detalhamento financeiro** para consultar
os valores previstos e a análise completa.

Além disso, há abas para: **Lista Mestre**, **Serviços**, **Arquivos**, **Extras**,
**Financeiro** e **Inputs** (formulários de start). Cada uma será detalhada em sua própria
página do manual. (A aba **Lista Mestre** organiza as folhas técnicas por disciplina —
substitui a antiga aba "Pranchas".)

### Link do formulário para o cliente (aba Inputs)

No topo da aba **Inputs**, o cartão **Formulário do cliente** gera um link público que
abre o briefing de start **e** as perguntas extras — o cliente preenche **sem login e sem
cadastro**, e as respostas caem direto nesta aba (salvam sozinhas, campo a campo).

- **Gerar link público** cria o endereço; **Copiar**/**Abrir** ficam ao lado dele.
- **Link ativo** desligado **revoga na hora**; **Expira em** desliga o link na data
  escolhida (vazio = não expira). Depois disso o cliente vê "Link indisponível".
- **Regerar link** troca o endereço e invalida o anterior — use se o link vazou.
- Quando o cliente preenche, a gestão recebe notificação (uma por janela de 6 h, mais um
  aviso quando o briefing fica completo). Para não receber, desligue **Formulário
  preenchido pelo cliente** em *Preferências → Notificações*.

## Permissões (resumo)

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `projetos:ver` |
| Criar/editar projeto, disciplinas, membros | `projetos:gerir` |
| Alterar status / registrar revisão | Responsável da disciplina **ou** gestor |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Transição de X para Y não permitida." | Fluxo de status restrito a não-gestores | Seguir a sequência válida ou pedir a um gestor |
| "Status 'aprovado' só pode ser definido via validação de entrega." | Tentativa de marcar aprovado direto | Validar a entrega |
| "Não é possível excluir uma disciplina com arquivos/pagamentos." | Disciplina com vínculos | Remover vínculos antes ou manter a disciplina |
| "O prazo da disciplina não pode ultrapassar o prazo do projeto." | Prazo inválido | Ajustar o prazo |
| Não vejo "Novo projeto" | Falta `projetos:gerir` | Solicitar permissão |

## Funcionalidades relacionadas

- [Meu trabalho](meu-trabalho.md) · [Planejamento](planejamento.md) · [Tarefas](tarefas.md)
- [Clientes](../clientes-comercial/README.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Como o código do projeto é gerado?** Automaticamente, no formato `AAXXXX` (ano +
sequencial).

**Por que não consigo aprovar uma disciplina?** "Aprovado" só vem da validação da
entrega — não é uma troca manual de status.
