---
titulo: Deliberação — Guia do Comercial para iniciantes
descricao: Ata sobre a criação do guia de formação do Comercial e o registro do vínculo proposta-lead.
resumo: Backport do artifact de formação do Comercial para o manual; documentação da ação criarPropostaDeLead.
tags: [deliberação, conselho, comercial, guia iniciante, formação]
palavras-chave: [deliberação, ata, guia iniciante, comercial, lead, proposta]
sinonimos: [ata técnica]
---

# Deliberação — Guia do Comercial para iniciantes

- **Data:** 2026-07-21
- **Funcionalidades:** `/comercial`, `/comercial/{lead}` (+ `criarPropostaDeLead`).

## Participantes
Presidente, Iniciante, Treinamento, Negócios, Backend, Revisor Técnico.

## Contexto
Um guia de formação para o Comercial (vocabulário, telas, caminho natural) foi produzido
sob demanda e publicado apenas como artifact fora do repositório. Isso diverge do
[ADR-001](../decisions/ADR-001-estrutura-documentacao.md): a fonte da verdade dos guias
de usuário é o markdown versionado em `docs/manual/`, não um link externo. Decisão de
produto associada: plano
[`docs/superpowers/plans/2026-07-20-guias-iniciante-setores.md`](../../superpowers/plans/2026-07-20-guias-iniciante-setores.md)
(D1 — fonte é o `.md`, artifact é saída gerada dele).

Durante a produção do artifact original, a inspeção de código revelou que
`Proposta.leadId` nunca era preenchido por nenhuma tela — o card de propostas na ficha
do lead e o contador no cartão do funil ficavam sempre vazios. Isso motivou a nova ação
`criarPropostaDeLead` (`modules/comercial/actions.ts`), que garante o cliente (convertendo
o lead se necessário) e cria a proposta já vinculada ao lead.

## Descobertas (inspeção de código)
- `criarPropostaDeLead` (`modules/comercial/actions.ts`): transação que, se
  `lead.clienteId` for nulo, cria o `Cliente` (mesmos dados do `converterLead`) e o
  associa ao lead antes de criar a `Proposta` com `clienteId` + `leadId` preenchidos.
- Botão **Nova proposta** adicionado a `lead-detalhe-view.tsx`, chamando essa ação.
- Caminho antigo (`/comercial/propostas` → *Nova proposta*) permanece: cria proposta só
  com `clienteId`, `leadId` fica nulo — sem vínculo com lead.

## Opiniões dos Especialistas
- **Iniciante:** confirma que `comercial.md` pressupõe conhecimento do domínio (abre
  citando "lead" e "proposta" sem defini-los) — apropriado para referência, não para
  quem nunca vendeu.
- **Treinamento:** o guia deve **linkar**, nunca repetir, permissões/regras/erros já
  cobertos em `comercial.md` — evita duas fontes divergindo com o tempo.
- **Backend:** a distinção "proposta com lead" × "proposta sem lead" (caminho avulso em
  `/comercial/propostas`) precisa estar explícita nos dois documentos, não só no guia.

## Discussão
Consenso: manter os dois documentos com propósitos distintos e cruzados por link —
`guia-iniciante.md` (formação, vocabulário, fluxo) linkando para `comercial.md`
(referência, permissões, erros) e vice-versa.

## Divergências
Nenhuma.

## Decisão Final
- Publicado [`clientes-comercial/guia-iniciante.md`](../clientes-comercial/guia-iniciante.md).
- `comercial.md` atualizado: seção "Criar proposta a partir do lead" e nova entrada de
  FAQ sobre o vínculo lead-proposta.
- Entrada adicionada ao `search-index.json`.

## Melhorias Sugeridas
- Repetir este padrão (guia de formação + backport) nas próximas ondas do plano
  `2026-07-20-guias-iniciante-setores.md`, começando por Projetos.

## Pendências
Nenhuma nova; a única do artifact original (backport para `.md`) está resolvida por
esta deliberação.
