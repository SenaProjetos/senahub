# Portal do cliente — conversa com a coordenação

Pedido do dono em 2026-11-21. Último item da série do portal (spec `2026-11-18-portal-cliente-entregas-design.md`:
"Briefing no portal, documentos do contrato e contato da equipe ficam para depois"). Briefing e assinatura de contrato
já foram entregues.

## Por quê

Nas palavras do dono: "atualmente todo o contato do cliente é com a direção/coordenação. Projetistas em contato direto
com cliente somente em reuniões ou com alguém superior presente. Já tivemos problemas com decisões do cliente passadas
diretamente pro projetista sem comunicação dos superiores que gerou transtornos."

O pedido é um **canal de troca de mensagens entre o cliente e a coordenação**, dentro do portal. O canal formaliza o
caminho que já é a regra da empresa (o cliente fala com direção/coordenação) e deixa registrado o que o cliente
pediu e decidiu, em vez de WhatsApp e e-mail espalhados.

Hoje o portal diz "fale com a equipe do projeto" em várias mensagens de erro e não mostra como. O único caminho
estruturado do cliente até a equipe é o pedido de revisão (prancha ou modelo 3D).

Sucesso = o cliente escreve no projeto pelo portal; a coordenação recebe na hora (sino, e-mail se não leu, tela aberta
atualiza sozinha) e responde ali; o projetista não vê a conversa; uma decisão do cliente fica marcada e listada no
projeto para consulta.

## Decisões do dono (2026-11-21)

1. **Troca de mensagens** (não um card de contatos).
2. **Só coordenação e direção veem e escrevem** do lado do escritório. Projetista não vê a conversa (nem lendo).
3. Construção: **mensagens próprias do portal + aviso na hora pelo tempo real (Socket.io) quando ele estiver no ar**, com
   conferência periódica quando não estiver (abordagem 3 de 3, ver "Abordagens").
4. **A coordenação pode marcar uma mensagem como "decisão do cliente"**, com destaque na conversa e uma lista de
   decisões no projeto.

## Objetivos

- **Uma conversa por projeto.** No portal, um card "Fale com a coordenação" na página do projeto
  (`/portal/[projetoId]`): mensagens em ordem, quem enviou e quando, campo de escrever, anexos.
- **Do lado do cliente, qualquer conta externa ativa do cliente do projeto** lê e escreve (mesma regra de acesso do
  resto do portal: `acessoDoUsuarioAoProjetoDoPortal` — cliente ativo, termo e senha em dia). Cada mensagem mostra o nome
  da conta que enviou.
- **Do lado do escritório, só a audiência da conversa** (definição abaixo) lê, escreve e marca decisão:
  - uma aba **Cliente** no projeto (`/projetos/[id]/cliente`), só para quem é da audiência daquele projeto;
  - uma lista **"Mensagens de clientes"** com as conversas da pessoa cuja última mensagem é do cliente (aguardando
    resposta) e as com mensagem não lida. Não há status de "fechar": responder tira da lista de aguardando.
- **Nada se edita nem se apaga.** Mensagem enviada é definitiva — o histórico é a prova do combinado. Anexo também.
- **Anexos:** até 5 por mensagem, até 100 MB cada (teto da borda do Cloudflare Tunnel), nos tipos do pedido de revisão
  (PDF, PNG, JPG, DWG, DXF), conteúdo conferido contra a extensão (`assinaturaConfere`, `pedido-revisao/regras.ts`).
- **Decisão do cliente:** a audiência marca qualquer mensagem da conversa (do cliente ou da equipe — às vezes a decisão
  está no "combinado: …" da coordenação) como decisão, com um resumo curto opcional. A marca aparece na conversa para os
  dois lados e a lista **Decisões** (mais nova primeiro: resumo ou trecho, data da mensagem, quem marcou) aparece na aba
  Cliente e no card do portal. Desmarcar é permitido à audiência e fica registrado; a marca removida sai da lista mas o
  histórico das marcações fica. **No portal** (decisão do agente, ver "Decisões do agente"): a marca diz "Registrada
  pela coordenação", sem o nome de quem marcou; o resumo aparece para o cliente, e a tela da equipe avisa ao marcar que
  "o cliente vê este resumo".
- **Tempo real:** mensagem nova e marca de decisão chegam na hora a quem está com a conversa aberta, dos dois lados, e
  atualizam o contador de não lidas. Sem Socket.io no ar (`npm run dev`, queda), a tela aberta confere sozinha a cada
  poucos segundos.
- **Avisos:**
  - **Sino criado na hora** para cada destinatário a cada mensagem (agrupar no sino é detalhe do construtor, ver
    abaixo). O sino do cabeçalho continua com a atualização periódica de hoje (`notification-bell.tsx`): o tempo real
    vale para a conversa aberta e o contador dela, não para o sino nem para o menu.
  - **E-mail no máximo um por conversa por pessoa enquanto houver mensagem não lida dela.** Quem recebe dez mensagens
    seguidas recebe um e-mail; depois de ler, a próxima mensagem pode gerar outro. A reserva do envio é atômica (dois
    envios simultâneos = um e-mail), como `reservarAviso`/`AvisoFinanceiroEnviado`.
  - **Cliente:** recebe quando a equipe escreve. Pode desligar o e-mail (o sino fica), como o resumo diário
    (`notif_portal_resumo`): categoria nova `portal_mensagem`.
  - **Equipe:** recebe quando o cliente escreve: os membros ativos do projeto com papel de coordenação; sem nenhum, as
    pessoas de escopo global (`whereAudiencia("global")`, o "gestores" de `avisarPedidoNovo`; regra de escolha de
    `destinatariosDaConclusao`), sempre filtrados pela audiência. Quem é audiência só pelo perfil Coordenador, sem ser
    membro coordenador, vê e responde mas não é avisado. Categoria nova
    `mensagem_cliente` (opt-out em Preferências, como as outras). O autor nunca é avisado da própria mensagem.
  - Template de e-mail novo em `lib/email-templates-meta.ts` para cada lado. O e-mail não leva o texto da mensagem
    (só projeto, quem escreveu e o link) — o conteúdo fica atrás do login.

## Decisões do agente (para o dono conferir)

- **Marca de decisão no portal sem nome:** "Registrada pela coordenação"; o resumo é visível ao cliente (é o registro
  compartilhado do combinado). Motivo: o anti-objetivo de não mostrar ao cliente nomes de quem não escreveu.
- **Situação do projeto não fecha a conversa:** enquanto o projeto aparece no portal para o cliente, ele lê e escreve,
  e a equipe é avisada — também em projeto concluído ou pausado. Conta do cliente desativada: as mensagens dela ficam na
  conversa com o nome, para a equipe e para as outras contas.
- **Leitura é por pessoa:** a resposta da coordenadora A não zera as não lidas do coordenador B. Abrir a conversa marca
  como lida até a última mensagem carregada.
- **"Aguardando resposta" é da conversa** (última mensagem é do cliente), igual para toda a audiência. A lista
  "Mensagens de clientes" mostra as conversas de todos os projetos de que a pessoa é audiência, aguardando primeiro,
  com filtro "só os projetos em que sou coordenador" ligado por padrão para quem é membro coordenador de algum projeto
  (a direção vê tudo sem filtro).
- **Sino do cabeçalho segue periódico;** tempo real só na conversa aberta.
- **Avisos à equipe:** membros coordenadores do projeto; sem nenhum, escopo global. Perfil Coordenador sem ser membro
  não é avisado.

## Audiência do escritório (quem é "coordenação e direção")

Uma pessoa INTERNA e ATIVA vê a conversa do projeto P se, e só se, um destes vale:

- é `superUsuario`;
- tem escopo de dados global (`acessoGlobal` — perfil com `escopo:global`) — a direção/gestores;
- é membro de P com papel de coordenação (`ProjetoMembro.papel` = `coordenador`; os avisos de hoje usam
  `contains "coord"`, e o construtor alinha as duas leituras numa regra só);
- tem o perfil de acesso Coordenador (`ehCoordenador`, decisão 18 do rateio) **e** enxerga P (`escopoProjeto`).

Regra pura única (`podeVerConversaDoProjeto` ou nome equivalente), testada, usada por TODO leitor e escritor: tela,
actions, rota de anexo, emissão de Socket.io, destinatários de sino/e-mail. **Não há permissão nova no catálogo** — o
acesso vem do papel no projeto, como o dono descreveu. Externo nunca é audiência do escritório.

## Não objetivos

- Conversa sem projeto (proposta, contrato avulso, assunto geral do cliente). Revisitar se fizer falta.
- Projetista lendo ou respondendo (decisão 2).
- Editar, apagar ou moderar mensagem. Sem "digitando…", sem "online", sem confirmação de leitura mostrada ao outro lado.
- Responder por e-mail (e-mail que volta para a conversa).
- Conversa na busca global, no chat interno, no resumo diário do portal ou na linha do tempo do portal.
- Decisão virar tarefa, apontamento ou mudança de escopo automaticamente — a coordenação repassa como hoje.
- Notificação push do navegador além do que `notificar` já faz.

## Anti-objetivos (falha mesmo funcionando)

- Um projetista (ou qualquer interno fora da audiência) ver uma mensagem do cliente por qualquer caminho: tela, sino,
  e-mail, evento Socket.io, rota de anexo, auditoria exposta em tela.
- O cliente ver qualquer dado interno: nomes de quem não escreveu na conversa, presença (quem está online), canais ou
  documentos internos, por tela ou por Socket.io.
- Um cliente ver a conversa de outro cliente ou de um projeto que não é dele.
- Mensagem sumir ou mudar depois de enviada.
- E-mail em rajada (um por mensagem).

## Restrições

- **Socket.io hoje aceita qualquer sessão** (`lib/socket.ts`): no `connection`, todo socket recebe `presenca-inicial`
  (ids de quem está online), `io.emit("presenca")` vai a todos, e `entrar-documento` deixa entrar em qualquer room de
  documento e devolve nome e foto de quem está vendo. Hoje o cliente não conecta (o provider só monta com `chat:usar`),
  mas nada no servidor impede. **Com este item o cliente passa a conectar, então o servidor tem de separar o externo:**
  socket de usuário externo entra só no room `user:<id>`, não recebe presença (nem o `presenca-inicial` nem o broadcast —
  o broadcast vai só aos internos, ex. room `internos`), não conta na presença, e `entrar-canal`, `entrar-documento`,
  `sair-documento`, `digitando` e `solicitar-presenca` são ignorados para ele. Teste/smoke cobre isso.
- `io` vive em `globalThis` (`getIo`, `emitParaUsuario`) — emitir de Server Action só pelos acessores existentes.
- A emissão leva só o necessário para a tela buscar/mostrar (ex. `{ projetoId, mensagemId }` ou a mensagem já no formato
  da tela daquele destinatário) e vai **por usuário** (`user:<id>`) a cada pessoa da audiência e a cada conta ativa do
  cliente — nunca a um room largo onde entraria quem não pode ler.
- `src/app/(dashboard)/layout.tsx` tem alterações do dono não commitadas: **não editar esse arquivo.** A conexão
  Socket.io do cliente monta dentro das páginas do portal (o card), não no layout.
- `defineAction` em toda action (auditoria automática). Ações do cliente sem `recurso` de catálogo, com conta externa e
  acesso ao projeto conferidos no serviço (como `pedido-revisao` e `contratos`). Ações da equipe com `interno: true` e a
  regra da audiência conferida no serviço.
- Escritas em transação sem `Promise.all` e sem `select`/`include` aninhado (Gotchas do CLAUDE.md). Rota REST só para o
  upload multipart e o download do anexo.
- Textos em pt-BR; datas pelos helpers de `lib/utils.ts`. Tela pronta = 390×844 sem rolagem lateral e 1366×768 com menu
  aberto sem sobrepor o cabeçalho (`CabecalhoPagina` na lista e na aba).
- Cliente inativo: portal fechado como hoje (`portal-cliente-decisoes`) — sem conversa, sem aviso, sem e-mail.

## Abordagens

1. **Mensagens próprias do portal, atualizando por conferência periódica.** Tabelas próprias, aba no projeto, lista da
   coordenação; a tela aberta confere a cada poucos segundos. Funciona sempre, não toca no chat. Custo: alguns segundos de
   atraso.
2. **Chat interno, um canal por projeto com o cliente como membro.** Tempo real e tela pronta, mas o chat é para gente de
   dentro: menções, busca, presença e moderação listam pessoas e canais internos, e `chat:moderar` leria a conversa com o
   cliente — fura a decisão 2.
3. **A 1 com aviso na hora pelo Socket.io quando no ar** (escolhida pelo dono). Mesmo modelo de dados e telas da 1; o
   servidor empurra a mensagem nova a cada destinatário; a conferência periódica fica como reserva. Custo extra: separar
   o socket do externo no servidor (Restrições).

## Modelo de dados (direção, o construtor fecha os nomes)

- Conversa: uma por projeto (única por `projetoId`), criada na primeira mensagem.
- Mensagem: conversa, autor (`userId`), lado (`cliente | equipe`, gravado — não deduzido depois, a pessoa pode mudar de
  tipo), texto (até um teto razoável, ex. 5.000 caracteres; vazio só com anexo), data. Sem colunas de edição/exclusão.
- Anexo da mensagem: caminho no storage (via `resolverCaminho`), nome, tamanho, tipo.
- Leitura: por pessoa e conversa, até qual mensagem/data leu, e a reserva do e-mail (enviado para as não lidas desde X).
- Marca de decisão: mensagem, resumo opcional, quem marcou e quando; remoção preenche quem/quando removeu (nunca apaga);
  no máximo uma marca ATIVA por mensagem (índice parcial).

## Deixado ao construtor

- Nomes de tabelas, rotas e componentes; onde fica a lista "Mensagens de clientes" no menu (só para quem é audiência de
  ao menos um projeto) e o contador de não lidas.
- Intervalo da conferência periódica (sugestão: 15–30 s com a aba visível, parada com a aba oculta) e paginação da
  conversa (carregar as últimas N e "ver anteriores").
- Fluxo do anexo (mensagem primeiro e anexos um por requisição, como o pedido de revisão, ou anexos antes com limpeza),
  desde que não sobre arquivo órfão e cada requisição respeite 100 MB.
- Agrupar sinos repetidos da mesma conversa (ex. atualizar o sino não lido em vez de criar outro), se `notificar`
  permitir sem mudança grande; senão um sino por mensagem.
- Teto de mensagens por minuto por conta, se achar necessário.
- Smoke novo (`smoke:portal-mensagens`) cobrindo: audiência (projetista, coordenador de outro projeto, gestor, perfil
  Coordenador sem ver o projeto), outro cliente/cliente inativo, e-mail uma vez até ler, opt-out, marca/desmarca de
  decisão com histórico, socket do externo sem presença nem rooms internos, anexo de outra conversa recusado.
- Manual: `docs/manual/inicio/portal-cliente.md` (seção nova, com cuidado: o arquivo tem alterações do dono não
  commitadas — só staging parcial), página de Projetos para a aba Cliente, `novidades.md`.
