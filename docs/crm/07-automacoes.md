# Extensão das automações comerciais

As automações do Comercial são regras determinísticas; não usam IA, modelos de linguagem, previsão
ou geração automática de mensagens. Cada regra só transforma fatos já registrados em uma ocorrência
com destinatário, texto e link direto.

## Adicionar uma regra

1. Em `src/modules/comercial/regras.ts`, implemente um `RegraComercial`. A função `avaliar(ctx)` é
   pura: use somente as linhas e parâmetros recebidos, e nunca Prisma ou `new Date()`.
2. Dê à regra uma `chave` estável. Ela compõe a deduplicação diária; não a renomeie depois de
   publicada.
3. Gere `Ocorrencia` com `responsavelId`, `href` e `chaveDedup`. Use a fábrica `dedup()` do mesmo
   arquivo, em vez de inventar outro formato.
4. Acrescente a regra em `REGRAS_COMERCIAIS`. Não é necessário alterar job, handler, push ou tabela
   de deduplicação: o motor percorre esse registro único.
5. Cubra a regra em `regras.test.ts`, com uma data fixa, os limites e o caso que não deve disparar.

Se a regra precisar de um dado ainda ausente, amplie o carregamento em
`carregarContextoAutomacoesComerciais()` de modo agregado. Não coloque uma consulta dentro da regra;
o motor precisa continuar com custo constante, sem N+1.

## Entrega e preferências

O job diário chama `executarAutomacoesComerciais()`. Antes de persistir o sino e o dedup, ele confere
se o responsável está ativo e se não desativou a categoria `notif_comercial`. Push é secundário:
uma falha de Push não desfaz a notificação interna já criada.

Para executar localmente, use `npm run dev:server`; `npm run dev` não inicia pg-boss. O smoke
`npm run smoke:crm-automacoes` prova a deduplicação no mesmo dia e uma nova entrega no dia seguinte.
