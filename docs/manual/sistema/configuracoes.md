---
titulo: Configurações (administração)
descricao: Central de administração — usuários, permissões, parâmetros de folha, projetos, licitações, funil, avisos e dados da empresa, além do status das integrações.
resumo: Hub administrativo com cadastros e parâmetros do sistema (usuários, permissões, encargos, documentos/inputs padrão, feriados, licitações, funil) e o status das integrações on-premise (SMTP/push).
tags: [configurações, administração, usuários, permissões, encargos, feriados, licitações, funil, avisos, agendamento, integrações, empresa, timbrado]
palavras-chave: [configurações, administração, usuários, permissões, matriz, encargos, inss, irrf, feriados, modalidades, habilitação, funil, aviso geral, agendar aviso, aviso agendado, comunicado programado, smtp, push, dados da empresa, razão social, cnpj, logo, logo da empresa, timbrado, cabeçalho do pdf]
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
