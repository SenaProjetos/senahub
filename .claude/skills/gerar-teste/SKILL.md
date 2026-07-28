---
name: gerar-teste
description: Escreve testes vitest para a lógica pura de um módulo do SenaHub. Use em módulo sem cobertura ou antes de mexer em cálculo sensível.
disable-model-invocation: true
---

# Gerar testes

## Ambiente

Vitest (`vitest.config.ts`) roda em env **node**, sem jsdom, sobre `src/**/*.test.ts`.
`server-only` é stubado (`src/test/server-only-stub.ts`) — então `queries.ts` e
`service.ts` importam normalmente sob teste.

**Não testar componente React aqui.** Não há DOM.

```bash
npm test                                   # tudo
npx vitest run src/modules/<mod>/          # um módulo
npx vitest run -t "nome do teste"          # um teste
```

## O que testar, por prioridade

1. **`service.ts`** — lógica de negócio pura. É o alvo certo.
2. **Módulo de cálculo puro** — o padrão da casa já tem bons exemplos para copiar:
   `lib/encargos.ts` (INSS/IRRF progressivo), `lib/aging.ts`, `lib/aquisitivo.ts`,
   `lib/dxf.ts`, `modules/planejamento/caminho-critico.ts`,
   `modules/documentos/tokens.ts`, `modules/projetos/health.ts`,
   `modules/coordenacao/conversao-estado.ts`, `bcf/writer.ts`.
3. **Máquina de estados / transição** — quais transições são proibidas.
4. **NÃO** testar `actions.ts` direto: são casca fina sobre `defineAction`.
   Extraia a regra para o `service.ts` e teste lá.

## Módulos sem nenhuma cobertura hoje

Maior risco primeiro:

| Módulo | Por que dói |
|---|---|
| `rh` | folha de pagamento; só `lib/encargos.ts` é coberto, o módulo não |
| `comercial` | funil e valores de proposta |
| `clientes` | dado que alimenta portal e faturamento |
| `permissoes` | resolução de acesso |
| `patrimonio` | inventário e TI |
| `qualidade` | indicadores e snapshots |
| `portal` / `documentos-cliente` | escopo por `User.clienteId` — vazamento entre clientes |
| `arquivos` | escopo de arquivo por disciplina |
| `juridico` | versões e aceites de documento |
| `engenharia`, `configuracoes`, `busca`, `auth` | menor risco |

## Como escrever cada caso

Para cada função: caminho feliz, **limite**, entrada inválida, e a **regra de negócio
que alguém quebraria sem perceber** (é essa que justifica o teste).

- Nomes de teste em **pt-BR**, descrevendo a regra: `"nao permite ferias antes de
  completar o periodo aquisitivo"`.
- Dinheiro: comparar em centavos ou com tolerância explícita, nunca float solto.
- Data: fixar a data de referência, nunca `new Date()` dentro do teste.
- Fixture mínima. Se precisa de muito setup, o `service.ts` provavelmente está
  acoplado demais — apontar isso em vez de montar mock gigante.
