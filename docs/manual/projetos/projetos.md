---
titulo: Projetos
descricao: Cadastro e acompanhamento de projetos, disciplinas, responsáveis, revisões e ciclo de vida.
resumo: Liste e filtre projetos, crie/edite, gerencie disciplinas (com etapas por fase) e seus status, responsáveis, membros, revisões, duplicação e cancelamento/arquivamento.
tags: [projetos, disciplinas, etapas, fase, status, responsáveis, membros, revisões, duplicar, cancelar, arquivar, progresso, nomenclatura versionada, sub-disciplina, receita, parcelas, valor de contrato, copiar eap, faturar entrega]
palavras-chave: [projeto, disciplina, etapa, fase, pagamento por fase, gerar parcelas, receita do projeto, status, em andamento, em revisão, entregue, aprovado, responsável, membro, revisão, duplicar projeto, cancelar projeto, prazo, versão do padrão, trocar de versão, sub-disciplina]
sinonimos: [obras, jobs, contratos de projeto]
---

# Projetos

## Objetivo

Centralizar o cadastro e o acompanhamento dos projetos do escritório: dados do projeto,
disciplinas técnicas, responsáveis, prazos, progresso, revisões e situação.

## Quando utilizar

- Para criar um projeto, acompanhar o andamento das disciplinas e atualizar status.
- Para gerenciar a equipe (membros) e registrar revisões.

## Quando não utilizar

- O **cliente** não usa esta tela; ele acompanha pelo [Portal](../inicio/portal-cliente.md).
- Para o cronograma detalhado (gantt/EAP), use [Planejamento](planejamento.md).

## Como acessar

- Menu → **Projetos** (`/projetos`). Exige a permissão **`projetos:ver`**.
- Perfis disponíveis: admin, supervisor, administrativo, clt, estagiário, projetista_pj,
  freelancer.

## Escopo (quem vê quais projetos)

- **Global** (admin, supervisor ou sócio ativo): vê **todos** os projetos.
- Demais perfis: veem apenas projetos onde são **membros** ou **responsáveis por uma
  disciplina**.

## A lista de projetos

- **Busca** por texto e **filtros**: situação, cliente, responsável, disciplina e
  **"meus projetos"** (onde você é membro).
- **Ordenação** por código, nome, situação ou cliente.
- **Paginação** padrão (12/24/48 por página): o tamanho que você escolhe **fica guardado para aquela lista**.
- O botão **Novo projeto** e as ações de edição aparecem apenas para quem tem
  **`projetos:gerir`**.

## Criar um projeto

1. Clique em **Novo projeto**.
2. Preencha: tipo, **nome**, **cliente**, descrição, área (m²), endereço, **prazo
   final**, valor de contrato.
3. Defina os **membros** da equipe e as **disciplinas** (nome, prazo, valor e
   responsáveis de cada uma).
4. **Salvar**. O sistema gera automaticamente o **código** no formato `AAXXXX`
   (ano + sequencial) e cria os canais de chat do projeto.

> Exige `projetos:gerir`.

## Disciplinas e fluxo de status

Cada disciplina passa por um ciclo de status:

| Status | Significado | Progresso |
| --- | --- | --- |
| Aguardando | Ainda não iniciada | 0% |
| Em andamento | Em execução | 40% |
| Em revisão | Sob revisão | 60% |
| Entregue | Entregue, aguardando validação | 85% |
| Aprovado | Validada (status final) | 100% |

- O **progresso do projeto** é a média desses pesos entre suas disciplinas.
- **Quem altera o status:** gestores (admin/supervisor) **ou** os **responsáveis** pela
  disciplina.
- **Transições para não-gestores** são limitadas: Aguardando→Em andamento; Em
  andamento→Entregue/Em revisão; Em revisão→Em andamento/Entregue; Entregue→Em revisão.
- **Aprovado é terminal** — só é atingido pela **validação da entrega** (não se marca
  "aprovado" manualmente no status).
- Ao marcar **Entregue**, os validadores (admin/supervisor/administrativo) são
  **notificados**. Ao pedir **Em revisão**, os responsáveis são notificados.

### Gerenciar disciplinas (exige `projetos:gerir`)

- **Criar / editar / excluir** disciplina.
- **Adicionar do catálogo** (ignora nomes que já existem no projeto).
- **Editar em massa** (status, prazo e responsável de várias de uma vez).
- **Regras:** o **prazo da disciplina não pode ultrapassar o prazo do projeto**; não é
  possível **excluir** disciplina que já tenha **arquivos enviados** ou **pagamentos
  liberados**.
- **Etapas por fase:** **Etapas e fases…** (no ⋯ ou no botão direito do card) divide o trabalho em fases (Básico,
  Executivo…), cada uma com **prazo, situação e percentual do valor**. Com etapas, o **prazo da
  disciplina** passa a ser o maior prazo entre elas, e aprovar uma fase **libera o pagamento dela**.
  Veja [Etapas da disciplina e pagamento por fase](etapas-e-pagamento-por-fase.md).

## Responsáveis, membros e revisões

- **Responsáveis** por disciplina: definidos por quem tem `projetos:gerir`; ao atribuir,
  a pessoa é notificada.
- **Membros** do projeto: equipe com papel; sincroniza os canais de chat do projeto.
- **Revisões (R0, R1, …):** qualquer **responsável** ou gestor registra uma revisão com
  motivo; os demais responsáveis são notificados.

## Outras ações do projeto

- **Duplicar projeto:** cria uma cópia (`nome (cópia)`, novo código), com disciplinas — inclusive a
  **estrutura de etapas por fase** (fase, percentual e ordem; sem os prazos, a situação nem o
  pagamento das etapas); opcionalmente copia responsáveis, membros, EAP e composição de preço.
  **Nunca** copia arquivos, revisões ou pagamentos.
  - **Copiar a EAP** leva a **estrutura do cronograma**: as tarefas em árvore, o tipo de cada linha
    (marco continua marco), as **durações**, a prioridade, a disciplina (a da cópia), a **fase** e os
    classificadores, e o **tipo e o atraso de cada dependência**. Cada linha ganha um **ID novo**.
    **Não** leva avanço, datas reais, bloqueios, restrições de data (são datas do projeto original) nem
    horas e pessoas — a equipe da cópia é outra decisão; os responsáveis das disciplinas da cópia é que
    descem para as linhas.
  - O **cronograma novo nasce em rascunho**. Informe o **início do cronograma novo** (opcional) e o
    sistema calcula as datas a partir dele; sem data, elas partem das do projeto original — defina o
    início depois, em [Planejamento](planejamento.md) — as datas se recalculam ao salvar.
- **Cancelar / Arquivar:** muda a situação e notifica os membros; o motivo é registrado
  na descrição.
- **Reabrir disciplina aprovada:** exige **motivo** e **novo prazo**. Se o novo prazo
  ultrapassar o prazo planejado do projeto, o planejado desloca junto e o deslocamento fica
  registrado no **Histórico** do projeto. O prazo de contrato não se move por aqui.

## Abas do detalhe do projeto

Ao abrir um projeto, a **Visão Geral** mostra a situação executiva: progresso, prazos,
área, disciplinas entregues, pendências que requerem atenção, última atualização, riscos,
equipe e atividade recente.

- **Riscos em destaque** mostra os três riscos mais graves, com os abertos primeiro. **Ver todos**
  abre a lista inteira; quem gerencia o projeto registra, edita (probabilidade, impacto, situação e
  **plano de mitigação**) e exclui riscos ali. Sem nenhum risco, o botão se chama **Registrar risco**.
- **Acessos relacionados** aparece para quem tem acesso à tela de Acessos e o projeto tem
  credenciais ligadas: mostra cada uma com a situação e o link do portal. A senha não aparece
  aqui; **Abrir o cofre** leva à tela de Acessos.

Todo projeto tem **dois prazos**: o **prazo de contrato** (o combinado com o cliente,
obrigatório no cadastro) e o **prazo planejado** (a meta interna da equipe). Ao criar o
projeto, deixar o planejado em branco faz ele nascer igual ao contrato. A contagem de dias,
a saúde e os alertas seguem o **planejado**; o cliente, no portal, enxerga o **contrato**.
O card de prazos avisa quando o planejado estoura o contrato.

- O progresso é estimado pelos status das disciplinas.
- A **Linha do tempo** usa somente o planejamento cadastrado na EAP. Sem planejamento,
  ela informa que o cronograma ainda não foi cadastrado.
- O total de pendências reúne somente itens abertos aos quais você tem acesso: apontamentos,
  apontamentos de compatibilização, tarefas, solicitações de revisão em aberto e aprovações
  pendentes.
- A tabela **Disciplinas do projeto** é um resumo. Clique em uma disciplina ou em
  **Abrir disciplinas** para acompanhar e trabalhar nos detalhes.

A aba **Resultados** compara as **horas previstas** no cronograma com as **horas apontadas** no ponto, por
disciplina: previsto, apontado, **saldo** (negativo = passou do previsto) e **% consumido**. Clique numa
disciplina para abrir as **tarefas** dela, pelo código da EAP; as horas do ponto que não escolheram uma tarefa do
cronograma aparecem como **Sem tarefa do cronograma**. Filtre por **disciplina** e por **pessoa** (o filtro de
pessoa recorta os dois lados: o que foi previsto para ela e o que ela apontou).

- O **previsto** são as horas das pessoas nas **atividades** do cronograma (horas postas num agrupamento não
  contam). Vaga por perfil entra no total, sem pessoa.
- O **custo em R$** (horas × custo/hora de cada pessoa, cadastrado em **Recursos**) só aparece para quem vê o
  financeiro. Hora sem custo/hora conhecido **não vira zero**: aparece à parte ("+ 6 h sem custo").
- A aba aparece para quem vê o cronograma com datas (as mesmas permissões do Planejamento).

A aba **Disciplinas** concentra o trabalho operacional: status, responsáveis, arquivos,
validações, revisões, tarefas e diário, um card por disciplina.

- **Ordem dos cards:** primeiro o que pede ação — **Aguardando → Em revisão → Em andamento →
  Entregue → Aprovado** — e, dentro de cada status, o **prazo mais próximo** primeiro. O que já
  foi aprovado fica no fim.
- **Filtro e busca:** os botões no topo mostram quantas disciplinas há em cada status e filtram
  a lista; a busca procura pelo nome da disciplina ou do responsável.
- **O card:** o ícone da disciplina e a faixa no topo têm a cor do status. O **status é o
  próprio botão** (ex.: "Entregue ▾"): ele oferece só as mudanças permitidas — **Aprovado** só se
  alcança aprovando a entrega.
- **Próximo passo:** um único aviso diz o que falta ou o que dá para fazer agora, com o botão da
  ação — **Enviar arquivos**, **Ver arquivos** (validar), **Aprovar entrega**, **Aprovar** uma fase,
  **Confirmar/Recusar** (aprovação/laudo), **Definir responsável**.
- **Rodapé:** responsáveis (clique para alterar, se você gere o projeto), etiqueta de pagamento
  ("Pagamento já liberado", "Pago 1 de 3 fases"), valor e os atalhos **Arquivos** (abre a aba
  Arquivos já na pasta da disciplina), **Revisões**, **Tarefas**, **Diário** e o **chat**.
- **Revisões:** lista as **solicitações de revisão** da disciplina e os arquivos com ajuste
  pendente. Cada **Enviar** de apontamentos no visualizador registra uma solicitação, que fica
  **Em aberto** enquanto algum apontamento daquele envio estiver aberto ou em correção e passa a
  **Atendida** quando todos saem da fila. É só consulta: não se cria nem se responde solicitação
  pelo card.
- **Botão direito e ⋯:** o card inteiro responde ao botão direito (toque longo no celular) com as
  mesmas ações do ⋯: mudar status, aprovar, **Entrega e aceite do cliente…** (validação por
  arquivo e link de aceite), responsáveis, etapas, editar, copiar link e excluir. O que você não
  pode fazer não aparece; o que a situação impede aparece apagado, com o motivo.
- **Botão direito no espaço vazio da página:** adicionar disciplina, adicionar do catálogo e
  filtrar por status — as mesmas opções do ⋯ ao lado de **Adicionar disciplina**.

### Organizar a Visão Geral

Em uma tela ampla, use **Personalizar painel** para ajustar a Visão Geral à sua rotina.

- Arraste cada bloco pelo marcador no canto superior direito.
- Para trocar dois blocos, mantenha um sobre o outro até aparecer **Solte para trocar** e então solte.
  Uma passagem rápida não reorganiza o painel, e o sistema só oferece a troca quando os dois tamanhos
  cabem nos respectivos espaços.
- Redimensione o bloco pelo canto inferior direito. O sistema mantém tamanhos mínimos para
  que tabelas, cronograma e indicadores continuem legíveis.
- Clique em **Concluir personalização** quando terminar. As alterações são salvas apenas
  para você e somente naquele projeto; os demais membros continuam com seus próprios painéis.
- Use **Restaurar padrão** para voltar ao arranjo inicial.

No celular, a Visão Geral permanece em uma coluna para leitura. A personalização volta a
ficar disponível ao abrir o projeto em uma tela ampla.

### Horas registradas no projeto

Para **Administrador**, **Coordenador** e **Administrativo**, a Visão Geral mostra o bloco
**Horas registradas no projeto**. Ele reúne os registros dos últimos 7 dias, separados por
dia e pessoa:

- jornadas de colaboradores CLT e estagiários;
- apontamentos de horas de projetistas PJ e freelancers;
- horário de início e fim, ou a indicação **Em andamento** quando o registro ainda está aberto;
- duração de cada registro e o total acumulado em cada dia.

Essa lista é apenas para acompanhamento: ela não altera jornadas nem apontamentos. Quem trabalha
no projeto continua vendo somente o próprio bloco **Ponto no projeto**. Os perfis **TI** e
**Cliente** não veem registros de horas da equipe.

### Resultado financeiro

Quem tem acesso ao financeiro do projeto vê o bloco **Resultado financeiro** quando houver
faturamento confirmado. Além do resumo de faturamento, despesas, rateio de horas e margem
realizada, o card exibe a composição confirmada automaticamente quando está largo o suficiente:

- pagamentos a projetistas;
- serviços terceirizados;
- taxas de ART/RRT (já descontado o que o cliente reembolsou);
- custos extras;
- rateio de horas de CLT e estagiários;
- rateio dos demais colaboradores.

Em um card menor, o resumo permanece compacto. Use **Ver detalhamento financeiro** para consultar
os valores previstos e a análise completa.

Além disso, há abas para: **Serviços**, **Arquivos**, **Financeiro** (veja abaixo) e
**Inputs** (formulários de start). As demais serão detalhadas em suas próprias páginas do manual.

### Aba Financeiro: receita e contrato

Exige acesso ao financeiro (`financeiro:ver` ou sócio). O card **Receita / Contrato** mostra o
**valor de contrato** (com o atalho **Usar composição**, que adota o total da composição de preço), o
**contratado**, o **faturado (previsto)**, o **recebido**, **quanto falta faturar** e a lista de parcelas.

- **Gerar parcelas** cria as receitas **previstas** do projeto: informe o valor total, o número de
  parcelas, o intervalo em meses e a data da primeira. Gerar de novo **substitui as previstas**; as
  **recebidas** ficam. **Limpar previstas** remove só as previstas.
- **O contrato do Jurídico manda na cobrança.** Se o projeto tem um contrato de cliente
  **cobrado por entrega** em vigor (não rescindido), **Gerar parcelas fica desabilitado** e o card
  explica: as parcelas e a previsão de recebimento saem do contrato
  ([Contrato por entrega](../financeiro/contrato-por-entrega.md)), e gerar aqui cobraria em dobro. Com
  contrato **por data** que já tem plano de parcelas, o card só **avisa** para conferir antes de gerar.
- **Faturar por entrega** é a alternativa às parcelas: cada disciplina traz o valor **da proposta**
  (o item dela, quando existe) e o botão **Faturar** abre a confirmação, onde você **confere ou digita o
  valor a cobrar do cliente**. Ele cria uma receita prevista com esse valor — que **não** é o valor da
  disciplina, aquele que se paga ao projetista. A mesma disciplina não é faturada duas vezes, e com
  contrato **por entrega** em vigor a lista **não aparece** (a cobrança é do contrato).
- Gerar, limpar parcelas e faturar entregas exigem `financeiro:gerir`; o valor de contrato,
  `projetos:gerir`.

Logo abaixo, o card **Composição de preço** guarda a memória de cálculo do valor do projeto:
descrição, quantidade e valor unitário de cada item, com o total. Com itens, o total passa a ser
a referência de receita do card **Receita / Contrato** (no lugar do valor de contrato). Editar e
**Salvar** exigem `projetos:gerir`; quem só vê o financeiro enxerga a tabela sem editar.

### Pastas da aba Arquivos

O painel da esquerda é uma árvore: **disciplina → fase → formato** (PDF, DWG, IFC… e a pasta
**Outros**). Não são pastas de verdade no servidor — é a mesma organização vista como pastas —, e
só aparece pasta que tem arquivo. O número ao lado de cada pasta conta **documentos**; um
documento com PDF e DWG conta nas duas pastas de formato, então somar as pastas pode passar do
total da fase. Os formatos contam a **revisão vigente**: um DWG que só existiu numa revisão
antiga não cria a pasta DWG.

**A lista funciona como o Google Drive.** Cada nível mostra só o que está dentro dele, com as
pastas no topo — clique numa pasta para entrar (a árvore da esquerda acompanha):

- **Todos os documentos:** as pastas das disciplinas e, depois delas, as **pastas do cliente**
  (**Compartilhado** e **Liberado para obra**, veja abaixo) e as áreas do projeto (Recebidos do cliente,
  Base Arquitetônica, Geral, ARTs). As áreas já abrem **abertas** na página delas.
  **Recebidos do cliente**, **Base Arquitetônica** e **Geral** são **tabelas**: nome (com a versão e o histórico
  de versões), tamanho, data e quem enviou, mais o botão de visualizar (PDF/DWG) e o **...** — o mesmo menu abre
  com o botão direito. Arraste arquivos para a tabela para enviar. No menu: **Baixar**, **Enviar nova versão** e
  **Excluir** (com confirmação, e a versão antiga se exclui sozinha, na linha dela); no **Geral**, também
  **Editar nome, categoria e descrição** e **Exibir também em Recebidos do cliente**. Um documento do Geral
  que aparece em Recebidos só se baixa ali — quem o gere é a pasta Geral.
- **Disciplina:** as pastas das fases e, soltos, os documentos que ainda não têm fase.
- **Fase:** as pastas dos formatos (PDF, DWG…).
- **Formato:** as pranchas, cada uma **só com o arquivo daquele formato** — na pasta PDF, abrir,
  baixar e marcar várias para baixar em .zip pega só os PDFs; na pasta DWG, só os DWGs.

Acima da lista, o caminho (**Todos os documentos › Estrutural › EX › PDF**) volta a qualquer
nível. Cada pasta tem o ícone de download, que baixa **a pasta inteira em .zip** com as
subpastas dentro (a da pasta PDF leva só PDFs); o mesmo está no **botão direito** e no **⋯** da
pasta, junto com abrir em nova aba e copiar o link. Com **busca ou filtro** ativo a lista vira
resultado de pesquisa: todos os documentos que casam, sem pastas.

O cliente vê as mesmas pastas no link público e pode baixar em .zip qualquer nível: formato,
fase, disciplina ou o projeto inteiro.

### Diretório geral (menu Arquivos)

O item **Arquivos** do menu é a mesma tela da aba **Arquivos** do projeto, com dois níveis a mais
em cima: **Todos os projetos → ano → projeto**. Na raiz aparecem os anos; num ano, os projetos
dele; dentro de um projeto, exatamente o que a aba do projeto mostra — disciplinas e áreas,
fases, formatos e pranchas, com a mesma barra, os mesmos filtros e as mesmas ações (validar,
enviar, excluir, listas, link público), cada uma liberada pelas mesmas permissões da aba. O
cliente não vira pasta: o código do projeto já traz o ano, e é por projeto que se trabalha.

A árvore da esquerda mostra os anos e os projetos; o projeto aberto se desdobra nas pastas dele.
O caminho acima da lista (**Todos os projetos › 2026 › 260004 · Galpão › Estrutural**) volta a
qualquer nível. O .zip de cada pasta leva a **revisão vigente** de cada prancha, como na aba.

Acima do projeto, a busca procura em **todos** os projetos (ou nos do ano aberto) e mostra o
resultado em lista corrida, com o projeto de cada documento.

### Lista Mestre (aba Arquivos)

A Lista Mestre deixou de ser uma aba com cadastro de folhas: hoje ela é **gerada** a partir
do que já foi entregue. Na aba **Arquivos**, em **Gerar Lista Mestre**, escolha a
disciplina; o sistema lista os documentos com arquivo **validado** (número, título, fase,
tipo, folha, revisão e formatos), mostra a prévia e salva o resultado na própria disciplina
como documento do tipo Lista Mestre — PDF com timbrado e planilha, na mesma revisão. Gerar
de novo cria a revisão seguinte do mesmo documento.

Nada aparece na lista enquanto ninguém validar os arquivos, e a própria Lista Mestre nunca
se lista.

Os dois arquivos gerados já nascem **validados**, em seu nome — a lista só enumera documentos
que você mesmo validou, e é a validação que decide o que aparece no link público do cliente.
Quem não tem permissão de validar consegue gerar do mesmo jeito, mas a lista fica pendente até
alguém validá-la na aba Arquivos.

### Padrão de nomenclatura do projeto (botão Nomenclatura, aba Arquivos)

O padrão de nomenclatura é **versionado**: o escritório publica versões em
**Configurações → Disciplinas e nomenclatura** (v1, v2…), e cada projeto segue uma delas. Uma versão
publicada é **fixa** — corrigi-la significa publicar uma versão nova, nunca editar a que já
está em uso. Um projeto **novo** recebe automaticamente a versão vigente na data em que é
criado; publicar uma versão nova **não muda** projeto nenhum que já existe.

No botão **Nomenclatura**, ao lado de "Enviar documentos", a seção **Padrão de
nomenclatura** mostra botões — **v1**, **v2**… e **Personalizado** — com o vigente
destacado. Trocar de versão mostra antes quantos documentos já enviados ficariam marcados
como "fora do padrão" com o novo modelo (nenhum arquivo é renomeado — é só o alerta que
muda) e pede confirmação.

Escolher **Personalizado** abre o mesmo **editor visual** de sempre, por blocos (Projeto,
Disciplina, Fase, Número, Tipo, Revisão, e também **texto fixo** como "SENA"): clique para
adicionar ou remover um bloco, use as setas para reordenar, marque **opcional** o que não é
sempre exigido, e escolha o separador. Uma prévia mostra como um nome ficaria. Nenhuma
sintaxe de regex é necessária — um padrão que o editor visual não consegue representar abre
em **modo avançado** (texto), e continua funcionando do mesmo jeito.

No mesmo diálogo ficam as **siglas deste projeto** (fases, tipos e folhas que valem só
aqui, somadas às globais). Quem não tem permissão de Configurações enxerga o padrão e as
siglas em vigor, mas não edita.

As versões, as sub-disciplinas de cada card (a etiqueta de documento dentro de uma
disciplina, como Água Fria dentro de Hidrossanitário) e as siglas de cada versão são
cadastradas em **Configurações → Disciplinas e nomenclatura** — sempre pela tela, sem precisar de ajuste no banco a cada
mudança de padrão da gestão.

### Taxa de ART no financeiro (aba ARTs)

A taxa da ART/RRT é custo direto do projeto. Ao cadastrar ou editar a ART, informe a
**Taxa (R$)** e **Quem paga a taxa**:

| Quem paga | O que o sistema lança no Financeiro |
|---|---|
| **Empresa** | A taxa em **contas a pagar**, ligada ao projeto. |
| **Empresa, com reembolso do cliente** | A taxa em contas a pagar e o reembolso em **contas a receber**. Na margem do projeto, o reembolso abate o custo da taxa. |
| **Cliente paga direto** | Nada — a taxa não é custo do projeto. |

- ART em **rascunho** ainda não gera lançamento; **cancelar** a ART cancela a taxa ainda
  não paga.
- O pagamento é feito no Financeiro, baixando o lançamento normalmente. Na lista de ARTs
  aparece se a taxa está *a pagar* ou *paga*.
- Os lançamentos da taxa não podem ser cancelados ou excluídos pelo Financeiro — mude pela
  aba ARTs. Depois de baixada, a taxa não muda mais de valor, e a ART não pode ser
  excluída (cancele-a).
- **Não lance a taxa da ART à mão no Financeiro**: ela seria contada duas vezes.

### Link do formulário para o cliente (aba Inputs)

No topo da aba **Inputs**, o cartão **Formulário do cliente** gera um link público que
abre o briefing de start **e** as perguntas extras — o cliente preenche **sem login e sem
cadastro**, e as respostas caem direto nesta aba (salvam sozinhas, campo a campo).

- **Gerar link público** cria o endereço; **Copiar**/**Abrir** ficam ao lado dele.
- **Link ativo** desligado **revoga na hora**; **Expira em** desliga o link na data
  escolhida (vazio = não expira). Depois disso o cliente vê "Link indisponível".
- **Regerar link** troca o endereço e invalida o anterior — use se o link vazou.
- Quando o cliente preenche, a gestão recebe notificação (uma por janela de 6 h, mais um
  aviso quando o briefing fica completo). Para não receber, desligue **Formulário
  preenchido pelo cliente** em *Preferências → Notificações*.

### Colunas e filtros da tabela de arquivos (aba Arquivos)

A tabela mostra um DOCUMENTO por linha (não um arquivo — quando o PDF e o DWG de uma mesma
prancha são enviados, eles aparecem como badges dentro da mesma linha). O botão **Colunas**,
no canto da tabela, escolhe quais colunas ficam visíveis; a preferência é sua e vale em
qualquer projeto:

- **Nº** e **Tipo** — número da prancha e tipo de documento (planta, detalhe, memorial...),
  lidos automaticamente do nome do arquivo no envio ou preenchidos à mão depois;
- **Fase** — Anteprojeto, Projeto Básico, Executivo etc., mesma origem do Nº/Tipo;
- **Papel** — tamanho da folha (A0 a A4), lido sozinho da 1ª página de todo PDF enviado
  (nenhuma ação sua é necessária; documento sem PDF, ou com PDF fora desses tamanhos, fica
  sem papel);
- **Extensões** — um badge por arquivo (PDF, DWG...), clicável para abrir ou baixar.

Um documento cujo nome não bate com nada reconhecível fica com "—" nessas colunas: o sistema
nunca inventa um valor, só mostra o que conseguiu ler com segurança.

**Selo "Backup"** — arquivo de backup do software (backup do modelo, pacote B, ou extensão
de backup como `.qibzip`/`.tqs` mesmo fora do pacote B) ganha um selo **Backup** ao lado do
nome, para não ser confundido com entregável. O filtro **Pacote**, no painel de filtros,
tem uma opção **Backup** que junta os dois casos numa busca só — é o jeito de achar aquele
backup do AltoQi que "sumiu" (na verdade sempre esteve lá, só sem rótulo).

O painel de **Filtros** também tem **Tipo**, **Tamanho do papel** e **Categoria de extensão**
(agrupa por Documento, Planilha, Desenho CAD, Modelo BIM, Backup de software etc.) — todos
combináveis com busca, extensão específica, responsável, período, validação, fase e status.

### Links públicos de arquivos (aba Arquivos)

No topo da aba **Arquivos**, o botão **Link público** abre o gerenciador. Um projeto pode
ter **vários links** ao mesmo tempo — um para o cliente, outro para a prefeitura, outro
para um consultor — cada um com o seu nome, a sua validade e o seu recorte. Revogar um
não derruba os outros. Quem acessa não faz login: só vê e baixa.

**O que cada tipo de link mostra:**

| Tipo | Mostra |
| --- | --- |
| Disciplinas escolhidas | Só as disciplinas marcadas |
| Projeto inteiro | Todas as disciplinas, inclusive as criadas depois do link |
| Arquivos escolhidos | Exatamente os arquivos que você marcou na tabela |

Nos dois primeiros tipos há ainda o campo **Fases liberadas**: marque só o **Básico** para a
prefeitura e só o **Executivo** para o cliente — dois links do mesmo projeto. Sem nenhuma fase marcada,
vale **todas as fases**. Documentos **sem fase** só entram se você marcar **Incluir documentos sem
fase** (sem fase não dá para saber se é Básico ou Executivo). **Separar por fase** faz o cliente ver
disciplina → fase → formato.

**Nos dois primeiros tipos, o link mostra apenas a entrega corrente.** Ficam de fora:

- as **revisões anteriores** — de cada documento sai só a última;
- o **backup do modelo** (pacote B), que é arquivo de software, não entrega;
- tudo o que está na **lixeira**;
- tudo o que ainda **não foi validado** — enviar não basta, é preciso aprovar.

Se o cliente diz que o link está vazio, quase sempre a causa é a última: os arquivos
foram enviados mas ninguém validou.

**Para mandar algo fora dessas regras** — uma revisão antiga, um backup — marque os
arquivos na tabela e use **Link público** na barra de seleção que aparece embaixo. Esse
link mostra exatamente o que foi marcado. Só a lixeira continua valendo: arquivo na
lixeira é apagado de vez em 30 dias e deixaria o link quebrado na mão do cliente.

**Em cada link você pode:** copiar ou abrir o endereço, enviar por e-mail ao cliente
(quem não tem cadastro recebe junto um convite), dar um nome, definir validade,
**desligar** para revogar na hora, **trocar o endereço** (invalida o anterior — use se o
link vazou) ou **apagar** de vez.

As **ARTs** continuam saindo com o histórico completo de versões: são documento legal e o
cliente precisa da série inteira.

**Pastas Compartilhado e Liberado para obra (um link só).** Um link novo já nasce com essa opção ligada
(dá para ligar ou desligar em cada link, no gerenciador): o cliente vê **duas pastas** no mesmo endereço —
**Compartilhado** (o que foi enviado para a análise dele) e **Liberado para obra** —, cada uma com
disciplina → fase → formato, e não mais "a última revisão validada de tudo". Um endereço só, de propósito:
dois links confundiriam o cliente. O download de cada arquivo e o .zip seguem **a mesma regra** da página,
então uma revisão tirada da pasta deixa de abrir mesmo para quem guardou o endereço. Links que já existiam
continuam como eram até você ligar a opção neles.

**Documento Obsoleto ou Arquivado não aparece em link nenhum** (de disciplinas ou do projeto inteiro): ele foi
aposentado, e o cliente não pode seguir baixando como se valesse.

### Ciclo da revisão: em andamento, em análise, publicado, arquivado (aba Arquivos)

As pranchas, memoriais e modelos IFC do projeto (o "pacote A") seguem o ciclo de vida da **ISO 19650**. Quem tem um
estado é cada **revisão** (R00, R01…), não o documento, e ela está sempre em um destes quatro:

| Estado | O que quer dizer |
|---|---|
| **Em andamento** | O projetista está trabalhando. Toda revisão nova nasce aqui. |
| **Em análise** | Foi enviada para a coordenação conferir (na ISO, *Shared*). |
| **Publicado** | Aprovada pela coordenação/RT. Não volta: correção vira **nova revisão**. |
| **Arquivado** | Substituída por uma revisão mais nova, ou cancelada. Só leitura. |

O estado aparece na coluna **Status** da tabela. A coluna **Revisão** mostra também a **versão interna**
(ex.: **R01 · v3**).

**Versão × revisão.** Enquanto a revisão está **em andamento**, cada envio é uma **versão** nova dela
(v1, v2, v3…), um ajuste interno. Se você reenviar o PDF, o anterior sai da lista e fica no **Histórico de
revisões**, com download. A **revisão** é a etapa que vai para análise e para o cliente: a R02 só nasce
depois que a R01 foi publicada. Com a revisão **em análise**, o envio de arquivo é recusado até a
coordenação devolver ou publicar.

**Os passos (botão direito ou ⋯ da linha):**

- **Enviar para análise** — o sistema confere sozinho e só deixa passar com tudo certo: nome no padrão do
  projeto, disciplina/etapa/tipo existentes no catálogo, código do projeto, PDF presente, nenhum arquivo
  igual ao da revisão anterior, a **descrição do que mudou** (obrigatória da R01 em diante) e o
  **carimbo do PDF**: o código e a revisão escritos no carimbo têm de bater com o nome do arquivo e com a
  revisão esperada. Se o carimbo não puder ser lido (PDF sem texto), o sistema avisa e pede que você
  confirme o envio; fica registrado no histórico. O modelo IFC é um documento próprio e dispensa o PDF. Se
  algo falhar, a mensagem lista o que corrigir.
- **Pagamento do projetista** — sai quando a gestão **aprova a disciplina** (ou a fase), e isso só é
  possível com todos os documentos **publicados**.
- **Devolver para ajustes** — com motivo; o projetista é avisado.
- **Publicar** — só com todos os arquivos **validados**, com o **DWG** junto do PDF (quando o tipo de
  documento exige — configurado em Configurações → Nomenclatura → Tipos; o padrão é exigir) e sem
  apontamento **impeditivo** em aberto. A validação do arquivo também só é barrada
  por apontamento impeditivo. Outros
  apontamentos em aberto também impedem, a menos que o projeto permita publicar assim: aí você escreve uma
  justificativa e a revisão ganha uma **restrição** que sai sozinha quando os apontamentos forem
  resolvidos. Ao publicar, a revisão anterior é **arquivada** e perde a liberação para obra.
- **Arquivar** — para documento cancelado ou obsoleto, com motivo.

**Controles** aparecem como etiquetas ao lado do estado (passe o mouse para ver o motivo):

- **Liberado para obra** e **Enviado ao cliente** — só em revisão publicada. São eles que põem o documento
  nas pastas **Liberado para obra** e **Compartilhado** do link do cliente. Quem já estava enviado ao
  cliente continua: ao publicar a revisão nova, o envio passa para ela sozinho. A liberação para obra pode
  ser automática na publicação, se o projeto ligar essa opção.
- **Bloqueado** — impede baixar, atualizar ou excluir (você escolhe) e também impede mudar o estado.
- **Com restrição** — a revisão não pode ser liberada para obra enquanto a restrição existir.

Revisão **publicada** ou **arquivada** não vai para a lixeira: só um administrador, informando o motivo.
O selo **Novo** marca a revisão que outra pessoa enviou e você ainda não abriu.

Toda mudança de estado e todo controle aplicado ou removido fica no **Histórico** do documento, com quem
fez e o motivo ("automático" quando foi o sistema). Os administradores configuram o ciclo de cada projeto
pelo **⋯ → Ciclo dos documentos** da barra de Arquivos: liberar para obra ao publicar, permitir publicar
com apontamentos e o prazo para avisar de revisão parada em análise.

> Backup do modelo (pacote B) e as pastas (Aprovação, Laudo, Recebidos, Geral…) ficam fora do ciclo e
> funcionam como antes.

### Histórico de cada documento (aba Arquivos)

Clique no ícone **ⓘ** da linha (ou em **Detalhes do documento**, no botão direito) para abrir o painel de
detalhes. Clicar no nome abre o arquivo no visualizador. No fim do painel,
a seção **Histórico** mostra tudo o que aconteceu com ele, do mais recente para o mais antigo:

- **Alterações** — envio de arquivos, revisões e versões, mudança de estado da revisão e de controles,
  mudança de fase, título
  ou descrição (com o valor antes e depois), validação, ajuste solicitado, apontamentos
  enviados, renomeação, lixeira, pedidos de exclusão, link de aceite do cliente e listas.
- **Acessos** — quem **baixou** e quem **visualizou** cada arquivo (no visualizador de PDF,
  DWG ou BIM), inclusive o cliente pelo **link público**, identificado pelo nome do link.

Todos que enxergam o documento veem as alterações. **Downloads e visualizações só aparecem
para quem tem a permissão `arquivos:ver_acessos`** (por padrão, administradores,
coordenadores e administrativo), com os filtros **Tudo / Alterações / Acessos**.

Aberturas repetidas da mesma pessoa, no mesmo arquivo, em até 10 minutos aparecem como uma
linha só, com a contagem (ex.: **3×**). O histórico continua disponível mesmo depois que um
arquivo é excluído em definitivo.

### Menu de ações do documento (botão direito, aba Arquivos)

Clique com o **botão direito** em uma linha da tabela de documentos — ou **toque e segure**
em um cartão, no celular — para abrir as ações do documento. O botão **⋯** no fim da linha
abre exatamente as mesmas ações, e é o caminho para quem usa o teclado.

- **Visualizar em nova aba** e **Comparar revisões** — o primeiro para documentos com PDF;
  comparar só aparece a partir da 2ª revisão.
- **Enviar para análise**, **Publicar**, **Devolver**, **Liberar para obra**, **Enviar ao cliente**,
  **Bloquear**, **Aplicar restrição** e a remoção de cada um — conforme o estado da revisão e o que
  você pode fazer (veja "Ciclo da revisão" acima).
- **Baixar**, **Copiar link** e **Copiar nome**.
- **Histórico de revisões**.
- **Validar**, **Desfazer validação** e **Solicitar ajuste**.
- **Renomear**.
- **Excluir** (que pergunta se vai só este arquivo ou o documento inteiro) ou **Solicitar
  exclusão**, para quem não pode excluir direto.

Cada pessoa vê só o que pode fazer: quem não valida não vê os itens de validação, por
exemplo.

Quando o documento tem mais de um arquivo (o PDF e o DWG da mesma prancha), **Baixar** e
**Copiar link** abrem uma lista com um item por arquivo.

O menu age **apenas na linha em que você clicou** — os documentos marcados nas caixas de
seleção não mudam. Para agir em vários de uma vez, continue usando a barra que aparece ao
selecionar.

> **Copiar link** copia o endereço do arquivo dentro do sistema: quem abrir precisa estar
> logado e ter acesso ao projeto. Para mandar arquivos ao cliente, use os
> [links públicos](#links-públicos-de-arquivos-aba-arquivos).

No diretório geral (menu **Arquivos**) o botão direito funciona igual, dentro de cada projeto.

### Zoom e rabisco no visualizador de pranchas

**A tela é da prancha.** Ao abrir uma prancha, o cabeçalho e as abas do projeto saem de cena (volte
por **← Arquivos**, que leva de volta **à mesma pasta, filtro e página** em que você estava; andar entre
pranchas pelas setas não empilha histórico, então o **Voltar** do navegador também sai do visualizador) e o visualizador ocupa exatamente a altura da janela — a página não rola, só a
prancha. Os painéis **Tarefas do documento** (à esquerda) e **Detalhes do apontamento** (à direita)
vão do topo ao fim da tela; o nome do arquivo, a revisão, a situação e a barra de ferramentas ficam
só em cima da prancha, entre os dois. Os painéis começam fechados quando a prancha não tem
apontamento (abrem clicando na faixa da borda, que mostra o nome do painel em pé e quantos
apontamentos há) e se abrem sozinhos ao criar o primeiro.

**Barra de ferramentas só com ícones.** Pare o mouse sobre um botão (ou chegue nele com Tab) para
ver o nome, a tecla de atalho e o que ele faz. À esquerda: o arquivo desta revisão (e as outras
extensões) e a **busca** (lupa, ou **Ctrl+F**). No centro, sobre o meio da prancha: as
**pranchas**, o zoom, girar, tela cheia e comparar revisões. À direita: validar a prancha e, para
quem aponta, a paleta de ferramentas
— **mão** (navegar, **Esc**), **pino** (1), **retângulo** (2), **seta** (3), **nuvem** (4),
**medida** (5) e **rabisco** (6) —, a escala da página (compasso), quantos apontamentos estão em
rascunho e **Enviar**. A tecla **A** liga e desliga o modo apontar. **Enviar** cria a tarefa dos
ajustes e registra uma **solicitação de revisão** no card da disciplina (botão **Revisões**).

**Pranchas do projeto.** As setas levam à prancha anterior e à seguinte; o botão do meio
(**1/4**) abre a lista dos PDFs do projeto que você pode abrir, por disciplina, com o **número** e
o **título** de cada prancha. Digite para filtrar (número, título ou nome do arquivo) e **Enter**
abre a primeira que sobrou. Por padrão a lista e as setas ficam na **etapa** da prancha aberta
(Executivo, Básico…); **Projeto inteiro** mostra todas — a escolha fica lembrada no navegador.
Quem só atua em algumas disciplinas vê só as pranchas delas. A lista traz a revisão vigente de cada
prancha: aberta uma revisão anterior, a posição e as setas seguem a vigente, marcada como
"versão vigente desta prancha".

**Botão direito na prancha.** Abre as mesmas ferramentas da barra: **Novo apontamento aqui**
(pino exatamente onde você clicou), zoom (aproxima no ponto clicado), ajustar à largura, girar,
tela cheia, buscar, a troca de ferramenta, a escala da página e, com texto selecionado, **Copiar
texto**. Com rabisco ou medidas em andamento, **Concluir**, **Desfazer** e **Descartar** aparecem
no topo. No toque, é o toque longo — exceto com uma ferramenta de desenho na mão, para não abrir o
menu no meio do traço.

**Botão direito na bolinha do apontamento.** Mostra as ações daquele apontamento — responder,
editar, assumir, resolver, não procede, adiar, classificar, replicar, excluir —, as mesmas do
painel de detalhes. O que o seu perfil não pode fazer não aparece; o que a situação impede aparece
apagado, com o motivo (por exemplo, editar depois de virar tarefa). **Excluir** pede confirmação.
No painel, parar o mouse sobre cada ação mostra o que ela faz.

**Tela cheia.** Janelas, menus e dicas também funcionam em tela cheia (antes, a janela de novo
apontamento abria escondida atrás da prancha).

**Zoom até 2000%.** Clique no **número da %** para escolher direto um zoom pronto (de 50% a 2000%;
100% é a prancha na largura da tela), sem precisar subir de passo em passo. Os botões **−**/**+**
andam em degraus (100%, 125%… 500%, 600%, 800%, 1000%, 1200%, 1600%, 2000%). **Ctrl + roda do mouse** (ou a pinça com dois dedos, no tablet) aproxima
mantendo parado o ponto que está sob o cursor, então a planta não "foge" a cada passo. Com zoom
alto, o trecho que está na tela é desenhado em resolução cheia logo depois de você parar de
arrastar: por um instante ele pode aparecer borrado e em seguida fica nítido. O mesmo vale para o
visualizador de PDF dos Recebidos, do Geral e dos documentos de RH.

**Rabisco (desenho livre) nos apontamentos.** Para indicar a solução direto na planta:

1. Escolha **Rabisco** na paleta de ferramentas (atalho: tecla **6**).
2. Na faixa da dica, escolha a **cor** (vermelho, azul, verde, laranja, preto ou a cor da situação
   do apontamento) e a **espessura** (fina, média ou grossa). Dá para trocar entre um traço e outro;
   a última escolha fica lembrada no navegador.
3. Desenhe na prancha com o mouse, a caneta ou o dedo. Pode fazer quantos traços quiser na mesma
   página. A faixa acima da prancha mostra quantos traços já tem.
4. **Desfazer** (ou **Ctrl+Z**) apaga o último traço; **Descartar** (ou **Esc**) apaga o desenho
   todo.
5. Clique em **Concluir** (ou **Enter**) para abrir a janela do apontamento, descreva e crie.
   Cancelar a janela não perde o desenho: ele continua na tela para você ajustar.

O rabisco aparece na prancha, na miniatura da lista e no **PDF carimbado** com as cores e espessuras
escolhidas. Traço na "cor da situação" muda de cor junto com o apontamento (aberto, fechado…). O
desenho é de uma página só: para rabiscar em outra página, conclua ou descarte o atual primeiro.

**Medidas (várias no mesmo apontamento).** Com a página calibrada (botão da escala, o compasso ao
lado da paleta), escolha **Medida** (tecla **5**) e **arraste** sobre o que quer medir — ou **clique
no início e depois no fim**: depois do primeiro clique a linha segue o cursor, e **Esc** desiste só
dela. O valor aparece **enquanto a linha se move**. Cada medida soma no mesmo apontamento, em
qualquer zoom (até em 2000% uma medida curta conta); a faixa acima da prancha lista os valores.
**Desfazer** (Ctrl+Z) tira a última, e **Concluir** (Enter) abre a janela com as medidas já escritas
no texto ("Medidas: 3,53 m; 7,06 m."). Os valores ficam congelados com a escala do momento, e cada
medida aparece com o seu valor na prancha, no PDF carimbado e no relatório em planilha. Arrastar
numa página sem escala abre a calibração.

## Permissões (resumo)

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `projetos:ver` |
| Criar/editar projeto, disciplinas, etapas por fase, membros | `projetos:gerir` |
| Aprovar uma fase (libera o pagamento dela) | `aprovacoes:disciplina` |
| Alterar status / registrar revisão | Responsável da disciplina **ou** gestor |
| Ver downloads e visualizações no histórico do documento | `arquivos:ver_acessos` |
| Ver a aba **Resultados** (previsto × apontado) | `planejamento:gerir`, `cronograma:ver`, `cronograma:executado` ou `cronograma:aprovar` |
| Ver o custo em R$ na aba Resultados | acesso ao financeiro (`financeiro:ver` ou sócio) |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Transição de X para Y não permitida." | Fluxo de status restrito a não-gestores | Seguir a sequência válida ou pedir a um gestor |
| "Status 'aprovado' só pode ser definido via validação de entrega." | Tentativa de marcar aprovado direto | Validar a entrega |
| "Não é possível excluir uma disciplina com arquivos/pagamentos." | Disciplina com vínculos | Remover vínculos antes ou manter a disciplina |
| "O prazo da disciplina não pode ultrapassar o prazo do projeto." | Prazo inválido | Ajustar o prazo |
| Não vejo "Novo projeto" | Falta `projetos:gerir` | Solicitar permissão |

## Funcionalidades relacionadas

- [Meu trabalho](meu-trabalho.md) · [Planejamento](planejamento.md) · [Tarefas](tarefas.md) ·
  [Etapas e pagamento por fase](etapas-e-pagamento-por-fase.md)
- [Clientes](../clientes-comercial/README.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Como o código do projeto é gerado?** Automaticamente, no formato `AAXXXX` (ano +
sequencial).

**Por que não consigo aprovar uma disciplina?** "Aprovado" só vem da validação da
entrega — não é uma troca manual de status.
