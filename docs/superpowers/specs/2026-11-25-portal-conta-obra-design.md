# Portal do cliente — conta de obra

Pedido do dono em 2026-11-25. Item 4 da série "próximos 6 do portal" (ordem combinada: assinatura ✓ → conversa ✓ →
aprovação da entrega ✓ → atas ✓ → agenda ✓ → **conta de obra** → confirmação de recebimento → comparar revisões).

## Por quê

Quem executa a obra — a construtora ou o engenheiro que o cliente contratou — recebe hoje as pranchas soltas, por e-mail ou
WhatsApp. O risco real é construir por uma revisão velha: ninguém garante que o arquivo no celular do engenheiro é o que vale,
e o escritório não sabe quem pegou o quê.

A conta de obra dá a essa pessoa um login no portal que mostra **só o que está em "Liberado para obra"** (e os modelos 3D
dessas entregas), sempre na revisão vigente, com histórico de quem viu e baixou, e um aviso diário quando algo é liberado,
substituído ou retirado.

Ela atende dois casos (decisão 1): **empresa de fora** (a construtora, que não é o cliente e não pode ver nada do cliente além
da obra) e **gente do próprio cliente** que cuida só da obra.

Sucesso = o engenheiro entra, vê as obras dele, abre a pasta Liberado para obra de cada uma, visualiza e baixa a prancha
vigente e o modelo 3D, recebe de manhã um e-mail quando algo mudou — e não consegue, por nenhum caminho (tela, rota,
ação), ver financeiro, contratos, conversa, atas, agenda, briefing, aprovações, andamento, pedidos ou a pasta Compartilhado.

## Decisões do dono (2026-11-25)

1. **Quem é**: a construtora ou o engenheiro contratado que executa a obra; e também gente do próprio cliente responsável só
   pela obra. As duas opções existem.
2. **Uma conta tem uma lista de obras** (opção B): a equipe marca os projetos um a um, podendo ser de clientes diferentes; o
   nome da empresa fica escrito na conta. Se a pessoa é do cliente, a conta fica ligada a ele, mas vê só as obras marcadas.
   (Descartadas: A — conta presa a um cliente, trava quando a construtora atende dois clientes; C — construtora como cadastro
   próprio, fica como evolução.)
3. **Só ver e baixar** (opção A): sem pedir revisão, sem marcar na prancha, sem marcar no 3D. Dúvida de obra segue pelo canal
   de hoje. Motivo: pedir revisão mexe no que o cliente vê ("Em revisão") e muitas vezes em contrato; quem decide mudar o
   projeto é quem paga. ("Dúvida de obra" separada — opção C — fica como evolução.)
4. **Só a pasta "Liberado para obra"**, nunca a "Compartilhado" (em análise). No 3D, só os modelos que estão em Liberado para
   obra; nunca os arquivos que o cliente enviou. (Proposta do agente, aceita.)
5. **Aviso: resumo diário só de obra** (opção A): um e-mail de manhã, se houve mudança na véspera, mais o sino, com três
   fatos — liberadas, substituídas, retiradas. A pessoa pode desligar o e-mail. (Descartados: e-mail na hora; nenhum aviso.)
6. **Termo de uso próprio de obra** (opção A): o agente redige a partir do termo do cliente; o dono ou o advogado revisam antes
   do deploy. O termo do cliente não serve (diz que o usuário representa o cliente e que as informações não vão a terceiros —
   a construtora é terceiro). Gente do cliente com conta de obra aceita o mesmo termo de obra.
7. **Revogar e expirar** (proposta do agente, aceita): a equipe desativa a conta (como qualquer usuário) ou tira uma obra da
   lista, com efeito imediato; a conta pode ter "acesso até" opcional (fim da obra) — no dia seguinte a pessoa não entra mais.
8. **Quem cria**: a equipe, em Configurações → Usuários, como já cria a conta do cliente. (Proposta do agente, aceita.)
9. **Construção: Caminho 1** (ver "Abordagens"): a conta de obra **nunca tem cliente na conta** (`User.clienteId` nulo); as
   travas do cliente que já existem recusam a conta de obra sozinhas.

## O que a pessoa de obra vê

### Menu
"Meus projetos" (`/portal`), notificações, Ajuda, perfil. Sem Financeiro: a conta de obra **não tem perfil de acesso**
(`perfilId` nulo — hoje toda conta externa recebe o perfil `portal_cliente`, que traz `financeiro:extrato`), então nenhum item
de catálogo aparece; e a página do financeiro do cliente já exige cliente na conta.

### `/portal` — lista de obras
Título "Minhas obras", descrição "Pranchas e modelos liberados para a execução das suas obras." Um cartão por obra da lista
(projeto ativo na lista da conta, ver Regras): nome, código, endereço (útil na obra), quantas pranchas estão liberadas e a data
da última liberação. Sem situação do projeto, sem progresso, sem contratos. Lista vazia: EmptyState "Nenhuma obra liberada para
você ainda. Fale com o escritório." No fim, o mesmo interruptor do e-mail do resumo ("Receber por e-mail o resumo diário").

Se a conta não tem nenhuma obra válida, a lista vazia explica; nunca cai no texto "Sua conta ainda não está vinculada a um
cliente".

### `/portal/[projetoId]` — a obra
- Cabeçalho: nome do projeto, código; endereço numa linha abaixo. Sem prazo, sem situação.
- **Liberado para obra**: o mesmo componente das Entregas, com uma pasta só (disciplinas → pastas por fase → arquivos), revisão
  vigente, "Ver" (PDF no navegador / visualizador), "Baixar", ".zip da pasta" e ARTs (decisão do agente 4).
- Botão **"Modelo 3D"** quando há modelo (mesma regra `temModelo3dNoPortal`, só com origem "entrega").
- Nada mais: sem aprovações, atas, contratos, briefing, agenda, andamento, linha do tempo, pedidos, conversa, recebidos.

### `/portal/[projetoId]/prancha/[uploadId]` — visualizador
Só leitura: sem as 6 ferramentas de marcação, sem rascunho, sem "Pedir revisão". Zoom, páginas, baixar.

### `/portal/[projetoId]/modelo` — 3D
O mesmo visualizador do portal, sem marcação e sem pedido. Navegação e modo "andar" ficam (é o uso de obra). Lista só os
modelos de Liberado para obra.

## O que a equipe vê

### Configurações → Usuários
- No formulário de criar/editar, conta externa ganha a escolha **"Tipo de acesso: Cliente | Obra"**.
- **Obra**: "Empresa" (texto, obrigatório, até 120), "É do cliente" (opcional — escolher um cliente; vazio = empresa de fora),
  "Obras" (lista de projetos, busca por código/nome; com cliente escolhido, só projetos dele) e "Acesso até" (data opcional,
  o `User.acessoAte` que já existe).
- Na lista de usuários, a conta de obra aparece com o selo "Obra · <Empresa>".
- Trocar uma conta entre Cliente e Obra **não é permitido** (decisão do agente 6): cria-se outra conta.

### `/projetos/[id]/cliente` — seção "Acesso de obra"
Só leitura (decisão do agente 3): quem tem conta de obra com este projeto — nome, empresa, "acesso até", último acesso (do
histórico) — e um link para a conta em Configurações → Usuários para quem tem `usuarios:gerir`. Some quando não há ninguém.

### Histórico por documento
Os downloads e visualizações da conta de obra entram no histórico como os do cliente (`registrarAcessoUploads`, origem
`portal`), com o nome da pessoa — é assim que o escritório sabe quem pegou o quê.

## Regras

### O que é uma conta de obra
`User.tipo = externo`, `User.clienteId = null` e uma linha `ContaObra` (1:1 com o usuário). As três coisas andam juntas e só o
serviço da conta de obra as escreve. Invariante: **conta de obra nunca tem `clienteId`** — é ele que mantém fechadas todas as
áreas do cliente sem mexer nelas. O serviço recusa gravar `clienteId` numa conta com `ContaObra` e recusa criar `ContaObra`
numa conta com `clienteId`; a ação de editar usuário (cliente) também recusa `clienteId` em conta de obra. Um teste de guarda
e o smoke conferem.

Pelo mesmo motivo, **conta de obra nunca tem perfil de acesso, override de permissão nem superusuário** (`perfilId` nulo,
nenhum `PermissaoUsuario`, `superUsuario = false`). Algumas travas olham o perfil, não o `clienteId`: `escopoProjeto` devolve
"tudo" com `escopo:global` antes de olhar o externo, e `podeLerDocumento` abre arquivo com `clientes:ver`/`comercial:ver`. O
formulário esconde esses campos na conta de obra e o serviço (criar e `editarUsuario`) recusa gravá-los nela.

### Quais obras a conta vê (função pura `obrasDaConta` / decisão `decidirAcessoObra`, testadas)
Um projeto entra se, ao mesmo tempo (sem filtro pela situação do projeto, como no portal do cliente — obra concluída ainda
precisa das pranchas; para cortar, a equipe tira da lista ou usa "Acesso até"):
- está na lista da conta (`ContaObraProjeto`);
- o cliente dono do projeto está ativo (`Cliente.ativo`) — cliente desativado fecha o portal inteiro dele, obra inclusa
  (decisão do agente 2);
- se a conta é "do cliente" (`ContaObra.clienteId`), esse cliente está ativo e é o dono do projeto.

E a pessoa: tem sessão, `tipo = externo`, `clienteId` nulo, `ContaObra` existe, não precisa trocar senha, aceitou a versão
vigente do termo de obra. `acessoAte` e `ativo` já são cobrados pelo `getSession`. Fora disso: o mesmo 404 neutro do portal
(não revela se o projeto existe); senha e termo dão 403 só depois de saber que a obra é da pessoa, como hoje.

### Porta dos arquivos: uma só para cliente e obra
- `acessoDoUsuarioAoProjetoDoPortal` **continua só do cliente**, sem mudança. Ela é usada por pedidos de revisão, mensagens,
  briefing e documentos recebidos — se ela aceitasse obra, essas áreas abririam.
- Nova `acessoAosArquivosDoPortal(user, projetoId)` = cliente (pela porta de cima, alcance de hoje) **ou** obra (alcance só de
  Liberado para obra). É usada **apenas** por: download de arquivo, .zip, ART e a lista/rota de modelos 3D. Devolve também o
  papel (`cliente | obra`).
- `AlcanceArquivos` ganha `situacoes: Situacao[]` (as pastas que o alcance mostra). Portal do cliente e link público seguem com
  as duas; obra = `["liberado_obra"]`. O núcleo (`montarConteudo`, `uploadLiberadoNoAlcance`, `uploadsDoAlcanceParaZip`) filtra
  pelas pastas do alcance nos três lugares — a página, o download direto e o .zip nunca divergem. Um arquivo que está só em
  Compartilhado dá 404 para a obra, mesmo com a URL na mão.
- Bloqueio de download do ciclo documental vale igual (`motivoBloqueioDosUploads`, `uploadsComBloqueioDeDownload`).

### Modelos 3D
`modelosDoPortal` passa a receber o acesso já decidido (ou a porta nova). Para obra: só os IFCs de Liberado para obra (servidos
pelo realinhado convertido mais novo, como hoje), sem os recebidos do cliente. A rota `.frag` usa a mesma lista (regra única,
como hoje).

### Telas do portal
As páginas `/portal`, `/portal/[projetoId]`, `.../prancha/[uploadId]` e `.../modelo` decidem o papel **no topo** e, para obra,
renderizam componentes de obra próprios (ou os mesmos componentes com as ferramentas desligadas), nunca a página do cliente com
cartões escondidos. Um cartão novo que alguém acrescente à página do cliente não aparece para a obra.

### Revogar e expirar
- Tirar uma obra da lista: efeito na próxima requisição (toda leitura confere a lista).
- Desativar a conta: o fluxo de hoje (`desativarUsuario`).
- "Acesso até": o `User.acessoAte` que já existe — a partir do dia seguinte `getSession` recusa e o login é barrado, e a rotina
  noturna (`aplicarDesligamentosVencidos`) grava `ativo = false` e apaga as sessões. A tela de usuários passa a permitir editá-lo
  na conta de obra. **Obra que atrasou**: gravar um "Acesso até" de hoje em diante numa conta de obra desativada por vencimento
  a reativa mantendo a data nova (o `reativarUsuario` de hoje apaga o `acessoAte`; na conta de obra ele não pode apagar a data
  que a equipe acabou de pôr). Conta desativada à mão continua só pelo "Reativar".

### Termo de uso de obra
- `TipoTermo` ganha `obra`; o termo aplicável deixa de sair só do `User.tipo`: externo com `ContaObra` = `obra`. O ponto
  único é `precisaAceitarTermo` (layout, `/termo`, `/assinar-holerite`, rotas de download e contratos passam por ele), que passa
  a ler a `ContaObra`; a página do termo e a ação de aceite usam a mesma decisão.
- Texto (versão `2026-11-25`, marcadores de empresa iguais aos do termo do cliente): a pessoa é representante de empresa
  executora (ou do cliente) **autorizada pelo cliente a receber o projeto para executar a obra**; uso só para a execução daquela
  obra; o acesso é pessoal, intransferível, revogável e pode ter prazo; confidencialidade e direitos autorais dos arquivos
  (cláusula 7.1 do termo do colaborador como referência); proibido repassar fora da equipe da obra; a prancha vale na revisão
  vigente do portal e a cópia baixada pode ficar desatualizada; LGPD (dados do usuário: nome, e-mail, acessos). Versão rica em
  `docs/legal/termo-obra.md`, em sincronia, como os outros dois. **Revisão jurídica antes do deploy** (pendência do dono).

### Resumo diário de obra
- Roda na mesma rodada do resumo do portal (mesmos dias avaliados, mesmo `ConfigSistema portal.resumoDiario`, mesma reserva
  `AvisoPortalEnviado` por conta+projeto+dia+canal, mesma liberação quando o envio falha). A conta de obra **não** entra no
  resumo do cliente (ele lê `cliente.usuarios`, e ela não tem cliente).
- Fonte: as duas maneiras de um documento entrar em "Liberado para obra", como o andamento do portal já faz
  (`datasDasMarcacoes`): **dentro do ciclo documental** (pacote A), `ControleRevisao` tipo `liberado_obra` (`aplicadoEm` /
  `removidoEm`; controle de origem `migracao` não conta); **fora do ciclo**, os `DocumentoEvento` `situacao_marcada` /
  `situacao_retirada` da pasta Liberado para obra (o `revisaoLiberadaObraId` é escrito direto, sem controle). Dia = dia de São
  Paulo do instante. Fora do ciclo, marcar uma revisão nova sobre a anterior gera só `situacao_marcada`: conta como
  **Substituída** quando o documento já tinha outra revisão marcada na pasta.
- Itens por obra e dia:
  - **Liberada**: controle aplicado no dia.
  - **Substituída**: no mesmo dia, o controle de uma revisão do documento foi removido e o de outra revisão do mesmo documento
    aplicado → um item "ARQ-01: R01 → R02" (não sai também como liberada + retirada).
  - **Retirada de obra**: controle removido no dia sem outra revisão do mesmo documento liberada no mesmo dia (inclui a revogação
    automática ao publicar a revisão nova — A1 do ciclo documental — enquanto a nova ainda não foi liberada).
  - Só documentos de disciplinas do projeto; revisão com bloqueio de download continua entrando (ela some da pasta, mas a obra
    precisa saber que mudou).
- Texto do item: disciplina + nome do documento/prancha + revisão (mesmo rótulo das Entregas). Escapado no Markdown; URL como
  autolink `<url>`.
- Sino: "Novidades na obra <projeto>" → `/portal/<id>`. E-mail: template novo `resumo-obra-portal`, uma mensagem por conta e
  obra que mudou.
- Opt-out: a mesma categoria `portal_resumo` e o mesmo interruptor da lista.
- Conta criada depois do fim do dia, ou obra acrescentada à lista depois do fim do dia (`ContaObraProjeto.criadoEm`), não recebe
  aquele dia.

## Audiência e permissões
- Criar, editar e desativar conta de obra, e mexer na lista: `usuarios:gerir` (o mesmo de hoje para contas), sempre por
  `defineAction` com auditoria e `capturarAntes`.
- A seção "Acesso de obra" do projeto: quem já vê `/projetos/[id]/cliente`.
- A pessoa de obra não tem permissão de catálogo; as leituras dela passam pela porta nova.

## Não-objetivos
- Pedir revisão, marcar na prancha ou no 3D, "dúvida de obra" (RFI).
- Conversa com a coordenação, atas, agenda, andamento, financeiro, contratos, briefing, aprovações.
- A construtora ou o cliente criarem/convidarem contas de obra.
- Cadastro de construtora como entidade (opção C da decisão 2).
- Pasta Compartilhado; recebidos do cliente no 3D.
- E-mail na hora da liberação/retirada.
- Coordenação dar acesso de obra pela tela do projeto (fica só leitura aqui; ver decisão do agente 3).

## Anti-objetivos (falha mesmo que "funcione")
- A conta de obra passar em qualquer trava do cliente (página, rota ou ação), hoje ou numa área futura.
- A obra ver um arquivo que está só em Compartilhado, por tela, download direto, .zip ou modelo.
- Uma revisão substituída continuar aparecendo como vigente para a obra.
- A conta de obra de gente do cliente ver projetos do cliente que não foram marcados.

## Abordagens
1. **Conta de obra sem cliente na conta** (escolhida): `clienteId` nulo + tabela própria com a lista. As ~20 travas do cliente
   (que exigem `clienteId` igual ao do projeto) recusam sozinhas; só arquivos e 3D ganham caminho de obra, por uma porta nova.
   O erro possível é a obra ver menos, nunca mais.
2. **Conta de obra com cliente + marca "obra"**: exigiria acrescentar "e não é obra" em cada trava; esquecer uma abre
   financeiro/contrato do cliente para a construtora. Descartada.
3. **Link público sem login, só Liberado para obra**: sem termo, sem registro por pessoa, sem 3D. Descartada (o dono quer conta).

## Modelo de dados (migração aditiva)
- `enum TipoTermo` + valor `obra` (`ALTER TYPE … ADD VALUE`).
- `ContaObra`: `id`, `userId` (único, FK User, cascade), `empresa` (texto), `clienteId` (opcional, FK Cliente — "é do
  cliente", `onDelete: Restrict`: excluir o cliente é recusado enquanto houver conta de obra dele, com mensagem), `criadoPorId`,
  `createdAt`, `updatedAt`. Índice em `clienteId`. A fusão de clientes (`clientes/fusao.ts`) move `ContaObra.clienteId` para o
  cliente que fica, como move `User.clienteId`; `verify:fusoes-clientes` passa a conferir.
- `ContaObraProjeto`: `id`, `contaObraId` (FK, cascade), `projetoId` (FK Projeto, cascade), `concedidoPorId`, `criadoEm`.
  Único `(contaObraId, projetoId)`; índice em `projetoId`.
- Nada muda em `User` (o `acessoAte` já existe). Template de e-mail `resumo-obra-portal` semeado create-only como os outros.

## Decisões do agente (corrigíveis)
1. **Tabela própria `ContaObra` 1:1** em vez de colunas no `User`: o `User` já é enorme e a presença da linha é o próprio
   "é conta de obra".
2. **Cliente do projeto desativado fecha a obra também** (e, na conta "do cliente", o cliente dela desativado fecha tudo): é o
   lado seguro; o dono decidiu em 2026-11-18 que cliente inativo fica fora do portal.
3. **A coordenação não dá acesso de obra pela tela do projeto** nesta entrega; só vê quem tem. Dar acesso = criar conta, que
   hoje é de `usuarios:gerir`.
4. **ARTs entram** na pasta da obra (a ART costuma ter de ficar no canteiro). Seguem a mesma regra do portal.
5. **Opt-out na mesma categoria `portal_resumo`** e o mesmo interruptor: uma conta é de obra ou de cliente, nunca as duas.
6. **Não se troca uma conta entre Cliente e Obra**: o termo aceito, o histórico e as listas mudariam de sentido; cria-se outra.
7. **Conta "do cliente" só pode ter obras desse cliente** (o formulário filtra e o serviço confere).
8. Item do resumo "Substituída" só quando a troca acontece no mesmo dia; em dias diferentes saem "Retirada" num dia e "Liberada"
   no outro (é o que a obra viu de fato).
9. Lista salva inteira de uma vez (a ação recebe o conjunto de projetos e troca na mesma transação), com trava otimista pelo
   `updatedAt` da `ContaObra`.
10. **Sem perfil de acesso** na conta de obra (nem override, nem superusuário), em vez de um perfil vazio semeado: nada para
    alguém "corrigir" depois dando uma permissão que abriria uma trava por perfil.
11. **O resumo de obra cobre documentos dentro e fora do ciclo documental**, pela mesma derivação do andamento: a obra vê os
    dois na pasta, então tem de ser avisada dos dois.
12. **Obra que atrasou**: nova data de "Acesso até" reativa a conta vencida, guardando a data.
13. **Cliente da conta "do cliente"**: excluir recusa; fusão move.
14. **Sem filtro por situação do projeto** na lista de obras (igual ao portal do cliente).

## Verificação
- Testes puros: `decidirAcessoObra`, `obrasDaConta`, filtro de pastas do alcance, itens do resumo de obra (liberada/substituída/
  retirada, dia de SP, conta/obra criada depois do dia), termo aplicável.
- Guarda: nenhuma escrita de `clienteId` em conta com `ContaObra`; a página do cliente não é usada para a obra.
- Smoke `smoke:portal-obra`: conta de obra criada; vê só as obras da lista (duas de clientes diferentes); arquivo só em
  Compartilhado dá 404 na página, no download direto, no .zip e no modelo; Liberado sim; bloqueio de download tira; **toda área
  do cliente recusa** (pedido de revisão, mensagem, briefing, documentos recebidos, atas, agenda, aprovações, contratos,
  financeiro); tirar obra da lista fecha na hora; cliente inativo fecha; conta "do cliente" não aceita obra de outro cliente;
  termo de obra pendente dá 403; perfil, override e superusuário recusados na conta de obra; "Acesso até" novo reativa a conta
  vencida; resumo de obra (liberada, substituída, retirada — dentro e fora do ciclo documental —, uma vez por dia, opt-out, conta
  nova no dia, obra acrescentada no dia, conta de obra fora do resumo do cliente). Entra no `package.json` e na lista do CLAUDE.md.
- Regressão: `smoke:portal-entregas`, `smoke:portal-modelo3d`, `smoke:portal-resumo`, `smoke:pedido-revisao-cliente`,
  `smoke:portal-mensagens|atas|agenda`.
- Manual: `docs/manual/inicio/portal-cliente.md` (seção da conta de obra) e `novidades.md`.

## O que fica para quem constrói
- Onde exatamente o `tipoTermoPorTipo` é chamado e como a função nova chega ao layout sem uma leitura a mais por página (pode ir
  junto com a leitura que o layout já faz).
- Forma dos componentes de obra (reaproveitar `EntregasDoPortal` e os visualizadores com uma prop de "só leitura" ou envolver).
- Texto final do termo de obra (com as balizas acima) e do e-mail do resumo.
- Rótulo do item do resumo quando o documento não tem nome de prancha (cair no nome do arquivo, como as Entregas).
