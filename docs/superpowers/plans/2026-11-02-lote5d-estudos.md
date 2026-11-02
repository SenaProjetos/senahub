# Lote 5d — Aba Estudos (levantamento de cargas)

Desenho: [../specs/2026-11-02-lote5d-estudos-design.md](../specs/2026-11-02-lote5d-estudos-design.md).
O dono pulou as perguntas do Lote 5; decisões marcadas no desenho.

## Tarefas

- [x] 1. Migração `20261102220000_estudo_projeto` (SQL à mão) + `schema.prisma` (`EstudoProjeto`, relações em `Projeto`/`User`) + `db:generate`.
- [x] 2. Puro: `modules/estudos/conteudo.ts` (Zod do conteúdo, limites, `conteudoVazio`) + teste.
- [x] 3. Puro: `modules/estudos/calculo.ts` (achatar para o motor, subtotal por ambiente e por tipo de ponto; soma = total) + teste.
- [x] 4. Puro: `modules/estudos/acesso.ts` (`estudosLiberados`, `podeEditarEstudos`) + teste; `acoes.ts` (descritor ADR-0002) + teste.
- [x] 5. Extrair da calculadora `carga-linha.ts` (modelo de linha/condições, montagem da entrada) e `linha-carga.tsx`/`condicoes-instalacao.tsx`; a calculadora passa a usá-los sem mudar comportamento.
- [x] 6. `modules/estudos/{queries,service,actions}.ts` (`defineAction`, escopo de projeto, trava otimista, auditoria) + teste do service.
- [x] 7. Rota de exportação `/api/estudos/[id]/memoria` (auto-autenticada) reaproveitando `montarMemoria` e os renderizadores.
- [x] 8. Páginas `estudos` (lista + `[estudoId]`) + `loading.tsx`, componentes `estudos-view`, `estudo-editor`, aba em `abas.ts`/layout/`abasComConteudo`.
- [x] 9. Smoke `smoke:estudos`, adendo na ficha `corrente-demanda`, CLAUDE.md, roadmap, memória.
- [ ] 10. Auditoria nível 3 + verificação em tela + prints.

## Depende do engenheiro

A calculadora `corrente-demanda` (motor) precisa estar validada para a aba abrir à equipe.
