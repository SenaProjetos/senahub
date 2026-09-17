---
titulo: Projetos
descricao: Cadastro e acompanhamento de projetos, disciplinas, responsáveis, revisões e ciclo de vida.
resumo: Liste e filtre projetos, crie/edite, gerencie disciplinas e seus status, responsáveis, membros, revisões, duplicação e cancelamento/arquivamento.
tags: [projetos, disciplinas, status, responsáveis, membros, revisões, duplicar, cancelar, arquivar, progresso]
palavras-chave: [projeto, disciplina, status, em andamento, em revisão, entregue, aprovado, responsável, membro, revisão, duplicar projeto, cancelar projeto, prazo]
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
- **Paginação** padrão (12/24/48 por página).
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

## Responsáveis, membros e revisões

- **Responsáveis** por disciplina: definidos por quem tem `projetos:gerir`; ao atribuir,
  a pessoa é notificada.
- **Membros** do projeto: equipe com papel; sincroniza os canais de chat do projeto.
- **Revisões (R0, R1, …):** qualquer **responsável** ou gestor registra uma revisão com
  motivo; os demais responsáveis são notificados.

## Outras ações do projeto

- **Duplicar projeto:** cria uma cópia (`nome (cópia)`, novo código), com disciplinas;
  opcionalmente copia responsáveis, membros, EAP e composição de preço. **Nunca** copia
  arquivos, revisões ou pagamentos.
- **Cancelar / Arquivar:** muda a situação e notifica os membros; o motivo é registrado
  na descrição.
- **Reabrir disciplina aprovada:** exige **motivo** e **novo prazo**. Se o novo prazo
  ultrapassar o prazo planejado do projeto, o planejado desloca junto e o deslocamento fica
  registrado no **Histórico** do projeto. O prazo de contrato não se move por aqui.

## Abas do detalhe do projeto

Ao abrir um projeto, a **Visão Geral** mostra a situação executiva: progresso, prazos,
área, disciplinas entregues, pendências que requerem atenção, última atualização, riscos,
equipe e atividade recente.

Todo projeto tem **dois prazos**: o **prazo de contrato** (o combinado com o cliente,
obrigatório no cadastro) e o **prazo planejado** (a meta interna da equipe). Ao criar o
projeto, deixar o planejado em branco faz ele nascer igual ao contrato. A contagem de dias,
a saúde e os alertas seguem o **planejado**; o cliente, no portal, enxerga o **contrato**.
O card de prazos avisa quando o planejado estoura o contrato.

- O progresso é estimado pelos status das disciplinas.
- A **Linha do tempo** usa somente o planejamento cadastrado na EAP. Sem planejamento,
  ela informa que o cronograma ainda não foi cadastrado.
- O total de pendências reúne somente itens abertos aos quais você tem acesso: apontamentos,
  apontamentos de compatibilização, tarefas, solicitações de revisão e aprovações pendentes.
- A tabela **Disciplinas do projeto** é um resumo. Clique em uma disciplina ou em
  **Abrir disciplinas** para acompanhar e trabalhar nos detalhes.

A aba **Disciplinas** concentra o trabalho operacional: kanban, alteração de status,
responsáveis, arquivos, validações, revisões, tarefas e diário. Ela preserva todas as ações
do acompanhamento detalhado em uma área própria.

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

Além disso, há abas para: **Serviços**, **Arquivos**, **Extras**, **Financeiro** e
**Inputs** (formulários de start). Cada uma será detalhada em sua própria página do manual.

### Pastas da aba Arquivos

O painel da esquerda é uma árvore: **disciplina → fase → formato** (PDF, DWG, IFC… e a pasta
**Outros**). Não são pastas de verdade no servidor — clicar num nó filtra a lista ao lado —, e
só aparece pasta que tem arquivo. O número ao lado de cada pasta conta **documentos**; um
documento com PDF e DWG conta nas duas pastas de formato, então somar as pastas pode passar do
total da fase.

Arquivo cujo documento ainda não tem fase cai em **Sem fase**.

O cliente vê as mesmas pastas no link público e pode baixar em .zip qualquer nível: formato,
fase, disciplina ou o projeto inteiro.

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

No botão **Nomenclatura**, ao lado de "Enviar documentos", a seção **Padrão de
nomenclatura** mostra
se o projeto usa o padrão global (o do escritório) ou tem um **padrão próprio** — a etiqueta
ao lado do título já denuncia qual dos dois, sem precisar abrir a seção. Um projeto antigo
que seguia uma numeração diferente do escritório é o caso típico de padrão próprio.

Dentro dela, o **editor visual** monta o padrão por blocos (Projeto, Disciplina, Fase,
Número, Tipo, Revisão): clique para adicionar ou remover um bloco, use as setas para reordenar,
marque **opcional** o que não é sempre exigido (revisão é o caso mais comum), e escolha o
separador. Uma prévia mostra como um nome ficaria com aquele padrão. Nenhuma sintaxe de
regex é necessária. Um padrão herdado de configuração antiga que o editor visual não
consegue representar abre em **modo avançado** (texto) — ele continua funcionando, só não é
editável em blocos até ser reconstruído do zero no editor visual.

No mesmo diálogo ficam as **siglas deste projeto** (fases, tipos e folhas que valem só
aqui, somadas às globais). Quem não tem permissão de Configurações enxerga o padrão e as
siglas em vigor, mas não edita.

Esta mesma configuração (herdar ou usar padrão próprio) existe em **Configurações → Lista
Mestre** para o padrão **global**, que vale para todo projeto que não tiver o seu.

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

### Histórico de cada documento (aba Arquivos)

Clique no nome de um documento na tabela para abrir o painel de detalhes. No fim do painel,
a seção **Histórico** mostra tudo o que aconteceu com ele, do mais recente para o mais antigo:

- **Alterações** — envio de arquivos e revisões, mudança de fase, status documental, título
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

## Permissões (resumo)

| Ação | Permissão |
| --- | --- |
| Ver lista/detalhe | `projetos:ver` |
| Criar/editar projeto, disciplinas, membros | `projetos:gerir` |
| Alterar status / registrar revisão | Responsável da disciplina **ou** gestor |
| Ver downloads e visualizações no histórico do documento | `arquivos:ver_acessos` |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Transição de X para Y não permitida." | Fluxo de status restrito a não-gestores | Seguir a sequência válida ou pedir a um gestor |
| "Status 'aprovado' só pode ser definido via validação de entrega." | Tentativa de marcar aprovado direto | Validar a entrega |
| "Não é possível excluir uma disciplina com arquivos/pagamentos." | Disciplina com vínculos | Remover vínculos antes ou manter a disciplina |
| "O prazo da disciplina não pode ultrapassar o prazo do projeto." | Prazo inválido | Ajustar o prazo |
| Não vejo "Novo projeto" | Falta `projetos:gerir` | Solicitar permissão |

## Funcionalidades relacionadas

- [Meu trabalho](meu-trabalho.md) · [Planejamento](planejamento.md) · [Tarefas](tarefas.md)
- [Clientes](../clientes-comercial/README.md) · [Portal do cliente](../inicio/portal-cliente.md)

## FAQ

**Como o código do projeto é gerado?** Automaticamente, no formato `AAXXXX` (ano +
sequencial).

**Por que não consigo aprovar uma disciplina?** "Aprovado" só vem da validação da
entrega — não é uma troca manual de status.
