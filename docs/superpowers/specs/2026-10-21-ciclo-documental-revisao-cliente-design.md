# Ciclo documental — envio automático ao cliente, "Em revisão" e descrição lida do carimbo

Pedido do dono em 2026-10-21, a partir dos áudios do Ryan (coordenação) sobre o fluxo de documentos
(transcrição em `D:\DOWNLOADS\audios-ryan\transcricao.md`, fora do repositório). Emenda o contrato
[2026-10-08-ciclo-documental-iso19650.md](2026-10-08-ciclo-documental-iso19650.md): o que não é dito aqui
continua valendo lá.

## Por quê

A coordenação faz passos que o sistema poderia fazer sozinho e não tem como registrar que o cliente pediu
mudança numa prancha que já está com ele:

- Publicar e depois "Enviar ao cliente" são dois gestos, mas quase sempre andam juntos. Para o Ryan, publicar
  sozinho "fica uma função inútil".
- Quando o cliente pede revisão de algo já compartilhado, nada no sistema marca a R00. O projetista é
  avisado por fora, e o cliente e a obra não veem que aquela prancha vai mudar.
- A descrição da revisão é digitada num campo do sistema, mas o projetista já escreve o que mudou no quadro de
  revisão do carimbo. Os dois podem divergir, e o carimbo esquecido (R01 com o quadro ainda em "EMISSÃO
  INICIAL") passa.

Sucesso = a coordenação aprova e a prancha já está com o cliente; o pedido de revisão do cliente fica visível
para todos até a revisão nova chegar; nenhuma R01+ sai sem o que mudou escrito no carimbo.

## Escopo

1. Envio automático ao cliente na publicação (config por projeto).
2. Marca "Em revisão" numa revisão publicada.
3. Descrição da revisão lida do quadro de revisão do carimbo, com recusa de descrição vazia ou genérica.
4. Conferência de código do carimbo também para códigos com sublinhado (`2558_HDR_EX_6001_DTC`).

**Fora (decisões do dono):**
- "Devolver para ajustes" continua manual. Criar ou enviar apontamento não devolve a revisão.
- O cliente marcar "Em revisão" pelo portal fica para depois. Nesta entrega quem marca é a coordenação.
- Nenhum status novo de ESTADO: "Em revisão" é um CONTROLE, não um estado da máquina.

**Anti-objetivos:** a marca não pode tirar a R00 do cliente nem da obra; a obra continua usando a R00 até a R01
ser publicada. A leitura do carimbo não pode bloquear um envio por falha do leitor (só por conteúdo lido).

## 1. Envio automático ao cliente

- Nova coluna `ConfigDocumentosProjeto.enviarAoClienteAutomaticamente Boolean @default(true)`.
- **Ligado por padrão para TODOS os projetos**, inclusive os existentes (projeto sem linha de config = padrão =
  ligado). Isso foi dito ao dono, que não se opôs. O admin desliga em Arquivos → ⋯ → Ciclo dos documentos, ao
  lado de `liberarObraAutomaticamente`.
- Em `publicarNoBanco`, com a opção ligada, a revisão publicada recebe o controle `enviado_cliente` (automático,
  `origem: "publicacao"`, motivo "Envio automático ao cliente na publicação"), seja R00 ou não. Com a opção
  desligada, vale a regra de hoje (N4: herda só se a anterior estava enviada). Decisão minha: desligar volta
  exatamente ao comportamento atual.
- O resultado da publicação (`ResultadoPublicacao`) e a notificação dizem que foi enviada ao cliente, como já
  fazem para a liberação automática.
- A ordem na transação não muda: A1 (arquivar anteriores) → publicar → enviado ao cliente → A3 → A2.
- O lote "Publicar" da barra de seleção (`barra-selecao-documentos.tsx`) passa pelo mesmo `publicarRevisao`;
  nada a mudar além do texto da confirmação, que deve dizer que as revisões vão ao cliente.

## 2. "Em revisão"

### O que é

Um novo tipo de controle, `em_revisao`, no enum `TipoControleRevisao` e em `estados.ts`
(`ROTULO_CONTROLE: "Em revisão"`, cor âmbar — usar o token `revisao` ou `aguardando`, o que contrastar com a
restrição; decisão do builder). Fica numa revisão **publicada**, com motivo obrigatório (o que o cliente pediu).

### Quem marca e onde

- Permissão `arquivos:alterar_status` (a mesma de liberar para obra / enviar ao cliente). Decisão minha.
- Item de menu "Marcar em revisão…" no descritor `itensDoCiclo` (`acoes.ts`) para revisão publicada sem a marca,
  e "Cancelar revisão…" (remover, com motivo) quando há marca ativa. Mesmas frases no servidor e no item
  desabilitado (ADR-0002).
- Em lote: mais um `LoteCiclo` na barra de seleção, pensado para a pasta Compartilhado (selecionar tudo →
  marcar em revisão, um motivo para todas).

### Regras

- Só em revisão publicada (I5 vale como para os controles de pasta). Uma marca ativa por revisão.
- Não bloqueia nada: não é bloqueio, não impede transição, não tira `enviado_cliente` nem `liberado_obra`.
  A R00 marcada continua na pasta Compartilhado e na pasta Liberado para obra.
- Não cria revisão nova. A R01 nasce como hoje, quando o projetista sobe o arquivo com o mesmo nome. Uma R01 já
  em andamento quando a marca é aplicada também conta.
- **Sai sozinha** quando uma revisão mais nova do mesmo documento é publicada: a R00 vai para arquivado pela A1 e
  `transicionarNoTx` remove junto a marca (hoje só remove os controles de pasta — incluir `em_revisao` ali), com
  motivo "Revisão Rnn publicada". Arquivar à mão também a remove.
- Remover à mão = "Cancelar revisão" (o cliente desistiu), com motivo, por quem tem `arquivos:alterar_status`.
- Evento `controle_aplicado` / `controle_removido` dentro da transação, como os outros controles.

### Quem vê

A tag aparece, com o motivo na dica, em todo lugar onde a R00 aparece:
- aba Arquivos do projeto (Desenvolvimento, Compartilhado, Liberado para obra) e o diretório geral `/arquivos`;
- link público por situação (`projetos/arquivos/link-publico.ts`) — é como a obra e o cliente veem.

O portal do cliente fica FORA: hoje ele não lista as revisões enviadas ao cliente (só disciplinas e Recebidos);
o link público é o caminho do cliente e da obra. Decisão minha — criar essa lista no portal é escopo novo.

### Aviso ao projetista

- Ao marcar, notifica os responsáveis da disciplina do documento (`DisciplinaResponsavel` vigentes), categoria
  `ciclo_documental`: "R00 de {documento} em revisão: {motivo}", com link para o documento. Sem o autor da ação.
  Uma notificação por documento, também no lote (o lote repete a ação por item, ADR-0002). Decisão minha, no plano.
- Um filtro "Em revisão" na aba Arquivos, para o projetista achar o que tem de revisar. Decisão minha (no lugar da
  "lista de pendências da disciplina" citada na conversa: não existe essa lista por disciplina hoje).

## 3. Descrição lida do carimbo

### Amostras

12 PDFs reais em `D:\DOWNLOADS\carimbo-exemplo\` (fora do repositório; dados de cliente). Todos têm texto
extraível. Quatro modelos de quadro:

| Modelo | Exemplos | Cabeçalho | Numeração |
|---|---|---|---|
| A. SENA novo | 2558_HDR, 2558_CLM, PECR3-ELE, PAAUM, PAGUA | `REV` · `DESCRIÇÃO` · `AUTOR`, embaixo | linhas 01–05; **01 = EMISSÃO INICIAL** |
| B. SENA "ASSUNTO" | 2525, 25102, PECR3-PCI, PEDF3-003, PEDF3-004 | `REV.` · `ASSUNTO`, embaixo | linhas 00–06; 00 = EMISSÃO INICIAL |
| C. Prefeitura | 2382 (R02) | `DATA` · `REVISÃO` · `DESCRIÇÃO`, embaixo | 00, 01, 02 |
| D. Arquitetura de terceiro | PECAR | "Tabela de Revisão": `Revisão` · `Data` · `Emitido por` · `Descrição da Revisão`, EM CIMA | só a linha "1" (= R01), texto em 3 linhas |

Observado: o carimbo pode estar girado 90° (A e B em parte dos arquivos); alguns modelos geram um item de texto
por PALAVRA (B, C), outros um por célula; nas linhas do quadro o número aparece sozinho na 1ª coluna.

### Leitura (pura, em `ciclo/carimbo.ts` ou arquivo irmão)

1. No espaço de leitura (`paraEspacoDeLeitura`, já trata o giro), achar o cabeçalho do quadro: um item de número
   de revisão (`REV`, `REV.`, `REVISÃO`, `Revisão`) e, na mesma linha, um de descrição (`DESCRIÇÃO`, `ASSUNTO`,
   `Descrição da Revisão`).
2. As linhas do quadro são os números (`0`–`99`, com ou sem zero à esquerda) alinhados na coluna do rótulo de
   revisão, do lado do cabeçalho onde há linhas (acima ou abaixo).
3. A descrição de cada linha = os itens na coluna de descrição entre essa linha e a próxima, juntados na ordem de
   leitura (palavra por palavra quando for o caso), até a próxima coluna (`AUTOR`, `Emitido por`, `DATA`) ou o fim
   do quadro.
4. **Qual linha é qual revisão:** se alguma linha diz "EMISSÃO INICIAL", ela é a R00 e as seguintes contam a partir
   dela; se nenhuma diz, o número da linha é a revisão. Validado nas 12 amostras (ver tabela abaixo).
5. Saída: `{ quadroEncontrado: boolean; porRevisao: Map<number, string> }`.

A leitura do 1º PDF da revisão é a que vale (o mesmo PDF que a conferência de código/revisão já lê no envio).

### Regra no "Enviar para análise"

Só da R01 em diante (`numero >= 2`), como a descrição obrigatória de hoje:

| Situação | Resultado |
|---|---|
| Quadro encontrado, linha da revisão com texto específico | a descrição da revisão é o texto lido; o diálogo mostra para conferência (ver contestação abaixo) |
| Quadro encontrado, linha da revisão ausente ou vazia | **bloqueia**: "Preencha no carimbo o que mudou nesta revisão ({Rnn})." |
| Quadro encontrado, linha só com texto genérico | **bloqueia** (decisão do dono): "A descrição no carimbo ({texto}) não diz o que mudou. Escreva no carimbo o que foi alterado." |
| Quadro não encontrado, mas código e revisão lidos (memorial, modelo SENA antigo) | campo digitado de hoje (obrigatório, mesma regra de genérico), **sem** confirmação; grava `descricao_digitada` no detalhe do evento do envio. Decisão minha |
| PDF sem texto / código e revisão ilegíveis | como hoje: confirmação + `envio_sem_carimbo`, e o campo digitado (obrigatório, mesma regra de genérico) |

**Nomenclatura livre** (`conferirRevisao: false`, licitação): a linha do quadro é escolhida pelo `REVISÃO:` lido do
próprio carimbo (`leitura.revisao`), não pelo número do sistema; sem esse valor, usa a última linha preenchida.
Decisão minha.

**Genérico** = depois de tirar acentos, pontuação, caixa e prefixos como `REV 01:`/`R01`, sobram só palavras de uma
lista fixa: revisão, revisões, alteração, alterações, atualização, atualizações, ajuste, ajustes, modificação,
modificações, correção, correções, emissão inicial, geral (preposições e artigos — de, da, do, das, dos, e, a, o —
não contam). Lista pura, testada; "REV 01: ARQ" e "REVISÃO DE DETALHES" não são genéricos.

A descrição lida vai para `DocumentoRevisao.descricao` (o mesmo campo de hoje) e para o detalhe do evento do
envio. Erro do leitor nunca bloqueia; só o conteúdo lido bloqueia.

**O projetista sempre confere e pode contestar a leitura** (decisão do dono, 2026-10-21). O diálogo do envio
mostra, por documento, o que foi lido do quadro (ou o motivo do bloqueio). Em qualquer linha da tabela acima — inclusive
nos bloqueios por linha vazia ou genérica — ele pode marcar "O carimbo foi lido errado" e digitar a descrição:
- a descrição digitada continua obrigatória e passa pela mesma regra de genérico;
- o envio grava no detalhe do evento `descricao_contestada: { lido, digitado }` (lido = texto ou `null`);
- quem analisa vê na revisão em análise o aviso "Descrição digitada pelo projetista; o carimbo dizia: {lido}", para
  conferir o PDF antes de publicar.
No lote, o documento bloqueado fica de fora com o motivo, como hoje, e a contestação é feita no envio individual
dele (a descrição digitada é por documento, não cabe num lote). Decisão minha, no plano.

### Resultado esperado nas amostras (teste de aceite)

| Arquivo | Revisão | Esperado |
|---|---|---|
| PECR3-ELE-EX-009-ILU-R01 | R01 | "REVISÃO ARQUITETURA TÉRREO" — passa (não é só genérico) |
| PAAUM-HID-EX-001-SAF-TER-R01 | R01 | "PRESSURIZAÇÃO AGUA FRIA" |
| PAGUA-ELE-EX-003-TOM-R01 | R01 | "REV 01: ARQ" |
| 2525-EST-EX-DTC-433-R01 | R01 | "ALTERAÇÃO DAS LAJES DO MEZANINO" |
| 25102_EST_EX_DTC_4001_R01 | R01 | "REVISÃO DA LOCAÇÃO DOS BLOCOS B1…" |
| PECR3-PCI-EX-005-DET-R01 | R01 | "ADEQUAÇÃO A ARQUITETURA" |
| PEDF3-ELE-EX-003-TOM-TER-R01 / -004-DIG-R01 | R01 | "CONFORME DOCUMENTO \"20260107101433_RDM_…\"" |
| 2382-PMP-UBS-EST-07-EMFM-R02 | R02 | "REVISÃO DE DETALHES" |
| PECAR-ARQ-PE-006-CRT-R01 | R01 | "Mudança dos ambientes Self Velo…" (3 linhas juntadas) |
| 2558_HDR_EX_6001_DTC_R01 | R01 | **bloqueia**: só "01 EMISSÃO INICIAL" (R00); o carimbo também diz `REVISÃO: 00`, que a conferência de hoje já recusa |
| 2558_CLM_EX_8006_DTC_R01 | R01 | **bloqueia** por genérico: "REVISÕES" |

Os testes usam os itens de texto extraídos dessas amostras, recortados ao quadro e ao campo de revisão (sem
nome de cliente, endereço ou CREA), gravados como fixture JSON no repositório. Nunca os PDFs.

## 4. Código com sublinhado

`CODIGO` em `ciclo/carimbo.ts` só reconhece blocos separados por hífen; `2558_HDR_EX_6001_DTC_R00.DWG` e
`25102_EST_EX_DTC_4001` passam sem conferência de código. Aceitar `_` como separador (na leitura e em
`codigoBase`, normalizando para comparar com o nome do arquivo) e `_Rnn` como revisão final. Com teste.

## Restrições

- Toda mudança de estado ou controle passa por `ciclo/service.ts`, `updateMany` condicionado e evento na
  transação (contrato de 2026-10-08). Ação via `defineAction`.
- Migração só acrescenta: valor de enum `em_revisao` e a coluna nova com default. O índice parcial de "um ativo"
  deve cobrir `em_revisao` (ou a regra fica no serviço com `updateMany` condicionado — decisão do builder).
- Partes puras (regras, leitura do quadro, genérico) sem Prisma/Next, com testes.
- Smoke: estender `smoke:ciclo-documental` com envio automático (ligado/desligado), marcar / cancelar / sair
  sozinha na publicação da R01, e a obra vendo a R00 marcada pelo link público.
- `docs/manual/` e `docs/manual/novidades.md` atualizados (linguagem de usuário).

## Deixado ao builder

Cor exata da tag; layout do item de menu e do lote; como o diálogo de envio mostra a descrição lida; heurística
de tolerância de alinhamento na leitura do quadro (calibrar nas amostras); nome dos arquivos novos.

## Estado (2026-10-21)

**Feito** (branch `dev-vscode`, commits `47e6b393..bf19ffdd` + este de documentação): envio automático ao cliente
na publicação (config por projeto, padrão ligado, "Publicar já envia ao cliente" em Ciclo dos documentos);
controle "Em revisão" (marcar, cancelar com motivo, sair sozinha ao publicar a próxima, filtro na barra de
Arquivos, selo no link público e na linha de Desenvolvimento, aviso "Revisão solicitada" aos responsáveis,
marcação em lote); descrição lida do quadro de revisão do carimbo no "Enviar para análise", com recusa de linha
vazia ou genérica e contestação do projetista ("O carimbo foi lido errado"); conferência de código com
sublinhado. Manual (`docs/manual/projetos/projetos.md`) e `docs/manual/novidades.md` atualizados.

**Verificado:** `npm test` (608 arquivos, 6862 testes), `npm run lint` (0 erros), `tsc --noEmit` do app e do
servidor (`tsconfig.server.json`), `npm run smoke:ciclo-documental` (inclui envio automático ligado/desligado,
marcar/cancelar/sair sozinha na R01) e `npm run build`, todos com saída 0. Telas conferidas no dev server
(1366x768 e 390x844, claro e escuro no link público) com prints e roteiro em
`prints-auditoria/2026-10-21_revisao-cliente/` (gitignored; `LEIAME.md` lista cada print).

**Deploy:**
1. `npx prisma migrate deploy` (2 migrações: `20261021100000_ciclo_revisao_cliente` e
   `20261021100100_controle_em_revisao_um_ativo`).
2. Reiniciar o serviço.
3. Nenhum `db:seed` (sem permissão nova: "Marcar em revisão" usa a de liberar para obra).
