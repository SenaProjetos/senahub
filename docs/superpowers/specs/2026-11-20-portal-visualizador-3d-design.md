# Portal do cliente — visualizador 3D e pedido de revisão no modelo (item 7)

Data: 2026-11-20 · Série: reformulação do portal do cliente (spec 2026-11-18). Itens 1–5 entregues. Emenda o pedido de
revisão do cliente ([2026-11-19-portal-pedido-revisao-design.md](2026-11-19-portal-pedido-revisao-design.md)), que fica
valendo para as pranchas.

## Por quê

Nem todo cliente conhece ou tem acesso a programas BIM. Hoje os IFCs aparecem nas Entregas do portal só para baixar — e
o cliente que não tem onde abri-los não vê nada. O dono quer o IFC no portal como **gêmeo digital da obra**: ver
pavimento por pavimento, disciplina por disciplina, "andar" pela obra e, **principalmente, criar apontamentos** no
modelo.

Sucesso = o cliente abre o projeto no portal, entra no 3D com todas as disciplinas que estão nas Entregas dele, isola um
pavimento, desliga disciplinas, anda por dentro, clica no que quer mudar, escreve e envia; a coordenação aceita e os
pontos viram apontamentos 3D da equipe, no mesmo lugar e com a mesma vista.

Anti-objetivos (os mesmos do item 5): o pedido do cliente nunca chega ao projetista sem a equipe aceitar; nenhum dado
interno (apontamentos da equipe, conflitos, tarefas, realinhamento, modelos fora da Entrega) aparece ao cliente; o
cliente nunca vê um IFC que não está nas Entregas dele.

## Decisões do dono (2026-11-20)

- **D1 — O pedido 3D segue o fluxo do pedido de revisão** (opção 1): o cliente marca pontos no modelo, escreve e anexa;
  vira um pedido na MESMA fila "Pedidos do cliente"; ao aceitar, cada ponto vira um **apontamento 3D da coordenação**
  (`ApontamentoCoordenacao`) no mesmo lugar e com a mesma vista, **sem tarefa** — a equipe revisa e envia aos projetistas
  como sempre.
- **D2 — Abordagem 1:** visualizador 3D próprio do portal sobre o motor existente (`modules/coordenacao/viewer/engine.ts`),
  sem reaproveitar a tela da Coordenação.
- **D3 — O modo "andar" vale também para o visualizador interno** (Coordenação: projetistas e coordenação), não só para
  o portal.
- **D4 — Modelo realinhado (resposta à revisão do design):** o cliente vê a versão realinhada pela Coordenação do
  arquivo que está nas Entregas dele (opção 2). O realinhamento passa a registrar de qual arquivo saiu; o portal serve
  o derivado mais recente do arquivo das Entregas. Realinhamentos feitos antes disso não têm o registro e aparecem como
  o arquivo das Entregas.
- Aceitas como propostas: o cliente vê só os IFCs que estão nas Entregas dele (revisão vigente), todos juntos; andar em
  primeira pessoa na altura de uma pessoa, no pavimento escolhido, teclado+mouse no computador e controle na tela no
  celular, **sem colisão** nesta versão; aceitar marca "Em revisão" a revisão de cada IFC marcado (como a prancha);
  entrega em etapas (explorar → andar → pedido e aceite).

## Abordagens consideradas

1. **Escolhida.** Tela 3D enxuta do portal em cima do `ViewerEngine` (o adaptador que já isola, corta, seleciona por
   GUID, captura câmera e snapshot e indexa pavimentos). O `.frag` sai por rota do portal com a regra das Entregas. O
   modo andar entra no motor, e por isso serve às duas telas.
2. Rejeitada: a tela da Coordenação (`coordenacao-view.tsx`, ~1.100 linhas) em "modo cliente" — apontamentos internos,
   conflitos, tarefas e realinhamento precisariam cada um de um "esconder"; um esquecimento vaza dado interno.
3. Rejeitada: outro visualizador de mercado só para o portal — segunda base 3D para manter e conversão de coordenadas
   para o apontamento da equipe (que guarda câmera no espaço IFC, Z para cima).

## O que o cliente vê

- **Modelos:** cada IFC que está nas Entregas do portal (`uploadLiberadoNoAlcance(alcanceDoPortal(projeto), uploadId)` —
  a mesma regra do download), sem bloqueio de download, com conversão `.frag` concluída. Todos carregados juntos, na
  mesma posição relativa que a equipe vê (D4, seção "Modelo realinhado" abaixo; o cliente não vê nem mexe no
  realinhamento). Modelo fora da compatibilização (`ModeloCoordenacaoOculto`) entra se estiver nas Entregas:
  a regra do cliente é a Entrega, não a Coordenação.
- IFC nas Entregas ainda sem conversão (fila/erro): o modelo aparece na lista como "em preparação", sem carregar; nenhum
  IFC convertido = tela explica que o modelo 3D ainda não está pronto e mostra o link de download.
- **Onde entra:** página `/portal/[projetoId]/modelo` (link "Ver em 3D" no topo do card Entregas quando há ao menos um
  IFC nas Entregas, e o olho da linha de cada IFC nas Entregas abre a mesma página com aquele modelo em foco).

## Modelo realinhado (D4)

Hoje o realinhamento (`coordenacao/deslocamento.ts` → `realinharUpload`) e o georreferenciamento
(`coordenacao/georreferenciamento.ts`) gravam um **Upload novo** (`origem: "ferramenta"`, mesmo nome, versão + 1, sem
`documentoId`/`revisaoId`) sem ligação com o arquivo de que saíram; a Coordenação mostra o último da série, as Entregas
têm só o original.

- **Ligação nova:** `Upload.realinhadoDeId` (texto, índice, sem relação Prisma — a CLAUDE.md registra o custo de
  heap do `tsc` de autorrelações), gravado pelos dois caminhos que criam upload `ferramenta` a partir de outro upload.
  Realinhar um já realinhado encadeia (o novo aponta para o anterior).
- **O que o portal serve:** para cada IFC das Entregas (U), o descendente mais recente da cadeia de U com conversão
  concluída; sem descendente (ou realinhamento antigo, sem registro), o próprio U. A regra da rota do portal vira "U está
  nas Entregas da conta E o modelo pedido é U ou um descendente de U" — nunca outro upload.
- **Apontamento aceito:** `uploadId` = o modelo que o cliente viu (o descendente, quando houver), que é o que a Coordenação
  mostra — mesma posição. O teste "o modelo saiu das Entregas" no aceite olha a ORIGEM (U).
- **Upload de documento recebido** (`realinharDocumento`, modelo `d:<versaoId>`) não entra: IFC recebido do cliente não
  está nas Entregas.

## Explorar (etapa 1)

- **Disciplinas:** uma linha por modelo (nome da disciplina + revisão), com liga/desliga. Desligar esconde o modelo.
- **Pavimentos:** lista dos pavimentos (nomes e elevações lidos de cada modelo pelo índice do motor, unidos por nome);
  escolher um isola os elementos daquele pavimento em todos os modelos ligados; "Todos" volta.
- **Corte:** um plano de corte horizontal (altura ajustável) — o mesmo `definirCorte` do motor.
- **Propriedades:** clicar num elemento mostra nome, tipo, pavimento e os Psets (o mesmo índice do painel interno, só
  leitura).
- **Vistas:** enquadrar tudo, vistas padrão (topo, frente, lados, isométrica) — o que o motor já tem.
- **Fora desta versão:** medição, conflitos, diferença entre revisões, BCF, realinhamento, georreferência, exportações.

## Andar (etapa 2 — portal e Coordenação)

- **Entrar:** botão "Andar"; escolhe o pavimento (o atual do filtro, ou o primeiro) e coloca a câmera em primeira pessoa
  a **1,60 m** acima da elevação do pavimento, no centro do pavimento, olhando para a horizontal.
- **Computador:** W/A/S/D ou setas andam no plano; Q/E (ou Page Up/Down) sobem e descem; mouse arrastado gira o olhar
  (sem pointer lock obrigatório, para não prender o cursor); Shift corre; Esc sai.
- **Celular:** um controle de direção na tela (canto inferior esquerdo) para andar e arrastar o resto da tela para olhar;
  botão de sair.
- **Sem colisão nem gravidade** nesta versão: atravessa paredes e lajes. Trocar o pavimento enquanto anda leva a câmera
  à altura do novo pavimento.
- **Sair** devolve a câmera à órbita, enquadrando o ponto onde estava.
- No interno (`viewer-toolbar.tsx`), o mesmo botão; o motor é o mesmo (método novo no `ViewerEngine`), então as duas telas
  ganham juntas. Andar não interfere com seleção: clicar seleciona como na órbita (é o que permite pedir revisão andando).

## Pedir revisão no modelo (etapa 3)

- **Modo "Pedir revisão"** no 3D, como na prancha: cada clique num elemento cria uma **marcação**: o elemento clicado
  (GUID + modelo), o ponto 3D do clique e a **vista atual** (câmera, no espaço IFC, como `ApontamentoCoordenacao.camera`),
  com um texto obrigatório. Lista de marcações (editar texto, excluir, "ir para" — restaura a vista), comentário geral
  obrigatório, até 5 anexos (as mesmas regras do item 5: 100 MB, PDF/imagem/DWG/DXF, conteúdo conferido). Rascunho no
  navegador por conta e projeto.
- Marcações são opcionais (pedido só com comentário vale), até 50.
- **Modelo do pedido:** o mesmo `PedidoRevisaoCliente`, que passa a ter um tipo (`prancha` | `modelo`). No tipo `modelo`
  não há upload/revisão/documento únicos: cada marcação 3D aponta o seu modelo (upload IFC). Tabela própria para a
  marcação 3D (modelo, GUIDs, ponto, câmera, texto, ordem, `apontamentoId` preenchido no aceite). A fila, o card do
  portal, os avisos, os anexos, o cancelar, o limite de 20 aguardando e as decisões são os do item 5.
- **Aceitar** (uma transação): `updateMany` aguardando → aceito; para cada marcação, um `ApontamentoCoordenacao`
  (`status: "aberta"`, sem tarefa, autor = quem aceitou, `uploadId` = modelo da marcação, `disciplinaId` = a do upload,
  `guids` e `camera` da marcação, título = começo do texto, texto = "Cliente (Nome): …"), numerado na sequência do
  projeto; cada revisão IFC marcada fica "Em revisão" (motivo "Pedido do cliente: …"), uma vez só por revisão, pelo
  serviço do ciclo, sem avisar projetistas. Gate: `arquivos:alterar_status` + `coordenacao:gerir` (quem cria apontamento
  3D hoje).
- **Imagem da vista:** cada marcação leva uma imagem da vista, capturada sozinha no navegador na hora da marcação
  (`capturarSnapshot` do motor) e enviada depois de criado o pedido, uma por requisição (como os anexos). No aceite, a
  imagem vira o `snapshotPath` do apontamento (copiada para o caminho dos snapshots da coordenação), então a tarefa do
  projetista e o BCF ficam com imagem como os apontamentos da equipe. Marcação sem imagem (falhou o envio) segue valendo.
  (Chamada minha, revisão do design.)
- **Revisão nova da equipe ainda não publicada:** o apontamento fica no modelo que o cliente viu (como na prancha: nunca
  cai em outra revisão); o detalhe do pedido avisa "A equipe já trabalha numa versão mais nova deste modelo." quando a
  série da Coordenação tem upload mais novo. (Chamada minha.)
- **Revisão substituída/retirada:** se o modelo de alguma marcação saiu das Entregas desde o pedido, o aceite é recusado
  com a frase do item 5 (só recusar); o pedido sem marcações nunca bloqueia.
- **Detalhe na coordenação:** o mesmo detalhe do pedido, com o visualizador 3D do portal em leitura (os modelos do
  pedido, as marcações numeradas, "ir para" cada vista).
- **Portal:** o card "Pedidos de revisão" mostra o pedido do modelo ("Modelo 3D · N marcações"); marcações de pedidos
  aguardando aparecem no 3D (esmaecidas) para ninguém pedir duas vezes.

## Etapas (testáveis uma a uma)

1. Ligação do realinhamento (`realinhadoDeId`, migração) + rota do `.frag` do portal + página 3D + disciplinas, pavimentos, corte, propriedades, vistas; link nas Entregas.
2. Modo andar no motor + botão no portal e na Coordenação.
3. Pedido 3D: modelo de dados, serviço (criar, aceitar, recusar, cancelar), modo "Pedir revisão" no 3D, fila/detalhe,
   card, avisos, manuais.

## Restrições

- Mesmas do item 5 e do CLAUDE.md: tudo por `defineAction`; status por `updateMany` condicionado; nada de `Promise.all`
  em transação; three.js e `@thatopen/fragments` só dentro do motor e atrás de `next/dynamic({ ssr: false })`; câmera
  persistida no espaço IFC (Z para cima, `viewer/coords.ts`); 390 px sem rolagem lateral; UI pt-BR.
- A rota do `.frag` do portal nunca serve modelo que não está nas Entregas da conta (mesmo com o id certo).

## O que fica para o construtor

Nomes internos, layout exato do painel (lateral no computador, folha no celular), o desenho do controle de direção, a
velocidade de andar, a forma de unir pavimentos com nomes diferentes entre disciplinas, os rótulos não citados aqui.

## Verificação

- Testes puros: união de pavimentos, posição de entrada no andar (altura, centro), movimento por tecla (vetores),
  conversão marcação 3D → dados do apontamento, regras do pedido de tipo modelo (substituída por marcação).
- Smoke do banco: rota do `.frag` recusa IFC fora das Entregas, de outro cliente, bloqueado, e um upload realinhado que
  não descende do arquivo das Entregas; serve o descendente realinhado mais recente; pedido de modelo cria,
  aceita (apontamentos sem tarefa, numeração do projeto, "Em revisão" uma vez por revisão), recusa, cancela; modelo
  substituído recusa o aceite.
- Tela: portal 1366/390 claro/escuro, explorar, andar (teclado e controle na tela), pedir; coordenação aceita e o
  apontamento abre na mesma vista no visualizador interno; botão Andar no interno.
