# Portal do cliente — resumo diário por e-mail (item 4)

Data: 2026-11-19 · Série: reformulação do portal do cliente (spec 2026-11-18). Itens 1 (entregas) e 2/3 (andamento +
linha do tempo, spec `2026-11-19-portal-andamento-linha-do-tempo-design.md`) já entregues.

## Por quê

O cliente pergunta pelo WhatsApp "saiu alguma coisa?". O portal já mostra tudo, mas ele precisa entrar para ver. O
aviso leva a novidade até ele: um e-mail curto no dia seguinte ao andamento, com um botão para o portal.

Sucesso = o cliente recebe, na manhã seguinte, um e-mail por projeto que andou dizendo o que chegou (pranchas
compartilhadas, liberadas para obra, fases concluídas), e NADA nos dias sem novidade.

Anti-objetivos: e-mail diário vazio ou repetido; rajada de e-mails por prancha; falar de prancha que o cliente não
consegue abrir; despejar o histórico inteiro no primeiro dia.

## Decisões do dono (2026-11-19)

- **D1 — E-mail com resumo por dia, só nos dias em que houve andamento.** Dia sem novidade não manda nada.
- **D2 — Às 7h do dia seguinte**, cobrindo o dia anterior inteiro (dia de São Paulo).
- **D3 — Um job diário que reaproveita a linha do tempo** (sem gancho nos pontos de escrita, sem tabela de eventos).
- Aceitos pelo dono como propostos: destinatários = contas do portal do cliente; conteúdo = as linhas da linha do
  tempo do dia + botão "Abrir no portal"; sino com o mesmo resumo; interruptor geral **ligado** no deploy; recupera
  até 7 dias se o servidor estiver fora, nunca antes de o aviso ser ligado; cliente pode desligar.

## Abordagens consideradas

1. **Job diário às 7h lendo a linha do tempo (escolhida).** A tela e o aviso usam a MESMA função
   (`linhaDoTempo` de `modules/portal/andamento.ts`), então nunca discordam, e nenhum caminho de escrita precisa saber
   do aviso.
2. Avisar no momento da escrita (compartilhar, liberar, aprovar fase). Rejeitada: vários pontos de escrita no ciclo
   documental e na aprovação de fase; um esquecido = cliente sem aviso; e o resumo por dia precisaria agrupar depois.
3. Tabela de acontecimentos. Rejeitada no item 2/3 pelo mesmo motivo.

## O que se constrói

### Regra pura (`src/modules/portal/resumo-diario.ts`, testada)

- `itensDoDia(linha, dia)`: os itens de `ItemLinhaDoTempo[]` com `item.dia === dia`, na ordem da linha do tempo.
- `diasParaAvaliar({ hoje, desde, ultimoDia, limite = 7 })`: os dias de `max(desde, ultimoDia + 1, hoje − 7)` até
  `hoje − 1` (inclusive), em ordem. `desde` nulo, ou nada depois de `ultimoDia`, = lista vazia. `ultimoDia` é o último
  dia já avaliado por uma rodada (ver Configuração): **cada dia é avaliado uma vez só**, mesmo sem novidade.
- `periodoDoResumo(dias)`: `"18/11/2026"` para um dia, `"15/11/2026 a 18/11/2026"` para vários.
- `listaEmMarkdown(porDia)`: uma linha por item, `- **Estrutural** · 8 pranchas compartilhadas com você`; com mais de
  um dia, um subtítulo por dia (`**18/11/2026**`) antes das linhas dele, do mais antigo para o mais novo. O texto da
  lista (disciplina) é escapado para Markdown. `projeto` e `nome` vão como estão (revisão final): o assunto é texto
  puro — escapar mostraria as barras — e os dois são cadastrados pelo escritório.
- `assuntoDoResumo(projeto, dia)` e o corpo vêm do template (abaixo); a regra só monta as variáveis.

### Quem recebe

Toda conta `User` com `tipo = externo`, `ativo = true`, `clienteId` = cliente do projeto, cliente `ativo = true` —
a mesma regra que abre o portal. Conta criada depois do dia não recebe aquele dia (`createdAt` ≤ fim do dia).
Conta com troca de senha ou termo pendente **recebe** (chamada minha: o link leva à troca/termo e depois ao projeto —
o e-mail também serve de convite para quem ainda não entrou).

- **E-mail:** só se a conta tem e-mail, o SMTP está configurado (`smtpConfigurado()`) e a pessoa não desligou (abaixo).
- **Sino:** sempre (é dentro do portal, não incomoda), título "Novidades em <projeto>", corpo = primeira linha do
  resumo (+ "e mais N" se houver), `href` `/portal/<projetoId>`. Sem push (`push: false`): o push é o e-mail.

### Uma vez só (`AvisoPortalEnviado`, migração nova)

`AvisoPortalEnviado(id, userId, projetoId, dia @db.Date, canal, enviadoEm)` com `@@unique([userId, projetoId, dia,
canal])`, `canal` = `email` | `sino`, FKs com `onDelete: Cascade` (User e Projeto). Mesmo padrão do
`AvisoFinanceiroEnviado`: **reserva → envia → se falhar, libera** a reserva (`deleteMany`). P2002 na reserva = outra
rodada já tem, não é erro. Canais separados para que a falha do e-mail não repita o sino. Um e-mail que cobre vários
dias reserva uma linha por dia; dia já reservado fica fora sem segurar os outros (revisão final: rodada que caiu no
meio não pode perder o dia novo). Chamada minha: e-mail que falhou NÃO é reenviado em outro dia (o
dia já foi avaliado); fica no log e o sino daquele dia já foi entregue.

### O job

- Fila `portal-resumo-diario`, cron `0 7 * * *` em `America/Sao_Paulo`, na lista `automacoes` de `lib/jobs.ts`.
- Lê a configuração; desligada → não faz nada.
- Calcula `diasParaAvaliar`. Vazio → termina.
- Para cada projeto de cliente ativo que tem ao menos uma conta do portal destinatária: roda `andamentoDoPortal`
  (mesma leitura da página, Entregas de hoje) **uma vez**, pega os itens dos dias avaliados e, se houver algum, para
  cada destinatário: **um** sino e **um** e-mail com todos esses dias (servidor fora 5 dias = 1 e-mail por projeto,
  não 5 — chamada minha, contra a rajada).
- No fim da rodada grava `ultimoDia = hoje − 1`. Rodada que cai no meio não grava: a próxima reavalia e as reservas
  impedem o duplicado.
- Consequência aceita: item que aparece depois com data de um dia já avaliado (ex.: fase reaprovada com data antiga,
  prancha marcada fora do ciclo com evento antigo) não gera e-mail — aparece na linha do tempo do portal.
- Dependências injetáveis (`enviar`, `notificar`, `hoje`) como em `financeiro/avisos/service.ts`, para o smoke rodar o
  mesmo código sem SMTP.
- Log: projetos avaliados, e-mails enviados, sinos, duplicados, sem e-mail, falhas.
- Consequência aceita (D5 do item 2/3): prancha retirada das Entregas antes das 7h não entra; item cuja data é de um
  dia já resumido não gera segundo e-mail daquele dia.

### Configuração (`ConfigSistema` `portal.resumoDiario`)

`{ ativo: boolean, desde: "YYYY-MM-DD" | null, ultimoDia: "YYYY-MM-DD" | null }`. Sem linha = `{ ativo: true, desde: null }` (ligado no deploy, D1).
O **primeiro** job que encontrar `ativo: true, desde: null` grava `desde = ontem` e segue: manda só o resumo de ontem —
o deploy nunca despeja o histórico. Ligar pela tela grava
`desde = hoje` quando estava desligado (o primeiro resumo é o de hoje, amanhã às 7h); desligar mantém `desde` e para.

Tela: card "Resumo diário por e-mail" numa página nova `/configuracoes/portal` ("Portal do cliente", grupo Projetos &
Operação de Configurações), com o interruptor e a frase "Ligado desde dd/mm/aaaa". Gate `configuracoes:gerir`
(a mesma da tela Empresa). Ação por `defineAction` com `capturarAntes`.

### O cliente desliga

Preferência `notif_portal_resumo` (valor `false` = não quer), lida por `filtrarPorCategoria(ids, "portal_resumo")`
— só para o E-MAIL. Onde ele desliga: uma linha no rodapé de **Meus projetos** (`/portal`) — interruptor "Receber por
e-mail o resumo dos dias em que um projeto andar" — gravando a preferência do próprio usuário pela ação que já existe,
`salvarPreferencia` (`modules/usuarios/preferencias/actions.ts`: sessão, grava só para o próprio usuário). O e-mail termina com "Para não receber
mais, desligue em Meus projetos no portal."

### Template de e-mail (editável em Configurações → E-mails)

Slug `resumo-andamento-portal`, grupo "Projetos", variáveis `nome` (primeiro nome da conta), `projeto`, `periodo`
(`periodoDoResumo`), `lista` (Markdown, montada pelo sistema), `url` (link absoluto do projeto no portal, `APP_URL`).
Assunto padrão `Novidades em {{projeto}} — {{periodo}}`. Corpo padrão:

```
Olá, {{nome}}.

Em {{periodo}}, o projeto **{{projeto}}** andou:

{{lista}}

[Abrir no portal]({{url}})

Para não receber mais este resumo, desligue em Meus projetos, no portal.

Sena Projetos
```

### Documentação

- Manual: `docs/manual/inicio/portal-cliente.md` (seção "Resumo por e-mail") e o manual de Configurações (página
  Portal do cliente); `search-index.json`.
- CLAUDE.md: linha do smoke novo e a categoria `portal_resumo` na lista de categorias de notificação.

## Fora do escopo

Um e-mail único por cliente juntando projetos; resumo semanal; aviso de outros fatos (financeiro, documentos pedidos);
push; link de descadastro sem login; mudar o e-mail manual de "Acompanhamento do projeto" (continua existindo, é
outra coisa: a equipe escolhe o que mandar e para quem).

## O que fica para o construtor

Nomes internos, a forma de iterar projetos (consulta única de clientes ativos com contas externas), o texto do log, o
layout exato do interruptor do cliente e da página de configuração (seguindo `CabecalhoPagina` e os componentes de
`components/ui`).

## Verificação

- Testes da regra pura: `itensDoDia`, `diasParaAvaliar` (desde nulo, desde hoje, desde há 3 dias, `ultimoDia` ontem =
  vazio, `ultimoDia` há 5 dias, limite de 7), `periodoDoResumo`, `listaEmMarkdown` (um dia, vários dias, escape).
- `npm run smoke:portal-resumo` (banco de dev, sem SMTP real): projeto throwaway com prancha marcada ontem → 1 e-mail e
  1 sino por conta; segunda rodada no mesmo dia → 0 (dia já avaliado); reservas impedem o duplicado se `ultimoDia` não foi gravado;
  dois dias perdidos → 1 e-mail com os dois; dia sem andamento → nada; conta que desligou → sino sim, e-mail
  não; envio que falha → reserva liberada e a rodada seguinte manda; outro cliente não recebe; configuração desligada
  → nada; primeira rodada com `desde` nulo grava `desde = ontem` e manda só o de ontem (anteontem
  com andamento fica fora).
- Auditoria em tela: `/configuracoes/portal` e o interruptor em `/portal` (1366 e 390, claro e escuro); o e-mail
  renderizado (HTML do template com dados de exemplo) num print.
