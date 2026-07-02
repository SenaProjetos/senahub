---
titulo: Notificações
descricao: Central de avisos (sino), notificações push e opt-out por categoria.
resumo: O sino no topo concentra os avisos do sistema; é possível receber push no navegador e desativar categorias específicas nas preferências.
tags: [notificações, sino, push, avisos, alertas, categorias, preferências]
palavras-chave: [notificação, sino, push, aviso, alerta, lembrete, categoria, opt-out, prazo, inadimplência]
sinonimos: [avisos, alertas, central de notificações]
---

# Notificações

## Objetivo

Avisar o usuário sobre eventos relevantes (prazos, validações, menções, finanças etc.)
sem depender de e-mail.

## Como acessar

- **Sino** no canto superior direito (barra do topo), em qualquer tela. O sino mostra os
  avisos e marca os não lidos.

## Tipos de aviso

- **Na plataforma:** lista no sino (clicáveis, levam ao item relacionado).
- **Push (navegador):** quando habilitado, chega mesmo com a aba em segundo plano.

## Categorias e opt-out

Notificações têm **categorias** e você pode **desativar** as que não quiser, em
[Preferências](../sistema/README.md). Categorias incluem, por exemplo:

- **prazo_disciplina** — prazos de disciplinas;
- **inadimplencia** — contas em atraso;
- **certidao** — vencimento de certidões;
- **licitacao** — licitações;
- **risco_projeto** — projetos em risco;
- **lembrete_ponto** — lembrete de ponto;
- **digest_semanal** — resumo semanal.

> Ao desativar uma categoria, você deixa de receber aqueles avisos (na plataforma e no
> push).

## Regras de negócio

- Cada categoria respeita a sua **preferência** antes do envio.
- Algumas notificações também são **agrupadas** (ex.: avisos de uma mesma entrega).

## Funcionalidades relacionadas

- [Chat](chat.md) (menções) · [Preferências](../sistema/README.md) · [Agenda](../projetos/agenda.md)

## FAQ

**Como paro de receber um tipo de aviso?** Desative a **categoria** correspondente nas
Preferências.

**Push não chega.** O push depende de permissão do navegador e da configuração do
servidor; verifique a permissão de notificações do navegador.
