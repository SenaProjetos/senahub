# Contratos no Estúdio de Documentos — integração e evolução

**Data:** 2026-08-27 · **Status:** planejamento (não iniciado) · **Branch alvo:** `dev`

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
- **`ModeloContrato` em produção.** Contagem é 0 no dev; produção não foi conferida. E6 não começa
  sem isso.
- **Adoção.** O Estúdio é mais poderoso e mais difícil que um textarea. Sem M6 (modelos prontos), o
  risco não é técnico — é o jurídico continuar fazendo contrato no Word, que é o fracasso que o
  módulo Comercial já viveu.
