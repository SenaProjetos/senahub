---
status: accepted
date: 2026-09-18
---

# ADR-0005 — Proposta montada fora do sistema vive na própria Proposta, com PDF por versão

O Comercial monta hoje as propostas em Word (escopo longo por disciplina, textos padrão, variações
por projeto) e envia o PDF ao cliente por fora; o editor do sistema não atende. Mesmo assim o
valor, o desconto e o histórico de envios precisam estar no SenaHub, versionados. Decisão:

1. **Uma proposta externa é uma `Proposta` com `externa = true`**, não um campo novo na
   negociação. Cada envio registrado é uma `PropostaVersao` com os campos estruturados que já
   existiam (valor original, desconto, valor final, validade, data de envio, observação) e o PDF
   enviado em `pdfPath` (+ hash SHA-256 e tamanho, recalculados no servidor).
2. **Só PDF**, verificado pela assinatura do arquivo (`%PDF-`), não pelo tipo informado pelo
   navegador. Word original não é guardado (decisão do dono).
3. **Consome o número sequencial** na primeira versão (decisão do dono); versões seguintes entram
   na mesma proposta, com o mesmo número.
4. **As linhas por disciplina (disciplina + valor) são obrigatórias** e viram `PropostaItem`. O
   PDF é o documento; as linhas são o que o aceite transforma em projeto. Sem elas o aceite
   recusaria, e um projeto sem disciplinas quebraria pagamento de projetista e `/recursos`.
5. **Sem link público** (decisão do dono: o time envia o PDF por fora). As três rotas públicas
   por token (`/a/proposta/[token]`, `/api/t/proposta/[token]/pdf` e `/documentos`) filtram
   `externa: false`, e o envio por e-mail do sistema recusa a externa.
6. **Sem editor**: `salvarProposta` recusa a externa e `/comercial/propostas/[id]` redireciona para
   a ficha da negociação, onde ela é versionada, baixada e aceita.

## Contexto

O dono pediu valor e desconto editáveis e versionados no card. Os campos homônimos da
`Negociacao` (`valorProposto`, `desconto`) nunca foram gravados por nenhuma parte do sistema — o
valor real sempre veio da versão vigente da proposta (F6.1a). Editar direto na negociação criaria
uma segunda fonte que divergiria da proposta aceita.

## Relação com o ADR-21 §6 (página pública congelada)

O congelamento existe porque mudar a renderização de `/a/proposta/[token]` reescreve o PDF de
propostas já enviadas. O filtro `externa: false` não muda a renderização de nenhuma proposta do
editor: só recusa as externas, e nenhuma proposta anterior a este ADR tem a flag (coluna nova com
`DEFAULT false`). O congelamento continua valendo para todo o resto.

## Alternativas consideradas

1. **Campos editáveis em `Negociacao` + tabela de histórico própria.** Rejeitada: duplica
   `PropostaVersao`, e o aceite não saberia de qual fonte tirar o valor do contrato.
2. **Só PDF + valor total, sem disciplinas.** Rejeitada pelo dono: o aceite criaria projeto sem
   disciplinas e a análise por disciplina da Inteligência ficaria sem dado.
3. **Página pública em modo "documento em anexo".** Rejeitada pelo dono por ora; possível depois,
   com emenda a este ADR.

## Consequências

- `arquivarPdfDaVersao` (chamado ao marcar "enviada") não sobrescreve o PDF anexado: a versão já
  nasce com `pdfPath`, e a função é idempotente nesse caso.
- Upload seguido de registro recusado deixa um PDF órfão em `comercial/propostas/externas/` — o
  mesmo comportamento dos anexos do lead. Aceitável pelo volume; limpeza periódica fica pendente.
- O redesenho do gerenciador de propostas (Fase G) parte daqui: ele deve montar as mesmas versões,
  sem migração de dado.

Plano de execução: [`docs/superpowers/specs/2026-09-16-comercial-funil-unico.md`](../superpowers/specs/2026-09-16-comercial-funil-unico.md).
