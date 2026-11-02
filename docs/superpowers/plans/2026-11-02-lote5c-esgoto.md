# Lote 5c — Destino final do esgoto

Desenho: [../specs/2026-11-02-lote5c-esgoto-design.md](../specs/2026-11-02-lote5c-esgoto-design.md).
O dono pulou as perguntas em 02/11/2026; decisões marcadas no desenho.

## Tarefas

- [x] `calc/soil-infiltration.ts` + teste (chave `esgoto-infiltracao`).
- [x] `acoes-furo.ts` + teste (descritor ADR-0002 da lista de furos).
- [x] Registry (`exigeValidacao: true`), `savefile`, `calcular()` e `montarMemoria()` no service, formulário
  (`soil-infiltration-form.tsx`), case em `ferramenta-view.tsx`.
- [x] Ficha `docs/engenharia/validacao/esgoto-infiltracao.md`.
- [ ] Guia ilustrado e manual (depois da validação).

## Decisões de execução (do agente)

- Chave publicada `esgoto-infiltracao` (nunca renomear); campos do esquema em português, persistidos em `entradasJson`.
- A norma de referência no catálogo é "NBR 17076:2024" porque as antigas foram substituídas; o engenheiro confirma
  qual vale para o órgão sanitário do projeto.
- Contribuição por pessoa sem padrão; limite de aptidão do solo ausente (não recusa solo ruim).

## Depende do engenheiro (não vai ao ar sem isso)

Tudo, e primeiro a leitura da NBR 17076:2024: curva de Ci, distância ao lençol, parede lateral × fundo, número
mínimo de furos, uso alternado, contribuição por pessoa.
