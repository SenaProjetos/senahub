# Nomenclatura versionada + siglas por versão + sub-disciplinas

**Data:** 2026-09-21 · **Status:** desenho fechado com o dono, pendências §2 respondidas; nada
implementado · **Pedido:** a gestão propôs um padrão novo de nome de arquivo
(`260010-SENA-AGF-BAS-001-PLB`). O dono não quer um script a cada mudança de padrão: padrões
globais passam a ser **versionados**, cada projeto escolhe uma versão (ou personaliza), e a
disciplina ganha um nível abaixo (**sub-disciplina**) reconhecido só pelo nome.

Continua valendo tudo do [ADR-0003](../../adr/0003-motor-nomenclatura-so-acrescenta-metadado.md)
e da spec [2026-09-15-motor-nomenclatura](2026-09-15-motor-nomenclatura.md): o motor só
ACRESCENTA metadado, nunca vira chave de agrupamento; escolha manual > envio > motor.

**Vocabulário desta spec:**
- *card* = `Disciplina` do projeto (projetista, valor, prazo, status, pagamento). Catálogo:
  `DisciplinaCatalogo`.
- *sub-disciplina* (*sub*) = etiqueta de documento dentro de um card (`AGF` dentro de
  Hidrossanitário). **Não tem** projetista, valor, prazo, status nem pagamento.
- *versão* = versão publicada do padrão global de nomenclatura (v1, v2…).
- *sinônimo* = sigla alternativa (`DTC` → `DET`). *Apelido* continua sendo documento absorvido
  por merge — não misturar.

---

## 0. Modelo por fase (ler primeiro)

**Ao iniciar uma fase, a primeira linha da resposta é o modelo esperado. Se o modelo ativo for
outro: PARAR e esperar `/model`.**

| Fase | Modelo | Por quê |
|---|---|---|
| F1 — schema + migration de transição | **Opus** | Expand/contract de `codigo`/`sinonimos`, fixação dos projetos na v1 dentro da migration, 3 tabelas novas. Erro aqui mexe no acervo inteiro. Rodar `prisma-migration-reviewer`. |
| F2 — motor por versão + sub | **Opus** | Vocabulário passa a depender da versão; resolução sub → card; aviso "segue a vN". Núcleo que as outras fases consomem. |
| F3 — geradores de nome | **Opus** | `codigoPrancha`/`nomeCorrigidoPeloPadrao`/lote/Lista Mestre passam a montar a partir do modelo da versão; `parsePranchaFilename` sai de cena. Muitos consumidores. |
| F4 — telas de configuração | **Sonnet** | Versões (rascunho/publicar/trava), subs aninhadas no catálogo, siglas por versão, seletor no projeto. Desenho fechado aqui. |
| F5 — telas de uso | **Sonnet** | Agrupamento/filtro por sub, Lista Mestre, zip, sub editável no envio. |
| F6 — manual + carga da v2 + deploy | **Sonnet** | Manual, carga da v2 PELA TELA (é o teste de aceite), checklist de deploy. |

Branch `feat/nomenclatura-versionada` saindo de `dev-vscode` (worktree VS Code, banco
`senahub_remake_vscode`). Um commit por fase no mínimo; `npm run lint` + `npm test` verdes antes
de cada commit.

---

## 1. Decisões fechadas (dono, 2026-09-21)

**D1 — Padrão global versionado.** Cada versão publicada é **imutável**; corrigir = publicar
versão nova (rascunho editável só antes de publicar). A versão guarda: número, nome ("Padrão
2026"), modelo (`{proj}-SENA-{disc}-{fase}-{num}-{tipo}`), regras de número (largura com zeros,
escopo da sequência), vigente desde, publicada em/por, descrição.

**D2 — Vigência = só o default de projeto novo.** Projeto novo recebe a versão mais recente com
`vigenteDesde <= projeto.createdAt`. Publicar versão **não altera** projeto nenhum existente.
A data não tem outro efeito (não é data de envio, não agenda nada além disso).

**D3 — Projeto preso a uma versão, ou personalizado.** O projeto aponta para uma versão
(`Projeto.nomenclaturaVersaoId`) **ou** tem padrão próprio (`NomenclaturaConfig.padrao` do
projeto, o que já existe hoje — vence a versão). Personalizado nasce como cópia
de uma versão. Trocar a versão é escolha explícita com confirmação, que mostra antes quantos
documentos passariam a ficar fora do padrão. **Trocar versão nunca renomeia arquivo.**

**D4 — Siglas por versão.** O catálogo segue com **uma linha por conceito** (id estável para
filtros e relatórios). O que passa a ser por versão é a ligação *sigla → conceito*. Motivo:
siglas **redefinidas** entre versões, não só renomeadas:
- `ESG`: v1 = sinônimo de HID (hidro inteiro, visto no acervo de prod); v2 = sub Esgoto.
- `ACU`: v1 = card Acústica; v2 = sub de Arquitetura.
- `DET`: v1 = planta + detalhes; v2 = só detalhe (planta virou `PLB`). Fica a mesma linha do
  catálogo, sem reclassificar nada (P5); só um filtro por tipo que cruze projetos v1 e v2 mistura
  os dois sentidos — aceito.

O motor monta o vocabulário **pela versão do projeto**. A validação de colisão
(`colisao-sinonimo.ts`) passa a valer **dentro de cada versão**, não mais global.

**D5 — Trava na publicação.** Antes de publicar, o sistema lista (a) siglas da versão que já
significaram OUTRA coisa em versão anterior e (b) siglas que aparecem nos nomes do acervo com
outro sentido (há os nomes no banco). Quem publica vê e confirma. Não bloqueia.

**D6 — "Segue a vN" é só aviso.** Quando o nome não casa com a versão do projeto mas casa com
outra, o envio avisa "parece seguir o padrão vN". **Nunca grava metadado** lido pela versão
alheia — senão o conflito do D4 volta por outra porta.

**D7 — Sub-disciplina (opção B).** Tabela de catálogo nova, cada sub ligada ao card-mãe.
`DocumentoDisciplina.subdisciplinaId` opcional. A sub **não entra na chave** do documento (a
sigla já está no nome). Sem sub = raiz do card (projetos v1, documentos gerais).

**D8 — "Pastas" de sub são visuais.** Agrupamento na tela e pasta no zip; o arquivo físico
não muda de lugar. Corrigir sub lida errada = trocar um campo. Não se mistura com a árvore
`PastaProjeto` (Aprovação/Laudo).

**D9 — Sub cujo card não está no projeto** (`AGF` num projeto sem Hidrossanitário): o envio
pergunta, como já faz com disciplina não reconhecida. Não adivinha, não cria card.

**D10 — Sequencial por sub.** `AGF-001` e `AGQ-001` convivem no mesmo card. Lista Mestre ordena
por sub → número. Card sem sub: sequencial do próprio card.

**D11 — Catálogos com validade por versão.** Disciplinas, sub-disciplinas, etapas e tipos
seguem a mesma regra das siglas: cada linha **vale da vN à vM** (`versaoDesde`/`versaoAte`). Não
se copia o catálogo a cada versão — só se divide o que mudou de fato:
- Card que **não mudou** (HID, EST, ELE…): uma linha, vale da v1 em diante. Relatórios,
  pagamentos e tabelas de preço não se partem.
- Card que **sai ou muda de nome**: a linha antiga ganha `versaoAte = 1` e continua existindo
  (projetos v1 e propostas antigas apontam para ela); o card da v2 é **linha nova** com
  `versaoDesde = 2`. **Nenhum cadastro existente é renomeado** — projetos atuais ficam
  exatamente como estão (dono, 2026-09-21).
- Sigla que muda **sem** o nome mudar (SPDA: `SPD` → `PDA`) fica na mesma linha; só a sigla é
  por versão (D4).

Onde a validade é lida: ao adicionar card num projeto (só os da versão do projeto), no motor
(vocabulário da versão) e no Comercial (proposta nova oferece os da **versão vigente**). O
catálogo na tela ganha o filtro "ver catálogo da v1 / v2". Ver tabela §3.

**D12 — Acervo não é renomeado.** xref de DWG, PDF já entregue com código no carimbo e links
enviados dependem do nome antigo. Projetos existentes ficam na v1 (D2/D3).

**D13 — Respostas do dono sobre a tabela da v2:** `ENE` é card separado de `ELE`; cards sem sub
ficam sem sub por enquanto; `ORÇ` → `ORC`; Topografia = "TOPOGRAFIA"; Arquitetura é card e
Acústica é sub dela.

---

## 2. Pendências — respondidas pelo dono (2026-09-21)

| # | Pergunta | Resposta |
|---|---|---|
| P1 | Sigla "geral" dos cards com subs | Carga inicial `ARQ`, `TEL`, `SEG`, `EST`, `HID`, `PCI`, `CLI`, `GAS` (Drenagem já tem `DRE`); **a equipe ajusta pela tela** |
| P2 | Etapas AP/LG/AB na v2 | Continuam válidas na carga inicial; **a equipe ajusta pela tela** |
| P3 | Subprojeto `.N` | **Continua valendo** — `{proj}` já aceita `.N` opcional; teste de aceite da F2 cobre |
| P4 | Tipos que saem | **PQT → QTO** (mesmo conceito, sigla nova: v1 `PQT`, v2 `QTO`); **PMT e LMS mantidos** |
| P5 | `DET` da v1 | **Na v2, o DET amplo da v1 se divide em PLB, ESQ, DIG e DET.** É só definição do catálogo da v2: o acervo e os projetos v1 continuam com DET amplo, **sem reclassificação** |
| P6 | Cards com nome novo (Cabeamento → Telecomunicações, CFTV → Segurança e Alarme) | **Sem rename:** linha nova válida da v2, a antiga fica só na v1 (D11). Projetos atuais não mudam |
| P7 | Arquivo de terceiro | **Fica fora do padrão**; o literal `SENA` é o que distingue |

Consequência de P1/P2: nada da carga da v2 bloqueia mais a construção. É o que a F4 precisa
permitir (editar siglas, etapas e cards pela tela sem script) — confirmado como requisito.

## 3. Tabela da v2 × catálogo atual

Cards (`DisciplinaCatalogo`). "Reusa" = mesma linha, válida da v1 em diante (sigla pode mudar
por versão). "Nova" = linha nova com `versaoDesde = 2`.

| Card v2 | Sigla v2 | Linha atual | Subs v2 |
|---|---|---|---|
| Elétrica | ELE | reusa `ELE` | — |
| Entrada de Energia | ENE | **nova** | — |
| Subestação | SUB | reusa `SUB` | — |
| Fotovoltaico | FOT | **nova** | — |
| SPDA | PDA | reusa `SPD` (v1 `SPD`, v2 `PDA`) | — |
| Automação | AUT | **nova** | — |
| Telecomunicações | P1 | **nova** (`LOG` Cabeamento fica só na v1) | DAD, VOZ, INT, ANT |
| Segurança e Alarme | P1 | **nova** (`SEG` CFTV fica só na v1) | CAM, SEE, SEP, CHE |
| Estrutural | P1 | reusa `EST` | CON, MET, MAD |
| Fundação | FUN | reusa `FUN` | — |
| Hidrossanitário | P1 | reusa `HID` | AGF, AGQ, ESG, DFE, AGR |
| Drenagem | DRE | reusa `DRE` | TRE |
| Prevenção de Incêndio | P1 | reusa `PCI` | SIN, HDT, SPK, DTA |
| Climatização | P1 | reusa `CLI` | ARC, EXA, SAP, BVA, CMP |
| Gás | P1 | reusa `GAS` | GLP, GLN, GME |
| Orçamento | ORC | reusa `ORC` | — |
| Pavimentação | PAV | reusa `PAV` | — |
| Terraplenagem | TER | reusa `TER` | — |
| Topografia | TOP | reusa `TOP` | — |
| Compatibilização | CPB | **nova** | — |
| Arquitetura | ARQ (P1) | reusa `ARQ` | ACU |

**Acústica:** o card `ACU` ganha `versaoAte = 1` (projetos v1 e propostas antigas seguem
apontando para ele); na v2 `ACU` é sub de Arquitetura (D4/D11). Mesma regra de Cabeamento e CFTV.

**Sigla `SEG`:** na v1 é o card CFTV; na carga inicial da v2 é a sigla geral de Segurança e
Alarme. Não há conflito porque as siglas são por versão (D4) — é exatamente o caso que a trava
de publicação (D5) lista para quem publica confirmar.

Etapas v2: `PRE` / `BAS` / `EXE` (+ P2). Tipos v2: `PLB ISO M3D ESQ DIG DET MEM MEC REL QTO LEV
DOC` (+ P4). Número: 3 dígitos, sequencial por sub (D10).

---

## 4. Riscos achados na análise

**R1 — Comercial resolve disciplina pelo NOME (fora do escopo desta spec).** Com D11 nenhum
cadastro é renomeado, então esta feature não dispara o problema. Fica registrado como defeito
latente para um ajuste à parte: `proposta-composta/service.ts:67` e `:271` montam `idsPorNome`
de `DisciplinaCatalogo.nome`; `PropostaItem` **já tem** `disciplinaId` (CRM F1.19), então a
correção é o serviço usar o id do item. Até lá, renomear qualquer disciplina pela tela faz
propostas existentes perderem as cláusulas por disciplina ao serem reeditadas.

**R2 — Comercial passa a seguir a versão vigente.** `DisciplinaCatalogo` alimenta proposta,
tabela de preço e negociação. Proposta nova oferece os cards da versão vigente (D11): entram
ENE/FOT/AUT/CPB/Telecomunicações/Segurança e Alarme, saem Cabeamento/CFTV/Acústica. Itens de
tabela de preço apontam para a linha antiga — o Comercial precisa cadastrar preço nos cards
novos. Combinar com o Comercial antes de publicar a v2.

**R2b — Proposta v1 aceita depois da v2.** Proposta feita com "Cabeamento" e aceita depois da
publicação da v2 gera projeto novo (v2 pela data de criação, D2) com um card que só vale na v1.
Card fora da versão **não é proibido** no projeto (continua funcionando, projetista/valor
intactos); o `aceitarProposta` avisa e oferece o card equivalente da v2, sem trocar sozinho.

**R3 — Nome antigo + revisão com nome novo = documento novo.** Só acontece se projeto trocar de
versão no meio. "Nova versão de" liga, mas mantém a chave antiga (`api/uploads/route.ts:225`), e
a revisão seguinte exige ligar de novo. Se isso acontecer, o caminho é **renomear o documento**
no HUB (reescreve a chave). D2/D12 evitam o caso no fluxo normal.

**R4 — Vocabulário maior = mais falso positivo em nome livre.** Siglas como `INT`, `CON`,
`CAM`, `SIN`, `REL`, `LEV` casam com pedaços de nomes soltos. Mitigado por D4 (projeto v1 nem
enxerga as siglas da v2) e pela detecção de nome livre que já existe.

**R5 — Seed é create-only com tabela vazia.** Catálogo novo em banco no ar não chega pelo
`db:seed`. Aqui é intencional: a v2 é montada **pela tela** (F6), que é justamente o objetivo
("sem script a cada mudança").

---

## 5. Fases

### F1 — Schema + migration de transição (Opus)

Tabelas/colunas:
- `NomenclaturaVersao` — `numero Int @unique`, `nome`, `modelo`, `larguraNumero Int`,
  `sequenciaPor` (`card | sub`), `vigenteDesde DateTime`, `publicadaEm DateTime?` (null =
  rascunho), `publicadaPorId`, `descricao`.
- ~~`NomenclaturaConfig.versaoId`~~ → **`Projeto.nomenclaturaVersaoId String?`** (desvio da F1,
  2026-09-22): a linha de `NomenclaturaConfig` também carrega `exigir`/`exigirFase`; criar uma
  por projeto para guardar a versão copiaria esses dois e a chave global deixaria de valer para
  todos. A versão fica no projeto; a config segue só para padrão personalizado e as duas opções.
  Null = resolve pela data de criação (D2). O `padrao` da linha global deixa de ser lido depois
  da F2/F4 (a v1 é cópia dele) e sai na contração.
- `SubdisciplinaCatalogo` — `disciplinaCatalogoId`, `nome`, `ativo`, `ordem` (sigla fica em
  `SiglaNomenclatura`).
- `DocumentoDisciplina.subdisciplinaId String?` + índice, `onDelete: SetNull`.
- `SiglaNomenclatura` — `sigla`, `oficial Boolean` (oficial × sinônimo), `versaoDesde Int`,
  `versaoAte Int?`, e **exatamente um** de `disciplinaCatalogoId` / `subdisciplinaId` /
  `pranchaCatalogoId` (CHECK na migration SQL). Único: `(sigla, categoria, versão)` validado na
  action (faixa de versões não cabe em UNIQUE simples).
- Validade por versão (D11): `versaoDesde Int @default(1)` + `versaoAte Int?` em
  `DisciplinaCatalogo`, `SubdisciplinaCatalogo` e `PranchaCatalogo`. Todo o catálogo atual fica
  `1 → null` na migration.

Migration (tudo dentro dela, sem script avulso):
1. Cria a **v1** com o `padrao` global atual, `vigenteDesde` = data antiga, publicada.
2. **Todo projeto existente fica com `nomenclaturaVersaoId` = v1** (UPDATE). Projeto com padrão
   próprio continua personalizado: o `padrao` do projeto vence a versão na leitura.
3. `codigo`/`sigla` + `sinonimos` atuais viram linhas de `SiglaNomenclatura` com
   `versaoDesde = 1`, `versaoAte = null`. Colunas antigas ficam (expand); leitura passa para a
   tabela nova; `DROP` só num deploy posterior.

Aceite: `prisma-migration-reviewer` limpo; no dev, todo projeto tem versão ou padrão próprio;
o vocabulário montado pela tabela nova é idêntico ao atual (teste comparando os dois).

**Entregue (2026-09-22):** migration `20260922120000_nomenclatura_versionada` (aplicada no dev);
`siglas-versao.ts` puro + testado (inclui a prova de equivalência sobre o catálogo de produção);
`carregarCatalogosNomenclaturaDaVersao` em `nomenclatura/queries.ts` (ainda sem consumidor — a
F2 troca); espelho transitório `siglas-service.ts` chamado por criar/editar disciplina e sigla
da Lista Mestre e pelo seed (`semearSiglasFaltantes`); `scripts/verificar-siglas-versao.ts`
(só leitura) — **rodar em produção logo após o deploy**: deve dar N/N idênticos e 0 projeto
sem versão fixada. Revisor: 0 crítico; índice de `publicadaPorId` acrescentado na própria
migration (ainda não publicada).

### F2 — Motor por versão + sub (Opus)

- `montarVocabulario` recebe a versão; só entra sigla com `versaoDesde <= v <= versaoAte`.
- Categoria nova `subdisciplina` no vocabulário; entrada de sub carrega `disciplinaCatalogoId`
  do card-mãe. Achou sub → preenche disciplina (card) **e** sub, confiança alta. Sub + sigla de
  card divergente no mesmo nome → aviso `disciplina_divergente`.
- Heurística de posição: a sub ocupa o lugar da disciplina (parte antes da fase).
- `colisao-sinonimo.ts` por versão; sub e card da mesma versão não podem repetir sigla.
- Aviso novo `outra_versao` (D6): tenta compilar os modelos das outras versões publicadas; só
  texto, sem metadado.
- Rota `/api/uploads`: grava `subdisciplinaId` com a mesma precedência de fase/tipo
  (`precedencia.ts`); D9 quando o card não está no projeto.

Aceite: testes com `260010-SENA-AGF-BAS-001-PLB` (v2) e `260018-EST-EX-4012-DET` (v1) no mesmo
catálogo, cada um lido só pela sua versão; `ESG` resolve HID na v1 e Esgoto na v2; `ACU` card na
v1 e sub na v2.

**Entregue (2026-09-22):** vocabulário com categoria `subdisciplina` + `paiDe()`; motor acha a
sub no lugar da disciplina e preenche card-mãe + sub (heurística e `{disc}` do padrão), avisa
card × sub contraditórios e ganha o aviso `outra_versao`; `versao.ts` puro (`versaoDoProjeto`,
`outrosPadroes`) + `resolverNomenclatura` com `versao`/`personalizado`/`outrosPadroes`; rota de
upload, página de arquivos, diálogo V2 e `preencher-metadados-documentos.ts` leem o catálogo da
versão do projeto; rota grava `subdisciplinaId` (manual via campo `subdisciplinaId` do form, ou
lida do nome só se a sub for do card da disciplina — D9) e registra no `DocumentoEvento`;
`primeiraColisaoNaVersao` pura (consumidor na F4). Fixture de duas versões em
`src/test/catalogo-nomenclatura-versoes.ts`; aceite em `interpretar-versao.test.ts`.
Card de v2 SEM sigla geral é mantido no vocabulário quando tem sub (senão as subs sumiam junto).

**Efeito transitório até a F4:** o campo "padrão" da nomenclatura GLOBAL (Configurações → Lista
Mestre) não é mais lido — a v1 é cópia dele. Editar ali não muda nada até a F4 trocar a tela
pela lista de versões. Não publicar F2/F3 sem a F4.

### F3 — Geradores de nome (Opus)

- Função pura nova `montarNome(modelo, campos, regras)`: substitui `codigoPrancha` fixo.
  Consumidores: `nomeCorrigidoPeloPadrao`, correção em lote do envio, códigos da Lista Mestre,
  `numeroDaListaMestre` (`lista-mestre/service.ts:133` — hoje soma à faixa).
- Próximo número respeita `sequenciaPor` e `larguraNumero` da versão.
- `parsePranchaFilename` e `faseDoNomeArquivo` (5 campos fixos) saem dos consumidores
  (`documentos-agrupados*.ts`, `arquivos-explorer.tsx`) em favor de `compilarPadrao` da versão
  do projeto. Sem padrão nenhum → parser da v1.
- `interpretarModeloVisual` aceita bloco de **texto fixo** (`SENA`) — hoje cai em modo avançado.

Aceite: correção de nome num projeto v2 gera `260010-SENA-AGF-BAS-002-PLB`; num projeto v1
gera o formato de hoje.

**Entregue (2026-09-22):** `montarNome` puro em `padrao.ts` (modelo da versão, texto fixo,
opcional, `???` em obrigatório vazio, regex legada cai no modelo original);
`codigoPrancha`/`nomeCorrigidoPeloPadrao`/`nomeDaListaMestre` sobre ele. Achado que a spec não
previa: os geradores também pegavam as siglas das COLUNAS (v1) — num projeto v2 sairia `BS` onde
o padrão pede `BAS`. `siglas-nome.ts` (puro) traduz fase/tipo/card para a sigla da versão e lista
as subs do card; o diálogo V2 usa isso na correção unitária (novo seletor de sub-disciplina,
obrigatório quando o card não tem sigla geral) e na correção em lote (usa a sub lida do nome de
cada arquivo). Lista Mestre: siglas da versão, número 0 quando a sequência recomeça
(`sequenciaPor` ≠ faixa), largura da versão no nome, no PDF/XLSX e na prévia.
`interpretarModeloVisual`/`montarModelo` aceitam bloco de texto fixo; o formulário atual passou a
operar blocos por posição e ganhou "Adicionar texto fixo" (a tela de versões da F4 o reaproveita).

**Desvios deliberados:**
- `parsePranchaFilename` FICA em `documentos-agrupados*.ts`: é só reserva de exibição para
  documento que o motor nunca leu (acervo antigo). Todo envio, de qualquer versão, grava
  número/tipo pela rota — trocar por `compilarPadrao` por projeto (o diretório lista vários
  projetos) não mudaria nada visível.
- `arquivos-explorer.tsx` (V1, Visão Geral) não muda: a correção de nome lá continua no formato
  original. O fluxo suportado para projeto v2 é o diálogo V2.

**Para a F5 (exibição por versão):** as telas mostram a sigla da COLUNA (v1) — filtro de
fase/tipo, badges, colunas da tabela, seletores do painel de detalhe e da conferência pós-envio
mostram `BS` num projeto v2. `tabela-documentos.tsx` mostra o número com 4 dígitos fixos. A
correção em lote não tem seletor de sub (usa a lida do nome). Tudo isso é leitura/rotulagem:
o que é gravado já está certo.

### F4 — Telas de configuração (Sonnet)

- **Configurações → Nomenclatura**: lista de versões (vigente destacada), rascunho editável
  (editor visual + regras de número + siglas da versão), botão Publicar com a trava do D5.
- **Configurações → Disciplinas**: subs aninhadas no card; siglas por versão (coluna "vale da
  vN à vM") nos cards e nas subs; filtro "ver catálogo da vN".
- **Lista Mestre (catálogo de fase/tipo)**: siglas por versão, mesma coluna.
- **Projeto → Lista Mestre**: seletor "Padrão: v1 · v2 · Personalizado" (onde hoje fica a
  seção de nomenclatura), com a confirmação e a contagem do D3.
- Gate: `configuracoes:gerir` (o mesmo de hoje), sem permissão nova.
- Adicionar card no projeto e proposta nova filtram pela validade (D11); `aceitarProposta`
  com o aviso de R2b.
- Requisito do dono (P1/P2): siglas gerais, etapas, cards e subs **todos editáveis pela tela** —
  nenhuma mudança futura da gestão pode exigir script.

**Entregue (2026-09-22, Sonnet):** tela `/configuracoes/nomenclatura` (lista de versões, rascunho
editável com `EditorModeloNome` — o mesmo editor visual/avançado, texto fixo incluso —, regras de
número, botão Publicar com a trava do D5 num diálogo de confirmação listando cada redefinição +
quantos arquivos do acervo têm a sigla); `criarRascunhoVersao`/`editarRascunhoVersao`/
`excluirRascunhoVersao`/`publicarVersaoNomenclatura` (`modules/projetos/nomenclatura/
versoes-actions.ts`). `SiglasVersaoDialog` compartilhado (uma linha por faixa de versão,
oficial/sinônimo, encerrar/reabrir/excluir) aberto a partir do card (Disciplinas), da
sub-disciplina (`SubdisciplinasDialog`, com CRUD de sub) e do item da Lista Mestre — os três
catálogos gravam nas colunas antigas (mantém `sincronizarSiglasV1`) e a mudança em
`SiglaNomenclatura` é direta pela action `criarSiglaVersao` (bloqueia colisão dentro da versão,
D4; auto-encerra a oficial anterior ao trocar). Filtro "válida na vN" nas telas de Disciplinas e
Lista Mestre (`valeNaVersao` client-side). `Projeto → Lista Mestre`: `VersaoProjetoSeletor`
substitui o antigo editor de padrão — botões v1/v2/…/Personalizado, com a contagem do D3
(`contarForaDoPadraoParaVersao`) antes de confirmar; "Personalizado" reabre o `NomenclaturaForm`
de sempre. A tela global (Configurações → Lista Mestre) perdeu o editor de padrão
(`mostrarPadrao={false}` no `NomenclaturaForm`, só exigir/exigirFase) com nota apontando pra
`/configuracoes/nomenclatura`. `criarProjeto` e `aceitarProposta` passam a fixar
`nomenclaturaVersaoId` na criação (D2), como a migration já fazia para os projetos existentes.

**D11/R2b — escopo reduzido (documentado, não a lista inteira de `catalogoDisciplinas()`):**
filtrado só em "adicionar disciplina ao projeto" (`disciplinas-operacionais.tsx`, pela versão DO
PROJETO) e "compor proposta" (pela versão vigente hoje, com os cards já usados na proposta
sempre visíveis). Telas que lidam com dado histórico entre versões (funil, modelos de proposta,
tabela de preço, template de input, filtro do `/projetos`) NÃO filtram — filtrar ali esconderia
disciplina legítima de projeto/proposta antigos. `aceitarProposta` ganha `avisos: string[]`
(R2b, non-blocking, comparação por NOME — mesma fragilidade do R1, que segue fora do escopo)
surfaced como `toast.warning` nos 3 pontos de entrada do aceite.

### F5 — Telas de uso (Sonnet)

- Card do projeto: agrupamento por sub (sem sub = raiz), filtro por sub na lista V2.
- Envio V2: sub aparece ao lado da disciplina, editável (Select), com o mesmo guard de tamanho.
- Lista Mestre: ordena card → sub → número; coluna Sub.
- Zip de download: pasta por sub.
- V1 (`arquivos-explorer.tsx`) só não quebra; sem feature nova.

**Entregue (2026-09-22, Sonnet):** envio V2 ganha o Select de sub-disciplina (só aparece quando
o card tem subs), gravado junto com fase/tipo. Lista de documentos: filtro "Sub-disciplina" no
drawer (`opcoesMetadadosDocumento` traz as subs dos cards do projeto) + coluna "Sub" (opcional,
`colunas-documento.ts`) na tabela e no card mobile — filtro é SQL de verdade (`FiltrosDoc.sub`,
sentinel `SUB_SEM` pro "sem sub"), não cliente. Lista Mestre: `montarListaMestre` ordena
sub → número (raiz do card primeiro, subs em ordem alfabética) e o documento/planilha ganham a
coluna "Sub" (a prévia da tela, que já era resumida sem fase/tipo/papel, ficou como estava).
`caminhoNoZip` aceita a sub como pasta extra entre o pacote e a subpasta por extensão, aplicado
no zip da disciplina e no zip de selecionados.

**Escopo reduzido, documentado:** SEM agrupamento visual por sub na lista (seções com cabeçalho,
como `GrupoCategoria` faz em Disciplinas) — o filtro + a coluna cobrem "achar os documentos de
uma sub" sem reestruturar a tabela; a árvore de navegação (`arvore-navegacao.ts`, disciplina →
fase → extensão) não ganhou um nível de sub. O zip do "Diretório geral" (`/api/arquivos/zip`,
hierarquia ano/projeto/disciplina/fase, não pacote) não foi tocado — é outra árvore de nomes.

### F6 — Manual, carga da v2, deploy (Sonnet)

- `docs/manual/` (seção de nomenclatura do envio + configurações) e `novidades.md`.
- Carga da v2 **pela tela**, com §2 respondida — é o teste de aceite da F4.
- Deploy: migration da F1; nada de script. Conferir em prod que todo projeto ficou na v1 antes
  de publicar a v2.

**Entregue (2026-09-22, Sonnet):**
- `docs/manual/projetos/projetos.md` — seção "Padrão de nomenclatura do projeto" reescrita pra
  versionamento (botões v1/v2/Personalizado, contagem antes de trocar, texto fixo no editor).
- `docs/manual/sistema/configuracoes.md` — bullets novos "Disciplinas" (sub-disciplina), "Lista
  Mestre" e "Nomenclatura" (versão imutável, projeto novo pega a vigente, aviso de redefinição).
- `docs/manual/novidades.md` — entrada nova no topo, linguagem de usuário.
- `docs/manual/search-index.json` — atualizado à mão (sem gerador automático) nas 3 entradas
  acima: `nomenclatura`, `sub-disciplina`, `versão do padrão`, `publicar versão` etc., pra
  `/ajuda` achar (visível a todo papel, cliente incluído).

**NÃO entregue nesta sessão — depende de quem tem acesso à tela/produção:**
- **Carga real da v2** (o teste de aceite da F4): esta sessão não dirige navegador. Fica pro
  dono fazer em `/configuracoes/nomenclatura` (+ Disciplinas + Lista Mestre) quando for validar
  visualmente, usando as respostas do §2 como roteiro. Nenhum dado de v2 foi escrito direto no
  banco — faria o "sem script a cada mudança" (o motivo de toda a spec) perder a própria prova.
- **Deploy em produção.** Checklist abaixo, a rodar quando o dono decidir publicar:
  1. Fazer merge de `feat/nomenclatura-versionada` → `dev` → `master` (workflow de sempre:
     dev = trabalho, master = deploy).
  2. Deploy normal (`npm run build` + restart). A migration `20260922120000_nomenclatura_versionada`
     roda sozinha (`prisma migrate deploy`) — sem script avulso, como todas as anteriores.
  3. **Logo após o deploy, antes de qualquer outra coisa**: rodar
     `npx tsx --tsconfig tsconfig.server.json scripts/verificar-siglas-versao.ts` contra o banco
     de PRODUÇÃO. Tem de dar **N/N vocabulários idênticos** e **0 projetos sem versão fixada**.
     Em prod há sinônimos reais (HDR/ESG, PE/EXE…) que o dev não tem — é aqui que uma divergência
     apareceria antes de afetar um envio de verdade.
  4. Confirmar que `db:seed` (parte do deploy padrão) não criou nada em `sigla_nomenclatura` —
     `semearSiglasFaltantes` só age em item sem NENHUMA linha, e a migration já cobriu todo o
     catálogo existente; `0 criada(s)` é o esperado (visto no dev, §"Entregue" da F1).
  5. **Só depois disso** o dono cadastra e publica a v2 pela tela. Publicar não afeta os
     projetos existentes (D2) — mas revisar o diálogo de redefinição (D5) com atenção na
     primeira publicação real, já que o acervo de prod tem os casos genuínos (ESG, ACU, SEG).
  6. Sem passo de rollback dedicado: a migration é só aditiva (nenhuma coluna sai), e nada some
     do catálogo por seguir usando o padrão v1 — reverter é não publicar a v2.

---

## 6. Fora do escopo

- Status, prazo, projetista ou pagamento por sub (sub é só etiqueta — D7).
- Renomear o acervo (D12).
- Mover arquivo físico por sub (D8).
- Bloquear envio fora do padrão (`nomenclatura.exigir` continua só aviso).
- Faixa de numeração (`numeracaoFim`): com sigla explícita na v2, só serve ao acervo v1 — não
  investir em preencher.
