# Portal do cliente — assinatura de contrato no portal

Pedido do dono em 2026-11-21. Item seguinte da série do portal (spec `2026-11-18-portal-cliente-entregas-design.md`:
"Briefing no portal, documentos do contrato e contato da equipe ficam para depois"). O briefing já foi entregue; o
dono escolheu "documentos do contrato" antes de "contato da equipe".

## Por quê

O que incomoda hoje, nas palavras do dono: **a assinatura depender do link**. Para o cliente assinar um contrato, a
equipe gera um link público de assinatura no Jurídico (`criarLinkAssinatura`, um por signatário), copia e manda por
fora (o sistema não envia o link). Quem já tem conta no portal recebe mais um endereço avulso.

O sistema já aceita a assinatura LOGADA do cliente: `registrarAceite` (`modules/juridico/actions.ts`) autoriza o
usuário do portal cujo `User.clienteId` é o do contrato ("Fase I" do gerenciador de contratos,
`docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`). Falta o portal mostrar o contrato e o botão de assinar.

Sucesso = a equipe pede a assinatura pelo portal, o cliente recebe e-mail e sino, entra, lê o PDF e assina ali; a
equipe é avisada; o PDF assinado fica no portal para o cliente baixar. O link público continua, para quem não tem
conta no portal.

## Decisões do dono (2026-11-21)

1. **A equipe pede** (não é automático por status). Um botão na versão do contrato no Jurídico.
2. **Basta uma conta do cliente assinar.** Qualquer conta ativa do cliente pode; a primeira que assinar fecha o pedido.
3. **O portal mostra só o que foi pedido pelo portal.** Contratos antigos ficam de fora (em produção não há contrato
   assinado por link ainda).
4. Construção: **tabela própria para o pedido** + **o miolo da assinatura extraído de `registrarAceite`**, usado pelo
   Jurídico e pelo portal (abordagem 1 de 3, ver "Abordagens").

## Objetivos

- No Jurídico, na versão VIGENTE (a de maior número) de um contrato ou aditivo de CLIENTE, botão **"Pedir assinatura no
  portal"**. Ao pedir:
  - grava um `PedidoAssinaturaPortal` (aguardando);
  - cada conta ATIVA do cliente (`User.tipo = externo`, `clienteId` = o do contrato, conta ativa) recebe um aviso no sino
    e um e-mail (template novo, sem opção de desligar, como o pedido do briefing);
  - a **alçada** (contrato acima do limite exige sócio, `exigirSocioSeAcimaDaAlcada`) é conferida em QUEM PEDE, só
    quando a assinatura vai mudar o status (`devePassarParaAssinado`), como hoje no `registrarAceite`.
- No portal, um card **"Contratos"**:
  - na página do projeto (`/portal/[projetoId]`), para pedidos de contrato com `projetoId` desse projeto;
  - em "Meus projetos" (`/portal`), para pedidos de contrato do cliente SEM projeto.
  - Cada item: título, tipo (Contrato / Aditivo), versão, quem pediu e quando, situação ("Aguardando sua assinatura" /
    "Assinado por Fulano em …"), **Ver PDF** (abre `inline`) e **Baixar**.
- **Assinar** no portal: o cliente abre o PDF, marca "Li o documento e concordo com os termos" e clica Assinar
  (confirmação antes). A assinatura grava `AceiteDocumento` com a conta logada (nome, IP, user agent, hash SHA-256 do
  arquivo), o evento `assinado` na trilha (`registrarEventoAssinatura`) e os mesmos efeitos de hoje na transição para
  "assinado" (status, prazo do projeto — Fase H3 —, recebíveis do contrato por data — Fase G). Ver PDF registra o evento
  `visualizado` (uma vez por conta e versão, como a rota de download do Jurídico).
- Assinado: o pedido fecha para TODAS as contas do cliente; o PDF segue disponível. **Quem pediu** recebe um aviso no
  sino ("Fulano assinou o contrato X pelo portal").
- A equipe pode **cancelar** um pedido aguardando. Cancelado some do portal.
- **Versão nova** (upload ou geração pelo Estúdio) enquanto há pedido aguardando: o pedido da versão antiga deixa de
  valer — assinar recusa, o portal não o mostra, o Jurídico mostra "versão substituída". A equipe pede de novo na
  versão nova.
- A tela do Jurídico mostra, na versão, a situação do pedido do portal (aguardando desde …, assinado por … em …,
  cancelado, versão substituída) e os botões Pedir / Cancelar com o motivo quando desabilitados.

## Não objetivos

- Mostrar no portal contratos não pedidos (antigos, assinados por link, no papel). Possível depois com um
  "Disponibilizar no portal".
- Certificado de conclusão (`/api/juridico/versoes/[id]/certificado`) no portal. Fica no Jurídico.
- Exigir duas assinaturas do cliente, ordem de signatários, ou signatário nomeado.
- Mudar a regra do Jurídico "a primeira assinatura de qualquer pessoa marca o contrato como assinado". Se a empresa
  assinou antes, o pedido ao cliente continua aguardando e a assinatura do cliente só grava o aceite (não há
  transição). O pedido é a fonte de "falta o cliente assinar", não o `statusContrato`.
- Alinhar a assinatura por LINK com a logada (o link não gera recebíveis nem prazo). Registrado como diferença; o portal
  segue a logada.
- Igualar os dois caminhos de versão nova: a geração pelo Estúdio (`gerar.ts`) volta um contrato "assinado" para
  "aguardando assinatura", o upload manual não. Fica como está; o pedido não depende disso.
- Contrato de equipe (`vinculoId`) e documentos que não são contrato/aditivo (procuração, proposta, outro).
- Assinatura de versão que não é PDF (o cliente precisa ler no navegador): pedir é recusado para arquivo não-PDF.

## Anti-objetivos (falha mesmo que funcione)

- Um cliente ver ou assinar contrato de OUTRO cliente trocando o id na URL ou na action.
- Cliente inativo (`Cliente.ativo = false`) ou conta inativa vendo ou assinando (decisão anterior do dono: cliente
  inativo fica fora do portal).
- Duas assinaturas do mesmo pedido por dois cliques simultâneos (duas contas ou a mesma), ou recebíveis gerados duas
  vezes.
- O cliente assinar uma versão que não é a vigente.
- Um rascunho ou versão não pedida aparecer no portal.
- Duas regras de assinatura (uma no Jurídico, outra no portal) que um dia divergem nos efeitos.
- A alçada ser contornada: o cliente assinar pelo portal um contrato acima do limite que ninguém com alçada pediu.

## Restrições do projeto

- Server Actions por `defineAction`, auditoria automática. As ações do cliente não têm permissão de catálogo: conferem
  `user.tipo === "externo"`, cliente ativo e conta ativa no SERVIÇO (mesmo padrão do pedido de revisão e do briefing).
  As da equipe: `juridico:gerir` (+ RH para contrato de equipe, que aqui é recusado de qualquer forma).
- REST só para o arquivo: rota nova `/api/portal/contratos/[pedidoId]/arquivo` (GET, `?disposition=inline`), que
  confere conta externa + cliente ativo + pedido do cliente da conta + pedido não cancelado + versão do pedido; lê com
  `lerArquivo`. `logAudit` com o usuário.
- Mudança de situação do pedido só por `updateMany` condicionado a `status = aguardando` (count ≠ 1 = outro chegou
  antes). Um pedido aguardando por documento: índice parcial único
  `pedido_assinatura_portal_um_aguardando (documentoId) WHERE status = 'aguardando'`, fora do `schema.prisma` (como os
  outros índices parciais).
- Assinar = UMA transação: trava o pedido (`FOR UPDATE`), confere aguardando + versão vigente + status do contrato que
  aceita assinatura (não `rescindido`/`vencido`), chama o miolo da assinatura NO MESMO `tx`, e marca o pedido
  `assinado` com o `aceiteId`. Avisos depois do commit; falha de aviso não desfaz nada.
- **O miolo** (`assinarVersaoNoTx(tx, { versaoId, ator, autorFinanceiroId, hashArquivo, ip, userAgent })` em
  `modules/juridico/assinatura/assinar-service.ts` ou equivalente): cria `AceiteDocumento`, evento `assinado`, e na
  transição aplica status/`assinadoEm`, aditivo de equipe, prazo do projeto e recebíveis — o que `registrarAceite` faz
  hoje. `registrarAceite` passa a chamá-lo (sua autorização e a alçada continuam nele). Depois do commit, quem chama o
  miolo roda `sincronizarPrevisoesDepois` (contrato por entrega), como `registrarAceite` já faz. Sem `Promise.all` no
  `tx`.
  - **Trava do documento** (minha decisão, revisão do construtor): o miolo trava a linha do `DocumentoJuridico`
    (`SELECT … FOR UPDATE`) e RELÊ `tipo`/`statusContrato` dentro do `tx` antes de decidir a transição. Hoje
    `registrarAceite` decide pela leitura feita fora da transação: uma assinatura no Jurídico e outra no portal ao mesmo
    tempo fariam as duas a transição e gerariam os recebíveis duas vezes. É uma mudança de comportamento só sob
    concorrência; os resultados dos testes existentes de `registrarAceite` não mudam.
  - **Autor do Financeiro** (minha decisão): os lançamentos gerados pela assinatura do portal têm como autor
    `pedidoPorId` (interno), nunca a conta externa — o Financeiro é só interno (`so-interno.ts`). No Jurídico, o autor
    segue sendo quem assina.
- **Assinatura do cliente fora do pedido fecha** (minha decisão, revisão do construtor): hoje uma conta externa pode
  chamar `registrarAceite` direto e assinar qualquer versão de contrato do seu cliente — não pedida, não vigente, até
  com o cliente inativo. Isso contradiz a decisão 3 e os anti-objetivos. `registrarAceite` passa a RECUSAR conta
  externa ("Assine pelo portal, no pedido de assinatura."); o cliente só assina pelo pedido. Hoje nenhuma tela chama
  esse caminho para o cliente.
- Idempotência por conta: se a mesma conta já tem aceite nesta versão (assinou pelo Jurídico antes), o portal não cria
  outro aceite; fecha o pedido com o existente.
- Notificação SEM categoria (como o pedido do briefing: o cliente não pode desligar um pedido direto da equipe; o aviso
  "assinado" vai só para quem pediu). E-mail: template novo
  `portal-contrato-assinatura` em `lib/email-templates-meta.ts` (variáveis `nome`, `documento`, `projeto` — vazio sem
  projeto —, `url`). Sem SMTP, só o sino.
- UI pt-BR, `CabecalhoPagina` intacto, card com estados vazio/erro/carregando como os outros cards do portal; a 390×844
  `scrollWidth` = 390. Confirmação antes de Pedir, Cancelar e Assinar.
- Manual: `docs/manual/inicio/portal-cliente.md` (o dono tem alterações não commitadas nele — editar sem perder as
  dele) e a página do Jurídico no manual; `docs/manual/novidades.md`.
- Smoke novo `npm run smoke:portal-assinatura`.

## Abordagens

1. **Tabela `PedidoAssinaturaPortal` + miolo extraído (escolhida).** Histórico de pedidos por versão, trava de
   concorrência por linha, um aguardando por documento no banco; Jurídico e portal com os mesmos efeitos. Custo: uma
   tabela, uma migração e a extração do miolo, que mexe em assinatura e Financeiro.
2. Colunas na `DocJuridicoVersao`, como o briefing. Menos código, mas perde o histórico de pedido cancelado/refeito e
   não modela "um aguardando por documento".
3. Link público por baixo (um link por conta). Descartada: a assinatura viraria externa (prova mais fraca, sem
   recebíveis), e ficariam links órfãos.

## Modelo de dados (proposta)

```
PedidoAssinaturaPortal
  id, documentoId (FK DocumentoJuridico, cascade), versaoId (FK DocJuridicoVersao, cascade),
  status  aguardando | assinado | cancelado
  pedidoPorId, pedidoEm
  canceladoPorId?, canceladoEm?
  assinadoPorId?, assinadoEm?, aceiteId? (AceiteDocumento)
  @@index([documentoId]), @@index([versaoId])
```

Cliente e projeto NÃO são copiados para o pedido (minha decisão, revisão do construtor): são lidos do
`DocumentoJuridico` em toda leitura e autorização. A fusão de clientes (`clientes/fusao.ts`) já move
`DocumentoJuridico.clienteId`; uma cópia no pedido ficaria no cliente absorvido.

"Versão substituída" é DERIVADA (a versão do pedido não é a de maior número do documento), não um status gravado:
nenhum dos dois caminhos de versão nova (rota de upload e `gerar.ts`) precisa de gancho, e o portal e o Jurídico leem a
mesma função pura.

**O que o portal mostra por situação** (minha decisão, revisão do construtor):

| Pedido | Versão do pedido ainda vigente? | Contrato | Portal | Assinar |
|---|---|---|---|---|
| aguardando | sim | rascunho / aguardando / assinado (pela empresa) | "Aguardando sua assinatura" | sim |
| aguardando | não | qualquer | não aparece | recusa |
| aguardando | sim | vencido / rescindido | não aparece | recusa |
| assinado | qualquer | qualquer | "Assinado por … em … (versão N)", PDF da versão assinada | — |
| cancelado | — | — | não aparece | recusa |

Um pedido ASSINADO continua no portal para sempre (é o documento que o cliente assinou), mesmo com versão nova ou
contrato vencido. A rota do arquivo serve: pedido aguardando com versão vigente e contrato não encerrado, ou pedido
assinado.

## Regras puras (proposta)

`modules/portal/contratos/regras.ts` (ou `juridico/portal/`): `situacaoDoPedido(pedido, versaoVigenteNumero,
statusContrato)` → `aguardando | assinado | cancelado | versao_substituida | encerrado`; `motivoParaNaoPedir(...)`
(não é contrato/aditivo, contrato de equipe, sem cliente, cliente inativo, sem conta ativa, projeto de outro cliente,
versão não vigente, não-PDF, já há pedido aguardando, contrato rescindido/vencido); `motivoParaNaoAssinar(...)`;
`motivoParaNaoCancelar(...)`. Frases iguais na tela (motivo do botão desabilitado) e no `ActionError`.

## O que fica para o construtor

- Nome exato dos arquivos e onde o miolo mora (desde que `registrarAceite` e o portal usem a mesma função).
- O desenho do card (seguir os cards do portal: briefing, pedidos de revisão).
- Texto exato dos avisos e do e-mail, no tom dos do briefing.
