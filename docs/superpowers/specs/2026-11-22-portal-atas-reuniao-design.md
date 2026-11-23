# Portal do cliente — atas de reunião

Pedido do dono em 2026-11-22. Item 2 da série "próximos 6 do portal" (ordem combinada: aprovação da entrega ✓ → **atas** →
agenda → conta de obra → confirmação de recebimento → comparar revisões).

## Por quê

Hoje a ata já existe: o **Gemini do Google Meet** gera as "Anotações do Gemini" sozinho, e a equipe manda ao cliente por
e-mail ou WhatsApp. O que dá problema depois, nas palavras do dono: **decisão esquecida, cliente dizendo que não foi isso
que se combinou, tarefa que ninguém fez**.

Então o sistema não pede para ninguém escrever ata. Ele recebe as anotações do Gemini, a coordenação revisa e separa o que é
decisão e o que é tarefa, publica no portal, o cliente confirma, e as tarefas passam a ser acompanhadas — as da equipe e as
do cliente.

Sucesso = depois de uma reunião, a coordenação importa as anotações em poucos minutos; o cliente lê e confirma no portal
(ou pede correção e confirma a versão corrigida); as decisões ficam na lista "Decisões" do projeto; as tarefas da equipe
estão no "Meu trabalho" de cada um; as pendências do cliente estão no portal, com prazo, e a coordenação vê o que atrasou
do lado dele.

## Decisões do dono (2026-11-22)

1. **Tarefas das duas pontas.** Tarefa da equipe vira **Tarefa** do SenaHub (responsável, prazo, "Meu trabalho"). Tarefa
   do cliente vira **pendência do cliente** no portal ("Pendências suas").
2. **O sistema lê a estrutura do Gemini** (sem IA externa, sem integração com o Google nesta versão). A coordenação cola o
   texto ou anexa o arquivo baixado do Google Docs (.docx, .md, .txt); o sistema separa os itens; a coordenação revisa.
3. **Cliente que discorda gera versão nova.** O cliente responde "Li e concordo" ou "Tenho observações" (texto). Com
   observações, a coordenação corrige e publica a versão seguinte; o cliente confirma de novo. Todas as versões ficam
   guardadas, cada uma com a resposta que recebeu.
4. **Pendência do cliente: o cliente marca "Feito", a coordenação confere.** Até a conferência ela fica "Aguardando
   conferência"; a coordenação **confere** ou **reabre com motivo** (o cliente vê o motivo).
5. Construção: **abordagem 1** (ver "Abordagens").
6. **"Retirar ata" para publicação por engano** (projeto errado, conteúdo errado), com **motivo obrigatório**: a reunião
   inteira some do portal daquele cliente (texto, decisões da lista "Decisões", pendências); as Tarefas abertas que ela
   criou são arquivadas e as pendências não conferidas, canceladas; internamente fica "Retirada por <nome> em <data>:
   <motivo>". Não volta: se era de outro projeto, importa-se de novo lá. O e-mail que já saiu não tem como voltar.

## O que o Gemini entrega (amostras reais do dono)

Duas gerações de formato, ambas em pt-BR, exportadas do Google Docs como .docx, .md ou .txt (ou copiadas e coladas):

- **Formato antigo (jan/2026):** cabeçalho (data, título "Reunião - <nome>"), **Resumo** (parágrafo), **Detalhes** (itens
  "Título: texto (00:12:26)"), **Próximas etapas sugeridas** (frases soltas: "LÚCIO SENA vai apurar …").
- **Formato novo (out/2026):** cabeçalho ("Reunião em 8 de out. de 2026 às 17:29 GMT-03:00"), **Resumo** (frase + blocos
  "título / linha"), **Decisões** (às vezes com subtítulo "Alinhada"; itens "**Título** texto"), **Próximas etapas** (itens
  "[Responsável] Título: descrição", às vezes com caixa "- [ ]"), **Detalhes**.
- Responsável quase nunca é pessoa: "[SENA Engenharia]" (conta do Meet do escritório), "[O grupo]".
- Rodapé fixo ("Revise as anotações do Gemini…", "Como está a qualidade…") e links de marcação de tempo — descartados.
- A **transcrição** vem num arquivo/aba à parte ("- Transcrição"); não é lida, pode ser anexada como registro interno.
- Texto do .md vem com escapes de markdown (`\[`, `\-`, `**`); o do .docx, em parágrafos com numeração de lista.

## Objetivos

### Equipe (aba Cliente do projeto, `/projetos/[id]/cliente`)

- Seção **"Reuniões e atas"** (abaixo de Aprovações de entrega): lista das reuniões do projeto (mais recente primeiro) com
  data, título, versão atual e situação da ata (Rascunho · Aguardando o cliente · Confirmada · Com observações), e o
  contador de pendências do cliente abertas e atrasadas.
- **"Nova ata"**: título (sugerido do cabeçalho do Gemini, ex.: "Reunião - Limão Tênis"), data da reunião (sugerida do
  cabeçalho), e as anotações — **colar** o texto ou **anexar** o arquivo (.docx/.md/.txt, até 20 MB). Anexo opcional da
  **transcrição** (qualquer um dos três formatos, só guarda). Ao importar, o sistema monta o **rascunho**.
- **Rascunho (editor):**
  - **Texto da ata** que o cliente vai ler: começa com o Resumo (e os Detalhes, recolhidos) que o Gemini escreveu, em texto
    simples com marcação leve (negrito, listas); a coordenação **edita livremente** antes de publicar.
  - **Itens**, cada um com **tipo**: Decisão · Tarefa da equipe · Pendência do cliente · (Ignorar). Decisões do formato novo
    entram como Decisão; próximas etapas entram como tarefa, com o tipo sugerido pelo nome reconhecido (ver Regras) e, sem
    reconhecimento, "Tarefa da equipe" sem responsável. No formato antigo, a coordenação pode transformar frases do resumo
    em decisão (botão "Virar decisão" por frase/parágrafo) e criar itens à mão.
  - Campos do item: título (obrigatório), descrição; tarefa da equipe: **responsável** (pessoa interna ativa; obrigatório
    para publicar) e prazo (opcional); pendência do cliente: prazo (opcional).
  - Salvar rascunho, descartar rascunho, **Publicar no portal** (confirmação que mostra o projeto e o cliente em destaque).
- Ata publicada: ver a versão e a resposta do cliente; **"Corrigir ata"** cria o rascunho da versão seguinte copiando a
  atual (itens com a mesma identidade); histórico das versões com as respostas.
- **"Retirar ata"** (menu da reunião, só com versão publicada; motivo obrigatório ≤ 500, confirmação): ver decisão 6.
  Reunião retirada aparece na lista da equipe como "Retirada", só leitura.
- **Pendências do cliente**: lista com situação (Aberta · Aguardando conferência · Conferida · Reaberta · Cancelada),
  prazo e atraso; ações **Conferir** e **Reabrir** (motivo obrigatório) na que está aguardando conferência.

### Cliente (portal, `/portal/[projetoId]`)

- Card **"Atas de reunião"**: reuniões com ata publicada, a mais recente primeiro. Cada uma mostra data, título, a versão
  vigente (texto + decisões + tarefas da equipe "a cargo da equipe" + pendências do cliente) e:
  - aguardando resposta: botões **"Li e concordo"** e **"Tenho observações"** (texto obrigatório); confirmação deixa claro
    que fica registrado;
  - respondida: a resposta, quem respondeu e quando; com observações, "A coordenação vai publicar uma versão corrigida".
  - versões anteriores recolhidas ("Versão 1 — com observações de Marina em …").
- Card **"Pendências suas"** (some sem pendência): as abertas e reabertas primeiro (atrasadas em destaque, com texto
  "Atrasada"), depois as aguardando conferência; botão **"Marquei como feito"** com comentário opcional; reaberta mostra o
  motivo. Conferidas e canceladas ficam recolhidas em "Concluídas".
- **Decisões**: a lista "Decisões" que já existe na conversa passa a mostrar também as decisões das atas confirmadas ou
  aguardando (versão vigente), com a origem "Ata de 19/01/2026".

### Tarefas da equipe

- Publicar cria uma **Tarefa** por item "Tarefa da equipe" (título, descrição + "Origem: ata de <data> — <título>",
  projeto, responsável, prazo, primeira coluna ativa), ligada ao item. Aparece no "Meu trabalho" e no quadro de Tarefas como
  qualquer outra.

## Regras

- **Leitura das anotações** (pura, testada com as amostras do dono): detecta as seções pelos títulos (Resumo, Decisões,
  Próximas etapas / Próximas etapas sugeridas, Detalhes, com ou sem `#`/`**`); remove rodapé fixo, links e marcações de
  tempo; desfaz escapes de markdown; extrai `[Responsável] Título: descrição` e "Fulano vai …". Formato não reconhecido = tudo
  vai para o texto da ata, nenhum item, e a coordenação cria os itens à mão (nunca erro).
- **.docx** lido sem biblioteca nova: `fflate` (já no projeto) abre o zip e o texto sai de `word/document.xml` (parágrafos
  e numeração de lista). .md e .txt como texto UTF-8 (com ou sem BOM).
- **Responsável sugerido:** o nome entre colchetes (ou antes de "vai") comparado, sem acento/caixa, com os membros do projeto
  e as contas do cliente (nome completo ou primeiro nome único). Membro → Tarefa da equipe com ele; conta do cliente ou nome
  do cliente → Pendência do cliente; "SENA Engenharia", "O grupo" ou nada → Tarefa da equipe sem responsável. Só sugere.
- **Versões:** uma reunião tem N versões; no máximo **um rascunho** e **uma vigente** (a última publicada). Publicar a versão
  N+1 marca a N como **substituída**. Só a vigente aceita resposta do cliente, **uma vez** (`updateMany` condicionado). Texto
  e itens de versão publicada nunca mudam.
- **Itens com identidade estável:** cada item tem uma `chave` que passa de versão em versão. Ao publicar a versão nova,
  comparando com a vigente:
  - tarefa da equipe **nova** → cria Tarefa; **removida** (ou mudou para outro tipo) → a Tarefa é arquivada se ainda não
    concluída; **alterada** (título, descrição, responsável, prazo) → atualiza a Tarefa se ainda não concluída;
  - pendência do cliente **nova** → cria; **removida** → Cancelada (se não conferida); **alterada** → atualiza título,
    descrição e prazo (a situação fica).
- **Pendência do cliente:** Aberta → (cliente "Feito") Aguardando conferência → (coordenação) Conferida | Reaberta (motivo)
  → (cliente "Feito") Aguardando conferência … ; Cancelada só pela versão nova da ata. Toda troca `updateMany` condicionada à
  situação lida. **Atrasada** = prazo antes de hoje (dia de São Paulo) e Aberta ou Reaberta (calculado).
- **Publicar exige:** título, data, ao menos um item ou texto não vazio, e responsável em toda tarefa da equipe.
- **Texto:** título ≤ 120; texto da ata ≤ 20.000; título do item ≤ 200; descrição ≤ 2.000; observação do cliente ≤ 2.000;
  comentário do "Feito" ≤ 1.000; motivo de reabrir ≤ 500. Texto da ata renderizado com `react-markdown` sem HTML.
- **Arquivos** (anotações originais e transcrição): só a equipe baixa; o cliente nunca vê. Mesmo esqueleto de rota multipart
  do comprovante da aprovação.

## Audiência e permissões

- **Equipe** (ver, importar, editar, publicar, corrigir, conferir, reabrir): a MESMA audiência da conversa com a coordenação
  (`podeVerConversaDoProjeto`), só interno. Sem permissão nova.
- **Cliente**: conta externa ativa de cliente ativo com acesso ao projeto pelo portal (`contaPodeVerConversa`); responde à
  ata e marca pendência como feita. Recusa uniforme "Ata não encontrada." / "Pendência não encontrada.".
- O cliente nunca vê: rascunho, arquivo original, transcrição, nomes de quem publicou/conferiu/reabriu (vê "a coordenação"),
  responsável interno da tarefa da equipe (vê "a cargo da equipe"), Tarefas.
- Toda mutação por `defineAction` (auditoria automática).

## Avisos

- **Ata publicada (cada versão):** contas ativas do cliente — sino (sem categoria) + e-mail `portal-ata-reuniao` (sem opção de
  desligar, como o pedido de aprovação). Sem SMTP, só o sino.
- **Resposta do cliente à ata** e **pendência marcada como feita:** coordenadores do projeto (sem nenhum, os de escopo global),
  categoria nova `ata_reuniao` (desligável em Preferências).
- **Pendência reaberta:** contas ativas do cliente, só sino.
- **Tarefa criada para a equipe:** o aviso que o módulo de Tarefas já dá a um responsável novo (se houver); nada além.
- Avisos depois do commit; falha de aviso nunca desfaz a escrita.

## Não-objetivos

- Integração com o Google (puxar a ata do Meet sozinho) e IA externa para extrair itens — ficam para depois.
- Ler a transcrição.
- Confirmação item a item; resposta do cliente registrada por fora (sem portal) nesta versão.
- Lembrete automático de pendência atrasada (a lista destaca; lembrete pode vir depois, no resumo diário do portal).
- Agenda de reuniões futuras (item 3 da série; a "reunião do projeto" daqui é a base dele).
- Editar ata publicada (o caminho é a versão nova); desfazer a retirada.

## Anti-objetivos

- Texto do Gemini chegar ao cliente sem a coordenação revisar.
- A versão nova duplicar Tarefas ou pendências.
- O cliente ver dado interno (rascunho, transcrição, arquivo original, nomes da equipe nas ações).
- Uma resposta do cliente valer para uma versão diferente da que ele leu.

## Abordagens

1. **Reunião do projeto própria, com ata em versões (escolhida).** `ReuniaoProjeto` (projeto, título, data) →
   `AtaVersao` (número, estado rascunho|publicada|substituida, texto, publicação, resposta do cliente) → `AtaItem` (chave
   estável, tipo, título, descrição, responsável, prazo, `tarefaId`) + `PendenciaCliente` (por chave, situação) + anexos
   internos. Módulo `modules/portal/atas/` no molde de `aprovacao-entrega`. A reunião é a base da agenda (item 3).
2. Pendurar a ata no `Compromisso` da Agenda: o compromisso é do comercial (âncora lead/negociação/cliente, próxima ação);
   misturar mexe num fluxo que funciona. Descartada.
3. Ata como documento em Arquivos + itens soltos em Tarefas: versões e confirmação sem lugar; Tarefa é interna e expô-la no
   portal arrisca vazar dado da equipe. Descartada.

## Decisões do agente (corrigíveis)

- Mesma audiência da conversa; nenhuma permissão nova.
- Pendência é do **cliente** (empresa), não de uma conta: qualquer conta ativa marca "Feito"; o registro guarda qual.
- Resposta à ata: qualquer conta ativa do cliente; a primeira fecha a versão.
- "Tenho observações" não cria versão sozinho: a coordenação decide corrigir (pode responder pela conversa e manter).
- Decisões das atas na lista "Decisões": só da versão vigente publicada (não do rascunho, não das substituídas).
- Prazo de tarefa/pendência: dia (sem hora), São Paulo.
- Formato do texto da ata: markdown leve (negrito, itálico, listas, títulos), sem HTML; links ficam como texto (não
  clicáveis).
- Sem resposta por fora (cliente sem portal): a ata publicada fica como registro, sem confirmação.
- Arquivo original e transcrição até 20 MB cada, só .docx/.md/.txt.
- **Versão nova só mexe no que ela mudou.** Cada versão guarda os valores dos seus itens; ao publicar, só os campos que
  diferem da versão vigente são aplicados à Tarefa/pendência. Uma edição feita à mão no quadro de Tarefas (responsável,
  prazo, coluna, descrição) não é sobrescrita se a ata não mudou aquele campo.
- **Identidade reaproveitada:** um item que sai e volta numa versão posterior reusa a mesma Tarefa (desarquivada) e a mesma
  pendência (Cancelada volta a Aberta — transição só da publicação). Uma linha por chave.
- **Tarefa criada pela publicação:** criador = quem publicou a versão que a criou; as atualizações das versões seguintes são
  do serviço da ata (não passam pela trava "só o criador edita"); o aviso de responsável novo é o mesmo do módulo de Tarefas,
  emitido depois do commit.
- **Responsável da tarefa da equipe:** membro interno ativo do projeto (a lista do seletor). Quem não é membro não aparece.
- **"Tenho observações" sem versão nova:** a versão fica "Com observações" (a coordenação responde pela conversa). Suas
  decisões continuam na lista "Decisões", com a marca "com observações do cliente"; tarefas e pendências seguem vivas.
- **Lista "Decisões" combinada:** a leitura da conversa (`conversaParaCliente`/`conversaParaEquipe`) passa a juntar, por
  data, as decisões marcadas na conversa e as decisões da versão vigente de cada ata publicada (origem "Ata de dd/mm/aaaa —
  título", com âncora para a ata). Vale para o portal e para a aba Cliente.
- **O cliente vê da tarefa da equipe:** título e prazo, com "a cargo da equipe" — nunca o responsável, a descrição interna
  nem a situação da Tarefa.
- **Cliente sem conta ativa:** publicar é permitido, com aviso ("Este cliente não tem conta ativa no portal: a ata fica
  registrada, sem confirmação."); ninguém é notificado.

## O que fica para quem constrói

Nomes de colunas e índices; layout do editor de rascunho (deve funcionar a 390 px); texto do e-mail; como o "Virar decisão"
seleciona o trecho; smoke `smoke:portal-atas` cobrindo: leitura das amostras (formato antigo e novo, .docx/.md/.txt, colado),
publicar (cria Tarefas e pendências), resposta única (corrida), versão nova (cria/arquiva/atualiza Tarefas, cancela
pendência removida, nunca duplica), pendência (feito → conferida/reaberta, corrida, atrasada), outro cliente/inativo/projetista,
o que o cliente nunca recebe, Decisões combinadas.
