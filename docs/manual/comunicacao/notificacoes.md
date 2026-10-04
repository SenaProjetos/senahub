---
titulo: Notificações
descricao: Central de avisos (sino), notificações push e opt-out por categoria.
resumo: O sino no topo concentra os avisos do sistema; avisos idênticos em sequência aparecem agrupados num item com contagem, e é possível receber push no navegador e desativar categorias específicas nas preferências.
tags: [notificações, sino, push, avisos, alertas, categorias, preferências, agrupamento]
palavras-chave: [notificação, sino, push, aviso, alerta, lembrete, categoria, opt-out, prazo, inadimplência, agrupamento, avisos repetidos, notificações duplicadas, contagem, aviso geral, reler aviso, avisos recebidos, comunicado]
sinonimos: [avisos, alertas, central de notificações, avisos repetidos]
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

## Agrupamento de avisos repetidos

Um mesmo evento pode gerar vários avisos iguais em poucos minutos — por exemplo, enviar
cinco arquivos para uma disciplina gera um aviso de validação por arquivo. No **sino**,
avisos idênticos (mesmo título, mesmo texto e mesmo destino) criados dentro de **15 minutos**
aparecem como **um item só**, com um selo de contagem (`5×`) e o horário da ocorrência mais
recente.

- **Nada é descartado.** O agrupamento é só de exibição — a página **Ver tudo**
  (`/notificacoes`) continua listando cada aviso individualmente.
- **Marcar como lido**, **marcar como não lido** e **excluir** agem sobre o **grupo inteiro**.
- O contador vermelho do sino continua contando **avisos**, não grupos: um item `5×` não lido
  soma 5 no contador.
- Avisos do mesmo tipo separados por mais de 15 minutos ficam em itens diferentes.

## Avisos gerais recebidos

Comunicados da empresa (o **Aviso geral**, que abre em tela cheia) ficam guardados em
**Avisos** no menu lateral (`/avisos`) — para reler depois que o modal fechou.

- A lista mostra do **mais novo ao mais antigo**, com quem enviou e quando chegou.
  Avisos que você ainda não confirmou aparecem destacados, com o selo **Não confirmado**.
- Clicar num aviso abre o comunicado **inteiro**, igual ao modal: **formatação** e **imagem**
  (clique na imagem para ver em tamanho original). Se ainda não confirmou, dá para clicar em
  **Li e entendi** ali mesmo.
- No **sino**, a notificação de um aviso geral leva direto a ele em Avisos.
- Em **Notificações** (`/notificacoes`), o botão **Avisos recebidos** também leva para lá.
- Quem tem permissão de **enviar avisos** vê na mesma tela as abas **Agendados** e
  **Enviados** (ver [Configurações](../sistema/configuracoes.md)).

## Regras de negócio

- Cada categoria respeita a sua **preferência** antes do envio.

## Funcionalidades relacionadas

- [Chat](chat.md) (menções) · [Preferências](../sistema/README.md) · [Agenda](../projetos/agenda.md)

## FAQ

**Como paro de receber um tipo de aviso?** Desative a **categoria** correspondente nas
Preferências.

**Push não chega.** O push depende de permissão do navegador e da configuração do
servidor; verifique a permissão de notificações do navegador.
