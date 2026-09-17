import * as THREE from 'three';
import { fmtTrDate } from './gibs';

/**
 * Ankara yakin goruntusu — saf yardimcilar (DOM yok, store yok; testler
 * `environment: 'node'` altinda kosar).
 *
 * Kure tek bir dunya dokusu kullanir (2048x1024, ~20 km/piksel). Ankara
 * uzerinde 30 m'lik ayri bir parca (NASA HLS S30) kameranin yakinina gelince
 * belirir. Bunun icin kameranin yuzeye bugunkunden cok daha fazla
 * yaklasabilmesi gerekir; asagidaki kamera ayarlari BUGUNKU yakinlasma
 * siniri olan d = 1.35'in (2230 km) ustunde DAVRANISI DEGISTIRMEZ.
 *
 * Birim: kure yaricapi 1 = 6371 km; `d` kameranin Dunya merkezine uzakligi.
 */

export const EARTH_KM = 6371;
const D2R = Math.PI / 180;
/** Bir derece enlemin yerdeki uzunlugu (km). */
const KM_PER_DEG = (Math.PI * EARTH_KM) / 180;

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Gomulu goruntunun kapsadigi kutu (~61 x 55 km). Kahramankazan yer
 * istasyonunu ve Ankara kent merkezini icerir. scripts/fetch-ankara.mjs ile
 * AYNI olmali; bir test yan dosyayi bununla karsilastirir.
 */
export const ANKARA_BBOX: Bbox = { south: 39.7, west: 32.45, north: 40.25, east: 33.1 };
export const ANKARA_CENTER = {
  lat: (ANKARA_BBOX.south + ANKARA_BBOX.north) / 2,
  lon: (ANKARA_BBOX.west + ANKARA_BBOX.east) / 2,
};

/** Kameranin yuzeye en fazla yaklasabilecegi irtifa. */
export const MIN_ALT_KM = 40;
export const MIN_DISTANCE = 1 + MIN_ALT_KM / EARTH_KM;
/** Bugunku `controls.minDistance`. Bunun ustunde kamera davranisi aynen korunur. */
export const LEGACY_MIN_DISTANCE = 1.35;
/** Alcakta takip acilirsa kamera bu mesafeye yumusakca cikar. */
export const FOLLOW_MIN_DISTANCE = LEGACY_MIN_DISTANCE;
/** Parca kenarlarinda saydamliga yumusak gecis payi (her kenar icin). */
export const FEATHER = 0.1;

const BASE_NEAR = 0.05;
const BASE_ZOOM_SPEED = 0.7;
const BASE_ROTATE_SPEED = 0.5;

/** Bu irtifanin altinda parca tam gorunur, ustunde kararak kaybolur. */
export const PATCH_FULL_KM = 600;
export const PATCH_HIDDEN_KM = 1500;

/**
 * Enlem/boylam -> kure koordinati. three.js sag el sistemidir ve kamera
 * disaridan bakar; dogunun ekranda SAGDA gorunmesi icin dogu boylami -Z'ye
 * duser (z = -cos(lat)·sin(lon)). +Z alinirsa kure ayna goruntusu olur.
 */
export function toVec(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(r);
}

export function altitudeKm(d: number): number {
  return (d - 1) * EARTH_KM;
}

/**
 * Kutuyu kaplayan kismi `SphereGeometry` parametreleri. three.js r169'da
 * kure koseleri `toVec` ile birebir ayni olur: phi = boylam + 180°,
 * theta = 90° - enlem. UV kismi parca boyunca 0..1 kosar ve kuzey kenarda
 * uv.y = 1'dir — kuzey-yukari bir tuval `flipY` ile dogrudan oturur.
 */
export function sphereParams(b: Bbox = ANKARA_BBOX) {
  return {
    phiStart: (b.west + 180) * D2R,
    phiLength: (b.east - b.west) * D2R,
    thetaStart: (90 - b.north) * D2R,
    thetaLength: (b.north - b.south) * D2R,
  };
}

/** Bir noktanin parca uzerindeki UV'si (u doguya, v kuzeye artar). */
export function patchUv(lat: number, lon: number, b: Bbox = ANKARA_BBOX): { u: number; v: number } {
  return { u: (lon - b.west) / (b.east - b.west), v: (lat - b.south) / (b.north - b.south) };
}

/**
 * Yakin kirpma duzlemi. Sabit 0.05 (319 km) kameranin ~320 km altina
 * inmesini engelliyordu: yer kirpiliyordu. d >= 1.1'de (637 km) bugunku
 * degerdir; altinda irtifanin yarisini asmaz. Degerler 2^(k/4) basamaklarina
 * yuvarlanir ki projeksiyon matrisi her karede degil, yalnizca basamak
 * degisince yeniden kurulsun.
 */
export function nearPlaneFor(d: number): number {
  const want = 0.5 * (d - 1);
  if (want >= BASE_NEAR) return BASE_NEAR;
  return 2 ** (Math.floor(Math.log2(Math.max(want, 1e-9)) * 4) / 4);
}

/**
 * OrbitControls tekerlek hizi. OrbitControls MERKEZE olan mesafeyi olcekler;
 * yuzeye yakinken bu kaba kalir (bir centik ~225 km). Bu formulle her centik
 * IRTIFAYI ~×0.777 yapar. d ~1.19'un ustunde bugunku 0.7'dir.
 */
const ZOOM_K = Math.log(0.8) / Math.log(0.95);
export function zoomSpeedFor(d: number): number {
  return Math.min(BASE_ZOOM_SPEED, (ZOOM_K * (d - 1)) / d);
}

/**
 * Surukleme hizi. OrbitControls pikseli irtifadan bagimsiz bir aciya cevirir
 * (bugun 26 km zemin/piksel); 50 km'de bir piksel gorusun %76'sini kaydirir.
 * Bu formulle surukleme, gorusun sabit bir oranini kaydirir. LEO ve TUMU on
 * ayarlarinda (d > 3.5) bugunku 0.5'tir.
 */
export function rotateSpeedFor(d: number): number {
  return Math.min(BASE_ROTATE_SPEED, 0.2 * (d - 1));
}

/**
 * Isaretci olcegi (istasyon topu, uydu govdeleri, yer noktalari). d >= 1.35'te
 * 1 — bugunku boyutlar. Altinda kuculur; yoksa 70 km yaricapli istasyon topu
 * Ankara parcasinin tamamini orterdi.
 */
export function markerScale(d: number): number {
  const a = d - 1;
  return Math.min(1, Math.max((a / 0.35) ** 2, 0.4 * a));
}

/** Parca opakligi: PATCH_FULL_KM altinda 1, PATCH_HIDDEN_KM ustunde 0. */
export function patchOpacity(altKm: number): number {
  const t = Math.min(1, Math.max(0, (PATCH_HIDDEN_KM - altKm) / (PATCH_HIDDEN_KM - PATCH_FULL_KM)));
  return t * t * (3 - 2 * t);
}

/** Kutunun yerdeki boyutlari (km). */
export function bboxSizeKm(b: Bbox = ANKARA_BBOX): { widthKm: number; heightKm: number } {
  const midLat = (b.south + b.north) / 2;
  return {
    widthKm: (b.east - b.west) * KM_PER_DEG * Math.cos(midLat * D2R),
    heightKm: (b.north - b.south) * KM_PER_DEG,
  };
}

/** Kutuyu tamamen sigdiran irtifa (dik bakis, duz yuzey yaklasimi). */
export function fitAltitudeKm(aspect: number, vFovDeg: number, b: Bbox = ANKARA_BBOX, margin = 1.1): number {
  const tanV = Math.tan((vFovDeg / 2) * D2R);
  const tanH = tanV * aspect;
  const { widthKm, heightKm } = bboxSizeKm(b);
  return Math.max(heightKm / (2 * tanV), widthKm / (2 * tanH)) * margin;
}

/**
 * Parca su an ekranda mi (atif cipi icin). `tanDiag`, kameranin kosegen yari
 * aci tanjanti. Duz yuzey yaklasimi yuksekte gorulen alani az tahmin eder;
 * bu tutucu yondedir ve o irtifalarda parca zaten kararmistir.
 */
export function patchInView(camPos: THREE.Vector3, tanDiag: number, b: Bbox = ANKARA_BBOX): boolean {
  const d = camPos.length();
  if (d <= 1) return false;
  const c = toVec((b.south + b.north) / 2, (b.west + b.east) / 2, 1);
  const cosG = camPos.dot(c) / d;
  if (cosG <= 1 / d) return false; // ufkun arkasinda
  const groundKm = Math.acos(Math.min(1, cosG)) * EARTH_KM;
  const { widthKm, heightKm } = bboxSizeKm(b);
  return groundKm <= altitudeKm(d) * tanDiag + Math.hypot(widthKm, heightKm) / 2;
}

/**
 * Atif cipi. Ekrandaki goruntunun kaynagini soyler (yonerge §0): bu bir
 * Sentinel-2 (Copernicus) turevi NASA urunudur, Gokturk goruntusu DEGILDIR.
 */
export function chipLines(altKm: number, isoDate: string): [string, string, string] {
  return [
    'YAKIN GÖRÜNTÜ · Ankara · ' + fmtTrDate(isoDate),
    'NASA HLS · Sentinel-2 (Copernicus) · 30 m',
    'Göktürk görüntüsü değildir · kamera ' + Math.round(altKm) + ' km',
  ];
}
