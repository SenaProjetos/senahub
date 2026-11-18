# Kit de contexto para o Projeto do claude.ai

Kit para quem especifica sem programar: um usuário técnico usa o claude.ai (web ou app, não o Claude Code) num
Projeto com este contexto. O Claude dele conduz a conversa e entrega o pedido já estruturado: erro, melhoria,
ferramenta de engenharia ou validação de ferramenta.

## Gerar

```bash
npm run kit:claude
```

Sai em `kit-claude-saida/` (fora do git). Regerar sempre que o manual (`docs/manual/`), as fichas
(`docs/engenharia/validacao/`) ou o catálogo de ferramentas (`src/modules/ferramentas/registry.ts`) mudarem, e
trocar os arquivos no Projeto.

Entra só documentação de usuário: os arquivos desta pasta, o manual, as fichas de validação, o catálogo de
ferramentas e a planilha de casos de teste. Nada de código, `.env` ou docs de desenvolvimento.

## Montar o Projeto (uma vez)

1. A pessoa entra no claude.ai **com a conta dela** (a conta é individual: Pro, ou um assento num plano Team).
2. Projects → **Create project** → nome "SenaHub — especificações".
3. Em **Instructions**, colar o texto de `instrucoes-do-projeto.md` (da linha `---` para baixo).
4. Em **Project knowledge**, subir todos os outros arquivos de `kit-claude-saida/`.
5. Para usar: abrir uma conversa nova dentro do Projeto e contar o que quer ("achei um erro na baixa", "quero
   uma calculadora de…", "vamos validar a Bomba de Recalque").

## O que chega para a equipe

- **Erro** e **melhoria**: chamado no **Suporte** do SenaHub (categoria Erro / Sugestão). Trazer o texto do chamado
  para a sessão do Claude Code.
- **Ferramenta**: a especificação (modelo `04`) + `casos-de-teste-modelo.xlsx` preenchida. Guardar em
  `docs/engenharia/especificacoes/<nome>/` e pedir a implementação; os casos da planilha viram o `*.test.ts` do motor.
- **Validação**: a ficha preenchida volta para `docs/engenharia/validacao/<chave>.md`; com ela assinada, preencher
  `validacao` no `registry.ts` (instruções no fim de cada ficha).

## Arquivos desta pasta

- `instrucoes-do-projeto.md`: o papel do Claude dele e as regras (não inventar, não programar, casos de teste
  calculados pelo engenheiro).
- `01-o-senahub.md`: o sistema em linguagem de usuário e como uma ferramenta de engenharia funciona.
- `02-modelo-erro.md`, `03-modelo-melhoria.md`, `04-modelo-ferramenta.md`: os modelos de saída.
