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
| **G0** | Estúdio: **faixa em fluxo** (`banda.fluxo`, opt-in) — faixa cresce com o conteúdo, elementos empilhados na ordem do desenho, parágrafo sem corte; aviso no editor; modelos existentes intactos. Corrige de tabela o corte silencioso dos contratos de fábrica. | **Opus** |
| **G0.1** | Estúdio: limites do schema que **invalidam modelo salvo** (`banda.altura` presa ao A4; elemento com `h < 4`). Modelo recusado abre em branco pelo fallback `docVazio()` e salvar por cima apaga o original. Relaxar os limites, avisar na tela e travar o salvar. | **Opus** |
| **G1** | Regras puras: extenso, parcelas, escolha de cláusula por UF, campos citáveis. Só código testado. **Concluída** — ver "G1 — o que ficou". | Sonnet |
| **G2** | **Concluída.** Schema + migrações: `ModeloProposta`, `ClausulaProposta`, `PropostaSecao`, `PropostaParcela`, campos da obra em `Proposta`, permissão nova `comercial:modelos` (só gestão), campos novos de `empresa.dados` — e, como passo separado, a troca de `externa` por `formato`. | **Opus** |
| **G3** | **Concluída.** Telas da gestão: biblioteca de cláusulas e modelos. **Seed inicial** com as cláusulas mais frequentes das 163 propostas, para o dono revisar antes de usar. Ver "Seed da biblioteca" abaixo. | Sonnet |
| **G4** | Compor: "Nova proposta" na ficha da negociação escolhe o modelo e monta seções, itens e parcelas; editor com pré-visualização; salvar gera versão (snapshot do documento inteiro). | **Opus** |
| **G5** | Documento: **modelo de proposta no Estúdio** (faixas em fluxo da G0) + fontes novas (`proposta-secoes`, `proposta-parcelas`, escalares da empresa/obra); a rota pública renderiza o documento no ramo `COMPOSTA`; PDF por versão e link público reaproveitando o que já existe. Mexe na rota pública congelada e na paginação do PDF — ver pré-requisito abaixo. | **Opus** |
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

### G0 — o que muda no Estúdio

- `schema.ts`: `banda.fluxo?: boolean` (ausente/false = comportamento de hoje).
- `doc-render.tsx`: faixa em fluxo → `height: auto`, elementos ordenados por `y` e empilhados
  (`x` vira recuo, `w` vira largura, o espaço entre elementos preserva o desenho); sem
  `breakInside: avoid` (uma seção longa precisa poder quebrar entre páginas).
- `elemento-view.tsx`: em fluxo, texto com `height: auto` e sem `overflow: hidden`.
- `propriedades.tsx`: interruptor por faixa + aviso de que o editor mostra caixas fixas e a
  pré-visualização é a saída real.
- A ordenação/empilhamento é função **pura e testada** (`fluxo.ts`), não lógica solta no JSX.
- Prova: os 8 modelos existentes renderizam byte a byte igual (nenhum tem `fluxo`), e um modelo de
  teste com parágrafo de 40 linhas sai inteiro.

### G0.1 — limite de schema que apaga modelo salvo

Achado ao rodar a prova da G0 contra o banco de dev: **3 de 8 modelos não passam no `docSchemaZ`**.
Como todo caminho de leitura usa `safeParse` com fallback `docVazio()`, esses modelos **abrem em
branco, sem aviso** — e um salvar por cima grava o documento vazio no lugar do original.

| Modelo | Recusa | Causa |
|---|---|---|
| Carimbo A0 | `bandas.0.altura` > 1123 | `max(1123)` é a altura do **A4**, mas o editor oferece folha até A0 |
| Relatório do projeto (exemplo) | `elementos.N.h` < 4 | `min(4)` recusa linha/separador de 1–2px |
| Relatório de licitação (exemplo) | idem | idem |

O que muda:
- `altura` da banda limitada pela **maior folha** (A0 retrato, `mmToPx(1189)`), não pelo A4.
- `w`/`h` de elemento com mínimo 1 (linha fina é um elemento legítimo).
- `obterModelo` devolve `schemaIlegivel`; o editor mostra aviso destrutivo e **desabilita o salvar**,
  para que o fallback nunca vire perda de dados.
- Teste-guarda: modelo em A0 e elemento de 2px passam no schema; e um `docVazio()` nunca substitui
  schema válido sem sinalizar.

Por que antes da G1: é o mesmo motor da G0, é risco de perda de dados hoje, e a G5 vai querer
proposta em folha que não seja A4.

### G1 — o que ficou

Onde mora o código (tudo puro, sem I/O):

| Peça | Arquivo |
|---|---|
| `extensoInteiro`, `extensoMoeda`, `quantidadeComExtenso`, `diasComExtenso` | `src/lib/extenso.ts` — genérico (contratos e recibos reusam), por isso em `lib/` |
| `calcularParcelas`, `somaPercentuais`, `rotuloPercentual` | `src/modules/comercial/proposta-composta/parcelas.ts` |
| `escolherClausula` | `.../clausulas.ts` |
| `CAMPOS_PROPOSTA`, `escalaresDaProposta`, `resolverTextoProposta`, `tokensNaoResolvidosProposta` | `.../campos.ts` |

Decisões que o G4/G5 precisam saber:

- **`calcularParcelas` devolve resultado, não lança.** `{ ok: false, erro, mensagem, somaPercentuais }`
  para o editor mostrar "soma 105%" ao vivo. Recusa: sem parcelas, total ≤ 0, percentual fora de
  (0, 100], soma ≠ 100%, e total de poucos centavos onde a última sobraria negativa.
- **Percentual é a entrada, valor é derivado**: cada parcela arredonda ao centavo (meio para cima) e
  **a última é o que falta** — a soma fecha o total exato. Valor e extenso não são gravados.
- **`escolherClausula` nunca escolhe variante de outra UF nem de outra disciplina.** Sem genérica,
  devolve `undefined` (a seção fica vazia para a gestão preencher) — o caso de Milagres/AL recebendo
  o COSCIP de PE não tem caminho. Entre elegíveis, a disciplina pesa mais que a UF.
- **Texto que cita campo sem valor não é gerado.** `resolverTextoProposta` devolve `ok: false` com a
  mensagem pronta; o motor de tokens devolveria string vazia ("obra em , "). Reusa
  `tokensNaoResolvidos` do módulo de contratos.
- **Achado:** esse bloqueio (`juridico/contrato/campos.ts`) casa o catálogo sem diferenciar
  maiúscula, mas o motor resolve por chave exata — `[cidade]` **passa na validação e sai em
  branco**. Na proposta o wrapper fecha o buraco (caixa errada = campo inexistente). **No módulo de
  contratos o buraco continua aberto** — corrigir lá pode passar a bloquear contratos que hoje
  geram com lacuna; decisão do dono.

Prova: 105 testes novos, incluindo ida-e-volta do extenso em 25 mil números (um leitor de extenso
independente devolve o número de origem) e a soma exata do plano em 60 combinações plano × total.
Contra o corpus real: dos 297 pares "R$ X (extenso)" das 163 propostas, 277 coincidem com o gerado;
os 20 que divergem são exatamente os já catalogados na análise — 12 erros reais (o gerado é o
correto), 2 de grafia ("oito centos", "neve mil"), 1 "um mil" e 7 falsos positivos ("tipo split").

### G2 e G3 — o que ficou (concluídas)

Migração `20260919233000_proposta_composta` (escrita à mão: o dev não tem shadow database).
Aditiva; `externa` continua e a escrita é dupla — o `DROP COLUMN` é a contração, num deploy
posterior. As leituras já são por `formato`, com o filtro `{ in: ["legado", "composta"] }` nas
três rotas públicas (lista do que TEM página pública, não "tudo menos externa").

**Correção de cláusula já publicada:** a semente é create-only por slug, então editar o texto em
`biblioteca-inicial.ts` NÃO alcança quem já tem a linha. A regra é **slug novo** (`...-v2`) com a
antiga desativada na tela. Renomear slug é proibido: o seed recriaria a antiga no deploy seguinte
e todo modelo que a cita quebraria — por isso `editarClausula` nunca mexe no slug.

**No deploy**, depois do `migrate deploy` e do `db:seed`, conferir o backfill (em produção são 34
externas; no dev não havia nenhuma, então este é o primeiro uso real):

```sql
SELECT count(*) FROM "proposta" WHERE ("externa" = true) <> ("formato" = 'externa');  -- 0
SELECT count(*) FROM "permissao_perfil" WHERE recurso='comercial' AND acao='modelos';  -- > 0
```

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
