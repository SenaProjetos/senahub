---
titulo: Deliberação — Seção Comunicação
descricao: Ata do Conselho sobre Chat, Suporte e Notificações.
resumo: Descobertas no código (gates de chat, visibilidade de tickets, categorias de notificação) e decisões da documentação.
tags: [deliberação, conselho, chat, suporte, notificações]
palavras-chave: [deliberação, ata, chat, suporte, ticket, notificação, categoria]
sinonimos: [ata técnica]
---

# Deliberação — Seção Comunicação

- **Data:** 2026-06-30
- **Funcionalidades:** `/chat`, `/suporte`, notificações (sino + push).

## Participantes
Presidente, Iniciante, Experiente, UX, Backend, Frontend, QA, Negócios, Diretor,
Treinamento, Revisor Técnico, Arquiteto, Product Owner, Suporte.

## Descobertas (inspeção de código)
- **Chat** (`app/.../chat/page.tsx`, `CHAT_ROLES`): admin/supervisor/administrativo/clt/
  estagiário/projetista_pj (não freelancer, não cliente). Canais por projeto sincronizados
  (`sincronizarCanaisDoUsuario`), DMs, `chatStatus`, som/recibos via preferências. Depende
  do servidor de tempo real (Socket.io) — CLAUDE.md.
- **Suporte** (`app/.../suporte/page.tsx`): `requireUser` (todos, inclusive cliente).
  Gestor (admin + HR_ADMIN) alterna meus/todos (default todos) e filtra prioridade; demais
  só os próprios. Ticket: título/descrição/status/prioridade(baixa/media/alta/urgente)/
  categoria/mensagens com anexo.
- **Notificações**: sino no header (`NotificationBell`); push (VAPID, opcional);
  categorias com opt-out em `preferencias` (`lib/notificar.ts` + `filtrarPorCategoria`).

## Questionamentos
- Cliente vê Suporte? → **sim** (`requireUser`), e o item de menu não tem `roles`
  (revisao-telas 0.A.1 deixa a decisão em aberto). Documentado o comportamento atual.
- Freelancer tem chat? → **não** (fora de `CHAT_ROLES`). Documentado.

## Opiniões dos Especialistas
- **Backend:** deixar explícito que chat exige tempo real — incluído como requisito e
  erro/solução.
- **UX:** notificações estão no **sino**, não numa rota — a página explica isso.
- **QA:** cobrir "push não chega" (permissão do navegador) — FAQ.
- **Suporte:** visibilidade meus×todos é dúvida — documentada.

## Discussão
Consenso: tratar Notificações como funcionalidade transversal (sino + push + categorias),
com referência cruzada a Preferências (onde está o opt-out).

## Divergências
Nenhuma.

## Decisão Final
- Publicadas [chat.md](../comunicacao/chat.md), [suporte.md](../comunicacao/suporte.md) e
  [notificacoes.md](../comunicacao/notificacoes.md).

## Melhorias Sugeridas
- **Documentação:** detalhar fluxo de menções e o status do chat; lista completa e
  descrição de cada categoria de notificação.
- **Sistema (não altera comportamento):** decidir se cliente deve ver "Suporte" no menu
  (revisao-telas 0.A.1).

## Pendências
- Confirmar a lista **completa e atual** de categorias de notificação (validar
  `lib/notificar.ts`).
- Confirmar o ciclo de **status** do ticket de suporte (enum) para detalhar.
