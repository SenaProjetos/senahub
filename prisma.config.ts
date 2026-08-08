import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    // Banco descartável que o Prisma usa para reproduzir o histórico de migrations.
    // Necessário para `prisma migrate diff --from-migrations`, que é como geramos o SQL
    // quando `migrate dev` recusa por drift (ver .claude/skills/nova-migracao).
    // Opcional: sem a variável, só falham os comandos que exigem shadow database.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
