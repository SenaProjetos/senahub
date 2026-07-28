---
name: manual-sync
description: Atualiza o manual do usuário em docs/manual e o índice de busca depois de uma feature. Use ao terminar qualquer feature visível na UI.
disable-model-invocation: true
---

# Sincronizar manual

A rota `/ajuda` (e o catch-all `[...slug]`) renderiza `docs/manual/**` direto via
`lib/manual.ts` + react-markdown. **Não há banco: o markdown É a documentação.**

`/ajuda` não tem `roles[]` no `nav-config.ts` — é visível para **todos os papéis,
cliente incluído**. Escrever com isso em mente.

## Passos

1. **Achar a seção certa** em `docs/manual/`:
   `inicio`, `projetos`, `financeiro`, `rh-ponto`, `engenharia`, `clientes-comercial`,
   `comunicacao`, `gestao`, `sistema`.

2. **Escrever a página.** Voz do usuário final, pt-BR, zero jargão de código.
   Nomear botões, telas e campos **exatamente** como aparecem na UI.
   Nada de nome de tabela, de função ou de rota interna.

3. **Atualizar `docs/manual/search-index.json`.**
   Isso é manual: o arquivo é lido por `lerManifesto()` em `lib/manual.ts:117`, mas
   **nada o gera**. Sem a entrada (`path`, título, resumo) a página existe mas não
   aparece na busca do `/ajuda`. É a falha mais comum aqui, e é silenciosa.
   O `path` no índice é relativo a `docs/manual/` (ex.: `financeiro/lancamentos.md`);
   `pathParaSlug()` converte para a rota.

4. **Restrição de papel.** Se a página descreve tela que só alguns papéis enxergam,
   dizer isso na própria página — o cliente lê o manual inteiro.

5. **Feature grande** → registrar em `docs/manual/novidades.md`.

6. **Termo novo de domínio** → `glossary.md`. **Dúvida recorrente** → `faq.md`.

## Conferir

Abrir `/ajuda`, navegar até a página nova e **buscar por ela** — a busca é o que
quebra quando o índice fica para trás.
