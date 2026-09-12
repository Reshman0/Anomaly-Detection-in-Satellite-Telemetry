import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import land from '../data/land_110m.json';
import borders from '../data/borders_110m.json';
import turkiye from '../data/turkiye_110m.json';
import countries from '../data/countries_110m.json';
import bmngUrl from '../assets/earth/bmng_2048.jpg';
import { useConsole, type EarthTheme } from '../store';
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
const FIT_RADIUS = { LEO: 1.22, ALL: GEO_DISPLAY_R };

/**
 * Enlem/boylam -> kure koordinati. three.js sag el sistemidir ve kamera
 * disaridan bakar; dogunun ekranda SAGDA gorunmesi icin dogu boylami -Z'ye
 * duser (z = -cos(lat)·sin(lon)). +Z alinirsa kure ayna goruntusu olur.
 */
function toVec(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(r);
}

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

/**
 * Dunya dokusunu tarayicida uretir — hazir bir goruntu dosyasi yuklenmez,
 * dolayisiyla calisma zamaninda ag istegi olmaz (yonerge §1).
 *
 * Kitalar dolu sekiller olarak cizilir; tel kafes anahat operatorun ulke
 * secmesini zorlastiriyordu. Turkiye ayrica vurgulanir.
 *
 * Eslesme `toVec` ile tutarli olacak sekilde turetilmistir. SphereGeometry
 * UV'si phi = 180° + lon verir; px = (lon + 180) / 360 — standart
 * esdikdortgen (equirectangular) duzen, -180 solda.
 */
const TEX_W = 4096;
const TEX_H = 2048;

const TEX_COLORS = {
  ocean: '#08203A',
  land: '#17385A',
  coast: '#8FB3D6',
  border: '#2F5A84',
  trFill: '#2E5E8C',
  trStroke: '#e6f4fd',
};

function lonToPx(lon: number): number {
  return ((lon + 180) / 360) * TEX_W;
}

function latToPx(lat: number): number {
  return ((90 - lat) / 180) * TEX_H;
}

/** Bir halkayi cizer; boylam sarmasinda kopan parcalar ayri yol olarak gecilir. */
function tracePolyline(g: CanvasRenderingContext2D, flat: number[], close: boolean): void {
  let started = false;
  let prevX = 0;
  g.beginPath();
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = lonToPx(flat[i]);
    const y = latToPx(flat[i + 1]);
    if (started && Math.abs(x - prevX) > TEX_W / 2) {
      // antimeridyeni gecti: dokunun uzerinde yatay leke birakmamak icin yolu kes
      if (close) g.closePath();
      g.moveTo(x, y);
    } else if (!started) {
      g.moveTo(x, y);
    } else {
      g.lineTo(x, y);
    }
    started = true;
    prevX = x;
  }
  if (close) g.closePath();
}

interface CountryRec {
  n: string;
  a3: string;
  c: [number, number];
  s: number;
  rings: number[][];
}

/** Siyasi harita paleti — komsu ulkeler ayrissin diye 8 pastel ton, indeksle. */
const POLITICAL_FILLS = ['#e9d6a8', '#cfe1b9', '#f1c9b4', '#c9dbe9', '#e4cbe3', '#d8e6c3', '#f0d9c0', '#cddfe0'];

/** Fiziki tema: NASA Blue Marble Next Generation (Aralik 2004, topografya + batimetri), kamu mali. */
const bmngImage = new Image();
let bmngReady = false;
const bmngWaiters: (() => void)[] = [];
bmngImage.onload = () => {
  bmngReady = true;
  bmngWaiters.splice(0).forEach((f) => f());
};
bmngImage.src = bmngUrl; // derlemede base64 olarak gomulur; ag istegi yok

function onBmng(cb: () => void): void {
  if (bmngReady) cb();
  else bmngWaiters.push(cb);
}

function newCanvas(): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { cv, g };
}

function toTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Turkiye dolgusu + anahati; her temada ustte durur. */
function drawTurkiyeOverlay(g: CanvasRenderingContext2D, fill: string | null, stroke: string, width: number): void {
  const trRings = (turkiye as { rings: number[][] }).rings;
  if (fill) {
    g.fillStyle = fill;
    for (const ring of trRings) {
      tracePolyline(g, ring, true);
      g.fill();
    }
  }
  g.strokeStyle = stroke;
  g.lineWidth = width;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }
}

/** Siyasi harita: ulke dolgulari, sinirlar, Turkce ulke adlari. */
function buildPoliticalTexture(): THREE.CanvasTexture {
  const { cv, g } = newCanvas();
  g.fillStyle = '#b9d3e6';
  g.fillRect(0, 0, TEX_W, TEX_H);

  const list = (countries as unknown as { countries: CountryRec[] }).countries;
  list.forEach((c, i) => {
    g.fillStyle = c.a3 === 'TUR' ? '#f0b83a' : POLITICAL_FILLS[i % POLITICAL_FILLS.length];
    for (const ring of c.rings) {
      tracePolyline(g, ring, true);
      g.fill();
    }
  });
  g.strokeStyle = '#5b6b78';
  g.lineWidth = 2;
  for (const c of list) {
    for (const ring of c.rings) {
      tracePolyline(g, ring, true);
      g.stroke();
    }
  }
  drawTurkiyeOverlay(g, null, '#2a3540', 5);

  // Ulke adlari: buyuklukle olcekli, kucuk ulkeler atlanir (okunmaz).
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const c of list) {
    if (c.s < 5) continue;
    const size = c.s > 30 ? 46 : c.s > 15 ? 34 : c.s > 8 ? 26 : 20;
    g.font = (c.a3 === 'TUR' ? '700 ' : '600 ') + size + 'px "Segoe UI", Arial, sans-serif';
    const x = lonToPx(c.c[0]);
    const y = latToPx(c.c[1]);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.strokeText(c.n, x, y);
    g.fillStyle = c.a3 === 'TUR' ? '#1a2430' : '#2c3a47';
    g.fillText(c.n, x, y);
  }
  return toTexture(cv);
}

/** Fiziki: Blue Marble goruntusu + ince sinirlar + Turkiye anahati. */
function buildPhysicalTexture(): THREE.CanvasTexture {
  const { cv, g } = newCanvas();
  g.drawImage(bmngImage, 0, 0, TEX_W, TEX_H);
  const borderLines = (borders as { lines: number[][] }).lines;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  for (const line of borderLines) {
    tracePolyline(g, line, false);
    g.stroke();
  }
  drawTurkiyeOverlay(g, 'rgba(240,184,58,0.18)', '#ffe08a', 5);
  return toTexture(cv);
}

function buildEarthTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d')!;

  g.fillStyle = TEX_COLORS.ocean;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const landRings = (land as { rings: number[][] }).rings;
  const trRings = (turkiye as { rings: number[][] }).rings;
  const borderLines = (borders as { lines: number[][] }).lines;

  // 1) kara dolgusu
  g.fillStyle = TEX_COLORS.land;
  for (const ring of landRings) {
    tracePolyline(g, ring, true);
    g.fill();
  }

  // 2) Turkiye dolgusu — kara renginden belirgin sekilde ayrilir
  g.fillStyle = TEX_COLORS.trFill;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.fill();
  }

  // 3) ulke kara sinirlari (sonuk)
  g.strokeStyle = TEX_COLORS.border;
  g.lineWidth = 2.5;
  for (const line of borderLines) {
    tracePolyline(g, line, false);
    g.stroke();
  }

  // 4) kiyi cizgisi (parlak)
  g.strokeStyle = TEX_COLORS.coast;
  g.lineWidth = 3;
  for (const ring of landRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }

  // 5) Turkiye anahati — ekrandaki en parlak yer cizgisi
  g.strokeStyle = TEX_COLORS.trStroke;
  g.lineWidth = 5;
  for (const ring of trRings) {
    tracePolyline(g, ring, true);
    g.stroke();
  }

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
  ops: { rim: 0x255081, graticule: 0x17385a, graticuleOpacity: 0.5, label: true, belt: 0x1b3f63 },
  political: { rim: 0x7f95a6, graticule: 0x5b6b78, graticuleOpacity: 0.28, label: false, belt: 0x3a4d5a },
  physical: { rim: 0x4d6f86, graticule: 0xdde8f0, graticuleOpacity: 0.22, label: true, belt: 0x3a4d5a },
};

export const THEME_LABELS: Record<EarthTheme, string> = { ops: 'OPS', political: 'SİYASİ', physical: 'FİZİKİ' };

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
  const setEarthTheme = useConsole((s) => s.setEarthTheme);
  const visibleCount = useRef<HTMLSpanElement>(null);
  const applyTheme = useRef<((t: EarthTheme) => void) | null>(null);

  // Kamerayi yeniden cerceveleyecek callback; efekt icinde doldurulur.
  const refit = useRef<(() => void) | null>(null);

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
    const earthMat = new THREE.MeshBasicMaterial({ map: buildEarthTexture() });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat));
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
        let tex = textures.get(t);
        if (!tex) {
          tex = t === 'political' ? buildPoliticalTexture() : buildPhysicalTexture();
          textures.set(t, tex);
        }
        earthMat.map = tex;
        earthMat.needsUpdate = true;
        // Tema degisimi rAF beklemesin: sekme arka plandayken bile bir kare cizilsin.
        renderer.render(scene, camera);
      };
      if (t === 'physical') onBmng(swap);
      else swap();
    };

    // Yer istasyonu
    const gsPos = toVec(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, 1.004);
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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.35;
    controls.maxDistance = 40;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;

    // Kullanici kamerayi elle oynatana kadar sahne panele sigacak sekilde cerceveler.
    let userMoved = false;
    controls.addEventListener('start', () => {
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
      const utcMs = state.sim.clock.utcMs();
      const selected = state.selectedNorad;

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
        const surface = toVec(sp.latDeg, sp.lonDeg, 1.006);
        const orbitPos = toVec(sp.latDeg, sp.lonDeg, displayRadius(sp.altKm));
        m.body.position.copy(orbitPos);
        m.drop.position.copy(surface);
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

        // Takip: kamera uydunun uzerinde, ayni uzaklikta durur; dunya altinda doner.
        if (state.followSat) {
          const dist = camera.position.length();
          const target = orbitPos.clone().normalize().multiplyScalar(dist);
          camera.position.lerp(target, 0.12);
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
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      refit.current = null;
      applyTheme.current = null;
      el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    applyTheme.current?.(earthTheme);
  }, [earthTheme]);

  // Gorunum onayari degistiginde kamerayi yeniden cerceveler.
  useEffect(() => {
    refit.current?.();
  }, [fitNonce, globeView]);

  return (
    <section className="panel flex flex-col flex-1 min-h-[200px]">
      <div className="panel-title flex items-center justify-between">
        <span>Dünya · SGP4 · Türkiye uydu kataloğu</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {SATELLITES.length} uydu · istasyondan görünen{' '}
          <span ref={visibleCount} className="text-ops-nominal">
            0
          </span>
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        {/* Canvas listenin sagindan baslar: kure bindirmenin altinda kalmasin. */}
        <div ref={host} className="absolute inset-y-0 right-0 left-[196px]" />

        <SatelliteList />

        <div className="absolute right-2 top-2 flex gap-[3px]">
          {(['LEO', 'ALL'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setGlobeView(v)}
              title={v === 'LEO' ? 'Alçak yörüngeye yakınlaş' : 'GEO kuşağı dahil tüm filoyu sığdır'}
              className={
                'num text-2xs px-[6px] py-[2px] border transition-colors ' +
                (globeView === v
                  ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10'
                  : 'border-ops-line2 text-ops-dim bg-ops-sunken/80 hover:text-ops-text')
              }
            >
              {v === 'LEO' ? 'LEO' : 'TÜMÜ'}
            </button>
          ))}
          <button
            onClick={() => setFollow(!followSat)}
            title="Kamera seçili uyduyu takip eder; dünya altında döner (F)"
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
        <div className="absolute right-2 top-[26px] flex gap-[3px]">
          {(['ops', 'political', 'physical'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setEarthTheme(t)}
              title={
                t === 'ops'
                  ? 'Operasyon konsolu zemini'
                  : t === 'political'
                    ? 'Siyasi harita: ülke dolguları ve adları (Natural Earth)'
                    : 'Fiziki: NASA Blue Marble, topografya + batimetri'
              }
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
        </div>

        {/* Okuma satiri kurenin basladigi yerden (liste 196 px) baslar: onceden
            left-2 idi ve uydu listesinin alt kartinin ustune biniyordu. Aciklama
            kutusu da sag alttan sag uste, gorunum dugmelerinin altina alindi;
            ikisi alt kenarda yan yana sigmiyordu. */}
        <div
          ref={readout}
          className="absolute left-[204px] bottom-2 max-w-[calc(100%-212px)] truncate num text-3xs text-ops-dim bg-ops-sunken/85 px-1.5 py-1 pointer-events-none"
        />
        <div className="absolute right-2 top-[52px] max-w-[calc(100%-212px)] text-3xs text-ops-faint bg-ops-sunken/85 px-1.5 py-1 pointer-events-none leading-relaxed text-right">
          <div>
            <span className="text-ops-nominal">●</span> {GROUND_STATION.name} · görüş konisi ≥
            {GROUND_STATION.min_elevation_deg}°
          </div>
          <div>ince yeşil çizgiler: istasyondan görünen uydulara görüş vektörü</div>
          <div>irtifa görsel olarak sıkıştırılmıştır · okunan km değerleri gerçek</div>
          <div>katalog durumsal farkındalık içindir · telemetri akışı AZS-DEMO görevine aittir</div>
          {earthTheme === 'physical' && <div>zemin: NASA Blue Marble NG, Aralık 2004 · kamu malı</div>}
          {earthTheme === 'political' && <div>zemin: Natural Earth 110m · Türkçe adlar NAME_TR</div>}
        </div>
      </div>
    </section>
  );
}
