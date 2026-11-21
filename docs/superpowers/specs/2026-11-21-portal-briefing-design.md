# Portal do cliente — briefing no portal

Pedido do dono em 2026-11-20/21. Item seguinte da série do portal (spec `2026-11-18-portal-cliente-entregas-design.md`:
"Briefing no portal, documentos do contrato e contato da equipe ficam para depois"). Os itens 1–7 da série estão
entregues; o dono escolheu este como o próximo.

## Por quê

Hoje o cliente responde o briefing de Start e as perguntas extras por disciplina só por um link sem login
(`/p/inputs/[token]`) que a equipe gera em Projetos → Inputs e manda por fora. O cliente que já tem conta no portal
recebe mais um endereço para guardar, e a resposta fica gravada como "Cliente (link público)", sem saber quem foi.

O dono quer que **o portal vire o lugar principal do briefing**, com o link ficando **secundário** — para o cliente
que não tem conta no portal.

## Objetivos

- A equipe **pede** o briefing ao cliente pelo portal (opção B escolhida pelo dono): um botão em Projetos → Inputs.
- Ao pedir, o briefing e as perguntas extras aparecem no projeto do portal, e as contas ativas do cliente recebem
  um e-mail e um aviso no sino.
- O cliente preenche dentro do portal, com o mesmo formulário do link: o modelo do projeto, as seções e campos que a
  equipe ocultou, o salvamento automático por campo e a validação de formato.
- O briefing grava o nome de quem respondeu (a conta do portal) em `preenchidoPor`.
- A equipe encerra o pedido; o briefing fica só para consulta **no portal e no link** (decisão do dono, 2026-11-21).
  A equipe pode reabrir.
- A equipe é avisada quando o cliente preenche, com a mesma regra de hoje (sem aviso por tecla; a passagem para
  "completo" sempre avisa).
- O link público continua funcionando, agora como opção "Para quem não tem conta no portal".

## Não objetivos

- Tirar o link público. Ele fica, com a regra de hoje (ativo + validade) e uma regra a mais: com o pedido do
  portal encerrado, o link também não grava.
- Registrar o autor das respostas das perguntas extras (`InputProjeto` não tem campo de autor; fica como o link
  grava hoje). *Decisão minha.*
- Estender ao link público a regra do cliente inativo (o dono ainda não decidiu; ver memória do portal).
- Lembrete automático ao cliente que não preencheu (o e-mail sai só quando a equipe pede ou reabre).
- Entrar no resumo diário do portal.
- Mudar o editor de modelos de briefing, as perguntas extras por disciplina ou o status do briefing.
- Escolher quais contas do cliente recebem o pedido (vão todas as ativas).

## Anti-objetivos (falha mesmo que funcione)

- Resposta de campo oculto, ou de seção de disciplina que o projeto não tem, sair do servidor para o portal.
- Conta de outro cliente, ou de cliente inativo, ler ou gravar o briefing de um projeto.
- Cliente gravando depois que a equipe encerrou.
- Dois cliques em "Pedir" mandando dois e-mails para cada conta.
- Uma sessão de preenchimento virando dezenas de avisos para a equipe.
- O portal e o link aceitando respostas diferentes para a mesma pergunta (regras divergentes).

## Restrições do projeto

- Toda gravação do briefing passa por `gravarRespostasBriefing` (`modules/inputs/briefing-service.ts`), o caminho
  único da equipe e do link. O portal também passa por ele. Perguntas extras: mesma regra do link
  (`inputProjeto.updateMany` só em pergunta ativa do projeto).
- Leituras do formulário resolvem o modelo (`resolverModeloDoProjeto`) e filtram por `secoesDoProjeto` +
  `respostasVisiveis`, como a página do link. Nunca importar `BRIEFING_SCHEMA` direto.
- Portal grava por **Server Action**, não por rota REST (rotas só para token público, multipart, streaming).
- Ações do cliente seguem o padrão do pedido de revisão: `defineAction` sem permissão de catálogo, e o serviço
  confere conta externa + cliente ativo + projeto do cliente (`acessoDoUsuarioAoProjetoDoPortal`).
- Ações da equipe: `projetos:gerir` + `exigirProjetoVisivel`, como `gerarLinkInput`.
- Mudanças de estado do pedido: `updateMany` condicionado ao estado lido (dois cliques = uma mudança, um e-mail).
- Migração por `prisma migrate diff` + `migrate deploy`; nada de `migrate dev`.
- UI e textos em pt-BR; `CabecalhoPagina` na página nova; 390×844 sem rolagem lateral.
- `docs/manual/inicio/portal-cliente.md` tem mudanças do dono ainda sem commit: o trecho deste item entra por
  staging parcial, nunca o arquivo inteiro.

## Abordagens consideradas

O dono escolheu entre três formas de o briefing aparecer no portal:

- **A. Sempre aparece** em todo projeto com algo a preencher. Barato, mas projetos antigos e em andamento
  apareceriam como "não iniciado", com um pedido que ninguém fez.
- **B. A equipe pede pelo portal** (escolhida). A equipe controla quando aparece; o pedido gera o e-mail. Custo: um
  passo da equipe por projeto.
- **C. Sempre visível só para consulta, edição liberada pela equipe.** Sem o ruído de A, mas duas situações para
  explicar ao cliente e mais código.

Para construir B há um caminho sensato: o estado do pedido mora no `BriefingProjeto` (uma linha por projeto, que o
serviço já trava com `FOR UPDATE`), e o portal reaproveita os componentes do formulário do link trocando só a forma
de salvar. Uma tabela própria de pedidos com histórico foi descartada: o histórico de pedir/encerrar/reabrir já sai
do `AuditLog` das ações.

## Desenho (decidido)

### Estado do pedido

Campos novos em `BriefingProjeto` (a linha nasce por `createMany … skipDuplicates`, como no serviço):

- `portalPedidoEm DateTime?` e `portalPedidoPorId String?` — última vez que a equipe pediu ou reabriu.
- `portalEncerradoEm DateTime?` e `portalEncerradoPorId String?`.
- Situação no portal (função pura, testada):
  - `nao_pedido` — `portalPedidoEm` nulo. Nada aparece no portal.
  - `aberto` — pedido e não encerrado (ou encerrado antes do último pedido). O cliente preenche.
  - `encerrado` — encerrado depois do último pedido. Só consulta.

Transições (serviço, `updateMany` condicionado):

- **Pedir** (`nao_pedido → aberto`) e **Reabrir** (`encerrado → aberto`): grava `portalPedidoEm`/`PorId`, limpa o
  encerramento, roda `aplicarInputsPadraoCore` (como o link) e, só quando o `count` volta 1, manda e-mail + sino.
- **Encerrar** (`aberto → encerrado`).
- Pedir com o pedido já aberto não faz nada e não manda e-mail (a ação responde "Já foi pedido").

**Encerrado vale para os dois canais** (decisão do dono): uma função pura única decide se o briefing e as perguntas
extras aceitam gravação — `nao_pedido` e `aberto` aceitam pelo link; só `aberto` aceita pelo portal; `encerrado`
não aceita em nenhum. As duas rotas do link (`/api/p/inputs/[token]` e `/briefing`) e as ações do portal a
consultam dentro da gravação (situação lida com a linha travada, para um encerramento simultâneo não deixar passar
uma gravação). Encerrado, a página `/p/inputs/[token]` mostra as respostas só para consulta, com a frase
"A equipe encerrou o preenchimento deste formulário." Projeto sem pedido pelo portal: o link segue exatamente como
hoje. A equipe (`salvarBriefing`, `responderInputs`) continua gravando sempre.

Pedir/Reabrir ficam desabilitados com o motivo, com a mesma frase no servidor:

- projeto sem cliente;
- cliente inativo;
- cliente sem nenhuma conta ativa no portal ("O cliente não tem conta ativa no portal. Use o link.");
- nada a preencher (nenhuma seção visível e nenhuma pergunta extra ativa).

### Avisos

- **Ao cliente**, quando Pedir/Reabrir mudam o estado: um aviso no sino e um e-mail para cada conta externa ativa do
  cliente do projeto. E-mail com modelo novo editável em Configurações → E-mails (`email-templates-meta.ts`,
  slug `portal-briefing-pedido`), com link para a página do briefing no portal. Falha de e-mail não desfaz o pedido.
  Conta ativa = `tipo: externo`, `ativo: true`, do `clienteId` do projeto (como `resumo-service.ts`). Sem categoria
  de notificação: é um pedido direto da equipe, o cliente não desliga. *Decisão minha.*
- **À equipe**, quando o cliente preenche pelo portal: a mesma `notificarPreenchimentoInput` (audiência
  `gestao_operacional`, janela de 6 h, "completo" fura a janela). A trava anti-repetição sai do
  `LinkPublicoInput.notificadoEm` e passa a ser uma só por projeto em `BriefingProjeto` (o link e o portal dividem a
  mesma janela); a migração copia o valor do link.

### Portal (cliente)

- **Card "Briefing do projeto"** na página `/portal/[projetoId]`, só quando a situação é `aberto` ou `encerrado`:
  situação do briefing (não iniciado / em preenchimento / completo), quantas obrigatórias respondidas, botão
  "Preencher" (aberto) ou "Ver respostas" (encerrado, com "Encerrado pela equipe em dd/mm").
- **Página `/portal/[projetoId]/briefing`**: briefing + "Perguntas extras", com os componentes do formulário do link;
  salvamento automático chama as Server Actions do portal. Encerrado = mesmo conteúdo, campos só leitura, sem salvar.
  Pré-preenche nome/e-mail/telefone/endereço do cadastro como o link.
- Ações `salvarBriefingDoPortal` e `responderPerguntasDoPortal`: conferem conta externa com acesso ao projeto, cliente
  ativo e situação `aberto` (senão `ActionError` com frase própria), gravam com `preenchidoPor = user.name` e chamam o
  aviso à equipe.

### Equipe (Projetos → Inputs)

- No topo, bloco **"Portal do cliente"**: situação (não pedido / pedido em dd/mm por Fulano / encerrado em dd/mm),
  quantas contas ativas o cliente tem hoje no portal (número do momento, não guardado — *decisão minha*), botões
  Pedir, Encerrar, Reabrir, cada um com o motivo quando desabilitado. Encerrar avisa no confirmar que o link também
  para de aceitar respostas.
- O link público desce para uma seção **"Link para quem não tem conta no portal"**, com o mesmo diálogo de hoje.

## Deixado para quem constrói

- Nomes exatos de funções, arquivos e do campo único da trava de aviso.
- Texto final do e-mail e do sino, dentro do tom dos modelos do portal.
- Como reaproveitar os componentes do formulário (prop de salvar, ou um invólucro novo).
- Layout do card e da página, seguindo os cards do portal.
- Smoke novo `smoke:portal-briefing` cobrindo: pedir (um e-mail por conta, dois cliques = um), escopo (outro
  cliente, cliente inativo, encerrado recusam), campo oculto não sai, `preenchidoPor`, aviso à equipe uma vez na
  janela e na passagem para completo, reabrir, link recusado depois de encerrar e de volta ao reabrir, link sem
  pedido pelo portal igual a hoje.
- Manual: `docs/manual/inicio/portal-cliente.md` e a página de Inputs do manual.
