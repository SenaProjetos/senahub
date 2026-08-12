---
titulo: Configurações (administração)
descricao: Central de administração — usuários, permissões, parâmetros de folha, projetos, licitações, funil e avisos, além do status das integrações.
resumo: Hub administrativo com cadastros e parâmetros do sistema (usuários, permissões, encargos, documentos/inputs padrão, feriados, licitações, funil) e o status das integrações on-premise (SMTP/push).
tags: [configurações, administração, usuários, permissões, encargos, feriados, licitações, funil, avisos, agendamento, integrações]
palavras-chave: [configurações, administração, usuários, permissões, matriz, encargos, inss, irrf, feriados, modalidades, habilitação, funil, aviso geral, agendar aviso, aviso agendado, comunicado programado, smtp, push]
sinonimos: [admin, ajustes do sistema, parâmetros, settings]
---

# Configurações (administração)

## Objetivo

Reunir a **administração do sistema** — cadastros, parâmetros e comunicados — em um só
lugar.

## Como acessar

- Menu → **Configurações** (`/configuracoes`). Restrito a **admin, supervisor e
  administrativo**.

## O que há aqui

### Usuários & Acesso
- **Usuários** — cadastrar, editar, desativar e **reiniciar senhas**.
- **Permissões** — **matriz de acesso por perfil** (recurso × ação). Após editar,
  o sistema recarrega as permissões do perfil.

### Financeiro
- **Encargos da folha** — faixas de **INSS** e **IRRF** usadas no holerite.

### Projetos & Operação
- **Documentos padrão** — modelo do Estúdio usado por padrão em cada fonte.
- **Inputs padrão** — perguntas padrão por disciplina no link do cliente.
- **Feriados** — calendário (ponto, escala, banco de horas).
- **Modalidades de licitação** — lista usada no cadastro de licitações.
- **Parâmetros de licitação** — prazos de recurso, limite de aditivo, modo PNCP/reajuste,
  alertas.
- **Checklist de habilitação** — modelos de exigências para licitações.
- **Etapas do funil** — estágios do pipeline comercial (criar/editar/ativar/desativar).

### Sistema
- **Aviso geral** — enviar um comunicado (**modal em tela cheia + sino/push** e, se quiser,
  **e-mail**) para todos, por categoria de perfil ou por nome. Pode **exigir confirmação de
  leitura** e levar uma **imagem**.
  - **Agendar envio** — em vez de disparar na hora, escolha data e hora (até **90 dias**).
    O aviso fica na aba **Agendados** e pode ser **cancelado** enquanto não disparar.
    Os destinatários são apurados **no momento do envio** — quem entrar na equipe até lá
    também recebe.
  - A aba **Enviados** mostra o registro com **quantos confirmaram** a leitura.

### Integrações (somente leitura)
- **E-mail (SMTP)** e **Web Push (VAPID)** mostram se estão **configurados**. O sistema é
  **on-premise**: serviços rodam no próprio servidor e são definidos por **variáveis de
  ambiente** — não há integrações SaaS externas.

## Permissões

- A tela é gated em **admin, supervisor, administrativo**. Algumas sub-telas têm gates
  próprios (ex.: parâmetros de licitação podem ser restritos ao admin).

## Funcionalidades relacionadas

- [Permissões e perfis](../quick-start.md#9-perfis-de-acesso-quem-vê-o-quê) · [Folha CLT](../rh-ponto/folha-clt.md) · [Licitações](../gestao/licitacoes.md) · [Comercial](../clientes-comercial/comercial.md)

## FAQ

**Como reinicio a senha de um usuário?** Em **Configurações → Usuários**.

**Por que não consigo enviar um Aviso geral mesmo sendo supervisor?** O envio de avisos
pode estar restrito ao admin (ver pendência na deliberação da seção).

**Agendei um aviso e a hora passou sem enviar.** O disparo depende do serviço de tarefas do
servidor. Se ele estiver parado, o aviso continua na fila e sai assim que o serviço voltar —
nada é perdido. Verifique também se o envio não foi **cancelado** na aba Agendados.

**Dá para editar um aviso agendado?** Não. **Cancele** e crie outro com o texto corrigido.
