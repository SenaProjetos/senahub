# Alterar contratação (RH) — 2026-09-22

## Problema

Não existe forma, pela tela, de mudar a contratação de quem já está cadastrado (efetivar um
estagiário como CLT, passar um PJ para CLT, corrigir um cadastro errado). O guia do RH promete o
contrário ("quem foi estagiário até junho e virou CLT em julho tem dois vínculos"), mas nada cria
esse segundo vínculo hoje. Casos reais em produção que dependem disto: USER_TESTE (papel trocado
para `estagiario`, vínculo continua `clt`), Arthur Magno (CLT sem vínculo nenhum), Gustavo
(contratação `pro_labore` com papel de PJ), 8 pessoas com contratação nula.

## O que já existe (não mudou)

- `aplicarVinculo` (`modules/usuarios/vinculo/service.ts`) já é o ponto único de escrita: encerra
  o vínculo ativo (`motivoFim: "substituido"` por padrão), abre um novo, sincroniza o cache em
  `User` e zera `acessoAte`. Funciona também para quem não tem vínculo nenhum.
- `modules/rh/pessoas/queries.ts` já trata `motivoFim === "substituido"` como "não é
  desligamento" — o motivo por que essa troca não aparece como saída na ficha já está pronto, não
  precisou de mudança.
- `EscalaContratacao` é global por contratação — vínculo novo com outra contratação já pega a
  escala certa.

## Decisões do dono (nesta ordem, uma por vez)

1. **Papel acompanha a contratação, automaticamente.** A action recalcula `User.role` via
   `roleLegadoDe(tipo, contratacaoNova)` (já existente em `mapa.ts`) e grava direto — sem
   confirmação adicional de texto livre. **Salvaguarda aplicada por engenharia, não decidida
   explicitamente pelo dono:** administradores ficam de fora — `admin` não tem eixo de
   contratação no modelo (`mapa.ts`: `criaVinculo: false`, contratação `null`, "o vínculo real é
   definido à mão"), e como `admin` está em `CADASTRO_ROLES`, a tela de ficha É alcançável para um
   admin. Sem esse bloqueio, `roleLegadoDe` devolveria `clt`/`estagiario`/`projetista_pj` para
   quem hoje é `admin`, derrubando o acesso de um administrador como efeito colateral de uma troca
   de contratação. A action recusa com `ActionError` nesse caso. Para `supervisor`/
   `administrativo`/`ti` a troca automática **vale como decidida** — o diálogo mostra o papel
   resultante antes de confirmar, para o RH ver o efeito.
2. **Data retroativa: permitida, com aviso, sem bloqueio.** Reusa o padrão já existente em
   `lancar-ferias-dialog.tsx` (`ultimoMesFechado()` de `rh/banco/queries.ts`): se a data de início
   cai no mês fechado mais recente (ou antes), mostra o mesmo aviso de "banco de horas já fechado
   → rode Recalcular histórico depois", sem impedir o envio.
3. **Mesma contratação (ex.: só troca de setor) também abre vínculo novo.** Comportamento
   uniforme: toda troca passa por `aplicarVinculo`. Não há redirecionamento para a Alteração
   Contratual (cargo/departamento/remuneração) — aquele fluxo continua existindo à parte, para
   quem só quer mexer nesses três campos sem trocar contratação/setor.
4. **Validações por contratação** (auditoria completa abaixo): estágio ≤ 30h semanais (Lei
   11.788, art. 10, II), CLT ≤ 44h semanais (CF, art. 7º, XIII), PJ exige `pjId`, autônomo/RPA
   exige `User.cpf` preenchido, pró-labore sem validação de jornada.
5. **Quem pode: `HR_ADMIN_ROLES`** (admin, supervisor, administrativo) — mesmo gate do
   desligamento. Sem permissão nova, sem migration na semente.
6. **Folha × ponto: corrigido nesta entrega.** `rh/folha/actions.ts` (`gerarHoleritesAutomatico`)
   filtrava por `role: "clt"`; passou a filtrar por `contratacao: "clt"`, mesma axis que
   `ponto/jornada.ts` já usa. Fecha a lacuna que fez o USER_TESTE (papel `estagiario`, contratação
   `clt`) sumir da folha sem sair da jornada CLT.

## Auditoria de campos (etapa aprovada antes de implementar)

Enum `Contratacao`: `clt | estagio | pj | autonomo_rpa | pro_labore` (5 valores, todos avaliados).
Campos disponíveis em `Vinculo`: `contratacao`, `setor`, `cargo` (texto livre), `cargaSemanal`
(Decimal 4,1 — único campo de jornada), `remuneracao`, `pjId`, `dataInicio`, `dataFim`,
`motivoFim`. `User.cpf` existe (opcional). **Não existem no schema:** jornada diária, prazo de
estágio (data-fim prevista), flag PcD, campo de regime integral/parcial.

| Regra | Veredito | Ação |
|---|---|---|
| Estágio ≤ 30h semanais | implementável (`cargaSemanal`) | **Implementado** |
| Estágio ≤ 6h diárias | falta campo (sem jornada diária) | Fora de escopo |
| Estágio ≤ 2 anos, exceto PcD | falta campo (sem prazo previsto, sem flag PcD) | Fora de escopo |
| Estágio 20h/4h e 40h (regimes especiais) | sem campo para escolher o regime | Só relatado, não é bloqueio |
| CLT ≤ 44h semanais | implementável (`cargaSemanal`) | **Implementado** |
| CLT ≤ 8h diárias | falta campo | Fora de escopo |
| CLT tempo parcial | sem campo para distinguir regime | Só relatado, não é bloqueio |
| PJ exige `pjId` | implementável | **Implementado** |
| Autônomo/RPA exige CPF | implementável (`User.cpf`) | **Implementado** |
| Pró-labore sem validação de jornada | confirmado (ausência de regra) | **Implementado** (nenhuma checagem) |

Criar os campos que faltam (jornada diária, prazo de estágio, PcD, regime parcial) é migration
nova — não entra nesta entrega.

## Desenho

- **Regras puras e testadas:** `modules/usuarios/vinculo/troca-contratacao.ts` —
  `validarTrocaContratacao()`, mesma família de `desligamento.ts` (retorna `string | null`).
- **Action com I/O:** `modules/rh/contratacao/actions.ts` — `trocarContratacao`, `defineAction`
  com `roles: HR_ADMIN_ROLES`, `capturarAntes`. Valida com a função pura, chama `aplicarVinculo`
  dentro de uma transação e, se o papel derivado mudar, grava `User.role` no mesmo passo.
- **UI:** `components/rh/trocar-contratacao-dialog.tsx`, ao lado do `DesligarDialog` na
  `pessoa-360-view.tsx` (mesmo gate `podeEditarCadastro && !self`, mas sem depender de
  `podeSerDesligado` — precisa funcionar para quem não tem vínculo nenhum, caso Arthur). Prévia do
  papel resultante antes de confirmar; aviso de banco de horas fechado quando a data cai num mês
  já fechado; `await confirm()` sempre antes do `startTransition`.
- **Folha:** `rh/folha/actions.ts` trocou o filtro de `role` para `contratacao`.

## Fora de escopo (registrado, não implementado)

- Campos novos no schema (jornada diária, prazo de estágio, PcD, regime parcial) e as regras que
  dependem deles.
- Qualquer bloqueio duro para data retroativa (fica só aviso, por decisão do dono).
