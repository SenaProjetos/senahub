# Evidência — verificação da Fase 2 de documentos (desenvolvimento)

Data: 2026-08-23

Ambiente: desenvolvimento local
Comando: `npx tsx --tsconfig tsconfig.server.json scripts/verificar-fase2-documentos.ts`

## Escopo confirmado antes da execução

`scripts/verificar-fase2-documentos.ts` é somente leitura: usa apenas `count` e `findMany` para relatar `DocumentoDisciplina`, `DocumentoRevisao`, `Upload` e `DocumentoStatus`. Não contém operação de escrita.

## Resultado

A verificação não iniciou o script nem conectou ao banco. O bootstrap de `tsx` falhou antes da execução com o erro abaixo.

```text
SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)
    at Object.userInfo (node:os:306:11)
    at file:///C:/SENA_ADM/SENAHUB/SENAHub-remake/node_modules/tsx/dist/temporary-directory-BDDVQOvU.mjs:1:84
...
Node.js v24.15.0
```

## Consequência para a auditoria

Não há evidência de que `uploads ativos sem documentoId` seja zero no ambiente de desenvolvimento. Portanto A-05 permanece aberto e `NEXT_PUBLIC_DOCUMENTOS_V2` não deve ser ativada com base nesta tentativa. A falha não alterou dados.
