# Campos com formato — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todo campo de CPF, CNPJ, CPF/CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX e chave NF-e ganha máscara na digitação e a mesma validação na tela e no servidor, e um teste-guarda mantém isso como regra.

**Architecture:** catálogo puro `src/lib/campos/` (um arquivo por tipo, com máscara, normalização, validação e mensagem) alimenta três consumidores: o componente `InputFormatado` (tela), os helpers Zod `campo.<tipo>()` (schema das actions) e `exigirCamposValidos` (regra "só valida o que mudou" na edição). Um teste-guarda varre `src/` e reprova `<Input>` cru ou `z.string()` solto nesses campos. Um script único normaliza os dados antigos.

**Tech Stack:** Next 15 / React 19, TypeScript, Zod 4 (`^4.4.3`), Vitest (ambiente node, sem jsdom), Prisma 7, `tsx` para scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-campos-formatados-design.md`

## Global Constraints

- Branch: `feat/campos-formatados`. Stage arquivos específicos (nunca `git add -A`/`.`); conferir com `git show --stat` depois de cada commit.
- Commits semânticos em pt-BR, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código em inglês ou português conforme o arquivo vizinho; **todo texto visível em pt-BR**.
- `src/lib/campos/*.ts` (exceto testes) é **puro**: sem React, Prisma, Next, `server-only`. Roda no navegador e no servidor.
- Banco grava o **formato padrão** (D3): `000.000.000-00`, `00.000.000/0000-00`, `(00) 00000-0000`, `00000-000`. Exceções que já seguem formato oficial e ficam como estão: chave PIX no formato do BACEN (só dígitos no CPF/CNPJ, `+55DDD…` no telefone, minúscula no e-mail — regra atual de `rh/contas/pix.ts`) e chave NF-e em 44 dígitos corridos (regra atual de `normalizarChaveNfe`). A máscara dessas duas é só de exibição.
- Vazio é sempre válido no catálogo. Obrigatoriedade é do schema (`{ obrigatorio: true }`). Campo hoje opcional continua opcional.
- Schema de **criar** = estrito (`campo.x()`). Schema de **editar** = `campo.x({ legado: true })` + `exigirCamposValidos(input, antes, mapa)` no handler (D4).
- `""` enviado continua `""` depois do schema (limpar o campo grava vazio/null como hoje); ausente continua `undefined`.
- Fora do escopo: e-mail de login (`User.email` no cadastro/edição de usuário e no wizard, login, reset de senha, `SolicitacaoCadastro.email`). Esses campos levam `// campo-ok: e-mail de login (better-auth)`.
- Sem biblioteca nova. Sem `next build` com `next dev` ativo na mesma pasta.
- Toda tela tocada: conferir no navegador (`npm run dev -- -p 3001`, login `claude.admin@dev.senahub` / `ClaudeDev@2026`) digitando, colando, saindo do campo com valor inválido e salvando; também a 390 px de largura (`document.documentElement.scrollWidth === 390`).
- Tela tocada que ainda usa o título antigo (`text-2xl font-extrabold tracking-tight`) migra para `CabecalhoPagina` só se a mudança for trivial; senão, não mexer (fora do escopo).
- **Modelo por tarefa** (regra do dono: se a tarefa pede modelo diferente do atual, PARAR e pedir `/model`): Tarefas 1–8 e 14–16 = Opus; Tarefas 9–13 = Sonnet.

## Review Focus

1. **Colar com sujeira** (`+55 (81) 9 9999-9999`, `529 982 247 25`, CNPJ com espaços): a pessoa espera o número certo formatado, nunca cortado nem com o `55` virando DDD. Testes em `telefone.test.ts` e `cpf-cnpj.test.ts` (Tarefas 1 e 2).
2. **Editar no meio e apagar pontuação**: backspace logo depois de `.`/`-`/`)` apaga o dígito anterior (não trava), e digitar no meio mantém o cursor no lugar. Testes em `edicao.test.ts` (Tarefa 4).
3. **Abrir registro antigo inválido e salvar sem tocar**: salva; mexer no campo inválido e salvar recusa com a mensagem no campo. Testes em `exigir.test.ts` (Tarefa 6) + conferência em tela na Tarefa 10 (cliente com documento inválido).
4. **Apagar tudo num campo opcional na edição**: grava vazio, não "mantém o antigo" nem recusa. Teste em `zod.test.ts` (Tarefa 6).
5. **Duplicidade depois da normalização**: CNPJ de PJ gravado só com dígitos (legado) e CNPJ novo formatado são o mesmo cadastro — o aviso "Já existe uma PJ com esse CNPJ" continua aparecendo. Teste de `variantesDoValor` em `variantes.test.ts` (Tarefa 3) + uso na Tarefa 9.

---

## Mapa de arquivos

**Criar**
- `src/lib/campos/tipo.ts` — contrato `TipoCampo` + `ehDigito`.
- `src/lib/campos/cpf-cnpj.ts` (+ `.test.ts`) — tipos `cpf`, `cnpj`, `cpfCnpj`.
- `src/lib/campos/cep.ts` (+ `.test.ts`).
- `src/lib/campos/telefone.ts` (+ `.test.ts`) — lógica que hoje está em `comercial/contato-validacao.ts`.
- `src/lib/campos/email.ts` (+ `.test.ts`).
- `src/lib/campos/bancarios.ts` (+ `.test.ts`) — `rg`, `agencia`, `conta` (agrupados por serem alfanuméricos simples).
- `src/lib/campos/chave-nfe.ts` (+ `.test.ts`) — lógica que hoje está em `financeiro/lancamentos/baixa.ts`.
- `src/lib/campos/chave-pix.ts` (+ `.test.ts`) — `campoPix(tipo)` sobre `rh/contas/pix.ts`.
- `src/lib/campos/index.ts` (+ `index.test.ts`) — `CAMPOS`, `NomeCampo`, `campoDe`, `mensagemDe`, `exibicaoInicial`, `variantesDoValor`.
- `src/lib/campos/edicao.ts` (+ `.test.ts`) — `aplicarEdicao` (máscara + cursor + backspace sobre pontuação).
- `src/lib/campos/zod.ts` (+ `.test.ts`) — `campo.<tipo>()`.
- `src/lib/campos/exigir.ts` (+ `.test.ts`) — `exigirCamposValidos`.
- `src/lib/campos/guarda-campos.test.ts` — teste-guarda.
- `src/components/ui/input-formatado.tsx` — componente.
- `scripts/normalizar-campos.ts` + `scripts/normalizar-campos-alvos.ts` (+ `src/lib/campos/alvos-normalizacao.test.ts`).
- `docs/adr/0010-campos-com-formato.md`.

**Modificar (núcleo)**
- `src/lib/action-error.ts` (+ `action-error.test.ts`) — `ActionError` com campos, `fieldErrorsDoErro`.
- `src/lib/with-action.ts:126-135` — devolve `fieldErrors` do `ActionError`.
- `src/lib/utils.ts:77-109` — remove `maskCpf`, `maskTelefone`, `maskCep`, `maskCnpj`.
- `src/modules/comercial/contato-validacao.ts` — telefone/e-mail viram reexportações do catálogo.
- `src/modules/financeiro/lancamentos/baixa.ts:95-120` — chave NF-e vira reexportação do catálogo.

**Modificar (telas e schemas)** — listados por tarefa (9 a 13).

---

### Task 1: Contrato do catálogo + CPF, CNPJ, CPF/CNPJ e CEP

**Files:**
- Create: `src/lib/campos/tipo.ts`, `src/lib/campos/cpf-cnpj.ts`, `src/lib/campos/cpf-cnpj.test.ts`, `src/lib/campos/cep.ts`, `src/lib/campos/cep.test.ts`
- Modify: `docs/superpowers/specs/2026-10-04-campos-formatados-design.md` (ajustes da seção "Ajustes do plano" abaixo)

**Interfaces:**
- Produces: `type TipoCampo`, `ehDigito(c)`, `cpf`, `cnpj`, `cpfCnpj`, `cep: TipoCampo`, `mascararCpf`, `mascararCnpj`, `mascararCep`.

- [ ] **Step 1: Criar o contrato**

`src/lib/campos/tipo.ts`:

```ts
/**
 * Contrato de um campo com formato conhecido (spec 2026-10-04-campos-formatados). Puro: o mesmo
 * objeto alimenta a máscara da tela (`InputFormatado`), o schema Zod (`campo.<tipo>()`) e a regra
 * de edição (`exigirCamposValidos`) — a tela nunca aceita o que a action recusa.
 */
export type TipoCampo = {
  /** Máscara enquanto a pessoa digita. Aceita entrada parcial e qualquer pontuação colada. */
  mascarar(texto: string): string;
  /** Formato gravado no banco. Valor inválido volta só aparado, sem perder nada. */
  normalizar(texto: string): string;
  /** Vazio é válido: obrigatoriedade é do schema. */
  validar(texto: string): boolean;
  /** O que define "o mesmo valor" (legado × novo): sem pontuação, sem caixa. */
  essencia(texto: string): string;
  /** Caractere que a pessoa digita; os outros são pontuação da máscara (conta para o cursor). */
  significativo(c: string): boolean;
  /** Frase mostrada sob o campo e no `ActionError`. */
  mensagem: string;
  /** Frase específica para um valor, quando a regra tem vários motivos (chave PIX). */
  motivo?(texto: string): string;
  inputMode: "numeric" | "tel" | "email" | "text";
  autoComplete?: string;
  placeholder: string;
};

export const ehDigito = (c: string): boolean => c >= "0" && c <= "9";
```

Nota: não há `maxLength` no contrato. `mascarar` já corta no tamanho certo, e um `maxLength` nativo cortaria o texto **colado** antes da máscara (um `+55 81 99999-9999` perderia os últimos dígitos).

- [ ] **Step 2: Escrever os testes de CPF/CNPJ (falhando)**

`src/lib/campos/cpf-cnpj.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cnpj, cpf, cpfCnpj } from "./cpf-cnpj";

const CPF_OK = "529.982.247-25";
const CNPJ_OK = "11.222.333/0001-81";

describe("cpf", () => {
  it("mascara enquanto digita", () => {
    expect(cpf.mascarar("529")).toBe("529");
    expect(cpf.mascarar("5299")).toBe("529.9");
    expect(cpf.mascarar("5299822")).toBe("529.982.2");
    expect(cpf.mascarar("52998224725")).toBe(CPF_OK);
  });
  it("corta no 11º dígito e ignora letras e pontuação colada", () => {
    expect(cpf.mascarar("529 982 247 25 99")).toBe(CPF_OK);
    expect(cpf.mascarar("a5b2c9")).toBe("529");
  });
  it("valida pelo dígito verificador; vazio é válido", () => {
    expect(cpf.validar(CPF_OK)).toBe(true);
    expect(cpf.validar("52998224725")).toBe(true);
    expect(cpf.validar("529.982.247-24")).toBe(false);
    expect(cpf.validar("111.111.111-11")).toBe(false);
    expect(cpf.validar("")).toBe(true);
    expect(cpf.validar("   ")).toBe(true);
  });
  it("normaliza o válido para o formato padrão e deixa o inválido como veio (aparado)", () => {
    expect(cpf.normalizar(" 52998224725 ")).toBe(CPF_OK);
    expect(cpf.normalizar(" 123 ")).toBe("123");
  });
  it("essência = só dígitos", () => {
    expect(cpf.essencia(CPF_OK)).toBe("52998224725");
  });
});

describe("cnpj", () => {
  it("mascara enquanto digita", () => {
    expect(cnpj.mascarar("11")).toBe("11");
    expect(cnpj.mascarar("112")).toBe("11.2");
    expect(cnpj.mascarar("112223330")).toBe("11.222.333/0");
    expect(cnpj.mascarar("11222333000181")).toBe(CNPJ_OK);
    expect(cnpj.mascarar("11 222 333 0001 81 7")).toBe(CNPJ_OK);
  });
  it("valida e normaliza", () => {
    expect(cnpj.validar("11222333000181")).toBe(true);
    expect(cnpj.validar("11.222.333/0001-80")).toBe(false);
    expect(cnpj.normalizar("11222333000181")).toBe(CNPJ_OK);
  });
});

describe("cpfCnpj", () => {
  it("usa a máscara de CPF até 11 dígitos e a de CNPJ a partir do 12º", () => {
    expect(cpfCnpj.mascarar("52998224725")).toBe(CPF_OK);
    expect(cpfCnpj.mascarar("112223330001")).toBe("11.222.333/0001");
    expect(cpfCnpj.mascarar("11222333000181")).toBe(CNPJ_OK);
  });
  it("valida os dois e normaliza pelo tamanho", () => {
    expect(cpfCnpj.validar(CPF_OK)).toBe(true);
    expect(cpfCnpj.validar(CNPJ_OK)).toBe(true);
    expect(cpfCnpj.validar("123456789")).toBe(false);
    expect(cpfCnpj.normalizar("52998224725")).toBe(CPF_OK);
    expect(cpfCnpj.normalizar("11222333000181")).toBe(CNPJ_OK);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/campos/cpf-cnpj.test.ts`
Expected: FAIL — `Failed to resolve import "./cpf-cnpj"`.

- [ ] **Step 4: Implementar**

`src/lib/campos/cpf-cnpj.ts`:

```ts
import { soDigitos, validarCNPJ, validarCPF, validarCpfCnpj } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

export function mascararCpf(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCnpj(texto: string): string {
  const d = soDigitos(texto).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const vazio = (t: string) => t.trim() === "";

export const cpf: TipoCampo = {
  mascarar: mascararCpf,
  normalizar: (t) => (!vazio(t) && validarCPF(t) ? mascararCpf(t) : t.trim()),
  validar: (t) => vazio(t) || validarCPF(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CPF inválido. Confira os 11 dígitos.",
  inputMode: "numeric",
  placeholder: "000.000.000-00",
};

export const cnpj: TipoCampo = {
  mascarar: mascararCnpj,
  normalizar: (t) => (!vazio(t) && validarCNPJ(t) ? mascararCnpj(t) : t.trim()),
  validar: (t) => vazio(t) || validarCNPJ(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CNPJ inválido. Confira os 14 dígitos.",
  inputMode: "numeric",
  placeholder: "00.000.000/0000-00",
};

const mascararCpfCnpj = (t: string) => (soDigitos(t).length <= 11 ? mascararCpf(t) : mascararCnpj(t));

export const cpfCnpj: TipoCampo = {
  mascarar: mascararCpfCnpj,
  normalizar: (t) => (!vazio(t) && validarCpfCnpj(t) ? mascararCpfCnpj(t) : t.trim()),
  validar: (t) => vazio(t) || validarCpfCnpj(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CPF ou CNPJ inválido. Confira os dígitos.",
  inputMode: "numeric",
  placeholder: "CPF ou CNPJ",
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/campos/cpf-cnpj.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Testes de CEP (falhando), implementar, passar**

`src/lib/campos/cep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cep } from "./cep";

describe("cep", () => {
  it("mascara, corta em 8 dígitos e aceita colado com ponto", () => {
    expect(cep.mascarar("01310")).toBe("01310");
    expect(cep.mascarar("013101")).toBe("01310-1");
    expect(cep.mascarar("01.310-100")).toBe("01310-100");
    expect(cep.mascarar("013101009")).toBe("01310-100");
  });
  it("valida 8 dígitos; vazio é válido", () => {
    expect(cep.validar("01310-100")).toBe(true);
    expect(cep.validar("0131010")).toBe(false);
    expect(cep.validar("")).toBe(true);
  });
  it("normaliza", () => {
    expect(cep.normalizar("01310100")).toBe("01310-100");
    expect(cep.normalizar("123")).toBe("123");
  });
});
```

Run: `npx vitest run src/lib/campos/cep.test.ts` → FAIL (import).

`src/lib/campos/cep.ts`:

```ts
import { soDigitos } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

export function mascararCep(texto: string): string {
  const d = soDigitos(texto).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

const valido = (t: string) => soDigitos(t).length === 8;

export const cep: TipoCampo = {
  mascarar: mascararCep,
  normalizar: (t) => (valido(t) ? mascararCep(t) : t.trim()),
  validar: (t) => t.trim() === "" || valido(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CEP inválido. São 8 dígitos, ex.: 01310-100.",
  inputMode: "numeric",
  autoComplete: "postal-code",
  placeholder: "00000-000",
};
```

Run: `npx vitest run src/lib/campos/cep.test.ts` → PASS.

- [ ] **Step 7: Registrar no spec os ajustes do plano**

Em `docs/superpowers/specs/2026-10-04-campos-formatados-design.md`, acrescentar ao fim uma seção:

```markdown
## 10. Ajustes do plano (2026-10-05)

- `chaveNfe` grava **44 dígitos corridos** (formato da SEFAZ e regra atual de `normalizarChaveNfe`); os grupos de 4 são só a máscara de exibição.
- `chavePix` grava no formato do BACEN (regra atual de `rh/contas/pix.ts`); a validação no servidor continua no handler por `validarChavePix`, porque depende do campo `pixTipo` do mesmo objeto. O schema leva `campo-ok`.
- O contrato `TipoCampo` não tem `maxLength`: a máscara já corta, e o `maxLength` nativo cortaria o texto colado.
- O script de normalização entra no runbook (`docs/DEPLOY.md` §9), não no menu do servidor: é de uma vez só.
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/campos/tipo.ts src/lib/campos/cpf-cnpj.ts src/lib/campos/cpf-cnpj.test.ts src/lib/campos/cep.ts src/lib/campos/cep.test.ts docs/superpowers/specs/2026-10-04-campos-formatados-design.md
git commit -m "feat(campos): catálogo com CPF, CNPJ, CPF/CNPJ e CEP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 2: Telefone e e-mail (fonte única com o comercial)

**Files:**
- Create: `src/lib/campos/telefone.ts`, `src/lib/campos/telefone.test.ts`, `src/lib/campos/email.ts`, `src/lib/campos/email.test.ts`
- Modify: `src/modules/comercial/contato-validacao.ts:1-56`
- Test (existente, deve continuar verde): `src/modules/comercial/contato-validacao.test.ts`

**Interfaces:**
- Consumes: `TipoCampo`, `ehDigito` (Task 1).
- Produces: `telefone`, `email: TipoCampo`, `digitosNacionais(valor)`.

- [ ] **Step 1: Testes (falhando)**

`src/lib/campos/telefone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { telefone } from "./telefone";

describe("telefone", () => {
  it("mascara fixo e celular enquanto digita", () => {
    expect(telefone.mascarar("8")).toBe("(8");
    expect(telefone.mascarar("81")).toBe("(81");
    expect(telefone.mascarar("8133")).toBe("(81) 33");
    expect(telefone.mascarar("8133334444")).toBe("(81) 3333-4444");
    expect(telefone.mascarar("81999998888")).toBe("(81) 99999-8888");
  });
  it("descarta o +55 colado e nunca o confunde com DDD", () => {
    expect(telefone.mascarar("+55 (81) 9 9999-8888")).toBe("(81) 99999-8888");
    expect(telefone.mascarar("5581999998888")).toBe("(81) 99999-8888");
    // DDD 55 (RS) sem código do país continua DDD 55
    expect(telefone.mascarar("55999998888")).toBe("(55) 99999-8888");
  });
  it("valida DDD + fixo (2–5) ou celular (9); vazio é válido", () => {
    expect(telefone.validar("(81) 3333-4444")).toBe(true);
    expect(telefone.validar("(81) 99999-8888")).toBe(true);
    expect(telefone.validar("+55 81 99999-8888")).toBe(true);
    expect(telefone.validar("(81) 89999-8888")).toBe(false);
    expect(telefone.validar("(01) 3333-4444")).toBe(false);
    expect(telefone.validar("3333-4444")).toBe(false);
    expect(telefone.validar("")).toBe(true);
  });
  it("normaliza e compara pelos dígitos nacionais", () => {
    expect(telefone.normalizar("+5581999998888")).toBe("(81) 99999-8888");
    expect(telefone.essencia("+55 (81) 99999-8888")).toBe("81999998888");
  });
});
```

`src/lib/campos/email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { email } from "./email";

describe("email", () => {
  it("tira espaço e passa para minúscula enquanto digita", () => {
    expect(email.mascarar(" Ana @Empresa.com ")).toBe("ana@empresa.com");
  });
  it("valida o formato; vazio é válido", () => {
    expect(email.validar("ana@empresa.com.br")).toBe(true);
    expect(email.validar("ana@empresa")).toBe(false);
    expect(email.validar("ana empresa.com")).toBe(false);
    expect(email.validar("")).toBe(true);
  });
  it("normaliza para minúscula aparada", () => {
    expect(email.normalizar("  Ana@Empresa.COM ")).toBe("ana@empresa.com");
  });
});
```

Run: `npx vitest run src/lib/campos/telefone.test.ts src/lib/campos/email.test.ts` → FAIL (import).

- [ ] **Step 2: Implementar `telefone.ts` (move a lógica de `contato-validacao.ts`)**

```ts
import { soDigitos } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

/**
 * Dígitos nacionais: descarta o código do país (+55) quando o número vem colado com ele. Sem
 * isto, "+55 81 99999-9999" (13 dígitos) seria cortado em 11 e viraria "(55) 81999-9999".
 */
export function digitosNacionais(valor: string): string {
  const d = soDigitos(valor);
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

/** (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular), enquanto a pessoa digita. */
function mascararTelefone(valor: string): string {
  const d = digitosNacionais(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * DDD (11–99) + 8 dígitos (fixo, começa em 2–5) ou + 9 dígitos (celular, começa em 9). Não
 * confirma que o número existe — só que tem cara de telefone.
 */
function telefoneValido(valor: string): boolean {
  const d = digitosNacionais(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]/.test(d)) return false;
  const local = d.slice(2);
  return local.length === 9 ? local.startsWith("9") : /^[2-5]/.test(local);
}

export const telefone: TipoCampo = {
  mascarar: mascararTelefone,
  normalizar: (t) => (t.trim() !== "" && telefoneValido(t) ? mascararTelefone(t) : t.trim()),
  validar: (t) => t.trim() === "" || telefoneValido(t),
  essencia: digitosNacionais,
  significativo: ehDigito,
  mensagem: "Telefone inválido. Informe o DDD e o número, ex.: (81) 99999-9999.",
  inputMode: "tel",
  autoComplete: "tel",
  placeholder: "(00) 00000-0000",
};
```

- [ ] **Step 3: Implementar `email.ts`**

```ts
import { z } from "zod";
import type { TipoCampo } from "./tipo";

const esquema = z.string().email();
const limpo = (t: string) => t.trim().toLowerCase();

export const email: TipoCampo = {
  mascarar: (t) => t.replace(/\s/g, "").toLowerCase(),
  normalizar: limpo,
  validar: (t) => limpo(t) === "" || esquema.safeParse(limpo(t)).success,
  essencia: limpo,
  significativo: (c) => !/\s/.test(c),
  mensagem: "E-mail inválido. Use o formato nome@empresa.com.br.",
  inputMode: "email",
  autoComplete: "email",
  placeholder: "nome@empresa.com.br",
};
```

Run: `npx vitest run src/lib/campos/telefone.test.ts src/lib/campos/email.test.ts` → PASS.

- [ ] **Step 4: `contato-validacao.ts` passa a reexportar o catálogo**

Substituir, em `src/modules/comercial/contato-validacao.ts`, o bloco das linhas 1–56 (de `import { z } from "zod";` até o fim de `telefoneValido`) por:

```ts
import { email } from "@/lib/campos/email";
import { telefone } from "@/lib/campos/telefone";

/**
 * Regras de e-mail e telefone do formulário de entrada comercial. A fonte é o catálogo de campos
 * (`lib/campos/`, spec 2026-10-04): estes nomes ficam por compatibilidade com quem já importa daqui.
 */
export const MENSAGEM_EMAIL = email.mensagem;
export const MENSAGEM_TELEFONE = telefone.mensagem;

/** Vazio é válido: e-mail é opcional. Só recusa quando há texto e ele não é um e-mail. */
export const emailValido = (valor: string): boolean => email.validar(valor);

/** E-mail é caixa-baixa e sem espaço nas pontas — o que se grava e o que se deduplica. */
export const normalizarEmail = (valor: string): string => email.normalizar(valor);

/** (00) 0000-0000 ou (00) 00000-0000, enquanto a pessoa digita. */
export const formatarTelefoneEntrada = (valor: string): string => telefone.mascarar(valor);

/** Telefone brasileiro com DDD. Vazio é válido. */
export const telefoneValido = (valor: string): boolean => telefone.validar(valor);
```

Manter o resto do arquivo (`semAcento` e o que vem depois). Se `z` ainda for usado abaixo, manter `import { z } from "zod";` no topo.

- [ ] **Step 5: Rodar os testes do comercial**

Run: `npx vitest run src/modules/comercial src/lib/campos`
Expected: PASS. Se `contato-validacao.test.ts` falhar porque a mensagem de e-mail mudou de texto, NÃO mudar o teste: a mensagem do catálogo é a mesma (`"E-mail inválido. Use o formato nome@empresa.com.br."`); conferir se o import ficou certo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/campos/telefone.ts src/lib/campos/telefone.test.ts src/lib/campos/email.ts src/lib/campos/email.test.ts src/modules/comercial/contato-validacao.ts
git commit -m "feat(campos): telefone e e-mail no catálogo, comercial passa a usar a mesma regra

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 3: RG, agência, conta, chave NF-e, chave PIX e o índice do catálogo

**Files:**
- Create: `src/lib/campos/bancarios.ts` (+ `.test.ts`), `src/lib/campos/chave-nfe.ts` (+ `.test.ts`), `src/lib/campos/chave-pix.ts` (+ `.test.ts`), `src/lib/campos/index.ts`, `src/lib/campos/index.test.ts`
- Modify: `src/modules/financeiro/lancamentos/baixa.ts:95-120`
- Test (existente): `src/modules/financeiro/lancamentos/baixa.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `rg`, `agencia`, `conta`, `chaveNfe: TipoCampo`; `chaveNfeValida(texto): boolean`
  - `campoPix(tipo: TipoPix): TipoCampo`
  - `type NomeCampo = "cpf" | "cnpj" | "cpfCnpj" | "telefone" | "cep" | "email" | "rg" | "agencia" | "conta" | "chaveNfe"`
  - `CAMPOS: Record<NomeCampo, TipoCampo>`
  - `campoDe(nome: NomeCampo | "chavePix", tipoPix?: TipoPix): TipoCampo`
  - `mensagemDe(campo: TipoCampo, texto: string): string`
  - `exibicaoInicial(campo: TipoCampo, valor: string): string`
  - `variantesDoValor(campo: TipoCampo, valor: string): string[]`

- [ ] **Step 1: Testes de RG, agência e conta (falhando)**

`src/lib/campos/bancarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agencia, conta, rg } from "./bancarios";

describe("rg", () => {
  it("maiúsculo, sem pontuação, até 14", () => {
    expect(rg.mascarar("12.345.678-x")).toBe("12345678X");
    expect(rg.mascarar("123456789012345678")).toBe("12345678901234");
  });
  it("5 a 14 caracteres com ao menos um dígito; vazio é válido", () => {
    expect(rg.validar("1234567")).toBe(true);
    expect(rg.validar("MG1234567")).toBe(true);
    expect(rg.validar("1234")).toBe(false);
    expect(rg.validar("ABCDEF")).toBe(false);
    expect(rg.validar("")).toBe(true);
  });
  it("normaliza", () => {
    expect(rg.normalizar("12.345.678-9")).toBe("123456789");
  });
});

describe("agencia", () => {
  it("4 dígitos e DV opcional depois do hífen", () => {
    expect(agencia.mascarar("123")).toBe("123");
    expect(agencia.mascarar("1234")).toBe("1234");
    expect(agencia.mascarar("12345")).toBe("1234-5");
    expect(agencia.mascarar("1234x")).toBe("1234-X");
  });
  it("valida", () => {
    expect(agencia.validar("1234")).toBe(true);
    expect(agencia.validar("1234-X")).toBe(true);
    expect(agencia.validar("123")).toBe(false);
    expect(agencia.validar("")).toBe(true);
  });
});

describe("conta", () => {
  it("o último caractere é o dígito", () => {
    expect(conta.mascarar("1")).toBe("1");
    expect(conta.mascarar("12")).toBe("1-2");
    expect(conta.mascarar("123456")).toBe("12345-6");
    expect(conta.mascarar("12345x")).toBe("12345-X");
  });
  it("valida número (1–12 dígitos) + DV", () => {
    expect(conta.validar("12345-6")).toBe(true);
    expect(conta.validar("12345-X")).toBe(true);
    expect(conta.validar("1")).toBe(false);
    expect(conta.validar("1X345-6")).toBe(false);
    expect(conta.validar("")).toBe(true);
  });
  it("normaliza e compara sem hífen", () => {
    expect(conta.normalizar("123456")).toBe("12345-6");
    expect(conta.essencia("12345-6")).toBe("123456");
  });
});
```

Run: `npx vitest run src/lib/campos/bancarios.test.ts` → FAIL.

- [ ] **Step 2: Implementar `bancarios.ts`**

```ts
import type { TipoCampo } from "./tipo";

const alfanum = (t: string) => t.toUpperCase().replace(/[^0-9A-Z]/g, "");
const digitosOuX = (t: string) => t.toUpperCase().replace(/[^0-9X]/g, "");

const rgValido = (t: string) => {
  const l = alfanum(t);
  return l.length >= 5 && l.length <= 14 && /\d/.test(l);
};

/** RG: sem dígito verificador nacional (a regra muda por estado) — só forma e tamanho. */
export const rg: TipoCampo = {
  mascarar: (t) => alfanum(t).slice(0, 14),
  normalizar: (t) => (rgValido(t) ? alfanum(t) : t.trim()),
  validar: (t) => t.trim() === "" || rgValido(t),
  essencia: alfanum,
  significativo: (c) => /[0-9a-zA-Z]/.test(c),
  mensagem: "RG inválido. Use de 5 a 14 letras e números, sem pontos.",
  inputMode: "text",
  placeholder: "Só letras e números",
};

function mascararAgencia(t: string): string {
  const e = digitosOuX(t).slice(0, 5);
  return e.length <= 4 ? e : `${e.slice(0, 4)}-${e[4]}`;
}
const agenciaValida = (t: string) => /^\d{4}[0-9X]?$/.test(digitosOuX(t));

export const agencia: TipoCampo = {
  mascarar: mascararAgencia,
  normalizar: (t) => (agenciaValida(t) ? mascararAgencia(t) : t.trim()),
  validar: (t) => t.trim() === "" || agenciaValida(t),
  essencia: digitosOuX,
  significativo: (c) => /[0-9xX]/.test(c),
  mensagem: "Agência inválida. São 4 dígitos, com ou sem dígito, ex.: 1234-5.",
  inputMode: "text",
  placeholder: "0000-0",
};

function mascararConta(t: string): string {
  const e = digitosOuX(t).slice(0, 13);
  return e.length < 2 ? e : `${e.slice(0, -1)}-${e.slice(-1)}`;
}
const contaValida = (t: string) => /^\d{1,12}[0-9X]$/.test(digitosOuX(t));

export const conta: TipoCampo = {
  mascarar: mascararConta,
  normalizar: (t) => (contaValida(t) ? mascararConta(t) : t.trim()),
  validar: (t) => t.trim() === "" || contaValida(t),
  essencia: digitosOuX,
  significativo: (c) => /[0-9xX]/.test(c),
  mensagem: "Conta inválida. Informe o número e o dígito, ex.: 12345-6.",
  inputMode: "text",
  placeholder: "00000-0",
};
```

Run: `npx vitest run src/lib/campos/bancarios.test.ts` → PASS.

- [ ] **Step 3: Chave NF-e — teste, mover a regra, reexportar em `baixa.ts`**

`src/lib/campos/chave-nfe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chaveNfe, chaveNfeValida } from "./chave-nfe";

// Chave com DV correto, a mesma usada em baixa.test.ts. Conferir lá e copiar o valor exato.
const CHAVE = "35240312345678000190550010000001231000001230";

describe("chaveNfe", () => {
  it("mascara em grupos de 4 só para exibir", () => {
    expect(chaveNfe.mascarar("35240312")).toBe("3524 0312");
    expect(chaveNfe.mascarar(CHAVE).replace(/\s/g, "")).toBe(CHAVE);
  });
  it("grava os 44 dígitos corridos", () => {
    expect(chaveNfe.normalizar(chaveNfe.mascarar(CHAVE))).toBe(CHAVE);
  });
  it("valida pelo módulo 11; vazio é válido", () => {
    expect(chaveNfe.validar("")).toBe(true);
    expect(chaveNfe.validar("123")).toBe(false);
    expect(chaveNfeValida(CHAVE)).toBe(chaveNfe.validar(CHAVE));
  });
});
```

**Antes de rodar:** abrir `src/modules/financeiro/lancamentos/baixa.test.ts`, achar a chave válida usada no teste de `chaveNfeValida` e trocar o valor de `CHAVE` por ela (o valor acima é ilustrativo). Acrescentar `expect(chaveNfe.validar(CHAVE)).toBe(true);` ao último `it`.

Run: `npx vitest run src/lib/campos/chave-nfe.test.ts` → FAIL (import).

`src/lib/campos/chave-nfe.ts`:

```ts
import { soDigitos } from "@/lib/documento";
import { ehDigito, type TipoCampo } from "./tipo";

/**
 * Chave de acesso da NF-e/NFS-e/CT-e: 44 dígitos, o último é o dígito verificador (módulo 11,
 * pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → DV 0). Grava os 44 dígitos corridos
 * (formato da SEFAZ); os grupos de 4 são só a máscara de exibição.
 */
export function chaveNfeValida(texto: string): boolean {
  const c = soDigitos(texto);
  if (!/^\d{44}$/.test(c)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

export const chaveNfe: TipoCampo = {
  mascarar: (t) => soDigitos(t).slice(0, 44).replace(/(\d{4})(?=\d)/g, "$1 "),
  normalizar: (t) => (chaveNfeValida(t) ? soDigitos(t) : t.trim()),
  validar: (t) => t.trim() === "" || chaveNfeValida(t),
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "Chave da NF inválida: são 44 dígitos e o último confere os outros. Confira na nota.",
  inputMode: "numeric",
  placeholder: "44 dígitos",
};
```

Em `src/modules/financeiro/lancamentos/baixa.ts`, substituir `normalizarChaveNfe`, `chaveNfeValida` e `MOTIVO_CHAVE_INVALIDA` (linhas ~95–120) por:

```ts
import { chaveNfe } from "@/lib/campos/chave-nfe";
import { soDigitos } from "@/lib/documento";

/** Chave de acesso da NF: regra no catálogo de campos (`lib/campos/chave-nfe.ts`). */
export { chaveNfeValida } from "@/lib/campos/chave-nfe";
export const normalizarChaveNfe = (texto: string): string => soDigitos(texto);
export const MOTIVO_CHAVE_INVALIDA = chaveNfe.mensagem;
```

(os `import` sobem para o topo do arquivo, junto dos outros).

Run: `npx vitest run src/lib/campos/chave-nfe.test.ts src/modules/financeiro/lancamentos/baixa.test.ts` → PASS.

- [ ] **Step 4: Chave PIX — teste e implementação**

`src/lib/campos/chave-pix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { campoPix } from "./chave-pix";

describe("campoPix", () => {
  it("CPF: mascara para exibir e grava só dígitos (BACEN)", () => {
    const c = campoPix("cpf");
    expect(c.mascarar("52998224725")).toBe("529.982.247-25");
    expect(c.normalizar("529.982.247-25")).toBe("52998224725");
  });
  it("telefone: exibe com máscara e grava +55", () => {
    const c = campoPix("telefone");
    expect(c.mascarar("+5531999998888")).toBe("(31) 99999-8888");
    expect(c.normalizar("(31) 99999-8888")).toBe("+5531999998888");
  });
  it("aleatória: só hexadecimal e hífen, minúscula, 36", () => {
    const c = campoPix("aleatoria");
    expect(c.mascarar("ABCDEF12-3456-7890-ABCD-EF1234567890xyz")).toBe("abcdef12-3456-7890-abcd-ef1234567890");
  });
  it("motivo vem da regra do PIX; vazio é válido", () => {
    const c = campoPix("cpf");
    expect(c.validar("")).toBe(true);
    expect(c.validar("123")).toBe(false);
    expect(c.motivo?.("123")).toBe("CPF deve ter 11 dígitos.");
  });
});
```

Run → FAIL. `src/lib/campos/chave-pix.ts`:

```ts
import { TIPO_PIX_LABELS, validarChavePix, type TipoPix } from "@/modules/rh/contas/pix";
import { cnpj, cpf } from "./cpf-cnpj";
import { email } from "./email";
import { telefone } from "./telefone";
import type { TipoCampo } from "./tipo";

const BASE: Record<Exclude<TipoPix, "aleatoria">, TipoCampo> = { cpf, cnpj, email, telefone };

/**
 * Chave PIX por tipo. A gravação segue o formato do BACEN (`validarChavePix`): só dígitos no
 * CPF/CNPJ, +55DDD… no telefone, minúscula no e-mail e na aleatória. A máscara é só de exibição.
 */
export function campoPix(tipo: TipoPix): TipoCampo {
  const r = (t: string) => validarChavePix(tipo, t);
  const aleatoria = tipo === "aleatoria";
  const base = aleatoria ? null : BASE[tipo];
  return {
    mascarar: aleatoria ? (t) => t.toLowerCase().replace(/[^0-9a-f-]/g, "").slice(0, 36) : base!.mascarar,
    normalizar: (t) => {
      const x = r(t);
      return x.ok ? x.chave : t.trim();
    },
    validar: (t) => t.trim() === "" || r(t).ok,
    motivo: (t) => {
      const x = r(t);
      return x.ok ? "" : x.erro;
    },
    essencia: (t) => {
      const x = r(t);
      return x.ok ? x.chave : t.trim();
    },
    significativo: aleatoria ? (c) => /[0-9a-fA-F-]/.test(c) : base!.significativo,
    mensagem: `Chave PIX (${TIPO_PIX_LABELS[tipo]}) inválida.`,
    inputMode: aleatoria ? "text" : base!.inputMode,
    placeholder: aleatoria ? "00000000-0000-0000-0000-000000000000" : base!.placeholder,
  };
}
```

Run: `npx vitest run src/lib/campos/chave-pix.test.ts` → PASS.

- [ ] **Step 5: Índice — testes (falhando)**

`src/lib/campos/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CAMPOS, campoDe, exibicaoInicial, mensagemDe, variantesDoValor } from "./index";

describe("campoDe", () => {
  it("devolve o tipo do catálogo", () => {
    expect(campoDe("cpf")).toBe(CAMPOS.cpf);
  });
  it("chavePix sem tipo vira texto livre (campo desabilitado até escolher o tipo)", () => {
    const c = campoDe("chavePix");
    expect(c.mascarar("qualquer coisa")).toBe("qualquer coisa");
    expect(c.validar("qualquer coisa")).toBe(true);
  });
  it("chavePix com tipo usa a regra do PIX", () => {
    expect(campoDe("chavePix", "cpf").validar("123")).toBe(false);
  });
});

describe("mensagemDe", () => {
  it("prefere o motivo específico", () => {
    expect(mensagemDe(campoDe("chavePix", "cpf"), "123")).toBe("CPF deve ter 11 dígitos.");
    expect(mensagemDe(CAMPOS.cpf, "123")).toBe(CAMPOS.cpf.mensagem);
  });
});

describe("exibicaoInicial", () => {
  it("valor válido aparece mascarado", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "52998224725")).toBe("529.982.247-25");
    expect(exibicaoInicial(campoDe("chavePix", "telefone"), "+5531999998888")).toBe("(31) 99999-8888");
  });
  it("legado inválido aparece mascarado se a máscara não perde nada", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "1234567890")).toBe("123.456.789-0");
  });
  it("legado que a máscara apagaria aparece como está", () => {
    expect(exibicaoInicial(CAMPOS.cpf, "não tem")).toBe("não tem");
    expect(exibicaoInicial(CAMPOS.telefone, "ramal 22")).toBe("ramal 22");
  });
});

describe("variantesDoValor", () => {
  it("formato padrão, só dígitos e o texto como veio, sem repetir", () => {
    expect(variantesDoValor(CAMPOS.cnpj, "11222333000181")).toEqual(["11.222.333/0001-81", "11222333000181"]);
    expect(variantesDoValor(CAMPOS.cnpj, "11.222.333/0001-81")).toEqual(["11.222.333/0001-81", "11222333000181"]);
  });
});
```

Run: `npx vitest run src/lib/campos/index.test.ts` → FAIL.

- [ ] **Step 6: Implementar `index.ts`**

```ts
import type { TipoPix } from "@/modules/rh/contas/pix";
import { agencia, conta, rg } from "./bancarios";
import { cep } from "./cep";
import { chaveNfe } from "./chave-nfe";
import { campoPix } from "./chave-pix";
import { cnpj, cpf, cpfCnpj } from "./cpf-cnpj";
import { email } from "./email";
import { telefone } from "./telefone";
import type { TipoCampo } from "./tipo";

export type { TipoCampo } from "./tipo";

export type NomeCampo =
  | "cpf" | "cnpj" | "cpfCnpj" | "telefone" | "cep" | "email" | "rg" | "agencia" | "conta" | "chaveNfe";

/** Catálogo de campos com formato (spec 2026-10-04). Tipo novo nasce aqui junto com o campo. */
export const CAMPOS: Record<NomeCampo, TipoCampo> = {
  cpf, cnpj, cpfCnpj, telefone, cep, email, rg, agencia, conta, chaveNfe,
};

/** Chave PIX antes de escolher o tipo: o campo fica desabilitado e aceita qualquer coisa. */
const TEXTO_LIVRE: TipoCampo = {
  mascarar: (t) => t,
  normalizar: (t) => t.trim(),
  validar: () => true,
  essencia: (t) => t.trim(),
  significativo: () => true,
  mensagem: "",
  inputMode: "text",
  placeholder: "",
};

export function campoDe(nome: NomeCampo | "chavePix", tipoPix?: TipoPix): TipoCampo {
  if (nome === "chavePix") return tipoPix ? campoPix(tipoPix) : TEXTO_LIVRE;
  return CAMPOS[nome];
}

export function mensagemDe(campo: TipoCampo, texto: string): string {
  return campo.motivo?.(texto) || campo.mensagem;
}

const alfanum = (s: string) => s.toLowerCase().replace(/[^0-9a-z@]/g, "");

/**
 * Texto do campo ao abrir: o válido aparece mascarado; o legado inválido aparece mascarado só se
 * a máscara não apagar nada do que estava gravado (senão a pessoa veria um campo vazio ou cortado).
 */
export function exibicaoInicial(campo: TipoCampo, valor: string): string {
  const m = campo.mascarar(valor);
  if (campo.validar(valor)) return m;
  return alfanum(m) === alfanum(valor) ? m : valor;
}

/**
 * Formas em que o mesmo valor pode estar gravado (formato padrão, legado só com dígitos, como
 * veio) — para buscas de duplicidade por igualdade enquanto o legado não foi normalizado.
 */
export function variantesDoValor(campo: TipoCampo, valor: string): string[] {
  return [...new Set([campo.normalizar(valor), campo.essencia(valor), valor.trim()])].filter(Boolean);
}
```

Run: `npx vitest run src/lib/campos` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/campos/bancarios.ts src/lib/campos/bancarios.test.ts src/lib/campos/chave-nfe.ts src/lib/campos/chave-nfe.test.ts src/lib/campos/chave-pix.ts src/lib/campos/chave-pix.test.ts src/lib/campos/index.ts src/lib/campos/index.test.ts src/modules/financeiro/lancamentos/baixa.ts src/modules/financeiro/lancamentos/baixa.test.ts
git commit -m "feat(campos): RG, agência, conta, chave NF-e e PIX no catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 4: Edição com cursor e backspace sobre pontuação

**Files:**
- Create: `src/lib/campos/edicao.ts`, `src/lib/campos/edicao.test.ts`

**Interfaces:**
- Consumes: `TipoCampo` (Task 1), `CAMPOS` (Task 3).
- Produces:
  - `type Edicao = { anterior: string; digitado: string; cursor: number; inputType?: string }`
  - `aplicarEdicao(campo: Pick<TipoCampo, "mascarar" | "significativo">, e: Edicao): { texto: string; cursor: number }`

- [ ] **Step 1: Testes (falhando)**

```ts
import { describe, expect, it } from "vitest";
import { CAMPOS } from "./index";
import { aplicarEdicao } from "./edicao";

const cpf = CAMPOS.cpf;
const tel = CAMPOS.telefone;

describe("aplicarEdicao", () => {
  it("digitando no fim, o cursor fica depois do último dígito (pulando a pontuação nova)", () => {
    expect(aplicarEdicao(cpf, { anterior: "123", digitado: "1234", cursor: 4 })).toEqual({ texto: "123.4", cursor: 5 });
  });
  it("digitando no meio, o cursor fica logo depois do dígito digitado", () => {
    expect(aplicarEdicao(cpf, { anterior: "123.456.789-09", digitado: "1203.456.789-09", cursor: 3 })).toEqual({
      texto: "120.345.678-90",
      cursor: 3,
    });
  });
  it("backspace logo depois da pontuação apaga o dígito anterior (não trava)", () => {
    expect(
      aplicarEdicao(cpf, { anterior: "123.456", digitado: "123456", cursor: 3, inputType: "deleteContentBackward" }),
    ).toEqual({ texto: "124.56", cursor: 2 });
  });
  it("delete logo antes da pontuação apaga o dígito seguinte", () => {
    expect(
      aplicarEdicao(cpf, { anterior: "123.456", digitado: "123456", cursor: 3, inputType: "deleteContentForward" }),
    ).toEqual({ texto: "123.56", cursor: 3 });
  });
  it("letra num CPF não entra e o cursor não anda", () => {
    expect(aplicarEdicao(cpf, { anterior: "123", digitado: "12a3", cursor: 3 })).toEqual({ texto: "123", cursor: 2 });
  });
  it("colar telefone com +55 no campo vazio formata e põe o cursor no fim", () => {
    const r = aplicarEdicao(tel, { anterior: "", digitado: "+55 81 99999-8888", cursor: 17 });
    expect(r.texto).toBe("(81) 99999-8888");
    expect(r.cursor).toBe(r.texto.length);
  });
  it("cursor no começo continua no começo", () => {
    expect(aplicarEdicao(tel, { anterior: "(81) 9", digitado: "(81) 9", cursor: 0 }).cursor).toBe(0);
  });
});
```

Run: `npx vitest run src/lib/campos/edicao.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

```ts
import type { TipoCampo } from "./tipo";

export type Edicao = {
  /** Texto do campo antes da tecla. */
  anterior: string;
  /** Texto que o navegador montou depois da tecla (ainda sem máscara). */
  digitado: string;
  /** Posição do cursor no `digitado`. */
  cursor: number;
  /** `InputEvent.inputType` — distingue backspace de delete. */
  inputType?: string;
};

type Campo = Pick<TipoCampo, "mascarar" | "significativo">;

const contar = (s: string, sig: (c: string) => boolean) => [...s].filter(sig).length;

/** Índice logo depois do n-ésimo caractere significativo do texto mascarado. */
function posicaoNoMascarado(texto: string, n: number, sig: (c: string) => boolean): number {
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (sig(texto[i]) && ++vistos === n) return i + 1;
  }
  return texto.length;
}

/**
 * Aplica a máscara a uma edição e diz onde o cursor fica. O cursor é contado em caracteres
 * significativos (dígitos, no CPF), não em posição: a pontuação que a máscara põe ou tira não o
 * empurra. Apagar só pontuação não mudaria nada (a máscara a recolocaria e o backspace "travaria"),
 * então leva junto o caractere vizinho.
 */
export function aplicarEdicao(campo: Campo, e: Edicao): { texto: string; cursor: number } {
  const sig = campo.significativo;
  let { digitado, cursor } = e;
  const soPontuacao = digitado.length < e.anterior.length && contar(digitado, sig) === contar(e.anterior, sig);
  if (soPontuacao && e.inputType === "deleteContentBackward") {
    let i = cursor - 1;
    while (i >= 0 && !sig(digitado[i])) i--;
    if (i >= 0) {
      digitado = digitado.slice(0, i) + digitado.slice(i + 1);
      cursor = i;
    }
  } else if (soPontuacao && e.inputType === "deleteContentForward") {
    let i = cursor;
    while (i < digitado.length && !sig(digitado[i])) i++;
    if (i < digitado.length) digitado = digitado.slice(0, i) + digitado.slice(i + 1);
  }
  const texto = campo.mascarar(digitado);
  return { texto, cursor: posicaoNoMascarado(texto, contar(digitado.slice(0, cursor), sig), sig) };
}
```

Nota sobre o caso "letra num CPF": `digitado = "12a3"`, cursor 3 (depois do `a`); significativos antes do cursor = 2 → cursor 2 no texto `"123"`. É o lugar onde a pessoa estava antes de apertar a letra.

Run: `npx vitest run src/lib/campos/edicao.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campos/edicao.ts src/lib/campos/edicao.test.ts
git commit -m "feat(campos): máscara durante a edição com cursor estável e backspace sobre pontuação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 5: `ActionError` com campos

**Files:**
- Modify: `src/lib/action-error.ts`, `src/lib/with-action.ts:126-135`
- Create: `src/lib/action-error.test.ts` (se já existir, acrescentar o `describe`)

**Interfaces:**
- Produces: `new ActionError(message: string, campos?: Record<string, string>)`, `err.campos`, `fieldErrorsDoErro(err: unknown): Record<string, string[]> | undefined`.

- [ ] **Step 1: Conferir que ninguém estende `ActionError`**

Run: `npx rg -n "extends ActionError|new ActionError\([^)]*,[^)]*\)" src --glob "!src/generated/**"`
Expected: nenhuma saída. Se houver, ler o caso antes de seguir (o segundo argumento passaria a ter significado).

- [ ] **Step 2: Teste (falhando)**

```ts
import { describe, expect, it } from "vitest";
import { ActionError, fieldErrorsDoErro, resultadoDoErro } from "./action-error";

describe("fieldErrorsDoErro", () => {
  it("devolve o mapa por campo no formato do Zod", () => {
    const err = new ActionError("CPF inválido.", { cpf: "CPF inválido.", telefone: "Telefone inválido." });
    expect(fieldErrorsDoErro(err)).toEqual({ cpf: ["CPF inválido."], telefone: ["Telefone inválido."] });
  });
  it("sem campos, ou erro que não é ActionError, não devolve nada", () => {
    expect(fieldErrorsDoErro(new ActionError("x"))).toBeUndefined();
    expect(fieldErrorsDoErro(new ActionError("x", {}))).toBeUndefined();
    expect(fieldErrorsDoErro(new Error("x"))).toBeUndefined();
  });
  it("continua sendo rejeição de regra para a auditoria", () => {
    expect(resultadoDoErro(new ActionError("x", { a: "b" }))).toBe("rejeitado");
  });
});
```

Run: `npx vitest run src/lib/action-error.test.ts` → FAIL (`fieldErrorsDoErro` não existe).

- [ ] **Step 3: Implementar em `action-error.ts`**

Trocar `export class ActionError extends Error {}` por:

```ts
/** Erro de negócio cuja mensagem pode ser exibida ao usuário. */
export class ActionError extends Error {
  /** Mensagem por campo (chave do schema): volta em `fieldErrors` e aparece sob o campo. */
  readonly campos?: Record<string, string>;
  constructor(message: string, campos?: Record<string, string>) {
    super(message);
    this.campos = campos;
  }
}

/** `campos` de um `ActionError` no formato `fieldErrors` do Zod; `undefined` quando não há. */
export function fieldErrorsDoErro(err: unknown): Record<string, string[]> | undefined {
  if (!(err instanceof ActionError) || !err.campos) return undefined;
  const entradas = Object.entries(err.campos).map(([k, v]) => [k, [v]] as const);
  return entradas.length ? Object.fromEntries(entradas) : undefined;
}
```

- [ ] **Step 4: `with-action.ts` devolve o mapa**

Em `src/lib/with-action.ts`, ajustar o import da linha 7 para `import { ActionError, fieldErrorsDoErro, resultadoDoErro } from "@/lib/action-error";` e, no `catch` (linhas ~126–135), trocar:

```ts
      return { ok: false, error: message };
```

por:

```ts
      const fieldErrors = fieldErrorsDoErro(err);
      return fieldErrors ? { ok: false, error: message, fieldErrors } : { ok: false, error: message };
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/lib/action-error.test.ts src/lib/audit.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/action-error.ts src/lib/action-error.test.ts src/lib/with-action.ts
git commit -m "feat(actions): ActionError pode apontar o campo com erro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 6: Helpers Zod e "só valida o que mudou"

**Files:**
- Create: `src/lib/campos/zod.ts`, `src/lib/campos/zod.test.ts`, `src/lib/campos/exigir.ts`, `src/lib/campos/exigir.test.ts`

**Interfaces:**
- Consumes: `CAMPOS`, `NomeCampo`, `mensagemDe` (Task 3), `ActionError` com campos (Task 5).
- Produces:
  - `type OpcoesCampo = { obrigatorio?: boolean; legado?: boolean; mensagemObrigatorio?: string }`
  - `campo.cpf(o?) … campo.chaveNfe(o?)` — um por `NomeCampo`; `campoZod(tipo: TipoCampo, o?)`.
  - `exigirCamposValidos(novo: Record<string, unknown>, antes: Record<string, unknown> | null | undefined, mapa: Record<string, NomeCampo>): void`

- [ ] **Step 1: Testes do Zod (falhando)**

`src/lib/campos/zod.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { campo } from "./zod";

const s = z.object({ cpf: campo.cpf(), tel: campo.telefone({ obrigatorio: true }), doc: campo.cpfCnpj({ legado: true }) });

describe("campo.<tipo>()", () => {
  it("normaliza o válido para o formato padrão", () => {
    const r = s.parse({ cpf: "52998224725", tel: "81999998888", doc: "11222333000181" });
    expect(r).toEqual({ cpf: "529.982.247-25", tel: "(81) 99999-8888", doc: "11.222.333/0001-81" });
  });
  it("estrito recusa o inválido com a mensagem do catálogo, no campo", () => {
    const r = s.safeParse({ cpf: "123", tel: "81999998888" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.cpf).toEqual(["CPF inválido. Confira os 11 dígitos."]);
  });
  it("legado deixa passar o inválido sem mexer", () => {
    expect(s.parse({ tel: "81999998888", doc: " 123 " }).doc).toBe("123");
  });
  it("opcional: ausente fica ausente e vazio fica vazio (limpar o campo)", () => {
    const r = s.parse({ tel: "81999998888" });
    expect(r.cpf).toBeUndefined();
    expect(s.parse({ tel: "81999998888", cpf: "   " }).cpf).toBe("");
  });
  it("obrigatório recusa vazio", () => {
    const r = s.safeParse({ tel: "" });
    expect(r.error?.flatten().fieldErrors.tel).toEqual(["Campo obrigatório."]);
  });
});
```

Run: `npx vitest run src/lib/campos/zod.test.ts` → FAIL.

- [ ] **Step 2: Implementar `zod.ts`**

```ts
import { z } from "zod";
import { CAMPOS, mensagemDe, type NomeCampo, type TipoCampo } from "./index";

export type OpcoesCampo = {
  obrigatorio?: boolean;
  /** Schema de edição: o inválido passa sem mexer; a action decide com `exigirCamposValidos`. */
  legado?: boolean;
  mensagemObrigatorio?: string;
};

/**
 * Campo com formato no schema da action: apara, recusa o inválido (salvo `legado`) com a mesma
 * frase da tela e grava o formato padrão. `""` continua `""` (limpar o campo); ausente continua
 * ausente.
 */
export function campoZod(tipo: TipoCampo, o: OpcoesCampo = {}) {
  const { obrigatorio = false, legado = false, mensagemObrigatorio = "Campo obrigatório." } = o;
  const s = z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v === "") {
        if (obrigatorio) ctx.addIssue({ code: "custom", message: mensagemObrigatorio });
        return;
      }
      if (!legado && !tipo.validar(v)) ctx.addIssue({ code: "custom", message: mensagemDe(tipo, v) });
    })
    .transform((v) => (v === "" ? v : tipo.normalizar(v)));
  return obrigatorio ? s : s.optional();
}

type Fabrica = (o?: OpcoesCampo) => ReturnType<typeof campoZod>;

export const campo = Object.fromEntries(
  (Object.keys(CAMPOS) as NomeCampo[]).map((nome) => [nome, (o?: OpcoesCampo) => campoZod(CAMPOS[nome], o)]),
) as Record<NomeCampo, Fabrica>;
```

Se o TypeScript reclamar do tipo de retorno (`ZodOptional` × `ZodPipe`), declarar as duas sobrecargas de `campoZod` (`o: OpcoesCampo & { obrigatorio: true }` → sem `.optional()`), sem `any`.

Run: `npx vitest run src/lib/campos/zod.test.ts` → PASS.

- [ ] **Step 3: Testes de `exigirCamposValidos` (falhando)**

`src/lib/campos/exigir.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import { exigirCamposValidos } from "./exigir";

const mapa = { documento: "cpfCnpj", telefone: "telefone" } as const;

function erro(fn: () => void): ActionError | undefined {
  try {
    fn();
  } catch (e) {
    return e as ActionError;
  }
  return undefined;
}

describe("exigirCamposValidos", () => {
  it("válido passa", () => {
    expect(erro(() => exigirCamposValidos({ documento: "529.982.247-25" }, null, mapa))).toBeUndefined();
  });
  it("vazio passa", () => {
    expect(erro(() => exigirCamposValidos({ documento: "", telefone: undefined }, null, mapa))).toBeUndefined();
  });
  it("inválido igual ao gravado passa, mesmo com outra pontuação", () => {
    expect(erro(() => exigirCamposValidos({ documento: "123.456.789-00" }, { documento: "12345678900" }, mapa))).toBeUndefined();
  });
  it("inválido diferente do gravado é recusado, no campo", () => {
    const e = erro(() => exigirCamposValidos({ documento: "123.456.789-01" }, { documento: "12345678900" }, mapa));
    expect(e).toBeInstanceOf(ActionError);
    expect(e?.campos).toEqual({ documento: "CPF ou CNPJ inválido. Confira os dígitos." });
  });
  it("inválido sem registro anterior (criar) é recusado", () => {
    expect(erro(() => exigirCamposValidos({ telefone: "123" }, null, mapa))?.campos).toHaveProperty("telefone");
  });
  it("lixo diferente com a mesma essência vazia não passa por 'igual'", () => {
    expect(erro(() => exigirCamposValidos({ documento: "xyz" }, { documento: "abc" }, mapa))).toBeInstanceOf(ActionError);
  });
});
```

Run → FAIL.

- [ ] **Step 4: Implementar `exigir.ts`**

```ts
import { ActionError } from "@/lib/action-error";
import { CAMPOS, mensagemDe, type NomeCampo } from "./index";

/**
 * Regra de edição (spec D4): o inválido que já estava gravado passa; o inválido novo é recusado
 * com a mensagem no campo. "Igual" = mesmo texto, ou mesma essência não vazia (o legado
 * `12345678900` exibido como `123.456.789-00` pela máscara conta como não mexido).
 *
 * Uso no handler de uma action de editar, com o schema em `campo.x({ legado: true })`:
 *   const antes = await prisma.cliente.findUnique({ where: { id: i.id }, select: { documento: true } });
 *   exigirCamposValidos(i, antes, { documento: "cpfCnpj" });
 */
export function exigirCamposValidos(
  novo: Record<string, unknown>,
  antes: Record<string, unknown> | null | undefined,
  mapa: Record<string, NomeCampo>,
): void {
  const campos: Record<string, string> = {};
  for (const [chave, nome] of Object.entries(mapa)) {
    const v = novo[chave];
    if (typeof v !== "string" || v.trim() === "") continue;
    const tipo = CAMPOS[nome];
    if (tipo.validar(v)) continue;
    const gravado = antes?.[chave];
    if (typeof gravado === "string") {
      if (gravado.trim() === v.trim()) continue;
      const e = tipo.essencia(v);
      if (e !== "" && e === tipo.essencia(gravado)) continue;
    }
    campos[chave] = mensagemDe(tipo, v);
  }
  const primeira = Object.values(campos)[0];
  if (primeira) throw new ActionError(primeira, campos);
}
```

Run: `npx vitest run src/lib/campos` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/campos/zod.ts src/lib/campos/zod.test.ts src/lib/campos/exigir.ts src/lib/campos/exigir.test.ts
git commit -m "feat(campos): helpers Zod e regra de edição que só valida o que mudou

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 7: Componente `InputFormatado` + telas do RH que já tinham máscara

**Files:**
- Create: `src/components/ui/input-formatado.tsx`
- Modify: `src/components/rh/wizard-cadastro-funcionario.tsx:9,198,199,231,247,248,249,260,261`, `src/components/rh/editar-cadastro-dialog.tsx:8,115,118,135,146,147,148`, `src/components/rh/dependente-dialog.tsx:7,92`, `src/components/rh/pessoas-juridicas-view.tsx:16,170,171,175`, `src/lib/utils.ts:77-109`

**Interfaces:**
- Consumes: `campoDe`, `exibicaoInicial`, `mensagemDe`, `NomeCampo` (Task 3), `aplicarEdicao` (Task 4), `FieldError`/`idDoErro` (`components/ui/field-error.tsx`), `Input` (`components/ui/input.tsx`).
- Produces: `<InputFormatado tipo value|defaultValue onChange? erro? tipoPix? id? name? ... />` — `onChange(valor: string)` recebe o texto mascarado.

- [ ] **Step 1: Criar o componente**

`src/components/ui/input-formatado.tsx`:

```tsx
"use client";

import * as React from "react";

import { FieldError, idDoErro } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { campoDe, exibicaoInicial, mensagemDe, type NomeCampo } from "@/lib/campos";
import { aplicarEdicao } from "@/lib/campos/edicao";
import type { TipoPix } from "@/modules/rh/contas/pix";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "maxLength"
> & {
  tipo: NomeCampo | "chavePix";
  /** Só com `tipo="chavePix"`. Vazio = campo de texto livre (o tipo ainda não foi escolhido). */
  tipoPix?: TipoPix | "";
  /** Modo controlado. Para FormData, use `name` + `defaultValue`. */
  value?: string | null;
  defaultValue?: string | null;
  /** Recebe o texto já mascarado — é o formato gravado. */
  onChange?: (valor: string) => void;
  /** Erro vindo do servidor (`useFieldErrors().erros.x`); vence a validação local. */
  erro?: string;
};

/**
 * Campo com formato conhecido (CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX,
 * chave NF-e). Máscara durante a digitação com o cursor estável, validação ao sair do campo e a
 * mensagem logo abaixo. A regra é a do catálogo `lib/campos/`, a mesma do schema da action.
 *
 * Não decide obrigatoriedade (vazio é válido) nem bloqueia o envio: o servidor recusa.
 * `type="text"` sempre: em `type="email"` o navegador não expõe o cursor, e a máscara precisa dele.
 */
function InputFormatado({ tipo, tipoPix, value, defaultValue, onChange, onBlur, erro, id, placeholder, ...props }: Props) {
  const campo = campoDe(tipo, tipoPix || undefined);
  const idGerado = React.useId();
  const idCampo = id ?? idGerado;
  const ref = React.useRef<HTMLInputElement>(null);
  const cursorPendente = React.useRef<number | null>(null);
  const controlado = value !== undefined;
  const [interno, setInterno] = React.useState(() => exibicaoInicial(campo, defaultValue ?? ""));
  const [erroLocal, setErroLocal] = React.useState<string>();
  const texto = controlado ? exibicaoInicial(campo, value ?? "") : interno;

  React.useLayoutEffect(() => {
    const el = ref.current;
    const pos = cursorPendente.current;
    cursorPendente.current = null;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  function aoMudar(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const r = aplicarEdicao(campo, {
      anterior: texto,
      digitado: el.value,
      cursor: el.selectionStart ?? el.value.length,
      inputType: (e.nativeEvent as InputEvent).inputType,
    });
    cursorPendente.current = r.cursor;
    // Tecla recusada (letra num CPF): o texto não muda, não há render, e o React devolve o valor
    // antigo ao campo jogando o cursor para o fim. Recoloca no lugar.
    if (r.texto === texto) requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
    if (!controlado) setInterno(r.texto);
    setErroLocal(undefined);
    onChange?.(r.texto);
  }

  function aoSair(e: React.FocusEvent<HTMLInputElement>) {
    const v = e.target.value;
    setErroLocal(campo.validar(v) ? undefined : mensagemDe(campo, v));
    onBlur?.(e);
  }

  const mensagem = erro || erroLocal;
  return (
    <>
      <Input
        {...props}
        ref={ref}
        id={idCampo}
        type="text"
        inputMode={campo.inputMode}
        autoComplete={props.autoComplete ?? campo.autoComplete}
        placeholder={placeholder ?? campo.placeholder}
        value={texto}
        onChange={aoMudar}
        onBlur={aoSair}
        aria-invalid={mensagem ? true : undefined}
        aria-describedby={mensagem ? idDoErro(idCampo) : props["aria-describedby"]}
      />
      <FieldError campo={idCampo} mensagem={mensagem} />
    </>
  );
}

export { InputFormatado };
```

Regras de uso (repetir no CLAUDE.md na Task 14):
- Formulário com `useFieldErrors`: passe `id={...}` e `erro={fe.erros.x}`; **não** espalhe `{...fe.campo("x")}` (o componente já põe `aria-invalid`/`aria-describedby`) e **remova** o `<FieldError>` do pai para esse campo (senão a mensagem sai duas vezes).
- Busca de CEP: passe o `onBlur` da tela; o componente o chama depois de validar.

- [ ] **Step 2: Migrar o wizard do RH**

Em `src/components/rh/wizard-cadastro-funcionario.tsx`:
- linha 9: trocar `import { maskCpf, maskTelefone, maskCep } from "@/lib/utils";` por `import { InputFormatado } from "@/components/ui/input-formatado";`
- linha 185 (e-mail de acesso): manter `<Input type="email" …>` e acrescentar o comentário na linha anterior: `{/* campo-ok: e-mail de login (better-auth) */}`
- substituir cada campo:

```tsx
<Campo label="CPF"><InputFormatado tipo="cpf" value={f.cpf} onChange={(v) => set("cpf", v)} /></Campo>
<Campo label="RG"><InputFormatado tipo="rg" value={f.rg} onChange={(v) => set("rg", v)} /></Campo>
<InputFormatado tipo="cep" value={f.enderecoCep} onChange={(v) => set("enderecoCep", v)} onBlur={onCepBlur} />
<Campo label="Telefone"><InputFormatado tipo="telefone" value={f.telefone} onChange={(v) => set("telefone", v)} /></Campo>
<Campo label="E-mail pessoal"><InputFormatado tipo="email" value={f.emailPessoal} onChange={(v) => set("emailPessoal", v)} /></Campo>
<Campo label="Tel. emergência"><InputFormatado tipo="telefone" value={f.telefoneEmergencia} onChange={(v) => set("telefoneEmergencia", v)} /></Campo>
<Campo label="Agência"><InputFormatado tipo="agencia" value={f.agencia} onChange={(v) => set("agencia", v)} /></Campo>
<Campo label="Conta"><InputFormatado tipo="conta" value={f.conta} onChange={(v) => set("conta", v)} /></Campo>
```

Conferir: `onCepBlur` lê `f.enderecoCep` (já mascarado) — `buscarCep` aceita com hífen (`cepRaw.replace(/\D/g, "")`).

- [ ] **Step 3: Migrar `editar-cadastro-dialog.tsx`, `dependente-dialog.tsx`, `pessoas-juridicas-view.tsx`**

`editar-cadastro-dialog.tsx`: linha 8 → `import { InputFormatado } from "@/components/ui/input-formatado";`; linhas 115/118/135/146/147/148 → mesmos trechos do Step 2 para CPF, RG, CEP (com `onBlur={onCepBlur}`), Telefone, E-mail pessoal, Tel. emergência.

`dependente-dialog.tsx`: linha 7 → import do `InputFormatado`; linha 92 →

```tsx
<InputFormatado tipo="cpf" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
```

`pessoas-juridicas-view.tsx`: linha 16 → import; linhas 170/171/175 →

```tsx
<Campo label="CNPJ *"><InputFormatado tipo="cnpj" value={dlg.cnpj} onChange={(v) => setDlg({ ...dlg, cnpj: v })} /></Campo>
<Campo label="Telefone"><InputFormatado tipo="telefone" value={dlg.telefone} onChange={(v) => setDlg({ ...dlg, telefone: v })} /></Campo>
<Campo label="E-mail"><InputFormatado tipo="email" value={dlg.email} onChange={(v) => setDlg({ ...dlg, email: v })} /></Campo>
```

- [ ] **Step 4: Remover os `mask*` de `utils.ts`**

Apagar `maskCpf`, `maskTelefone`, `maskCep`, `maskCnpj` e seus comentários (`src/lib/utils.ts:76-109`).

Run: `npx rg -n "maskCpf|maskTelefone|maskCep|maskCnpj" src`
Expected: nenhuma saída.

- [ ] **Step 5: Lint + testes**

Run: `npx eslint src/components/ui/input-formatado.tsx src/components/rh src/lib/utils.ts src/lib/campos` e `npm test`
Expected: sem erros novos; testes verdes.

- [ ] **Step 6: Conferir no navegador**

Com `npm run dev -- -p 3001` no ar, em `/rh/pessoas` → Nova pessoa (wizard) e Editar cadastro:
1. CPF: digitar `52998224725` → `529.982.247-25`; pôr o cursor no meio e digitar → cursor fica no lugar; backspace logo depois do `.` apaga o dígito.
2. Colar `+55 (81) 9 9999-8888` no telefone → `(81) 99999-8888`.
3. CPF `123` e sair do campo → borda vermelha + "CPF inválido. Confira os 11 dígitos." abaixo; digitar de novo → mensagem some.
4. CEP: `01310100` + sair → endereço preenchido.
5. Celular (390×844): teclado numérico em CPF/CEP, telefone em telefone; `document.documentElement.scrollWidth === 390`.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/input-formatado.tsx src/components/rh/wizard-cadastro-funcionario.tsx src/components/rh/editar-cadastro-dialog.tsx src/components/rh/dependente-dialog.tsx src/components/rh/pessoas-juridicas-view.tsx src/lib/utils.ts
git commit -m "feat(ui): InputFormatado com máscara e validação; RH passa a usar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 8: Teste-guarda com lista de pendentes

**Files:**
- Create: `src/lib/campos/guarda-campos.test.ts`
- Modify: arquivos com falso positivo (comentário `campo-ok:`)

**Interfaces:**
- Produces: `inputsCrus(src: string): number[]`, `schemasCrus(src: string): number[]` (exportados pelo teste, como em `context-menu.test.ts`), constante `PENDENTES` que as Tarefas 9–13 encolhem e a Tarefa 14 zera.

- [ ] **Step 1: Escrever o guarda com os detectores e testes dos detectores**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da regra de campos com formato (spec 2026-10-04, ADR-0010): campo de CPF, CNPJ,
 * telefone, CEP, e-mail, RG, agência, conta, chave PIX ou chave NF-e usa `InputFormatado` na
 * tela e `campo.<tipo>()` no schema. Exceção só com `campo-ok: <motivo>` no trecho ou na linha
 * anterior (ex.: busca que aceita CPF parcial, e-mail de login).
 */

const SRC = path.resolve(__dirname, "../..");
const NOMES = "cpf|cnpj|documento|telefone|telefoneEmergencia|cep|enderecoCep|rg|agencia|conta|pixChave|chaveNfe|email|emailPessoal";

const ALVO_INPUT = new RegExp(`\\bname="(${NOMES})"|\\b(?:value|defaultValue)=\\{[\\w.?]*?\\b(${NOMES})\\b[^}]*\\}`);
const ALVO_SCHEMA = new RegExp(`^\\s*(${NOMES})\\s*:\\s*(opt\\()?z\\.`, "gm");

const linhaDe = (src: string, indice: number) => src.slice(0, indice).split("\n").length;
const linhaAnterior = (src: string, indice: number) => {
  const inicio = src.lastIndexOf("\n", indice - 1);
  return src.slice(src.lastIndexOf("\n", inicio - 1) + 1, Math.max(inicio, 0));
};

/** `<Input …/>` (não `InputFormatado`/`InputMoeda`) que recebe um campo do catálogo. */
export function inputsCrus(src: string): number[] {
  const re = /<Input\b[\s\S]*?\/>/g;
  const linhas: number[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (!ALVO_INPUT.test(m[0])) continue;
    if (m[0].includes("campo-ok:") || linhaAnterior(src, m.index).includes("campo-ok:")) continue;
    linhas.push(linhaDe(src, m.index));
  }
  return linhas;
}

/** Chave de schema com nome de campo do catálogo declarada com `z.` cru. */
export function schemasCrus(src: string): number[] {
  const linhas: number[] = [];
  for (let m = ALVO_SCHEMA.exec(src); m; m = ALVO_SCHEMA.exec(src)) {
    const fim = src.indexOf("\n", m.index);
    const linha = src.slice(m.index, fim === -1 ? undefined : fim);
    if (linha.includes("campo-ok:") || linhaAnterior(src, m.index + 1).includes("campo-ok:")) continue;
    linhas.push(linhaDe(src, m.index + (m[0].length - m[0].trimStart().length)));
  }
  return linhas;
}

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" ? [] : arquivos(p);
    if (/\.test\.tsx?$/.test(p)) return [];
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

function violacoes(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of arquivos(SRC)) {
    const rel = path.relative(SRC, p).split(path.sep).join("/");
    const src = readFileSync(p, "utf8");
    let n = p.endsWith(".tsx") ? inputsCrus(src).length : 0;
    if (/^modules\/.*(schemas?|actions)\.ts$/.test(rel)) n += schemasCrus(src).length;
    if (n) r[rel] = n;
  }
  return r;
}

/**
 * Arquivos que ainda não migraram (Tarefas 9–13 do plano 2026-10-05). Só ENCOLHE: corrigir um
 * arquivo exige tirá-lo daqui, e arquivo novo com campo cru reprova na hora. Vazia na Tarefa 14.
 */
const PENDENTES: Record<string, number> = {
  // preenchido no Step 3
};

describe("campos com formato usam o catálogo", () => {
  it("detector de <Input> acha campo do catálogo e ignora o resto", () => {
    expect(inputsCrus(`<Input value={f.cpf} onChange={x} />`)).toEqual([1]);
    expect(inputsCrus(`<Input\n  value={form.documento ?? ""}\n  onChange={x}\n/>`)).toEqual([1]);
    expect(inputsCrus(`<Input name="telefone" />`)).toEqual([1]);
    expect(inputsCrus(`<Input value={cpf} />`)).toEqual([1]);
    expect(inputsCrus(`<Input value={docNome} />`)).toEqual([]);
    expect(inputsCrus(`<Input value={form.contaId} />`)).toEqual([]);
    expect(inputsCrus(`<InputFormatado tipo="cpf" value={f.cpf} />`)).toEqual([]);
    expect(inputsCrus(`{/* campo-ok: login */}\n<Input value={f.email} />`)).toEqual([]);
  });
  it("detector de schema acha z. cru e aceita campo. e campo-ok", () => {
    expect(schemasCrus(`  cpf: opt(z.string()),`)).toEqual([1]);
    expect(schemasCrus(`a\n  telefone: z.string().optional(),`)).toEqual([2]);
    expect(schemasCrus(`  cpf: campo.cpf(),`)).toEqual([]);
    expect(schemasCrus(`  email: z.string().email(), // campo-ok: e-mail de login`)).toEqual([]);
  });
  it("nenhum campo cru fora da lista de pendentes, e a lista não fica velha", () => {
    expect(violacoes()).toEqual(PENDENTES);
  });
});
```

- [ ] **Step 2: Rodar e ler as violações atuais**

Run: `npx vitest run src/lib/campos/guarda-campos.test.ts`
Expected: os dois primeiros `it` PASSAM; o terceiro FALHA mostrando o objeto de violações encontradas.

- [ ] **Step 3: Separar falso positivo de pendente**

Para cada arquivo do diff:
- **Falso positivo** (a chave não é um dos campos do catálogo — ex.: `documento: z.object(...)` de upload, `conta: z.string()` que é o NOME de uma conta, busca/filtro que aceita parte do valor) → acrescentar `// campo-ok: <motivo curto>` na linha (ou `{/* campo-ok: … */}` antes do `<Input>`).
- **E-mail de login** (`login-form.tsx`, `recuperar-senha-dialog.tsx`, `usuarios-view.tsx` e-mail do usuário, `wizard` e-mail de acesso, `preferencias-view.tsx` e-mail do perfil desabilitado, `solicitar-cadastro` e-mail, `usuarios/schemas.ts` `email`, `rh/funcionarios/actions.ts` `email` de acesso, `auth/cadastro/actions.ts` `email`) → `campo-ok: e-mail de login (better-auth)`.
- **PIX no schema** (`rh/contas/actions.ts` `pixChave`) → `campo-ok: validada no handler por validarChavePix (depende de pixTipo)`.
- **Resto** → entra em `PENDENTES` com a contagem exata mostrada pelo teste.

Rodar de novo até o teste passar.

- [ ] **Step 4: Commit**

```bash
git add src/lib/campos/guarda-campos.test.ts <arquivos que receberam campo-ok>
git commit -m "test(campos): guarda reprova campo com formato fora do catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Padrão das Tarefas 9 a 13 (repetido em cada uma)

Para cada arquivo da tarefa:

**Tela (modo controlado):**
```tsx
// antes
<Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
// depois
<InputFormatado tipo="telefone" value={form.telefone} onChange={(v) => set("telefone", v)} />
```
`value={x ?? ""}` vira `value={x}` (o componente aceita `null`). Atributos que o componente já define (`type="email"`, `inputMode`, `placeholder` genérico) saem; `placeholder` específico da tela fica.

**Tela (FormData):** `<Input name="cep" defaultValue={c.cep} />` → `<InputFormatado tipo="cep" name="cep" defaultValue={c.cep} />`.

**Schema de criar:** `telefone: z.string().optional()` / `opt(z.string())` → `telefone: campo.telefone()`; `z.string().email("…").optional().or(z.literal(""))` → `campo.email()`; obrigatório → `campo.x({ obrigatorio: true, mensagemObrigatorio: "<a frase que já existia>" })`. Import: `import { campo } from "@/lib/campos/zod";`. Remover `refine` que validava o mesmo campo (ex.: `docValido`).

**Schema de editar:** mesmos campos com `{ legado: true }`. Quando o schema de editar é `criar.extend({ id })` ou espalha a mesma `base`, separar os campos com formato numa função `camposComFormato(legado: boolean)` e espalhar `...camposComFormato(false)` no criar e `...camposComFormato(true)` no editar.

**Handler de editar:**
```ts
import { exigirCamposValidos } from "@/lib/campos/exigir";
// primeira coisa do handler, antes de qualquer escrita:
const antes = await prisma.<modelo>.findUnique({ where: { id: i.id }, select: { <colunas do mapa>: true } });
exigirCamposValidos(i, antes, { <chave do input>: "<NomeCampo>" });
```
(`i` = nome do parâmetro de input do handler; usar o nome que o arquivo já usa.)

**Gravação:** o valor que sai do schema já está no formato padrão — o handler grava como recebe (`i.telefone || null`). Não chamar `soDigitos`/`trim` de novo em cima.

**Guarda:** tirar de `PENDENTES` cada arquivo migrado; `npx vitest run src/lib/campos/guarda-campos.test.ts` passa.

**Conferência em tela** (Global Constraints) para cada formulário tocado, incluindo **editar um registro com valor inválido gravado** (criar um pelo banco de dev, ex.: `UPDATE "Cliente" SET documento = '123' WHERE id = '<id>'`): salvar sem mexer → salva; trocar para outro inválido → mensagem no campo.

---

### Task 9: RH — servidor, PJ, contas bancárias e PIX

**Files:**
- Modify: `src/modules/rh/funcionarios/actions.ts:36-66` (cadastrar), `:217-237` (editar), `:~300` (`dependenteCampos`), `:309-355` (adicionar/editar dependente)
- Modify: `src/modules/rh/pessoas-juridicas/actions.ts:13-60`
- Modify: `src/modules/rh/contas/actions.ts:~120-140` (schemas de criar/editar/propor conta)
- Modify: `src/components/rh/proposta-conta-dialog.tsx:90,94,111`, `src/components/rh/contas-bancarias-editor.tsx:216,220,239`
- Modify: `src/lib/campos/guarda-campos.test.ts` (`PENDENTES`)

**Interfaces:**
- Consumes: `campo` (Task 6), `exigirCamposValidos` (Task 6), `InputFormatado` (Task 7), `variantesDoValor`, `CAMPOS` (Task 3).

- [ ] **Step 1: Funcionários**

`cadastrarFuncionarioSchema` (estrito): `cpf: campo.cpf()`, `rg: campo.rg()`, `enderecoCep: campo.cep()`, `telefone: campo.telefone()`, `telefoneEmergencia: campo.telefone()`, `emailPessoal: campo.email()`, `agencia: campo.agencia()`, `conta: campo.conta()`. `email` de acesso fica com `// campo-ok: e-mail de login (better-auth)`.

`editarCadastroSchema`: os mesmos com `{ legado: true }`; no handler de `editarCadastroFuncionario`:

```ts
const antes = await prisma.user.findUnique({
  where: { id: i.userId },
  select: { cpf: true, rg: true, enderecoCep: true, telefone: true, telefoneEmergencia: true, emailPessoal: true },
});
exigirCamposValidos(i, antes, {
  cpf: "cpf", rg: "rg", enderecoCep: "cep", telefone: "telefone", telefoneEmergencia: "telefone", emailPessoal: "email",
});
```

(Conferir o nome da chave do id no schema — `userId` ou `id` — e usar a mesma.)

Dependente: separar `dependenteCampos` em `{ ...dependenteBase, cpf: campo.cpf() }` (adicionar) e `{ ...dependenteBase, cpf: campo.cpf({ legado: true }) }` (editar); em `editarDependente`:

```ts
const antes = await prisma.dependente.findUnique({ where: { id: i.id }, select: { cpf: true } });
exigirCamposValidos(i, antes, { cpf: "cpf" });
```

- [ ] **Step 2: Pessoa jurídica (CNPJ único)**

```ts
const pjSchema = z.object({
  cnpj: campo.cnpj({ obrigatorio: true, mensagemObrigatorio: "Informe o CNPJ." }),
  razaoSocial: z.string().min(1, "Informe a razão social."),
  nomeFantasia: opt(z.string()),
  email: campo.email(),
  telefone: campo.telefone(),
});
const pjEditarSchema = pjSchema.extend({
  id: z.string().min(1),
  cnpj: campo.cnpj({ obrigatorio: true, legado: true, mensagemObrigatorio: "Informe o CNPJ." }),
  email: campo.email({ legado: true }),
  telefone: campo.telefone({ legado: true }),
});
```

Duplicidade nos dois handlers (o legado pode estar só com dígitos):

```ts
const cnpj = i.cnpj; // já normalizado pelo schema
const existente = await prisma.pessoaJuridica.findFirst({
  where: { cnpj: { in: variantesDoValor(CAMPOS.cnpj, cnpj) } },
  select: { id: true },
});
```

Criar: `if (existente) throw new ActionError("Já existe uma PJ com esse CNPJ.", { cnpj: "Já existe uma PJ com esse CNPJ." });`. Editar: antes da checagem, `exigirCamposValidos(i, antesDaPj, { cnpj: "cnpj", email: "email", telefone: "telefone" })` com `antesDaPj = await prisma.pessoaJuridica.findUnique({ where: { id: i.id }, select: { cnpj: true, email: true, telefone: true } })`; depois `if (existente && existente.id !== i.id) throw new ActionError("CNPJ já usado por outra PJ.", { cnpj: "CNPJ já usado por outra PJ." });`. Remover os `i.cnpj.trim()`.

- [ ] **Step 3: Contas bancárias do colaborador**

Schemas de criar e propor: `agencia: campo.agencia()`, `conta: campo.conta()`; editar: `{ legado: true }` + `exigirCamposValidos(i, antes, { agencia: "agencia", conta: "conta" })` com `antes = await prisma.contaBancariaColaborador.findUnique({ where: { id: i.id }, select: { agencia: true, conta: true } })`. `pixChave` fica `opt(z.string())` com `campo-ok` (Task 8) — a validação por `validarChavePix` no handler continua.

Telas:

```tsx
// proposta-conta-dialog.tsx
<InputFormatado tipo="agencia" value={f.agencia} onChange={(v) => setF({ ...f, agencia: v })} />
<InputFormatado tipo="conta" value={f.conta} onChange={(v) => setF({ ...f, conta: v })} />
<InputFormatado tipo="chavePix" tipoPix={f.pixTipo as TipoPix | ""} value={f.pixChave} disabled={!f.pixTipo} onChange={(v) => setF({ ...f, pixChave: v })} />

// contas-bancarias-editor.tsx
<InputFormatado id="cb-ag" tipo="agencia" value={form.agencia} onChange={(v) => setForm({ ...form, agencia: v })} />
<InputFormatado id="cb-conta" tipo="conta" value={form.conta} onChange={(v) => setForm({ ...form, conta: v })} />
<InputFormatado id="cb-pix" tipo="chavePix" tipoPix={form.pixTipo as TipoPix | ""} value={form.pixChave} onChange={(v) => setForm({ ...form, pixChave: v })} />
```

(Manter os demais atributos que o `<Input>` da chave PIX já tinha na linha 239, ex.: `disabled`; `TipoPix` vem de `@/modules/rh/contas/pix`.) Ao trocar o tipo da chave no `<select>`, limpar a chave (`pixChave: ""`) se a tela ainda não faz isso — uma chave de CPF não vale como telefone.

- [ ] **Step 4: Guarda, testes, lint**

Tirar de `PENDENTES` os arquivos desta tarefa. Run: `npm test` e `npx eslint src/modules/rh src/components/rh`. Expected: verde.

- [ ] **Step 5: Conferir em tela** (RH → Pessoas jurídicas: criar com CNPJ já cadastrado só com dígitos no banco → aviso no campo; Minha conta/Contas bancárias: PIX de telefone colado com +55; padrão das Tarefas 9–13).

- [ ] **Step 6: Commit**

```bash
git add src/modules/rh/funcionarios/actions.ts src/modules/rh/pessoas-juridicas/actions.ts src/modules/rh/contas/actions.ts src/components/rh/proposta-conta-dialog.tsx src/components/rh/contas-bancarias-editor.tsx src/lib/campos/guarda-campos.test.ts
git commit -m "feat(rh): máscara e validação em cadastro, PJ e contas bancárias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 10: Clientes, Comercial e Parceiros

**Files:**
- Modify: `src/modules/clientes/schemas.ts:1-70`, `src/modules/clientes/actions.ts` (`editarCliente` ~145, `editarContato` ~248)
- Modify: `src/modules/comercial/schemas.ts:11-12` (lead), `:179-187` (parceiro), `:374-376` (prospecção rápida)
- Modify: `src/modules/comercial/actions.ts` (`editarLead` ~189, `editarParceiro` ~469)
- Modify: `src/components/clientes/cliente-form.tsx:~330-365`, `src/components/clientes/contato-dialog.tsx:79,85`, `src/components/clientes/contatos-tab.tsx:230,235`, `src/components/comercial/parceiro-dialog.tsx:114,118,123`, `src/components/comercial/lead-dialog.tsx:385,391`, `src/components/comercial/prospeccao-rapida-dialog.tsx:~695-725`
- Modify: `src/lib/campos/guarda-campos.test.ts`

**Interfaces:** as do padrão.

- [ ] **Step 1: Schemas de clientes**

```ts
import { campo } from "@/lib/campos/zod";

const camposComFormato = (legado: boolean) => ({
  documento: campo.cpfCnpj({ legado }),
  email: campo.email({ legado }),
  telefone: campo.telefone({ legado }),
  cep: campo.cep({ legado }),
});
```

Tirar `documento`, `email`, `telefone`, `cep` de `base`; remover `docValido`/`docMsg`;

```ts
export const criarClienteSchema = z.object({ ...base, ...camposComFormato(false) });
export const editarClienteSchema = z.object({ id: z.string().min(1), ...base, ...camposComFormato(true) });
```

Contatos: `adicionarContatoSchema` → `email: campo.email(), telefone: campo.telefone()`; `editarContatoSchema` → `{ legado: true }`. `buscarCandidatosDuplicataSchema` (busca parcial enquanto digita) → `// campo-ok: busca de duplicata aceita valor parcial` em `documento` e `email`. `consultarCnpjSchema` → `cnpj: campo.cnpj({ obrigatorio: true })`.

- [ ] **Step 2: Handlers de editar (clientes)**

`editarCliente`:

```ts
const antes = await prisma.cliente.findUnique({
  where: { id: i.id },
  select: { documento: true, email: true, telefone: true, cep: true },
});
exigirCamposValidos(i, antes, { documento: "cpfCnpj", email: "email", telefone: "telefone", cep: "cep" });
```

`editarContato`: `prisma.contatoCliente.findUnique({ where: { id: i.id }, select: { email: true, telefone: true } })` + `{ email: "email", telefone: "telefone" }`.

Se `editarCliente` já usa `capturarAntes` com `findUnique` do cliente, **não** reaproveitar (o `capturarAntes` só alimenta a auditoria e roda antes do handler; ler de novo é o padrão do plano).

Conferir a deduplicação por documento em `clientes/actions.ts`/`comercial/dedupe.ts`: se compara por igualdade de texto, trocar para `variantesDoValor(CAMPOS.cpfCnpj, doc)` no `in`; se já compara por `soDigitos`, deixar.

- [ ] **Step 3: Schemas e handlers do comercial**

Lead (linhas 11–12): criar → `email: campo.email(), telefone: campo.telefone()`; se `editarLeadSchema` deriva do mesmo objeto, aplicar o `camposComFormato(legado)` e, em `editarLead`, `exigirCamposValidos(i, await prisma.lead.findUnique({ where: { id: i.id }, select: { email: true, telefone: true } }), { email: "email", telefone: "telefone" })`.

Parceiro (179–181): `documento: campo.cpfCnpj(), email: campo.email(), telefone: campo.telefone()`; remover `parceiroDocValido`/`refine` do documento; editar com `legado` + `exigirCamposValidos` em `editarParceiro` (`prisma.parceiro`, mapa `{ documento: "cpfCnpj", email: "email", telefone: "telefone" }`).

Prospecção rápida (374–376, só cria): `email: campo.email(), telefone: campo.telefone()` (remove `MENSAGEM_*`/`telefoneValido` desse trecho se ficarem sem uso).

- [ ] **Step 4: Telas**

`cliente-form.tsx` (~332–365):

```tsx
<InputFormatado tipo="cpfCnpj" value={form.documento} onChange={(v) => set("documento", v)} /* manter id/onBlur que já existiam (consulta CNPJ, duplicata) */ />
<InputFormatado tipo="telefone" value={form.telefone} onChange={(v) => set("telefone", v)} />
<InputFormatado tipo="email" value={form.email} onChange={(v) => set("email", v)} /* manter onBlur de duplicata */ />
<InputFormatado tipo="cep" value={form.cep} onChange={(v) => set("cep", v)} /* manter onBlur de busca do CEP */ />
```

Se o formulário mostra o tipo (PF/PJ), usar `tipo={form.tipo === "PF" ? "cpf" : "cnpj"}` no documento em vez de `cpfCnpj`; o schema continua `cpfCnpj` (aceita os dois). Se `cliente-form` usa `useFieldErrors`, passar `erro={fe.erros.documento}` etc. e remover o `FieldError` do pai desses campos.

`contato-dialog.tsx`, `contatos-tab.tsx`, `parceiro-dialog.tsx`, `lead-dialog.tsx`: trocar os `<Input>` de `email`/`telefone`/`documento` pelo padrão (`tipo="email"`, `"telefone"`, `"cpfCnpj"`). Em `contatos-tab.tsx` (edição em linha de tabela), a mensagem de erro aparece abaixo do campo dentro da célula — conferir que a linha não quebra o layout; se quebrar, passar `className` para o campo e deixar o `FieldError` (é um `<p>` pequeno).

`prospeccao-rapida-dialog.tsx` (~695–725): trocar os dois `<Input>` por `InputFormatado` com `id` igual ao que `fe.campo("email")`/`fe.campo("telefone")` usava e `erro={fe.erros.email}` / `erro={fe.erros.telefone}`; apagar os `onBlur` que chamavam `fe.marcar(...)` (o componente valida ao sair) e o `<FieldError>` desses campos; manter a checagem antes de enviar (linhas ~373–374) — ela continua usando `emailValido`/`telefoneValido`, agora reexportadas do catálogo.

- [ ] **Step 5: Guarda, testes, lint**

Run: `npm test` e `npx eslint src/modules/clientes src/modules/comercial src/components/clientes src/components/comercial`. Expected: verde (incluindo `comercial/contato-validacao.test.ts`, `dedupe.test.ts`, `clientes/*.test.ts`).

- [ ] **Step 6: Conferir em tela** (padrão; incluir cliente com documento inválido gravado — Review Focus 3 — e funil → card → editar lead).

- [ ] **Step 7: Commit**

```bash
git add src/modules/clientes/schemas.ts src/modules/clientes/actions.ts src/modules/comercial/schemas.ts src/modules/comercial/actions.ts src/components/clientes/cliente-form.tsx src/components/clientes/contato-dialog.tsx src/components/clientes/contatos-tab.tsx src/components/comercial/parceiro-dialog.tsx src/components/comercial/lead-dialog.tsx src/components/comercial/prospeccao-rapida-dialog.tsx src/lib/campos/guarda-campos.test.ts
git commit -m "feat(clientes): máscara e validação em clientes, contatos, leads e parceiros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 11: Financeiro e Custos

**Files:**
- Modify: `src/modules/financeiro/cadastros/schemas.ts:22` (agência da conta), `:37-39` (fornecedor); `src/modules/financeiro/cadastros/actions.ts` (`editarConta` ~136, `editarFornecedor` ~185)
- Modify: `src/modules/financeiro/lancamentos/schemas.ts:36-42,64-70` (chave NF-e)
- Modify: `src/modules/custos/fornecedores/schemas.ts:10-12,26-27`; `src/modules/custos/fornecedores/actions.ts` (`editarFornecedor` ~29)
- Modify: `src/components/financeiro/cadastros/fornecedores-section.tsx:191,205,209`, `src/components/financeiro/cadastros/contas-section.tsx:211`, `src/components/financeiro/lancamentos/lancamento-form.tsx:9,523-526`, `src/components/custos/fornecedores/fornecedores-view.tsx:245,255,259,433`
- Modify: `src/lib/campos/guarda-campos.test.ts`

- [ ] **Step 1: Schemas e handlers**

Financeiro/cadastros: conta bancária `agencia: campo.agencia()` (criar) / `campo.agencia({ legado: true })` (editar) + `exigirCamposValidos(i, await prisma.contaBancaria.findUnique({ where: { id: i.id }, select: { agencia: true } }), { agencia: "agencia" })`. Fornecedor: `documento: campo.cpfCnpj(), email: campo.email(), telefone: campo.telefone()`; editar com `legado` + `exigirCamposValidos` (`prisma.fornecedor`, mapa `{ documento: "cpfCnpj", email: "email", telefone: "telefone" }`). Remover qualquer `validarCpfCnpj` do handler que ficou redundante com o schema (o `import` de `@/lib/documento` sai se ficar sem uso).

Lançamentos (criar e editar, as duas ocorrências):

```ts
chaveNfe: campo.chaveNfe(),
```

Estrito também na edição: a chave é validada pelo DV desde a M7, não há legado inválido. O handler continua chamando `normalizarChaveNfe` (agora `soDigitos`) — inofensivo; `""` continua limpando (`i.chaveNfe !== undefined`).

Custos/fornecedores: fornecedor como no financeiro (`prisma.custoFornecedor`); representante (linhas 26–27, só cria): `telefone: campo.telefone(), email: campo.email()`.

- [ ] **Step 2: Telas**

```tsx
// fornecedores-section.tsx e fornecedores-view.tsx
<InputFormatado tipo="cpfCnpj" value={form.documento} onChange={(v) => setForm({ ...form, documento: v })} />
<InputFormatado tipo="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
<InputFormatado tipo="telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
// fornecedores-view.tsx:433 (representante, linha compacta)
<InputFormatado tipo="telefone" placeholder="Telefone" value={repTelefone} onChange={setRepTelefone} className="w-32" />
// contas-section.tsx:211
<InputFormatado tipo="agencia" value={form.agencia} onChange={(v) => setForm({ ...form, agencia: v })} />
// lancamento-form.tsx:523 — e apagar o aviso das linhas 524–526 e o import de chaveNfeValida/MOTIVO_CHAVE_INVALIDA da linha 9 se ficarem sem uso
<InputFormatado id="lc-chave" tipo="chaveNfe" value={chaveNfe} onChange={setChaveNfe} />
```

Na `fornecedores-view.tsx:433`, a linha do representante é estreita (`w-32`): conferir a 390 px que a mensagem de erro não estoura a linha; se estourar, envolver o campo num `<div className="w-32">` com o `className` no wrapper.

- [ ] **Step 3: Guarda, testes, lint**

Run: `npm test` e `npx eslint src/modules/financeiro/cadastros src/modules/financeiro/lancamentos src/modules/custos src/components/financeiro src/components/custos`. Expected: verde (inclui `natureza-nas-consultas.test.ts`, `baixa.test.ts`).

- [ ] **Step 4: Conferir em tela** (Financeiro → Cadastros → Fornecedores e Contas; Lançamentos → novo com chave NF-e colada com espaços; Custos → Fornecedores e representante).

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/cadastros/schemas.ts src/modules/financeiro/cadastros/actions.ts src/modules/financeiro/lancamentos/schemas.ts src/modules/custos/fornecedores/schemas.ts src/modules/custos/fornecedores/actions.ts src/components/financeiro/cadastros/fornecedores-section.tsx src/components/financeiro/cadastros/contas-section.tsx src/components/financeiro/lancamentos/lancamento-form.tsx src/components/custos/fornecedores/fornecedores-view.tsx src/lib/campos/guarda-campos.test.ts
git commit -m "feat(financeiro): máscara e validação em fornecedores, contas e chave da NF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 12: Configurações, usuários e telas públicas

**Files:**
- Modify: `src/modules/configuracoes/empresa/actions.ts:12-60`, `src/components/configuracoes/empresa-view.tsx:~135-240`
- Modify: `src/modules/usuarios/schemas.ts:6-12`, `src/modules/usuarios/actions.ts` (`editarUsuario` ~79), `src/components/configuracoes/usuarios-view.tsx:580,688,692`
- Modify: `src/modules/usuarios/preferencias/actions.ts:10-30`, `src/components/configuracoes/preferencias-view.tsx:486`
- Modify: `src/modules/auth/cadastro/actions.ts:15-20`, `src/app/solicitar-cadastro/page.tsx:81`
- Modify: `src/modules/juridico/actions.ts:510-520` (`criarLinkAssinatura`), `src/components/juridico/juridico-view.tsx:317`
- Modify: `src/app/api/p/assinar/[token]/route.ts:20-35`, `src/components/juridico/assinatura-publica-form.tsx:35-90`
- Modify: `src/modules/inputs/briefing-schema.ts:~10-40`, `src/components/inputs/briefing-form.tsx:~165-176`, e a action que grava a resposta do briefing (`src/modules/inputs/actions.ts`)
- Modify: `src/lib/campos/guarda-campos.test.ts`

- [ ] **Step 1: Configurações → Empresa (JSON em `ConfigSistema`)**

Schema: `cnpj: campo.cnpj({ legado: true })`, `telefone: campo.telefone({ legado: true })`, `email: campo.email({ legado: true })`, `agencia: campo.agencia({ legado: true })`, `conta: campo.conta({ legado: true })`, e `cep: campo.cep({ legado: true })` se o schema tiver CEP (conferir o nome da chave). No handler, `antes` = os dados atuais da empresa (a função que o arquivo já usa para ler `empresa.dados`) e `exigirCamposValidos(i, antes, { cnpj: "cnpj", telefone: "telefone", email: "email", agencia: "agencia", conta: "conta" /*, cep: "cep" */ })`.

Tela: `value={cnpj}`/`telefone`/`email` (+ agência, conta, CEP) → `InputFormatado` com o `tipo` correspondente e `onChange={setX}`.

- [ ] **Step 2: Usuários e perfil**

`usuarios/schemas.ts`: `cpf: campo.cpf()`, `telefone: campo.telefone()` no criar; no editar, `{ legado: true }` + em `editarUsuario` `exigirCamposValidos(i, await prisma.user.findUnique({ where: { id: i.id }, select: { cpf: true, telefone: true } }), { cpf: "cpf", telefone: "telefone" })`. `email` → `// campo-ok: e-mail de login (better-auth)` (Task 8 já pôs). Tela `usuarios-view.tsx:688,692` → `InputFormatado id="u-cpf" tipo="cpf"` / `id="u-tel" tipo="telefone"`.

Perfil (`atualizarMeuPerfil`): `telefone: campo.telefone({ legado: true })` + `exigirCamposValidos(i, await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { telefone: true } }), { telefone: "telefone" })`. Tela `preferencias-view.tsx:486` → `<InputFormatado id="perfil-tel" tipo="telefone" value={telefone} onChange={setTelefone} />`.

- [ ] **Step 3: Solicitar cadastro, link de assinatura, assinatura pública**

`auth/cadastro/actions.ts`: `telefone: campo.telefone()`; tela `solicitar-cadastro/page.tsx:81` → `InputFormatado tipo="telefone"`.

`juridico/actions.ts` (`criarLinkAssinatura`): `email: campo.email()`; tela `juridico-view.tsx:317` → `InputFormatado tipo="email"`.

Rota pública `src/app/api/p/assinar/[token]/route.ts` (não passa pelo `defineAction`): depois de ler `cpf`,

```ts
import { CAMPOS } from "@/lib/campos";
// ...
const cpfBruto = typeof corpo.cpf === "string" ? corpo.cpf.trim() : "";
if (!CAMPOS.cpf.validar(cpfBruto)) {
  return NextResponse.json({ erro: CAMPOS.cpf.mensagem }, { status: 400 });
}
const cpf = CAMPOS.cpf.normalizar(cpfBruto);
```

(usar o mesmo formato de resposta de erro que a rota já usa nas outras recusas — conferir as linhas vizinhas). Tela `assinatura-publica-form.tsx:86` → `<InputFormatado tipo="cpf" value={cpf} onChange={setCpf} />`; mostrar a mensagem do 400 como a tela já mostra os outros erros.

- [ ] **Step 4: Briefing do cliente (inputs públicos)**

Em `briefing-schema.ts`, acrescentar ao tipo do campo `formato?: NomeCampo` e marcar `emailContato` com `formato: "email"` e `telefoneContato` com `formato: "telefone"` (e qualquer outro campo do briefing que seja CPF/CNPJ/CEP — procurar por `label` com essas palavras). Em `briefing-form.tsx` (~165), no ramo `campo.tipo === "text"`: se `campo.formato`, renderizar `<InputFormatado tipo={campo.formato} value={…} onChange={…} />` com os mesmos `value`/`onChange` do `<Input>` atual. Na action que grava a resposta (`modules/inputs/actions.ts`), para cada campo com `formato` preenchido e valor não vazio: `if (!CAMPOS[f].validar(v)) throw new ActionError(CAMPOS[f].mensagem, { [chave]: CAMPOS[f].mensagem })` e gravar `CAMPOS[f].normalizar(v)`. Se a gravação for por rota pública e não por action, aplicar o mesmo dentro da rota com resposta 400.

- [ ] **Step 5: Guarda, testes, lint**

Run: `npm test` e `npx eslint src/modules/configuracoes src/modules/usuarios src/modules/auth src/modules/juridico src/modules/inputs src/components/configuracoes src/components/juridico src/components/inputs src/app/solicitar-cadastro "src/app/api/p/assinar"`. Expected: verde.

- [ ] **Step 6: Conferir em tela** (Configurações → Empresa; Usuários → editar; Preferências → perfil; `/solicitar-cadastro` deslogado; link público de assinatura com CPF inválido → mensagem; link de inputs do cliente com telefone).

- [ ] **Step 7: Commit**

```bash
git add src/modules/configuracoes/empresa/actions.ts src/components/configuracoes/empresa-view.tsx src/modules/usuarios/schemas.ts src/modules/usuarios/actions.ts src/components/configuracoes/usuarios-view.tsx src/modules/usuarios/preferencias/actions.ts src/components/configuracoes/preferencias-view.tsx src/modules/auth/cadastro/actions.ts src/app/solicitar-cadastro/page.tsx src/modules/juridico/actions.ts src/components/juridico/juridico-view.tsx "src/app/api/p/assinar/[token]/route.ts" src/components/juridico/assinatura-publica-form.tsx src/modules/inputs/briefing-schema.ts src/components/inputs/briefing-form.tsx src/modules/inputs/actions.ts src/lib/campos/guarda-campos.test.ts
git commit -m "feat(campos): máscara e validação em configurações, usuários e telas públicas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 13: Importações gravam o formato padrão

**Files:**
- Modify: `src/modules/financeiro/importacao/commit-core.ts:~88-200`
- Modify: `src/modules/comercial/importacao/processar.ts:~45-70`, `src/modules/comercial/importacao/commit.ts:~60-105`
- Test: `src/modules/comercial/importacao/processar.test.ts` (existente ou novo), `src/modules/financeiro/importacao/*.test.ts` (existentes)

- [ ] **Step 1: Teste da prévia do comercial (falhando)**

Em `processar.test.ts`, acrescentar (adaptar ao helper de montagem de linha que o arquivo já usa):

```ts
it("documento e telefone saem no formato padrão; inválido vira aviso e não bloqueia", () => {
  const r = processarLinhas([linha({ documento: "11222333000181", telefone: "81999998888" })], mapeamento);
  expect(r[0].documento).toBe("11.222.333/0001-81");
  expect(r[0].telefone).toBe("(81) 99999-8888");

  const ruim = processarLinhas([linha({ telefone: "123" })], mapeamento);
  expect(ruim[0].avisos).toContain("Telefone inválido. Informe o DDD e o número, ex.: (81) 99999-9999.");
  expect(ruim[0].erros).toEqual([]);
  expect(ruim[0].telefone).toBe("123");
});
```

Se a linha processada não tiver lista de `avisos`, acrescentar `avisos: string[]` ao tipo da linha (vazia por padrão) e exibi-la na prévia onde `erros` já é exibido, com o estilo de aviso (não de erro).

Run: `npx vitest run src/modules/comercial/importacao` → FAIL.

- [ ] **Step 2: Implementar no comercial**

Em `processar.ts`: `documento` deixa de ser `.replace(/\D/g, "")` e passa a `CAMPOS.cpfCnpj.normalizar(bruto)`; `telefone` → `CAMPOS.telefone.normalizar(bruto)`; `emailContato` → `CAMPOS.email.normalizar(bruto)` e a checagem `EMAIL_RE` vira `!CAMPOS.email.validar(...)` (continua em `erros`, como hoje). Documento/telefone inválido: `avisos.push(CAMPOS.x.mensagem)`. A deduplicação (`candidatosDuplicata`) compara documento — conferir que usa `soDigitos` dos dois lados; se comparar o texto, passar `CAMPOS.cpfCnpj.essencia(documento)`. Atualizar o comentário do tipo (`documento: string; // só dígitos`) para `// formato padrão; "" se ausente`.

Run: `npx vitest run src/modules/comercial/importacao` → PASS.

- [ ] **Step 3: Financeiro (`commit-core.ts`)**

Na busca por documento (linhas ~91–105 montam os mapas por `replace(/\D/g, "")`; linha ~189 busca com `docValido` cru): buscar com `soDigitos(docValido)` (`import { soDigitos } from "@/lib/documento"`) para casar com as chaves do mapa, e gravar `documento: docValido ? CAMPOS.cpfCnpj.normalizar(docValido) : null` nos `create` de fornecedor/cliente. `tipoPessoa` passa a usar `soDigitos(docValido).length === 11`.

Acrescentar teste em `src/modules/financeiro/importacao/` (no arquivo de teste do commit que já existe, ou num `commit-core-documento.test.ts` puro se o commit depender de transação): documento `"11.222.333/0001-81"` no CSV casa com fornecedor gravado como `"11222333000181"` (não cria duplicata). Se `commit-core` só for testável com banco, cobrir pelo smoke `npm run smoke:financeiro-core` e registrar isso no commit.

- [ ] **Step 4: Testes, lint, commit**

Run: `npm test` e `npx eslint src/modules/comercial/importacao src/modules/financeiro/importacao`. Expected: verde.

```bash
git add src/modules/comercial/importacao/processar.ts src/modules/comercial/importacao/processar.test.ts src/modules/comercial/importacao/commit.ts src/modules/financeiro/importacao/commit-core.ts <teste do financeiro>
git commit -m "feat(importacao): documento, telefone e e-mail importados no formato padrão

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 14: Fechar o guarda e escrever a regra

**Files:**
- Modify: `src/lib/campos/guarda-campos.test.ts`, `CLAUDE.md`, `docs/manual/novidades.md`, uma página do manual (ver Step 4)
- Create: `docs/adr/0010-campos-com-formato.md`

- [ ] **Step 1: Zerar os pendentes**

Run: `npx vitest run src/lib/campos/guarda-campos.test.ts`. Se ainda houver arquivo em `PENDENTES`, migrá-lo pelo padrão das Tarefas 9–13 (é sinal de que a varredura das tarefas deixou algo) e conferir em tela. Quando vazio, trocar o bloco por:

```ts
/** Vazia de propósito: exceção só por `campo-ok: <motivo>` na própria linha (ADR-0010). */
const PENDENTES: Record<string, number> = {};
```

- [ ] **Step 2: ADR-0010**

`docs/adr/0010-campos-com-formato.md` (formato das ADRs 0007–0009 — copiar o cabeçalho de `docs/adr/0009-pro-labore-recorrente-projetado.md`):

```markdown
# 0010 — Campos com formato: catálogo único, formato padrão no banco

Data: 2026-10-05 · Status: aceita

## Contexto
CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX e chave NF-e eram digitados sem máscara na maior parte das telas e aceitos sem validação pela maioria das actions; as regras que existiam estavam espalhadas (`lib/documento.ts`, `comercial/contato-validacao.ts`, `rh/contas/pix.ts`, `financeiro/lancamentos/baixa.ts`) e o banco tinha o mesmo dado em formatos diferentes.

## Decisão
1. Um catálogo puro (`src/lib/campos/`) define, por tipo, máscara, normalização, validação e mensagem. Tela (`InputFormatado`), schema (`campo.<tipo>()`) e edição (`exigirCamposValidos`) leem dele — a tela nunca aceita o que a action recusa.
2. O banco grava o formato padrão (`000.000.000-00`, `(00) 00000-0000`…), não só dígitos: PDFs, Estúdio, holerite e Excel imprimem o que está gravado. Exceções com formato oficial: chave PIX (BACEN) e chave NF-e (44 dígitos). Busca e duplicidade comparam a essência (dígitos).
3. Edição só valida o que mudou: o inválido já gravado passa; o novo é recusado no campo.
4. Sem biblioteca de máscara: as regras de validação seriam nossas de qualquer jeito, e uma segunda sintaxe de formato poderia divergir do servidor.
5. Formulário que só coleta e salva usa `FormData`; formulário com campo que reage a outro usa estado. Formulário existente muda de modo só quando a tela já está sendo mexida.

## Consequências
- Um teste-guarda (`src/lib/campos/guarda-campos.test.ts`) reprova `<Input>` cru e `z.string()` solto nesses campos; exceção só com `campo-ok: <motivo>`.
- Tipo novo (PIS, CTPS, CNH, título, boleto, inscrição estadual…) nasce no catálogo junto com o primeiro campo que o usa, com teste.
- Dados antigos: `scripts/normalizar-campos.ts`, uma vez por ambiente.
```

- [ ] **Step 3: CLAUDE.md**

Acrescentar, depois do parágrafo "**List views:**" na seção Architecture:

```markdown
**Campos com formato e formulários** ([ADR-0010](docs/adr/0010-campos-com-formato.md), spec
`docs/superpowers/specs/2026-10-04-campos-formatados-design.md`): CPF, CNPJ, CPF/CNPJ, telefone, CEP, e-mail, RG,
agência, conta, chave PIX e chave NF-e usam `InputFormatado tipo="…"` (`components/ui/input-formatado.tsx`) na tela e
`campo.<tipo>()` (`lib/campos/zod.ts`) no schema — nunca `<Input>` cru nem `z.string()` solto. The catalog
(`lib/campos/`, pure, one file per type) is the single source: mask, normalization, validation and the message, the
same on screen and in the action. The DB stores the **standard format** (`000.000.000-00`, `(00) 00000-0000`), except
PIX (BACEN format) and the NF-e key (44 digits); duplicate lookups compare the essence (`variantesDoValor`). Create
schemas are strict; **edit** schemas use `{ legado: true }` and the handler calls `exigirCamposValidos(input, antes,
mapa)` — an invalid value already stored passes, a new invalid one is refused on the field (`ActionError(msg, campos)`
→ `fieldErrors`). With `useFieldErrors`, pass `id` + `erro={fe.erros.x}` and drop the parent's `FieldError`. A new type
(PIS, CNH, boleto…) is born in the catalog together with its first field, with a test. Login e-mail (better-auth) is out.
`lib/campos/guarda-campos.test.ts` fails on a raw field; the only escape is a `campo-ok: <reason>` comment. Forms that
only collect and save use `FormData`; forms where a field reacts to another use state; an existing form switches mode
only when the screen is already being changed for another reason.
```

E, na lista de `lib/` do bloco de arquitetura, acrescentar a linha:
`#   campos/: catálogo de campos com formato (máscara, normalização, validação) + zod.ts + exigir.ts — ver ADR-0010`

Remover da lista de `utils.ts` qualquer menção a `mask*` (não há hoje; conferir).

- [ ] **Step 4: Manual**

Em `docs/manual/novidades.md`, no topo, uma entrada em linguagem de usuário:

```markdown
## Campos de CPF, telefone e CEP formatam sozinhos

Ao digitar CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX ou chave da NF, o sistema põe os pontos,
traços e parênteses enquanto você digita, e aceita o número colado de qualquer jeito (com ou sem pontuação, com +55).
Se o número não confere — CPF com dígito errado, telefone sem DDD — o aviso aparece logo abaixo do campo quando você sai
dele. Cadastros antigos com o dado errado continuam abrindo e salvando normalmente; o aviso só aparece se você mudar
esse campo.
```

E na página geral do manual sobre formulários/uso do sistema (procurar em `docs/manual/` por "formulário"; se não houver, em `docs/manual/sistema/README.md`) o mesmo texto em 2–3 frases.

- [ ] **Step 5: Testes, commit**

Run: `npm test`. Expected: verde, guarda com `PENDENTES` vazio.

```bash
git add src/lib/campos/guarda-campos.test.ts CLAUDE.md docs/adr/0010-campos-com-formato.md docs/manual/novidades.md <página do manual>
git commit -m "docs(campos): ADR-0010, regra no CLAUDE.md e guarda sem pendentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 15: Script de normalização dos dados antigos

**Files:**
- Create: `scripts/normalizar-campos-alvos.ts`, `scripts/normalizar-campos.ts`, `src/lib/campos/alvos-normalizacao.test.ts`
- Modify: `docs/DEPLOY.md` §9

**Interfaces:**
- Consumes: `CAMPOS`, `NomeCampo`, `campoPix` (Task 3).
- Produces: `ALVOS: readonly { modelo: string; tabela: string; colunas: Record<string, NomeCampo | "pix"> ; unica?: string[] }[]`.

- [ ] **Step 1: Lista de alvos + teste contra o schema (falhando)**

`scripts/normalizar-campos-alvos.ts`:

```ts
import type { NomeCampo } from "../src/lib/campos";

/** Colunas que o `normalizar-campos.ts` reescreve no formato padrão (spec 2026-10-04 §6). */
export type Alvo = {
  /** Nome do model no `schema.prisma` (delegate do Prisma em minúscula inicial). */
  modelo: string;
  colunas: Record<string, NomeCampo | "pix">;
  /** Colunas com `@unique`: colisão depois de normalizar não é gravada, vai para o relatório. */
  unicas?: string[];
};

export const ALVOS: readonly Alvo[] = [
  { modelo: "User", colunas: { cpf: "cpf", rg: "rg", enderecoCep: "cep", telefone: "telefone", telefoneEmergencia: "telefone", emailPessoal: "email" } },
  { modelo: "ContaBancariaColaborador", colunas: { agencia: "agencia", conta: "conta", pixChave: "pix" } },
  { modelo: "Cliente", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone", cep: "cep" } },
  { modelo: "ContatoCliente", colunas: { email: "email", telefone: "telefone" } },
  { modelo: "ContaBancaria", colunas: { agencia: "agencia" } },
  { modelo: "Fornecedor", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" } },
  { modelo: "CustoFornecedor", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" } },
  { modelo: "CustoFornecedorRepresentante", colunas: { email: "email", telefone: "telefone" } },
  { modelo: "Parceiro", colunas: { documento: "cpfCnpj", email: "email", telefone: "telefone" } },
  { modelo: "PessoaJuridica", colunas: { cnpj: "cnpj", email: "email", telefone: "telefone" }, unicas: ["cnpj"] },
  { modelo: "Lead", colunas: { email: "email", telefone: "telefone" } },
  { modelo: "SolicitacaoCadastro", colunas: { telefone: "telefone" } },
  { modelo: "LinkPublicoAssinatura", colunas: { email: "email" } },
  { modelo: "Dependente", colunas: { cpf: "cpf" } },
  { modelo: "Lancamento", colunas: { chaveNfe: "chaveNfe" } },
];

/** Só relatório: a prova do aceite guarda o CPF como foi aceito (spec §6). */
export const SO_RELATORIO: readonly Alvo[] = [{ modelo: "AceiteExternoDocumento", colunas: { cpf: "cpf" } }];
```

`src/lib/campos/alvos-normalizacao.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALVOS, SO_RELATORIO } from "../../../scripts/normalizar-campos-alvos";

const schema = readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");

function bloco(modelo: string): string {
  const m = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  return m?.[1] ?? "";
}

describe("alvos do normalizar-campos existem no schema", () => {
  for (const a of [...ALVOS, ...SO_RELATORIO]) {
    it(a.modelo, () => {
      const b = bloco(a.modelo);
      expect(b, `model ${a.modelo} não existe`).not.toBe("");
      for (const col of Object.keys(a.colunas)) {
        expect(b, `${a.modelo}.${col}`).toMatch(new RegExp(`^\\s+${col}\\s+String`, "m"));
      }
      for (const col of a.unicas ?? []) {
        expect(b, `${a.modelo}.${col} @unique`).toMatch(new RegExp(`^\\s+${col}\\s+String.*@unique`, "m"));
      }
    });
  }
});
```

Run: `npx vitest run src/lib/campos/alvos-normalizacao.test.ts` → PASS se a lista bate com o schema (se falhar, corrigir a LISTA, nunca o schema). Se o `tsconfig`/vitest não resolver o import de `scripts/`, mover `normalizar-campos-alvos.ts` para `src/lib/campos/alvos-normalizacao.ts` e importar de lá no script.

- [ ] **Step 2: Escrever o script**

`scripts/normalizar-campos.ts`:

```ts
/**
 * Normaliza CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX e chave NF-e já gravados
 * para o formato padrão do catálogo `src/lib/campos/` (spec 2026-10-04 §6, ADR-0010).
 *
 * RODAR UMA VEZ POR AMBIENTE, depois do deploy da versão que traz o catálogo:
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts            (simula)
 *   npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts --gravar   (grava)
 *
 * Válido → formato padrão, com updateMany condicionado ao valor lido (não pisa em edição feita no
 * meio). Inválido → fica como está e vai para logs/campos-invalidos-AAAA-MM-DD.csv. Colisão numa
 * coluna única → nenhum dos dois muda, vai para o relatório. Nunca apaga. Rodar de novo não muda nada.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { CAMPOS, type TipoCampo } from "../src/lib/campos";
import { campoPix } from "../src/lib/campos/chave-pix";
import { TIPOS_PIX, type TipoPix } from "../src/modules/rh/contas/pix";
import { ALVOS, SO_RELATORIO, type Alvo } from "./normalizar-campos-alvos";

const gravar = process.argv.includes("--gravar");
type Linha = { modelo: string; id: string; coluna: string; valor: string; motivo: string };
const relatorio: Linha[] = [];
const resumo: Record<string, number> = {};

// Acesso dinâmico ao delegate do Prisma por nome de model (script único; os nomes vêm de ALVOS,
// conferidos contra o schema.prisma por alvos-normalizacao.test.ts).
type Delegate = {
  findMany(a: unknown): Promise<Record<string, unknown>[]>;
  updateMany(a: unknown): Promise<{ count: number }>;
};
const delegate = (modelo: string) =>
  (prisma as unknown as Record<string, Delegate>)[modelo[0].toLowerCase() + modelo.slice(1)];

function tipoDe(alvo: Alvo, coluna: string, linha: Record<string, unknown>): TipoCampo | null {
  const t = alvo.colunas[coluna];
  if (t !== "pix") return CAMPOS[t];
  const tipoPix = linha.pixTipo as string | null;
  return tipoPix && (TIPOS_PIX as readonly string[]).includes(tipoPix) ? campoPix(tipoPix as TipoPix) : null;
}

async function processar(alvo: Alvo, soRelatorio: boolean) {
  const colunas = Object.keys(alvo.colunas);
  const select = Object.fromEntries([["id", true], ...colunas.map((c) => [c, true]), ...(colunas.includes("pixChave") ? [["pixTipo", true]] : [])]);
  const linhas = await delegate(alvo.modelo).findMany({ select });
  const novosUnicos = new Map<string, string[]>(); // coluna:valorNovo → ids
  const planos: { id: string; coluna: string; de: string; para: string }[] = [];

  for (const l of linhas) {
    for (const coluna of colunas) {
      const valor = l[coluna];
      if (typeof valor !== "string" || valor.trim() === "") continue;
      const tipo = tipoDe(alvo, coluna, l);
      if (!tipo) {
        relatorio.push({ modelo: alvo.modelo, id: String(l.id), coluna, valor, motivo: "chave PIX sem tipo" });
        continue;
      }
      if (!tipo.validar(valor)) {
        relatorio.push({ modelo: alvo.modelo, id: String(l.id), coluna, valor, motivo: tipo.mensagem });
        continue;
      }
      const para = tipo.normalizar(valor);
      if (para === valor || soRelatorio) continue;
      planos.push({ id: String(l.id), coluna, de: valor, para });
      if (alvo.unicas?.includes(coluna)) {
        const k = `${coluna}:${para}`;
        novosUnicos.set(k, [...(novosUnicos.get(k) ?? []), String(l.id)]);
      }
    }
  }

  // Colisão: dois registros (ou um já gravado no formato novo) acabariam com o mesmo valor único.
  const bloqueados = new Set<string>();
  for (const [k, ids] of novosUnicos) {
    const [coluna, valor] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    const jaExiste = linhas.some((l) => l[coluna] === valor && !ids.includes(String(l.id)));
    if (ids.length > 1 || jaExiste) {
      for (const id of ids) {
        bloqueados.add(`${id}:${coluna}`);
        relatorio.push({ modelo: alvo.modelo, id, coluna, valor, motivo: "possível duplicata depois de normalizar" });
      }
    }
  }

  let alterados = 0;
  for (const p of planos) {
    if (bloqueados.has(`${p.id}:${p.coluna}`)) continue;
    if (gravar) {
      const r = await delegate(alvo.modelo).updateMany({ where: { id: p.id, [p.coluna]: p.de }, data: { [p.coluna]: p.para } });
      alterados += r.count;
    } else {
      alterados++;
    }
  }
  resumo[alvo.modelo] = (resumo[alvo.modelo] ?? 0) + alterados;
}

async function main() {
  for (const a of ALVOS) await processar(a, false);
  for (const a of SO_RELATORIO) await processar(a, true);

  const dia = new Date().toISOString().slice(0, 10);
  const pasta = path.resolve("logs");
  mkdirSync(pasta, { recursive: true });
  const csv = path.join(pasta, `campos-invalidos-${dia}.csv`);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  writeFileSync(
    csv,
    ["modelo;id;coluna;valor;motivo", ...relatorio.map((r) => [r.modelo, r.id, r.coluna, r.valor, r.motivo].map(esc).join(";"))].join("\n"),
    "utf8",
  );

  console.log(gravar ? "GRAVADO" : "SIMULAÇÃO (nada gravado; use --gravar)");
  console.table(resumo);
  console.log(`${relatorio.length} valor(es) no relatório: ${csv}`);

  if (gravar) {
    await prisma.auditLog.create({
      data: { modulo: "sistema", acao: "normalizar-campos", resultado: "sucesso", entidade: "Sistema", detalhe: { resumo, noRelatorio: relatorio.length } },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

Antes de rodar, conferir em `prisma/schema.prisma` os campos obrigatórios de `AuditLog` (`userId` pode ser obrigatório): se for, usar o mesmo `logAudit` que outros scripts usam (procurar `logAudit` em `scripts/`) ou o id do admin do seed, e ajustar o `create`. A config `ConfigSistema` `empresa.dados` (JSON) é corrigida pela própria tela (Configurações → Empresa, com `legado`), não pelo script: o script relata. Acrescentar ao `main` um bloco que lê `empresa.dados` e manda para o relatório os campos inválidos (sem gravar).

- [ ] **Step 3: Rodar no banco de dev**

Run: `npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts`
Expected: "SIMULAÇÃO", tabela de contagem por modelo e caminho do CSV. Abrir o CSV e ler: só inválidos de verdade e possíveis duplicatas. RG com órgão emissor junto (`1234567 SSP/PE`) aparece como **válido** (vira `1234567SSPPE`) — se houver casos assim no dev, PARAR e perguntar ao dono antes de `--gravar` (o órgão sairia grudado no número).

Run: `npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts --gravar` → "GRAVADO".
Run de novo (simulação) → tabela toda com 0 (idempotente).

- [ ] **Step 4: Runbook**

Em `docs/DEPLOY.md` §9 ("Atualizações futuras"), acrescentar:

```markdown
### 9.x Release com campos formatados (uma vez por ambiente)

Depois do deploy da versão que traz `src/lib/campos/` (ADR-0010):

    npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts            # simula, gera logs/campos-invalidos-AAAA-MM-DD.csv
    npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts --gravar   # grava

Ler o CSV antes de gravar. Valores inválidos ficam como estão (os cadastros abrem e salvam; a correção é pela tela).
"Possível duplicata" = dois cadastros com o mesmo CNPJ depois de formatar — resolver pela tela (fusão de clientes, PJ).
```

- [ ] **Step 5: Commit**

```bash
git add scripts/normalizar-campos.ts scripts/normalizar-campos-alvos.ts src/lib/campos/alvos-normalizacao.test.ts docs/DEPLOY.md
git commit -m "feat(campos): script único que normaliza os dados já gravados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git show --stat HEAD
```

---

### Task 16: Verificar tudo

**Files:** nenhum novo.

- [ ] **Step 1: Parar o `next dev` desta pasta** (nunca build com dev ativo na mesma `.next`).

- [ ] **Step 2: Lint, testes, build**

Run: `npm run lint` (sem `--quiet`), `npm test`, `npm run build`.
Expected: zero erro; avisos novos nos arquivos tocados resolvidos; build verde.

- [ ] **Step 3: Tipos do servidor**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit` (o script usa o client do Prisma).
Expected: sem erro novo.

- [ ] **Step 4: Rodada final em tela** (dev de novo no ar): uma tela de cada tarefa (RH wizard, cliente, fornecedor do financeiro, lançamento com chave NF-e, Configurações → Empresa, assinatura pública), em 1366×768 com menu aberto e 390×844.

- [ ] **Step 5: Commit de qualquer ajuste** (mensagem `fix(campos): …`) e relatório ao dono: o que foi feito, o que foi conferido em tela, o relatório do script no dev, e a pendência de deploy (rodar o script no servidor, §9.x do DEPLOY.md).
