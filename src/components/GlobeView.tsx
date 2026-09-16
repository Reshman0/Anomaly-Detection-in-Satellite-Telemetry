import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useConsole, type EarthTheme, type GlobeView as GorunumOnayari } from '../store';
import {
  ankaraCanvas,
  ankaraMeta,
  currentImagery,
  earthCanvas,
  onAnkara,
  onBmng,
  onImageryChange,
  refreshCurrentImagery,
} from '../ui/earthTexture';
import {
  ANKARA_CENTER,
  EARTH_KM,
  FOLLOW_MIN_DISTANCE,
  MIN_DISTANCE,
  altitudeKm,
  chipLines,
  fitAltitudeKm,
  markerScale,
  nearPlaneFor,
  patchInView,
  patchOpacity,
  rotateSpeedFor,
  sphereParams,
  toVec,
  zoomSpeedFor,
} from '../ui/yakinGoruntu';
import { availableDate, fmtTrDate } from '../ui/gibs';
import MapView2D from './MapView2D';
import {
  GROUND_STATION,
  SATELLITES,
  SAT_GROUPS,
  groundTrack,
  rangeRateAt,
  satByNorad,
  stateAt,
  visibilityConeRadiusDeg,
  type SatelliteRecord,
} from '../engine/orbit';
import { COLOR } from '../ui/colors';
import { takipKonumu } from '../ui/kameraTakip';
import SatelliteList from './SatelliteList';

const D2R = Math.PI / 180;
const GEO_ALT_KM = 35786;

/**
 * Irtifa -> gorsel yaricap. LEO'da gercek olcege yakindir (~%2 hata),
 * daha yukarida logaritmik olarak sikistirilir; aksi halde GEO halkasi
 * 6.6 dunya yaricapinda kalir ve kure noktaya doner. Ekranda "irtifa gorsel
 * olarak sikistirilmistir" notu ile birlikte gosterilir; okunan km degerleri
 * her zaman gercektir.
 */
function displayRadius(altKm: number): number {
  return 1 + 0.36 * Math.log(1 + altKm / 2500);
}

const GEO_DISPLAY_R = displayRadius(GEO_ALT_KM);
/** Kamera cerceveleme yaricaplari: LEO gorunumu ve tum filo gorunumu. */
const FIT_RADIUS: Record<'LEO' | 'ALL', number> = { LEO: 1.22, ALL: GEO_DISPLAY_R };

/**
 * Cerceve on ayarlarinin etiketleri tek kayitta: eskiden iki yollu uclu
 * kosullardi ve ucuncu bir deger sessizce "TUMU" diye etiketlenirdi.
 */
const VIEW_META: Record<GorunumOnayari, { label: string; title: string }> = {
  LEO: { label: 'LEO', title: 'Alçak yörüngeye yakınlaş (L, yalnızca 3B)' },
  ALL: { label: 'TÜMÜ', title: 'GEO kuşağı dahil tüm filoyu sığdır (T, yalnızca 3B)' },
  ANKARA: {
    label: 'ANKARA',
    title:
      'Ankara yakın görüntüsü: NASA HLS · Sentinel-2 · 30 m (Y). Kamera ~110 km\'ye iner; ' +
      'görüntü FİZİKİ ve GÜNCEL temalarda çizilir, gerekirse FİZİKİ\'ye geçilir.',
  },
};

// toVec (enlem/boylam -> kure koordinati) ui/yakinGoruntu.ts'te: parca geometrisi ayni eslemeyi kullanir.

/** Kure yuzeyinde bir merkez etrafinda acisal yaricapli cember. */
function circleOnSphere(latDeg: number, lonDeg: number, radiusDeg: number, r: number, segments = 96): THREE.Vector3[] {
  const centre = toVec(latDeg, lonDeg, 1);
  const up = Math.abs(centre.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(up, centre).normalize();
  const e2 = new THREE.Vector3().crossVectors(centre, e1).normalize();
  const a = radiusDeg * D2R;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const v = centre
      .clone()
      .multiplyScalar(Math.cos(a))
      .add(e1.clone().multiplyScalar(Math.sin(a) * Math.cos(th)))
      .add(e2.clone().multiplyScalar(Math.sin(a) * Math.sin(th)));
    pts.push(v.multiplyScalar(r));
  }
  return pts;
}

/** Tema canvas'ini three.js dokusuna sarar (bkz. src/ui/earthTexture.ts). */
function toTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Ekran boyutu sabit kalan metin etiketi. Kure donerken kucultup buyutmez;
 * `depthTest` acik oldugu icin uzak tarafa gectiginde kurenin arkasinda kalir.
 */
function makeLabel(text: string, color: string, screenHeight = 0.03): THREE.Sprite {
  const pad = 10;
  const font = '600 26px Consolas, monospace';
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = 40;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: true, transparent: true }),
  );
  sprite.scale.set((w / h) * screenHeight, screenHeight, 1);
  // Cizgiyi kapatmasin diye etiket noktanin biraz ustunde durur.
  sprite.center.set(0.5, -0.25);
  return sprite;
}

const C_KM_S = 299792.458;

/** Menzil hizi ve tek yon isik gecikmesi — her ikisi de SGP4'ten. */
function rangeText(sat: SatelliteRecord, utcMs: number, rangeKm: number): string {
  const rr = rangeRateAt(sat, utcMs);
  const owlt = (rangeKm / C_KM_S) * 1000;
  return (
    (rr === null ? '' : '   RR ' + (rr >= 0 ? '+' : '') + rr.toFixed(2) + ' km/s') +
    '   OWLT ' +
    owlt.toFixed(1) +
    ' ms'
  );
}

/** Turkiye'nin yaklasik agirlik merkezi — ulke etiketi icin. */
const TR_LABEL_POS = { lat: 39.0, lon: 35.2 };

/** Tema basina cizgi/halka renkleri ve etiket gorunurlugu. */
const THEME_STYLE: Record<EarthTheme, { rim: number; graticule: number; graticuleOpacity: number; label: boolean; belt: number }> = {
  ops: { rim: 0x33566a, graticule: 0x2e4653, graticuleOpacity: 0.5, label: true, belt: 0x2b3d49 },
  political: { rim: 0x7f95a6, graticule: 0x5b6b78, graticuleOpacity: 0.28, label: false, belt: 0x3a4d5a },
  physical: { rim: 0x4d6f86, graticule: 0xdde8f0, graticuleOpacity: 0.22, label: true, belt: 0x3a4d5a },
  current: { rim: 0x4d6f86, graticule: 0xdde8f0, graticuleOpacity: 0.22, label: true, belt: 0x3a4d5a },
};

export const THEME_LABELS: Record<EarthTheme, string> = {
  ops: 'OPS',
  political: 'SİYASİ',
  physical: 'FİZİKİ',
  current: 'GÜNCEL',
};

/**
 * Tema basina metinler tek kayitta toplanir. Eskiden bunlar dugme ipucunda
 * ve 2B lejandinda ayri ayri ic ice ucluklerdi; yeni bir tema eklendiginde
 * sessizce yanlis sonuc veriyordu (2B lejandi yeni temayi "OPS zemini" diye
 * etiketliyordu). Record<EarthTheme, …> oldugu icin artik derleyici her temayi
 * her cagri yerinden gecmeye zorlar.
 */
const THEME_META: Record<EarthTheme, { title: string }> = {
  ops: { title: 'Operasyon konsolu zemini' },
  political: { title: 'Siyasi harita: ülke dolguları ve adları (Natural Earth 110m, NAME_TR)' },
  physical: { title: 'Fiziki: NASA Blue Marble NG (Aralık 2004), topografya + batimetri' },
  current: {
    title:
      'Güncel: NASA EOSDIS GIBS/Worldview · VIIRS SNPP günlük mozaik (anlık görüntü değil; ' +
      'siyah kuşak kutup gecesidir). Pakete gömülü gelir, ağ isteği gerektirmez; ↻ ile elle tazelenir.',
  },
};

/** 2B lejandinda yer dar: tek kelimelik kaynak adi. */
const THEME_2D_LABEL: Record<EarthTheme, string> = {
  ops: 'OPS zemini',
  political: 'Natural Earth',
  physical: 'NASA Blue Marble',
  current: 'NASA GIBS VIIRS',
};

function buildGraticule(color: number, opacity: number): THREE.LineSegments {
  const positions: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 5) {
      push(toVec(lat, lon, 1.0005), toVec(lat, lon + 5, 1.0005));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 5) {
      push(toVec(lat, lon, 1.0005), toVec(lat + 5, lon, 1.0005));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** GEO kusagi referans halkasi — ekvator duzleminde, sikistirilmis yaricapta. */
function buildGeoBelt(): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 180; i++) {
    const th = (i / 180) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(th) * GEO_DISPLAY_R, 0, Math.sin(th) * GEO_DISPLAY_R));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x2b3d49 }),
  );
}

const groupColor = new Map(SAT_GROUPS.map((g) => [g.id, g.color]));

export default function GlobeView() {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const globeView = useConsole((s) => s.globeView);
  const setGlobeView = useConsole((s) => s.setGlobeView);
  const fitNonce = useConsole((s) => s.globeFitNonce);
  const followSat = useConsole((s) => s.followSat);
  const setFollow = useConsole((s) => s.setFollow);
  const earthTheme = useConsole((s) => s.earthTheme);
  const imageryDaysBack = useConsole((s) => s.imageryDaysBack);
  const setImageryDaysBack = useConsole((s) => s.setImageryDaysBack);
  const setEarthTheme = useConsole((s) => s.setEarthTheme);
  const visibleCount = useRef<HTMLSpanElement>(null);
  const applyTheme = useRef<((t: EarthTheme) => void) | null>(null);
  const mapMode = useConsole((s) => s.mapMode);
  const setMapMode = useConsole((s) => s.setMapMode);
  // Goruntu durumu React disinda tutulur (modul duzeyinde); bu sayac onu
  // yeniden cizime baglar.
  const [imageryTick, setImageryTick] = useState(0);
  const imagery = useMemo(() => currentImagery(), [imageryTick, earthTheme]);
  const paletteVersion = useConsole((s) => s.paletteVersion);
  const a11y = useConsole((s) => s.a11y);
  // Erisilebilirlik paleti degisince bir kez kurulan three.js renkleri guncellenir.
  const applyPalette = useRef<(() => void) | null>(null);

  // Kamerayi yeniden cerceveleyecek callback; efekt icinde doldurulur.
  const refit = useRef<(() => void) | null>(null);
  // Ankara yakin goruntusunun atif cipi; gorunurlugu ve metni cizim dongusunde.
  const chip = useRef<HTMLDivElement>(null);
  const setDamping = useRef<((on: boolean) => void) | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(COLOR.sunken), 1);
    el.appendChild(renderer.domElement);
    // setSize(w, h, false) yalnizca arka tamponu ayarlar, CSS boyutunu degil.
    // Canvas'i kapsayiciya kilitle: ResizeObserver gecikse bile tasmaz.
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const trLabel = makeLabel('TÜRKİYE', '#dff0fa', 0.032);
    const earthMat = new THREE.MeshBasicMaterial({ map: toTexture(earthCanvas('ops')!) });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat));

    // Ankara yakin goruntusu: dunyanin ustunde ayri bir kure parcasi. Ankara
    // tek bir 96x64 hucresinin icinde; o hucrenin yuzu r=1'in 1.9-3.4 km
    // ALTINDA, bu yuzden r=1'deki parca her zaman onde (derinlik kaydirmasi
    // gerekmez). Saydamlar opaklardan sonra cizilir; renderOrder -1 onu dunya
    // ile gorus cizgileri / yer noktalari arasina koyar. depthWrite, yer
    // noktasinin r=1 altindaki yarisini gizler.
    const patchSp = sphereParams();
    const patchMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: true, opacity: 0 });
    const patch = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16, patchSp.phiStart, patchSp.phiLength, patchSp.thetaStart, patchSp.thetaLength),
      patchMat,
    );
    patch.renderOrder = -1;
    patch.visible = false;
    scene.add(patch);
    let patchTex: THREE.Texture | null = null;
    // Kurede gercekten CIZILEN tema (swap ertelenebilir ya da atlanabilir).
    let shownTheme: EarthTheme = 'ops';
    const offAnkara = onAnkara(() => {
      const cv = ankaraCanvas();
      if (!cv || patchTex) return;
      patchTex = toTexture(cv);
      patchMat.map = patchTex;
      patchMat.needsUpdate = true;
      // ~26 MB'lik GPU yuklemesi demo ortasinda degil, acilista olsun.
      renderer.initTexture(patchTex);
    });
    // Kure siluetini ayirmak icin ince bir kenar halkasi (ic yuzu cizilen buyuk kure).
    const rimMat = new THREE.MeshBasicMaterial({ color: THEME_STYLE.ops.rim, side: THREE.BackSide });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.014, 64, 48), rimMat));
    const graticule = buildGraticule(THEME_STYLE.ops.graticule, THEME_STYLE.ops.graticuleOpacity);
    scene.add(graticule);
    const belt = buildGeoBelt();
    scene.add(belt);

    // Tema dokulari bir kez uretilir, sonra anahtarlanir.
    const textures = new Map<EarthTheme, THREE.Texture>();
    textures.set('ops', earthMat.map!);
    applyTheme.current = (t: EarthTheme) => {
      const st = THEME_STYLE[t];
      rimMat.color.set(st.rim);
      (graticule.material as THREE.LineBasicMaterial).color.set(st.graticule);
      (graticule.material as THREE.LineBasicMaterial).opacity = st.graticuleOpacity;
      (belt.material as THREE.LineBasicMaterial).color.set(st.belt);
      trLabel.visible = st.label;
      const swap = () => {
        // Asenkron dokular kuyruga yaziyor: FIZIKI'ye basip doku cozulmeden
        // OPS'a donersen kuyruktaki eski swap sonradan kosar ve kure yanlis
        // dokuda kalirdi. Gec kalan her swap once kendini dogrular.
        if (useConsole.getState().earthTheme !== t) return;
        let tex = textures.get(t);
        if (!tex) {
          const cv = earthCanvas(t);
          if (!cv) return; // henuz cozulmedi; goruntu gelince yeniden cagrilir
          tex = toTexture(cv);
          textures.set(t, tex);
        }
        earthMat.map = tex;
        earthMat.needsUpdate = true;
        shownTheme = t;
        // Tema degisimi rAF beklemesin: sekme arka plandayken bile bir kare cizilsin.
        renderer.render(scene, camera);
      };
      if (t === 'physical') onBmng(swap);
      else swap();
    };

    // Yer istasyonu
    // Istasyon noktasi yakinda hem kuculur hem alcalir (her karede, asagida);
    // yalnizca kucultmek onu 40 km'den bakinca 17 km oteye gosterirdi.
    // gsPos gorus cizgilerinin de baslangici oldugu icin cizgiler birlikte iner.
    const GS_UNIT = toVec(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, 1);
    const gsPos = GS_UNIT.clone().multiplyScalar(1.004);
    const gsDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 12, 12),
      new THREE.MeshBasicMaterial({ color: COLOR.nominal }),
    );
    gsDot.position.copy(gsPos);
    scene.add(gsDot);

    trLabel.position.copy(toVec(TR_LABEL_POS.lat, TR_LABEL_POS.lon, 1.02));
    scene.add(trLabel);

    // Gorus konisi (secili uydunun anlik irtifasina gore guncellenir)
    const cone = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: COLOR.nominal, transparent: true, opacity: 0.55 }),
    );
    scene.add(cone);

    // Secili uydunun yorunge izi
    const track = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x7d9aab }),
    );
    scene.add(track);

    // Gorus vektoru (istasyon -> secili uydu)
    const los = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: COLOR.nominal, transparent: true, opacity: 0.7 }),
    );
    scene.add(los);

    // --- filo: her uydu icin bir isaret + yer izdusumu ---
    const bodyGeo = new THREE.OctahedronGeometry(0.02);
    const dropGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const markers = SATELLITES.map((sat) => {
      const color = new THREE.Color(groupColor.get(sat.group) ?? COLOR.dim);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color }));
      // Yer izdusumu: uydunun dunya yuzeyindeki gercek anlik konumu.
      const drop = new THREE.Mesh(
        dropGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
      );
      // Bag cizgisi her karede guncellenir; tampon bir kez ayrilir.
      const tetherPos = new Float32Array(6);
      const tetherGeo = new THREE.BufferGeometry();
      tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
      const tether = new THREE.Line(
        tetherGeo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 }),
      );
      // Istasyondan gorunen her uyduya ince bir gorus vektoru.
      const losPos = new Float32Array(6);
      const losGeo = new THREE.BufferGeometry();
      losGeo.setAttribute('position', new THREE.BufferAttribute(losPos, 3));
      const losLine = new THREE.Line(
        losGeo,
        new THREE.LineBasicMaterial({ color: COLOR.nominal, transparent: true, opacity: 0.28 }),
      );
      losLine.visible = false;
      scene.add(body, drop, tether, losLine);
      return { sat, body, drop, tether, tetherPos, losLine, losPos };
    });

    // Secili uydunun etrafindaki halka
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.045, 32),
      new THREE.MeshBasicMaterial({ color: COLOR.text, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    scene.add(halo);

    applyPalette.current = () => {
      renderer.setClearColor(new THREE.Color(COLOR.sunken), 1);
      (gsDot.material as THREE.MeshBasicMaterial).color.set(COLOR.nominal);
      (cone.material as THREE.LineBasicMaterial).color.set(COLOR.nominal);
      (los.material as THREE.LineBasicMaterial).color.set(COLOR.nominal);
      (halo.material as THREE.MeshBasicMaterial).color.set(COLOR.text);
      for (const m of markers) (m.losLine.material as THREE.LineBasicMaterial).color.set(COLOR.nominal);
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !useConsole.getState().a11y.reduceMotion;
    setDamping.current = (on: boolean) => {
      controls.enableDamping = on;
    };
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    // Yakin goruntu icin yuzeye 40 km'ye kadar inilir. Tekerlek/surukleme hizi
    // ve yakin kirpma duzlemi her karede irtifaya gore ayarlanir; bugunku
    // sinirin (d = 1.35) ustunde davranis degismez (ui/yakinGoruntu.ts).
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = 40;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;

    // Kullanici kamerayi elle oynatana kadar sahne panele sigacak sekilde cerceveler.
    let userMoved = false;
    controls.addEventListener('start', () => {
      // OrbitControls 'start'i zoom hesabindan ONCE gonderir: bu centik icin
      // hiz buradan okunur (ozel tekerlek isleyicisi gerekmez).
      controls.zoomSpeed = zoomSpeedFor(camera.position.length());
      userMoved = true;
      // Elle mudahale takibi keser.
      if (useConsole.getState().followSat) useConsole.getState().setFollow(false);
    });

    /** Verilen yaricapi hem yatay hem dusey sigdiran kamera uzakligi. */
    const fitDistance = (aspect: number, radius: number): number => {
      const vFov = (camera.fov * D2R) / 2;
      const hFov = Math.atan(Math.tan(vFov) * aspect);
      return radius / Math.min(Math.sin(vFov), Math.sin(hFov));
    };

    const frame = () => {
      const view = useConsole.getState().globeView;
      const aspect = camera.aspect || 1;
      if (view === 'ANKARA') {
        // Onceki suruklemeden kalan sonumleme hareketini bosalt; yoksa eski
        // hizla hesaplanmis donus ~110 km'de uygulanir ve gorus Ankara'dan kayar.
        const damp = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();
        controls.enableDamping = damp;
        camera.position.copy(
          toVec(ANKARA_CENTER.lat, ANKARA_CENTER.lon, 1 + fitAltitudeKm(aspect, camera.fov) / EARTH_KM),
        );
        controls.update();
        return;
      }
      camera.position.setLength(fitDistance(aspect, FIT_RADIUS[view]));
    };

    camera.position.copy(toVec(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, 5));
    refit.current = () => {
      userMoved = false;
      frame();
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!userMoved) frame();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let lastTrackMs = -1e12;
    let lastTrackNorad = '';

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const state = useConsole.getState();
      // 2B harita acikken kure gizlidir; WebGL cizimi atlanir, sahne canli kalir.
      if (state.mapMode === '2D') return;
      const utcMs = state.sim.clock.utcMs();
      const selected = state.selectedNorad;

      // Isaretci olcegi: bugunku sinirin (2230 km) ustunde 1; yaklasinca kuculur
      // ve alcalir, Ankara parcasini ortmez. Bir kare gecikme gorunmez.
      const ms = markerScale(camera.position.length());
      gsPos.copy(GS_UNIT).multiplyScalar(1 + 0.004 * ms);
      gsDot.position.copy(gsPos);
      gsDot.scale.setScalar(ms);
      halo.scale.setScalar(ms);

      // --- tum filo (uydu basina tek SGP4 yayilimi) ---
      let nVisible = 0;
      let selectedState: ReturnType<typeof stateAt> = null;
      for (const m of markers) {
        const st = stateAt(m.sat, utcMs);
        if (!st) {
          m.body.visible = false;
          m.drop.visible = false;
          m.tether.visible = false;
          m.losLine.visible = false;
          continue;
        }
        const sp = st.sub;
        m.body.visible = true;
        m.drop.visible = true;
        m.tether.visible = true;
        const surface = toVec(sp.latDeg, sp.lonDeg, 1 + 0.006 * ms);
        const orbitPos = toVec(sp.latDeg, sp.lonDeg, displayRadius(sp.altKm));
        m.body.position.copy(orbitPos);
        m.body.scale.setScalar(ms);
        m.drop.position.copy(surface);
        m.drop.scale.setScalar(ms);
        m.tetherPos.set([surface.x, surface.y, surface.z, orbitPos.x, orbitPos.y, orbitPos.z]);
        m.tether.geometry.attributes.position.needsUpdate = true;

        const inView = st.look.elevationDeg >= GROUND_STATION.min_elevation_deg;
        m.losLine.visible = inView && m.sat.norad !== selected;
        if (inView) {
          nVisible++;
          m.losPos.set([gsPos.x, gsPos.y, gsPos.z, orbitPos.x, orbitPos.y, orbitPos.z]);
          m.losLine.geometry.attributes.position.needsUpdate = true;
        }

        if (m.sat.norad === selected) {
          selectedState = st;
          halo.position.copy(orbitPos);
          halo.lookAt(camera.position);
          halo.visible = true;
        }
      }
      if (visibleCount.current) visibleCount.current.textContent = String(nVisible);

      // --- secili uydu: koni, iz, gorus vektoru, okuma satiri, takip ---
      const sat = satByNorad(selected);
      if (selectedState) {
        const sp = selectedState.sub;
        const la = selectedState.look;
        const visible = la.elevationDeg >= GROUND_STATION.min_elevation_deg;
        const orbitPos = toVec(sp.latDeg, sp.lonDeg, displayRadius(sp.altKm));

        // Takip: kamera uydunun uzerinde, AYNI UZAKLIKTA durur; dunya altinda
        // doner (bkz. ui/kameraTakip.ts — uzaklik korunur, yalnizca yon doner).
        if (state.followSat) {
          camera.position.copy(takipKonumu(camera.position, orbitPos, 0.12, FOLLOW_MIN_DISTANCE));
          camera.lookAt(0, 0, 0);
        }

        cone.geometry.dispose();
        cone.geometry = new THREE.BufferGeometry().setFromPoints(
          circleOnSphere(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, visibilityConeRadiusDeg(sp.altKm), 1.003),
        );

        los.visible = visible;
        if (visible) los.geometry.setFromPoints([gsPos, orbitPos]);

        const periodS = sat.periodMin * 60;
        if (selected !== lastTrackNorad || Math.abs(utcMs - lastTrackMs) > periodS * 100) {
          lastTrackMs = utcMs;
          lastTrackNorad = selected;
          const pts = groundTrack(sat, utcMs, periodS * 0.75, Math.max(20, periodS / 150)).map((q) =>
            toVec(q.latDeg, q.lonDeg, 1.0015),
          );
          // Boylam sarmasinda uzun atlamalari at.
          const clean: THREE.Vector3[] = [];
          for (let i = 0; i < pts.length; i++) {
            if (i > 0 && pts[i].distanceTo(pts[i - 1]) > 0.35) break;
            clean.push(pts[i]);
          }
          track.geometry.dispose();
          track.geometry = new THREE.BufferGeometry().setFromPoints(clean);
        }

        if (readout.current) {
          readout.current.textContent =
            sat.name +
            '   ALT ' +
            sp.altKm.toFixed(1) +
            ' km   LAT ' +
            sp.latDeg.toFixed(2) +
            '°   LON ' +
            sp.lonDeg.toFixed(2) +
            '°   AZ ' +
            ((la.azimuthDeg + 360) % 360).toFixed(1) +
            '°   EL ' +
            la.elevationDeg.toFixed(1) +
            '°   RANGE ' +
            la.rangeKm.toFixed(0) +
            ' km' +
            rangeText(sat, utcMs, la.rangeKm);
        }
      }

      controls.update();

      // --- yakin goruntu: kamera ayarlari, parca, atif cipi ---
      const dist = camera.position.length();
      controls.zoomSpeed = zoomSpeedFor(dist); // orta tus surukleme zoom'u her hareketi okur
      controls.rotateSpeed = rotateSpeedFor(dist);
      const near = nearPlaneFor(dist);
      if (near !== camera.near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      const alt = altitudeKm(dist);
      const op = patchOpacity(alt);
      const imagery = shownTheme === 'physical' || shownTheme === 'current';
      // Yalnizca opaklik 0 degil, gorunmez: uzakta derinlik adimi km mertebesinde.
      patch.visible = patchTex !== null && imagery && op > 0;
      patchMat.opacity = op;
      if (chip.current) {
        const tanV = Math.tan((camera.fov / 2) * D2R);
        const onScreen = patch.visible && patchInView(camera.position, Math.hypot(tanV, tanV * camera.aspect));
        chip.current.style.display = onScreen ? '' : 'none';
        const km = Math.round(alt);
        // 2B'den donunce cip yeniden olusur (bos): kimlik degisince de yazilir.
        if (onScreen && (km !== lastChipKm || chip.current !== lastChipEl)) {
          lastChipKm = km;
          lastChipEl = chip.current;
          const lines = chipLines(alt, ankaraMeta.date);
          const rows = chip.current.children;
          for (let i = 0; i < lines.length && i < rows.length; i++) rows[i].textContent = lines[i];
        }
      }

      renderer.render(scene, camera);
    };
    let lastChipKm = -1;
    let lastChipEl: HTMLDivElement | null = null;
    loop();

    // GUNCEL mozaik degistiginde (gomulu cozuldu ya da agdan tazelendi): canvas
    // NESNESI ayni kalir, icine yeniden cizilir. Bu yuzden dokuyu atmak degil,
    // yeniden yuklenmesini istemek yeterli. Abonelik mount'ta kurulur ki hangi
    // tema aktif olursa olsun ateslensin.
    const offImagery = onImageryChange(() => {
      const tex = textures.get('current');
      if (tex) tex.needsUpdate = true;
      if (useConsole.getState().earthTheme === 'current') {
        applyTheme.current?.('current');
        renderer.render(scene, camera);
      }
    });

    return () => {
      offImagery();
      offAnkara();
      patchTex?.dispose();
      patch.geometry.dispose();
      patchMat.dispose();
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      refit.current = null;
      applyTheme.current = null;
      applyPalette.current = null;
      setDamping.current = null;
      el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    applyTheme.current?.(earthTheme);
  }, [earthTheme]);

  // Goruntu durumu React disinda (modul duzeyinde) tutuluyor; degisimi tetikleyen
  // ne olursa olsun (dugme, gomulu goruntunun cozulmesi, hata) arayuz tazelensin.
  useEffect(() => onImageryChange(() => setImageryTick((n) => n + 1)), []);

  useEffect(() => {
    applyPalette.current?.();
  }, [paletteVersion]);

  useEffect(() => {
    setDamping.current?.(!a11y.reduceMotion);
  }, [a11y.reduceMotion]);

  // Gorunum onayari degistiginde kamerayi yeniden cerceveler.
  useEffect(() => {
    refit.current?.();
  }, [fitNonce, globeView]);

  return (
    <section className="panel flex flex-col flex-1 min-h-[300px]">
      <div className="panel-title flex items-center justify-between">
        <span>Dünya · SGP4 · Türkiye uydu kataloğu · {mapMode === '2D' ? '2B eşdikdörtgen' : '3B küre'}</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {SATELLITES.length} uydu · istasyondan görünen{' '}
          <span ref={visibleCount} className="text-ops-nominal">
            0
          </span>
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        {/* Canvas listenin sagindan baslar: kure bindirmenin altinda kalmasin. */}
        <div ref={host} className={'absolute inset-y-0 right-0 left-[196px]' + (mapMode === '2D' ? ' invisible' : '')} aria-hidden={mapMode === '2D'} />
        {mapMode === '2D' && <MapView2D />}

        <SatelliteList />

        {/* Ankara yakin goruntusunun kaynak bildirimi (yonerge §0). Yalnizca parca
            gercekten ekrandayken gorunur. Ozet modunda GIZLENMEZ: ekrandaki
            goruntunun kaynagini soyler, SIMULE VERI rozeti gibi. */}
        {mapMode === '3D' && (
          <div
            ref={chip}
            style={{ display: 'none' }}
            className="absolute left-[204px] top-2 max-w-[250px] text-3xs leading-[13px] bg-ops-sunken/90 border border-ops-line2 px-1.5 py-1 pointer-events-auto"
            title={
              'Katman: ' + ankaraMeta.layer + ' (BRDF düzeltilmiş yansıma)\n' +
              'NASA HLS S30 v2.0 · doi:' + ankaraMeta.doi + '\n' +
              'Contains modified Copernicus Sentinel data 2026\n' +
              'Kutu: ' + ankaraMeta.bbox.south + '–' + ankaraMeta.bbox.north + '°K, ' +
              ankaraMeta.bbox.west + '–' + ankaraMeta.bbox.east + '°D · piksel ~23×30 m\n' +
              'Pakete gömülü, ağ isteği yok. Çevre zemin ~20 km/piksel ve farklı tarihli.\n' +
              'Türkiye vurgusu (%18 sarı) bu görüntüye de uygulanmıştır.'
            }
          >
            <div className="text-ops-text tracking-[0.06em]" />
            <div className="text-ops-dim" />
            <div className="text-ops-faint" />
          </div>
        )}

        <div className="absolute right-2 top-2 flex gap-[3px]">
          {(['3D', '2D'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMapMode(m)}
              aria-pressed={mapMode === m}
              title={m === '3D' ? '3B küre (M ile geçiş)' : '2B eşdikdörtgen harita: yer izi, görüş dairesi, tüm filo (M ile geçiş)'}
              className={
                'num text-2xs px-[6px] py-[2px] border transition-colors ' +
                (mapMode === m
                  ? 'border-ops-text text-ops-text bg-ops-sunken'
                  : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
              }
            >
              {m === '3D' ? '3B' : '2B'}
            </button>
          ))}
          <span className="w-1" />
          {(['LEO', 'ALL', 'ANKARA'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setGlobeView(v)}
              // ANKARA 2B'deyken de basilabilir: 3B'ye gecip yakinlasir.
              disabled={mapMode === '2D' && v !== 'ANKARA'}
              aria-pressed={globeView === v}
              title={VIEW_META[v].title}
              className={
                'num text-2xs px-[6px] py-[2px] border transition-colors ' +
                (globeView === v
                  ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10'
                  : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
              }
            >
              {VIEW_META[v].label}
            </button>
          ))}
          <button
            onClick={() => setFollow(!followSat)}
            disabled={mapMode === '2D'}
            title="Kamera seçili uyduyu takip eder; dünya altında döner (F, yalnızca 3B)"
            className={
              'num text-2xs px-[6px] py-[2px] border transition-colors ml-1 ' +
              (followSat
                ? 'border-ops-ai text-ops-ai bg-ops-ai/10'
                : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
            }
          >
            TAKİP
          </button>
        </div>
        <div className="ozet-gizle absolute right-2 top-[26px] flex gap-[3px]">
          {(['ops', 'political', 'physical', 'current'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setEarthTheme(t)}
              aria-pressed={earthTheme === t}
              title={THEME_META[t].title}
              className={
                'num text-2xs px-[6px] py-[2px] border transition-colors ' +
                (earthTheme === t
                  ? 'border-ops-text text-ops-text bg-ops-sunken'
                  : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
              }
            >
              {THEME_LABELS[t]}
            </button>
          ))}
          {earthTheme === 'current' &&
            /* Gun secimi: -1g dun (tam kaplamasi beklenen en yeni gun), -2g, -3g. Secince
               mozaik o gun icin agdan tazelenir; basarisiz olursa gomulu goruntu kalir.
               Gosterilen mozaigin tarihi ↻ ipucunda yazar, secilen gunle ayni olmayabilir. */
            [1, 2, 3].map((d) => (
              <button
                key={d}
                onClick={() => {
                  setImageryDaysBack(d);
                  void refreshCurrentImagery(d);
                }}
                disabled={imagery.refreshing}
                aria-pressed={imageryDaysBack === d}
                title={'Mozaiği ' + d + ' gün önceki (UTC) günlük VIIRS görüntüsüyle tazele: ' + fmtTrDate(availableDate(Date.now(), d))}
                className={
                  'num text-2xs px-[5px] py-[2px] border transition-colors ' +
                  (imageryDaysBack === d && imagery.live
                    ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10'
                    : imagery.refreshing
                      ? 'border-ops-line2 text-ops-faint'
                      : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
                }
              >
                −{d}g
              </button>
            ))}
          {earthTheme === 'current' && (
            <button
              onClick={() => void refreshCurrentImagery(imageryDaysBack)}
              disabled={imagery.refreshing}
              title={
                'Mozaiği NASA GIBS’ten tazele (seçili gün: −' + imageryDaysBack + 'g). Tek ağ isteği; başarısız olursa gömülü görüntü korunur. ' +
                'Gösterilen: ' + fmtTrDate(imagery.date) + (imagery.live ? ' (ağdan)' : ' (gömülü)')
              }
              className={
                'num text-2xs px-[6px] py-[2px] border transition-colors ' +
                (imagery.refreshing
                  ? 'border-ops-line2 text-ops-faint'
                  : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
              }
            >
              {imagery.refreshing ? '…' : '↻'}
            </button>
          )}
        </div>

        {/* Okuma satiri kurenin basladigi yerden (uydu listesi 196 px) baslar:
            left-2 iken listenin alt kartinin (yorunge elemanlari) ustune biniyordu.
            3B'de sag ustte, gorunum dugmelerinin altinda yalnizca GUNCEL mozaik
            tazeleme durumu cikar (aciklama kutusu kaldirildi). */}
        <div
          ref={readout}
          className={
            'ozet-gizle absolute left-[204px] bottom-2 max-w-[calc(100%-212px)] num text-3xs text-ops-dim leading-[13px] bg-ops-sunken/85 px-1.5 py-1 pointer-events-none' +
            (mapMode === '2D' ? ' hidden' : '')
          }
        />
        {mapMode === '3D' ? (
          earthTheme === 'current' &&
          (imagery.refreshing || imagery.error) && (
            // Yalnizca operatorun bastigi ↻ / gun dugmesinin sonucu: basarisizlik sessiz kalmasin.
            <div className="ozet-gizle absolute right-2 top-[52px] text-3xs bg-ops-sunken/85 px-1.5 py-1 pointer-events-none leading-relaxed text-right max-w-[min(60%,calc(100%-212px))]">
              {imagery.refreshing && <div className="text-ops-soft">GIBS’ten görüntü alınıyor…</div>}
              {imagery.error && (
                <div className="text-ops-warn">Canlı görüntü alınamadı ({imagery.error}) — gömülü mozaik gösteriliyor</div>
              )}
            </div>
          )
        ) : (
          /* 2B: harita alani degerli, lejand tek satir; ayrintisi title'da. */
          <div
            // Uydu listesinin (sol 196 px) ustune binmesin: sigmazsa alt satira sarar.
            className="ozet-gizle absolute right-2 bottom-2 max-w-[calc(100%-212px)] text-3xs text-ops-faint bg-ops-sunken/85 px-1.5 py-[2px] pointer-events-none leading-[13px]"
            title={
              'Eşdikdörtgen izdüşüm · sürükle: kaydır · tekerlek: yakınlaş · çift tık: sıfırla · uyduya tıkla: seç · ' +
              'kesikli daire: istasyon görüş konisi · terminatör ve atmosfer efekti eklenmedi · ' +
              'GÜNCEL temadaki bulutlar VIIRS ölçümünün kendisidir, eklenmiş katman değil'
            }
          >
            <span className="text-ops-nominal">●</span> {GROUND_STATION.name} · kesikli daire görüş konisi ≥{GROUND_STATION.min_elevation_deg}° ·{' '}
            {THEME_2D_LABEL[earthTheme]} · sürükle / tekerlek / çift tık
          </div>
        )}
      </div>
    </section>
  );
}
