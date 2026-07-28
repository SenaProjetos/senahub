---
name: nova-migracao
description: Cria migration Prisma no SenaHub sem resetar o banco de dev. Use quando precisar alterar prisma/schema.prisma ou quando "prisma migrate dev" pedir reset por drift.
disable-model-invocation: true
---

# Nova migração (sem reset)

Banco de dev: PostgreSQL 17 nativo, porta **5433**, db `senahub_remake`.
A porta 5432 é o Docker do **sistema antigo** — nunca conectar nela.

O `migrate dev` costuma pedir reset por drift acumulado. Reset apaga o dataset de
trabalho (projetos, lançamentos, uploads de teste). O caminho abaixo evita isso.

## Caminho feliz

```bash
npx prisma migrate dev --name <nome_em_snake_case>
```

Se aplicar limpo, pule para "Fechamento".

## Caminho com drift

Quando o Prisma pedir reset — **não aceite**:

1. Aplicar o schema no dev sem criar migration:
   ```bash
   npx prisma db push
   ```

2. Gerar o SQL da migration a partir do delta:
   ```bash
   npx prisma migrate diff \
     --from-migrations prisma/migrations \
     --to-schema-datamodel prisma/schema.prisma \
     --shadow-database-url <URL_DE_SHADOW> \
     --script
   ```

3. Criar `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` com esse SQL.
   Revisar à mão antes de salvar (o diff às vezes gera DROP + CREATE onde um
   ALTER bastaria).

4. Marcar como aplicada, já que o `db push` do passo 1 executou o efeito:
   ```bash
   npx prisma migrate resolve --applied <AAAAMMDDHHMMSS>_<nome>
   ```

## Revisar o SQL antes de commitar

- `ADD COLUMN ... NOT NULL` **sem DEFAULT** quebra em produção (tabela populada).
  Use DEFAULT, ou faça em três passos: adiciona nullable → backfill → torna NOT NULL.
- `DROP`/`RENAME` de coluna: existe migração de dados antes? O rollback foi pensado?
- Relação nova: o Prisma **não** cria índice sozinho no lado da FK. Adicione `@@index`.
- Enum alterado: os valores já persistidos continuam válidos?
- `Lancamento` tem soft delete — leituras são auto-filtradas por `excluidoEm: null`
  via extension em `lib/prisma.ts`. Migration que mexe nessa tabela precisa considerar
  as linhas logicamente excluídas.

## Fechamento

```bash
npm run db:generate     # regenera o client em src/generated/prisma
npm run db:seed         # se houver campo obrigatório novo ou permissão nova
npm test
npm run lint
```

O **deploy também precisa de `db:seed`** quando a mudança envolve permissões ou
catálogos — sem isso o recurso não aparece em produção.

## Nunca

- `prisma migrate reset` no dev sem confirmação explícita do usuário.
- `db push --accept-data-loss` sem revisar exatamente qual dado se perde.
- Editar uma migration já commitada e aplicada em produção. Crie uma nova.
