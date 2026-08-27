# Gerenciador de contratos (equipe + cliente) — dentro do módulo `juridico`

**Data:** 2026-08-26 · **Status:** planejamento (não iniciado) · **Branch alvo:** `dev`

Extensão do módulo `juridico` já existente (`DocumentoJuridico` + `PastaJuridica` +
`DocJuridicoVersao` + `ModeloContrato` + `AceiteDocumento`) para cobrir dois casos de uso que hoje
não têm dono:

1. **Contrato de equipe** — armazenar/versionar contrato CLT/estágio/PJ, controlar vencimento,
   templates com preenchimento automático, assinatura interna+externa.
2. **Contrato de cliente** — a interface entre o fim do comercial (`Proposta` aceita) e o início do
   projeto. Reaproveita dados da proposta em vez de digitação nova.

Não é módulo novo. Não mexe no CRM já fechado (ver nota abaixo).

---

## 0. Por que não vai em `docs/crm/04-plano-fases.md`

A reforma do Comercial (105 tasks, Fases 1-7) está **fechada** — `06-progresso.md`, Lote 5,
2026-08-23: F6.12/F7.8/F7.9/F7.10 concluídas, `smoke:crm-e2e` passou os 20 critérios de aceite,
roadmap antigo marcado *superseded*. `04-plano-fases.md` é histórico de plano executado, não
backlog aberto — inserir tarefa nova ali reabriria, sem necessidade, uma transação já em produção
(`aceitarProposta`, marcada ⚠️⚠️ "coração do módulo" no próprio plano).

Este spec referencia o código **já existente e estável**:
- `src/modules/comercial/service.ts:467` — `aceitarProposta(propostaId, autorId?)`
- `src/modules/comercial/actions.ts:698` — `aceitarProposta` (`defineAction`)

A Fase C (§4) estende essa função — não recria, não move a transação de lugar.

---

## 1. O que já existe em `juridico` (reuso, não recriar)

| Peça | Onde | Cobre |
|---|---|---|
| Documento + versionamento | `DocumentoJuridico` (`tipo: contrato/aditivo/...`) + `DocJuridicoVersao` (numero, arquivoPath, autor) | armazenamento e histórico de versão |
| Organização | `PastaJuridica` (árvore) | pastas |
| Template | `ModeloContrato` (nome, `categoria`, conteudo) | ponto de partida do texto |
| Assinatura interna | `AceiteDocumento` (versaoId, userId, userNome, hashArquivo, assinadoEm) | aceite on-prem — só falta IP/UA |
| Link público (padrão a copiar) | `LinkPublicoCertidoes` (token/ativo/expiraEm, escopo por whitelist) | modelo pra assinatura externa |

`DocumentoJuridico` hoje só tem `projetoId`/`clienteId`/`pastaId` — **sem** ponte pra `Vinculo` (RH)
nem pra `Proposta` (comercial). Isso é o gap deste spec.

---

## 2. Schema (Fase A — fundação)

```prisma
enum StatusContrato {
  rascunho
  aguardando_assinatura
  assinado
  vencido
  rescindido
}

model DocumentoJuridico {
  // ...campos existentes inalterados...
  vinculoId      String?
  vinculo        Vinculo?         @relation(fields: [vinculoId], references: [id])
  propostaId     String?
  proposta       Proposta?        @relation(fields: [propostaId], references: [id])
  dataVencimento DateTime?        @db.Date
  valor          Decimal?         @db.Decimal(14, 2)
  statusContrato StatusContrato?  // null = não é um "contrato" no sentido deste spec (tipo antigo)
}
```

- Contrato de equipe = `tipo:"contrato"` + `vinculoId` setado.
- Contrato de cliente = `tipo:"contrato"` + `propostaId`+`clienteId` (+`projetoId` quando já existe).
- `valor`+`statusContrato` nascem aqui (Fase A) porque **H4** (alçada) e **G** (cronograma de
  faturamento) precisam deles — sem esperar as fases que os usam de verdade, evita 2ª migration.
- Tudo nullable, aditivo puro — sem backfill, sem quebra de dado existente.

`AceiteDocumento` ganha `ip String?` + `userAgent String?` (Fase D) — reforça a prova de aceite pro
padrão já usado em `modules/legal/termos.ts` (hash+IP+UA+timestamp).

Migration à mão + `migrate deploy` (dev tem drift conhecido — regra do repo, não `migrate dev`).

---

## 3. Acesso (decidido 2026-08-26)

**Gate por `HR_ADMIN_ROLES`** quando `vinculoId` está setado — não é recurso de permissão novo.
Contrato de equipe carrega salário/CPF (dado sensível de RH); quem só tem `juridico:gerir` não deve
ver isso de graça. Docs sem `vinculoId` (cliente/projeto) seguem o gate atual do módulo
(`juridico:gerir`). Implementar o check extra em `queries.ts`/`actions.ts` do `juridico` — nunca
`podeVerTudo` (floor read-only, não serve pra write nem leitura sensível de RH).

---

## 4. Fases

**Critério de Modelo** (mesmo tier do `docs/crm/04-plano-fases.md` §2): **H**aiku — mecânico, 1-2
arquivos, campo/UI, zero lógica · **S**onnet — feature de padrão conhecido (schema+action+query+UI,
copiando algo que já existe no repo) · **O**pus — arquitetura, migração de dado, heurística pura
testada, agregação, ou qualquer coisa onde dado errado vira problema de dinheiro/prazo legal/prova
jurídica.

### Fase A — Fundação (equipe) · **Modelo: S**
- Migration §2 (`vinculoId`, `dataVencimento`)
- Gate `HR_ADMIN_ROLES` (§3)
- Aba/filtro "Contratos de equipe" em `juridico-view.tsx`
- Alerta de vencimento: job pg-boss varrendo `DocumentoJuridico{tipo:contrato, vinculoId!=null,
  dataVencimento próximo}` → `notificar()`, categoria nova `contrato_equipe_vencendo` (nenhuma
  categoria existente cobre — checar `lib/notificar.ts`), com opt-out em preferências

### Fase B — Template com preenchimento automático · **Modelo: O**
- Liga `ModeloContrato.conteudo` na engine de tokens de `modules/documentos/tokens.ts`
  (`[Campo]`, `[Fonte.Campo]`) — fonte = `Vinculo`+`User`+`PessoaJuridica` (equipe) ou `Proposta`
  (cliente: título, cliente, `areaM2`, valor, escopo)
- Gera texto final → vira nova `DocJuridicoVersao`
- ⚠️ mesmo motivo de `F1.22` no CRM (marcada O lá): número/cláusula errada vai pro contrato que a
  pessoa assina — não é só lookup, é múltiplas fontes (`Vinculo`/`User`/`PessoaJuridica`/`Proposta`)
  alimentando um documento com efeito jurídico

### Fase C — Ponte comercial→projeto (cliente) · **Modelo: O**
- Migration §2 (`propostaId`)
- Estende `aceitarProposta` (`service.ts:467`) para, na mesma transação, criar
  `DocumentoJuridico(tipo:contrato, propostaId, clienteId, projetoId)` rascunho, pré-preenchido
  via Fase B
- ⚠️⚠️ toca função já em produção — teste dedicado prova que falha em qualquer etapa não deixa
  contrato órfão (mesmo padrão de teste que já protege `aceitarProposta` hoje)
- Contrato **acompanha** o projeto, não bloqueia o nascimento dele — não reabre a decisão já tomada
  de `Projeto` nascer direto no aceite

### Fase D — Motor de evidência de assinatura (validade jurídica sem certificado) · **Modelo: O**

Mesmo tier de `jornada.ts`/`frescor.ts`/`score.ts` no CRM fechado: heurística pura testada, e aqui é
a peça que sustenta validade jurídica — errar aqui não é bug de UI, é prova inválida em juízo.

**Base legal — por que não precisa de ICP-Brasil pra valer:**
- MP 2.200-2/2001 art. 10 §2º: documento particular com assinatura eletrônica que **não** seja
  ICP-Brasil é válido entre as partes, desde que outros meios comprovem autoria e integridade. É a
  brecha que Clicksign/DocuSign/Autentique usam — nenhum deles emite certificado ICP por padrão.
- Código Civil art. 219 + CPC art. 411, III: autoria reconhecida por qualquer meio de prova admitido
  em direito — a trilha de evidência (abaixo) é esse meio de prova.
- Lei 12.965/2014 (Marco Civil), já citada em `modules/legal/termos.ts`: aceite eletrônico registrado
  com IP/UA/timestamp serve de prova de manifestação de vontade.
- Lei 14.063/2020 não obriga o setor privado, mas sua taxonomia (assinatura simples/avançada/
  qualificada) é a referência de mercado pro nível de segurança que se está entregando.
- **Exceção a respeitar:** atos que exigem forma pública (ex.: alguns tipos de procuração,
  transferência de imóvel) não são supridos por assinatura eletrônica simples — fora do escopo de
  contrato de prestação de serviço/trabalho, mas cada `categoria` de `ModeloContrato` sensível deve
  passar pelo jurídico do escritório antes de liberar assinatura só-eletrônica (mesma cautela já
  documentada em `docs/legal/`).
- **TRCT/rescisão:** TST já aceita assinatura eletrônica; homologação sindical não é mais exigida
  desde a reforma de 2017. Ainda assim, revisar com o jurídico antes de liberar rescisão só-eletrônica
  — já anotado como risco em §5.

**Mecanismo (o que dá força probatória, sem certificado):**
1. **Hash SHA-256** do conteúdo exato da versão no momento em que ela é enviada pra assinatura — a
   versão fica congelada; qualquer edição depois gera nova `DocJuridicoVersao`, nunca sobrescreve.
2. **Autenticação do signatário:**
   - Interno: sessão `better-auth` já autenticada — mesma prova de identidade do resto do sistema.
   - Externo: acesso ao link (prova posse do e-mail que recebeu) + campo de confirmação (nome/CPF
     digitado); opcional subir o nível com **OTP por e-mail** antes de liberar a assinatura, se algum
     contrato pedir mais segurança ("assinatura avançada" na taxonomia da Lei 14.063).
3. **Consentimento explícito e específico** — botão nunca pré-marcado: "Li e assino [nome do
   documento], versão N", não um aceite genérico.
4. **Trilha de evidência em cadeia de hash** — modelo novo `EventoAssinatura` (documentoVersaoId,
   tipo: visualizado/autenticado/assinado, timestamp, ip, userAgent, hashEventoAnterior,
   hashEventoAtual). Cada evento inclui o hash do anterior — adulterar um registro do meio quebra a
   cadeia visivelmente, mesmo princípio de um mini-blockchain de log, sem precisar de blockchain de
   verdade.
5. **Certificado de conclusão** — PDF gerado ao fim (reusa `puppeteer-core`/`CHROME_PATH`, já no
   stack) anexado ao documento assinado: quem assinou, quando, IP/UA, hash de cada evento da cadeia.
   Mesmo papel do "Certificado de Conclusão" do Clicksign/DocuSign — é o documento que se apresenta
   se a assinatura for questionada.
6. **Timestamp** — relógio do servidor (NTP-sincronizado) é aceitável pra praticamente todo caso de
   uso deste módulo; carimbo do tempo formal via ITI (RFC 3161, gratuito) fica como upgrade futuro,
   não bloqueante.

`AceiteDocumento` ganha `ip`+`userAgent` (§2) como parte deste motor — consumido pelas Fases E/F.

### Fase E — Assinatura interna (consome a Fase D) · **Modelo: S**
- Reusa fluxo de aceite já existente (`AceiteDocumento`) sem mudança de UX
- Grava os eventos da cadeia (§Fase D item 4) a partir da ação já existente `registrarAceite`
- A parte difícil (cadeia de hash, base legal) já foi resolvida na Fase D — aqui é conectar

### Fase F — Assinatura externa (consome a Fase D) · **Modelo: S**
- Copia o padrão já usado 3× no repo (`LinkPublicoCertidoes`/`link-publico.ts`/rota pública de
  `arquivos`/`inputs`) — feature de padrão conhecido, não arquitetura nova
- Modelo novo `LinkPublicoAssinatura` (token/ativo/expiraEm, mesma regra de `lib/link-publico.ts`),
  escopado a uma `DocJuridicoVersao`
- Modelo novo `AceiteExternoDocumento` (nome/cpf/email+hash+IP+UA) — **não** forçar dentro de
  `AceiteDocumento`, que exige `userId` não-nulo
- Rota pública `src/app/api/juridico/assinar/[token]` (fora do middleware, como `arquivos`/`inputs`)
- Mesma cadeia de eventos da Fase D, só que ancorada em `AceiteExternoDocumento` em vez de `userId`

### Fase G — Automação financeiro (cronograma de faturamento) · **Modelo: O**
- Contrato de cliente marcado como assinado → gera as parcelas como `Lancamento`, a partir do valor
  final da versão aceita da `Proposta` ÷ condição de pagamento (campo novo em `DocumentoJuridico`)
- `Lancamento` ganha `contratoId` (FK opcional) — `lib/aging.ts` (aging de recebíveis, já existe)
  passa a enxergar o contrato nativamente, sem lançamento manual
- Gatilho dentro da própria action de "marcar assinado" (mutação síncrona, auditada via
  `defineAction`), não em job separado
- ⚠️ regra de parcelamento nova mexendo com dinheiro real (arredondamento de parcela residual,
  data-base) — não é campo/UI, é lógica financeira nova, mesmo tier de `encargos.ts`

### Fase H — Automações cross-módulo

Tiers mistos de propósito — cada sub-item é tarefa própria, não uma fase monolítica:

- **H1 — RH, prazo legal calculado · Modelo: O.** `tetoEstagio(dataInicio, hoje)` (Lei 11.788, teto
  de 2 anos, exceção PCD) e `janelaExperienciaClt(dataInicio, hoje)` (45+45 dias) — funções puras e
  testadas, mesmo tier de `lib/aquisitivo.ts` (data errada = risco trabalhista real)
- **H2 — Motor único de vencimento · Modelo: O.** Extrair `lib/vencimento.ts` (puro/testado, bucket
  dias-restantes, mesmo espírito do `aging.ts`) consumido por `Certidao`, contrato de equipe (Fase A)
  e H1 — agregação/heurística compartilhada por 3 domínios, mesmo tier de `aging.ts`
- **H3 — Planejamento · Modelo: S.** Prazo do contrato (assinatura + prazo contratual) vira
  `Projeto.prazoFinal` (consumido por `saudeProjeto`, já existe) e semente do primeiro marco no CPM
  (`caminho-critico.ts`) — schema+action+query+UI de padrão conhecido, mas checar dono único do campo
  (§5)
- **H4 — Alçada de aprovação · Modelo: S.** Mesmo padrão de `lib/aprovacao.ts`
  `devePassarPorAprovacao` — contrato acima de um limite (`ConfigSistema`) exige aprovação de sócio
  antes de sair de rascunho; é reuso de função já existente, não lógica nova
- **H5 — Patrimônio · Modelo: S.** Vínculo entrando em `dataFim` (rescisão) dispara checklist
  automático de devolução — lista os ativos de Patrimônio/TI já alocados àquele usuário, direto na
  tela do contrato; é query+UI de junção, não é mecânico o bastante pra H

### Fase I — Portal e dashboard
- **In-app pro cliente do portal · Modelo: S.** Cliente que já é usuário do portal
  (`User.clienteId`) assina via Fase E, sem precisar do link público — link público (Fase F) fica só
  pra quem ainda não tem acesso ao sistema; é reuso, a parte difícil já foi resolvida em D/E
- **Badge no dashboard · Modelo: H.** "Contrato pendente de assinatura" na ficha do projeto/carteira,
  ao lado do badge de
  `saudeProjeto` já existente

### Fase J — Certificado digital ICP-Brasil (opcional, backlog, baixa prioridade) · **Modelo: O**
- Suporte a assinatura com certificado A1 (.pfx) teria que rodar **no navegador do usuário** — a
  chave privada nunca sai do dispositivo, nunca vai pro servidor — exige lib de assinatura PAdES
  client-side e validação da cadeia de certificação
- Esforço alto, atende só quem já tem certificado (minoria); o motor da Fase D já é juridicamente
  suficiente pra contrato entre particulares na esmagadora maioria dos casos — não é bloqueante pras
  fases anteriores, só um upgrade de nível de segurança pra quem pedir

---

## 4b. Execução em 2 rodadas (decidido 2026-08-26)

Rodada 1 = **Sonnet**, só tarefas S/H que não dependem de saída de nenhuma tarefa O. Rodada 2 =
**Opus**, todo o resto — inclusive tarefa S/H que na ordem natural do produto viria antes, mas que
só funciona depois de uma peça O existir (a etapa O gargalo).

### Rodada 1 — Sonnet (sessão única, sem dependência de Opus)

| Ordem | Item | Por que pode ir agora |
|---|---|---|
| 1 | **Fase A** (schema completo — `vinculoId`, `propostaId`, `dataVencimento`, `valor`,
`statusContrato`; gate `HR_ADMIN_ROLES`; aba/filtro; alerta de vencimento) | self-contained, não lê
nada de B-J |
| 2 | **H4** — alçada de aprovação | só precisa `valor`+`statusContrato` (já vêm na Fase A desta
rodada) + `lib/aprovacao.ts` já existente |
| 3 | **H5** — checklist de devolução (Patrimônio) | só lê `Vinculo.dataFim` + `Patrimonio`, nada de
assinatura |
| 4 | **I — badge no dashboard** | só lê `statusContrato != assinado` (campo já existe da Fase A) —
não precisa que a assinatura de verdade esteja implementada, só o campo |

**Migration da propostaId já sai pronta na Fase A** (o schema §2 é um bloco só) — o que fica pra
rodada 2 é só a *lógica* de C (escrever nela dentro de `aceitarProposta`), não a coluna.

**Fica de fora da rodada 1** mesmo sendo S: **E** (consome D), **F** (consome D), **H3**
(precisa de assinatura+prazo real), **I-in-app** (consome E). Todas viram rodada 2.

### Rodada 2 — Opus (depois de trocar o modelo)

Ordem por dependência, não por letra:

1. **D** — motor de evidência (não depende de nada das fases anteriores)
2. **B** — template/tokens (usa schema da Fase A, já pronta)
3. **E** — assinatura interna (consome D)
4. **F** — assinatura externa (consome D)
5. **C** — ponte comercial→projeto (consome B; escreve dentro de `aceitarProposta`)
6. **G** — cronograma de faturamento (consome C — precisa de contrato assinado existindo)
7. **H1** — RH, prazo legal (independente, mas é O por classificação de risco, não por dependência)
8. **H2** — motor único de vencimento (independente; refatora o alerta que a Fase A já shippou pra
   consumir esta função em vez do cálculo inline)
9. **H3** — planejamento, `Projeto.prazoFinal` (consome E/F — precisa de data de assinatura real)
10. **I-in-app** — cliente assina pelo portal (consome E)
11. **J** — certificado ICP-Brasil, opcional/backlog, só se pedirem depois

---

## 5. Riscos declarados

- Fase C toca `aceitarProposta` — única peça deste spec com risco de produção real. Isolar num
  commit próprio, com teste de caracterização antes de mudar, igual ao padrão que o próprio CRM
  historicamente usou (`F1.3` no plano fechado).
- `vinculoId`/`propostaId`/`dataVencimento` são aditivos — zero risco de migração pra dado existente.
- Categoria de notificação nova (`contrato_equipe_vencendo`) precisa entrar em
  `filtrarPorCategoria()` (`modules/usuarios/preferencias/queries.ts`) — não esquecer, ou o
  opt-out não funciona.
- Fase D (motor de evidência) é a peça que sustenta a validade jurídica de tudo — não pular pra
  Fase G/H antes dela estar testada. `EventoAssinatura` com cadeia de hash quebrada é pior que não
  ter trilha nenhuma (falsa sensação de prova).
- Fase G (`Lancamento.contratoId`) é aditiva, mas toca o módulo `financeiro` — checar se algum
  relatório de recebíveis já assume `Lancamento` sem contrato associado antes de rodar em produção.
- Fase H (Planejamento) escreve `Projeto.prazoFinal` a partir do contrato — checar se já existe
  outro caminho editando esse campo manualmente hoje, pra não haver dois donos do mesmo dado.
- Fase J é a única não recomendada pra início de execução — citar aqui só pra não perder a ideia
  quando/se algum cliente ou fornecedor exigir ICP-Brasil especificamente.

---

## 6. Emenda — Rodada 1 (A, H4, H5, I) como foi implementada, 2026-08-26

Executada em Sonnet, mesma sessão. Diferenças em relação ao que este spec descrevia antes de
codar, registradas aqui em vez de reescrever a história acima (mesmo princípio do
`docs/crm/06-progresso.md`):

- **`DocumentoJuridico` ganhou uma 5ª coluna não prevista no §2 original:**
  `alertaVencimentoEm DateTime?` — marca de compare-and-swap do alerta (mesmo papel de
  `Proposta.alertaValidadeEm`), 2ª migration (`§2` só citava `vinculoId`/`propostaId`/
  `dataVencimento`/`valor`/`statusContrato`). Sem ela o job reavisaria todo dia enquanto a data
  estivesse dentro da janela — mesmo raciocínio de `alertaPropostasExpiradas`
  (`jobs-handlers.ts:254`).
- **Job de vencimento não ganhou fila própria** — dobrado dentro de `rotinasRhDiarias` (já
  agendado 01:00 diário), que é literalmente "rotinas RH diárias". `alertaContratosEquipeVencendo`
  só AVISA, nunca escreve `statusContrato` — "vencer" continua derivado da data, nunca
  materializado (mesmo padrão que a Fase D/H2 já preveem).
- **H4 (alçada) é checada em DOIS pontos**, não um: `atualizarContratoEquipe` (editar status à
  mão) E `registrarAceite` (assinar — que também sai de "rascunho"). Sem o segundo ponto, assinar
  direto contornava a alçada inteira. A checagem em `registrarAceite` acontece ANTES de criar o
  `AceiteDocumento` — `defineAction` não abre transação implícita, bloquear depois deixaria uma
  assinatura órfã gravada com o documento ainda "bloqueado".
- **`registrarAceite` agora fecha o próprio loop do `statusContrato`** — assinar uma versão de um
  doc `tipo:"contrato"` que está `rascunho`/`aguardando_assinatura` grava `assinado` na hora. Não
  estava no texto original das Fases A/H4/I; sem isso não haveria NENHUM jeito de um contrato de
  CLIENTE (sem `vinculoId`, então fora do editor de contrato de equipe) sair de "rascunho" — o
  badge (Fase I) ficaria aceso pra sempre. Efeito colateral bom: fecha também o H4 pro caminho mais
  natural (assinar), não só pela tela de edição.
- **`criarDocJuridico` generalizado** — `statusContrato:"rascunho"` nasce em QUALQUER
  `tipo:"contrato"`, não só quando `vinculoId` está setado (o texto original da Fase A limitava a
  equipe). Necessário pro badge (Fase I) funcionar em contrato de cliente criado à mão, antes da
  Fase C (ponte automática com `Proposta`) existir.
- **Badge (Fase I) usa allowlist explícito** (`statusContrato in [rascunho, aguardando_assinatura]`),
  nunca `notIn: [assinado]` — os 32 projetos que já existiam antes desta feature têm
  `statusContrato: null` em qualquer contrato antigo (se algum já estava linkado por `projetoId`
  do jeito antigo), e `null` não deveria acender alarme nenhum. Implementado tanto na ficha do
  projeto (`visaoGeralProjeto`) quanto no card da carteira (`carteiraProjetosDashboard`).
- **Sem `db:seed`** — toda coluna nova é nullable, zero recurso de permissão novo (reusa
  `juridico:gerir` + checagem de `HR_ADMIN_ROLES` em código, não `Permissao` no banco).

## 7. Emenda — Fase D (motor de evidência), 2026-08-26

Executada em Opus. Entregue: `modules/juridico/assinatura/` — `cadeia.ts` (motor puro, 19 testes),
`service.ts` (append com tx injetada, 9 testes), `queries.ts` (leitura + verificação), model
`EventoAssinatura` + `AceiteDocumento` ganhando `ip`/`userAgent`, e o `registrarAceite` já gravando
o evento `assinado`. Decisões que o texto da Fase D acima não fixava:

- **Serialização canônica com PREFIXO DE TAMANHO, não delimitador.** `${ip}|${userAgent}` deixaria
  forjar dois eventos distintos com o mesmo hash (basta o user-agent conter `|`) — e o user-agent
  é controlado por quem assina, justamente no caminho externo da Fase F, onde a prova precisa
  valer. Com `7:1.2.3.4` o tamanho manda. `null` vira `~`, que a outra ramificação nunca produz:
  nulo e string vazia são fatos diferentes. Campos hasheados numa ORDEM FIXA em array, nunca
  objeto — ordem de chave não é garantida entre engines, e o hash tem que ser reproduzível daqui a
  anos pra servir de prova. Coberto por teste (`não deixa forjar evento por colisão de
  delimitador`).
- **`sequencia Int` + `@@unique([versaoId, sequencia])`** — não estava no §Fase D item 4. Sem ela,
  dois appends concorrentes leem o mesmo "último" e criam DOIS ramos que verificam íntegros
  isoladamente, sem nenhum ser a história real. Com ela o perdedor leva P2002 e
  `comRetentativaDeConflito` refaz a transação inteira. A sequência também dá ordem determinística
  pra verificação (ordenar por `ocorridoEm` empata em dois eventos no mesmo milissegundo) e é o
  único jeito de detectar evento REMOVIDO do meio — os que sobram continuam encadeados entre si.
- **`userAgent` truncado em 500 ANTES de gravar, não só antes de hashear** (mesmo teto de
  `api/p/aceite/[token]/route.ts`). Se o banco guardasse o inteiro e o hash usasse o cortado, a
  verificação acusaria adulteração num dado que ninguém tocou.
- **Verificação roda na LEITURA** (`queries.ts`), não na escrita: adulteração acontece direto no
  banco, depois do fato — conferir no momento de gravar não provaria nada.
- **`registrarAceite` virou transação** (aceite + evento + flip de `statusContrato`). Aceite sem
  evento é assinatura sem prova; evento sem aceite é prova apontando pra nada.
- **Só o evento `assinado` é gravado nesta fase.** O enum já tem `visualizado`/`autenticado`, mas
  quem os produz são os fluxos das Fases E/F (abrir o documento, OTP) — o motor aceita os três, a
  origem dos outros dois chega junto com a tela que os gera.
- **Certificado de conclusão (item 5 do mecanismo) NÃO entrou** — é renderização puppeteer, tier S,
  e depende da cadeia existir primeiro. Fica pra uma tarefa própria.
- **Honestidade no comentário do modelo:** está escrito que a cadeia entrega DETECÇÃO de
  adulteração parcial, não impossibilidade — quem tem escrita no banco recalcula tudo a partir de
  qualquer ponto. Vender como infalsificável seria a "falsa sensação de prova" que o §5 lista como
  risco, num arquivo que o jurídico pode vir a ler.

## 8. Emenda — Fase B (template + preenchimento), 2026-08-26

Executada em Opus. Entregue: `modules/juridico/contrato/` — `campos.ts` (catálogo + escalar +
validação, puro), `gerar.ts` (resolve → escapa → HTML → PDF → versão), action
`gerarVersaoDeModelo` e botão "Gerar do modelo" nas duas abas. 31 testes. Decisões:

- **A peça que justifica o tier O não é o PDF, é `tokensNaoResolvidos`.** O motor devolve string
  VAZIA tanto para token desconhecido quanto para valor nulo. Numa planilha do Estúdio isso é uma
  célula vazia; num contrato assinável, `"salário mensal de R$ "` é entregável e portanto pior que
  um erro. A geração é BLOQUEADA, com mensagem que separa os dois defeitos — `desconhecido`
  (conserta o modelo) × `vazio` (preenche o cadastro).
- **Regra final: se o modelo CITA o campo, ele precisa ter valor.** A primeira versão tinha um flag
  `obrigatorio` marcando endereço/RG/telefone como opcionais. O teste com dado real de dev produziu
  `"residente em , /."` — exatamente a cláusula quebrada que o bloqueio existia para impedir. O caso
  que me fez inventar o flag (complemento de endereço vazio) nem é token próprio: está dentro de
  `[Endereco]`. Campo que não se aplica a um contrato simplesmente não é citado naquele modelo (um
  modelo de CLT não menciona `[PjRazaoSocial]`), então "cita e aceita em branco" não tem caso
  legítimo. Flag removido; regra ficou mais simples E mais segura.
- **`setContent`, não `page.goto`.** O PDF da proposta renderiza a página pública e por isso exige
  o Next no ar; contrato de modelo não tem página — o HTML nasce no próprio gerador. Reusa o
  `acquireExecutionSlot({ name: "puppeteer-pdf", maximum: 2 })` da proposta, senão um segundo ponto
  de launch anularia o limite do primeiro.
- **Ordem obrigatória: resolver tokens → escapar → montar HTML.** O `conteudo` do modelo é digitado
  num textarea (texto puro): uma cláusula com `&`/`<`, ou uma razão social "Silva & Filhos",
  quebraria o documento se entrasse crua. Escapar ANTES de resolver seria igualmente errado —
  escaparia os colchetes dos próprios tokens.
- **Versão nova de contrato já assinado volta o status para `aguardando_assinatura`.** O aceite e a
  trilha da versão anterior continuam intactos (são por versão), mas o documento não pode seguir
  dizendo "assinado" enquanto a versão vigente não tem assinatura nenhuma — o badge da Fase I
  mentiria e a `trilhaAssinatura` da versão vigente viria vazia.
- **Gate de RH ANTES do fetch**, não só antes do write: o escalar de contrato de equipe materializa
  CPF, RG e salário.
- **Decimal vira número na fronteira** (`.toNumber()`), nunca entra no formatador.
- **Achado de teste:** `Intl` pt-BR separa "R$" do número com U+00A0 (espaço não-separável), não
  espaço comum — dois literais visualmente idênticos que não comparam iguais. O teste usa
  `String.fromCharCode(0xa0)` explícito para o próximo a mexer não perder tempo com um diff que
  parece igual na tela.

## 9. Fase B2 — Aditivos, 2026-08-26

Não estava no plano original; entrou quando o dono perguntou "como funciona no caso de aditivos?".
A resposta honesta era **não funcionava**, e a investigação revelou um bug já shippado.

### 9.1 Bug corrigido antes de tudo: contrato saía com salário e cargo DESATUALIZADOS

A Fase B lia `Vinculo.remuneracao`/`Vinculo.cargo`. Mas `rh/contratual/service.ts` é o ponto único
de escrita contratual e mantém `User.salarioBase`/`User.cargo` como cache do último
`HistoricoContratual` vigente. `Vinculo.*` é o que foi contratado na ABERTURA e não acompanha
reajuste nem promoção — então um contrato gerado para quem foi promovido imprimia o valor antigo.
A validação de token não pegava: o campo não estava vazio, estava velho. Agora resolve
`user.salarioBase ?? vinculo.remuneracao` (o fallback cobre quem a carga inicial não alcançou).

### 9.2 A inconsistência que eu mesmo tinha criado

"Isto é um contrato vivo?" estava respondido em QUATRO lugares com regras diferentes, e elas
discordavam sobre aditivo: `criarDocJuridico` e o flip de `registrarAceite` usavam
`tipo === "contrato"`; o badge usava `tipo: "contrato"`; **o alerta de vencimento não filtrava tipo
nenhum**. Resultado: um aditivo de equipe com vencimento **alertava mas não aparecia como
pendente**. Consolidado em `contrato/estado.ts` (puro, 14 testes), e os quatro pontos religados.

### 9.3 Modelagem

- **Aditivo é `DocumentoJuridico` próprio** com `contratoOrigemId` (auto-relação). Assinado à
  parte, com versões e trilha próprias, e **coexiste** com o original — não é uma nova versão dele
  (versão substitui a redação; aditivo altera um contrato que segue valendo). Rejeitada a opção
  "aditivo = nova versão" justamente porque a Fase B já definiu que versão nova supersede a
  assinada, o que apagaria o sentido do contrato original.
- **`AditivoEquipe` (1:1)** guarda o delta. Tabela separada porque `DocumentoJuridico` também
  guarda procuração e contrato de cliente, que não têm cargo nem remuneração.
- Cuidado de nome: já existe `AditivoContrato` no schema — é de **licitação**, outro domínio.
- Aditivo só sobre `tipo = "contrato"`, nunca sobre outro aditivo: corrente sem fim embaralharia
  `vencimentoEfetivo`, que espera todos pendurados no mesmo contrato raiz.

### 9.4 Efeito ao assinar (decisão do dono: automático)

Assinar o aditivo chama `registrarAlteracaoContratual` — o ponto único que grava
`HistoricoContratual` + cache do `User`, e cujo próprio comentário avisa que escrever por fora
quebra o histórico como prova. Três armadilhas:

- **`null` significa coisas OPOSTAS nos dois lados.** No service, `null` = LIMPAR o campo; no
  aditivo, `null` = "não mexe nesse eixo". Passar direto apagaria o cargo de quem recebeu um
  aditivo só de reajuste. Convertido com `?? undefined`.
- **`vigenciaEm` não é a data da assinatura.** Aditivo assinado em 15/02 pode vigorar a partir de
  01/03; o default do service é hoje. `AditivoEquipe.vigenciaEm` é passado explicitamente.
- **O efeito é preso à TRANSIÇÃO de status, não ao aceite.** Dois signatários no mesmo aditivo
  geram dois aceites — aplicar por aceite reajustaria o salário duas vezes.

`cargaSemanal` é registrada no aditivo mas **não** aplicada automaticamente: `Vinculo.cargaSemanal`
não tem ponto único de escrita conhecido, e não vou escrever num campo cuja propriedade não
verifiquei. `novoVencimento` não precisa de escrita — é lido por `vencimentoEfetivo()`.

### 9.6 Fase C — ponte comercial→jurídico, 2026-08-26

Aceitar a proposta abre o contrato do cliente. Mudança de **7 linhas úteis** dentro de
`aceitarProposta` (`modules/comercial/service.ts`), sem migration.

- **O spec pedia duas coisas que puxavam para lados opostos**: "na mesma transação" e "não bloqueia
  o nascimento do projeto". Resolvido separando o que é barato do que é caro: entra na transação só
  a CASCA do contrato (um insert, zero I/O); o documento em si continua sendo gerado depois pelo
  botão da Fase B, que depende de escolher o modelo e de `CHROME_PATH`. "Não bloqueia" era sobre
  ORDEM (contrato não precede o projeto), não sobre atomicidade.
- **Não confundir com o fan-out**: canais de chat e notificações continuam FORA da transação, como
  sempre estiveram — são I/O sujeito a falha externa. O insert do contrato não é.
- `valor` recebe o mesmo `valorFinal` do projeto e da negociação — uma fonte, agora quatro
  leituras. Já alimenta H4 (alçada) e prepara G (faturamento).
- **Verificação:** `smoke:crm-fase5` e `smoke:crm-fase1` (caracterização do aceite) verdes, sem
  alteração. Round-trip próprio contra o dev provou: contrato criado com os três vínculos corretos
  (proposta/projeto/cliente), `valor` = valor final, nasce `rascunho`, badge da Fase I acende no
  projeto novo, e uma falha após o insert dentro de `$transaction` não deixa contrato órfão.

### 9.7 Fases E, F, G, H1, H2, H3, I-in-app — 2026-08-27

Executadas em sequência. Migration `20260827000000_contratos_assinatura_externa_faturamento`
(2 tabelas + 3 colunas, tudo aditivo). Decisões e achados:

**H2 (`lib/vencimento.ts`)** — unifica o cálculo "faltam quantos dias, e isso é grave?", que estava
inline em cada tela. **NÃO** unifica a estratégia de disparo dos alertas: `alertaCertidoes` dispara
em dia exato (30/15/7, pode avisar três vezes) e o de contrato usa janela + compare-and-swap (avisa
uma vez). Forçá-los no mesmo formato mudaria um alerta que funciona, sem ganho. Conta por DIA
CIVIL, não por instante — sem isso todo `@db.Date` apareceria vencido a partir do meio-dia.

**H1 (`lib/prazo-legal.ts`)** — teto de estágio (24 meses, Lei 11.788 art. 11) e janela de
experiência CLT (90 dias, art. 445/451). `prazoLegalDoVinculo` devolve `null` para CLT/PJ/
freelancer em vez de inventar uma data: CLT por prazo indeterminado não tem limite, e a
experiência é contrato à parte que o sistema não modela.

**E** — trilha de evidência na UI (com verificação de integridade), evento `visualizado` com dedup
por (ator, versão), e o **certificado de conclusão em PDF** (item 5 do mecanismo da Fase D, que
tinha ficado pendente). O certificado é gerado AO VIVO, nunca arquivado: é um retrato do estado
atual da evidência, e um arquivo congelado deixaria de refletir uma cadeia que quebrou depois. Se a
cadeia estiver inconsistente, ele **registra a inconsistência** em vez de omiti-la.

**I-in-app** — `registrarAceite` perdeu o `recurso: juridico/gerir` do config e passou a autorizar
DENTRO. Motivo: assinar tem três titulares legítimos — quem gere o jurídico, o **dono do vínculo**
(assinando o próprio contrato) e o **usuário do portal do cliente**. Com a permissão fina no
config, os dois últimos eram barrados antes do handler rodar; um CLT não tem `juridico:gerir`, e é
exatamente ele que a assinatura precisa vincular. Fecha a lacuna que o comentário de `ehHrAdmin`
declarava desde a Fase A.

**F** — link público por signatário (nome gravado ANTES do envio: é o que prova para quem foi
mandado), uso único garantido pela unique em `AceiteExternoDocumento.linkId` (não só pela
aplicação), consentimento explícito nomeando documento+versão, e leitura obrigatória antes de
liberar o botão. `AceiteExternoDocumento` é tabela própria e não `AceiteDocumento` com `userId`
nulo: lá a identidade vem da sessão, aqui vem da posse do link — misturar apagaria a diferença de
força probatória.

**G** — parcelas geradas na ASSINATURA, idempotentes por contrato (sem a guarda, um segundo
signatário duplicaria o faturamento inteiro). Dois achados:
- **A divisão do dinheiro já existia.** `modules/projetos/receita/parcelas.ts` `dividirEmParcelas`
  fazia exatamente a mesma partilha (floor + resíduo na primeira). A primeira versão daqui
  reimplementou; foi reescrita para COMPOR o que existe — duas implementações de arredondamento de
  dinheiro é a divergência que este plano vinha eliminando.
- **`addMonths` do date-fns está errado para `@db.Date`.** Opera em hora LOCAL; `primeiroVencimento`
  chega meia-noite UTC, e em UTC-3 `31/01 + 1 mês` devolvia **01/03** em vez de 28/02 — a parcela
  pulava de mês. Trocado por soma em UTC. Coberto por teste.
- **`Lancamento.autorId` é NOT NULL** e faltava. O teste com `tx` falsa não pegou (o fake aceita
  qualquer formato) e o Prisma reportou de forma enganosa ("Argument `categoria` is missing"). Só o
  teste contra o Postgres pegou. O teste unitário ganhou uma lista explícita dos campos
  obrigatórios, para o próximo NOT NULL quebrar antes de chegar em runtime.

**H3** — prazo do contrato vira `Projeto.prazoFinal`, com duas guardas: nunca sobrescreve prazo já
definido à mão, e não define prazo anterior a disciplina já agendada — `projetos/actions.ts` recusa
disciplina além do prazo do projeto, e escrever por aqui criaria justamente o estado que aquela
validação impede, por um caminho que não a atravessa.

**J (ICP-Brasil)** — não implementada. A pedido do dono, o botão fica **visível** ("Assinar com
certificado digital") mas **recusa em voz alta**: "Ferramenta em desenvolvimento". Nunca finge ter
assinado — um botão que simulasse sucesso produziria a pior falha possível neste módulo: alguém
acreditar que assinou com validade qualificada sem ter assinado nada.

**Verificação contra o banco de dev:** link vigente → assinado → revogado; segunda assinatura no
mesmo link recusada com P2002; trilha `visualizado → assinado` íntegra após round-trip; 3 parcelas
somando exatamente R$ 10.000 (3333,34 + 3333,33 + 3333,33) com vencimentos mensais; segunda
geração criou 0.

### 9.5 Vencimento efetivo

Aditivo **não vence — ele MUDA o vencimento**. O alerta voltou a ser só `tipo = "contrato"`, mas
agora calcula `vencimentoEfetivo(base, aditivos assinados)` e filtra em memória (mesmo padrão de
`alertaPropostasExpiradas`). Sem isso, cobraria o prazo original de um contrato já prorrogado.
Ordena por `assinadoEm`, não por data de vigência: entre duas prorrogações vale a **acordada por
último**, que pode ser a que ENCURTA o prazo. `DocumentoJuridico.assinadoEm` nasceu para isso.
