# Pendências documentais — tela do administrador

Data: 2026-10-15 · Branch: `dev-vscode` · Mockup aprovado: https://claude.ai/artifact/BvaZxC8DL8qckLhtDAuKwk (versão 2)

## 1. Contexto e objetivo

O job diário `ciclo-documental-integridade` (A7, 06:20) varre as revisões do ciclo documental ISO 19650 e
manda **uma notificação de texto** aos administradores. O texto é cortado em 10 itens ("… e mais 61") e se
repete todo dia enquanto a causa existir. Em 2026-10-15 o aviso trouxe 71 revisões com arquivo na lixeira e
não havia onde ver a lista completa, nem como marcar "isto foi intencional".

Objetivo: uma tela para administradores com **todas** as pendências documentais, com orientação do que fazer
em cada tipo e com **dispensa** (com motivo) para o que foi intencional. O aviso diário passa a ser um resumo
que leva à tela.

Fora de escopo: restaurar arquivo direto na tela (continua na lixeira do projeto), contador no menu,
deduplicação do aviso por mudança.

## 2. O que o job verifica hoje (`modules/uploads/ciclo/integridade.ts`)

| Tipo | Regra | Tratamento hoje |
|---|---|---|
| `publicada_com_lixeira` | I6: revisão publicada ou arquivada com arquivo na lixeira | só relata |
| `duas_publicadas` | I4: mais de uma revisão publicada no mesmo documento | só relata |
| `controle_fora_de_publicada` | I5: liberada para obra / enviada ao cliente sem estar publicada | **corrige sozinho** (revoga o controle) |
| `analise_parada` | revisão em análise além de `ConfigDocumentosProjeto.diasAlertaCompartilhado` (padrão 7) | só relata |

Esta tela mostra os quatro. Dispensa vale para os três que só relatam. O I5 aparece apenas como histórico
("corrigida automaticamente"), sem dispensa.

## 3. Decisões

1. Escopo da tela: ver + link para o documento/lixeira + **dispensar** (decidido com o dono).
2. Dispensa vale **até o estado mudar**: se a assinatura da pendência mudar, ela reaparece.
3. Motivo obrigatório; dispensa pode ser desfeita; histórico preservado.
4. Cálculo **ao vivo** (a tela roda a mesma varredura do job, sem gravar). Alternativa descartada: o job
   gravar as pendências numa tabela (dado defasado até 24 h, mais estado a sincronizar).
5. Acesso: `notificacoes:gestao` (mesma audiência `global` que recebe o aviso). **Não cria permissão nova**, então
   não há migration por perfil nem `db:seed`.
6. Orientação "o que fazer" em dois lugares: painel recolhido no topo e botão por linha, com texto que depende
   da situação (publicada × arquivada na lixeira).

## 4. Dados

Uma tabela nova, `DispensaPendenciaCiclo` (`@@map("dispensa_pendencia_ciclo")`):

| Campo | Tipo | Observação |
|---|---|---|
| `id` | cuid | |
| `alvoId` | string | revisão (lixeira, análise parada) ou documento (duas publicadas). Escalar, sem FK |
| `tipo` | string | `publicada_com_lixeira` \| `analise_parada` \| `duas_publicadas` |
| `chave` | string | assinatura da pendência no momento da dispensa |
| `motivo` | string | obrigatório |
| `criadaPorId`, `criadaEm` | | quem dispensou |
| `desfeitaEm`, `desfeitaPorId` | | nulos enquanto ativa |

Índice parcial único `(alvoId, tipo) WHERE "desfeitaEm" IS NULL` na migration (SQL à mão, como os demais
índices parciais do ciclo): uma dispensa ativa por alvo. Dispensar de novo um alvo cuja assinatura mudou
encerra a linha antiga (`desfeitaEm`) e cria outra.

## 5. Assinatura (pura, `ciclo/pendencias.ts`)

- Lixeira: `lix:<estado>:<ids dos arquivos na lixeira, ordenados>` (revisão final, 2026-10-16: pela contagem, trocar o
  arquivo dispensado por outro mantinha a assinatura e escondia o problema novo para sempre)
- Análise parada: `par:<estadoEm ISO>`
- Duas publicadas: `dup:<ids das revisões, ordenados>`

Uma dispensa vale se existir linha ativa com o mesmo `alvoId`, `tipo` e `chave`. `RevisaoVarrida` ganha
`idsNaLixeira` (hoje só há o booleano `arquivoNaLixeira`, e a consulta usa `take: 1`).

Dispensa ativa que não casa com nenhuma violação atual (a pendência sumiu ou a assinatura mudou) é **encerrada pelo
job diário** (`desfeitaPorId` nulo = sistema). Sem isso, uma ocorrência nova com a mesma assinatura de antes (1 arquivo
na lixeira → 2 → volta a 1) herdaria a dispensa velha calada. Função pura `dispensasObsoletas`. (Acrescentado ao
escrever o plano, 2026-10-15.)

## 6. Leitura

- Extrair de `verificarIntegridadeCiclo` uma função que carrega as revisões varridas, usada pelo job e pela
  tela. Refatoração que preserva o comportamento do job.
- `pendencias-queries.ts` (server-only): roda `encontrarViolacoes`, aplica as dispensas ativas e junta nome do
  projeto e quem excluiu (`Upload.excluidoPorId` / `excluidoEm`).
- "Corrigidas automaticamente": `ControleRevisao` removidos pelo sistema (`MOTIVO_CORRECAO_INTEGRIDADE`), janela
  de 30 dias.
- Escopo: `acessoGlobal`, todos os projetos.

## 7. Escrita

- `dispensarPendencia` e `desfazerDispensaPendencia` em `pendencias-actions.ts`, via `defineAction`
  (`recurso: "notificacoes"`, `permissao: "gestao"`). Auditoria automática.
- Serviço revalida **dentro da transação**: a pendência ainda existe e a assinatura atual é a enviada pela tela.
  Se mudou, recusa com a mesma frase que a tela mostra desabilitada (`ActionError`).
- Grava `DocumentoEvento` com `revisaoId` (quando houver): `pendencia_dispensada` e
  `pendencia_dispensa_desfeita`, com o motivo. Registrar os dois tipos em `TIPOS_EVENTO` e no formatador de
  detalhe de `modules/uploads/historico/eventos.ts`.
- Lote no cliente: `useSelecao` + `useLote` (limite de 100, relatório de falha parcial) repetindo a ação de um
  item. Não há ação em lote no servidor.
- **Não altera `ciclo/service.ts`.** Usa só `gravarEventoNoTx`; a máquina de estados fica intacta.

## 8. Tela

Rota `/arquivos/pendencias`, item "Pendências" em `nav-config` (`permissao: "notificacoes:gestao"`) ao lado de
Aprovações. Gate com `can()` puro (como `/aprovacoes`), sem o piso de sócio.

- `CabecalhoPagina` como primeiro elemento: título, uma frase, ação Atualizar.
- Chips por tipo com contagem (filtram), filtros de projeto e busca (`useSetParams`, na URL), "Mostrar dispensadas".
- Lista que ocupa a altura e rola por dentro; em 390 px cada pendência vira cartão.
- Menu (ADR-0002): descritor puro `itensDePendenciaCiclo()` em `ciclo/acoes-pendencia.ts`, alimentando
  `LinhaComMenu`, `BotaoAcoes` e `BarraSelecao`. Itens: Abrir documento, Abrir lixeira do projeto (só lixeira),
  Dispensar…, Desfazer dispensa. Item proibido por estado fica desabilitado com o motivo
  ("Já foi revogada automaticamente.").
- Diálogo de dispensa com motivo obrigatório; `await confirm()` antes do `startTransition`.
- Skeleton, `EmptyState` ("Nenhuma pendência. Tudo em dia com o ciclo dos documentos.") e erro claro.

## 9. Job e aviso

`verificarIntegridadeCiclo` ignora as dispensadas. A notificação vira resumo: "N pendências abertas (X na
lixeira, Y paradas, Z duplicadas)", com abertura "N liberações indevidas revogadas" quando houver correção
automática, e `href: "/arquivos/pendencias"`. Sem aberta e sem correção, não notifica (como hoje). Continua
diário enquanto houver pendência aberta. O job também encerra as dispensas obsoletas (§5) antes de avisar.

## 10. Testes e verificação

- Unitários puros: assinatura estável e que muda; aplicação das dispensas; I5 nunca dispensável;
  `itensDePendenciaCiclo`; `nav` (todo href tem `page.tsx`).
- Smoke `npm run smoke:pendencias-ciclo`: lixeira → dispensar → some da lista e do aviso; novo arquivo na
  lixeira → reaparece; desfazer → volta; análise parada com `estadoEm` novo reaparece; assinatura mudou entre
  ler e dispensar → recusa; dispensar I5 → recusa; job só notifica as abertas.
- Tela: 390×844 com `scrollWidth` 390; 1366×768 com menu aberto sem sobrepor a barra; prints em
  `prints-auditoria/`.
- Documentação: linha em CLAUDE.md (comandos e ciclo documental), script no `package.json`, `docs/manual/`.

## 11. Ordem de construção

1. Migration, assinatura pura e testes.
2. Serviço, ações e smoke.
3. Tela e menu, verificação em tela.
4. Job, manual e auditoria final (`docs/PROTOCOLO_AUDITORIA_FINAL.md`).

## 12. Deploy

Somente `npx prisma migrate deploy`. Sem script de dados, sem `db:seed`.
