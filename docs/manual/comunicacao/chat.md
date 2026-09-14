---
titulo: Chat
descricao: Comunicação interna em tempo real — canais de projeto e mensagens diretas, com status e recibos.
resumo: Converse em tempo real por canais (inclusive os criados automaticamente por projeto) e mensagens diretas; defina seu status, som e recibos de leitura.
tags: [chat, mensagens, canais, dm, tempo real, status, recibos, menções, anotações]
palavras-chave: [chat, mensagem, canal, conversa, direta, dm, tempo real, status, online, recibo, menção, notificação]
sinonimos: [mensageria, comunicador, conversas]
---

# Chat

## Objetivo

Comunicação interna **em tempo real** entre a equipe, por **canais** e **mensagens
diretas**.

## Quando utilizar

- Para falar com colegas e equipes de projeto sem sair do sistema.

## Como acessar

- Menu → **Chat** (`/chat`). Disponível a admin, supervisor, administrativo, clt,
  estagiário e projetista_pj. **Freelancer e cliente não têm chat.**

## O que a tela oferece

- **Canais:** conversas em grupo. Cada **projeto** ganha canais **criados/sincronizados
  automaticamente**, com seus membros.
- **Mensagens diretas (DM):** conversa 1‑a‑1 com outro usuário.
- **Anotações:** espaço só seu, sem outros membros, para anotações, links e referências de
  trabalho. Crie pelo **+** ao lado de **Anotações** na lista de conversas; pode ter mais de
  um (ex.: um por projeto) e renomear pelo lápis no topo. Funciona como uma conversa: texto,
  anexos, áudio, mensagens fixadas, busca e encaminhar para outra conversa.
- **Lixeira das Anotações:** o ícone de lixeira no topo move as anotações para a **Lixeira**
  (dentro da seção Anotações). Lá elas ficam **30 dias**, sem aceitar mensagens novas, e podem
  ser **restauradas** com um clique. Passado o prazo, mensagens e arquivos são apagados de vez.
- **Status:** seu estado no chat (ex.: disponível) — exibido aos demais.
- **Som** de notificação e **recibos de leitura** — configuráveis (ligados por padrão);
  ajuste em [Preferências](../sistema/README.md).
- **Menções** a pessoas geram notificação ao mencionado.

## Requisitos técnicos

- O chat depende do **servidor em tempo real** estar ativo. Em ambientes onde o tempo
  real não está disponível, as mensagens **não** atualizam ao vivo.

## Regras de negócio

- Os **canais de projeto** refletem os **membros** do projeto (entrou no projeto, entra
  no canal).
- Recibos e som seguem suas **preferências**.
- **Anotações** são visíveis **só para você e para os administradores do sistema** (perfil
  admin) — supervisores não veem. Toda vez que um administrador abre as anotações de outra
  pessoa, isso fica registrado na auditoria. Não é possível adicionar membros.
- As Anotações são para **trabalho**: não guarde ali informações da sua vida privada (ver
  cláusula 3.3 do Termo de Uso).

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| Mensagens não chegam ao vivo | Servidor de tempo real indisponível | Recarregar; persistindo, falar com TI/Suporte |
| Não vejo o Chat no menu | Seu perfil não tem chat (freelancer/cliente) | Comportamento esperado |

## Funcionalidades relacionadas

- [Projetos](../projetos/projetos.md) (canais por projeto) · [Notificações](notificacoes.md) · [Preferências](../sistema/README.md)

## FAQ

**De onde vêm os canais de projeto?** São criados automaticamente para cada projeto e
acompanham seus membros.

**Posso desligar o som do chat?** Sim, nas Preferências.

**Excluí anotações sem querer. Dá para recuperar?** Sim, em até 30 dias: abra **Anotações →
Lixeira** e clique em **Restaurar**. Depois de 30 dias não há como recuperar.

**Minhas Anotações são privadas?** São suas e de mais ninguém da equipe, mas os
administradores do sistema podem ler, e esse acesso fica registrado. Use para anotações e
links de trabalho.
