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
| `zaphis incorporadora` | `Záphis Incorporadora` (3×) | Todos sem documento |
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

## §5 — Catálogo de disciplinas (fecha a Q3)

24 grafias distintas em produção, entre `Projeto.Disciplina.nome` e `ItemTabelaPreco.disciplina`
(`PropostaItem` tem 0 registros, então não contribui).

### Decisões do usuário

| Grupo | Decisão | Vira |
|---|---|---|
| `Climatização (AVAC)` (4) + `Ar condicionado (ARC)` (1) + `Exaustão (EXT)` (1) | **Colapsam** | uma disciplina só |
| `Gases` (1) + `Gás` (1) | **Colapsam** | uma disciplina só |
| `Cabeamento` (4) + `CFTV` (2) + `Lógica/cftv` (1) + `Lógica e Cftv` (1) + `Dados/Voz, Automação e CFTV` (1) | **NÃO colapsam** | permanecem separadas |

### ⚠️ Pendência residual

Dentro do grupo que **não** colapsa, `Lógica/cftv` e `Lógica e Cftv` diferem **apenas em pontuação e
caixa** — são quase certamente a mesma disciplina digitada de dois jeitos, não duas entregas distintas.

Vale uma conferida antes do P6 semear o catálogo: manter as duas cria duas entradas que ninguém
consegue distinguir na hora de escolher.

### Como aplicar

O catálogo `DisciplinaPadrao` é semeado com a lista consolidada (P6). Cada `Disciplina.nome` e
`ItemTabelaPreco.disciplina` existente ganha FK para a entrada correspondente; o texto original é
preservado em `disciplinaTextoLegado` antes da conversão (`02-schema.md` §2.8), então nada se perde e a
consolidação é auditável depois.

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

- [ ] `projeto` = **31** — é onde está o trabalho real do escritório
- [ ] `cliente` = **46**, ou menos **exatamente** pelo número de fusões do §4 (esperado: 46 − 3 = 43 se
      as 3 fusões colapsarem um par cada; conferir o número exato contra o `AuditLog` das fusões)
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

*Q2 e Q3 fechadas por este documento. Pendências: a conferida em `Lógica/cftv` vs `Lógica e Cftv` (§5),
e a confirmação da nomenclatura `Negociacao`/`DisciplinaPadrao` (`02-schema.md` §8.1). Próximo: P5.*
