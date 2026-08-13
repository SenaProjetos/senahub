# 03 — Plano de migração de dados do CRM

> Gerado pelo prompt P4. Base: `00-auditoria.md`, `01-decisoes.md`, `02-schema.md`.
> **Nenhuma migration foi escrita** (instrução explícita do P4). O único código produzido é
> `scripts/auditoria-crm.ts`, que é **100% somente leitura** e pode rodar em produção com segurança.

---

## ⛔ GATE — este plano ainda não pode ser executado

O plano abaixo está escrito para o cenário de **volume relevante em produção**. Isso ainda não foi
verificado: o banco de dev contém apenas dados de `seed:demo` (8 leads fabricados), e os números que
saem dele **não servem** para decidir nada.

**Passo 1, obrigatório, antes de qualquer outra coisa:**

```bash
npx tsx --tsconfig tsconfig.server.json scripts/auditoria-crm.ts
```

Rodar **contra o banco de produção** (o script não escreve nada) e colar a saída na seção §1.

Conforme o resultado, o plano toma um de três caminhos:

| Volume em produção | O que fazer com este plano |
|---|---|
| **Centenas/milhares de leads** | Executar como está escrito: EXPAND → BACKFILL → SWITCH → CONTRACT |
| **Dezenas de leads** | **Encolher**: o aparato de 4 fases vira cerimônia cara. Migrar num passo só, com backup antes e conferência manual de 100% dos ambíguos (é viável revisar 30 registros à mão; não é viável revisar 3.000) |
| **Comercial ainda sem uso real** | **Descartar** este plano: não há dado a migrar, o schema novo nasce limpo e o P4 inteiro deixa de se aplicar |

Não avançar para o P5 assumindo o caminho completo sem esse número na mão.

---

## §1 — Resultado da auditoria pré-migração

**Status: ⏳ pendente de execução contra produção.**

Preencher com a saída do script (data, banco e os blocos 1 a 7):

```
(colar aqui a saída de scripts/auditoria-crm.ts rodado em PRODUÇÃO)
```

Resumo a extrair dessa saída — são os números que governam todo o resto:

| Métrica | Valor (prod) | Por que importa |
|---|---|---|
| Total de leads | — | Decide o caminho no GATE acima |
| Bucket `prospeccao_pura` | — | Migram automaticamente, sem revisão |
| Bucket `oportunidade_real` | — | Migram automaticamente + geram `Negociacao` |
| Bucket `ambiguo` | — | Cada um vira `needsReview = true` e entra na fila de revisão (§6) |
| Leads arquivados | — | Decisão pendente §2.2 |
| Etapas customizadas (fora das 5 do seed) | — | Sem mapeamento automático — viram ambíguos (regra R5) |
| Duplicatas de `Cliente` por documento | — | **Bloqueiam** o índice único parcial de CNPJ (ADR-03) |
| Valores distintos de `Lead.origem` | — | Cada um precisa de linha no de-para (§4) |
| Grafias distintas de disciplina | — | Insumo do catálogo `DisciplinaPadrao` (Q3) |
| Registros em `Oportunidade` | — | Fecha a decisão Q2 |
| Soma de `PropostaItem.valor` | — | **Invariante**: tem de ser idêntica no fim (§9) |

---

## §2 — Regras de classificação dos Leads

As regras vivem em `classificarLead()` (`scripts/auditoria-crm.ts`), como função pura e exportada —
mesma abordagem de `saudeProjeto`/`caminho-critico`/`encargos` no resto do sistema: lógica de negócio
testável, sem I/O. A primeira regra que casa vence.

| Regra | Condição | Bucket | Racional |
|---|---|---|---|
| **R1** | Tem proposta com status `aceita` | `oportunidade_real` | Prova mais forte que existe no schema: houve contrato |
| **R2** | Tem qualquer proposta emitida | `oportunidade_real` | Proposta emitida = negociação real, não prospecção |
| **R3** | Etapa `Contratado`, **sem** proposta | `ambiguo` | Contraditório: fechou negócio sem proposta no sistema |
| **R4** | Etapa `Em negociação`/`Proposta enviada`, sem proposta | `ambiguo` | Negociação correu fora do sistema, ou o dado está incompleto |
| **R5** | Etapa fora das 5 do seed | `ambiguo` | Etapa criada por admin — sem significado inferível |
| **R7** | Virou `Cliente` **e** tinha `valorEstimado`, sem proposta | `ambiguo` | Houve negócio real mesmo sem proposta registrada |
| **R6** | Etapa `Perdido`, sem nenhum sinal acima | `prospeccao_pura` | Prospecção que não vingou |
| **R8** | Etapa inicial (`Orçamento`), sem proposta | `prospeccao_pura` | O caso saudável: prospecção em andamento |

### §2.1 — Decisão em aberto: ordem entre R6 e R7

R7 roda **antes** de R6 de propósito. Um lead em `Perdido` que já tinha sido convertido em `Cliente`
e tinha valor estimado é uma **perda de negociação real**, não uma prospecção fria descartada.

Se a ordem fosse invertida, esses registros cairiam em `prospeccao_pura`, nunca virariam `Negociacao`,
e **sumiriam do denominador da taxa de conversão** que o P17 vai calcular — o relatório mostraria uma
conversão artificialmente alta, porque as perdas teriam desaparecido da base.

⚠️ **Isto é uma decisão de negócio, não técnica.** Se a leitura correta no seu processo for "perdido é
perdido, não interessa se virou cliente", basta inverter a ordem — mas então a métrica de conversão
precisa documentar que exclui esses casos.

### §2.2 — Decisão em aberto: leads arquivados

`Lead.arquivado` é **ortogonal** ao bucket — um lead arquivado ainda é, em essência, prospecção ou
oportunidade. Por isso não participa da classificação; o script conta os arquivados à parte.

Duas leituras possíveis, ambas defensáveis:

- **(a)** `arquivado = true` → `excluidoEm = <data da migração>` no modelo novo. Some das listas por
  padrão (o soft delete do ADR-11 já filtra automaticamente). Simples, mas **perde a informação** de
  que foi um arquivamento de negócio, não uma exclusão.
- **(b)** `arquivado = true` → migra como registro **vivo**, com status terminal (`DESCARTADO` para
  prospecção, `CANCELADO` para negociação). Preserva a semântica, mas os registros continuam
  aparecendo nas listas até alguém filtrar.

*Recomendação: (b).* Arquivar no sistema antigo era o jeito de tirar da tela sem perder o registro —
`DESCARTADO`/`CANCELADO` no modelo novo diz a mesma coisa com mais precisão, e mantém o lead no
denominador das métricas históricas. Precisa da sua confirmação.

---

## §3 — Deduplicação de Empresas

O `Cliente` de hoje já é a "Empresa" do modelo novo (ADR-01) — **não há criação de entidade nova**,
logo não há "de-para" de empresas. O trabalho é achar e fundir os duplicados que já existem.

### Sinais, do mais forte ao mais fraco

| Sinal | Normalização | Força | Ação |
|---|---|---|---|
| CNPJ/CPF | só dígitos (`normalizarDocumento`) | **Forte** — identidade legal | Funde automaticamente se todo o resto for compatível |
| Nome | minúsculo, sem acento/pontuação, sufixo societário removido **só quando PJ** (`normalizarNomeEmpresa`) | Média | Sugere, nunca funde sozinho |
| Domínio do site | host normalizado | Média | Sugere |
| Domínio do e-mail | `dominioCorporativo` — ignora gmail/hotmail/etc. | **Fraca** | Só sugere; provedor público nunca conta |

> A remoção de sufixo societário é condicionada a `tipo === "PJ"` porque `Cliente.nome` guarda nome de
> **pessoa** quando `tipo = PF` — sem essa guarda, "Sá" (que vira `sa` depois de tirar o acento) e um
> "Me" inicial seriam comidos como se fossem sufixo de razão social.

### Empate — o que fazer quando dois registros disputam

Nunca resolver automaticamente. Ordem de desempate para **escolher o sobrevivente**:

1. O que tem mais vínculos (propostas + projetos + lançamentos) — mover menos coisa erra menos.
2. Em empate, o que tem `documento` preenchido.
3. Em empate, o mais antigo (`createdAt`) — é o cadastro original.
4. Persistindo empate: **não funde**, marca os dois com `needsReview` e deixa para decisão humana.

A fusão em si (P8) move contatos, prospecções, negociações, propostas, projetos e timeline para o
sobrevivente, registra no `AuditLog` e mantém o absorvido **arquivado com referência ao sobrevivente**.
Nada é apagado — requisito explícito do P8 item 4.

### Pré-requisito bloqueante

O índice único parcial de CNPJ (ADR-03) **falha na criação** se existir qualquer duplicata de
`documento` preenchido. O bloco 3 do script de auditoria é justamente essa verificação: se voltar
qualquer grupo, resolver **antes** da migration, não durante.

---

## §4 — `Lead.origem` (texto livre) → Canal + Origem detalhada + Campanha

Hoje `origem` é um `String?` digitado à mão. Vira três coisas estruturadas: `canalId` (FK para
`CanalAquisicao`), `origemDetalhada` (texto complementar) e `campaignId` (FK para `Campanha`).

### Tabela de-para

**Só pode ser escrita depois de ver os valores reais** — o bloco 4 do script lista cada valor distinto
com sua contagem. Formato a preencher:

| `origem` (texto atual) | → Canal | → Origem detalhada | → Campanha | Leads |
|---|---|---|---|---|
| *(preencher a partir da saída do script)* | | | | |

Os quatro valores que aparecem no banco de **demo** (`Indicação`, `Site`, `Anúncio`, `Feira`) são
strings do seed — **não** representam o vocabulário real do time comercial. Não usar como base.

### Regra do que não casar

Todo valor sem correspondência vai para o canal **"Outro"**, com o texto original preservado em
`origemDetalhada` — nunca descartado. Isso garante que nenhuma informação se perde e que a revisão
posterior consegue reclassificar sem consultar backup.

Valores vazios/nulos ficam com `canalId = null` (não inventar "Outro" para quem nunca teve origem —
seria fabricar dado que não existe).

---

## §5 — Preservação de IDs e relações

Princípio: **nenhum `id` existente muda**. Todo model do sistema usa `cuid()`; a migração não recria
registros, só adiciona colunas e tabelas.

| Registro | O que acontece com o ID |
|---|---|
| `Cliente` | Preservado. Ganha colunas novas (`status`, LGPD, soft delete) |
| `ContatoCliente` | Preservado. Ganha LGPD + `createdAt` |
| `Lead` | **Preservado** — o mesmo registro físico vira a prospecção nova. Não é recriado |
| `Proposta` | Preservado, incluindo `numero`, `token`, `(ano, sequencial)` — **intocáveis** (§ risco 1) |
| `PropostaItem` | Preservado. `disciplina` (texto) copiado para `disciplinaTextoLegado` antes de virar FK |
| `Negociacao` | **Novo registro** — nasce do lead classificado como `oportunidade_real`, guardando `leadId` como origem |
| `AtividadeLead` | Preservado, congelado. As novas `Atividade` são registros novos; as antigas não são convertidas nem apagadas |

O vínculo `Lead → Negociacao` é `@unique` (02-schema §5): uma prospecção gera no máximo uma
negociação, o que torna o backfill **idempotente por construção** — rodar duas vezes não cria duas
negociações para o mesmo lead.

---

## §6 — `needsReview` e a fila de revisão

Todo registro migrado com qualquer ambiguidade recebe `needsReview = true` (campo já previsto no
`02-schema.md` em `Lead` e `Negociacao`).

Recebem a flag:
- Todo lead do bucket `ambiguo` (regras R3, R4, R5, R7)
- Toda empresa que entrou em empate de dedup não resolvido (§3)
- Toda `origem` que caiu em "Outro" (§4)
- Toda proposta histórica que ganhou negociação sintética (P14 item 2)

**A fila de revisão precisa existir antes do SWITCH**, senão a flag vira lixo que ninguém olha. Forma
mínima: uma lista filtrável em `/comercial` (`?needsReview=1`) mostrando o registro, o **motivo**
(a mensagem da regra que classificou — por isso `classificarLead` devolve `motivo`, não só o bucket)
e as ações de confirmar/reclassificar. Confirmar limpa a flag e registra no `AuditLog`.

Dimensionamento: se a auditoria em produção apontar centenas de ambíguos, a fila precisa de ações em
lote; se apontar dezenas, uma lista simples resolve. **Decidir com o número na mão** (§1).

---

## §7 — Reversibilidade

| Fase | Como desfazer | Perde algo? |
|---|---|---|
| **EXPAND** | `DROP` das tabelas/colunas novas. Nada antigo foi tocado, o sistema atual continua funcionando o tempo todo | Não |
| **BACKFILL** | `DELETE` dos registros criados pelo backfill (identificáveis: `Negociacao` nasce só do backfill) + `UPDATE` limpando as colunas novas | Não — o dado antigo nunca foi alterado, só lido |
| **SWITCH** | Desligar a feature flag: a UI volta a ler o modelo antigo, que continua íntegro | Perde-se o que foi **criado** pela UI nova durante a janela (ver risco 3) |
| **CONTRACT** | **Irreversível sem restore de backup** — é a fase que remove o antigo | Sim, por definição |

Por isso o CONTRACT **não é executado agora** e não tem data marcada — só depois de semanas de
operação estável, e com decisão explícita.

O que torna EXPAND e BACKFILL seguros é serem **puramente aditivos**: nenhuma coluna existente é
alterada, renomeada ou removida; nenhum valor antigo é sobrescrito. É por isso que
`FunilEtapa`, `AtividadeLead`, `AtividadeOportunidade` e `Lead.etapaId` ficam órfãos mas **vivos** até
o CONTRACT — são a rede de segurança.

---

## §8 — Backup obrigatório antes de cada etapa

O sistema já tem o mecanismo pronto (`src/lib/backup.ts`), não é preciso inventar nada:

```bash
# gera senahub_AAAAMMDD_HHMMSS.backup em BACKUP_PATH, formato custom (-Fc)
# exige ENABLE_BACKUP=1, PG_DUMP_PATH e BACKUP_PATH configurados (ver docs/DEPLOY.md)
```

### Como validar que o backup presta

Backup que nunca foi testado não é backup. Antes de cada etapa:

1. **O arquivo existe e tem tamanho plausível** — comparar com o backup do dia anterior; queda abrupta
   de tamanho é sinal de dump truncado.
2. **`pg_restore --list <arquivo>.backup`** enumera as tabelas esperadas. Se o comando falha ou a
   listagem vem curta, o dump está corrompido — **parar a migração**.
3. **Conferir que as tabelas do Comercial estão na listagem**: `lead`, `cliente`, `proposta`,
   `proposta_item`, `proposta_versao`, `funil_etapa`.

### ⚠️ O dump do banco NÃO contém arquivos

`pg_dump` salva só o banco. Os **arquivos** (anexos de lead, documentos de proposta) vivem em
`STORAGE_BASE_PATH` e são espelhados **separadamente** por `src/lib/backup-storage.ts` (robocopy
aditivo, alvo em `STORAGE_BACKUP_PATH`).

`AnexoLead.caminho` guarda um caminho relativo a esse storage — restaurar só o banco deixa **linhas
apontando para arquivos que não voltaram**. Antes de qualquer etapa que toque em `AnexoLead`,
confirmar que o espelho do storage também está em dia.

A restauração é `scripts/restaurar-backup.ts` (destrutiva, chamada pelos menus — ver `docs/DEPLOY.md` §8);
ela grava uma cópia `pre-restauracao_*` antes de sobrescrever.

---

## §9 — Checklist de validação pós-migração

Rodar **depois de cada fase**, comparando com o baseline do §1. Qualquer linha que falhe = parar e
investigar antes de seguir.

### Contagens (nenhuma pode diminuir)

- [ ] `lead` — igual ao baseline (a migração não cria nem apaga leads, só os enriquece)
- [ ] `cliente` — igual ou **menor** apenas se houve fusão de duplicatas, e a diferença bate exatamente com o número de fusões registradas no `AuditLog`
- [ ] `proposta` — **rigorosamente igual**. Nenhuma proposta pode sumir, em nenhuma hipótese
- [ ] `proposta_item` — igual
- [ ] `proposta_versao` — igual
- [ ] `negociacao` (nova) — igual ao bucket `oportunidade_real` do §1

### Valores monetários (invariantes)

- [ ] `SUM(proposta_item.valor)` **idêntico** ao baseline — até o centavo
- [ ] Nenhum `Decimal` convertido para `Float` em qualquer ponto do caminho
- [ ] `MetaComercial` intacta

### Integridade referencial

- [ ] Zero `Negociacao` com `clienteId` inexistente
- [ ] Zero `Proposta` com `negociacaoId` preenchido apontando para negociação inexistente
- [ ] Zero `LeadContato`/`NegociacaoContato` apontando para contato inexistente
- [ ] Todo lead do bucket `oportunidade_real` tem exatamente uma `Negociacao`

### Fluxo público (o que não pode quebrar de jeito nenhum)

- [ ] Todo `Proposta.token` continua o mesmo — abrir uma URL `/a/proposta/<token>` conhecida e ver a página
- [ ] Todo `Proposta.numero` continua o mesmo
- [ ] `PropostaSequencia.ultimo` inalterado — próxima proposta criada não colide com número já emitido
- [ ] PDF de uma proposta antiga ainda gera (`/api/t/proposta/<token>/pdf`)

### Revisão

- [ ] Contagem de `needsReview = true` bate com a soma dos ambíguos + empates + "Outro" do §1
- [ ] A fila de revisão (§6) abre e lista esses registros com o motivo

---

## §10 — Riscos

1. **Token e numeração de proposta já foram enviados a clientes reais.** `Proposta.token` (link
   público) e `Proposta.numero` (`PR-AANNNN`) estão em e-mails fora do nosso controle. Qualquer coisa
   que os altere quebra links que terceiros têm em mãos. Tratar como imutáveis absolutos.

2. **Duplicata de CNPJ bloqueia a migration.** O índice único parcial falha na criação se houver
   qualquer grupo duplicado. Descobrir isso **no meio** da migração é péssimo — por isso a verificação
   é pré-requisito (§3), não etapa.

3. **Janela de convivência com escrita dupla.** Durante o SWITCH, a UI nova escreve no modelo novo
   enquanto o antigo ainda existe. Se for preciso reverter, o que foi criado na UI nova nesse intervalo
   não existe no modelo antigo. Mitigação: janela curta, e a reversão do SWITCH precisa de decisão
   consciente, não de rollback automático.

4. **Soft delete em `Cliente` tem raio de explosão fora do CRM** (já registrado em `02-schema.md` §8.6):
   `Cliente` é lido por Projeto, Lancamento, Documento, DocumentoJuridico, CustoOrcamento. Ligar a
   extensão de filtro automático sem revisar **todos** esses usos pode esconder registros em módulos
   que ninguém está olhando durante esta reforma. Tarefa isolada, com grep completo antes.

5. **`AnexoLead` aponta para o storage, não para o banco** (§8). Restore parcial gera linha órfã
   apontando para arquivo ausente.

6. **Etapas customizadas não têm mapeamento.** Se um admin criou etapas além das 5 do seed, elas caem
   na regra R5 (ambíguo) e **todas** as suas leads vão para revisão manual. Com volume alto, isso pode
   ser um mutirão — dimensionar com o número do §1.

7. **A classificação depende de dado que pode estar incompleto.** As regras leem "tem proposta?" como
   sinal de negociação real. Se o time comercial fecha negócio por fora e registra a proposta só às
   vezes, a classificação erra sistematicamente para o lado de `ambiguo` — o que é o comportamento
   seguro (revisão humana), mas pode gerar volume de revisão inesperado.

---

*Próximo passo: rodar o script em produção (§1), colar os números, e então decidir no GATE qual forma
este plano toma. Só depois disso o P5 (plano de fases) faz sentido.*
