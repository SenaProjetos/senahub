---
titulo: Deliberação — Seção Financeiro (+ Estúdio de Documentos)
descricao: Ata do Conselho sobre o módulo financeiro e o Estúdio de Documentos.
resumo: Descobertas no código (modelo de acesso em 3 níveis, lançamentos, aging, conciliação, alçadas, relatórios, estúdio) e decisão de faseamento.
tags: [deliberação, conselho, financeiro, estúdio, lançamentos, aging, aprovações]
palavras-chave: [deliberação, ata, financeiro, permissão, extrato, alçada, ofx, dre, estúdio]
sinonimos: [ata técnica]
---

# Deliberação — Seção Financeiro (+ Estúdio de Documentos)

- **Data:** 2026-06-30
- **Funcionalidades:** painel `/financeiro`, lançamentos, contas+aging, conciliação/
  importar, aprovações, relatórios e `/documentos` (Estúdio).

## Participantes
Presidente, Iniciante, Experiente, UX, Backend, Frontend, QA, Negócios, Diretor,
Treinamento, Revisor Técnico, Arquiteto, Product Owner, Suporte.

## Descobertas (inspeção de código)
- **Acesso em 3 níveis** (`app/.../financeiro/page.tsx`): `podeVerFinanceiro` (financeiro:ver
  ou sócio) → painel completo; `financeiro:gerir` → criar/editar/confirmar/conciliar/
  planejar/fechar/importar/configurar; `financeiro:extrato` → "Meu extrato"; nenhum →
  `/sem-permissao`.
- **Painel:** período mês/tri/ano; alerta de vencidos; KPIs (receita/despesa/resultado/
  saldo caixa); resultado mensal; despesas por subcategoria; DRE; projeção de caixa (8
  semanas); aging; cartões de atalho (12 fixos + 4 de gestão); badges de pendência.
- **Lançamentos** (`lancamentos/schemas.ts`): tipo receita/despesa, valor>0, data,
  vencimento/competência opcionais, categoria obrigatória, centro/conta/forma/projeto/
  fornecedor/cliente/observação; `confirmado` (já realizado) vs previsto; `ocorrencias`
  1–60 (recorrência mensal). Confirmar com conta/forma/dataConfirmacao/valorEfetivo.
  Soft delete (CLAUDE.md / `lib/prisma.ts`).
- **Campos obrigatórios configuráveis** (`config/validacao.ts`): centro/forma/projeto/
  contato/observação; `obrigatorioFaltando` retorna o rótulo do 1º ausente.
- **Aging** (`aging/queries.ts`): previstos por tipo, por faixa de atraso + top 5
  vencidos; usa vencimento (cai p/ data).
- **Conciliação** (`conciliacao/page.tsx`): exige `financeiro:gerir`; transações
  pendentes do OFX; importador deduplica e auto-casa (CLAUDE.md `lib/ofx.ts`).
- **Aprovações** (`aprovacao/niveis.ts`): só despesa; faixa por valor define papéis
  aprovadores (admin/supervisor/administrativo); faixa sem papéis = automática.
- **Relatórios**: DRE, rentabilidade/projeto, DFC, fluxo, balanço (base caixa),
  orçamento.
- **Estúdio** (`documentos/page.tsx`): modelos com tipo/fonte/versões/visibilidade/perfis;
  `documentos:ver`/`gerir`; sub-telas carimbos/datasets/gerados; engine de tokens
  (`modules/documentos/tokens.ts`, sintaxe no CLAUDE.md).

## Questionamentos
- "Meu extrato" lista o quê? → pagamentos por entregas **validadas** de disciplinas
  (status pago/pendente). Documentado.
- Detalhar planejamento de pagamentos/fechamento/cadastros/configurações agora? → **não**:
  faseado para uma próxima rodada (não foram inspecionados a fundo).

## Opiniões dos Especialistas
- **Backend/Arquiteto:** o ponto mais confuso para usuários é o **modelo de acesso** —
  virou tabela no hub e referência cruzada em todas as páginas.
- **QA:** cobrir mensagens de validação (valor>0, categoria, campo obrigatório) e o estado
  "aguardando aprovação" — incluídos.
- **Negócios/Diretor:** distinção previsto × confirmado é central para DRE/caixa — virou
  FAQ recorrente.
- **Iniciante:** "por que só vejo Meu extrato" — explicado.
- **Suporte:** OFX e "o que é aging" são dúvidas frequentes — FAQs dedicadas.

## Discussão
A seção é a maior do sistema (21 telas). Consenso: documentar o **núcleo** (acesso,
painel, lançamentos, contas/aging, conciliação/importar, aprovações, relatórios, estúdio)
com profundidade, e **fasear** as telas de gestão menos usadas (planejamento de
pagamentos, fechamento, cadastros, configurações, folha de projetistas, documentos
financeiros), listadas como 🚧 no hub para não documentar sem inspeção.

## Divergências
Nenhuma de mérito; só escopo (resolvido por faseamento).

## Decisão Final
- Publicados: hub + visão-geral, lançamentos, contas-e-aging, conciliação-ofx,
  aprovações, relatórios, estúdio-documentos.

## Melhorias Sugeridas
- **Documentação:** páginas próprias para Folha de projetistas, Planejamento de
  pagamentos, Fechamento, Cadastros, Configurações (campos obrigatórios + senha) e
  documentos financeiros; referência completa de tokens do Estúdio.
- **Sistema (não altera comportamento):** ver pendência de paridade com DinheiroWeb
  (memória do projeto) ao detalhar campos.

## Pendências
- Equiparar campos do financeiro × **DinheiroWeb** (pendência registrada na memória do
  projeto) — confirmar antes de afirmar completude de campos.
- Inspecionar e documentar as telas faseadas acima.
- Referência detalhada de tokens/fontes do Estúdio (validar `tokens.ts`/`fontes.ts`).
