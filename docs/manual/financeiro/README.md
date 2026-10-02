---
titulo: Financeiro
descricao: Mapa do módulo financeiro — torre de controle, planejador de caixa, caixinhas, lançamentos, contas, conciliação, aprovações, relatórios e o Estúdio de Documentos.
resumo: Índice do financeiro e seu modelo de acesso (visão completa, gestão e extrato pessoal), com link para cada funcionalidade.
tags: [financeiro, índice, lançamentos, contas, conciliação, aprovações, relatórios, dre, caixa, aging]
palavras-chave: [financeiro, índice, lançamento, conta a pagar, conta a receber, conciliação, ofx, aprovação, dre, fluxo de caixa, extrato, contrato por entrega, previsão de recebimento]
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
| [Visão geral (torre de controle) e Meu extrato](visao-geral.md) | `/financeiro` | ✅ documentado |
| [Planejador de caixa e cenários](planejador.md) | `/financeiro/planejador` · `/cenarios` | ✅ documentado |
| [Fluxo de caixa dia a dia](fluxo-de-caixa.md) | `/financeiro/fluxo-caixa` | ✅ documentado |
| [Caixinhas e distribuição de recebimentos](caixinhas.md) | `/financeiro/caixinhas` · `/distribuicao` | ✅ documentado |
| [Sócios, pró-labore e compromissos recorrentes](socios-e-recorrentes.md) | `/financeiro/cadastros` | ✅ documentado |
| [Pagamentos em lote](pagamentos-em-lote.md) | `/financeiro/planejamento` | ✅ documentado |
| [Lançamentos](lancamentos.md) | `/financeiro/lancamentos` | ✅ documentado |
| [Contas a pagar e receber + Aging](contas-e-aging.md) | `/financeiro/contas` | ✅ documentado |
| [Conciliação bancária (OFX) e Importação](conciliacao-ofx.md) | `/financeiro/conciliacao` · `/importar` | ✅ documentado |
| [Aprovações (alçadas)](aprovacoes.md) | `/financeiro/aprovacoes` | ✅ documentado |
| [Relatórios gerenciais](relatorios.md) | `/financeiro/relatorios` e afins | ✅ documentado |
| [Estúdio de Documentos](estudio-documentos.md) | `/documentos` | ✅ documentado |
| [Produção (pagamento de projetistas)](producao.md) | `/financeiro/folha-projetistas` | ✅ documentado |
| [Contrato por entrega e previsão de recebimento](contrato-por-entrega.md) | `/juridico` · `/financeiro/fluxo-caixa` | ✅ documentado |
| [Fechamento mensal](fechamento-mensal.md) | `/financeiro/fechamento` | ✅ documentado |

### Ainda a documentar (rodada futura)
Cadastros (`/financeiro/cadastros`), Configurações
(`/financeiro/configuracoes`) e os documentos financeiros (`/financeiro/documentos`).

[← Índice do manual](../README.md)
