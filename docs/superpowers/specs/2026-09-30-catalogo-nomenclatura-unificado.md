# Catálogo de nomenclatura numa tela só

**Data:** 2026-09-30 · **Status:** direção aprovada pelo dono ("opção A, uma lista só com seletor de
versão"); spec aguardando revisão; nada implementado · **Pedido:** ao cadastrar a sub Esgoto (`ESG`)
na v2 em produção, a tela recusou: "A sigla ESG já é de Hidrossanitário na v2". O `ESG` era
**sinônimo** do card Hidrossanitário, e o sinônimo só aparecia num tooltip. O único caminho que
sobrou foi o formulário do card. Lá, "Até a v1" tirou o card **inteiro** da v2, com as quatro subs
dele. A pergunta do dono: "não tem tela demais configurando a mesma coisa?"

Tudo da spec [2026-09-21-nomenclatura-versionada-subdisciplinas](2026-09-21-nomenclatura-versionada-subdisciplinas.md)
continua valendo (D1–D13): versão publicada imutável no modelo do nome, siglas por versão, card ×
sub, validade por versão, acervo não renomeado. Esta spec muda **onde e como** o catálogo se edita,
não as regras dele.

**Vocabulário:**
- *catálogo*: cards (`DisciplinaCatalogo`), subs (`SubdisciplinaCatalogo`), fases e tipos globais
  (`PranchaCatalogo` com `projetoId = null`).
- *linha de sigla*: `SiglaNomenclatura` (sigla, oficial ou sinônimo, faixa de versões).
- *faixa efetiva*: sigla ∩ item ∩ card-mãe. Todos os leitores já usam essa regra (ver §5.1).
- *lente*: o recorte que a tela mostra, uma versão (vN) ou "Todas as versões".

---

## 0. Modelo por fase (ler primeiro)

**Ao iniciar uma fase, a primeira linha da resposta é o modelo esperado. Se o modelo ativo for
outro: PARAR e esperar `/model`.**

| Fase | Modelo | Por quê |
|---|---|---|
| F1: domínio (operações novas, sem espelho, transferência) | **Opus** | Muda a regra de quem é dono da sigla e como sair/voltar mexe nas linhas. Erro aqui chega ao motor de envio. |
| F2: tela, lente vN | **Sonnet** | Desenho fechado aqui; reaproveita o Catálogo da vN de hoje. |
| F3: tela, lente "Todas" + Formatos de folha + rota de versões | **Sonnet** | Lista, filtros, lote e menu de contexto já existem em Disciplinas; é mover, não inventar. |
| F4: retirada das telas antigas + manual | **Sonnet** | Redirecionamentos, código morto, `docs/manual`, `search-index.json`. |
| F5: verificação ponta a ponta | **Sonnet** | Smoke + conferência em 390×844 e 1366×768 com menu aberto. |

Branch `feat/catalogo-unificado` saindo de `dev-vscode` (worktree VS Code, banco
`senahub_remake_vscode`). Um commit por fase no mínimo; `npm run lint` + `npm test` verdes antes de
cada commit. **F1 pode ir para produção sozinha**: ela já desarma a armadilha do ESG na tela de hoje.

---

## 1. Problema

### 1.1 O mesmo dado em vários lugares

| Dado | Onde se edita hoje |
|---|---|
| Card existe na versão | Editar disciplina (Vale a partir da / Até a), Catálogo da vN (tirar/voltar), planilha |
| Sigla oficial por versão | Editar disciplina (Código), Siglas por versão, Catálogo da vN, planilha |
| Sinônimos | Editar disciplina (Sinônimos), Siglas por versão. **O Catálogo da vN não edita.** |
| Sub-disciplinas | Diálogo Sub-disciplinas (com as siglas de cada sub), Catálogo da vN, planilha |
| Fase e tipo | Lista Mestre (com Siglas por versão), Catálogo da vN, planilha |
| Nome, ícone, categoria, ordem, arquivar | Só em Disciplinas / Lista Mestre |

Por baixo convivem **três modelos** para o mesmo dado: as colunas (`codigo`/`sinonimos`, herança da
v1, espelhadas nas linhas enquanto ninguém mexeu por versão), as linhas de sigla com faixa, e a
tabela da versão (`catalogo/versao.ts`). Cada tela fala um deles.

### 1.2 Duas listas com regras diferentes

- **Disciplinas** mostra tudo: todas as versões e as arquivadas (num botão de alternar).
- **Catálogo da vN** mostra só o que vale na vN e está ativo.

No banco não há divergência possível (uma linha por disciplina). Na tela há: depois do incidente,
Hidrossanitário aparecia em Disciplinas e tinha sumido do Catálogo da v2. Quem olha as duas acha
que é bug.

### 1.3 O incidente, passo a passo (produção, 2026-09-30)

1. Catálogo da v2 → "Nova sub-disciplina em Hidrossanitário": Esgoto / ESG. Recusado: "já é de
   Hidrossanitário". A mensagem não diz que é sinônimo; a tela não mostra sinônimos.
2. O Catálogo da vN não tem como tirar um sinônimo. O caminho que sobra é Disciplinas → Editar
   disciplina.
3. "Até a v1" e Salvar. Como as linhas ainda eram o espelho das colunas, elas acompanharam a faixa
   do card: HID, HDR e ESG passaram a valer só na v1, e o card saiu da v2 com as subs AGF, AGQ, DFE
   e AGR.
4. O dono desfez pela sugestão dada (Até → Sem fim, encerrar só ESG na v1, cadastrar Esgoto).

---

## 2. Objetivo e critérios de aceite

Uma tela, uma lista. Cada dado do catálogo tem **um** lugar de edição. Quem depende de versão se
edita olhando a versão; o que não depende (nome, ícone, categoria, ordem, arquivar, excluir) não
pergunta versão. Nenhum formulário tem campo solto de "Vale de/Até", "Código" ou "Sinônimos".

Aceite:

- **A1.** Esgoto/ESG na v2, com ESG sinônimo de Hidrossanitário: o diálogo mostra "ESG é sinônimo
  de Hidrossanitário na v2" e o botão "Tirar de Hidrossanitário a partir da v2 e usar aqui" resolve
  em um clique. Na v1, ESG continua reconhecido como Hidrossanitário.
- **A2.** Não existe caminho na interface que mude a faixa de um item a não ser "Tirar da vN" e
  "Voltar para a vN", na lente da versão.
- **A3.** Para qualquer item, a lente "Todas" mostra exatamente as versões em que ele aparece nas
  lentes vN (teste puro sobre `catalogoNaVersao` × `catalogoTodasVersoes`).
- **A4.** Tirar um card da vN e voltar com ele não perde nem ressuscita sigla sem o usuário ver: o
  "Voltar" lista as siglas que o item tinha, marcadas, e só reabre as que ficarem marcadas.
- **A5.** `/configuracoes/disciplinas` e `/configuracoes/lista-mestre` redirecionam; nenhum link
  interno aponta para elas.
- **A6.** Em 390×844, `document.documentElement.scrollWidth` é 390. Em 1366×768 com o menu
  **aberto**, o cabeçalho não sobrepõe a barra do topo.

---

## 3. Decisões

**E1 — Uma tela: `/configuracoes/nomenclatura/[lente]`.** `[lente]` é o número da versão (`/2`) ou
`todas`. `/configuracoes/nomenclatura` redireciona para a versão mais nova (a que está sendo
preparada; mesmo critério do link que Disciplinas já tem hoje). Título: **"Disciplinas e
nomenclatura"**. Abas na URL (`?aba=disciplinas|fases|tipos|folhas`).

**E2 — Duas lentes, um seletor em lista.** No topo, uma lista suspensa (não uma fila de botões:
as versões vão se acumular com os anos — dono, 2026-09-30). Primeiro item "Todas as versões",
depois as versões da mais nova para a mais antiga, cada uma com o selo "rascunho" ou "vigente".
A lista rola por dentro quando passar de umas oito versões.
- Lente **vN**: o que existe na vN, editável no que é por versão (existir, sigla oficial,
  sinônimos, subs).
- Lente **Todas**: o cadastro inteiro, inclusive arquivados, editável no que **não** é por versão.
  O que é por versão aparece só para leitura (faixa efetiva e histórico de siglas), com "Abrir na
  vN".

**E3 — As linhas de sigla são a única verdade.** A tela deixa de editar as colunas `codigo` e
`sinonimos` (card) e `sigla` e `sinonimos` (fase/tipo globais), e o espelho coluna → linha deixa de
existir para itens globais. **Tirar e voltar um item não mexe nas linhas dele.** É seguro porque
todo leitor já recorta pela faixa efetiva (§5.1): a linha de um card que saiu na v2 não vale na v2
mesmo continuando "da v1 em diante".

**E4 — Voltar é explícito.** "Voltar para a vN" abre um diálogo com as siglas que o item tinha na
última versão em que existiu, todas marcadas. As desmarcadas não voltam. Isso cobre o dado legado
de produção em que o espelho truncou as linhas junto com o item (o caso do passo 3 de §1.3).

**E5 — Transferir sigla na própria tela.** Quando a sigla tem outro dono na vN, o diálogo diz quem
é e **como** (oficial ou sinônimo) e oferece "Tirar de X a partir da vN e usar aqui". É a mesma
regra que a importação da planilha já aplica ("a planilha manda": `encerrar-sigla` no dono antigo).
Se o dono a tem como **oficial**, o botão avisa que X fica sem sigla na vN (confirmação). Se o
conflito estiver só numa versão **posterior** a vN (linha do outro que começa depois), a tela recusa
como hoje, dizendo a versão. Não apaga linha de versão futura como efeito colateral.

**E6 — Código interno ("Pasta dos arquivos") editável só enquanto ninguém usa.** A coluna
`codigo` é a pasta e o prefixo no storage (`uploads/caminho.ts`, `/api/uploads`: `…/{projeto}/HID/`,
arquivo `HID-…`), além de alimentar Comercial e Modelos de EAP. Não é a sigla de versão nenhuma.
Nasce na criação: é a sigla se ela estiver livre, regra que `card-novo` já segue. No lápis aparece
como "Pasta dos arquivos":
- **nenhum projeto usa a disciplina** (`uso = 0`): campo editável, validado como hoje (formato,
  único entre os cards). Serve para corrigir um erro logo depois de criar;
- **algum projeto usa**: campo travado, com o motivo "Em uso em N projetos: mudar agora separaria
  os arquivos em duas pastas." O servidor recusa com a mesma frase (a tela pode estar velha).

Mudar o código **nunca** mexe nas linhas de sigla (E3). *(Dono, 2026-09-30, P1.)*

**E7 — Criar só com versão.** "+ Disciplina", "+ Sub", "+ Fase", "+ Tipo" na lente vN criam a
partir da vN. Na lente Todas, o botão pergunta a versão (padrão: a mais nova). Some o
`criarDisciplinaCatalogo` com colunas + espelho; o único caminho é a operação `card-novo` (e
`sub-nova`, `item-novo`).

**E8 — Ações por lente.** Lente vN: Siglas nesta versão, + Sub (no card), Tirar da vN, Voltar
(seção "Saem na vN"), Editar (lápis). Lente Todas: Editar, Arquivar/Desarquivar, Excluir, Subir/Descer,
Abrir na vN, e as ações em lote de hoje (arquivar, excluir). Arquivar e excluir valem para **todas**
as versões, por isso não aparecem na lente vN, onde "Tirar da vN" é a ação de remover.

**E9 — O lápis edita só o que não é por versão.** Card: nome (com o cascateamento de
`disciplinaTextoLegado` que existe hoje), categoria, ícone, pasta dos arquivos (regra da E6),
numeração (só aparece se alguma versão numera por faixa, regra atual). Sub, fase e tipo: nome.
Nada de faixa, sigla ou sinônimos.

**E10 — Permissões não mudam.** Cada ação mantém o par de hoje: cadastro do card em
`projetos:gerir` (`catalogoBase`), operações de versão, subs e Lista Mestre em `configuracoes:gerir`.
A página abre com `configuracoes:disciplinas` **ou** `configuracoes:gerir`. A tela omite o que o
perfil não pode fazer (ADR-0002). Sem par novo, sem migração de permissão, sem `db:seed`.

**E11 — Formatos de folha viram aba sem versão.** `folha` (A1, A3…) não entra no nome do arquivo
nem tem vocabulário por versão. A aba esconde o seletor de versão e edita como a Lista Mestre faz
hoje. **A Lista Mestre do projeto (Personalizado, `nomenclatura-projeto-dialog.tsx`) não muda.**

**E12 — Versões têm rota própria: `/configuracoes/nomenclatura/versoes`.** Criar rascunho, modelo do
nome, publicar com a trava do D5. É a tela de versões de hoje, só mudada de endereço, aberta pelo
botão "Versões" no cabeçalho. Não lista disciplinas, então não duplica nada.

---

## 4. Desenho da tela

### 4.1 Estrutura

```
Disciplinas e nomenclatura                          [+ Disciplina]  [Versões]  [⋯]
Versão  [ v2 — PROJ-SENA-DIS-ETP   rascunho  ▾ ]
          ├ Todas as versões
          ├ v2 — PROJ-SENA-DIS-ETP   rascunho   ✓
          └ v1 — Padrão original     vigente
[Disciplinas]  [Fases]  [Tipos]  [Formatos de folha]
ⓘ A v2 é rascunho: nada daqui vale para projeto nenhum até ser publicada.
38 disciplinas · 41 subs — em relação à v1: 12 entram, 3 saem, 4 siglas novas
```

`CabecalhoPagina` é o primeiro elemento. Ações: "+ Adicionar" (o rótulo segue a aba) e "Versões";
no `⋯`: "Importar planilha" (só lente vN). Seletor e abas vêm **depois** do cabeçalho. Filas de
botões com `flex-wrap`.

### 4.2 Lente vN (aba Disciplinas)

```
CIVIL
  Hidrossanitário    CARD   HID  +HDR                         [+]  [⋯]
    Água fria        SUB    AGF        novo na v2                  [⋯]
    Esgoto           SUB    ESG        novo na v2                  [⋯]
  Estrutural         CARD   EST  +ESTR                        [+]  [⋯]
▸ Saem na v2 (3)
```

- Agrupado por categoria, como Disciplinas hoje; subs aninhadas no card.
- Sigla oficial em selo; **sinônimos visíveis** ao lado (`+HDR`), nunca só em tooltip.
- Selo de situação de hoje: "novo na vN", "sigla nova (era X)".
- `⋯` e botão direito: Siglas nesta versão, Editar, Tirar da vN.
- Fases e Tipos: mesma linha, sem a coluna CARD/SUB.
- "Saem na vN" continua; "Voltar" abre o diálogo de E4.

### 4.3 Lente Todas

```
CIVIL                                         busca · categoria · [ ] arquivadas
  Hidrossanitário    CARD   v1 em diante     HID · HDR · ESG (só v1)   12 proj.  [⋯]
    Água fria        SUB    a partir da v2   AGF
  Acústica  arquivada CARD   só v1            ACU                         3 proj.  [⋯]
```

- Faixa **efetiva** do item (item ∩ card-mãe), em texto.
- Siglas com a faixa efetiva quando ela difere da do item ("ESG (só v1)"). Clicar abre o histórico
  completo, só para leitura (substitui o diálogo Siglas por versão).
- Seleção em lote, busca, filtro de categoria e "arquivadas" saem da tela Disciplinas de hoje.

### 4.4 Diálogo "Siglas de Hidrossanitário na v2"

```
Oficial     [HID     ]
Sinônimos   HDR ✕   ESG ✕   [ + sinônimo ]
Vale a partir da v2. Na v1 fica como está.
                                    [Cancelar]  [Salvar]
```

Salvar manda **um** pedido com a lista de operações (`sigla-nova` se a oficial mudou,
`sinonimo-novo` para cada sinônimo novo, `encerrar-sigla` para cada removido), gravado numa
transação. Promover um sinônimo do próprio item a oficial encerra a linha de sinônimo dele.

### 4.5 Conflito

A página entrega ao cliente o `CatalogoSnap` (dezenas de itens, já é o que `catalogo/queries.ts`
carrega). O diálogo roda `simular` + `colisoes` no navegador e mostra o conflito **antes** de
salvar, no próprio diálogo (não em toast):

```
⚠ ESG é sinônimo de Hidrossanitário na v2.
   [Tirar de Hidrossanitário a partir da v2 e usar aqui]
```

O servidor recalcula o plano contra o banco do momento, como a importação já faz, e recusa se o
estado mudou desde que a tela abriu.

### 4.6 Menu de contexto (ADR-0002)

Descritor puro `itensDaLinhaCatalogo({ lente, linha, pode })` em
`modules/projetos/nomenclatura/catalogo/acoes.ts`, testado. O mesmo array alimenta `LinhaComMenu`,
`BotaoAcoes` e `BarraSelecao` (só lente Todas). Ações proibidas pelo perfil são omitidas; proibidas
pelo estado ficam desabilitadas com a frase do `ActionError` (ex.: "Tirar da v2" num card em uso,
criado na própria v2). Componentes de linha no nível do arquivo, nunca dentro do pai.

---

## 5. Domínio (o que muda no código)

### 5.1 Por que tirar o espelho é seguro

Todo leitor de linha de sigla já recorta pela faixa efetiva:
- motor de envio: `catalogosDaVersao` (`uploads/nomenclatura/siglas-versao.ts`) filtra card, sub e
  card-mãe por `valeNaVersao` antes de ler as siglas;
- trava D5: `todasAsSiglasComRotulo` (`siglas-queries.ts`) intersecta a linha com item e card-mãe;
- colisão: `colisoes` (`catalogo/versao.ts`) usa `faixasDoItem`.

A F1 adiciona um teste-guarda: item que sai na v2 com linha "da v1 em diante" não contribui sigla
para a v2 em nenhum desses três.

### 5.2 `catalogo/versao.ts` (puro) e `service.ts`

- `sinonimo-novo { alvo, sigla }`: linha `oficial: false` a partir da vN.
- `encerrar-sigla` passa a ser aceita pela action avulsa (hoje só a importação gera).
- `sai` / `entra` param de chamar `comFaixa`/`mudarFaixa` com espelho: mudam só a faixa do item.
- `entra { alvo, siglas?: { sigla, oficial }[] }` (F1): as siglas escolhidas valem na vN — as que
  valem e não foram escolhidas são encerradas; as que faltam abrem a partir da vN.
  `siglasParaVoltar` oferece as da última versão em que o item existia; `conferirVoltas` (servidor)
  recusa sigla que o item não tinha, papel trocado, repetida ou mais de uma oficial.
- `planejarTransferencia(snap, versao, ops, versoes)`: devolve os `encerrar-sigla` dos donos que
  colidem **na vN**, ou a colisão que sobra (versão posterior), que vira recusa. "Conflito desta
  edição" = colisão com **dono novo** (`colisoesNovas`, compara antes × depois): pega a sigla da sub
  que volta a valer com o card e ignora colisão antiga sem mudança. A importação usa a mesma regra.
- `catalogoTodasVersoes(snap)`: cada item com faixa efetiva e histórico de siglas efetivo (lente
  Todas) — fica para a F3.
- Formulário antigo (até a F4): `siglasSaoEspelho` compara pela faixa efetiva; mudar só a validade
  não corta linha e ampliar regrava o espelho na união das faixas (`faixaDoEspelho`), reabrindo
  linhas que o espelho antigo cortou; ampliar continua checando colisão (`linhasParaChecarColisao`).

### 5.3 Actions

- `alterarCatalogoNaVersao` (F1) recebe `operacoes: Operacao[]` (até 50) e `transferencias:
  string[]` — os ids de `plano.encerrar` que a tela mostrou e a pessoa confirmou. O servidor
  recalcula o plano e recusa ("recarregue e confirme a transferência") se aparecer dono que não está
  na lista; os ids entram na auditoria. A mensagem de recusa diz "oficial" ou "sinônimo" e a versão.
- Cadastro sem versão, ações novas e estreitas: `editarCadastroDisciplina { id, nome, categoria,
  icone, codigo, numeracao, numeracaoFim }` (leva o cascateamento de nome de
  `editarDisciplinaCatalogo`; `codigo` diferente do atual só passa com `uso = 0`, E6),
  `editarNomeSubdisciplina`, `editarNomeItemListaMestre`. Arquivar, excluir, mover e renomear
  categoria continuam como estão.
- Auditoria de graça pelo `defineAction`; `capturarAntes` nas três ações novas.

### 5.4 O que não muda

Importação da planilha (já fala a língua da versão), Lista Mestre do projeto e as colunas dos itens
**do projeto**, motor de envio, geradores de nome, trava D5, modelo do nome.

---

## 6. O que sai (F4)

- Página `/configuracoes/disciplinas` → redireciona para `/configuracoes/nomenclatura/todas`.
- Página `/configuracoes/lista-mestre` (global) → redireciona para
  `/configuracoes/nomenclatura/<mais nova>?aba=fases`.
- `/configuracoes/nomenclatura` (lista de versões) → vira `/configuracoes/nomenclatura/versoes`.
- `SubdisciplinasDialog`, `SiglasVersaoDialog`, `ValidadeVersaoCampos` e o modo global de
  `ListaMestreConfigView`, se ficarem sem uso.
- Actions sem chamador depois da troca (`criarDisciplinaCatalogo`, `criarSubdisciplina`,
  `editarSubdisciplina`, `criarSiglaVersao`, `encerrarSiglaVersao`, `reabrirSiglaVersao`,
  `excluirSiglaVersao`, a parte global de `pranchas/catalogo-actions.ts`). Conferir com grep antes de
  apagar; o que ainda tiver chamador fica.
- `decidirSiglasAoSalvar`/`espelharSiglasDasColunas` ficam só para itens do projeto.
- Configurações (índice): os cartões Disciplinas e Lista Mestre viram um, "Disciplinas e
  nomenclatura".
- Manual: `docs/manual/sistema/configuracoes.md`, `docs/manual/projetos/projetos.md`,
  `docs/manual/novidades.md` e `search-index.json`.

---

## 7. Fases

**F1 — Domínio (Opus).** §5.2 e §5.3 (operações em lista, transferir, sinônimo, entra com
reabrir, sem espelho). A tela de hoje (`catalogo-versao-view.tsx`) ganha só o mínimo para usar: os
sinônimos visíveis, o diálogo de siglas da §4.4 e o conflito da §4.5. Testes puros + teste-guarda
da §5.1. **Entregável sozinho em produção.**

**F2 — Lente vN (Sonnet).** Rota `/configuracoes/nomenclatura/[lente]`, seletor, abas, agrupamento
por categoria, lápis da E9, descritor da §4.6, "Voltar" com E4.

**F3 — Lente Todas + Formatos de folha + rota de versões (Sonnet).** §4.3, lote, filtros, aba
Folhas (E11), `/versoes` (E12), "+ Disciplina" perguntando a versão (E7).

**F4 — Retirada (Sonnet).** §6 inteira.

**F5 — Verificação (Sonnet).** `npm run smoke:catalogo-nomenclatura` (novo): A1, A2, A4 contra o
banco de dev; puppeteer só-leitura para A6; build + lint + test.

---

## 8. Testes

- Puros (`versao.test.ts`, `acoes.test.ts`): `sinonimo-novo`; remover sinônimo; promover sinônimo;
  transferir de sinônimo e de oficial; conflito só em versão posterior recusa; `sai` não toca
  linhas; `entra` com `reabrir` parcial; `catalogoTodasVersoes` × `catalogoNaVersao` para cada
  versão (A3); descritor por lente e por perfil.
- Teste-guarda da §5.1 (motor, D5, colisão).
- Smoke `smoke:catalogo-nomenclatura`: o cenário do incidente inteiro (ESG sinônimo → Esgoto na v2 →
  v1 intacta); tirar e voltar um card com e sem reabrir siglas; ação de lápis não mexe em linha nem
  faixa; pasta dos arquivos muda com `uso = 0` e é recusada com `uso > 0`.

---

## 9. Riscos

- **R1 — Linhas truncadas pelo espelho antigo** (item que saiu pelo formulário e ainda não voltou):
  o "Voltar" da E4 mostra o que havia e deixa escolher. Item que já voltou não precisa de nada.
- **R2 — Leitores das colunas** (`planejamento/modelos/service.ts`, `documentos-agrupados.ts`,
  `pranchas/queries.ts`) não enxergam siglas novas da v2. **Já é assim hoje**: o Catálogo da vN não
  atualiza colunas. Não é regressão; fica anotado em §10.
- **R3 — Links e favoritos para as rotas antigas**: redirecionamento permanente (A5).
- **R4 — Lente Todas com faixa crua confundiria** (linha "v1 em diante" num card que saiu na v2):
  por isso a lente mostra só a faixa efetiva.

---

## 10. Fora do escopo

- Contração das colunas `codigo`/`sinonimos` (DROP) e migrar os leitores da R2 para as linhas.
- Lista Mestre do projeto (Personalizado) e tela de Extensões.
- R1 da spec de 2026-09-21 (Comercial resolve disciplina pelo nome).

---

## 11. Perguntas ao dono (com o padrão que a spec assume)

- **P1 — Código interno (pasta dos arquivos).** **Decidido (dono, 2026-09-30):** editável enquanto
  nenhum projeto usar a disciplina; travado com o motivo depois disso (E6).
- **P2 — Lente ao abrir a tela.** **Decidido (dono, 2026-09-30):** versão mais nova, mesmo
  rascunho (é a que está sendo montada).
- **P3 — Transferir sigla OFICIAL de outro item.** **Decidido (dono, 2026-09-30):** permite, com
  confirmação dizendo que o outro fica sem sigla na vN (igual à planilha).

Mockup: artifact `2YtpNHYrCbRPNLDJ8mQRMR` (lente v2, lente Todas, diálogos de conflito, siglas,
voltar, lápis e celular). Depois de aprovado, o mockup é contrato: desvio só com OK prévio.
