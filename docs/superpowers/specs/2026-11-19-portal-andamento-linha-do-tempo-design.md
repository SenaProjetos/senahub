# Portal do cliente — andamento por fase e linha do tempo (itens 2 e 3)

Data: 2026-11-19 · Série: reformulação do portal do cliente (spec 2026-11-18, itens 2/3; item 1 = entregas, já entregue)

## Objetivo

O cliente abre o projeto no portal e vê, sem ligar para a equipe:

1. **Andamento**: em que pé está cada disciplina, fase por fase (EP, BS, EX).
2. **Linha do tempo**: o que já aconteceu — pranchas compartilhadas, liberadas para obra, fases concluídas.

## Decisões do dono (2026-11-19)

- **D1 — Sem datas futuras.** O cliente vê só a situação e o que já aconteceu. O "Prazo" de cada disciplina sai do
  portal; o prazo do contrato (no topo) fica — é o que ele assinou.
- **D2 — "Concluída" só quando o cliente recebeu.** A aprovação interna de uma fase sozinha não basta: a fase só conta
  como concluída para o cliente quando ao menos uma prancha dela está compartilhada ou liberada para obra.
- **D3 — Basta uma prancha.** Exigir todas faria uma prancha esquecida segurar a fase para sempre.
- **D4 — Calcular na leitura (caminho 1).** Nenhuma tabela nova, nenhuma escrita nova, nenhuma migração. O item 4
  (avisos) reaproveitará a mesma função.
- **D5 — A linha do tempo mostra só o que está nas Entregas hoje.** O cliente nunca lê sobre uma prancha que não
  consegue abrir; revisão substituída, revogada ou arquivada sai da linha do tempo junto com as Entregas.

## Por que não usar o status da fase direto

O status de `DisciplinaEtapa` é o fluxo **interno** projetista ↔ coordenação: `entregue` = o projetista mandou para
análise, `aprovado` = a coordenação aprovou, `em_revisao` = reaberta ou com apontamento interno. Nenhum deles quer dizer
"o cliente recebeu". Mostrar isso faria o cliente ver vaivém interno ("Em revisão") e "concluída" de algo que ele nunca
recebeu.

## Regras

Tudo em uma função pura nova, `src/modules/portal/andamento.ts` (sem Prisma, sem `server-only`, testada).

### Fonte: o mesmo conteúdo das Entregas

A entrada é o `ConteudoPublico` de `conteudoDoAlcance(alcanceDoPortal(projeto))` — exatamente o que o card Entregas
mostra (revisão marcada, arquivo validado, fora da lixeira, com bloqueio/ausência marcados). Assim Entregas, Andamento e
Linha do tempo nunca discordam. Dele saem, por situação (`compartilhado` | `liberado_obra`) e disciplina, as pastas de
fase (`PastaFase.chave` = id da fase no catálogo, ou a chave de "Sem fase") e os arquivos (uploads).

Uma consulta a mais (`andamento-queries.ts`, `server-only`) completa:

- **Fases de cada disciplina** (`DisciplinaEtapa`: `etapaId`, sigla/nome da fase, `status`, `entregueEm`,
  `percentual`, `ordem`) e, para disciplina sem fase, `Disciplina.status`/`entregueEm`.
- **Documento de cada upload** do conteúdo (`Upload.documentoId`, `revisaoId`) — a linha do tempo conta **pranchas**
  (documentos), não arquivos (PDF + DWG da mesma prancha = 1).
- **Data da marcação** de cada documento em cada situação:
  - dentro do ciclo documental: `ControleRevisao.aplicadoEm` do controle ativo (`removidoEm: null`) da revisão
    marcada, tipo `enviado_cliente` (compartilhado) ou `liberado_obra`;
  - fora do ciclo: o `DocumentoEvento` `situacao_marcada` mais recente do documento com `detalhe.pasta` = rótulo da
    situação e `detalhe.revisao` = número da revisão marcada;
  - nenhum dos dois (marcação antiga, sem evento): **sem data**. Conta para concluir a fase, não entra na linha do
    tempo — não inventamos data.

### Situação da fase para o cliente

| Situação | Quando |
|---|---|
| Não iniciada | `status = aguardando` |
| Concluída | `status = aprovado` **e** ao menos um documento da mesma fase (mesmo `etapaId` = `faseId` do documento) da mesma disciplina está nas Entregas, em qualquer das duas situações |
| Em andamento | qualquer outro caso (inclui `em_andamento`, `entregue`, `em_revisao`, aprovada sem prancha enviada, e prancha compartilhada antes da aprovação) |

- **Data da conclusão** = a mais recente entre `entregueEm` da fase (gravado na aprovação) e a **primeira** data de
  marcação entre os documentos dessa fase nas Entregas. Se nenhuma das duas existir, a fase aparece "Concluída" sem
  data.
- **Disciplina sem fase** (projetos antigos): a mesma regra aplicada à disciplina inteira — `Disciplina.status` e
  `Disciplina.entregueEm`, e "ao menos um documento da disciplina nas Entregas" (qualquer fase ou sem fase).
- Documento cuja fase é "Sem fase" ou não é uma fase da disciplina não ajuda a concluir fase nenhuma; aparece na linha
  do tempo e nas Entregas normalmente.

### Percentual concluído

- Disciplina com fases: soma do `percentual` das fases concluídas ÷ soma do `percentual` de todas as fases (o plano
  pode estar em rascunho e não fechar 100). Soma zero → fases concluídas ÷ total de fases.
- Disciplina sem fase: 0 ou 100.
- Projeto: média simples das disciplinas, arredondada. Sem disciplina = 0.
- Os pesos fixos por status (`PESO` em `portal/queries.ts`) saem. A lista `/portal` usa a mesma função.

### Linha do tempo

- Um item por grupo **(dia de São Paulo, disciplina, tipo)**, tipos: `compartilhado` ("N pranchas compartilhadas com
  você"), `liberado_obra` ("N pranchas liberadas para obra"), `fase_concluida` ("Fase EP concluída"; um item por fase).
  Singular para 1 ("1 prancha compartilhada com você").
- Ordem: do mais novo para o mais antigo; empate no mesmo dia: liberadas, compartilhadas, fases concluídas; depois
  disciplina pela ordem do projeto.
- Documento sem data de marcação fica fora. Fase concluída sem data fica fora.
- O dia vem de `diaDeSaoPaulo(data)` (`lib/data.ts`) — um `aplicadoEm` às 22h BRT é do dia dele, não do seguinte.

## Tela (`/portal/[projetoId]`)

- **Card "Andamento"** substitui o card "Disciplinas", título "Andamento (X% concluído)". Uma linha por disciplina:
  nome + chips das fases na ordem: `✓ EP Concluída 02/10`, `● BS Em andamento`, `○ EX Não iniciada`. Texto + ícone,
  nunca só cor (tokens `*-text` AA). Disciplina sem fase: um chip com a situação. Chips com `flex-wrap`; sem rolagem
  lateral a 390 px. Vazio: "Nenhuma disciplina cadastrada."
- **Card "Linha do tempo"** novo, entre Andamento e Entregas: data à esquerda (fonte mono), disciplina e texto. Mostra
  os 10 grupos mais novos e "Mostrar tudo" (componente cliente pequeno; os dados já vêm todos). Vazio: "Ainda não há
  entregas neste projeto."
- **Carregamento**: o conteúdo das Entregas é lido uma vez por requisição (`cache()` do React em volta da leitura do
  portal) e serve os três cards. Andamento, Linha do tempo e Entregas ficam no mesmo `Suspense` e no mesmo
  `LimiteErroEntregas`: falhou a leitura, só esse bloco cai; o topo (nome, prazo do contrato, endereço) e "Documentos
  recebidos" seguem.
- **Lista `/portal`**: o percentual de cada projeto passa a vir da mesma função (uma leitura das Entregas por projeto
  do cliente — clientes têm poucos projetos).

## Fora do escopo

Avisos ao cliente (item 4), comentários na prancha (item 5), visualizador 3D (item 7), qualquer mudança no fluxo
interno, no ciclo documental, nas permissões ou no banco.

## Verificação

- `src/modules/portal/andamento.test.ts`: as três situações, aprovada sem prancha, prancha antes da aprovação, data
  da conclusão (máximo), documento "Sem fase", disciplina sem fase, percentual com plano que não soma 100, contagem por
  documento (PDF + DWG = 1), marcação sem data fora da linha do tempo, agrupamento e ordem, dia de São Paulo às 22h BRT.
- `npm run smoke:portal-andamento` (banco de dev): projeto throwaway com fases e documentos; prancha marcada fora do
  ciclo (evento) e dentro do ciclo (controle); confere andamento, percentual da lista igual ao do detalhe, revisão
  retirada saindo da linha do tempo, outro cliente nunca aparece.
- Auditoria em tela (protocolo, nível 2): 1366×768 e 390×844, claro e escuro, `scrollWidth` = 390.
