---
name: novo-job
description: Adiciona job pg-boss no SenaHub (alerta, snapshot, rotina agendada ou processamento sob demanda). Use ao criar tarefa recorrente ou fan-out de notificação.
disable-model-invocation: true
---

# Novo job (pg-boss)

pg-boss roda filas **e** cron sobre o mesmo PostgreSQL (substitui Redis e Task Scheduler).
Já existem ~20 handlers em `src/lib/jobs-handlers.ts` — copiar o mais parecido.

## Passos

1. **`src/lib/jobs-handlers.ts`** — exportar o handler:
   ```ts
   export async function meuAlerta(): Promise<number> { /* ... */ }
   ```
   Retornar a **contagem de itens processados** — é o que os smokes conferem.
   A lógica de negócio mora no `service.ts` do módulo; o handler só orquestra
   (buscar → chamar service → notificar).

2. **`src/lib/jobs.ts`** — registrar nome da fila + expressão cron.

3. **Notificação**, se houver fan-out: `notificar()` / `notificarMuitos()` de
   `lib/notificar.ts`, **sempre com `categoria`**.
   Categoria nova precisa existir nas preferências (`modules/usuarios/preferencias/`),
   senão o opt-out não funciona e o usuário não consegue desligar o alerta.
   Categorias existentes: `prazo_disciplina`, `inadimplencia`, `certidao`, `licitacao`,
   `digest_semanal`, `risco_projeto`, `lembrete_ponto`, `coordenacao`,
   `aprovacao_arquivo`, `aprovacao_disciplina`.

4. **Teste** do cálculo puro em `src/modules/<dominio>/*.test.ts` — não do handler.

## Gotchas obrigatórios

- **`boss` vive em `globalThis.__senahubBoss`.** Use `getBoss()` / o accessor.
  Nunca variável de escopo de módulo: `server.ts` (tsx) e o código empacotado pelo Next
  (webpack) carregam **instâncias separadas** do módulo. Variável de módulo vira
  `undefined` de um dos lados, sem erro.
  Mesma coisa vale para `io` e `presenca` em `lib/socket.ts`.

- **Jobs só rodam sob `npm run dev:server` ou produção.** Em `npm run dev` não há worker:
  o job fica parado em `fila` para sempre, sem erro. Se a UI depende do resultado,
  ela precisa comunicar o estado "aguardando processamento".

- **Handler tem que ser idempotente.** pg-boss reexecuta após restart ou falha.
  Não mandar e-mail/notificação duplicada — guardar marca de "já processado".

- **Envio sob demanda**: `boss.send()` (padrão em `converter-ifc`, disparado pelo
  hook de upload em `/api/uploads/route.ts`).

## Verificar

```bash
npm run dev:server
```
Confirmar a execução no log. Job com cron raro: disparar o handler à mão por um
script `tsx` (padrão `scripts/smoke-*.ts`) em vez de esperar o cron.
