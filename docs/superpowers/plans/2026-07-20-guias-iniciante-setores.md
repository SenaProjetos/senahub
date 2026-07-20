# Plano — Guias para iniciantes, um por setor (camada de formação sobre o manual)

- **Data:** 2026-07-20
- **Origem:** guia do Comercial produzido sob demanda (piloto involuntário) → dono pediu o mesmo para os demais setores.
- **Estado:** proposto, aguardando execução da Onda 1.

---

## 1. Decisões travadas (dono, 2026-07-20)

| # | Decisão | Consequência |
| --- | --- | --- |
| D1 | **Fonte da verdade = markdown** em `docs/manual/<secao>/guia-iniciante.md`. O artifact é uma **saída** gerada dele. | Versionado, revisável em PR, aparece no `/ajuda` para **todos os perfis** (inclusive `cliente`), entra na busca. |
| D2 | **Um guia por setor** (9 no total), alinhado às seções que já existem. | Não cria taxonomia nova; reaproveita `SECAO_LABEL` de `lib/manual.ts`. |
| D3 | **Onda 1 = Projetos**, sozinho. | Maior audiência (todos os perfis usam) e jargão próprio denso. Serve de molde para as ondas seguintes. |

---

## 2. Problema

`docs/manual/` já cobre os 9 setores com **62 arquivos** de **referência operacional**:
objetivo, como acessar, permissões, regras de negócio, tabela de erros, FAQ. É excelente
para **consulta pontual** — e pressupõe que o leitor **já conhece o domínio**.

O `comercial.md`, por exemplo, abre com "Gerir o processo comercial: do **lead** no funil
à **proposta** aceita". Quem nunca trabalhou com vendas não sabe o que é um lead, por que
existe um funil, nem qual a ordem natural das coisas. Falta a **camada de formação**:
vocabulário, o *porquê* do processo e o caminho de ponta a ponta.

Não é lacuna do manual — é **outro gênero**, para outro momento de leitura.

---

## 3. Fronteira editorial (a regra que impede duplicação)

Esta é a parte que mais importa. Sem ela, o guia vira cópia piorada do manual.

| Entra no **guia-iniciante** | Fica no **manual de referência** |
| --- | --- |
| O que cada termo **significa** (lead, aging, EAP, período aquisitivo) | Definição de campo a campo da tela |
| **Por que** o processo existe e a ordem natural dele | Regras de negócio exatas |
| Como as telas **se encadeiam** (fluxo entre elas) | O que cada botão faz, isolado |
| Confusões conceituais do setor | Tabela de erros × causa × solução |
| Papéis: quem faz o quê | Matriz de permissões (`recurso:ação`) |

**Regra de ouro:** o guia **liga** para a página de referência, nunca repete. Permissões,
tabelas de erro e detalhe de campo são responsabilidade exclusiva do manual.

---

## 4. Estrutura padrão do guia (derivada do piloto do Comercial)

Seis seções fixas. A numeração só existe onde há sequência real.

1. **A ideia em 30 segundos** — o setor em uma frase + diagrama do fluxo ponta a ponta.
2. **O vocabulário do setor** — glossário dos termos, em linguagem de leigo, com exemplo concreto.
3. **Cada tela, para que serve** — uma ficha por tela: rota, papel, o que você faz ali.
4. **O caminho natural, passo a passo** — a sequência típica, numerada, com o "quem/onde" de cada passo.
5. **Armadilhas do setor** — onde a pessoa se perde (no Comercial: existirem dois pipelines paralelos).
6. **Dúvidas e erros comuns** — as perguntas conceituais, não as mensagens de erro.

O tratamento visual do artifact (tokens, tema claro/escuro, cores semânticas de status,
diagrama em CSS) já está resolvido no piloto e deve ser **reusado como molde**.

---

## 5. Definition of Done (por guia)

Um guia só está pronto quando **todos** os itens abaixo estão feitos:

- [ ] `docs/manual/<secao>/guia-iniciante.md` criado, com frontmatter completo:
      `titulo`, `descricao`, `resumo`, `tags`, `palavras-chave`, `sinonimos`.
- [ ] **Entrada adicionada em `docs/manual/search-index.json`.**
      ⚠️ Sem isso a página **não aparece** no `/ajuda` — `listarSecoes()` lê só o manifesto,
      não varre o disco (`lib/manual.ts:132`).
- [ ] Link no `README.md` da seção e menção no `README.md` raiz ("Comece por aqui").
- [ ] Artifact publicado, favicon **estável**, descrição preenchida.
- [ ] Conteúdo conferido **contra o código**, não contra o manual (ADR-001: "fonte da verdade = código").
- [ ] Deliberação registrada em `docs/manual/deliberacoes/` (processo do Conselho).

---

## 6. Processo de produção (4 fases por guia)

| Fase | O que se faz | Saída |
| --- | --- | --- |
| **A — Inspeção** | Ler `modules/<dominio>/{queries,actions,schemas}.ts`, as rotas em `app/(dashboard)/<setor>/` e os `*-view.tsx`. Levantar o fluxo **real** e a lista de termos. | Lista de telas + glossário bruto |
| **B — Rascunho** | Escrever o `.md` na estrutura da §4. | `guia-iniciante.md` |
| **C — Revisão** | Conferir cada afirmação contra o código. Registrar divergências entre o que a UI promete e o que ela faz. | Lista de gaps |
| **D — Publicação** | `search-index.json`, READMEs, artifact, deliberação. | Guia no ar |

A Fase C tem valor além da documentação. No piloto do Comercial ela revelou que
`Proposta.leadId` nunca era preenchido — o card "Propostas" na ficha do lead e o badge
"N proposta(s)" no funil ficavam **sempre vazios**. Virou correção de código
(`criarPropostaDeLead`). **Documentar para leigo é auditoria de produto disfarçada.**

---

## 7. Onda 1 — Projetos

**Arquivo:** `docs/manual/projetos/guia-iniciante.md`
**Referência existente a linkar (não repetir):** `projetos.md`, `meu-trabalho.md`,
`tarefas.md`, `agenda.md`, `planejamento.md`, `recursos.md`.

**Telas a cobrir:** `/projetos` (carteira + saúde) · `/projetos/[id]` (disciplinas,
pendências, coordenação) · `/projetos/meu-trabalho` · `/tarefas` · `/agenda` ·
`/planejamento` (EAP + caminho crítico) · `/recursos` (matriz de alocação).

**Glossário a construir** (jargão que um leigo não domina):

- **Disciplina** — a frente de engenharia dentro do projeto (Estrutural, Elétrico…), com valor e prazo próprios.
- **Pendência** — item aberto que trava o andamento.
- **EAP / WBS** — a decomposição do projeto em partes numeradas (1.2.3).
- **Caminho crítico (CPM)** — a corrente de tarefas que, se atrasar, atrasa o projeto inteiro.
- **Baseline e desvio** — o plano congelado × o que está acontecendo de fato.
- **Saúde do projeto** — o semáforo `ok / atenção / crítico` (`modules/projetos/health.ts`).
- **Alocação / carga** — quanto do tempo de cada pessoa já está comprometido.
- **Coordenação BIM / apontamento** — a revisão do modelo 3D federado e cada problema marcado nele.

**Fluxo a desenhar:** proposta aceita → projeto criado com disciplinas → planejamento
(EAP, prazos, caminho crítico) → alocação de equipe → execução (tarefas, "meu trabalho")
→ coordenação e pendências → entrega.

**Ponto de atenção já conhecido:** o projeto nasce do **aceite da proposta**
(`aceitarProposta`), que cria disciplinas e canais de chat. O guia de Projetos deve
**começar exatamente onde o guia do Comercial termina** — os dois se encaixam.

---

## 8. Ondas seguintes (ordem sugerida, não travada)

| Onda | Setor | Por quê |
| --- | --- | --- |
| 2 | **Financeiro** | Maior densidade de jargão: aging, conciliação OFX, caixa × competência, aprovações. |
| 3 | **RH e Ponto** | Jargão pesado e juridicamente sensível: encargos, período aquisitivo/concessivo, banco de horas. |
| 4 | **Gestão** | Processo público e contratual: edital, certidão, aditivo. |
| 5 | **Clientes e Comercial** | ⚠️ **Já existe como artifact — falta backportar para `.md`** (ver §9). |
| 6 | Início e Portal · Comunicação · Sistema · Engenharia | Baixa prioridade: pouco jargão, ou público já especialista (Engenharia). |

**Engenharia fica por último de propósito:** quem usa as ferramentas de cálculo é
engenheiro. Não é leigo no domínio — é leigo no *sistema*, e disso o manual de referência
já dá conta.

---

## 9. Dívidas herdadas do piloto (fazer junto com a Onda 1)

1. **Backportar o guia do Comercial para `.md`.** Hoje ele existe **só como artifact**,
   o que viola D1. Precisa virar `docs/manual/clientes-comercial/guia-iniciante.md`
   + entrada no `search-index.json`.
2. **Atualizar `clientes-comercial/comercial.md`** para o botão **Nova proposta** na ficha
   do lead (`criarPropostaDeLead`), que cria o cliente automaticamente quando o lead ainda
   não tem um. O manual atual não menciona.

---

## 10. Riscos

| Risco | Mitigação |
| --- | --- |
| **Drift md ↔ artifact** — o artifact congela enquanto o md evolui. | O md é a fonte (D1). Regerar o artifact é passo obrigatório do DoD; nunca editar só o artifact. |
| **Duplicar o manual de referência.** | Fronteira editorial da §3, aplicada na revisão. |
| **Guia envelhecer junto com a feature.** | Mesma regra que já vale para `docs/manual/`: mudou a feature, atualiza a doc no mesmo PR. |
| **`search-index.json` esquecido** → página invisível. | Item explícito no DoD (§5) e responsabilidade do Revisor Técnico (ADR-001). |
| **Escopo inflar para 27 guias.** | D2 trava em 9. Detalhe por módulo é papel do manual de referência. |

---

## 11. Relacionados

- [ADR-001 — Estrutura da documentação](../../manual/decisions/ADR-001-estrutura-documentacao.md)
- [Manual — portal](../../manual/README.md)
- Piloto (Comercial): artifact publicado em 2026-07-20, a ser backportado (§9).
