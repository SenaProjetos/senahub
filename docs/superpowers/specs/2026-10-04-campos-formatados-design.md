# Campos com formato: máscara e validação em todo o sistema

Data: 2026-10-04 · Branch: `feat/campos-formatados` (a partir de `feat/financeiro-nucleo`)
Status: design aprovado pelo dono em conversa, seção por seção. Este documento é o contrato.

## 1. Objetivo

Todo campo de formato conhecido (CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX,
chave NF-e) ganha máscara durante a digitação e validação, com a mesma regra na tela e no
servidor. Isso vira regra permanente: tela nova nasce com o componente certo, e um teste-guarda
reprova campo cru.

### Estado antes deste trabalho

- Máscaras soltas em `src/lib/utils.ts` (`maskCpf`, `maskCnpj`, `maskTelefone`, `maskCep`), usadas
  só em 4 telas do RH.
- Validação espalhada: `lib/documento.ts` (CPF/CNPJ), `comercial/contato-validacao.ts` (telefone,
  e-mail), `rh/contas/pix.ts` (PIX), `financeiro/lancamentos/baixa.ts` (`chaveNfeValida`).
- Cerca de 19 `<Input>` crus de CPF/CNPJ/telefone/CEP sem máscara. Schemas com
  `telefone: z.string().optional()` aceitam qualquer texto.
- Dinheiro e percentual já têm componente próprio (`InputMoeda`, `InputPercentual`). São o modelo.

## 2. Decisões do dono

| # | Decisão |
|---|---|
| D1 | Tipos: núcleo (CPF, CNPJ, CPF/CNPJ, telefone, CEP, e-mail) + RG + bancários (agência, conta, chave PIX, chave NF-e). |
| D2 | Tipo sem campo em tela (PIS/NIS, CTPS, título de eleitor, CNH, boleto) fica FORA. Ele nasce no catálogo junto com o campo, no dia em que o campo existir. |
| D3 | O banco grava o **formato padrão** (`123.456.789-09`, `(11) 98765-4321`, `01310-100`), não só dígitos. PDFs, Estúdio, holerite e Excel imprimem o que está gravado e continuam corretos sem mudança. Busca e deduplicação comparam dígitos (`soDigitos`). |
| D4 | Registro antigo com valor inválido: **só valida o que mudou.** Valor inválido igual ao gravado passa; valor diferente precisa ser válido. |
| D5 | Abordagem: catálogo próprio + um componente. Sem biblioteca de máscara. |
| D6 | Regra de formulário: só coleta e salva = `FormData`; campo que reage a outro = estado. Formulário existente muda de modo só quando a tela já está sendo mexida por outro motivo. Não há migração em massa. |

Obrigatoriedade não muda: campo hoje opcional continua aceitando vazio. A regra vale para o que
foi preenchido.

## 3. Catálogo de tipos (`src/lib/campos/`)

Arquivos puros (sem React, Prisma, Next ou `server-only`), um por tipo, cada um com teste.

```ts
export type TipoCampo = {
  mascarar(texto: string): string;      // enquanto digita (aceita entrada parcial)
  normalizar(texto: string): string;    // formato padrão gravado; só chamado em valor válido
  validar(texto: string): boolean;      // vazio = válido; obrigatoriedade é do schema
  mensagem: string;                     // mesma frase na tela e no ActionError
  inputMode: "numeric" | "tel" | "email" | "text";
  autoComplete?: string;
  placeholder: string;
  maxLength: number;                    // do texto mascarado
};
```

| Tipo | Formato gravado | Validação | Reaproveita |
|---|---|---|---|
| `cpf` | `000.000.000-00` | dígito verificador | `lib/documento.ts` |
| `cnpj` | `00.000.000/0000-00` | dígito verificador | `lib/documento.ts` |
| `cpfCnpj` | um dos dois, pelo número de dígitos | idem | `lib/documento.ts` |
| `telefone` | `(00) 0000-0000` ou `(00) 00000-0000` | DDD 11–99; fixo começa em 2–5, celular em 9; aceita `+55` colado | `comercial/contato-validacao.ts` |
| `cep` | `00000-000` | 8 dígitos | — |
| `email` | caixa-baixa, sem espaço nas pontas | formato | `comercial/contato-validacao.ts` |
| `rg` | maiúsculo, só dígitos, letras e `X`, sem pontuação | 5 a 14 caracteres. Sem dígito verificador: a regra muda por estado | — |
| `agencia` | `0000` ou `0000-0` | 4 dígitos + DV opcional | — |
| `conta` | `00000000-0` | 1 a 12 dígitos + DV (dígito ou `X`) | — |
| `chavePix` | depende de `tipoPix` | por tipo | `rh/contas/pix.ts` |
| `chaveNfe` | 44 dígitos em grupos de 4 | módulo 11 | `chaveNfeValida` (move para o catálogo; `baixa.ts` passa a importar dele) |

`index.ts` exporta `CAMPOS: Record<NomeTipo, TipoCampo>`. `chavePix` é a exceção de assinatura:
recebe o `tipoPix` (`campoPix(tipo): TipoCampo`).

**Fonte única.** As funções que já existem passam a chamar o catálogo, e as duplicatas somem:
`maskCpf`/`maskCnpj`/`maskTelefone`/`maskCep` saem de `utils.ts` (os chamadores migram);
`formatarTelefoneEntrada`/`telefoneValido` em `contato-validacao.ts` viram reexportações finas ou
são substituídos nos chamadores. Nenhuma regra fica escrita duas vezes. `validarCPF`/`validarCNPJ`
continuam em `documento.ts` (usados fora de formulário) e o catálogo os chama.

Telefone com `+55`: os dígitos nacionais descartam o `55` inicial quando há mais de 11 dígitos
(regra atual de `contato-validacao.ts`), para `+55 81 99999-9999` não virar `(55) 81999-9999`.

## 4. Componente `InputFormatado` (`src/components/ui/input-formatado.tsx`)

```tsx
<InputFormatado tipo="cpf" value={f.cpf} onChange={(v) => set("cpf", v)} />   // com estado
<InputFormatado tipo="telefone" name="telefone" defaultValue={c.telefone} />  // com FormData
<InputFormatado tipo="chavePix" tipoPix={tipo} value={...} onChange={...} />
```

- **Dois modos:** controlado (`value` + `onChange`) e não controlado (`name` + `defaultValue`,
  o `<input>` envia o texto mascarado no `FormData`).
- **Digitando:** aplica `mascarar`. Caractere que o tipo não aceita não entra. Ao editar no meio,
  o cursor fica na mesma posição relativa aos caracteres significativos (helper puro
  `reposicionarCursor(textoAntes, cursorAntes, textoDepois)`, testado).
- **Colando:** qualquer forma (`123.456.789-09`, `12345678909`, `+55 81 9…`) é mascarada.
- **Valor inicial** (legado fora do padrão) é exibido mascarado quando a máscara consegue; senão
  como está.
- **Ao sair do campo:** valida. Inválido = `aria-invalid`, borda vermelha (estilo que o `Input`
  já tem) e a mensagem do catálogo em `FieldError` logo abaixo, ligada por `aria-describedby`. O
  erro some quando a pessoa digita de novo.
- **Erro do servidor:** prop `erro` (vinda de `useFieldErrors`) tem prioridade sobre a validação
  local. Prop `id` é repassada para o `useFieldErrors` focar o campo.
- **Atributos sozinhos:** `inputMode`, `autoComplete` (`tel`, `postal-code`, `email`),
  `placeholder`, `maxLength`. O tamanho em tela de toque é herdado do `Input`, sem sobrescrever.
- **`onChange` devolve o texto mascarado**, que é o formato gravado (D3).
- **Não faz:** obrigatoriedade (vazio é válido; `required` e o schema decidem) e bloqueio do envio
  (o servidor recusa, seção 5). CEP só formata e valida: a busca do endereço (`buscarCep`)
  continua na tela, no `onBlur` dela, que o componente repassa.

## 5. Servidor

### 5.1 Helpers Zod (`src/lib/campos/zod.ts`)

```ts
cpf: campo.cpf(),                              // opcional, estrito
telefone: campo.telefone({ obrigatorio: true }),
cnpj: campo.cnpj({ legado: true }),            // schema de edição
pixChave: campo.chavePix("tipoPix"),           // lê o tipo de outro campo do objeto (superRefine no objeto)
```

- Todo helper faz `trim`. Vazio vira `undefined` (opcional) ou erro com a frase de obrigatório.
- **Estrito** (padrão, telas de criar): inválido é recusado com `mensagem`. O `fieldErrors` volta
  pelo caminho atual do `defineAction`.
- Valor válido sai **normalizado** (D3): `12345678909` grava `123.456.789-09`.
- **`legado: true`** (telas de editar): inválido passa sem alteração; válido sai normalizado.
  A checagem do inválido é da action (5.2).

### 5.2 "Só valida o que mudou" (`exigirCamposValidos`)

```ts
const antes = await prisma.cliente.findUnique({ where: { id }, select: { documento: true, telefone: true } });
exigirCamposValidos(input, antes, { documento: "cpfCnpj", telefone: "telefone" });
```

- Para cada campo: vazio passa; válido passa; inválido **igual ao gravado** passa; inválido
  **diferente** lança `ActionError` com o campo.
- "Igual" compara os dígitos/caracteres significativos (`soDigitos` para tipos numéricos,
  maiúsculo sem pontuação para RG, caixa-baixa para e-mail). O legado `12345678900` exibido como
  `123.456.789-00` conta como não mexido.
- Puro, recebe os dois objetos. A action lê o registro (só as colunas do catálogo) antes de
  chamar. O `defineAction` não muda de assinatura para isso; o `capturarAntes` continua só para a
  auditoria.

### 5.3 `ActionError` com campos

`new ActionError(mensagem, { campo: mensagem })`. O `defineAction` devolve esse mapa em
`fieldErrors` (formato `Record<string, string[]>`), como já faz na falha do Zod. Sem o mapa, o
comportamento é o de hoje. Assim, o erro do legado aparece no campo, e não num toast.

### 5.4 Fora do formulário

Importação de planilha (`financeiro/importacao/commit-core.ts`, importadores de clientes e
fornecedores), OFX, seeds e producers passam o valor por `normalizar` quando ele é válido. Linha
com valor inválido vira aviso na prévia da importação e é gravada como veio; a importação não é
bloqueada por isso.

Fora do escopo: `User.email` e `SolicitacaoResetSenha.email` (e-mail de login é do better-auth;
não muda de tratamento aqui).

## 6. Dados antigos (`scripts/normalizar-campos.ts`)

- Roda via `tsx` (`tsconfig.server.json`). **Simulação por padrão**; grava só com `--gravar`.
- Lista fixa de alvos no próprio script; um teste confere que cada coluna existe no
  `schema.prisma`:

  | Modelo | Colunas |
  |---|---|
  | `User` | `cpf`, `rg`, `enderecoCep`, `telefone`, `telefoneEmergencia`, `emailPessoal` |
  | `ContaBancariaColaborador` | `agencia`, `conta`, `pixChave` (pelo tipo da chave) |
  | `Cliente` | `documento` (cpfCnpj), `email`, `telefone`, `cep` |
  | `ContatoCliente` | `email`, `telefone` |
  | `ContaBancaria` | `agencia` |
  | `Fornecedor`, `CustoFornecedor`, `Parceiro` | `documento` (cpfCnpj), `email`, `telefone` |
  | `CustoFornecedorRepresentante` | `email`, `telefone` |
  | `PessoaJuridica` | `cnpj` (único), `email`, `telefone` |
  | `Lead`, `SolicitacaoCadastro` | `email`, `telefone` |
  | `LinkPublicoAssinatura` | `email` |
  | `AceiteExternoDocumento`, `Dependente` | `cpf` |
  | `Lancamento` | `chaveNfe` |
  | `ConfigSistema` `empresa.dados` (JSON) | `cnpj`, `telefone`, `cep`, `email` |

- **Válido:** vira o formato padrão, com `updateMany` condicionado ao valor lido (não pisa em
  edição feita no meio).
- **Inválido:** fica como está e entra no relatório CSV `logs/campos-invalidos-AAAA-MM-DD.csv`
  (modelo, id, coluna, valor, motivo). Nunca apaga.
- **Colisão de chave única** (`PessoaJuridica.cnpj`): se dois registros normalizam para o mesmo
  valor, nenhum é alterado e o par entra no relatório como possível duplicata.
- Um `AuditLog` com o resumo por modelo. Idempotente: rodar de novo não altera nada.
- Entrada no runbook de deploy (`docs/DEPLOY.md`) e no menu do servidor.
- `AceiteExternoDocumento.cpf` é prova de aceite: o script **não** o altera, só relata (a prova
  guarda o texto como foi aceito).

## 7. Regra permanente

- **CLAUDE.md**, nova seção "Campos com formato e formulários": campo de tipo do catálogo usa
  `InputFormatado` na tela e `campo.<tipo>()` no schema; edição usa `legado: true` +
  `exigirCamposValidos`; tipo novo nasce no catálogo junto com o campo, com teste; regra de
  `FormData` × estado (D6).
- **Teste-guarda** `src/lib/campos/guarda-campos.test.ts`, no estilo do guarda do menu de
  contexto. Varre `src/` e reprova:
  - `<Input` cujo `name`, `id` ou `value`/`defaultValue` cita campo do catálogo (`cpf`, `cnpj`,
    `documento`, `telefone`, `cep`, `enderecoCep`, `rg`, `agencia`, `conta`, `pixChave`,
    `chaveNfe`, `email`, `emailPessoal`);
  - schema em `src/modules/**/schemas.ts` ou `actions.ts` com essas chaves em `z.string()` sem
    `campo.`.
  - Exceção só com o comentário `campo-ok: <motivo>` na linha ou na anterior (ex.: busca que aceita
    CPF parcial, e-mail de login).
- **ADR-0010** `docs/adr/0010-campos-com-formato.md`: D3, D4, D5, D6.
- **Manual** (`docs/manual/`): nota curta de que CPF, telefone, CEP etc. formatam sozinhos e o que
  a mensagem de erro significa; entrada em `novidades.md`.

## 8. Fases

| Fase | Entrega | Verificação |
|---|---|---|
| F1 | Catálogo `lib/campos/` com os 11 tipos; chamadores de `mask*`, `formatarTelefoneEntrada`, `telefoneValido`, `chaveNfeValida` apontam para ele | teste por tipo: máscara parcial, colar, normalizar, válido/inválido, `+55` |
| F2 | `InputFormatado` + `reposicionarCursor` + `ActionError` com campos | teste puro do cursor; teste do `defineAction` devolvendo `fieldErrors` do `ActionError` |
| F3 | `campo.<tipo>()` + `exigirCamposValidos` | testes: estrito, normalização, legado igual passa, legado mexido recusa, vazio, obrigatório |
| F4 | Telas e schemas por lote: RH → Clientes/Comercial/Parceiros → Financeiro (contas, PIX, fornecedores, NF-e) → telas públicas (assinatura, inputs do cliente, portal) e Configurações → Empresa → resto | por lote: lint + test; cada tela conferida no navegador (digitar, colar, erro ao sair, salvar, editar legado), também a 390 px |
| F5 | Importações e producers passam por `normalizar` | teste da prévia com linha inválida |
| F6 | Teste-guarda ligado (quando der zero violação) + CLAUDE.md + ADR-0010 + manual | guarda verde em `npm test` |
| F7 | Script de normalização + runbook | simulação no banco de dev, relatório conferido, `--gravar` no dev, segunda rodada sem alteração |

Fecha com lint + test + build (Verificar tudo).

## 9. Fora do escopo

- Tipos sem campo em tela (D2).
- Inscrição estadual/municipal, placa, CREA/CAU, URL, datas digitadas à mão.
- Migrar formulários entre `FormData` e estado (D6).
- Validar que o número/documento existe de fato (Receita, operadora, banco).
