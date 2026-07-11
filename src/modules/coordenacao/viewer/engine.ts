/**
 * Coordenação BIM — adapter do viewer 3D (CLIENT-ONLY, nunca importar no servidor).
 *
 * TODO o contato com three.js / @thatopen/fragments fica confinado AQUI (e no
 * scripts/converter-ifc.ts, lado Node). Componentes React falam só com esta
 * classe — contenção de churn de API do ThatOpen (histórico 1.x→2.x→3.x).
 *
 * Worker: public/fragments-worker.mjs é CÓPIA de
 * node_modules/@thatopen/fragments/dist/Worker/worker.mjs — a versão do worker
 * DEVE casar com a da lib; recopiar ao atualizar o pacote (mesmo padrão do
 * pdf.worker.min.mjs).
 *
 * Convenção de eixos: o fragments converte IFC (Z-up) para o espaço do three
 * (Y-up) ao importar — "altura"/pavimentos = eixo Y aqui dentro.
 */
import * as THREE from "three";
import CameraControls from "camera-controls";
import {
  FragmentsModels,
  RenderedFaces,
  type FragmentsModel,
  type ItemData,
} from "@thatopen/fragments";
import {
  extrairAtributos,
  type AtributoItem,
  type PsetItem,
} from "@/modules/coordenacao/viewer/item-data";
import { threeParaIfc, ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";

CameraControls.install({ THREE });

const COR_SELECAO = 0x2563eb; // primário (azul) — highlight de seleção

export type { AtributoItem, PsetItem };

export type SelecaoInfo = {
  modeloId: string;
  localId: number;
  guid: string | null;
  atributos: AtributoItem[];
  psets: PsetItem[];
};

export type EixoCorte = "x" | "y" | "z";

export type CorteConfig = {
  eixo: EixoCorte;
  /** Posição normalizada 0..1 ao longo do bbox global no eixo. */
  posicao: number;
  /** Inverte o lado mantido do corte. */
  invertido: boolean;
} | null;

export type EngineOpts = {
  /** Chamado após clique: item selecionado (ou null ao clicar no vazio). */
  onSelecionar?: (info: SelecaoInfo | null) => void;
};

/** Câmera do Apontamento — persistida em espaço IFC (Z-up, metros). */
export type CameraApontamento = { position: Vec3; target: Vec3 };

export class ViewerEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: CameraControls;
  private clock = new THREE.Clock();
  private fragments: FragmentsModels;
  private modelos = new Map<string, FragmentsModel>();
  private selecao = new Map<string, Set<number>>(); // modeloId → localIds
  private planosCorte: THREE.Plane[] = [];
  private raf = 0;
  private resizeObs: ResizeObserver;
  private destruido = false;
  private opts: EngineOpts;
  private frameCallbacks = new Set<() => void>();

  constructor(container: HTMLElement, opts: EngineOpts = {}) {
    this.container = container;
    this.opts = opts;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(10, 30, 20);
    this.scene.add(dir);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      5000,
    );
    this.camera.position.set(25, 20, 25);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.controls.dollyToCursor = true;

    this.fragments = new FragmentsModels("/fragments-worker.mjs");

    this.resizeObs = new ResizeObserver(() => this.redimensionar());
    this.resizeObs.observe(container);

    const loop = () => {
      if (this.destruido) return;
      this.raf = requestAnimationFrame(loop);
      const delta = this.clock.getDelta();
      this.controls.update(delta);
      void this.fragments.update(); // a lib limita a taxa internamente (maxUpdateRate)
      this.renderer.render(this.scene, this.camera);
      for (const cb of this.frameCallbacks) cb();
    };
    loop();
  }

  // ── Modelos ────────────────────────────────────────────────

  get modelosCarregados(): string[] {
    return [...this.modelos.keys()];
  }

  /** Baixa o .frag (rota autenticada) e adiciona o modelo à cena. */
  async carregarModelo(modeloId: string, url: string): Promise<void> {
    if (this.modelos.has(modeloId) || this.destruido) return;
    const resp = await fetch(url);
    if (!resp.ok) {
      const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
      throw new Error(corpo?.error ?? `Falha ao baixar o modelo (${resp.status}).`);
    }
    const buffer = await resp.arrayBuffer();
    if (this.destruido) return;

    const model = await this.fragments.load(buffer, { modelId: modeloId, camera: this.camera });
    if (this.destruido) {
      await this.fragments.disposeModel(modeloId);
      return;
    }
    model.useCamera(this.camera);
    model.getClippingPlanesEvent = () => this.planosCorte;
    this.scene.add(model.object);
    this.modelos.set(modeloId, model);
    await this.fragments.update(true);
    if (this.modelos.size === 1) await this.enquadrar();
  }

  async descarregarModelo(modeloId: string): Promise<void> {
    const model = this.modelos.get(modeloId);
    if (!model) return;
    this.modelos.delete(modeloId);
    this.selecao.delete(modeloId);
    this.scene.remove(model.object);
    await this.fragments.disposeModel(modeloId);
  }

  // ── Seleção ────────────────────────────────────────────────

  /**
   * Raycast no clique (coordenadas de client). Seleciona o item mais próximo
   * entre todos os modelos; `acumular` (shift) adiciona à seleção atual.
   */
  async selecionarEm(clientX: number, clientY: number, acumular = false): Promise<SelecaoInfo | null> {
    const mouse = new THREE.Vector2(clientX, clientY);
    const dom = this.renderer.domElement;

    let melhor: { modeloId: string; localId: number; distancia: number } | null = null;
    for (const [modeloId, model] of this.modelos) {
      const hit = await model.raycast({ camera: this.camera, mouse, dom });
      if (hit && (melhor === null || hit.distance < melhor.distancia)) {
        melhor = { modeloId, localId: hit.localId, distancia: hit.distance };
      }
    }

    if (!acumular) await this.limparSelecao(false);
    if (!melhor) {
      this.opts.onSelecionar?.(null);
      return null;
    }

    const ids = this.selecao.get(melhor.modeloId) ?? new Set<number>();
    ids.add(melhor.localId);
    this.selecao.set(melhor.modeloId, ids);

    const model = this.modelos.get(melhor.modeloId)!;
    await model.highlight([melhor.localId], {
      color: new THREE.Color(COR_SELECAO),
      renderedFaces: RenderedFaces.TWO,
      opacity: 1,
      transparent: false,
    });
    await this.fragments.update(true);

    const info = await this.montarInfo(melhor.modeloId, melhor.localId);
    this.opts.onSelecionar?.(info);
    return info;
  }

  async limparSelecao(notificar = true): Promise<void> {
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (model && ids.size > 0) await model.resetHighlight([...ids]);
    }
    this.selecao.clear();
    await this.fragments.update(true);
    if (notificar) this.opts.onSelecionar?.(null);
  }

  get temSelecao(): boolean {
    for (const ids of this.selecao.values()) if (ids.size > 0) return true;
    return false;
  }

  /** GUIDs IFC da seleção atual (âncora dos apontamentos, F3). */
  async guidsDaSelecao(): Promise<string[]> {
    const guids: string[] = [];
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (!model || ids.size === 0) continue;
      const res = await model.getGuidsByLocalIds([...ids]);
      for (const g of res) if (g) guids.push(g);
    }
    return guids;
  }

  /** modeloId (== uploadId) do primeiro elemento selecionado — usado para gravar o Apontamento. */
  modeloPrimarioDaSelecao(): string | null {
    for (const [modeloId, ids] of this.selecao) if (ids.size > 0) return modeloId;
    return null;
  }

  /**
   * Seleciona por GUID IFC (deep-link `?apontamento=N`, F3). Procura os GUIDs em
   * TODOS os modelos carregados no momento — por isso o chamador deve garantir
   * que o modelo âncora do apontamento já foi carregado antes de chamar isto.
   */
  async selecionarPorGuids(guids: string[], notificar = true): Promise<SelecaoInfo | null> {
    await this.limparSelecao(false);
    if (guids.length === 0) {
      if (notificar) this.opts.onSelecionar?.(null);
      return null;
    }
    let primeiraInfo: SelecaoInfo | null = null;
    for (const [modeloId, model] of this.modelos) {
      const localIds = (await model.getLocalIdsByGuids(guids)).filter((id): id is number => id != null);
      if (localIds.length === 0) continue;
      const ids = this.selecao.get(modeloId) ?? new Set<number>();
      for (const id of localIds) ids.add(id);
      this.selecao.set(modeloId, ids);
      await model.highlight(localIds, {
        color: new THREE.Color(COR_SELECAO),
        renderedFaces: RenderedFaces.TWO,
        opacity: 1,
        transparent: false,
      });
      if (!primeiraInfo) primeiraInfo = await this.montarInfo(modeloId, localIds[0]);
    }
    await this.fragments.update(true);
    if (notificar) this.opts.onSelecionar?.(primeiraInfo);
    return primeiraInfo;
  }

  // ── Visibilidade ───────────────────────────────────────────

  /** Mostra só a seleção (nos modelos sem seleção, esconde tudo). */
  async isolarSelecao(): Promise<void> {
    if (!this.temSelecao) return;
    for (const [modeloId, model] of this.modelos) {
      const ids = this.selecao.get(modeloId);
      await model.setVisible(undefined, false);
      if (ids && ids.size > 0) await model.setVisible([...ids], true);
    }
    await this.fragments.update(true);
  }

  async ocultarSelecao(): Promise<void> {
    for (const [modeloId, ids] of this.selecao) {
      const model = this.modelos.get(modeloId);
      if (model && ids.size > 0) await model.setVisible([...ids], false);
    }
    await this.limparSelecao();
  }

  async mostrarTudo(): Promise<void> {
    for (const model of this.modelos.values()) {
      await model.setVisible(undefined, true);
    }
    await this.fragments.update(true);
  }

  // ── Corte ──────────────────────────────────────────────────

  /** Bbox união de todos os modelos carregados. */
  private bboxGlobal(): THREE.Box3 | null {
    let box: THREE.Box3 | null = null;
    for (const model of this.modelos.values()) {
      const b = model.box;
      if (b.isEmpty()) continue;
      box = box ? box.union(b) : b.clone();
    }
    return box;
  }

  /**
   * Define (ou remove, com null) UM plano de corte por eixo do bbox global.
   * O clipping GPU usa renderer.clippingPlanes; o worker corta tiles via
   * getClippingPlanesEvent (mesma lista).
   */
  definirCorte(config: CorteConfig): void {
    this.planosCorte.length = 0;
    if (config) {
      const box = this.bboxGlobal();
      if (box) {
        const eixo = config.eixo;
        const min = box.min[eixo];
        const max = box.max[eixo];
        const pos = min + (max - min) * config.posicao;
        const normal = new THREE.Vector3(
          eixo === "x" ? -1 : 0,
          eixo === "y" ? -1 : 0,
          eixo === "z" ? -1 : 0,
        );
        if (config.invertido) normal.negate();
        // O lado onde normal·p + constant ≥ 0 é mantido; o resto é cortado.
        const ponto = new THREE.Vector3().setComponent(
          eixo === "x" ? 0 : eixo === "y" ? 1 : 2,
          pos,
        );
        this.planosCorte.push(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, ponto));
      }
    }
    this.renderer.clippingPlanes = this.planosCorte;
  }

  // ── Câmera ─────────────────────────────────────────────────

  async enquadrar(): Promise<void> {
    const box = this.bboxGlobal();
    if (!box) return;
    const esfera = box.getBoundingSphere(new THREE.Sphere());
    await this.controls.fitToSphere(esfera, true);
  }

  /** Captura a câmera atual em espaço IFC (Z-up) — o que o Apontamento persiste. */
  capturarCamera(): CameraApontamento {
    const pos = this.camera.position;
    const alvo = this.controls.getTarget(new THREE.Vector3());
    return {
      position: threeParaIfc([pos.x, pos.y, pos.z]),
      target: threeParaIfc([alvo.x, alvo.y, alvo.z]),
    };
  }

  /** Restaura uma câmera gravada (espaço IFC) — usado no deep-link `?apontamento=N`. */
  async restaurarCamera(camera: CameraApontamento): Promise<void> {
    const [px, py, pz] = ifcParaThree(camera.position);
    const [tx, ty, tz] = ifcParaThree(camera.target);
    await this.controls.setLookAt(px, py, pz, tx, ty, tz, true);
  }

  /**
   * Renderiza um frame e captura o canvas como PNG (snapshot do apontamento).
   * Funciona sem `preserveDrawingBuffer` porque o readback acontece na mesma
   * task síncrona do render, antes do navegador limpar o back buffer.
   */
  capturarSnapshot(): Promise<Blob | null> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve) => this.renderer.domElement.toBlob((b) => resolve(b), "image/png"));
  }

  // ── Pins (marcadores 3D dos apontamentos) ───────────────────

  /** Registra um callback rodado a cada frame (após o render) — usado p/ reprojetar pins na tela. */
  onFrame(cb: () => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** Centroide (espaço three, mundo) da união dos bboxes dos GUIDs — âncora do pin do apontamento. */
  async ancoraDeGuids(modeloId: string, guids: string[]): Promise<{ x: number; y: number; z: number } | null> {
    const model = this.modelos.get(modeloId);
    if (!model || guids.length === 0) return null;
    const localIds = (await model.getLocalIdsByGuids(guids)).filter((id): id is number => id != null);
    if (localIds.length === 0) return null;
    const boxes = await model.getBoxes(localIds);
    if (!boxes || boxes.length === 0) return null;
    const uniao = boxes.reduce((acc, b) => acc.union(b), boxes[0].clone());
    const centro = uniao.getCenter(new THREE.Vector3());
    return { x: centro.x, y: centro.y, z: centro.z };
  }

  /** Projeta um ponto do mundo (espaço three) para pixels do container. `dentro` = na frente da câmera. */
  projetar(pos: { x: number; y: number; z: number }): { x: number; y: number; dentro: boolean } | null {
    const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, dentro: v.z > -1 && v.z < 1 };
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  private redimensionar() {
    const w = this.container.clientWidth;
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  async dispose(): Promise<void> {
    if (this.destruido) return;
    this.destruido = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    await this.fragments.dispose().catch(() => {});
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.modelos.clear();
    this.selecao.clear();
  }

  // ── Dados do item ──────────────────────────────────────────

  private async montarInfo(modeloId: string, localId: number): Promise<SelecaoInfo> {
    const model = this.modelos.get(modeloId)!;
    const [guids, dados] = await Promise.all([
      model.getGuidsByLocalIds([localId]),
      model
        .getItemsData([localId], {
          attributesDefault: true,
          relations: { IsDefinedBy: { attributes: true, relations: true } },
        })
        .catch(() => [] as ItemData[]),
    ]);
    const { atributos, psets } = extrairAtributos(dados[0]);
    return { modeloId, localId, guid: guids[0] ?? null, atributos, psets };
  }
}
