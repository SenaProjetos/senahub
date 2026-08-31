# Contratos no Estúdio de Documentos — integração e evolução

**Data:** 2026-08-27 · **Status:** E1–E5 e E7b entregues; E6/E7a/M2 pendentes (ver §9) · **Branch alvo:** `dev`

Substitui o pipeline de modelo de contrato em texto puro (`ModeloContrato` + `montarHtml`, entregue
em `2026-08-26-gerenciador-contratos.md` Fase B) pelo **Estúdio de Documentos**, que já resolve
formatação, timbrado, assinatura e paginação — visualmente, sem exigir Markdown de ninguém.

---

## 1. Por que este documento existe

A Fase B do gerenciador de contratos reusou apenas o **motor de tokens** do Estúdio
(`documentos/tokens.ts`) e escreveu um pipeline próprio de HTML→PDF (`contrato/gerar.ts`
`montarHtml` + `gerarPdfDoHtml`). Esse pipeline:

- **escapa todo o conteúdo** (correto para evitar que "Silva & Filhos" quebre o HTML, mas o efeito
  é que nenhuma formatação é possível);
- só converte linha em branco → parágrafo;
- usa um invólucro fixo (Georgia, A4, margem 20mm), **sem cabeçalho, rodapé, logo ou numeração**.

Resultado: contrato em texto corrido. Passa num documento interno; não passa num contrato que vai
ao cliente.

O Estúdio já entrega tudo isso — e foi **desenhado para contratos desde o início**
(`TipoDocumento` tem o valor `contrato`). A duplicação foi um erro de reconhecimento meu, não uma
decisão de design.

---

## 2. Estado verificado do Estúdio (2026-08-27)

O `2026-06-20-estudio-documentos-v2-design.md` fecha com **"Estúdio v2 concluído"** — não é um
projeto pela metade; é um projeto pronto cuja *evolução* parou por prioridade. Conferido no código:

| Necessidade do contrato | Onde já está resolvido |
|---|---|
| Formatação (negrito, fonte, cor, alinhamento, borda) | `estiloSchema` por elemento |
| Timbrado / logo | banda `cabecalhoPagina` + elemento `imagem` + upload em `/api/documentos/imagens` |
| Rodapé e numeração de página | banda `rodapePagina` + `pagina.numerarPaginas` (footer nativo do Puppeteer) |
| Bloco de assinatura | elemento `assinatura` |
| Tabelas (ex.: cronograma de pagamento) | elemento `tabela` com colunas configuráveis |
| Cláusula que só aparece às vezes | `elemento.condicao` (`[EstadoCivil] == "casado"`) |
| Formato e margem ABNT | `FORMATOS_FOLHA` A0–A5/Carta + `margemAbntPx()` |
| Versionar o modelo | `DocumentoModeloVersao` |
| Congelar o que foi gerado | `DocumentoGerado.schemaSnapshot` + `dadosSnapshot` |
| **PDF com bytes estáveis** | `DocumentoGerado.arquivoPath` — a rota persiste na 1ª geração e depois **serve o arquivo salvo**, não regera |
| Numeração do documento | `serie`/`numero` + token `[NumeroDocumento]` |
| Quem pode usar cada fonte | `fontes-perm.ts` (`podeVerFonte`), com gate server na geração |

O item de bytes estáveis é o que torna a integração viável: assinatura precisa hashear um arquivo
que não muda. Se o PDF fosse re-renderizado a cada request, o hash divergiria e a trilha inteira
passaria a acusar adulteração.

**Volume atual (dev):** `ModeloContrato` = 0 · `DocumentoModelo` = 3 (nenhum `tipo: contrato`) ·
`DocumentoGerado` = 0. ⚠️ Conferir em produção antes de remover qualquer coisa.

---

## 3. O gap real: falta uma fonte de dados de contrato

As 9 fontes existentes (`empresa`, `projeto`, `proposta`, `cliente`, `licitacao`, `holerite`,
`extrato`, `lancamentos`, `dre`) **não incluem contrato nem vínculo**. É só isso que impede um
modelo do Estúdio de virar contrato.

O `campos.ts` que a Fase B já produziu — escalar a partir de `Vinculo`+`User`+`PessoaJuridica`
(equipe) ou `Proposta`+`Cliente` (cliente) — é exatamente o corpo de um resolvedor de fonte. Ele
não é jogado fora: **muda de dono**.

---

## 4. Design da integração

### 4.1 Nova fonte `contrato`

`fontes-meta.ts` ganha a `FonteDef`; `fontes.ts` ganha o ramo no `resolverFonte`, delegando a
`contrato/campos.ts`.

```
id: "contrato"
label: "Contrato (equipe ou cliente)"
params: [{ id: "contratoId", label: "Contrato", tipo: "contrato" }]   ← tipo NOVO
escalares: os campos de CAMPOS_EQUIPE + CAMPOS_CLIENTE + CAMPOS_CONTRATO
colecao: parcelas do contrato (para a tabela de cronograma de pagamento)
```

`ParamFonte.tipo` hoje é uma união fechada
(`projeto|cliente|usuario|mes|proposta|licitacao|holerite`) — precisa do valor `contrato`, e o
seletor de parâmetro correspondente na UI de geração.

### 4.2 ⚠️ Permissão: o modelo de `fontes-perm.ts` não basta sozinho

`FonteDef.permissao` é **estático** (`{ recurso, acao }`) e avaliado por fonte. Mas o gate de
contrato é **por registro**: contrato de EQUIPE carrega salário, CPF e RG e exige
`HR_ADMIN_ROLES`; contrato de CLIENTE não.

Declarar `permissao: { recurso: "juridico", acao: "ver" }` na fonte deixaria qualquer um com
`juridico:ver` gerar um documento com o salário de um colega — furo direto no gate que a Fase A
estabeleceu.

**Solução:** a fonte declara o gate mínimo (`juridico:ver`) E o resolvedor faz a checagem por
registro, recusando quando o contrato tem `vinculoId` e o usuário não é `HR_ADMIN_ROLES`. Isso
exige que `resolverFonte` conheça o usuário — hoje ele recebe só `(fonteId, params)`. **É a única
mudança de assinatura que esta integração pede no Estúdio**, e precisa ser feita com cuidado:
todos os chamadores passam a repassar o viewer.

### 4.3 Geração do contrato

`gerarVersaoDeModelo` deixa de montar HTML e passa a:

1. criar um `DocumentoGerado` a partir de um `DocumentoModelo` (`tipo: contrato`), com
   `params: { contratoId }`;
2. obter o PDF persistido daquele gerado (`arquivoPath`);
3. criar a `DocJuridicoVersao` apontando para esse arquivo;
4. guardar o `documentoGeradoId` na versão, para rastrear qual layout+dados produziram aquele PDF.

`DocJuridicoVersao` ganha `documentoGeradoId String?` (aditivo, nullable — versões enviadas por
upload manual continuam sem ele).

### 4.4 O que morre

- `ModeloContrato` (model + CRUD + aba "Modelos" do jurídico) — 0 registros no dev; **conferir
  produção**. Enquanto houver dúvida, marcar como deprecado em vez de dropar.
- `contrato/gerar.ts`: `montarHtml`, `escaparHtml`, `gerarPdfDoHtml`.

### 4.5 O que sobrevive intacto

Cadeia de evidência, assinatura interna e externa, certificado de conclusão, aditivos, faturamento,
prazos legais, alçada, badge. Nada disso depende de como o PDF é desenhado.

---

## 5. A pergunta que originou tudo: cláusula específica por contrato

> "É possível alterar detalhes para contratos específicos usando o template como base, ou somente
> preencher campos?"

No Estúdio, **não se edita o layout por contrato** — isso bagunçaria um modelo compartilhado e
faria cada contrato virar um layout órfão.

A solução é tratar a cláusula específica como **dado, não como desenho**: o modelo tem um elemento
`paragrafo` com o token `[ClausulasAdicionais]`, e o contrato carrega esse texto num campo próprio.
O layout continua único e padronizado; o que varia é o conteúdo. Cobre exatamente o caso real
("90% padrão + duas cláusulas daquele contrato") sem multiplicar modelos.

`DocumentoJuridico` ganha `clausulasAdicionais String?` — e, junto, o campo de edição pré-geração
que já havia sido pedido.

Para o caso raro em que o contrato é estruturalmente diferente, o caminho continua sendo
**duplicar o modelo** no Estúdio (função que já existe) — decisão consciente de quem monta, não
efeito colateral.

---

## 6. Melhorias propostas ao Estúdio

Ordenadas por valor para contrato. As três primeiras eu recomendo fazer junto da integração; as
demais são independentes.

### M1 — Bloquear geração com campo obrigatório vazio · **valor alto**
O Estúdio renderiza token sem valor como string vazia e segue. Num relatório é aceitável; num
contrato produz *"salário mensal de R$ "* num documento assinável — entregável, e por isso pior
que um erro. A Fase B já tem `tokensNaoResolvidos` pronto e testado.

Proposta: **opt-in por modelo** (`schemaJson.pagina.bloquearCamposVazios`), não global — um
relatório gerencial legitimamente tolera lacuna.

### M2 — Rubrica por página · **valor alto para contrato**
Praxe em contrato brasileiro e hoje inexistente. Esbarra na limitação já documentada: `[Pagina]` em
elemento do corpo fica sempre 1/1 (o `counter(pages)` do CSS só vale na margem `@page`). A
numeração real é o footer nativo opt-in. Rubrica precisaria do mesmo mecanismo — investigar se cabe
no `headerTemplate`/`footerTemplate` do Puppeteer.

### M3 — Bloco de assinatura com dados reais · **valor médio-alto**
Hoje o elemento `assinatura` é linha + rótulo. Depois de assinado, o documento poderia exibir quem
assinou, quando, e o hash — puxando da trilha de evidência (`EventoAssinatura`) que já existe.
Reduz a dependência do certificado de conclusão como anexo separado.

### M4 — `arquivoPath` fora de `lib/storage` · **dívida técnica**
`api/documentos/gerados/[id]/pdf/route.ts` usa `fs.existsSync`/`fs.readFileSync` direto no caminho
vindo do banco, contornando `resolverCaminho()` e a guarda de `STORAGE_BASE_PATH` que o
`CLAUDE.md` define como padrão do projeto. O caminho é escrito pela própria rota (risco de
traversal baixo), mas a inconsistência com o resto do sistema é real.

### M5 — Rate limit na geração · **atrito operacional**
12 PDFs por 10 minutos por usuário. Um lote de contratos de admissão estoura. Sugiro tornar o teto
configurável, ou isentar geração de contrato.

### M6 — Catálogo de modelos de fábrica para contrato · **valor de adoção**
O Estúdio tem import/export JSON e biblioteca de blocos. Um modelo de fábrica de contrato de
estágio/CLT/PJ/prestação de serviço, já com timbrado e bloco de assinatura, faz o jurídico começar
de algo em vez de uma folha em branco. Sem isso, a chance de ninguém usar é alta — foi exatamente o
que aconteceu com o módulo Comercial (`docs/crm/00-auditoria.md`: contornado por ser mais lento que
o Word).

---

## 7. Fases

**Critério de modelo** (mesmo tier de `docs/crm/04-plano-fases.md` §2 e do spec de contratos):
**H**aiku — mecânico, 1–2 arquivos, campo/UI, zero lógica · **S**onnet — feature de padrão
conhecido, copiando algo que já existe no repo · **O**pus — arquitetura, migração destrutiva, ou
qualquer ponto em que errar vira vazamento de dado sensível, prova jurídica inválida ou dinheiro
errado.

> **Regra de execução:** quando a fase pede modelo diferente do que está ativo, **parar e esperar a
> troca** (`/model`) — não seguir avisando. Trocar depois de começar desperdiça o trabalho já feito
> no modelo errado.

| Fase | Conteúdo | Modelo | Migration |
|---|---|---|---|
| **E1** | Fonte `contrato` (meta + resolvedor + `ParamFonte.tipo`) e o gate por registro do §4.2 | **O** | não |
| **E2** | `gerarVersaoDeModelo` passa a usar `DocumentoGerado`; `DocJuridicoVersao.documentoGeradoId` | **S** | sim (1 coluna) |
| **E3** | `clausulasAdicionais` + edição pré-geração | **S** | sim (1 coluna) |
| **E4** | M1 (bloqueio de campo vazio, opt-in por modelo) | **S** | não (vive no `schemaJson`) |
| **E5** | M6 (modelos de fábrica de contrato) | **S** | não |
| **E6** | Depreciar `ModeloContrato`, remover `montarHtml`/`gerarPdfDoHtml` — **após conferir produção** | **O** | sim (drop) |
| **E7a** | M4 (storage via `resolverCaminho`) + M5 (rate limit configurável) | **H** | não |
| **E7b** | M3 (bloco de assinatura com dados da trilha) | **S** | não |
| **—** | M2 (rubrica por página) — investigação antes de estimar | **O** | ? |

**Justificativa dos tiers que não são óbvios:**

- **E1 = O** porque muda a assinatura de `resolverFonte` e toca todos os chamadores do Estúdio. O
  modo de falha é *falha aberta*: um chamador que esqueça de repassar o viewer vaza salário sem
  erro nenhum. É o mesmo tier de `contrato/estado.ts` e da cadeia de evidência — errar não dá bug
  visível, dá vazamento silencioso.
- **E2 = S** porque o desenho já está fixado por E1 e por este documento: é religar a geração e
  uma coluna. O risco (bytes do PDF) é de *verificação*, não de projeto — e a verificação está
  escrita no §8.
- **E5 = S** apesar de ser majoritariamente conteúdo (layouts em JSON): exige julgamento sobre como
  um contrato deve se parecer, o que Haiku não sustenta bem.
- **E6 = O** por ser migração destrutiva conferida contra produção — o critério do repo põe
  qualquer `DROP` neste tier, independentemente do tamanho do diff.
- **E7a = H** porque são duas trocas mecânicas e localizadas: `fs.*` → `lib/storage`, e um número
  virando chave de `ConfigSistema`.

Ordem: E1 → E2 destrava tudo. E3 responde a pergunta original. E6 só depois de E1–E5 estarem em uso
de verdade — remover o caminho antigo antes disso deixaria o jurídico sem nenhum.

---

## 8. Riscos

- **§4.2 é o risco principal.** Mudar a assinatura de `resolverFonte` toca todos os chamadores do
  Estúdio (preview, geração, DXF, e-mail). Se algum ficar sem repassar o viewer, o gate de RH
  falha aberto — vaza salário. Toda a superfície precisa ser varrida, e o teste tem que provar a
  recusa, não só o caminho feliz.
- **Bytes do PDF.** A integração depende de `arquivoPath` ser servido sem re-render. Se alguma
  rota regenerar, o hash da assinatura diverge e a trilha acusa adulteração de um documento
  íntegro — falha pior que não ter trilha. Verificar contra o banco antes de E2 fechar.
- ~~**`ModeloContrato` em produção.** Contagem é 0 no dev; produção não foi conferida. E6 não começa
  sem isso.~~ **Resolvido em 2026-08-30:** produção conferida (0 linhas / 0 bytes), tabela removida
  na E6 Parte B — ver §9.
- **Adoção.** O Estúdio é mais poderoso e mais difícil que um textarea. Sem M6 (modelos prontos), o
  risco não é técnico — é o jurídico continuar fazendo contrato no Word, que é o fracasso que o
  módulo Comercial já viveu.

---

## 9. Progresso (execução)

- **E1** (`2c974e9` da série anterior, commit `d138c4e`) — fonte `contrato` + gate por registro.
  Verificado contra o banco: contrato de equipe/cliente/sem-âncora, RH×não-RH.
- **E2 + E3** (commit `2c974e9`) — `gerarVersaoDeModelo` via `DocumentoGerado`; `clausulasAdicionais`
  + UI de edição. Migration `20260827195414_contratos_estudio_geracao` (aditiva: 1 FK nullable + 1
  coluna nullable). Verificado contra o banco: gate real, numeração v1/v2, FK gravada, bytes salvos
  sob a convenção do jurídico (não o caminho do `DocumentoGerado`), reset de status ao regerar sobre
  contrato assinado, modelo de tipo errado recusado.
- **E4** (commit `2c974e9`) — bloqueio de campo vazio/desconhecido, opt-in por modelo
  (`pagina.bloquearCamposVazios`). 11 testes.
- **E5** (commit `2c974e9`) — 4 modelos de fábrica (CLT/estágio/PJ/cliente), semeados via `db:seed`
  idempotente. O teste que verifica cada token citado contra o catálogo real pegou um bug antes de
  chegar a runtime: o aviso de revisão do modelo estava escrito entre colchetes — sintaxe de token
  do próprio motor — e teria sido lido como campo desconhecido, bloqueando (via E4) a geração de
  todo contrato de fábrica, sempre. Corrigido antes do commit.
- **E7b** (commit `386cd72`) — token `[UltimaAssinaturaResumo]`: nome/data/hash-prefixo de quem
  assinou a versão anterior, para um documento novo (ex.: aditivo) citar sem reescrever o PDF já
  assinado (imutável — é o objeto hasheado pela cadeia de evidência). Verificado contra o banco:
  nulo antes do aceite, presente e com hash truncado depois.
- **E6 — Parte A (código órfão)** — removidos `gerarVersaoDeModeloTextoPuro` (já órfã desde a E2:
  a action passou a chamar o caminho do Estúdio) e `montarHtml` (sem outro chamador), com os 4
  testes dela. Verificado contra o banco que a geração ativa segue intacta, e por script que o
  certificado de conclusão continua montando.

  > **Correção ao §7:** a linha da tabela dizia "remover `montarHtml`/`gerarPdfDoHtml`" — **errado
  > quanto a `gerarPdfDoHtml`**. Ela nunca foi do pipeline de texto puro: quem a usa é o certificado
  > de conclusão da assinatura, gerado AO VIVO e nunca arquivado (`assinatura/certificado.ts` +
  > `api/juridico/versoes/[id]/certificado`), que monta o próprio HTML. `escaparHtml` idem. As duas
  > ficam. Removê-las quebraria a prova de assinatura, que é o oposto do objetivo deste spec.

- **E7a (Haiku)** — M4 (`arquivoPath` via `resolverCaminho`, commit `840521d`) + M5 (rate limit
  configurável via `ConfigSistema`, chave `documentos.geracaoPdf`, commit `efafec2`).

- **E6 — Parte B (2026-08-30)** — desbloqueada e concluída. A contagem em produção saiu **0 linhas /
  0 bytes** (mesmo resultado do dev), então não houve texto a exportar: nada se perdeu. Removidos as
  actions `criar/editar/excluirModeloContrato`, a `ModelosTab` e sua aba, a query em `page.tsx`, o
  model do `schema.prisma` e a tabela.

  A conferência rodou por `scripts/e6-limpar-modelo-contrato.py` (também há variante `.sh` e `.sql`,
  ver `scripts/E6-LEIA-ME.md`): o script mede `count` **e** `sum(length(conteudo))` e só dropa
  sozinho quando os dois são nulos — com texto real ele exporta CSV+JSON e para, exigindo aprovação
  manual, exatamente a regra que este spec definia.

  > **Pegadinha da migration.** O drop em produção foi feito por esse script, **fora do Prisma** — o
  > `_prisma_migrations` de lá não sabe dele. Por isso `20260830120000_e6_remove_modelo_contrato`
  > usa `DROP TABLE IF EXISTS`: sem o guard, o `migrate deploy` do próximo release quebraria naquele
  > servidor, tentando dropar o que já não existe. No dev a tabela foi dropada à mão (também vazia,
  > conferida antes) e a migration marcada com `migrate resolve --applied`, seguindo `/nova-migracao`
  > para não arriscar reset por drift.

### M2 — investigação concluída (rubrica por página)

A pergunta era se a rubrica cabe no `headerTemplate`/`footerTemplate` do Puppeteer. **Cabe, e é a
única via** — medido em spike com Chrome real, PDF de 2 páginas lido de volta com `pdfjs-dist`.

Ponto de partida que muda o desenho: `doc-render.tsx` emite **fluxo HTML único**, uma `.doc-pagina`
só. As bandas não se repetem por página física — quem pagina é o Chrome. Logo `rodapePagina` NÃO
serve de rubrica, e `[Paginas]` é estimativa por altura, não a contagem real.

| Via | Repete em toda página? | Reserva espaço? | Aceita imagem? |
|---|---|---|---|
| `footerTemplate` nativo | **sim** | **sim** (via `@page`) | **sim** (data-URI) |
| `position: fixed` | sim | **não — sobrepõe** | sim |
| banda `rodapePagina` | não (fluxo único) | — | — |

`position: fixed` repete mas passa por cima do texto, e nem `padding-bottom` do body nem o `margin`
do `page.pdf()` corrigem isso sozinhos — **só o `@page` reserva faixa em toda página física**.

> **Achado colateral, mais valioso que a própria M2:** essa mesma precedência do `@page` era um
> **defeito ativo** no `numerarPaginas` — o `@page { margin: 0 }` do `globals.css` anulava a faixa
> de 14mm das rotas de PDF, e o número da página saía **sobre** o texto (−1.3pt de folga medidos,
> com o schema do modelo CLT de fábrica). Corrigido em `a34a1b4`; ver `modules/documentos/rodape-pdf.ts`.

**Estimativa:** a parte técnica é pequena (o mecanismo já está em produção e agora corrigido). O que
falta é **decisão de produto, não de engenharia**: de onde vem a rubrica de cada signatário — imagem
digitalizada, iniciais em texto, ou derivada da assinatura eletrônica já registrada? Não existe campo
para isso no schema, e a resposta muda o que é preciso guardar. Enquanto essa decisão não for tomada,
M2 não deve virar tarefa.
