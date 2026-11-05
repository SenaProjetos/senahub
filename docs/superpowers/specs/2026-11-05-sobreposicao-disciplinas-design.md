# Sobreposição de disciplinas em 2D (estudo preliminar)

Data: 2026-11-05 · Status: aguardando aprovação do dono (revisado por um leitor-construtor)

## Por que existe

No estudo preliminar (EP) cada disciplina entrega as plantas em **PDF e DWG** (sempre os dois), **um arquivo por
pavimento**. Não há IFC nessa etapa, então a Coordenação BIM (IFC federado) não serve. Hoje a sobreposição é feita à mão
no AutoCAD: alguém abre as plantas, **move e posiciona** cada uma sobre a arquitetura e procura interferências. A conclusão
fica só na conversa.

A função junta N disciplinas sobre uma planta base, dentro do SenaHub, para:

- ver todas as disciplinas sobrepostas e achar interferências cedo;
- apoiar decisões antes de detalhar;
- transformar a interferência achada num apontamento para a disciplina que deve alterar.

O dono pediu para reaproveitar o que já funciona no comparador de revisões (`components/projetos/comparador-revisoes.tsx`:
sobreposição tingida, cortina, diferenças), estendido para mais de 2 arquivos e para disciplinas diferentes.

## Objetivos

1. Montar, por projeto, uma **sobreposição por pavimento**: uma planta base e N disciplinas por cima.
2. Cada camada tem cor, olho (ligar/desligar) e opacidade.
3. **Alinhar** cada camada na base e **guardar o deslocamento**, para que a próxima revisão da prancha já abra no lugar.
4. Marcar uma interferência e gerar um **apontamento numa única disciplina**, a que o coordenador escolher.

## Fora do escopo (agora)

- Ligar e desligar **camadas internas do DWG** (cotas, textos...). A v1 liga e desliga só a disciplina inteira. O dono
  disse: "caso seja necessário, a gente altera".
- IFC. Essa etapa não tem IFC, e IFC já tem a Coordenação BIM.
- Detecção automática "certeira" de conflito. Só o modo Cruzamentos (abaixo), que é uma ajuda visual.
- Recortar trecho de uma folha com várias plantas. Não acontece: é um arquivo por pavimento.

## Anti-objetivos (seria falha mesmo funcionando)

- Pedir para realinhar tudo a cada revisão nova.
- Apontamento que o projetista não vê no lugar onde já trabalha (o visualizador de PDF da prancha dele).
- Um segundo sistema de apontamentos paralelo ao `Pendencia`.

## Decisões do dono (conversa de 2026-11-05)

| # | Decisão |
|---|---|
| D1 | Entrada = PDF e DWG. Sem IFC. |
| D2 | Reaproveitar as funções do comparador de revisões, para mais de 2 disciplinas. |
| D3 | As plantas costumam precisar ser **movidas e posicionadas**. Não confiar que a origem coincide. |
| D4 | Guardar o deslocamento de cada disciplina. A revisão nova chega no lugar certo. |
| D5 | Um arquivo por pavimento. |
| D6 | Tela aprovada conforme o rascunho (`.superpowers/brainstorm/…/tela-sobreposicao.html`): seletor de pavimento no topo, painel de camadas à esquerda, desenho no centro, botões Sobrepor/Cortina/Diferenças, Alinhar, Apontar interferência. |
| D7 | Três formas de alinhar, todas juntas: **1 ponto** (só mover), **2 pontos** (mover + girar + escalar, como o ALIGN do CAD) e **ajuste fino** (arrastar, setas, números). |
| D8 | O apontamento vai para **uma disciplina só**, a que o coordenador escolher para alterar. |
| D9 | Sem camadas internas do DWG na v1. |
| D10 | Toda prancha do EP sobe em PDF **e** DWG. Por isso o apontamento sempre pode cair no PDF. |
| D11 | O pino da sobreposição nasce **rascunho**, como o de hoje. A tela ganha "Enviar apontamentos", que envia de uma vez os rascunhos feitos ali, cada um pela rodada normal da sua prancha (tarefa, aviso, reabertura de disciplina aprovada). |
| D12 | Todos os projetistas partem da **mesma base de arquitetura**, que fica no layer **`SENA_ARQ`** (mesmo nome em todo DWG). |

## Como funciona

### Onde fica e quem pode

- A aba **Coordenação** do projeto ganha duas abas internas, **Modelo 3D (IFC)** | **Sobreposição 2D**, cada uma com seu endereço (decisão do dono, 2026-11-05). Com IFC convertido (da disciplina ou recebido do cliente) abre no Modelo 3D, igual a hoje; sem IFC abre na Sobreposição 2D. O IFC não vira camada da sobreposição, e os apontamentos 3D (`ApontamentoCoordenacao`) e 2D (`Pendencia` na prancha) continuam separados.
- Ver: `coordenacao:ver` + enxergar o projeto (`projetoVisivel`), o mesmo gate da aba.
- Montar, alinhar, trocar arquivo e excluir: `coordenacao:gerir`.
- Apontar interferência: `coordenacao:gerir` **e** o gate que `criarPendencia` já exige (`uploads:validar`). O apontamento
  é um `Pendencia` normal, então quem não pode apontar no PDF também não pode apontar aqui.
- Vale em qualquer etapa do projeto, não só no EP. *Chamada minha.*

### Sobreposição e camadas

- **Sobreposição** = projeto + nome livre do pavimento ("Térreo", "Tipo", "Cobertura"), criada à mão. O documento não tem
  campo "pavimento", então o sistema não descobre isso sozinho. *Chamada minha.*
- **Camada** = um documento da disciplina (`DocumentoDisciplina`, a "série" das revisões da prancha) + formato escolhido
  (`pdf` | `dwg`) + cor + opacidade + ligada/desligada + ordem + alinhamento.
- Exatamente **uma camada é a base**, normalmente a arquitetura. O "mundo" da sobreposição é o sistema de coordenadas do
  **primeiro arquivo** usado como base. A base também tem alinhamento, que nasce como identidade (*chamada minha*). Quando a
  base ganha revisão nova ou troca de formato, alinha-se só a base nova sobre a antiga, uma vez, e todas as camadas
  continuam no lugar. Assim nunca é preciso realinhar N camadas por causa da arquitetura.
- A camada sempre mostra o arquivo **mais novo do formato** dentro do documento, inclusive uma versão `em_andamento` do
  ciclo ISO 19650. É o mesmo arquivo que `criarPendencia` aceita (só a versão mais nova recebe pino), então apontar nunca
  falha por versão. O rótulo da camada mostra revisão e estado ("R01 · Em análise"). Arquivo na lixeira nunca entra.
  *Chamada minha.*
- **DWG:** desenha o mesmo conteúdo que o visualizador DWG de hoje desenha (`modules/dwg/parse.ts`). Como é um arquivo por
  pavimento (D5), não há escolha de planta dentro do DWG. Se o parser não trata paper space/viewport, isso é limite
  conhecido da v1, e a saída é usar o PDF da camada.
- **Cor:** escolhida por camada, com uma sugestão automática de uma paleta fixa de contraste. O sistema não tem cor fixa
  por disciplina (`lib/disciplinas.ts` não define cor de propósito). *Chamada minha.*
- **PDF com várias páginas:** a camada guarda a página (padrão 1). *Chamada minha.*
- Uma camada pode trocar o formato (PDF ↔ DWG). Cada formato guarda **o próprio alinhamento**, porque a folha PDF e o
  desenho DWG têm coordenadas diferentes. *Chamada minha, exigida pelo apontamento.*

### Desenho

- **PDF:** rasterizado pelo pdf.js e tingido na cor da camada, com o fundo branco transparente. É a mesma técnica de
  `renderTintado` no comparador; extrair para um módulo compartilhado em vez de copiar.
- **DWG:** usar o DXF convertido (`ConversaoDesenho`, rota `/api/dwg/[desenhoId]/dxf`, parser `modules/dwg/parse.ts`,
  transformações em `modules/dwg/viewer/canvas-render.ts`), desenhado como vetor na cor da camada. Se a conversão não
  terminou ou falhou, a camada mostra o estado e oferece trocar para o PDF.
- Zoom e pan compartilhados por todas as camadas. As camadas são compostas na ordem do painel, e a base fica embaixo.

### Arquitetura de fundo (`SENA_ARQ`, D12)

Toda prancha de disciplina traz a arquitetura por baixo. Sem tratamento, ela seria pintada na cor de cada camada, apareceria
N vezes e o modo Cruzamentos acusaria quase tudo.

- **DWG:** numa camada que não é a base, as entidades do layer `SENA_ARQ` **não são desenhadas**. Esse é o único filtro de
  layer da v1 (D9 continua: não há painel de layers). O nome fica numa constante; comparação sem diferenciar caixa.
  *Chamada minha:* se o DWG não tiver `SENA_ARQ`, a camada desenha tudo e mostra o aviso "arquitetura de fundo não
  encontrada (layer SENA_ARQ)".
- **PDF:** a separação por layer só existe se o PDF foi exportado com layers (grupos de conteúdo opcional, que o pdf.js lê).
  Se o PDF tem um grupo `SENA_ARQ`, ele é escondido. Se não tem, a folha inteira é pintada, com o mesmo aviso. *Chamada
  minha.*
- Por isso, numa camada que não é a base, o formato padrão é **DWG**. O PDF da mesma prancha entra para receber o pino.
- **Ao alinhar, a arquitetura de fundo volta a aparecer** na camada que está sendo alinhada, em cinza. É ela que casa com a
  base, então é nela que se clicam os pontos. Ao salvar, volta a ficar escondida. *Chamada minha.*

### Modos

- **Sobrepor** (padrão): todas as camadas ligadas, cada uma com sua opacidade.
- **Cortina:** a base de um lado e UMA camada escolhida do outro, arrastando a divisória (mesma interação de
  `cortina-revisoes.tsx`).
- **Diferenças → Cruzamentos.** O "diferenças" do comparador acusaria a disciplina inteira, porque arquitetura e estrutura
  são desenhos diferentes. Neste modo o sistema marca as regiões onde **duas camadas escolhidas têm traço no mesmo lugar**,
  que são as candidatas a interferência. Reaproveita a grade de ladrilhos de `modules/projetos/pendencias/diff.ts`
  (puro, testado), trocando "pixel diferente" por "tinta nos dois". Vai ter ruído (tubo que atravessa parede de propósito),
  por isso é só ajuda visual e nunca cria apontamento sozinho. *Chamada minha, ver "O que conferir".*

### Alinhamento

- O alinhamento é uma **similaridade** (deslocamento X/Y + giro + escala uniforme) que leva as coordenadas da camada para
  as coordenadas da base. Guarda os 4 números, nunca a imagem.
- **1 ponto:** clica um ponto na camada e o mesmo ponto na base. Muda só o deslocamento e mantém giro e escala.
- **2 pontos:** dois pares (camada → base). Calcula deslocamento, giro e escala de uma vez. Recusa dois pontos coincidentes
  ou próximos demais, com mensagem.
- **Ajuste fino:** arrastar a camada, setas do teclado (passo pequeno; com Shift, passo grande) e campos numéricos
  (X, Y, giro em graus, escala).
- "Salvar alinhamento" grava. "Cancelar" volta ao gravado. Desfazer dentro da sessão de alinhamento.
- A conta é pura e testada: montar a transformação a partir de 1 ou 2 pares, compor, inverter, aplicar a ponto.
- **Revisão nova:** a camada guarda **qual arquivo** estava em uso quando o alinhamento foi salvo. Se o arquivo vigente
  mudou, a camada abre com o alinhamento salvo e o aviso "alinhamento da revisão anterior (R00)", com dois botões:
  "Está certo" (registra o arquivo novo como conferido) e "Alinhar". Revisão nova da **base** gera o mesmo aviso em todas
  as camadas.
- Alinhamento é escrito com trava otimista (versão), como `salvarEstudo`: dois coordenadores salvando ao mesmo tempo não se
  sobrescrevem em silêncio.

### Apontar interferência

1. O coordenador clica em "Apontar interferência", clica no ponto do desenho e escolhe **a disciplina que deve alterar**
   (entre as camadas visíveis, a base inclusive; a base segue a mesma regra do PDF alinhado abaixo). Depois escreve o texto, como no apontamento
   de sempre.
2. O pino vira um **`Pendencia` no PDF vigente da prancha daquela camada**, criado pela mesma regra de `criarPendencia`
   (numeração por documento, só versão vigente, menções, auditoria). Para isso o serviço de pendências expõe a criação como
   função chamável. Nunca existe um segundo `pendencia.create` com regras diferentes.
3. **Posição:** o ponto clicado está nas coordenadas da base. Aplica a inversa do alinhamento do **PDF** da camada e
   normaliza para 0..1 da página, que é o formato de `Pendencia.x/y`.
4. Se a camada está em **DWG**, o sistema pede para trocar para o PDF da mesma prancha, que tem alinhamento próprio. Se o
   PDF ainda não tem alinhamento, pede para alinhar o PDF primeiro. Nunca converte posição de DWG para PDF por adivinhação.
5. **Imagem de contexto:** o sistema recorta a sobreposição em volta do ponto (todas as camadas ligadas, como estão na tela)
   e grava como `PendenciaAnexo` do tipo arquivo, pela rota de anexo que já existe (`/api/pendencias/anexo`). Assim o
   projetista vê o tubo e o pilar juntos, mesmo abrindo só a prancha dele.
6. O pino nasce **rascunho** (D11), visível só ao autor, como hoje. A tela lista os rascunhos feitos na sobreposição, e o
   botão **"Enviar apontamentos"** envia todos de uma vez. Por baixo, roda a MESMA rodada de `enviarApontamentos` para cada
   prancha que tem rascunho (uma tarefa por prancha, aviso aos responsáveis, reabertura como revisão se a disciplina estava
   aprovada). Falha numa prancha não desfaz as outras, e o relatório diz qual falhou e por quê, como o `useLote`.
7. Na sobreposição, os pinos abertos de todas as camadas aparecem por cima, levados para as coordenadas da base pelo
   alinhamento do PDF de cada um. Clicar num pino abre o apontamento no visualizador da prancha.

## Dados (sugestão, o builder pode ajustar os nomes)

- `SobreposicaoPlanta`: `id`, `projetoId`, `nome`, `ordem`, `versao` (trava), `criadoPorId`, datas. Único por
  (`projetoId`, `nome`).
- `SobreposicaoCamada`: `id`, `sobreposicaoId`, `documentoId` (FK `DocumentoDisciplina`), `formato` (`pdf`|`dwg`), `base`
  (bool, uma por sobreposição por índice parcial), `cor`, `opacidade`, `visivel`, `ordem`, `pagina`.
- `SobreposicaoAlinhamento`: `camadaId` + `formato` (único), `tx`, `ty`, `giro`, `escala`, `uploadConferidoId` (o arquivo
  em uso quando foi salvo ou confirmado), quem e quando.
- Excluir a sobreposição leva camadas e alinhamentos. Os `Pendencia` criados a partir dela ficam, porque pertencem à
  prancha.
- Toda escrita por `defineAction` (auditoria automática). Leituras em `modules/coordenacao/sobreposicao/queries.ts`, regras
  puras em arquivos sem Prisma.

## Restrições do projeto que valem aqui

- Server Actions por `defineAction`. REST só para streaming de arquivo (PDF e DXF já têm rota).
- pdf.js e o desenho do DXF são só do cliente. A tela pesada entra por `next/dynamic({ ssr: false })`.
- `CabecalhoPagina` não muda, porque a seção vive dentro da aba Coordenação. Painel de camadas e desenho seguem as regras de
  área útil (390×844 sem rolagem horizontal; no celular o painel vira gaveta). Alinhar com 2 pontos no celular é aceitável
  ser ruim; não é o caso de uso.
- Menu de contexto (ADR-0002) nas camadas e nos pinos: descritor puro `itensDaCamada()` e o mesmo array no `⋯`.
- Sem `Promise.all` dentro de transação.
- `docs/manual/` ganha a seção da função.

## Deixado para o builder

- Nomes finais de tabelas, arquivos e componentes.
- Paleta das cores sugeridas, passo das setas, raio do recorte da imagem de contexto.
- Como compor as camadas (um canvas por camada empilhado ou um só canvas), contanto que zoom e pan fiquem fluidos numa
  prancha A0.
- Fatiar em fases. Sugestão: (1) sobreposição + camadas + desenho PDF/DWG; (2) alinhamento + revisão nova;
  (3) apontar interferência; (4) cortina e cruzamentos.

## O que conferir com o dono (chamadas minhas)

- "Diferenças" virou **Cruzamentos** (tinta das duas disciplinas no mesmo lugar).
- A base pode receber apontamento? Proposta: **sim**. Se a arquitetura é quem deve mudar, o coordenador escolhe a base.
- `SENA_ARQ` escondido nas camadas que não são a base, mostrado em cinza só enquanto se alinha; PDF só esconde se tiver layers.
- A base guarda alinhamento próprio (revisão nova da arquitetura = alinhar só ela).
- A camada mostra sempre o arquivo mais novo, mesmo em andamento.
- Cor livre por camada, com sugestão automática.
- Pavimento com nome livre, criado à mão.
