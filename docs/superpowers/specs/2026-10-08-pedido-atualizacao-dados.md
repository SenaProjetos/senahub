# "Atualize seus dados" — o RH pede, cada pessoa completa o próprio cadastro

**Data:** 2026-10-08 · **Status:** entregue (branch `feat/rh-pedido-dados`) · **Origem:** pedido do dono — "é mais fácil
cada usuário preencher o seu do que uma pessoa preencher de todos".

## Decisões (dono, 2026-10-08 — "siga com o recomendado")

1. **Aprovação:** preencher campo **vazio** vale direto, auditado. **Alterar** valor existente continua na Fase 4
   (proposta + RH). CPF e RG vão ao RH **mesmo vazios**; conta bancária segue o fluxo próprio (proposta de conta).
2. **Quais campos:** a pessoa preenche qualquer campo vazio do próprio cadastro que a regra de completude cobra:
   nome completo, CPF, RG, nascimento, telefone, endereço. Salário, cargo, departamento, admissão e PJ vinculada: nunca.
3. **Faixa:** só avisa — sem fechar e sem bloquear (CLT precisa bater ponto). Prazo vencido = destaque.
4. **Documentos anexos:** fora desta etapa.
5. **Automático:** não. Só quando o RH pede (uma pessoa ou "todos com cadastro incompleto"). Reconfirmação anual fica
   como ideia futura.

## Como ficou

- `PedidoDadosCadastro` (migration `20261008150000_pedido_dados_cadastro`, aditiva): `aberto | atendido | cancelado`,
  prazo e mensagem opcionais, no máximo um aberto por pessoa (índice parcial). Não guarda lista de campos: "o que falta"
  é sempre `camposFaltantes` filtrado por `CAMPOS_PREENCHIVEIS` (`rh/cadastro/preencher.ts`, puro e testado).
- Faixa: `FaixaPedidoDados` no `Shell` (prop `faixa`), acima da barra superior — não interfere no `CabecalhoPagina`.
  Custo por navegação: um `findFirst` indexado; a situação só é calculada com pedido aberto. Cliente nunca recebe.
- Pessoa: **Minha conta → Completar meus dados** (abre sozinho com `?completar=1`, que é o link da faixa e do aviso).
- RH: cartão no topo da aba Cadastro da ficha (**Pedir atualização**, lembrete, cancelar) e **RH → Pessoas → Pedidos de
  atualização de dados** (abertos + últimos 30 dias, pedido em lote). Ações com menu de contexto (ADR-0002).
- CPF/RG ficam em `UserPreference.dados.cadastroPendente.preenchimentos` (mesma fila da Fase 4); a aprovação só grava se o
  campo continuar vazio. `proporAlteracaoCadastro` passou a preservar os preenchimentos, e o pendente só de preenchimentos
  não trava "Editar meus dados".
- Fechamento: ao preencher e na rotina diária de RH (`fecharPedidosAtendidos`), que pega os atendidos por outro caminho
  (RH editou a ficha, conta aprovada). Quem pediu recebe aviso.

## Verificação

`preencher.test.ts`, `acoes-pedido.test.ts`, `npm run smoke:pedido-dados` (restaura a pessoa de teste). Não visto em navegador.

## Deploy

`prisma migrate deploy` (uma migration). Sem seed.
