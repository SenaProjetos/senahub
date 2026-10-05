---
status: accepted
date: 2026-10-05
---

# ADR-0010 — Campos com formato: catálogo único, formato padrão no banco

CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX e chave NF-e eram digitados sem máscara na
maior parte das telas e aceitos sem validação pela maioria das actions. As regras que existiam estavam
espalhadas (`lib/documento.ts`, `comercial/contato-validacao.ts`, `rh/contas/pix.ts`,
`financeiro/lancamentos/baixa.ts`) e o banco tinha o mesmo dado em formatos diferentes. Spec:
`docs/superpowers/specs/2026-10-04-campos-formatados-design.md` (decisões D1–D6 e §10).

## Decisão

1. **Um catálogo puro** (`src/lib/campos/`, um arquivo por tipo, cada um com teste) define máscara,
   normalização, validação e a mensagem. A tela (`InputFormatado`), o schema (`campo.<tipo>()`) e a edição
   (`exigirCamposValidos`) leem dele: a tela nunca aceita o que a action recusa, e a frase do erro é a
   mesma nas duas pontas.
2. **O banco grava o formato padrão** (`000.000.000-00`, `00.000.000/0000-00`, `(00) 00000-0000`,
   `00000-000`), não só dígitos: PDFs, Estúdio, holerite e Excel imprimem o que está gravado. Busca e
   duplicidade comparam a essência (dígitos), e enquanto houver legado a busca por igualdade procura as
   variantes do valor. Exceções:
   - **chave PIX** no formato do BACEN (regra de `rh/contas/pix.ts`); depende do tipo da chave, então é
     validada no handler por `validarChavePix` e o schema leva `campo-ok`;
   - **chave NF-e** em 44 dígitos corridos; os grupos de 4 são só a máscara de exibição;
   - **documento do cliente** (`Cliente.documento`) continua só com dígitos: a unicidade do ADR-03 do CRM
     depende disso, e a tela mascara na exibição. Fornecedor, custo de fornecedor, parceiro e PJ do RH usam
     o formato padrão.
3. **Edição só valida o que mudou** (D4), em todo caminho de atualização: o inválido já gravado passa; o
   inválido novo é recusado com a mensagem no campo (`ActionError(mensagem, campos)` → `fieldErrors`). Vale
   também para a proposta de conta bancária do colaborador do tipo "editar" (a conta atual é o "antes") e
   para o briefing do cliente: valor do cadastro que já estava inválido não é pré-preenchido, e o
   salvamento automático continua gravando o resto, nomeando o campo inválido.
4. **PIX da empresa** (Configurações → Empresa) não tem campo de tipo: na tela é texto livre, e o servidor
   aceita a chave que for válida para algum tipo de PIX, recusando só a inválida que mudou. Grava como foi
   digitada.
5. **Sem biblioteca de máscara**: as regras de validação seriam nossas de qualquer jeito, e uma segunda
   sintaxe de formato poderia divergir do servidor.
6. **Formulário que só coleta e salva usa `FormData`; formulário com campo que reage a outro usa estado**
   (D6). Formulário existente muda de modo só quando a tela já está sendo mexida por outro motivo.
7. **E-mail de login fica de fora**: é do better-auth e não muda de tratamento (cadastro e edição de
   usuário, wizard de contratação, login, recuperação de senha, solicitação de cadastro).

## Alternativas consideradas

- **Gravar só dígitos em tudo.** Rejeitada pelo dono (D3): cada saída impressa (PDF, Estúdio, holerite,
  Excel) teria de formatar de novo, e a que esquecesse imprimiria o número cru.
- **Biblioteca de máscara (react-imask e afins).** Rejeitada (D5): resolve só a digitação; a validação e a
  normalização continuariam nossas, com duas definições de formato para manter iguais.
- **Validar o registro inteiro na edição.** Rejeitada (D4): um cadastro antigo com telefone errado ficaria
  impossível de salvar até alguém corrigir um campo que não veio mexer.

## Consequências

- Um teste-guarda (`src/lib/campos/guarda-campos.test.ts`) reprova `<Input>` cru e `z.` solto nesses
  campos em `src/`; a única saída é o comentário `campo-ok: <motivo>`. É uma rede, não uma prova: não
  enxerga chave dentro de `z.object({ … })` escrito numa linha só nem campo ligado só por `id=`.
- Tipo novo (PIS, CTPS, CNH, título de eleitor, boleto, inscrição estadual…) nasce no catálogo junto com o
  primeiro campo que o usa, com teste (D2).
- Importações de planilha e producers passam o valor por `normalizar` quando ele é válido; o inválido vira
  aviso na prévia e é gravado como veio — a importação não é bloqueada por isso.
- Dados antigos: `scripts/normalizar-campos.ts`, uma vez por ambiente (simulação por padrão, grava com
  `--gravar`, nunca apaga; o inválido vai para um relatório). O documento do cliente não é reescrito, só
  relatado quando inválido.
