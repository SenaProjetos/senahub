# Portal do cliente — entregas (pranchas) no portal

Pedido do dono em 2026-11-18. Primeiro item de uma série para melhorar a experiência do cliente externo.
Ordem combinada: **1. entregas no portal (este documento)** → 2/3. andamento por fase + linha do tempo →
4. aviso de revisão nova / fase concluída → 5. cliente comenta na prancha e pede revisão → 7. visualizador 3D.
Briefing no portal, documentos do contrato e contato da equipe ficam para depois. **Financeiro fora por enquanto**
(decisão do dono). Aprovação formal de fase pelo cliente não entrou na lista.

## Por quê

O que os clientes mais pedem por fora (WhatsApp, e-mail) são **as pranchas** e **em que pé está o projeto**.
Hoje o cliente com login no portal (`/portal`, escopo `User.clienteId`) vê seus projetos, o status das
disciplinas e um bloco "Documentos" onde ele ENVIA arquivos — mas não vê nada do que o escritório entregou.
As entregas só saem por link público avulso (`/p/arquivos/[token]`). Resultado: quem tem conta ainda depende de
alguém mandar um link.

Sucesso = o cliente entra no portal, abre o projeto e encontra sozinho as pranchas que estão com ele
(Compartilhado) e as que estão liberadas para obra, vê a PDF no navegador, baixa uma pasta ou tudo em .zip,
e sabe qual revisão está vendo e o que mudou nela.

## Objetivos

- Na página do projeto no portal, uma seção de **entregas** com as duas pastas do cliente, "Compartilhado" e
  "Liberado para obra", com o mesmo conteúdo, a mesma árvore (disciplina → fase → formato) e o mesmo .zip
  que um link público `porSituacao` de "projeto todo" mostraria.
- As **ARTs** do projeto, como no link público (com o histórico de versões).
- Cada arquivo mostra a **revisão** (R00, R01…), a **descrição da revisão** (`DocumentoRevisao.descricao`) quando
  houver, e a marca **"Em revisão"** com o motivo quando houver (o link já mostra a marca).
- PDF abre no navegador (`disposition=inline`, como o link já faz); qualquer arquivo baixa; pastas e tudo em .zip.
- Todo acesso registrado como no link: `AuditLog` + `registrarAcessoUploads`, com o **usuário** (não o link).

## Não objetivos

- Revisões anteriores para download (só a revisão marcada nas pastas). Fica para a linha do tempo (item 3) se fizer falta.
- Recorte por pessoa (equipe da obra vendo só "Liberado para obra"). Todo usuário do cliente vê as duas pastas.
  Revisitar quando houver usuários de obra no portal.
- Configuração por projeto do que vai ao portal (fases, disciplinas). O portal mostra tudo o que foi posto nas
  pastas do cliente; quem não quer que o cliente veja não marca.
- Visualizador de PDF embutido (o `pdf-viewer` interno). Abrir em nova aba com `inline` basta nesta entrega.
- Avisos, comentários do cliente, 3D, andamento por fase — são os próximos itens.
- Mudar o que o link público libera. Ele ganha só o que a árvore compartilhada traz (descrição da revisão, selo
  "Download bloqueado"); o conteúdo e as regras de acesso dele não mudam.

## Anti-objetivos (falha mesmo que funcione)

- O portal mostrar um arquivo que um link `porSituacao` de projeto todo NÃO mostraria (revisão em andamento,
  em análise, na lixeira, não validada, backup do modelo), ou SERVIR uma revisão com bloqueio de download (I7).
- Duas regras de "o que o cliente vê": uma no link e outra no portal, que um dia divergem.
- Um cliente baixar arquivo de projeto de OUTRO cliente pela URL direta (trocar `projetoId` ou `uploadId`).
- Usuário interno vendo o portal como cliente (as páginas do portal já redirecionam o interno; as rotas novas recusam).
- Material interno do "Geral" (`exibirEmRecebidos`) aparecer para o cliente — continua como hoje: o portal nunca
  passa `incluirCompartilhadosDoGeral`.

## Restrições do projeto

- REST só para download/streaming (é o caso). Leitura da página é RSC, sem action nova.
- Arquivos lidos com `lerArquivo`/`resolverCaminho` (anti-traversal), como as rotas do link.
- Cabeçalho da página do portal migra para `CabecalhoPagina` (a página ainda usa o título antigo e vai ser tocada).
- Tela pronta só quando, a 390×844, `scrollWidth` = 390 (cliente usa muito o celular).
- UI e mensagens em pt-BR; `docs/manual/inicio/portal-cliente.md` atualizado.

## Abordagens consideradas

**A. Portal usa as mesmas regras do link, com login no lugar do token. (Escolhida pelo dono.)**
O núcleo de `modules/projetos/arquivos/link-publico.ts` passa a receber um **alcance** (os campos do link que as
regras leem) em vez de um token. As quatro leituras de hoje (`conteudoPublicoPorToken`, `uploadLiberadoNoLink`,
`artLiberadaNoLink`, `uploadsDoLinkParaZip`) viram "resolver o link pelo token → alcance → núcleo"; o portal monta um
alcance fixo e chama o mesmo núcleo. Uma regra só para os dois canais; ARTs de graça; o 3D (item 7) pluga na mesma
ideia depois. Custo: a coordenação não escolhe fases/disciplinas por cliente no portal.

**B. Link oculto por projeto, que o portal abre.** Mais barato e com o mesmo controle de escopo dos links, mas é um
token sem login escondido atrás do login: vazou, qualquer um sem conta entra. Descartada.

**C. Leitura nova direto do ciclo documental (`ControleRevisao enviado_cliente`).** Os documentos fora do ciclo
(fluxo antigo) sumiriam, e seria uma segunda regra de "o que o cliente vê". Descartada.

## Desenho (decidido)

### Alcance

O alcance do portal é, por projeto do cliente:

```
escopo = projeto_todo, porSituacao = true, faseIds = [] (todas), incluirSemFase = (sem efeito),
agruparPorFase = true, titulo = null
```

Ou seja: exatamente o conteúdo de um link "projeto todo, por situação" daquele projeto. O núcleo não sabe se veio
de token ou de login.

### Quem acessa

Usuário com sessão, `tipo = externo`, com `clienteId`, e o projeto com `Projeto.clienteId` = esse `clienteId`.
Qualquer outra coisa → 404 neutro ("Arquivo indisponível."), sem revelar se o projeto existe. Interno → 403/404
(não é tela dele). Uma função única faz essa checagem para a página e para as três rotas.

As rotas não passam pelo layout do dashboard, então a função única repete as duas travas dele (decisão minha):
termo de uso do cliente vigente aceito (`precisaAceitarTermo` falso) e sem troca de senha pendente
(`mustChangePassword` falso). Sem isso, quem não aceitou a versão nova do termo baixaria pela URL direta. Pendente →
403 "Aceite o termo de uso para continuar." / "Troque a senha para continuar.". Perfil de acesso não entra: a regra
do cliente é `tipo` + `clienteId`, como na rota de envio `/api/portal/documentos` que já existe.

### Rotas (espelham as do link)

- `GET /api/portal/projetos/[projetoId]/arquivos/[uploadId]` (`?disposition=inline` para PDF)
- `GET /api/portal/projetos/[projetoId]/arquivos/zip` (mesmos recortes: `disciplinaId`, `fase`, `ext`, `situacao`)
- `GET /api/portal/projetos/[projetoId]/arquivos/art/[id]`

Mesmas checagens das rotas do link: alcance pelo núcleo, bloqueio de download do ciclo (`motivoBloqueioDosUploads` /
`uploadsComBloqueioDeDownload`), arquivo sumido do disco → 410. Auditoria com `acao` própria
(`download-portal`, `download-portal-zip`) e `registrarAcessoUploads` com `origem: "portal"`, `userId` = o cliente,
`linkId` nulo. `OrigemEvento` ganha `"portal"`, e o histórico por documento mostra "pelo portal do cliente" com o
nome da pessoa.

### Tela

A página `/portal/[projetoId]` ganha a seção de entregas, renderizada pela MESMA árvore do link público
(`ArquivosPublicoView` e subcomponentes), que deixa de montar URLs a partir do `token` e passa a receber a base das
rotas (`/api/p/arquivos/<token>` ou `/api/portal/projetos/<id>/arquivos`). A casca da página pública
(`CabecalhoPublico`, "Acesso somente leitura") continua só no link; no portal a seção entra num `Card` abaixo das
disciplinas, com "Baixar tudo (.zip)" no cabeçalho da seção.

Cada arquivo mostra a revisão e, quando houver, a descrição da revisão. Isso exige o núcleo devolver
`descricaoRevisao` em `ArquivoPublico` — o link público passa a mostrar também (mesma árvore; é informação que o
cliente do link também deve ver).

**Revisão com bloqueio de download (I7)** — hoje o link LISTA o arquivo e só a rota recusa (o clique dá
"Arquivo indisponível."). Decisão minha, valendo para os dois canais (mesma árvore): o núcleo devolve
`bloqueado: boolean` em `ArquivoPublico` (lido com `uploadsComBloqueioDeDownload`), o arquivo continua listado com o
selo "Download bloqueado" e sem os botões de abrir/baixar; as rotas continuam recusando. Listar sem selo repetiria o
clique quebrado; esconder mudaria o que o link mostra e a contagem das pastas.

Seção vazia (nada nas pastas do cliente ainda): `EmptyState` "Nenhuma prancha compartilhada ainda." — nunca erro.

Na lista `/portal`, cada projeto mostra quantos arquivos estão com o cliente? **Não nesta entrega** (custo de N
leituras do núcleo por lista). Fica para o item 2/3.

## Deixado para quem constrói

- Nome e forma exata do tipo "alcance" e de como as funções por token o resolvem (desde que as quatro leituras
  passem pelo mesmo núcleo e os testes de `link-publico-regras.test.ts` continuem passando).
- Como o histórico rotula `origem: "portal"` na tela.
- Teste/smoke: cobrir (a) o portal mostra exatamente o que o link `porSituacao` de projeto todo mostra para o mesmo
  projeto, (b) URL de outro cliente → 404, (c) revisão com bloqueio de download listada com `bloqueado` e recusada nas
  rotas e no .zip, (d) interno recusado, (e) termo pendente recusado nas rotas.
  Smoke novo `smoke:portal-entregas` no padrão dos demais, ou testes do núcleo — escolha de quem constrói.
- Layout fino da seção no celular, dentro da regra dos 390 px.
