# Portal do cliente — aprovação formal da entrega

Pedido do dono em 2026-11-21/22. Primeiro item da série "próximos 6 do portal" (ordem combinada: aprovação da entrega →
atas → agenda → conta de obra → confirmação de recebimento → comparar revisões).

## Por quê

Nas palavras do dono: a aprovação **serve de prova, evita discussão de "já tinha aprovado"**, e **dependendo do contrato
pode servir de liberação de pagamento**.

Hoje o portal mostra a fase (EP/BS/EX) como "Concluída" quando o escritório aprovou internamente e as pranchas estão nas
Entregas (`portal/andamento.ts`), e existe o pedido de revisão (`portal/pedido-revisao/`) para "quero mudar isto". Não
existe o cliente dizer formalmente "aceito" sobre um conjunto definido de arquivos, nem esse aceite ficar registrado.

Sucesso = a coordenação envia um pacote de entrega; o cliente (ou a equipe, por ele, com comprovante) responde uma vez;
o registro guarda exatamente quais revisões, qual resposta, quem e quando; e o financeiro vê, na parcela do contrato
ligada ao pacote, se o cliente já aceitou.

## Decisões do dono (2026-11-22)

1. **Unidade = pacote montado pela coordenação** (não fase solta, não prancha a prancha). A coordenação escolhe as
   revisões; pode partir de uma fase para preencher a lista.
2. **Três respostas:** "Aprovo", "Aprovo com ressalvas" e "Não aprovo". **"Com ressalvas" conta como aceite** — libera
   o sinal da parcela e encerra a discussão do que foi entregue; o texto fica registrado. "Não aprovo" não conta; a
   coordenação monta um pacote novo.
3. **Pagamento só sinaliza.** O pacote pode ser ligado (opcional) a uma parcela do contrato do cliente
   (`ContratoParcelaEntrega`); "Parcelas a faturar" mostra a situação do aceite. **Nada trava e nada fatura sozinho** —
   o financeiro continua decidindo (mesma regra D9: o marco nunca fatura sozinho). Motivo do dono: haverá clientes que
   não aderem ao portal e serão tratados "por fora".
4. **Registro por fora:** a coordenação registra no sistema uma resposta recebida fora do portal (e-mail, WhatsApp,
   papel), com **comprovante obrigatório**, marcada como "Registrada pela equipe".
5. Construção: **abordagem 1** (ver "Abordagens").
6. **Anular resposta:** a coordenação pode anular uma resposta (do cliente OU registrada por fora), com **motivo
   obrigatório**. Nada é apagado: a resposta original fica visível, riscada, com "Anulada em 13/12 por Helena: <motivo>";
   o pacote volta a aguardar (se ainda estiver atual) ou a equipe envia outro; a marca da parcela ignora resposta anulada;
   o cliente vê que a resposta foi anulada e o motivo.

## Objetivos

### Equipe (aba Cliente do projeto, `/projetos/[id]/cliente`)

- Seção **"Aprovações de entrega"** abaixo/ao lado da conversa, com a lista dos pacotes do projeto (mais recente
  primeiro): título, data de envio, quem enviou, nº de revisões, situação (Aguardando · Aprovado · Aprovado com
  ressalvas · Não aprovado · Cancelado · Desatualizado), resposta (texto, quem, quando, origem portal/equipe) e a parcela
  ligada, se houver.
- **"Enviar para aprovação"** abre um diálogo:
  - **Título** obrigatório (ex.: "Entrega BS — Estrutural e Hidráulica"), **mensagem** opcional ao cliente;
  - **lista de revisões** para marcar: SÓ o que o cliente vê hoje nas Entregas do portal (o mesmo núcleo de
    `alcanceDoPortal` + `conteudoDoAlcance`), agrupada por disciplina e fase, com atalho **"Marcar a fase"**
    (disciplina + fase) que marca todas as pranchas daquela fase. Pelo menos 1 revisão;
  - **parcela do contrato** (opcional): parcelas de contratos de CLIENTE com `projetoId` deste projeto que ainda não
    foram faturadas;
  - ao enviar: grava o pacote (`aguardando`) e a FOTO dos itens; avisa o cliente (abaixo).
- Menu `⋯` do pacote (ADR-0002, descritor puro `itensDaAprovacaoEntrega`): **Registrar resposta recebida por fora**,
  **Cancelar pedido** (só aguardando, com confirmação), **Anular resposta** (só respondido; motivo obrigatório,
  ≤ 500 caracteres, com confirmação), **Ver comprovante** (quando há).
- **Registrar por fora:** escolhe a resposta (3 opções), texto (obrigatório em "com ressalvas" e "não aprovo"), **data
  em que o cliente respondeu** (não futura, não antes do envio do pacote), **nome de quem respondeu** (texto livre: pode
  não ter conta) e **comprovante** (arquivo obrigatório). Fica com origem `equipe` + quem registrou.

### Cliente (portal, `/portal/[projetoId]`)

- Card **"Aprovações de entrega"** (some quando o projeto não tem pacote). Pendentes no topo, em destaque. Cada pacote:
  título, mensagem da coordenação, data, a lista dos itens (disciplina, código/nome do documento, revisão "R01", nome do
  arquivo) com link para abrir cada prancha no visualizador do portal (`/portal/[projetoId]/prancha/[uploadId]`; IFC/
  outros formatos: link de download das Entregas, como hoje).
- Pendente e atual: três botões. "Aprovo" pede confirmação; "Aprovo com ressalvas" e "Não aprovo" abrem campo de texto
  obrigatório. Confirmação deixa claro que a resposta é definitiva e fica registrada.
- Respondido: mostra a resposta, o texto, quem respondeu e quando; se foi pela equipe, "Registrada pela coordenação"
  (sem o nome de quem registrou nem o comprovante — o comprovante é interno).
- Resposta anulada: aparece riscada com "Anulada pela coordenação em 13/12: <motivo>" (sem o nome de quem anulou); se o
  pacote voltou a aguardar e está atual, os três botões voltam.
- Desatualizado (ver regra abaixo): "Um dos arquivos foi atualizado depois do envio. A coordenação vai enviar de novo." —
  sem botões.

### Financeiro (Parcelas a faturar, em `/financeiro/contas`)

- Parcela ligada a algum pacote ganha uma marca: "Aceita pelo cliente em 12/12" (+ "com ressalvas"), "Aguardando aceite
  do cliente" ou "Não aprovada pelo cliente em 12/12". Vários pacotes na mesma parcela: vale o ACEITO mais recente; sem
  aceito, o mais recente não cancelado. Resposta anulada não conta (o pacote dela vale pela situação atual). Só leitura:
  o botão Faturar não muda.

## Regras

- **Uma resposta ativa por pacote.** As respostas ficam numa tabela própria (`RespostaAprovacaoEntrega`), com no máximo
  UMA não anulada por pacote (índice único parcial, fora do schema.prisma como os outros). Toda troca de situação do
  pacote é `updateMany` condicionado ao status lido (dois cliques, duas contas do cliente, cliente × registro por fora,
  resposta × cancelamento, anular × anular ao mesmo tempo = um só vence; o outro recebe "Este pedido já foi
  respondido.", "Este pedido foi cancelado." ou "Esta resposta já foi anulada.").
- **Anular:** só pacote respondido; grava `anuladaEm`, quem e o motivo na resposta, e o pacote volta a `aguardando` na
  mesma transação. Pacote que volta e está desatualizado só pode ser cancelado. O comprovante da resposta anulada fica.
- **Quem responde no portal:** qualquer conta ATIVA do cliente do projeto (`User.tipo = externo`, `clienteId` = o do
  projeto; cliente inativo fica fora do portal, decisão anterior do dono). A primeira resposta fecha o pacote.
- **Foto do pacote.** Cada item grava, no envio: `uploadId`, `revisaoId`, `documentoId`, disciplina (id + nome), código
  e nome do documento, rótulo da revisão, nome do arquivo e `hashSha256` do upload. O pacote grava a **impressão
  digital** = SHA-256 da lista canônica dos itens (ordenada por uploadId; `uploadId|hashSha256` por linha). A resposta
  grava a mesma impressão digital que o cliente viu. Nada disso é editado depois.
- **Desatualizado** (calculado, não gravado): algum item cujo upload foi substituído (`substituidoPorId`), excluído, ou
  que saiu das Entregas do portal (a mesma regra do download, `uploadLiberadoNoAlcance(alcanceDoPortal(...))`). Pacote
  desatualizado não aceita resposta — nem do cliente nem por fora — e a equipe vê "Desatualizado: cancele e envie de
  novo". O servidor recalcula ao responder (dentro da transação), não confia na tela.
- **Cancelar:** só `aguardando`; grava quem e quando. Pacote não é editado: muda algo, cancela e envia outro.
- **Texto:** título ≤ 120, mensagem ≤ 1000, texto da resposta ≤ 2000 caracteres; obrigatório em "com ressalvas" e
  "não aprovo".
- **Parcela:** só de contrato do mesmo projeto e cliente; o pacote guarda `parcelaId` (SetNull se a parcela sumir).
  Nenhuma escrita em `Lancamento` nem em `ContratoParcelaEntrega`.
- **Comprovante:** PDF, PNG, JPG, EML ou MSG, até 20 MB; enviado ANTES da gravação da resposta (como o comprovante da
  baixa), por rota multipart interna que grava em `STORAGE_BASE_PATH` via `resolverCaminho()`; a resposta por fora só
  é aceita com um comprovante enviado por quem registra, deste pacote, ainda não usado. Baixar = mesma audiência da
  equipe; o cliente nunca baixa.

## Audiência e permissões

- **Equipe que envia, cancela, registra por fora e vê a seção:** a MESMA audiência da conversa com a coordenação
  (`podeVerConversa` / `fatosDaAudiencia` em `portal/mensagens/audiencia.ts`: superusuário, perfil com escopo global,
  coordenador do projeto, perfil Coordenador que vê o projeto), só interno. Sem permissão nova de catálogo.
- **Cliente:** sem permissão de catálogo; o serviço confere conta externa ativa + acesso ao projeto do portal
  (`acessoDoUsuarioAoProjetoDoPortal`), como o pedido de revisão.
- **Financeiro:** a marca em Parcelas a faturar segue o gate da própria página.
- Toda mutação via `defineAction` (auditoria automática); o texto da resposta e o título vão para a auditoria; o
  conteúdo do comprovante não.

## Avisos

- **Envio:** cada conta ativa do cliente recebe sino + e-mail (template novo `portal-aprovacao-entrega`, sem opção de
  desligar — é um pedido formal, como o pedido de assinatura). Sem SMTP, só o sino.
- **Resposta do cliente:** sino para a audiência da equipe (`destinatariosDaEquipe`), categoria nova
  `aprovacao_entrega` (desligável em Preferências). Se o pacote está ligado a parcela e a resposta conta como aceite,
  sino também para quem tem `financeiro:gerir` ("Parcela X: aceite do cliente registrado"), mesma categoria.
- Registro por fora: sem aviso ao cliente; sino ao financeiro na mesma regra acima.
- Anulação: sino (sem e-mail) para as contas ativas do cliente; sino ao financeiro se a resposta anulada contava como
  aceite de pacote ligado a parcela.
- Avisos depois do commit; falha de aviso nunca desfaz a resposta.

## Não-objetivos

- Travar ou faturar a parcela (decisão 3).
- Prazo para responder, lembrete automático ou cobrança de resposta.
- Marca "Aceita pelo cliente" nas listas de arquivos internas (pode vir depois, lendo do pacote).
- Transformar a ressalva em pedido de revisão ou apontamento automaticamente (a coordenação usa a conversa ou o pedido de
  revisão que já existem).
- Assinatura com certificado digital.
- Editar um pacote enviado ou editar uma resposta (o caminho é anular e responder de novo).

## Anti-objetivos

- O aceite cobrir um arquivo diferente do que o cliente viu (por isso a foto, a impressão digital e o "desatualizado").
- O cliente ver comprovante, nome de quem registrou por fora ou qualquer dado interno.
- Duas respostas ATIVAS no mesmo pacote; apagar uma resposta (anular nunca apaga).
- Mexer no ciclo documental (`uploads/ciclo/service.ts`) ou no Jurídico.

## Abordagens

1. **Pacote próprio no portal (escolhida).** Tabelas `AprovacaoEntrega` (pacote), `AprovacaoEntregaItem` (foto) e
   `RespostaAprovacaoEntrega` (respostas, uma ativa), módulo `modules/portal/aprovacao-entrega/` no molde de `pedido-revisao` e `contratos`
   (regras puras + `service.ts` único escritor + `queries.ts` + `actions.ts`). Guarda pacote, três respostas, prova e
   registro por fora sem tocar no ciclo nem no Jurídico.
2. Controle novo do ciclo documental por revisão ("aceita pelo cliente"). Perde o pacote como unidade (uma resposta, um
   texto) e mexe no serviço do ciclo. Descartada.
3. Pacote como documento jurídico para assinar. Só "assinou", sem ressalvas; mistura entrega técnica com contrato e exige
   permissão do Jurídico. Descartada.

## Decisões do agente (corrigíveis)

- Mesma audiência da conversa para a equipe; nenhuma permissão nova.
- Desatualizado bloqueia também o registro por fora (o comprovante de fora deveria se referir ao que foi enviado; se o
  arquivo mudou, refaz).
- Vários pacotes podem estar aguardando no mesmo projeto ao mesmo tempo; a mesma revisão pode estar em vários.
- Data do registro por fora: informada (dia), não futura, não antes do envio.
- Nome de quem respondeu por fora: texto livre obrigatório.
- E-mail do pedido sem opt-out; resposta avisa a equipe pela categoria nova `aprovacao_entrega`.
- Linha do tempo do portal e andamento não mudam nesta versão.
- **Desatualizado só existe em pacote aguardando.** Pacote respondido nunca vira desatualizado: arquivo trocado depois
  não invalida um aceite (é justamente a prova). A marca do financeiro não depende disso.
- **Corrida no responder:** a transação da resposta trava as linhas `Upload` dos itens (`SELECT … FOR UPDATE`) e relê
  substituído/excluído/situação com leituras planas dentro dela; a troca de arquivo do ciclo grava `substituidoPorId`
  nessas mesmas linhas, então espera ou é esperada. A regra das Entregas (`uploadLiberadoNoAlcance`) roda antes, fora da
  transação; a releitura dentro dela cobre substituição e exclusão.
- **Item = arquivo das Entregas**, não revisão: uma revisão com PDF e DWG vira dois itens, com o mesmo rótulo de revisão.
  "Marcar a fase" marca todos os arquivos daquela fase.
- **Parcelas que podem ser ligadas:** o mesmo filtro da lista Parcelas a faturar (`parcelas-a-faturar-queries.ts`) para
  o projeto — o seletor e a lista sempre concordam. Parcela faturada sai da lista e, com ela, a marca.
- **Portal:** pacote cancelado não aparece ao cliente. Pacote respondido mostra a lista dos itens; o item que saiu das
  Entregas aparece sem link (nada de "versão enviada" por fora da regra das Entregas).
- **Cliente sem conta ativa:** o envio é permitido, com aviso no diálogo ("Este cliente não tem conta ativa no portal:
  registre a resposta por fora."); ninguém é notificado.
- Comprovante enviado e não usado: linha própria de anexo pendente, apagada (registro e arquivo) pelo job diário depois
  de 24 h sem uso.
- Data informada no registro por fora é dia de São Paulo (`lib/data.ts`).

## O que fica para quem constrói

Nomes de colunas e índices; layout exato do card e do diálogo (segue `CabecalhoPagina`/cards do portal e as regras de
celular do CLAUDE.md); texto do e-mail; onde exatamente a marca aparece na linha de Parcelas a faturar; smoke
`smoke:portal-aprovacao-entrega` cobrindo: envio (só itens das Entregas), resposta única com corrida, cliente × por fora
ao mesmo tempo, anular (volta a aguardar, marca da parcela ignora, anular duas vezes = uma), desatualizado (substituído, excluído, saiu das Entregas), outro cliente/cliente inativo, comprovante
obrigatório e de outro pacote recusado, marca na parcela (aceito vence, ressalvas conta, não aprovado não).
