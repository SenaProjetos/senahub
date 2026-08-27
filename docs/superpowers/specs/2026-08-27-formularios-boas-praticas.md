# Formulários — auditoria de boas práticas de UI/UX

**Data:** 2026-08-27 · **Status:** diagnóstico (nada implementado) · **Branch alvo:** `dev`

Mede o estado atual dos formulários do SenaHub contra uma lista de boas práticas de formulário
(comportamento de campo, validação, layout). **Nenhuma linha de código foi alterada** — a decisão
de escopo ficou explicitamente para depois.

Continuação natural de `InputMoeda`/`InputPercentual` (commits `95ec511`, `8ba2ed9`), que
padronizaram *entrada de valor*. Este documento trata do resto do formulário: rótulo, erro,
obrigatoriedade e layout.

---

## 1. O achado que muda a prioridade

**Todas as actions já devolvem `fieldErrors`. Zero componentes consomem.**

`lib/with-action.ts:86-92` faz:

```ts
const parsed = config.schema.safeParse(raw);
if (!parsed.success) {
  return {
    ok: false,
    error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
  };
}
```

O tipo `ActionResult` declara `fieldErrors?: Record<string, string[]>` desde sempre
(`with-action.ts:11`). Um grep por `fieldErrors` em `src/components` e `src/app` retorna
**0 arquivos**.

O padrão real é `toast.error(r.error)` — **202 arquivos** em `src/components`. O usuário vê a
primeira mensagem do Zod num toast que desaparece, e nunca descobre *qual* campo está inválido.

E o estilo de erro já existe no primitivo (`components/ui/input.tsx`):

```
aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20
dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40
```

Dos três pedaços necessários para erro por campo — **dado, estilo, ligação** — dois já estão
prontos e ninguém ligou o fio. Não é refatoração: é consumir o que a camada de action já entrega.

O mesmo primitivo também já resolve o primeiro item da lista (destaque visual no foco), via
`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`.

---

## 2. Estado por prática

| Prática | Estado | Evidência |
|---|---|---|
| Destaque visual no foco | **Pronto** | `focus-visible:*` no `Input` |
| Espaçamento / agrupamento | **OK** | `space-y-*` consistente; cards por seção |
| Campo de data | **Defensável como está** | `type="date"` nativo em 47 arquivos |
| Mensagem de erro sob o campo | **Ausente** | 202 arquivos com toast · 0 com `fieldErrors` |
| Campo obrigatório sinalizado | **Inconsistente** | 5 atributos `required` no sistema todo |
| Rolagem até o primeiro erro | **Ausente** | 0 ocorrências |
| Barra de ações fixa | **Ausente** | 0 `sticky bottom-0` / `fixed bottom-0` |
| Placeholder não é label | **Violado** | ~193 inputs sem rótulo associado |

### Sobre datas — por que "defensável" e não "gap"

`type="date"` nativo no Chrome/Windows já entrega o que a prática pede: máscara `dd/mm/aaaa`
consistente com o locale, calendário ao clicar no ícone **e digitação livre**. A digitação livre é
justamente a ressalva da própria prática sobre data de nascimento ("não force o date picker").
Um componente próprio só se justifica se aparecer necessidade concreta — intervalo de datas,
atalhos ("próximos 30 dias"), bloqueio de dias não úteis. Trocar por trocar seria regressão de
acessibilidade e de teclado.

### Sobre os ~193 inputs sem rótulo — limites do número

O número vem de uma heurística: procura `<Label`/`aria-label` numa janela de 14 linhas ao redor de
cada `<Input>`/`<InputMoeda>`/`<InputPercentual>` que tenha `placeholder`. **Parte dos casos é
legítima** — linhas de tabela onde o `<TableHead>` faz o papel de rótulo da coluna. O número serve
para localizar concentração, não como contagem de defeitos.

Concentração real:

| Arquivo | Inputs sem rótulo |
|---|---|
| `components/licitacoes/licitacao-detail-view.tsx` | 52 |
| `components/rh/wizard-cadastro-funcionario.tsx` | 18 |
| `components/documentos/editor/propriedades.tsx` | 9 |
| `components/custos/orcamento/busca-banco-dialog.tsx` | 8 |
| `components/licitacoes/sancoes-view.tsx` | 7 |

### Formulários longos (onde barra fixa e scroll-para-erro pesam)

Contagem de campos (`Input|InputMoeda|InputPercentual|Select|Textarea|Checkbox`) por arquivo:

| Arquivo | Campos |
|---|---|
| `components/licitacoes/licitacao-detail-view.tsx` | 81 |
| `components/documentos/editor/propriedades.tsx` | 32 |
| `components/juridico/juridico-view.tsx` | 30 |
| `components/rh/wizard-cadastro-funcionario.tsx` | 25 |
| `components/clientes/cliente-form.tsx` | 18 |

`licitacao-detail-view.tsx` aparece no topo das três listas (81 campos, 52 sem rótulo, o maior
arquivo de UI do sistema). Qualquer onda de trabalho deveria tratá-lo como caso próprio, não como
mais um item de lista.

---

## 3. Por que não existe "aplicar em todos" barato aqui

Diferente de `InputMoeda`/`InputPercentual`, onde a migração foi troca de componente com contrato
`value`/`onChange` idêntico, os 202 arquivos com `toast.error` **não são substituição mecânica**:
cada formulário tem seu próprio fluxo de submit (`useTransition` + `start(async () => ...)`), e
ligar `fieldErrors` exige guardar o resultado em estado, associar chave do Zod → campo do JSX e
decidir onde a mensagem cabe no layout.

O caminho viável é criar **um padrão** (hook + componente de mensagem), aplicá-lo em 3–4
formulários de referência e migrar o resto por demanda — não um mutirão.

---

## 4. Opções de escopo (nenhuma escolhida)

**A. Erro por campo** — hook que guarda o `ActionResult`, marca `aria-invalid` no campo com erro,
renderiza a mensagem sob ele e rola até o primeiro. Reusa dado e estilo que já existem. Maior
ganho por esforço; destrava também "obrigatório que não deixa dúvida" e "rolagem até o erro".
Aplicar primeiro em `cliente-form`, wizard do RH e um caso de licitações como referência.

**B. Formulários longos** — barra de ações `sticky bottom-0` + rolagem até o primeiro erro nos 5
arquivos da tabela. Ganho concentrado e visível; não resolve a mensagem de erro em si.

**C. Placeholder → label** — rótulo de verdade nos dois arquivos que concentram 70 casos. Mais
mecânico, mas mexe em layout de linha estreita (as linhas inline de `licitacao-detail-view` foram
desenhadas assumindo que placeholder é o rótulo; virar `<Label>` muda a altura das linhas).

**D. Marcação de obrigatório** — convenção única (asterisco no `Label` + `aria-required`), hoje
inexistente de forma consistente: 5 `required` no sistema.

---

## 5. Decisões pendentes

1. **Ordem das ondas** — A destrava mais coisa, mas C é a mais visível para quem usa.
2. **`licitacao-detail-view.tsx` vira arquivo próprio de trabalho?** 81 campos num arquivo, topo
   das três listas. Tratar junto com os outros provavelmente inviabiliza a onda.
3. **Validação em tempo real, onde?** A prática recomenda para campo simples (e-mail, telefone) e
   só no envio para complexo (CPF/CNPJ). Hoje o sistema valida **só no envio, no servidor**.
   Validar no cliente significa duplicar regra de Zod no browser — decidir se vale, e se vale,
   se o schema passa a ser compartilhado em vez de reescrito.
4. **Barra fixa convive com o layout atual?** O `(dashboard)` já tem sidebar + header; uma barra
   `sticky bottom-0` precisa de teste em telas pequenas antes de virar padrão.

---

## 6. O que este documento NÃO afirma

- Não afirma que os formulários estão ruins. Foco, espaçamento e agrupamento estão corretos, e o
  primitivo de `Input` está bem construído — o problema é dado disponível e não usado.
- Não mediu **acessibilidade** além de rótulo (`aria-describedby` da mensagem de erro, ordem de
  foco, anúncio em leitor de tela). O agente `a11y-auditor` cobre isso e não foi rodado.
- Não mediu formulário em **tela pequena** de verdade — a coluna "layout adaptável" da prática
  original ficou fora da tabela por falta de verificação, não por estar OK.
