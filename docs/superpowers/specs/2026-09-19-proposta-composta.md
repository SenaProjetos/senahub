# Proposta composta — plano de execução (Fase G)

Decisão em [ADR-0006](../../adr/0006-proposta-composta.md). Evidência em
[2026-09-19-propostas-analise.md](2026-09-19-propostas-analise.md). **Nada implementado.**

## Modelo de dados

| Entidade | Papel |
|---|---|
| `Proposta.formato` (enum `LEGADO` \| `EXTERNA` \| `COMPOSTA`) | Substitui o booleano `externa`. **Não é aditivo** — ver "Troca de `externa` por `formato`" abaixo. Decide editor e renderização. |
| `Proposta.modeloId`, `obraEndereco`, `obraCidade`, `obraUF` | Modelo de origem e dados do objeto que alimentam os tokens (`[Cidade]`, `[UF]`, `[AreaM2]` já existe). |
| `ModeloProposta` | nome, família, lista ordenada de seções com cláusulas padrão (JSON), plano de pagamento sugerido (JSON), validade (dias), ativo. |
| `ClausulaProposta` | seção, título interno, texto com tokens, `disciplinaId?` (escopo por disciplina), `uf?` (variante por estado), ordem, ativo. |
| `PropostaSecao` | **cópia** da cláusula dentro da proposta: propostaId, seção, ordem, texto (editável), `clausulaId?` (origem, só para rastreio). |
| `PropostaParcela` (nova) | Parcela da composta: descrição do marco, percentual, prazo (texto), ordem. Valor e extenso **não são gravados** — calculados. **Não** reaproveita `PropostaCondicao`: ela tem `valor` obrigatório e é impressa pela página pública congelada (`c.tipo === "percentual" ? "N%" : brl(valor)`); uma linha da composta com valor vazio sairia "R$ 0,00" para o cliente. |
| `empresa.dados` (já existe) | Ganha telefone, e-mail, banco/agência/conta/PIX e assinatura (nome e cargo do responsável técnico). |

### Troca de `externa` por `formato` — passo próprio, fora do resto da G2

`externa` é lido hoje em: as três rotas públicas por token (`externa: false`), `enviarPropostaEmail`,
`salvarProposta`, o redirecionamento de `/comercial/propostas/[id]`, `resumoPropostas` (ficha),
`registrarVersaoExterna`, `proposta-externa.test.ts` e o smoke da Fase 5. A troca é feita em três
migrações (expandir → migrar → contrair), com `grep -rn "externa" src scripts` como checklist antes
e depois:
1. adiciona `formato` com padrão `LEGADO` e preenche `EXTERNA` onde `externa = true`;
2. troca cada leitura de `externa` por `formato`. **Rotas públicas: `formato: { in: ["LEGADO",
   "COMPOSTA"] }`** — errar aqui expõe a página de uma externa ou tira do ar o link de uma proposta
   viva;
3. remove a coluna `externa` numa migração posterior, depois do deploy do passo 2.

Seções da proposta: `DESCRICAO`, `ESCOPO` (uma por disciplina), `VALOR_OBSERVACAO` (ex.: "valores
consideram a contratação de todos os itens"), `PAGAMENTO_OBSERVACAO`, `NAO_INCLUSO`,
`COMPETENCIA_CONTRATADA`, `COMPETENCIA_CONTRATANTE`, `DOCUMENTOS`, `ALTERACOES`. Tabela de valores,
parcelas, dados bancários, validade e assinatura **não são cláusulas** — são geradas dos dados.

## Regras puras (testadas, sem I/O)

- `extenso(valor)` pt-BR para reais e centavos (e para prazos em dias).
- `calcularParcelas(total, parcelas)` → valor de cada parcela com **a última absorvendo o
  arredondamento** (a soma fecha no centavo); recusa percentuais que não somam 100%.
- `resolverTokens(texto, contexto)` — reusa o motor do Estúdio (`modules/documentos/tokens.ts`,
  puro e client-safe) com contexto `{ escalar, linhas: [] }`: a proposta só usa escalares.
- `escolherClausula(secao, disciplina, uf)` — prefere a variante da UF da obra; cai na genérica.

## Fases

| Fase | Conteúdo | Modelo |
|---|---|---|
| **G1** | Regras puras: extenso, parcelas, escolha de cláusula por UF. Só código testado. | Sonnet |
| **G2** | Schema + migrações: `ModeloProposta`, `ClausulaProposta`, `PropostaSecao`, `PropostaParcela`, campos da obra em `Proposta`, permissão nova `comercial:modelos` (só gestão), campos novos de `empresa.dados` — e, como passo separado, a troca de `externa` por `formato`. | **Opus** |
| **G3** | Telas da gestão: biblioteca de cláusulas e modelos. **Seed inicial** com as cláusulas mais frequentes das 163 propostas, para o dono revisar antes de usar. Ver "Seed da biblioteca" abaixo. | Sonnet |
| **G4** | Compor: "Nova proposta" na ficha da negociação escolhe o modelo e monta seções, itens e parcelas; editor com pré-visualização; salvar gera versão (snapshot do documento inteiro). | **Opus** |
| **G5** | Documento: template HTML de fluxo (timbrado, seções, tabela, parcelas, dados bancários, assinatura) no ramo `COMPOSTA` de `/a/proposta/[token]`; PDF por versão e link público reaproveitando o que já existe. Mexe na rota pública congelada e na paginação do PDF — ver pré-requisito abaixo. | **Opus** |
| **G6** | Transição: manual, "Nova proposta" passa a abrir a composta por padrão; legado e externa seguem disponíveis. | Sonnet |

### Seed da biblioteca (G3)

O corpus extraído das 163 propostas **contém os defeitos da §3 da análise**; semear sem tratar os
espalharia para todas as propostas futuras:
- Cláusula que cita órgão ou norma **estadual** (COSCIP, "Código de Segurança Contra Incêndio de
  Pernambuco") entra com `uf = "PE"`; outros estados ganham variante própria ou a genérica.
- Cláusula que cita **concessionária** (Neoenergia) usa token (`[Concessionaria]`) ou variante por
  UF — não é regra nacional.
- Seed **create-only por slug estável**: o `db:seed` roda em todo deploy e não pode sobrescrever o
  texto que a gestão editou depois.

### Pré-requisito da G5 — cabeçalho, rodapé e paginação do PDF

O PDF sai de `gerarPdfDaPaginaPublica` (`page.goto` + `page.pdf()`). Em documento de várias
páginas com rodapé que se repete, o `@page { margin: 0 }` do `globals.css` anula a margem do
`page.pdf()` e o rodapé sai **por cima do texto** — problema já resolvido no Estúdio por
`reservarFaixaDoRodape()` (`modules/documentos/rodape-pdf.ts`). Decidir **antes** do template: rodapé
nativo do Puppeteer com essa faixa reservada (recomendado — é o caminho já provado) ou margin boxes
do `@page`. A página pública (HTML, sem paginação) e o PDF precisam sair do mesmo componente.

## Guarda-corpos

- O ramo antigo de `/a/proposta/[token]` **não é tocado** (ADR-21 §6); o ramo novo só é escolhido
  por `formato = COMPOSTA`.
- Proposta aceita continua imutável; o aceite segue criando o projeto dos itens.
- Dados bancários e da empresa nunca são copiados para dentro da proposta — sempre lidos de
  `empresa.dados` no momento da renderização da versão. O **PDF arquivado** de cada versão é o
  registro do que foi enviado.
- Seed de permissão exige migração (lição registrada: seed de permissão é create-only).

## Critério de pronto da fase

Reproduzir no sistema, a partir de um modelo, uma das 163 propostas reais (a do Edif. Sr. Jean,
PCI + ar-condicionado + GLP) com o texto equivalente e os números calculados — e a do Edif. Vitória
com o plano de pagamento **corrigido automaticamente**.
