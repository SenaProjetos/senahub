# Portal do cliente — pedido de revisão com marcações na prancha (item 5)

Data: 2026-11-19 · Série: reformulação do portal do cliente (spec 2026-11-18). Itens 1–4 já entregues. Emenda a spec
[2026-10-21-ciclo-documental-revisao-cliente-design.md](2026-10-21-ciclo-documental-revisao-cliente-design.md), que
deixou "o cliente marcar Em revisão pelo portal" para depois.

## Por quê

Hoje o cliente pede mudança numa prancha pelo WhatsApp ou e-mail: manda um print riscado, alguém da coordenação
interpreta, marca "Em revisão" e cria os apontamentos à mão. O pedido se perde, o "onde" fica num print solto e o
cliente não sabe se foi aceito.

Sucesso = o cliente abre a prancha no portal, marca os pontos (com as mesmas ferramentas da equipe) e escreve o que
quer; a coordenação recebe, aceita ou recusa com resposta; ao aceitar, a prancha ganha "Em revisão" e as marcações
viram rascunhos de apontamento no mesmo lugar; o cliente acompanha a situação no portal e recebe a resposta.

Anti-objetivos: o pedido do cliente nunca muda nada para a obra nem para o projetista sem alguém da equipe aceitar;
nenhum dado interno (apontamentos da equipe, tarefas, validação, quem está vendo) aparece para o cliente; o pedido
ainda não aceito não entra em contagem, tela ou regra interna de apontamentos.

## Decisões do dono (2026-11-19)

- **D1 — Vai para a coordenação aprovar.** Aceitar marca "Em revisão"; recusar exige resposta.
- **D2 — Comentário com marcações na prancha**, com TODOS os tipos que a equipe usa: alfinete, retângulo, seta,
  nuvem, cota e traço livre (`TIPOS_MARCACAO` em `modules/projetos/pendencias/marcacao.ts`).
- **D3 — Modelo próprio de pedido + visualizador enxuto no portal** (abordagem 1).
- **D4 — Em etapas** (abaixo), cada uma testável.
- **D5 — Aceitar gera RASCUNHOS de apontamento**; a coordenação revisa e manda pela rodada de sempre.
- Aceitos como propostos: onde o cliente pede, onde a coordenação decide, avisos (sino à coordenação; sino + e-mail
  ao cliente na resposta), card e selos no portal.

## Abordagens consideradas

1. **Escolhida.** Tabelas próprias (`PedidoRevisaoCliente` + `MarcacaoPedidoCliente`), visualizador do portal feito com
   as peças puras/de desenho que já existem, conversão em apontamentos só no aceite, pelo mesmo caminho de criação.
2. Rejeitada: `Pendencia` com marca "do cliente" e o visualizador interno em modo cliente. O pedido não aceito entraria
   em numeração, contagens, Problemas, avisos e na regra A10 (rodada devolve a revisão), cada um precisando de exceção;
   e o `pdf-viewer.tsx` (3.600 linhas) carrega tarefas, validação e presença — risco de vazar dado interno.

## Modelo

```
PedidoRevisaoCliente
  id, projetoId (FK Cascade), documentoId (FK DocumentoDisciplina, Cascade), revisaoId (FK DocumentoRevisao, Cascade),
  uploadId (FK Upload, Cascade — o PDF em que o cliente marcou), autorId (FK User, Cascade — conta do portal),
  comentario (texto obrigatório, até 4000), status: aguardando | aceito | recusado | cancelado,
  resposta (texto; obrigatório em recusado, opcional em aceito), respondidoPorId (FK User, SetNull), respondidoEm,
  canceladoEm, createdAt
  índices: (projetoId, status), (status, createdAt), (revisaoId)

MarcacaoPedidoCliente
  id, pedidoId (FK Cascade), ordem, pagina, x, y, texto (obrigatório, até 2000),
  marcacaoTipo, marcacaoGeo, medidaMm, medidaFator, medidaModo   — MESMO formato da Pendencia
  pendenciaId (texto, sem FK) — preenchido no aceite: o rascunho que esta marcação virou

AnexoPedidoCliente
  id, pedidoId (FK Cascade), nome, caminho (storage), tamanho, mime, createdAt
```

A máquina de estados é pura (`pedido-revisao/regras.ts`): `aguardando → aceito | recusado | cancelado`; terminal não
volta. Toda escrita de status é `updateMany` condicionado a `status: "aguardando"` (dois cliques da coordenação, ou
aceite e cancelamento ao mesmo tempo, = um só vence; o outro recebe a frase de "já respondido/cancelado").

## Onde o cliente pede (portal)

- **Elegível:** um upload PDF que está nas Entregas do portal (`uploadLiberadoNoAlcance(alcanceDoPortal(projeto), id)`
  — mesma regra do download) da conta externa com acesso ao projeto (`acessoDoUsuarioAoProjetoDoPortal`). Revisão com
  bloqueio de download não abre o visualizador (como hoje, a rota recusa).
- O olho da PDF nas Entregas passa a abrir **`/portal/[projetoId]/prancha/[uploadId]`** (visualizador do portal). O
  link "baixar" continua igual.
- **Visualizador do portal** (`components/portal/visualizador/`): navegação de páginas, zoom (roda/pinça) e as
  marcações. Reaproveita `PdfPagina`, `MarcacaoSvg`, `usePinchZoom`/`useZoomAncorado`, o desenho/geometria puros de
  `marcacao.ts`, `giro.ts` e a cota de `medicao.ts`. NÃO importa `pdf-viewer.tsx`, nem nada de tarefas, validação,
  presença, apontamentos internos ou busca no PDF.
- Botão **"Pedir revisão"** liga o modo de marcação: barra com as 6 ferramentas; cada marcação pede um texto; lista
  lateral (ou folha no celular) com as marcações, editar texto e excluir antes de enviar; comentário geral obrigatório;
  anexos (até 5 arquivos, 20 MB cada, PDF/imagem/DWG — mesma lista de extensões aceitas do envio de documentos do
  portal); **Enviar pedido**. Ao enviar, o rascunho do navegador é limpo.
- **Rascunho no navegador:** as marcações em edição ficam em `localStorage` por upload (perder a aba não perde o
  trabalho). Nada é gravado no servidor antes de "Enviar".
- **Cota:** usa a `CalibracaoPrancha` da prancha (documento + página) feita pela equipe; sem calibração, a ferramenta
  fica desabilitada com o motivo "A escala desta prancha ainda não foi definida pela equipe." O valor é congelado na
  marcação (mesma regra da Pendencia).
- Página **sem giro** quebrado: posição gravada no mesmo espaço da `Pendencia` (pontos PDF, Y para baixo, com o
  tratamento de `/Rotate` de `giro.ts`), para o rascunho de apontamento cair no mesmo lugar.
- **Cancelar:** quem fez o pedido (ou outra conta do mesmo cliente) cancela enquanto está aguardando. Não há edição.

## Onde a coordenação decide

- Tela **`/arquivos/pedidos-cliente`** ("Pedidos do cliente"), gate `arquivos:alterar_status` (o mesmo de marcar "Em
  revisão"), escopo de projetos por `escopoProjeto` (quem não enxerga o projeto não vê o pedido). Lista os aguardando
  (padrão) e, num filtro, os respondidos; linha com projeto, prancha (nome + R0x), quem pediu, quando, nº de marcações.
  Link na navegação de Arquivos, com contador de aguardando.
- Abrir o pedido (`/arquivos/pedidos-cliente/[id]`) mostra a prancha com as marcações do cliente (o mesmo visualizador
  do portal em modo leitura), o comentário, os textos de cada marcação e os anexos; botões **Aceitar** e **Recusar**.
- **Aceitar** (uma transação para o que é do banco):
  1. `updateMany` aguardando → aceito (+ resposta opcional, respondidoPor/Em);
  2. se a revisão participa do ciclo documental e está publicada, aplica o controle `em_revisao` (motivo = "Pedido do
     cliente: " + comentário, cortado em 500) pelo serviço do ciclo — se já houver um ativo, não aplica outro;
     revisão fora do ciclo ou não publicada: sem marca (o aceite segue);
  3. cada marcação vira um **rascunho** de `Pendencia` (`publicadoEm: null`, autor = quem aceitou) no MESMO upload, com
     posição, geometria, medida e o texto "Cliente (Nome): texto" — pela mesma regra de criação/numeração de
     `criarPendencia` (extrair a escrita para um serviço `criarPendenciaNoTx` usado pelos dois). Se a versão vigente
     do documento mudou desde o pedido, o rascunho vai para o upload vigente com as mesmas coordenadas e a tela avisa
     "a prancha mudou desde o pedido — confira a posição".
  4. grava `pendenciaId` em cada marcação.
  Depois, a coordenação encontra os rascunhos no visualizador interno, como os seus, e envia na rodada.
- **Recusar:** `updateMany` aguardando → recusado com resposta obrigatória.

## Avisos

- **Pedido novo:** sino para a coordenação do projeto (membros com papel de coordenação; sem nenhum, os gestores —
  mesma regra de `destinatariosDaConclusao`), categoria nova `pedido_revisao_cliente`, link para o pedido.
- **Resposta (aceito/recusado):** sino + **e-mail** para quem pediu (template `pedido-revisao-respondido`, editável,
  variáveis `nome`, `projeto`, `prancha`, `situacao`, `resposta`, `url`), sem esperar o resumo diário. Sem SMTP, só o
  sino. Opt-out do e-mail: não (é resposta a uma ação dele).
- **Cancelado pelo cliente:** sem aviso.

## No portal

- Card **"Pedidos de revisão"** no projeto (depois de Entregas): cada pedido com prancha, data, situação (Aguardando a
  equipe / Aceito / Recusado / Cancelado), resposta e botão "Cancelar" nos aguardando; vazio = some.
- Selo **"Pedido aguardando"** na linha da prancha nas Entregas (o selo "Em revisão" que já existe cobre o aceito).
- O visualizador mostra, em modo leitura, as marcações dos pedidos AGUARDANDO daquela revisão (de qualquer conta do
  mesmo cliente), para ninguém pedir duas vezes a mesma coisa.

## Etapas (D4)

1. **Pedido e aprovação (sem marcações):** modelo + migração, regras puras, serviço (criar/cancelar/aceitar/recusar,
   aceite com "Em revisão"), ações, botão "Pedir revisão" nas Entregas abrindo um diálogo com comentário e anexos,
   tela da coordenação (lista + detalhe sem visualizador), smoke. Ponta a ponta testável.
2. **Visualizador e marcações:** rota do visualizador do portal, ferramentas, rascunho local, envio com marcações,
   aceite gerando rascunhos de apontamento (`criarPendenciaNoTx`), detalhe da coordenação com o visualizador em modo
   leitura, testes das regras de conversão e smoke.
3. **Avisos e portal:** avisos (sino/e-mail, categoria, template), card e selo no portal, marcações aguardando no
   visualizador, manuais, CLAUDE.md.

## Fora do escopo

Conversa (ida e volta) dentro do pedido; o cliente responder apontamento da equipe; pedido em DWG/IFC/3D; aprovação
formal de fase pelo cliente; editar pedido enviado; o cliente ver apontamentos internos.

## O que fica para o construtor

Nomes internos, o layout exato do visualizador (seguindo os padrões de tela do CLAUDE.md: altura da janela, rolagem
interna, `pointer-coarse`), a forma da lista lateral no celular, o texto exato dos rótulos não citados aqui.

## Verificação

- Testes puros: máquina de estados, elegibilidade, texto do rascunho, corte do motivo, conversão marcação → dados da
  Pendencia (inclusive medida congelada e `livre`), destinatários.
- Smoke `smoke:pedido-revisao-cliente`: cliente cria (prancha nas Entregas: ok; fora/outro cliente/bloqueada: recusa);
  aceite marca "Em revisão" e cria rascunhos (não publicados, autor = coordenação, numeração seguindo os apontamentos
  do documento); dois aceites simultâneos = um vence; aceitar × cancelar; recusa exige resposta; pedido aguardando não
  aparece em contagem de apontamentos; revisão fora do ciclo aceita sem marca.
- Auditoria em tela de cada etapa (portal 1366/390 claro/escuro; tela da coordenação).

## Decisões do revisor de design (chamadas minhas, 2026-11-19)

1. **Revisão substituída antes da resposta.** Aceitar exige que a revisão do pedido ainda seja a que está nas Entregas
   (publicada, não arquivada, e o `uploadId` do pedido não substituído). Senão o aceite é recusado com "A prancha ganhou
   revisão nova depois deste pedido. Recuse com uma resposta e peça ao cliente que confira a revisão nova." — só Recusar
   fica disponível (item do menu desabilitado com a mesma frase). Na fila e no portal o pedido mostra "revisão
   substituída". Rascunho nunca cai em outra revisão; o caso "versão vigente mudou" da seção de aceite deixa de existir
   (revisão publicada não ganha versão nova).
2. **Quem aceita:** exige `arquivos:alterar_status` **e** `uploads:validar` (os rascunhos são de quem os criou, e só
   quem valida os vê e envia na rodada). A tela lista com `alterar_status`; sem `validar`, "Aceitar" fica desabilitado
   com "Só quem valida arquivos pode aceitar: os apontamentos ficam em rascunho com você."
3. **O cliente escreve sem permissão de catálogo:** as ações do cliente (`criar`, `cancelar`, anexar) usam
   `defineAction` sem `recurso`, com a checagem explícita no handler: conta externa ativa com acesso ao projeto
   (`acessoDoUsuarioAoProjetoDoPortal`) e upload nas Entregas (`uploadLiberadoNoAlcance`). Cancelar: só conta do mesmo
   cliente do projeto.
4. **Aceitar não avisa os projetistas** (D5: nada chega a eles antes da rodada). O controle `em_revisao` é aplicado pelo
   serviço do ciclo sem `notificarControle`.
5. **Anexos:** enviados DEPOIS de criar o pedido, um por requisição, para `/api/portal/pedidos/[id]/anexos` (só o autor,
   só aguardando, até 5 por pedido, cada um até `TAMANHO_MAX` de `uploads/limites`, extensões pdf, png, jpg, jpeg, dwg,
   dxf; mesmo esqueleto da rota `/api/portal/documentos`: `limitarStream`, `salvarStream`, `nomeArquivoLimpo`). Sem
   área temporária, sem arquivo órfão; anexo que falha aparece como erro e o pedido segue. A coordenação baixa os
   anexos por `/api/pedidos-cliente/anexo/[id]` (gate `alterar_status` + escopo do projeto); o cliente, pelo portal
   (mesmo cliente).
6. **Marcações são opcionais:** pedido só com comentário é válido (etapa 1 inteira e etapa 2). Sem marcação, o aceite
   só marca "Em revisão".
7. **Vários pedidos na mesma revisão:** permitidos. O segundo aceite não aplica outra marca (já há uma ativa) e cria os
   seus rascunhos; o detalhe avisa "Já há pedido aceito nesta revisão".
8. **Anexos não viram anexo do rascunho** (ficam no pedido; o texto do rascunho termina com "(ver pedido do cliente)"
   quando há anexos). **Cota** é recalculada no servidor pela `CalibracaoPrancha` vigente ao criar o pedido; o valor do
   navegador é só exibição.
