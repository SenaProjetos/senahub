---
titulo: Configurações (administração)
descricao: Central de administração — usuários, permissões, parâmetros de folha, projetos, licitações, funil, avisos e dados da empresa, além do status das integrações.
resumo: Hub administrativo com cadastros e parâmetros do sistema (usuários, permissões, encargos, documentos/inputs padrão, feriados, licitações, funil) e o status das integrações on-premise (SMTP/push).
tags: [configurações, administração, usuários, permissões, encargos, feriados, licitações, funil, avisos, agendamento, integrações, empresa, timbrado]
palavras-chave: [disciplinas e nomenclatura, pasta dos arquivos, configurações, administração, usuários, permissões, matriz, encargos, inss, irrf, feriados, modalidades, habilitação, funil, aviso geral, agendar aviso, aviso agendado, comunicado programado, smtp, push, dados da empresa, razão social, cnpj, logo, logo da empresa, timbrado, cabeçalho do pdf, sinônimo de sigla, transferir sigla]
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
- **Disciplinas** — catálogo de disciplinas (sigla, ícone, categoria); cada disciplina pode
  ter **sub-disciplinas** (etiqueta de documento dentro dela, como Água Fria dentro de
  Hidrossanitário) e **siglas por versão** do padrão de nomenclatura.
- **Lista Mestre** — siglas de fase, tipo e tamanho de papel usadas nos nomes de arquivo,
  também com siglas por versão.
- **Disciplinas e nomenclatura** — o catálogo do padrão de nome de arquivo, versão por versão
  (disciplinas, sub-disciplinas, fases, tipos e siglas): ver
  [Montar uma versão do padrão](#montar-uma-versão-do-padrão-de-nomenclatura). Pelo botão
  **Versões** do topo se criam e se publicam as versões. Uma versão publicada é **imutável**;
  corrigi-la é publicar uma versão nova. Um projeto novo recebe a versão vigente na data em que
  é criado; publicar não muda projeto já existente. Publicar avisa (sem bloquear) quando uma
  sigla já significou outra coisa numa versão anterior.
- **Documentos padrão** — modelo do Estúdio usado por padrão em cada fonte.
- **Inputs padrão** — perguntas padrão por disciplina no link do cliente.
- **Feriados** — calendário (ponto, escala, banco de horas).
- **Modalidades de licitação** — lista usada no cadastro de licitações.
- **Parâmetros de licitação** — prazos de recurso, limite de aditivo, modo PNCP/reajuste,
  alertas.
- **Checklist de habilitação** — modelos de exigências para licitações.
- **Etapas do funil** — estágios do pipeline comercial (criar/editar/ativar/desativar).

### Sistema
- **Empresa** — **razão social**, **CNPJ**, **endereço** e **logo** da empresa. Esses dados
  formam o **timbrado** (cabeçalho) dos PDFs que saem do sistema: o **holerite** da Folha CLT
  e o **recibo** de pagamento de projetista.
  - **Logo:** PNG ou JPG de até **4 MB**; o sistema reduz para no máximo **600px** de lado.
    Prefira fundo transparente ou branco. **Remover** e depois **Salvar** tira o logo do timbrado.
  - Enquanto a razão social não for preenchida, os PDFs saem **sem timbrado**.
  - A mudança vale para os PDFs baixados **a partir de agora** — inclusive de holerites e
    recibos antigos, porque o timbrado é montado na hora do download. O texto assinado do
    recibo **não muda**: o timbrado fica fora dele.
- **Aviso geral** — enviar um comunicado (**modal em tela cheia + sino/push** e, se quiser,
  **e-mail**) para todos, por categoria de perfil ou por nome. Pode **exigir confirmação de
  leitura** e levar uma **imagem**.
  - **Formatação da mensagem** — a barra acima do campo escreve **negrito**, *itálico*,
    **títulos** (dois tamanhos) e **listas**; dá para digitar a marcação direto
    (`**negrito**`, `_itálico_`, `# título`, `- lista`). A formatação aparece no modal, no
    detalhe do aviso e no e-mail. No **sino** e no **push do sistema** o texto chega sem
    formatação, porque essas telas não a exibem.
  - **Imagem** — reduzida sozinha para no máximo **1600px** de lado maior, **sem cortar**.
    O ideal é **paisagem, ~1600×900px**. Quando o aviso tem imagem, o modal abre **largo**,
    e clicar na imagem a abre em **tamanho original** numa aba nova.
  - **Agendar envio** — em vez de disparar na hora, escolha data e hora (até **90 dias**).
    O aviso fica na aba **Agendados** e pode ser **cancelado** enquanto não disparar.
    Os destinatários são apurados **no momento do envio** — quem entrar na equipe até lá
    também recebe.
  - A aba **Enviados** mostra o registro com **quantos confirmaram** a leitura.

### Integrações (somente leitura)
- **E-mail (SMTP)** e **Web Push (VAPID)** mostram se estão **configurados**. O sistema é
  **on-premise**: serviços rodam no próprio servidor e são definidos por **variáveis de
  ambiente** — não há integrações SaaS externas.

## Montar uma versão do padrão de nomenclatura

A tela é **Configurações → Disciplinas e nomenclatura**. Ela abre na versão mais nova; para
trocar, use a **lista de versões** no topo (mais nova primeiro, com "rascunho" e "vigente"). As
abas **Disciplinas**, **Fases** e **Tipos de documento** separam o catálogo, e a busca encontra
por nome, sigla ou sinônimo. Ela mostra a versão como na planilha da gestão: cada **CARD**
(disciplina que abre card no projeto, com projetista, prazo e pagamento) com as suas **SUBs**
(etiqueta do documento, lida do nome do arquivo), a sigla de cada um, e as fases e tipos. Ao
lado de cada linha aparece o que mudou em relação à versão anterior ("novo na v2", "sigla nova
(era SPD)"), e embaixo o que **saiu**.

**Importar a planilha** (botão no topo do catálogo), em .xlsx ou .csv, uma linha por item:
- `Nome · Sigla · CARD` — disciplina; a sigla pode faltar quando o card tem subs;
- `Nome · Sigla · SUB` — sub-disciplina do CARD mais próximo acima dela;
- linha só com o nome é título de grupo (só organiza).

Antes de gravar, o sistema mostra a **prévia** e nada é salvo até você clicar em **Aplicar**:
- cada linha é ligada ao cadastro pela **sigla** e, sem sigla, pelo **nome** (sem acento, sem
  "GERAL", sem o que está entre parênteses). Nome diferente **não renomeia** o cadastro;
- nome só **parecido** (ex.: "Prevenção de Incêndio" × "Incêndio (PPCI)") vira uma ligação para
  você confirmar;
- o que está na versão e **não está na planilha sai** dela (continua nas versões anteriores);
- se uma sigla da planilha já é de outro item na versão, **a planilha manda**: a sigla deixa de
  valer no outro item a partir da versão (aparece em "Consequências");
- dá para **desmarcar** qualquer mudança; desmarcar um card novo tira junto as subs dele;
- sigla com acento é gravada sem (ORÇ → ORC), e linhas que valem conferir aparecem no topo.

Aplicar grava tudo de uma vez (ou nada, se algo falhar). Importar a mesma planilha de novo não
muda nada. Se a versão já está **publicada**, a mudança vale também para os projetos que a
seguem — para não afetá-los, crie uma versão nova.

**Ajustes avulsos**, no mesmo catálogo: **+ Disciplina**, **+** numa linha de card (nova
sub-disciplina), **Siglas nesta versão** (ícone de etiqueta: a sigla oficial e os sinônimos do
item nesta versão; o que mudar vale desta versão em diante e as anteriores ficam como estão) e
**Tirar da versão**. Na lista, a sigla oficial tem borda cheia e os **sinônimos**, borda tracejada.

Se a sigla que você digitou já tem dono na versão, o diálogo mostra **de quem** e se ela é a
**oficial** ou um **sinônimo** dele, antes de salvar. **Tirar de … e adicionar** (ou **salvar**)
passa a sigla para cá a partir desta versão; nas anteriores ela continua com o dono antigo. Quando
ela é a sigla oficial do outro item, marque **Entendi**: ele fica sem sigla nesta versão até você
dar outra.

**Voltar para a versão** (na lista "Saem") mostra as siglas que o item tinha; só as marcadas
voltam com ele.

Cada linha tem o botão **⋯** (ou o botão direito do mouse, com as mesmas ações): **Siglas nesta
versão**, **Adicionar sub-disciplina** (nos cards), **Editar cadastro** e **Tirar da versão**.
Quem só pode editar o cadastro (sem gerir a configuração) vê o lápis direto na linha, sem o ⋯.
**Editar cadastro** (o lápis) mexe só no que vale para todas as versões — nada de sigla ou de
versão:
- **disciplina:** nome (os projetos que já usam o nome seguem junto), categoria, ícone,
  numeração por faixa (quando a versão numera por faixa) e a **Pasta dos arquivos**, que é o
  nome da pasta e o prefixo dos arquivos no servidor. A pasta só pode mudar enquanto **nenhum
  projeto usa** a disciplina; depois disso o campo fica travado e diz quantos projetos usam,
  porque mudar separaria os arquivos em duas pastas;
- **sub-disciplina, fase e tipo:** só o nome.

O botão **Salvar** do lápis só fica ativo depois que algum campo muda.

**Pelas telas de catálogo** (Disciplinas e Lista Mestre) também dá:
- cada disciplina, sub-disciplina e item da Lista Mestre tem **"Vale a partir da / Até a"**;
  cadastro novo já abre na **versão mais nova** — confira antes de salvar, porque "a partir da
  v1" faz o item valer também nos projetos antigos; mudar só essa validade **não mexe nas
  siglas** — se o item sair ("Até a v1") e voltar ("Sem fim"), as siglas voltam como eram;
- disciplina que só existe em versões numeradas por sub não mostra a **faixa de numeração**
  (4000–4999): ela só vale nas versões numeradas por faixa (a v1);
- **Siglas por versão** (ícone de camadas na linha da disciplina, de etiqueta na Lista Mestre):
  trocar a sigla é cadastrar a nova a partir da versão nova; para só **encerrar** uma sigla,
  clique no X e escolha até qual versão ela vale;
- depois que um item ganha siglas por versão, **sigla e sinônimos ficam travados** no lápis
  (a lista mostra "siglas por versão"); salvar o lápis para trocar ícone, nome ou categoria
  não mexe nas siglas.

## Menu de ações e seleção em lote

Em **Usuários** e no **Catálogo de disciplinas**, o botão direito numa linha (ou o botão **⋯**)
abre as ações dela, e a caixa de seleção permite agir em várias de uma vez:

- **Usuários:** desativar, reativar e excluir (só contas desativadas e sem histórico). **Editar** e
  **Reiniciar senha** ficam esmaecidos com mais de um selecionado, porque mostram uma senha
  temporária e só valem para uma pessoa por vez.
- **Catálogo de disciplinas:** arquivar, desarquivar e excluir. Na exclusão em lote, as disciplinas
  que ainda estão em uso em projetos ficam de fora — a confirmação diz quantas —; arquive-as.
  **Mover para cima/baixo** só funciona com a busca vazia.

## Permissões

- A tela é gated em **admin, supervisor, administrativo**. Algumas sub-telas têm gates
  próprios (ex.: parâmetros de licitação podem ser restritos ao admin).

## Funcionalidades relacionadas

- [Permissões e perfis](../quick-start.md#9-perfis-de-acesso-quem-vê-o-quê) · [Folha CLT](../rh-ponto/folha-clt.md) · [Licitações](../gestao/licitacoes.md) · [Comercial](../clientes-comercial/comercial.md)

## FAQ

**Mudei o endereço da empresa. Os recibos já assinados ficam inválidos?** Não. O timbrado
fica fora do texto que o projetista assinou; o código de verificação continua batendo.

**Como reinicio a senha de um usuário?** Em **Configurações → Usuários**.

**Por que não consigo enviar um Aviso geral mesmo sendo supervisor?** O envio de avisos
pode estar restrito ao admin (ver pendência na deliberação da seção).

**Agendei um aviso e a hora passou sem enviar.** O disparo depende do serviço de tarefas do
servidor. Se ele estiver parado, o aviso continua na fila e sai assim que o serviço voltar —
nada é perdido. Verifique também se o envio não foi **cancelado** na aba Agendados.

**Dá para editar um aviso agendado?** Não. **Cancele** e crie outro com o texto corrigido.
