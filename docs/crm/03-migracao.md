# 03 — Plano de migração de dados do CRM

> Gerado pelo prompt P4, **reescrito** após a auditoria rodar em produção (2026-08-13).
> Base: `00-auditoria.md`, `01-decisoes.md`, `02-schema.md`.
> Nenhuma migration foi escrita. O único código é `scripts/auditoria-crm.ts`, **somente leitura**.

---

## §0 — Conclusão: não há migração de dados relevante a fazer

A auditoria em produção resolveu o GATE. O plano original de 4 fases
(EXPAND → BACKFILL → SWITCH → CONTRACT) **foi descartado** — seria cerimônia cara para mover 8 registros.

O número que decide não é o volume do Comercial; é o **contraste** entre ele e o resto do sistema:

| Comercial | | Resto do sistema | |
|---|---|---|---|
| `lead` | **8** | `projeto` | **31** |
| `proposta` | **1** (com **0 itens**) | `cliente` | **46** |
| `proposta_item` | **0** | | |
| `atividade_lead` | **0** | | |
| `contato_cliente` | **0** | | |
| `oportunidade` | **0** | | |

**O módulo Comercial não é pouco usado — ele é contornado.** O trabalho entra no sistema direto como
`Projeto`: existem 31 projetos e 46 clientes, contra 1 proposta sem itens e nenhuma atividade
registrada. Propostas, contatos e histórico comercial vivem fora do SenaHub hoje.

Isso muda o trabalho de "migrar dados legados" para **"construir um módulo que passe a ser usado"** —
e o plano abaixo cabe numa sessão, não em semanas.

---

## §1 — O plano, inteiro

Quatro passos. Nenhum depende de janela de convivência, feature flag de dados ou backfill idempotente.

### Passo 1 — Backup (obrigatório, mesmo sendo pouco dado)

O mecanismo já existe (`src/lib/backup.ts`, `pg_dump -Fc`, exige `ENABLE_BACKUP=1` + `PG_DUMP_PATH` +
`BACKUP_PATH`). **Validar que o backup presta** antes de seguir:

1. `pg_restore --list <arquivo>.backup` enumera as tabelas — se falhar ou vier curto, o dump está
   corrompido, **parar**.
2. Conferir que `lead`, `cliente`, `proposta`, `anexo_lead`, `projeto` aparecem na listagem.
3. Comparar o tamanho com o backup anterior; queda abrupta = dump truncado.

⚠️ **O dump não contém arquivos.** As **4 linhas de `anexo_lead`** apontam para caminhos relativos em
`STORAGE_BASE_PATH`, espelhado separadamente por `src/lib/backup-storage.ts` (robocopy, alvo
`STORAGE_BACKUP_PATH`). Restaurar só o banco deixa 4 linhas apontando para arquivos que não voltaram —
conferir que o espelho do storage está em dia.

### Passo 2 — Criar o schema novo (aditivo)

Migration aditiva conforme `02-schema.md`: tabelas novas + colunas novas nos models existentes. Nada é
removido, renomeado ou alterado. O Comercial atual continua funcionando sem mudança durante todo o processo.

Pré-requisito bloqueante: o índice único parcial de CNPJ (ADR-03) só pode ser criado depois do Passo 4a.
Hoje **não há** duplicata por documento (0 grupos), mas há por nome — e uma das fusões vai preencher
documento onde faltava.

### Passo 3 — Mover os 8 leads à mão

Com n=8, **script de backfill não se justifica**: escrever, testar e tornar idempotente um script custa
mais que abrir 8 registros. A migração é manual, registro a registro, seguindo a classificação da §2.

Os 8, com o que cada um vira:

| Lead | Etapa hoje | `origem` (texto atual) | Vira |
|---|---|---|---|
| Rbarros Engenharia e Incorporação LTDA | Proposta enviada | *(ver §3)* | `Negociacao` em `PROPOSTA_ENVIADA` |
| CP CONSTRUÇÃO | Proposta enviada | | `Negociacao` em `PROPOSTA_ENVIADA` |
| PLINIO PAIVA | Contratado | | `Negociacao` em `CONTRATADO` |
| MADANO | Contratado | | `Negociacao` em `CONTRATADO` |
| Rbarros Engenharia e Incorporação LTDA | Contratado | | `Negociacao` em `CONTRATADO` |
| Záphis Incorporadora ×3 | Contratado | | 3 × `Negociacao` em `CONTRATADO` |

Todos os 8 nascem com `needsReview = true` — não porque o dado esteja ruim, mas porque **nenhum deles
tem proposta no sistema** para confirmar valores (ver §2).

### Passo 4 — Consolidações

**4a. Duplicatas de `Cliente`** — 3 grupos, resolvidos à mão (ver §4).
**4b. Catálogo de disciplinas** — 24 grafias → catálogo consolidado (ver §5).

---

## §2 — Classificação: por que 100% caiu em "ambíguo"

A auditoria classificou **os 8 leads como ambíguos** (6 por R3, 2 por R4). Isso **não é um achado sobre
qualidade de dado** — é a regra medindo a coisa errada para este contexto.

R3 ("etapa `Contratado` sem proposta") e R4 ("etapa de negócio sem proposta") tratam a ausência de
proposta como anomalia. Mas aqui **a ausência de proposta é o estado normal**: existe 1 proposta em todo
o sistema, e sem itens. As propostas reais são feitas fora do SenaHub.

Duas leituras possíveis, e a escolha é trivial no volume atual:

- Reescrever as regras para não tratar "sem proposta" como sinal quando o sistema inteiro quase não tem
  propostas — trabalho de calibração que só valeria com centenas de leads.
- **Aceitar que os 8 vão para revisão manual** — que é o Passo 3, que já é manual de qualquer forma.

**Adotado: o segundo.** Com n=8 a fila de revisão é o próprio processo de migração, não uma etapa extra.
As regras em `classificarLead()` ficam como estão, documentadas, para o dia em que houver volume.

### Decisões §2.1 e §2.2 — resolvidas por ausência de dado

- **Ordem R6/R7** (lead perdido que já era cliente): **não se aplica**. Zero leads em `Perdido`.
- **Leads arquivados**: **não se aplica**. Zero leads arquivados.

Ambas continuam documentadas em `scripts/auditoria-crm.ts` para quando houver dado que as exercite.

---

## §3 — `Lead.origem`: campo com intenção de canal, preenchido com empreendimento

**Confirmado pelo usuário:** o campo `origem` **era para ser canal de aquisição**. Na prática foi
preenchido com nome de empreendimento:

```
SMERALDA DEL MARE · EDIF. ISA BEACH · EDIF. ARAPIRACA · EDIF. MARMARES - ORÇ E CFF
CAPIBA MALL · EDIF. MARMARES · EDIF. BELA BEACH · RES. PLINIO PAIVA
```

(8 valores, 1 lead cada — nenhum se repete, e `EDIF. MARMARES - ORÇ E CFF` ainda traz escopo colado ao nome.)

### O de-para

Nenhum dos 8 valores é um canal. Todos vão para o canal **"Outro"**, com o texto original preservado em
`origemDetalhada` — nada é descartado.

| `origem` atual | → Canal | → `origemDetalhada` |
|---|---|---|
| todos os 8 valores acima | `Outro` | o texto original, sem alteração |

**Durante a revisão manual (Passo 3)**, quem migrar cada lead deve aproveitar para: preencher o canal
real (a informação existe na cabeça do time, não no banco) e mover o nome do empreendimento para o campo
próprio da `Negociacao`. São 8 registros — cabe fazer direito.

### `CanalAquisicao` e `Campanha` nascem vazios

**Não há dado de origem para migrar.** Os catálogos são semeados com os valores que o time comercial
usar de fato (P6), não derivados do banco. Qualquer tabela de-para além da linha acima seria invenção.

---

## §4 — Duplicatas de `Cliente`

**0 grupos por documento** (o índice único parcial não está bloqueado hoje) e **3 grupos por nome
normalizado**, todos reais:

| Grupo | Registros | Observação |
|---|---|---|
| `madano` | `MADANO` (2×) | Ambos sem documento |
| `zaphis incorporadora` | `Záphis Incorporadora` (3×) | Todos sem documento. ⚠️ **Corrigido em 2026-08-19 (F1.15):** há um **4º** registro da mesma empresa, `Zaphis Inc LTDA` (CNPJ `40.817.865/0001-60`), que **não casou na normalização de nome** — "Inc" não é tratado como forma de "Incorporadora". É ele que tem os 2 projetos, e é ele que sobrevive. Achado na conferência manual exigida por este mesmo §4; mesma empresa confirmada pelo usuário a partir do lead "EDIF. ISA BEACH" contra o projeto `260030 · ISA BEACH 2` |
| `nominal engenharia` | `NOMINAL ENGENHARIA` (sem doc) + `Nominal Engenharia LTDA` (CNPJ `66403270000151`) | A fusão **preenche** o documento que faltava |

A normalização se provou aqui: casar `NOMINAL ENGENHARIA` com `Nominal Engenharia LTDA` exigiu remover o
sufixo societário e a caixa — exatamente o que `normalizarNomeEmpresa()` faz. (O strip de sufixo só roda
quando `tipo = "PJ"`, senão comeria "Sá"/"Me" em nome de pessoa física.)

**18 de 46 clientes estão sem documento** — o índice único parcial (ADR-03) é justamente o que permite
isso: único quando preenchido, livre quando nulo.

### Como fundir (à mão, são 3)

Sobrevivente pela ordem: (1) mais vínculos — projetos, propostas, lançamentos; (2) documento preenchido;
(3) mais antigo. No grupo `nominal engenharia` o critério (2) decide: sobrevive o que tem CNPJ.

A fusão move contatos, leads, propostas, projetos e lançamentos para o sobrevivente, registra no
`AuditLog`, e mantém o absorvido **arquivado com referência ao sobrevivente**. Nada é apagado.

⚠️ Conferir antes de fundir se os `Projeto` vinculados são realmente da mesma empresa — 31 projetos
distribuídos em 46 clientes significa que quase todo cliente tem projeto, e fundir errado move projeto
de obra para o cliente errado.

---

## §5 — Disciplinas (fecha a Q3)

> ⚠️ **Correção:** o catálogo **já existe** — `DisciplinaCatalogo` (`schema.prisma:906`), seedado com 20
> disciplinas (`seed.ts:285`), com sigla, numeração de folha e categoria. Não se cria catálogo novo;
> ver `02-schema.md` §8.1. O que falta é a **FK** — hoje `Disciplina.nome`, `PropostaItem.disciplina` e
> `ItemTabelaPreco.disciplina` são strings livres, e é por isso que existem 24 grafias.

Das 24 grafias de produção, **18 já batem exatamente** com o catálogo. Só **6** precisam de tratamento:

> ⚠️ **Recontagem em 2026-08-19 (F1.15/F1.16), contra produção:** olhando só `Disciplina.nome`, que é o que
> resta consolidar, são **18 grafias distintas** — **12 batem exatas** e **6 precisam de tratamento** (as 6 da
> tabela abaixo, todas confirmadas). O "24 / 18 exatas" somava as três tabelas; `PropostaItem` e
> `ItemTabelaPreco` já foram resolvidos por F1.19/F1.20 e hoje estão com **0 registros sem `disciplinaId`**.
> O catálogo tem **18** entradas, não 20.
>
> ⚠️ **E falta a FK:** `Disciplina` **não tem** `disciplinaId` nem `disciplinaTextoLegado` — F1.19 cobriu
> `PropostaItem`, F1.20 cobriu `ItemTabelaPreco`, e ninguém cobriu `Disciplina`. Sem isso o aceite da F1.21
> não tem como ser cumprido. Registrado como **F1.19c** no `04-plano-fases.md`.

| Grafia em produção | Onde | Vira | Observação |
|---|---|---|---|
| `Ar condicionado (ARC)` | 1 projeto | `Climatização (AVAC)` | colapsa (decisão do usuário) |
| `Exaustão (EXT)` | 1 projeto | `Climatização (AVAC)` | colapsa (decisão do usuário) |
| `Gases` | 1 projeto | `Gás` | colapsa (decisão do usuário) |
| `Lógica/cftv` | 1 projeto | **`Cabeamento` + `CFTV`** | ⚠️ string composta — vira DUAS |
| `Lógica e Cftv` | 1 projeto | **`Cabeamento` + `CFTV`** | ⚠️ string composta — vira DUAS |
| `Dados/Voz, Automação e CFTV` | 1 projeto | **`Cabeamento` + `CFTV`** (+ automação?) | ⚠️ string composta |

### As strings compostas: `Lógica` e `CFTV` são disciplinas DIFERENTES

Confirmado pelo usuário: `Lógica/cftv` e `Lógica e Cftv` são a mesma grafia escrita de dois jeitos —
mas **cada uma mistura duas disciplinas num campo só**. `Lógica` e `CFTV` são entregas distintas.

O catálogo já reflete isso: `Cabeamento` (código `LOG`, categoria ELÉTRICA, numeração 5100) e `CFTV`
(código `SEG`, ELÉTRICA, 5200) são entradas separadas. O seed inclusive já registra a renomeação
histórica `Lógica → Cabeamento` (`seed.ts`, array `RENOMES`) — ou seja, `Cabeamento` **é** a antiga
`Lógica`.

### ⚠️ Não desmembrar automaticamente

Desmembrar uma `Disciplina` composta em duas **não é um `UPDATE` de texto**. `Disciplina` (por-projeto)
carrega, com `onDelete: Cascade` na maioria:

- `valor` (`Decimal`) — **é a base do pagamento ao projetista**; dividir em duas exige decidir o rateio
- `RevisaoDisciplina` — log imutável de revisões (RV00, RV01…), com unique `(disciplinaId, numero)`
- `DisciplinaResponsavel` — quem responde pela entrega
- `DocumentoDisciplina`, uploads e apontamentos vinculados

Um desmembramento automático teria de escolher para qual das duas novas disciplinas vão o valor, as
revisões e os arquivos — decisão que o script não tem como tomar.

**São 3 projetos.** Tratar à mão, com o responsável pelo projeto junto, decidindo caso a caso se
desmembra (e como rateia) ou se mantém como uma disciplina só com o nome corrigido.

**Levantamento de 2026-08-19 — o que cada uma carrega de fato:**

| Grafia | Projeto | Cliente | `valor` | Revisões | Uploads | Responsáveis |
|---|---|---|---|---|---|---|
| `Dados/Voz, Automação e CFTV` | `260023 · BFF'S LOUNGE - EASY MALL - TORRE` | Renata Calheiros | **NULL** | **2** | 18 | 1 |
| `Lógica e Cftv` | `260014 · CLINICA GASTROCLINICA ILHA DO LEITE` | Tecomat Engenharia Ltda | **NULL** | 0 | 12 | 1 |
| `Lógica/cftv` | `260020 · ESCOLA IGNACIA SURUBIM` | Prefeitura Municipal de Surubim | **NULL** | 0 | 8 | 1 |

**Boa notícia: o rateio de `valor` não existe.** As três estão com `valor = NULL`, então a decisão mais
espinhosa que este §5 antecipava — dividir a base de pagamento ao projetista — **não se aplica a nenhuma das
três**. O que continua exigindo decisão humana é o destino dos **38 uploads** e das **2 revisões** do projeto
260023: desmembrar em `Cabeamento` + `CFTV` obriga a dizer para qual das duas vai cada arquivo.

> ## ✅ RESOLVIDO — F1.21 executada em produção em 2026-08-19
>
> As 6 grafias abaixo foram consolidadas por `scripts/consolidar-disciplinas-f121.ts`: **6 FK
> resolvidas, 3 disciplinas `CFTV` criadas**. `disciplina` sem FK = **0**. As duas decisões que
> travavam esta seção foram tomadas pelo dono e estão no `PLANO` do script:
>
> 1. **Compostas → duas disciplinas, CFTV nascendo vazia.** O histórico (38 uploads, 2 revisões)
>    fica na `Cabeamento`; a separação vale para entregas novas. Sem reclassificação arquivo a
>    arquivo — era a opção mais cara e a decisão foi não pagá-la.
> 2. **260023 mantém DUAS linhas** de `Climatização (AVAC)` (`Ar condicionado (ARC)` + `Exaustão
>    (EXT)`), em vez de fundir: são entregas separadas naquele contrato.
>
> A decisão 2 fixou também que **a exibição continua usando `disciplinaTextoLegado`**, não o nome do
> catálogo — com duas linhas na mesma FK, preferir o catálogo mostraria "Climatização (AVAC)" duas
> vezes e apagaria a distinção. Detalhes em `06-progresso.md`, entrada F1.21.

**Complemento medido em 2026-08-19, no backfill da F1.19c em produção — duas coisas que esta tabela
não dizia:**

As **3 grafias que colapsam** (`Ar condicionado (ARC)`, `Exaustão (EXT)`, `Gases`) estão
**completamente vazias**: `valor` NULL, 0 revisões, 0 uploads, 0 responsáveis. Para elas a F1.21 é só
apontar a FK — todo o trabalho de decisão está nas 3 compostas da tabela acima.

⚠️ **Colisão no 260023, ainda sem decisão:** esse projeto tem **as duas** grafias que colapsam para
`Climatização (AVAC)` — `Ar condicionado (ARC)` e `Exaustão (EXT)`. Aplicar a regra como está escrita
deixa o projeto com **duas `Disciplina` apontando para a mesma entrada do catálogo**. O banco aceita
(`Disciplina` não tem unique em `(projetoId, disciplinaId)`), então não é erro — é uma escolha:
fundir numa só ou manter as duas. Como ambas estão vazias, fundir não perde nada.

### Como aplicar o resto

As outras 21 grafias (18 exatas + as 3 que colapsam) ganham FK para a entrada correspondente do
`DisciplinaCatalogo`, com o texto original preservado em `disciplinaTextoLegado` antes da conversão
(`02-schema.md` §2.8) — nada se perde, e a consolidação fica auditável.

---

## §6 — Q2 fechada: descartar o `Oportunidade` órfão

**0 registros em produção.** Produção é a autoridade — a hipótese da auditoria (feature construída, nunca
conectada ao fluxo, nunca usada) está confirmada.

O model `Oportunidade`, `AtividadeOportunidade`, `modules/comercial/oportunidades/`,
`components/comercial/oportunidades-view.tsx` e a rota `/comercial/oportunidades` podem ser
**descartados** — sem migração de dado, porque não há dado.

Remover é trabalho de código (fase de implementação), não de migração. Até lá ficam órfãos e inertes.

---

## §7 — Checklist de validação

O invariante monetário do plano original **não serve aqui**: `SUM(PropostaItem.valor) = 0.00` porque não
há itens. Provar que zero continua zero não prova nada. O que de fato tem valor em risco:

### Nada pode sumir

- [ ] `projeto` = **32** — é onde está o trabalho real do escritório. (Eram 31 na auditoria de 2026-08-14; medido em 32 em 2026-08-19. O invariante que vale é **não mudar durante a fusão**, não o número absoluto.)
- [ ] `cliente` = **46 linhas na tabela, sempre** — a fusão arquiva (`fundidoEmId`), **não apaga**. O que cai é
      o número de **não-fundidos**: 46 → **41**, por 5 fusões (MADANO 1 + Záphis 3 + Nominal 1). A conta "46 − 3 = 43" do texto original supunha um par por grupo e não sobrevive ao 4º Záphis; conferir sempre contra o `AuditLog` das fusões, como este item já mandava
- [ ] `lead` = **8** — os leads não são apagados, viram `Negociacao` mantendo o registro de origem
- [ ] `anexo_lead` = **4**, e os 4 arquivos continuam abrindo (apontam para `STORAGE_BASE_PATH`)
- [ ] `tabela_preco` = 1, com seus itens

### A proposta única

- [ ] A única `Proposta` continua existindo, com `numero` e `token` **inalterados**
- [ ] `PropostaSequencia.ultimo` inalterado — a próxima proposta criada não pode colidir com o número já emitido
- [ ] `/a/proposta/<token>` ainda abre

### Integridade

- [ ] Zero `Negociacao` com `clienteId` inexistente
- [ ] Os 8 leads migrados têm `needsReview = true` e aparecem na lista de revisão
- [ ] Nenhum projeto trocou de cliente por causa das fusões do §4

---

## §8 — Riscos

1. **Fusão de cliente pode mover projeto para a empresa errada.** 31 projetos em 46 clientes: quase todo
   cliente tem obra vinculada. Conferir os projetos de cada grupo **antes** de fundir. É o risco mais
   concreto deste plano.

2. **Os 4 anexos de lead apontam para o storage, não para o banco.** Backup do banco não os inclui
   (§1, Passo 1).

3. **`contato_cliente = 0` em 46 clientes.** Os campos de LGPD (T1) não têm dado a migrar, e o serviço de
   deduplicação de **contatos** (P8, metade contato) nasce **sem nenhum dado real para exercitar** — não
   dá para validar contra produção porque não há contato nenhum. Não muda o schema, mas uma fase posterior
   não deve assumir que essa metade está testada.

4. **O soft delete em `Cliente` respinga fora do CRM** (`02-schema.md` §8.6): `Cliente` é lido por
   `Projeto`, `Lancamento`, `Documento`, `DocumentoJuridico`, `CustoOrcamento`. Com 46 clientes e 31
   projetos, ligar o filtro automático sem revisar todos esses usos pode esconder registros em módulos
   que ninguém está olhando. Tarefa isolada, com grep completo antes.

5. **Token e numeração de proposta são imutáveis** — mesmo sendo 1 proposta, o `numero` e o `token`
   podem estar num e-mail fora do nosso controle.

6. **O verdadeiro risco não é técnico: é de adoção.** O Comercial está sendo contornado hoje. Migrar 8
   leads é trivial; fazer o time passar a registrar propostas e contatos no sistema é o problema real, e
   nenhum plano de migração resolve isso. Vale considerar, nas fases de implementação, o que torna o
   registro mais fácil que a planilha/Word que o time usa hoje.

---

*Q2 e Q3 fechadas por este documento. Nomenclatura `Negociacao` aprovada; `DisciplinaPadrao` cancelado
(o catálogo já existia — ver §5). Nada bloqueia o P5.*
