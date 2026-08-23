# Aceite ponta a ponta do CRM — P20 / F7.8

**Data:** 2026-08-23
**Veredito:** **PASSOU** em 2026-08-23. `npm run smoke:crm-e2e` encadeou, sem falhas, as fixtures
reais das fases 1 a 6 e as automações comerciais no banco de desenvolvimento. O agregador executa o
CLI do npm pelo próprio Node, evitando a incompatibilidade de `execFileSync` com `npm.cmd` no Windows.

| # | Critério | Veredito | Evidência |
| --- | --- | --- | --- |
| 1 | Cadastrar empresa uma única vez a partir de busca | PASSA | `smoke:crm-fase4` — busca/importação e deduplicação. |
| 2 | Adicionar vários contatos | PASSA | `smoke:crm-fase1` e `smoke:crm-fase2` — contatos vinculados à mesma empresa. |
| 3 | Criar prospecção associada ao contato | PASSA | `smoke:crm-fase2` — `LeadContato` e quadro de prospecção. |
| 4 | Registrar abordagem | PASSA | `smoke:crm-fase2` — interação manual ancorada. |
| 5 | Registrar próximas ações | PASSA | `smoke:crm-fase2` — agenda, consulta e conclusão. |
| 6 | Registrar interações na timeline | PASSA | `smoke:crm-fase2` e `smoke:crm-fase3`. |
| 7 | Qualificar a prospecção | PASSA | `smoke:crm-fase2` — preserva o lead e cria negociação única. |
| 8 | Criar negociação real | PASSA | `smoke:crm-fase2` — vínculo bidirecional `Lead`/`Negociacao`. |
| 9 | Informar empreendimento e disciplinas | PASSA | `smoke:crm-fase5` — proposta/negociação com disciplinas. |
| 10 | Elaborar orçamento | PASSA | `smoke:crm-fase5` — itens, valores e tabela de preço. |
| 11 | Gerar proposta | PASSA | `smoke:crm-fase5` — criação e token públicos. |
| 12 | Criar versões da proposta | PASSA | `smoke:crm-fase5` — snapshots e versão vigente. |
| 13 | Negociar | PASSA | `smoke:crm-fase2` — jornada, probabilidade, perda e reabertura. |
| 14 | Aceitar ou perder | PASSA | `smoke:crm-fase2` e `smoke:crm-fase5`. |
| 15 | Transformar aceite em projeto | PASSA | `smoke:crm-fase5` — projeto, disciplinas e canais. |
| 16 | Manter histórico na empresa | PASSA | `smoke:crm-fase3` — Empresa 360 agregada. |
| 17 | Medir origem do contrato | PASSA | `smoke:crm-fase6` — canal e campanha. |
| 18 | Medir conversão, ticket e receita | PASSA | `smoke:crm-fase6` — contagens e soma confrontadas ao banco. |
| 19 | Voltar depois e criar nova negociação | PASSA | `smoke:crm-fase2` e `smoke:crm-fase3` — múltiplas prospecções e sinal de reativação. |
| 20 | Não duplicar cadastro | PASSA | `smoke:crm-fase1`, `smoke:crm-fase4` e constraints do banco. |

A inspeção visual automatizada de diálogos e quadros permanece fora deste aceite, pois o runtime de
browser integrado não inicia neste ambiente. A evidência funcional dos 20 critérios foi executada pelo
agregador e permanece indicada na tabela.
