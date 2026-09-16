# Motor de reconhecimento de nomenclatura de arquivos

**Data:** 2026-09-15 · **Status:** planejado; F0 (diagnóstico + backfill de fase) executada em
produção · **Pedido:** "quero o máximo de reconhecimento automático dos arquivos, como numeração,
fase, disciplina, projeto" — a partir de um prompt genérico de 68 seções, filtrado contra o que
o SenaHub já tem e contra dado real de produção.

Regras transversais em [ADR-0003](../../adr/0003-motor-nomenclatura-so-acrescenta-metadado.md)
— ler antes de qualquer fase.

**Vocabulário desta spec:** *sinônimo* = sigla alternativa que aponta para um item de catálogo
(`DTC` → `DET`). Não confundir com *apelido*, que no código já significa documento absorvido por
merge (`DocumentoDisciplina.substituidoPorId`).

---

## 0. Modelo por fase (ler primeiro)

**Ao iniciar uma fase, a primeira linha da resposta é o modelo esperado. Se o modelo ativo for
outro: PARAR e esperar `/model`.**

| Fase | Modelo | Por quê |
|---|---|---|
| F1 — motor puro | **Opus** | Núcleo novo, regras de ambiguidade, pontuação; formato que as outras fases consomem. Erro aqui se replica. |
| F2 — schema + catálogos | **Sonnet** | Aditivo e mecânico, com o desenho fechado aqui. Rodar `prisma-migration-reviewer`. |
| F3 — integração no envio | **Opus** | Mexe na rota de upload (revisão, documento lógico, precedência), no diálogo e na ação "nova versão de". |
| F4 — lista V2, papel do PDF, backfill | **Sonnet** | Consome F1–F3 com formato provado. |
| F5 — editor visual do padrão | **Sonnet** | UI sobre o compilador de padrão já feito na F1. |
| F6 — índice de `.zip` (opcional) | **Opus** | Leitura de arquivo não confiável (zip bomb, caminhos); só se F1–F5 provarem necessidade. |

Branch: `feat/motor-nomenclatura` saindo de `dev` (multi-sessão, com schema). Um commit por
fase no mínimo. `npm run lint` + `npm test` verdes antes de cada commit.

**Pré-requisito de deploy:** produção roda **v1.17.0**; `origin/master` já está 42 commits à
frente (6 migrations) sem deploy. Tudo que depende de `faseDoNomeArquivo`/`de498d22` só existe em
produção depois desse deploy. Scripts avulsos para produção só podem importar o que a versão
instalada exporta.

---

## 1. Evidência (produção, 2026-09-15)

Fonte: `scripts/diagnosticar-nomenclatura.ts` e `scripts/verificar-fase2-documentos.ts`.

- **Acervo:** 987 uploads ativos, 0 órfãos, 0 sem revisão, merge completo; 536 documentos
  vivos visíveis na V2.
- **Reconhecimento da regra atual:** 36% dos documentos (fase do nome sempre no catálogo quando
  reconhece); **tipo no catálogo só 12,9%**; fase gravada em 2 documentos (0,4%).
- **Backfill de fase (F0) aplicado:** 217 documentos (EX 153, BS 51, AP 13); ids em
  `F:\SenaHub\preencher-fase-documentos-2026-09-15225222.json`. 440 continuam sem fase.
- **Separadores:** só hífen 70%, com espaço 16%, hífen+underscore 10%, só underscore 3%.
- **Famílias mais comuns** (`L`=letras, `N4`=4 dígitos, `X`=misto):

  | Qtd | Família | Exemplo (estrutura) |
  |---:|---|---|
  | 103 | `X-L-L-N4-L` | `26001.1-EST-EX-4001-DTC` — subprojeto, sem revisão |
  | 91 | `N6-L-L-N4-L` | `260020-HDR-EX-6011-DTC` — disciplina por sinônimo |
  | 52 | `N6-L-L-N4-L-X` | `260020-EST-EX-4000-DE-R00` |
  | 51 | `L_L-L-L-N3-L-L-X` | `CGA_GAS-SPD-PE-004-GER-PLAEXE-R00` — padrão de terceiro |
  | 32 | `L-X-L-L-N3-X` | `EM-LUC11-HID-PB-001-R02` — padrão de terceiro |
  | 21 | `N5-L-L-N4-L-X` | `26013-ELE-EX-5003-MD-R00` — código com sequencial de 3 dígitos |
  | 15 | `L-L-L-N3-L-X` | `PICTS-ELE-EX-000-MED-R00` |
  | 14 | `X-L-L-N4-X` | `26001.2-EST-EX-4005-M3D` |
  | 6 | `N5_L_L_L_N4_X` | `26019_EST_EX_DTC_4003_R00` — tipo antes do número |
  | ~20 | com `[cópia AAAA-MM-DD_NN]` | backups do AltoQi |

- **Siglas fora do catálogo mais frequentes:** `DTC` 133, `DE` 73, `PE` 52, `HDR` 38, `MED` 15,
  `PB` 14, `PLQ` 14, `CAB` 9, `MD` 7, `ESG` 7, `DT` 6, `INC` 5, `LME` 5, `EXE` 4.
- **Código do projeto:** a regra ano (2 dígitos) + sequencial bate em 94% dos nomes que começam
  com número; 128 documentos (24%) têm subprojeto (`.N`, e 4 com `-N`). Divergências reais são
  **projetista que salvou com o número errado** (`26027-…` dentro do projeto 260032).
- **Faixa de numeração:** 49% dos números de 4 dígitos caem na faixa da própria disciplina.
  Casos "de outra disciplina" legítimos: arquivo `DRE` dentro da disciplina Hidrossanitário.
  Falsos positivos: o ano `2026` de `[cópia 2026-…]` lido como número.
- **Extensões:** pdf 440, dwg 308, ifc 66, docx 43, xlsx 39, qibzip 20 (3 GB), bak 19, zip 12,
  log 10, rvt 8, doc 5, rar 4, png 4, ed3 3, txt/html/xls 2, rte 1. **Nenhum `.tqs`** — a pasta
  do TQS é enviada compactada em `.zip`/`.rar`.
- **Backup do modelo:** 25 no pacote B, todos visíveis; mais 14 `qibzip`/`zip`/`rar` caíram em
  OUTROS por terem sido enviados como "Pranchas e arquivos". **Nenhum backup do AltoQi versiona**:
  cada `[cópia …]` vira documento novo.
- **Bug em produção:** o padrão global de nomenclatura está cadastrado como
  `{proj}-{disc}-{fase}-{nº}-{tipo}` (e um projeto com `…-{Rnn}`). `foraDoPadrao` faz
  `new RegExp(padrao)`, que nunca casa → **todo arquivo do pacote A é marcado "fora do padrão"**.
  Mitigação sem deploy (apagar o texto do padrão em Configurações → Nomenclatura) foi
  **oferecida e recusada** em 2026-09-15 — produção segue com o alerta falso até a F0b.

---

## 2. Decisões (fechadas com o dono em 2026-09-15)

**D1 — Catálogo.** O catálogo do escritório é o de produção (fases `PL AP BS EX LG AB`; tipos
`M3D DET MEM MEC PQT PMT DOC LMS`; folhas `A0–A4`). Projetos antigos com outro vocabulário usam o
catálogo por projeto (já existe) e o padrão do projeto. **Catálogo do projeto vence sinônimo
global.**

**D2 — Sinônimos iniciais** (carregados por migration, editáveis depois):

| Categoria | Sinônimos → sigla |
|---|---|
| Tipo | `DE`, `DTC` → `DET` · `MED`, `MD` → `MEM` · `PLQ` → `PQT` · `LME` → `LMS` |
| Fase | `PE`, `EXE` → `EX` · `PB` → `BS` |
| Disciplina | `HDR`, `ESG` → `HID` · `CAB` → `LOG` · `INC` → `PCI` |

**D3 — Código do projeto** = ano com 2 dígitos + sequencial do projeto (`2527` → ano 25, seq 27;
`26013` → 26/13; `260032` → 26/32), com subprojeto opcional `.N` ou `-N`. O projeto do documento
**sempre** vem da disciplina do envio; o código do nome só gera aviso de divergência.

**D4 — Renumeração autorizada no envio.** Código de projeto divergente → a revisão do envio
oferece o nome com o código corrigido (troca **só** o token do código, preservando o resto).
Nunca automático.

**D5 — Campos guardados e filtráveis:** tipo, fase (já existe), disciplina (já existe, pelo
envio), **número da prancha**, **tamanho do papel** (A0–A4, para a Lista Mestre), extensão
(filtrável por categoria via catálogo de extensões). Pavimento, bloco, torre, elemento estrutural
e data **não** são guardados na v1.

**D6 — Faixa de numeração** segue o catálogo à risca (5100–5199 = LOG). **Sigla explícita no nome
vence número**; faixa só decide disciplina quando não há sigla, e divergência vira aviso.

**D7 — Automação no envio:** fase e tipo com confiança alta preenchem sozinhos (editáveis);
disciplina divergente, pacote Backup e renumeração são só sugestão.

**D8 — Acervo:** o motor roda também sobre o que já foi enviado (backfill só em campo vazio).

**D9 — Softwares da carga inicial:** TQS, CAD, AltoQi, CYPE, Revit, Office.

**D10 — Nova versão de documento com nome diferente** entra no plano (cópias do AltoQi,
renumeração).

---

## 3. Arquitetura

### 3.1 Onde mora

```
src/modules/uploads/nomenclatura/     (F1, entregue)
  normalizar.ts           # acento e caixa; nunca altera o nome original
  estrutura-nome.ts       # regras estruturais: sufixo de cópia, datas, revisão, código de projeto
  extensoes.ts            # tipo ExtensaoDef + leitura/classificação da extensão
  extensoes-iniciais.ts   # carga inicial do catálogo de extensões (semente da F2)
  sinonimos-iniciais.ts   # sinônimos de D2 (semente da F2; hoje alimenta motor e diagnóstico)
  vocabulario.ts          # dicionário a partir dos catálogos (precedência projeto > global, faixa)
  padrao.ts               # compila o padrão do projeto: modelo {proj}-{disc}… e regex legada
  interpretar.ts          # orquestra tudo; devolve Interpretacao
  *.test.ts
src/test/catalogo-nomenclatura.ts     # catálogo de produção + sementes, para os testes
```

O nome é `estrutura-nome.ts` para não colidir com `modules/uploads/estrutura.ts` (árvore do zip).

Puro, sem `server-only`, sem Prisma — client-safe, como `modules/documentos/tokens.ts` e
`lib/dxf.ts`. Quem chama carrega os catálogos e passa no contexto. Fica em `modules/uploads`
porque é lá que o documento lógico vive; não criar `lib/file-naming` paralelo.

`parsePranchaFilename`, `faseDoNomeArquivo` e `foraDoPadrao` (`modules/projetos/pranchas/codigo.ts`)
**continuam existindo** até a F3 trocar os consumidores (rota de upload, diálogo V2, explorer V1,
Lista Mestre, `numeroPrancha`). Não mudar o comportamento deles antes disso.

### 3.2 API

```ts
interpretarNomeArquivo(nome: string, ctx: ContextoNomenclatura): Interpretacao

type ContextoNomenclatura = {
  projeto: { codigo: string; ano: number; sequencial: number };
  disciplinaId?: string;                       // do envio: desempata e gera aviso de divergência
  padrao?: string | null;                      // NomenclaturaConfig resolvida (modelo ou regex legada)
  vocabulario: Vocabulario;                    // de montarVocabulario(catalogos, projetoId)
  extensoes: ExtensaoDef[];
  documentosExistentes?: { id: string; nomeArquivo: string }[]; // p/ sugerir "nova versão de"
};

type Campo<T> = { valor: T; confianca: number; fonte: FonteCampo; texto: string };
type FonteCampo = "padrao_projeto" | "sigla_catalogo" | "sinonimo" | "faixa_numeracao" | "estrutura";

type Interpretacao = {
  original: string;
  extensao: string;                            // minúscula, sem ponto; "0000.rvt" p/ backup do Revit
  extensaoConhecida: boolean;
  categoria: string | null;                    // do catálogo de extensões
  software: string | null;
  ehBackup: boolean; ehTemporario: boolean; ehConteiner: boolean;
  projeto?: { ano: number; sequencial: number; subprojeto: number | null; texto: string; bateComAtual: boolean };
  disciplina?: Campo<string>;                  // id do DisciplinaCatalogo
  fase?: Campo<string>;                        // id do PranchaCatalogo(fase)
  tipo?: Campo<string>;                        // id do PranchaCatalogo(tipo)
  numero?: Campo<number>;
  revisao?: Campo<number>;
  copia?: { data: string; sequencia: number }; // "[cópia 2026-09-14_05]"
  nomeBase: string;                            // nome sem extensão e sem sufixo de cópia
  sugestoes: Sugestao[];                       // renumerar, enviar em Backup, nova versão de <id>
  avisos: Aviso[];                             // projeto divergente, disciplina divergente, faixa, temporário, sigla ambígua
  partes: Parte[];                             // auditoria/depuração: texto, posição, candidatos
};
```

Nomes de campo em português, alinhados ao resto do código. O `Interpretacao` completo **não** é
persistido; só os campos de D5 e a origem de cada um (ver §3.4).

### 3.3 Algoritmo (determinístico)

1. **Blocos reservados primeiro**, antes de tokenizar: extensão (inclusive `.NNNN.rvt`), sufixo
   de cópia `[cópia AAAA-MM-DD_NN]`, duplicata do Windows `(2)`, datas válidas
   (`AAAA-MM-DD`, `DD.MM.AAAA`, `DD-MM-AAAA`, `DD_MM_AA`). Isso elimina o falso positivo do `2026`.
2. **Padrão do projeto**, se houver: compilado de modelo (`{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]`)
   ou regex legada. Casou → campos com `fonte: "padrao_projeto"` e confiança alta. Siglas ainda
   passam pelo vocabulário (sigla fora do catálogo = campo vazio + aviso).
3. **Senão, heurística:** normaliza (sem acento, maiúsculas), divide em partes por `- _ . espaço`
   preservando o código de projeto com subprojeto na primeira parte (`26001.1`, `26001-1`), e
   gera candidatos por parte:
   - código de projeto: `^\d{2}\d{1,4}$` (+ subprojeto) **na primeira parte**, ou em qualquer
     posição se bater exatamente com o projeto atual;
   - revisão: `^(R|RV|REV)\d{1,3}$` — número isolado **nunca** é revisão;
   - número da prancha: 3–4 dígitos fora da primeira parte;
   - sigla: casamento exato com sigla ou sinônimo do vocabulário (disciplina, fase, tipo);
   - partes coladas (`EST001R02`): segunda passada por fronteira letra/dígito, confiança menor.
4. **Desempate:** sigla que existe em mais de uma categoria usa a vizinhança (fase costuma vir
   depois da disciplina) e o catálogo do projeto; se continuar ambígua, não atribui e avisa.
   Número de 4 dígitos confirma disciplina pela faixa (D6) só como reforço.
5. **Nome livre** (com espaços e palavras longas, ex.: `ATA DE REUNIÃO.pdf`): siglas curtas
   (`DE`, `AP`) só valem entre separadores de nome codificado — em texto corrido a confiança cai
   abaixo do limiar. Evita "DE" de preposição virar tipo DET.
6. **Confiança:** alta (≥ 0,85) preenche (D7); média (0,60–0,85) sugere; baixa não aparece.
   Os pesos são definidos na F1 **pelos testes de família** (§4.F1), não copiados do prompt.

### 3.4 Dados (F2)

Migration **aditiva**, colunas nulas ou com default — segura com o código antigo no ar.

- `DisciplinaCatalogo.sinonimos String[] @default([])`
- `PranchaCatalogo.sinonimos String[] @default([])`
- `DocumentoDisciplina`:
  - `tipoId String?` → `PranchaCatalogo` (categoria tipo), `onDelete: SetNull`, índice
  - `numeroPrancha Int?`
  - `tamanhoPapelId String?` → `PranchaCatalogo` (categoria folha), `onDelete: SetNull`, índice
  - **Gotcha:** passam a existir três relações para `PranchaCatalogo`; todas precisam de nome
    (`@relation("DocumentoFase")` etc.), e a relação reversa `PranchaCatalogo.documentos` vira três
    campos. Em 2026-09-15 nenhum código lê essa relação reversa (o campo `DocumentoDisciplina.fase`
    mantém o nome) — reconferir com grep antes da migration.
- **Modelo novo `ExtensaoArquivo`:** `extensao String @unique` (minúscula, sem ponto),
  `categoria String`, `software String?`, `ehBackup Boolean`, `ehTemporario Boolean`,
  `ehConteiner Boolean`, `descricao String?`, `ativo Boolean @default(true)`, `ordem Int`.
- **Origem por campo:** `DocumentoEvento.detalhe` do envio/edição ganha `origens`
  (`{ fase: "manual" | "nome" | "lote", tipo: …, numeroPrancha: …, tamanhoPapel: "pdf" | "manual" }`),
  estendendo o `faseOrigem` que já existe. Sem coluna nova.
- **Carga inicial por migration** (INSERT … ON CONFLICT DO NOTHING / UPDATE só onde `sinonimos`
  está vazio), não por `db:seed` — o seed é create-only e não atualiza linha existente.
- **Gate:** edição de sinônimos e do catálogo de extensões usa pares **que já existem** —
  `configuracoes:gerir` (catálogo de pranchas, `catalogo-actions.ts`) e `projetos:gerir`
  (catálogo de disciplinas, `criarDisciplinaCatalogo`). A tela nova do catálogo de extensões
  reusa `configuracoes:gerir`. Nenhuma permissão nova — par novo exigiria migration própria, porque
  o seed de permissões é create-only.

**Carga inicial de extensões** (só formatos confirmados pelo acervo ou pela lista do dono):

| Categoria | Extensões | Flags |
|---|---|---|
| Documento | `pdf`, `doc`, `docx`, `txt` | — |
| Planilha | `xls`, `xlsx`, `xlsm`, `csv` | — |
| Apresentação | `ppt`, `pptx` | — |
| Imagem | `png`, `jpg`, `jpeg` | — |
| Desenho CAD | `dwg`, `dxf`, `dwt`, `dws` | software AutoCAD |
| Temporário CAD | `bak`, `dwl`, `dwl2`, `sv$` | `ehTemporario` |
| Modelo BIM | `ifc`, `ifcxml` · `rvt`, `rfa`, `rte`, `rft` (Revit) | — |
| Backup de software | `0000.rvt` (Revit) · `qibzip` (AltoQi) · `tqs` (TQS) · `ed3` (CYPE) | `ehBackup`; `qibzip` também `ehConteiner` |
| Compactado | `zip`, `rar`, `7z`, `ifczip` | `ehConteiner`, **não** `ehBackup` |
| Log | `log` | `ehTemporario` |

`.zip`/`.rar` de backup do TQS são reconhecidos por **contexto** (disciplina Estrutural, envio em
Backup, palavra `TQS`/`BACKUP` no nome) como *sugestão* — nunca pela extensão. Extensão fora da
tabela: `extensaoConhecida: false`, envio segue normal; a tela do catálogo lista as desconhecidas
com contagem (consulta sobre `Upload`, sem tabela de log).

`EXT_PACOTE_A` e `EXT_SUBPASTA` (roteamento de pacote e árvore do zip de download) **ficam como
estão** nesta onda — trocá-los muda onde os arquivos caem e a estrutura dos downloads.

---

## 4. Fases

### F0 — Diagnóstico e backfill de fase · feito (2026-09-15)

`scripts/diagnosticar-nomenclatura.ts` (80a3713b) e `scripts/preencher-fase-documentos.ts`
compatível com v1.17.0 (0487da5b), aplicado em produção.

### F0b — Alerta falso de "fora do padrão" · qualquer modelo · **aguarda OK do dono**

Correção pontual, independente do motor, para sair **no próximo deploy** em vez de esperar a F3:
em `foraDoPadrao` (`modules/projetos/pranchas/codigo.ts`), padrão que contém `{` é um *modelo*,
não regex — enquanto o compilador da F1 não existe, cai na regra embutida
(`parsePranchaFilename`), que já é o formato `{proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]`. Teste em
`codigo.test.ts` com os dois padrões cadastrados em produção. A F3 substitui pelo compilador.

### F1 — Motor puro · **Opus**

- Módulo de §3.1 com a API de §3.2 e o algoritmo de §3.3, incluindo o **compilador de padrão**
  que entende o modelo `{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]` e continua aceitando regex.
- **Testes de família:** um caso por família de §1, com nomes **sintéticos de mesma estrutura**
  (sem nome de cliente real), mais os casos do prompt original que fazem sentido para a SENA
  (separadores equivalentes, partes coladas, revisão `REV-02`, `modelo.0001.rvt`, extensão
  desconhecida, `ATA DE REUNIÃO.pdf`, `[cópia …]`, `(2)`).
- **Critério de aceite da F1** (mede o algoritmo, não o banco): com um `Vocabulario` de teste em
  memória que já contém o catálogo de produção **e os sinônimos de D2**, as famílias de §1
  ponderadas pela contagem reconhecem fase em ≥ 70% e tipo em ≥ 60%, com zero atribuição errada
  nos casos de nome livre. Sem os sinônimos no banco (F2) esse número não existe em produção.
- Seção nova no `scripts/diagnosticar-nomenclatura.ts`: taxa do motor novo × regra atual. É o
  **aceite em produção**, medido depois do deploy de F1 + F2 (importa o módulo novo e lê os
  sinônimos do banco).
- Não toca rota, diálogo, schema nem consumidores atuais.

### F2 — Schema e catálogos · **Sonnet** · entregue (2026-09-15)

- Migration `20260915170000_motor_nomenclatura_sinonimos_extensoes` (aditiva): `sinonimos
  String[]` em `DisciplinaCatalogo`/`PranchaCatalogo`; `DocumentoDisciplina.tipoId`/
  `numeroPrancha`/`tamanhoPapelId` (3 relações nomeadas p/ `PranchaCatalogo`); tabela
  `ExtensaoArquivo` + carga das 37 extensões de `extensoes-iniciais.ts`; UPDATE dos sinônimos de
  D2 (só onde `sinonimos = '{}'`, nunca sobrescreve edição). Aplicada no dev via `db push` +
  execução direta do SQL (sem shadow DB) + `migrate resolve --applied`.
- Campo "Sinônimos" no catálogo de disciplinas e na Lista Mestre (fase/tipo/folha), com
  colisão validada no mesmo escopo (`colisao-sinonimo.ts`, puro e testado — 7 casos).
- Tela `/configuracoes/extensoes`: lista, cria, edita, exclui, alterna ativo, e cadastra a
  partir da lista de "extensões vistas no acervo, fora do catálogo" (`extensoesDesconhecidasNoAcervo`,
  SQL sobre `Upload.nomeArquivo`). Gate `configuracoes:gerir` — sem permissão nova.
- `carregarCatalogosNomenclatura()`/`carregarExtensoesNomenclatura()` (server-only,
  `modules/uploads/nomenclatura/queries.ts`) montam o `CatalogosNomenclatura`/`ExtensaoDef[]`
  de verdade a partir do banco, prontos para a `montarVocabulario()` pura da F1.
- `scripts/diagnosticar-nomenclatura.ts` §6 passou a usar **id e sinônimo reais do banco**
  (antes eram sintéticos — risco anotado no fim da F1); confirmado contra o dev: 37 extensões,
  4 disciplinas com sinônimo, catálogo de fase/tipo do dev não bate com D2 (esperado, ver
  comentário na migration).
- `npm test` (305 arquivos/3361 testes), `npm run lint` e `npm run build` verdes.

### F3 — Integração no envio · **Opus** · entregue (2026-09-15)

Entregue conforme o desenho abaixo, com três coisas que só apareceram na implementação:

1. **`foraDoPadrao` ganhou uma regra explícita**: modelo que NÃO tem campo de revisão passa a
   aceitar nome com sufixo de revisão (`…-DET-R00`). Sem isso, o padrão global de produção
   (`{proj}-{disc}-{fase}-{nº}-{tipo}`, sem revisão) marcaria como "fora do padrão" a família
   mais comum do acervo — trocaria um alerta falso por outro. Justificativa: o próprio
   `codigoPrancha()` acrescenta `-Rnn` quando a revisão é > 0, então o nome continua conforme
   por construção. Está em `padrao.ts`, com teste.
2. **A guarda do D4 foi para o motor** (não para a tela): `renumerar` só é sugerido quando o
   nome também tem disciplina ou fase reconhecida. Regra igual no servidor e no cliente.
3. **A precedência do ADR virou função pura testada** (`precedencia.ts`, `resolverMetadado`),
   em vez de ficar inline na rota: é a regra mais importante da fase (manual > o que o
   documento já tem > leitura do nome) e agora tem teste, inclusive para `0` como valor válido.
4. **"Nova versão de" exige o MESMO destino** (achado na revisão, antes do commit): a guarda
   original só conferia disciplina e documento vivo, então um arquivo enviado para uma pasta
   podia virar revisão de um documento do pacote A (e vice-versa). Isso quebraria o `pacote`
   XOR `pastaId` que a `chave` protege — árvore do zip (`caminhoNoZip` × `caminhoNoZipPasta`)
   e validação (arquivo de pasta não é validado) passam a divergir dentro de um documento só.
   Agora a rota compara o local pelo novo `localDaChave()` (`modules/uploads/documento.ts`,
   com teste) e o diálogo nem oferece documento de outro destino.
5. **O diálogo montava o vocabulário com escopo `null`** (mesmo achado): descartava as siglas
   próprias do projeto que o servidor honra, então a tela mostrava "—" num campo que a rota
   preencheria depois. Passou a usar `dados.projeto.id`, igual à rota.

Também: `projetoVisivel` passou a trazer `ano`/`sequencial` (o motor compara com o código lido
do nome) e a página do projeto monta `documentosPorDisciplina` a partir da árvore que já
carregava, sem consulta nova.

- **Servidor (`/api/uploads`)** passa a usar o motor para fase, tipo e número (substitui
  `faseDoNomeArquivo`), respeitando a precedência do ADR (escolha do diálogo vence; inferência não
  sobrescreve documento com valor). Grava origens no `DocumentoEvento`.
- **Diálogo de envio (V2)** — etapa de revisão mostra por arquivo: fase e tipo preenchidos
  (alta confiança) e editáveis; avisos (projeto divergente, disciplina divergente, faixa,
  temporário, extensão desconhecida); sugestões com botão:
  - **[Usar nome corrigido]** (D4) — reaproveita `correcao-nome-upload.tsx` /
    `nomeCorrigidoPeloPadrao` onde couber, trocando só o código do projeto. **Só oferecer quando
    o motor também leu disciplina ou fase**: sem isso, o número inicial pode ser outra coisa
    (`253-PIL-VIG-007-R00.DXF`, desenho de elemento das ferramentas, vira falsa sugestão);
  - **[Enviar em Backup do modelo]** quando `ehBackup` ou compactado com contexto de backup;
  - **[Nova versão de: <documento>]** (D10) quando o `nomeBase` sem sufixo de cópia casa com
    documento existente da mesma disciplina.
- **"Nova versão de" no servidor:** parâmetro `versaoDeDocumentoId`. Valida documento vivo, mesma
  disciplina, status não final. Cria a próxima `DocumentoRevisao` desse documento; o `Upload`
  guarda o **nome real** do arquivo; `DocumentoDisciplina.chave` e `nomeArquivo` **não mudam**
  (ADR regra 1). Envio seguinte com outro nome de cópia volta a sugerir o mesmo documento.
  Hoje `revisaoDeId` exige que a revisão pertença ao documento resolvido pelo **nome** — o
  caminho novo não passa por essa checagem, tem a sua.
- **`foraDoPadrao`** passa a usar o compilador de padrão da F1 → resolve o bug de §1 (alerta em
  todo arquivo).
- Explorer V1 (`arquivos-explorer.tsx`) recebe só a correção do `foraDoPadrao`; nada novo.

### F4 — Lista V2, tamanho do papel e backfill · **Sonnet**

- **Lista V2:** colunas/filtros de tipo, número da prancha, tamanho do papel e categoria de
  extensão; **selo "Backup"** e filtro por pacote (pendência da V2: o backup aparece sem rótulo).
- **Tamanho do papel pelo PDF:** após gravar um PDF, ler a 1ª página com `pdf-lib`
  (`getSize()`, considerando `/Rotate`) e casar com A0–A4 do catálogo, tolerância pequena,
  retrato ou paisagem. Fora do padrão = vazio. Só preenche documento sem tamanho definido.
  Fire-and-forget como as conversões IFC/DWG; limite de tamanho do PDF lido (não carregar
  arquivo gigante em memória).
- **Lista Mestre:** import (`pranchas/queries.ts`, hoje `folha: "A1"` fixo) usa o tamanho do
  papel do documento quando houver, e tipo/número gravados em vez de reler o nome.
- **Backfill** `scripts/preencher-metadados-documentos.ts`: relatório sem `--aplicar`; só campo
  vazio; grava `DocumentoEvento` com origem `lote`; ids tocados em JSON para reversão (mesmo
  contrato de `preencher-fase-documentos.ts`). Inclui tamanho do papel dos PDFs existentes.
- Manual (`docs/manual/`) e `novidades.md` atualizados.

### F5 — Editor visual do padrão · **Sonnet**

- Em Configurações → Nomenclatura e na nomenclatura do projeto: montar o padrão por **blocos**
  (Projeto, Disciplina, Fase, Número, Tipo, Revisão), escolher separador, marcar opcionais;
  prévia com nome de exemplo mostrando os campos lidos. Grava o modelo no mesmo
  `NomenclaturaConfig.padrao`.
- Regex legada que o editor não consegue representar abre em **modo avançado** (texto),
  sem conversão automática.
- O editor precisa emitir **uma** forma para revisão: `{Rnn}` (o `R` faz parte do campo) ou
  `R{rev}` (o `R` é literal). `padrao.ts` aceita as duas, mas os dois padrões que produção tem
  hoje usam escritas diferentes — escolher uma e migrar o outro na mesma tela.
- **Tirar a nomenclatura do projeto de onde ela está hoje.** O padrão por projeto **já existe**
  (`NomenclaturaConfig.projetoId`, `resolverNomenclatura` com herança do global, botão "Limpar"
  que volta a herdar) e produção já usa: em 2026-09-15 havia 1 config global e 2 de projeto, uma
  delas com padrão próprio (`…-{Rnn}`, revisão obrigatória). O problema é achar: o formulário
  mora dentro do diálogo **"Siglas deste projeto"**, na aba Lista Mestre
  ([`lista-mestre-view.tsx`](../../../src/components/projetos/lista-mestre-view.tsx), `NomenclaturaForm`
  com `escopo={{ projetoId }}`), e o dono levou meses sem saber que existia. Mover para uma seção
  própria — Configurações do projeto ou um card visível na aba Lista Mestre —, e mostrar na tela
  **qual padrão está valendo e se é herdado ou próprio**. Nada de schema muda: é realocação de UI.

### F6 — Índice de contêiner `.zip` (opcional) · **Opus**

Só se F1–F5 mostrarem que a sugestão por contexto não basta para backups do TQS. Ler **apenas o
diretório central** do `.zip` (sem extrair, sem carregar o arquivo inteiro), com limite de
entradas e de tamanho de nome; `.tqs` dentro → sugere "Backup TQS". `.rar`/`.7z` fora (exigem
executável externo).

---

## 5. Fora do escopo

- Nome normalizado como chave de agrupamento ou renomeação automática (ADR regra 1).
- Pavimento, bloco, torre, setor, elemento estrutural (`P01`, `V01`, `S01`), autor e data como
  campos guardados.
- Aprendizado de máquina; inspeção de `.rar`/`.7z`; abrir modelos com software externo.
- Mudar `EXT_PACOTE_A`/`EXT_SUBPASTA` (roteamento de pacote e árvore de download).
- `CONTEXT.md`: registrar *sinônimo* e *documento lógico* quando a F1 fechar o vocabulário.

## 6. Riscos

- **Sinônimo curto em nome livre** (`DE`, `AP`, `EX`) — mitigado pelo passo 5 do algoritmo e por
  teste dedicado.
- **Três relações para `PranchaCatalogo`** renomeiam a relação reversa — hoje sem consumidor,
  reconferir antes da migration (F2).
- **Backfill em produção** roda depois do deploy de F1–F4; sempre relatório antes, sempre só
  campo vazio.
- **Deploy atrasado:** produção está na v1.17.0; cada fase só aparece para o usuário depois de
  publicar a `master` acumulada.
