---
titulo: Financeiro
descricao: Mapa do módulo financeiro — painel, lançamentos, contas, conciliação, aprovações, relatórios e o Estúdio de Documentos.
resumo: Índice do financeiro e seu modelo de acesso (visão completa, gestão e extrato pessoal), com link para cada funcionalidade.
tags: [financeiro, índice, lançamentos, contas, conciliação, aprovações, relatórios, dre, caixa, aging]
palavras-chave: [financeiro, índice, lançamento, conta a pagar, conta a receber, conciliação, ofx, aprovação, dre, fluxo de caixa, extrato]
sinonimos: [finanças, tesouraria, contas]
---

# Financeiro

O módulo financeiro concentra receitas/despesas, contas a pagar e receber, conciliação
bancária, aprovações por alçada, relatórios gerenciais e o Estúdio de Documentos.

## Modelo de acesso (importante)

O que você vê no financeiro depende de **3 níveis**:

| Nível | Quem tem | O que vê |
| --- | --- | --- |
| **Visão completa** | `financeiro:ver` **ou** sócio ativo | Painel gerencial completo e todas as telas de leitura |
| **Gestão** | `financeiro:gerir` | Cria/edita/confirma lançamentos, concilia, planeja, fecha o mês, importa, configura |
| **Extrato pessoal** | `financeiro:extrato` | Apenas **"Meu extrato"** (seus pagamentos por entregas) |

- Quem **não** tem nenhum desses é enviado para "sem permissão".
- Projetista PJ, freelancer e cliente normalmente têm **só o extrato**.

## Funcionalidades

| Funcionalidade | Rota | Estado |
| --- | --- | --- |
| [Visão geral e Meu extrato](visao-geral.md) | `/financeiro` | ✅ documentado |
| [Lançamentos](lancamentos.md) | `/financeiro/lancamentos` | ✅ documentado |
| [Contas a pagar e receber + Aging](contas-e-aging.md) | `/financeiro/contas` | ✅ documentado |
| [Conciliação bancária (OFX) e Importação](conciliacao-ofx.md) | `/financeiro/conciliacao` · `/importar` | ✅ documentado |
| [Aprovações (alçadas)](aprovacoes.md) | `/financeiro/aprovacoes` | ✅ documentado |
| [Relatórios gerenciais](relatorios.md) | `/financeiro/relatorios` e afins | ✅ documentado |
| [Estúdio de Documentos](estudio-documentos.md) | `/documentos` | ✅ documentado |

### Ainda a documentar (rodada futura)
Folha de projetistas (`/financeiro/folha-projetistas`), Planejamento de pagamentos
(`/financeiro/planejamento`), Fechamento mensal (`/financeiro/fechamento`), Cadastros
(`/financeiro/cadastros`), Configurações (`/financeiro/configuracoes`) e os documentos
financeiros (`/financeiro/documentos`).

[← Índice do manual](../README.md)
