---
status: accepted
date: 2026-09-15
---

# ADR-0003 — O motor de nomenclatura só acrescenta metadado

O SenaHub passa a interpretar o nome dos arquivos enviados (projeto, disciplina, fase, tipo,
número da prancha, revisão, extensão) com um motor tolerante a formatos diferentes. Quatro regras
valem para o motor e para tudo que consome o resultado dele:

1. **O motor nunca vira identidade.** A chave de agrupamento do documento lógico continua sendo o
   nome literal do arquivo (`chaveDocumento()` em `src/modules/uploads/documento.ts`). Nenhum
   "nome normalizado" entra na chave, e o motor nunca renomeia arquivo sozinho: renomear só
   acontece com autorização explícita da pessoa, na etapa de revisão do envio.
2. **Inferência nunca sobrescreve escolha.** Precedência, da mais forte para a mais fraca:
   escolha manual (diálogo ou painel do documento) → contexto do envio (projeto e disciplina
   escolhidos) → padrão de nomenclatura do projeto → catálogo do projeto → catálogo global e
   sinônimos → inferência estrutural (faixa de numeração, posição). Campo já preenchido não é
   trocado por inferência; divergência vira **aviso**, não correção silenciosa.
3. **Sem evidência, sem valor.** Campo que o nome não sustenta fica `null` — nada de `R00`,
   `EX` ou "desconhecido" para completar. Extensão fora do catálogo é registrada como
   desconhecida e **o envio nunca é bloqueado pelo motor** (a política de upload é outra camada).
4. **Vocabulário mora no banco, não no código.** Siglas e sinônimos de disciplina, fase, tipo e
   tamanho de papel vêm de `DisciplinaCatalogo` e `PranchaCatalogo`; extensões vêm do catálogo de
   extensões. O código do motor só conhece **estrutura** (separadores, revisão `R`/`RV`/`REV`,
   código de projeto ano+sequencial, subprojeto, sufixo de cópia, datas). Sigla nova se cadastra,
   não se programa.

## Contexto

Diagnóstico de produção de 2026-09-15 (`scripts/diagnosticar-nomenclatura.ts`): dos 536
documentos visíveis, a regra atual (`parsePranchaFilename`, uma regex fixa) reconhecia 36% e só
2 tinham fase gravada. As falhas vêm de duas causas empilhadas: **formato** (subprojeto
`26001.1-…`, underscore, tipo antes do número, padrões de terceiros como `CGA_GAS-SPD-PE-…`) e
**sigla fora do catálogo** (`DTC` 133×, `DE` 73×, `PE` 52×, `HDR` 38×). Os backups do AltoQi
chegam como `… [cópia 2026-09-14_05].qibzip` — o nome muda a cada cópia.

O pedido original (um prompt genérico de 68 seções) trazia dicionários próprios que conflitam com
o vocabulário da SENA (`PL` é Planta no prompt e Estudo Preliminar no escritório; `DET` é Detalhe
no prompt e Desenho Técnico no escritório), e sugeria guardar um `normalizedName`.

## Alternativas consideradas

1. **Regex única configurável** (evoluir `parsePranchaFilename`). Rejeitada como estratégia
   principal: não absorve sinônimos nem ordem variável; continua útil como *padrão do projeto*,
   que o motor tenta primeiro.
2. **Agrupar documentos pelo nome normalizado.** Rejeitada: `chaveDocumento()` define o
   agrupamento de todo o acervo — mudar exige script de merge, e nomes de projetos diferentes que
   normalizam parecido colapsariam em um documento só.
3. **Dicionários do prompt fixos no código.** Rejeitada: conflitam com o catálogo real e exigiriam
   deploy para cada sigla nova. Serviram só de inspiração para sinônimos iniciais.
4. **Aprendizado de máquina.** Rejeitada na v1: o motor precisa ser determinístico e auditável;
   correções manuais ficam registradas (`DocumentoEvento`) para calibrar regras depois.
5. **Motor puro que só acrescenta metadado, vocabulário no banco** (escolhida).

## Consequências

- Versionar um arquivo cujo nome mudou (cópia do AltoQi, renumeração) **não** se resolve no motor:
  exige a ação explícita "enviar como nova versão de <documento>". O motor apenas *sugere* qual é
  o documento anterior.
- Todo campo preenchido por inferência registra a origem no histórico do documento
  (`DocumentoEvento.detalhe`, no mesmo formato de `faseOrigem: "manual" | "nome"`), para que
  correção humana e reprocessamento em lote nunca apaguem escolha manual.
- Script de lote (backfill) segue a mesma precedência: só preenche campo vazio, roda primeiro em
  modo relatório e grava os ids tocados para reversão.
- Sigla ambígua entre categorias (ex.: `PL`) sem desempate pelo catálogo do projeto não é
  atribuída — vira sugestão para confirmar.

Plano de execução: [`docs/superpowers/specs/2026-09-15-motor-nomenclatura.md`](../superpowers/specs/2026-09-15-motor-nomenclatura.md).
