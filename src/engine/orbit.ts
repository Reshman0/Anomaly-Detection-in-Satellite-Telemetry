import * as satellite from 'satellite.js';
import tleRaw from '../data/tle.txt?raw';
import satMeta from '../data/satellites.json';
import { MIB } from './mib';

/**
 * SGP4 yorunge yayilimi (satellite.js). TLE'ler dosyaya gomuludur; agdan cekilmez.
 *
 * Katalog Turkiye'nin yorungedeki uydularini icerir: TURKSAT GEO haberlesme
 * filosu, yer gozlem uydulari, Plan-S Connecta IoT takimyildizi ve akademik
 * kucuk uydular.
 *
 * Firlatma yili, yorunge sinifi, periyot ve GEO istasyon tutumu gostergesi
 * TLE'den HESAPLANIR; satellites.json'da iddia edilmez (yonerge §0).
 */

export type OrbitClass = 'LEO' | 'MEO' | 'GEO';

export interface SatelliteRecord {
  norad: string;
  tleName: string;
  /** Turkce gosterim adi. */
  name: string;
  group: string;
  operator: string;
  mission: string;
  /** Uluslararasi tanimlayici, orn. "2023-054A". */
  intlDes: string;
  launchYear: number;
  /** TLE epogu (Unix ms). */
  epochMs: number;
  orbitClass: OrbitClass;
  /** Yorunge periyodu (dakika), ortalama hareketten. */
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  /**
   * GEO uydularinda istasyon tutumu gostergesi: egim ~0 ve ortalama hareket
   * bir yildiz gunune esitse uydu aktif olarak tutuluyor demektir. LEO'da
   * anlamsizdir, `null` doner.
   */
  stationKept: boolean | null;
  satrec: satellite.SatRec;
}

interface SatMetaEntry {
  norad: string;
  name: string;
  group: string;
  operator: string;
  mission: string;
}

export interface SatGroup {
  id: string;
  name: string;
  note: string;
  color: string;
}

export const SAT_GROUPS: SatGroup[] = satMeta.groups;

/** Bir yildiz gunundeki devir sayisi — GEO istasyon tutumu esigi icin. */
const SIDEREAL_REV_PER_DAY = 1.0027379;

function parseTle(raw: string): { name: string; l1: string; l2: string }[] {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  const out: { name: string; l1: string; l2: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1 && l2 && l1.startsWith('1 ') && l2.startsWith('2 ')) {
      out.push({ name: lines[i].trim(), l1, l2 });
      i += 3;
    } else {
      i += 1;
    }
  }
  return out;
}

/** TLE epok alani (yy + gunun kesri) -> Unix ms. */
function epochFromTle(l1: string): number {
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
}

/** Uluslararasi tanimlayici alani (l1 sutun 10-17) -> "2023-054A" ve firlatma yili. */
function intlDesFromTle(l1: string): { intlDes: string; launchYear: number } {
  const raw = l1.slice(9, 17).trim();
  const yy = Number(raw.slice(0, 2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return { intlDes: year + '-' + raw.slice(2), launchYear: year };
}

function classify(meanMotion: number): OrbitClass {
  if (meanMotion > 11) return 'LEO';
  if (meanMotion > 2) return 'MEO';
  return 'GEO';
}

const metaByNorad = new Map<string, SatMetaEntry>(
  (satMeta.satellites as SatMetaEntry[]).map((s) => [s.norad, s]),
);

export const SATELLITES: SatelliteRecord[] = parseTle(tleRaw).map(({ name, l1, l2 }) => {
  const norad = l1.slice(2, 7).trim();
  const meta = metaByNorad.get(norad);
  const meanMotion = Number(l2.slice(52, 63));
  const inclinationDeg = Number(l2.slice(8, 16));
  const eccentricity = Number('0.' + l2.slice(26, 33).trim());
  const orbitClass = classify(meanMotion);
  const { intlDes, launchYear } = intlDesFromTle(l1);
  return {
    norad,
    tleName: name,
    name: meta?.name ?? name,
    group: meta?.group ?? 'other',
    operator: meta?.operator ?? '—',
    mission: meta?.mission ?? '—',
    intlDes,
    launchYear,
    epochMs: epochFromTle(l1),
    orbitClass,
    periodMin: 1440 / meanMotion,
    inclinationDeg,
    eccentricity,
    stationKept:
      orbitClass === 'GEO'
        ? inclinationDeg < 0.5 && Math.abs(meanMotion - SIDEREAL_REV_PER_DAY) < 0.005
        : null,
    satrec: satellite.twoline2satrec(l1, l2),
  };
});

const byNorad = new Map(SATELLITES.map((s) => [s.norad, s]));

export function satByNorad(norad: string): SatelliteRecord {
  const s = byNorad.get(norad);
  if (!s) throw new Error('Katalogda olmayan uydu: ' + norad);
  return s;
}

export const DEFAULT_NORAD: string = byNorad.has(satMeta.default_norad)
  ? satMeta.default_norad
  : SATELLITES[0].norad;

/** Katalogdaki en yeni TLE epogu — ust seritte "son yayinlanmis TLE" yasi icin. */
export const CATALOG_EPOCH_MS = Math.max(...SATELLITES.map((s) => s.epochMs));

const GS = MIB.ground_station;
const observerGd = {
  longitude: satellite.degreesToRadians(GS.lon_deg),
  latitude: satellite.degreesToRadians(GS.lat_deg),
  height: GS.alt_km,
};

export interface SubPoint {
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

export interface LookAngles {
  azimuthDeg: number;
  elevationDeg: number;
  rangeKm: number;
}

export function subPointAt(sat: SatelliteRecord, unixMs: number): SubPoint | null {
  const d = new Date(unixMs);
  const pv = satellite.propagate(sat.satrec, d);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const gmst = satellite.gstime(d);
  const gd = satellite.eciToGeodetic(pv.position, gmst);
  return {
    latDeg: satellite.degreesLat(gd.latitude),
    lonDeg: satellite.degreesLong(gd.longitude),
    altKm: gd.height,
  };
}

export function lookAnglesAt(sat: SatelliteRecord, unixMs: number): LookAngles | null {
  const d = new Date(unixMs);
  const pv = satellite.propagate(sat.satrec, d);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const gmst = satellite.gstime(d);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const la = satellite.ecfToLookAngles(observerGd, ecf);
  return {
    azimuthDeg: (la.azimuth * 180) / Math.PI,
    elevationDeg: (la.elevation * 180) / Math.PI,
    rangeKm: la.rangeSat,
  };
}

/** Tek SGP4 yayilimiyla hem yer izdusumu hem bakis acilari — kure dongusu icin. */
export interface SatState {
  sub: SubPoint;
  look: LookAngles;
}

export function stateAt(sat: SatelliteRecord, unixMs: number): SatState | null {
  const d = new Date(unixMs);
  const pv = satellite.propagate(sat.satrec, d);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const gmst = satellite.gstime(d);
  const gd = satellite.eciToGeodetic(pv.position, gmst);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const la = satellite.ecfToLookAngles(observerGd, ecf);
  return {
    sub: {
      latDeg: satellite.degreesLat(gd.latitude),
      lonDeg: satellite.degreesLong(gd.longitude),
      altKm: gd.height,
    },
    look: {
      azimuthDeg: (la.azimuth * 180) / Math.PI,
      elevationDeg: (la.elevation * 180) / Math.PI,
      rangeKm: la.rangeSat,
    },
  };
}

/**
 * Menzil hizi (km/s): pozitif = uzaklasiyor. Bir saniye arayla iki menzil
 * farkindan; Doppler kaymasinin isaret ve buyuklugunu belirleyen niceliktir.
 */
export function rangeRateAt(sat: SatelliteRecord, unixMs: number): number | null {
  const a = lookAnglesAt(sat, unixMs);
  const b = lookAnglesAt(sat, unixMs + 1000);
  if (!a || !b) return null;
  return b.rangeKm - a.rangeKm;
}

export function elevationAt(sat: SatelliteRecord, unixMs: number): number {
  const la = lookAnglesAt(sat, unixMs);
  return la ? la.elevationDeg : -90;
}

export function isVisible(sat: SatelliteRecord, unixMs: number): boolean {
  return elevationAt(sat, unixMs) >= GS.min_elevation_deg;
}

/** Yorunge izi: merkez zamanin etrafinda +-spanS saniye. */
export function groundTrack(
  sat: SatelliteRecord,
  centerMs: number,
  spanS: number,
  stepS: number,
): SubPoint[] {
  const out: SubPoint[] = [];
  for (let t = -spanS; t <= spanS; t += stepS) {
    const p = subPointAt(sat, centerMs + t * 1000);
    if (p) out.push(p);
  }
  return out;
}

export interface PassEvent {
  kind: 'AOS' | 'LOS';
  unixMs: number;
  secondsAway: number;
}

/**
 * Su anki gorunurluk durumuna gore siradaki AOS ya da LOS anini bulur.
 * Kaba tarama + ikili arama. Ufuk icinde gecis yoksa `null` doner — istasyon
 * boylamindaki bir GEO uydusunda beklenen durum budur.
 */
export function nextPassEvent(
  sat: SatelliteRecord,
  nowMs: number,
  horizonS = 6 * 3600,
): PassEvent | null {
  const visibleNow = isVisible(sat, nowMs);
  const target = visibleNow ? 'LOS' : 'AOS';
  const coarse = 15;
  let prevT = nowMs;
  let prevVis = visibleNow;

  for (let dt = coarse; dt <= horizonS; dt += coarse) {
    const t = nowMs + dt * 1000;
    const vis = isVisible(sat, t);
    if (vis !== prevVis) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (isVisible(sat, mid) === prevVis) lo = mid;
        else hi = mid;
      }
      return { kind: target, unixMs: hi, secondsAway: (hi - nowMs) / 1000 };
    }
    prevT = t;
    prevVis = vis;
  }
  return null;
}

export interface Pass {
  sat: SatelliteRecord;
  aosMs: number;
  losMs: number;
  /** Tepe yukselti acisi ve zamani. */
  maxElDeg: number;
  maxElMs: number;
  aosAzDeg: number;
  losAzDeg: number;
  durationS: number;
}

/** AOS/LOS aninda ikili aramayla saniye alti hassasiyet. */
function refineCrossing(sat: SatelliteRecord, loMs: number, hiMs: number, loVisible: boolean): number {
  let lo = loMs;
  let hi = hiMs;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (isVisible(sat, mid) === loVisible) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Bir uydunun ufuk icindeki gecisleri. Kaba tarama (stepS) ile AOS/LOS
 * adaylarini bulur, ikili aramayla keskinlestirir, gecis icinde tepe
 * yukseltiyi orneklemeyle bulur. Su anda gorus icindeyse ilk gecis
 * `nowMs`'ten baslar.
 */
export function predictPasses(
  sat: SatelliteRecord,
  nowMs: number,
  horizonS: number,
  maxCount: number,
  stepS = 30,
): Pass[] {
  const out: Pass[] = [];
  let prevT = nowMs;
  let prevVis = isVisible(sat, nowMs);
  let aosMs: number | null = prevVis ? nowMs : null;

  for (let dt = stepS; dt <= horizonS && out.length < maxCount; dt += stepS) {
    const t = nowMs + dt * 1000;
    const vis = isVisible(sat, t);
    if (vis !== prevVis) {
      const crossing = refineCrossing(sat, prevT, t, prevVis);
      if (vis) {
        aosMs = crossing;
      } else if (aosMs !== null) {
        out.push(buildPass(sat, aosMs, crossing));
        aosMs = null;
      }
    }
    prevT = t;
    prevVis = vis;
  }
  return out;
}

function buildPass(sat: SatelliteRecord, aosMs: number, losMs: number): Pass {
  const durationS = (losMs - aosMs) / 1000;
  const samples = Math.max(8, Math.min(60, Math.round(durationS / 10)));
  let maxElDeg = -90;
  let maxElMs = aosMs;
  for (let i = 0; i <= samples; i++) {
    const t = aosMs + ((losMs - aosMs) * i) / samples;
    const el = elevationAt(sat, t);
    if (el > maxElDeg) {
      maxElDeg = el;
      maxElMs = t;
    }
  }
  const aosLook = lookAnglesAt(sat, aosMs + 500);
  const losLook = lookAnglesAt(sat, losMs - 500);
  return {
    sat,
    aosMs,
    losMs,
    maxElDeg,
    maxElMs,
    aosAzDeg: aosLook ? (aosLook.azimuthDeg + 360) % 360 : 0,
    losAzDeg: losLook ? (losLook.azimuthDeg + 360) % 360 : 0,
    durationS,
  };
}

/** Filo genelinde en yakin gecisler, AOS'a gore sirali. Yalnizca LEO uydular taranir. */
export function upcomingPasses(nowMs: number, horizonS: number, maxCount: number): Pass[] {
  const all: Pass[] = [];
  for (const sat of SATELLITES) {
    if (sat.orbitClass !== 'LEO') continue;
    all.push(...predictPasses(sat, nowMs, horizonS, 3));
  }
  all.sort((a, b) => a.aosMs - b.aosMs);
  return all.slice(0, maxCount);
}

export interface SkyPoint {
  azimuthDeg: number;
  elevationDeg: number;
  unixMs: number;
}

/** Bir gecis boyunca azimut/yukselti izi — kutupsal gokyuzu grafigi icin. */
export function skyTrack(sat: SatelliteRecord, aosMs: number, losMs: number, points = 48): SkyPoint[] {
  const out: SkyPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = aosMs + ((losMs - aosMs) * i) / points;
    const la = lookAnglesAt(sat, t);
    if (la) out.push({ azimuthDeg: (la.azimuthDeg + 360) % 360, elevationDeg: la.elevationDeg, unixMs: t });
  }
  return out;
}

/** Klasik Kepler elemanlari — dogrudan TLE'den, iddia degil okuma. */
export interface OrbitalElements {
  epochMs: number;
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevPerDay: number;
  periodMin: number;
  semiMajorAxisKm: number;
  perigeeKm: number;
  apogeeKm: number;
  bstar: number;
}

const MU_KM3_S2 = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;

export function elementsOf(sat: SatelliteRecord): OrbitalElements {
  const r = sat.satrec;
  const nRadPerMin = r.no; // satellite.js: rad/dk
  const nRadPerS = nRadPerMin / 60;
  const a = Math.cbrt(MU_KM3_S2 / (nRadPerS * nRadPerS));
  const toDeg = (x: number) => (x * 180) / Math.PI;
  return {
    epochMs: sat.epochMs,
    inclinationDeg: toDeg(r.inclo),
    raanDeg: toDeg(r.nodeo),
    eccentricity: r.ecco,
    argPerigeeDeg: toDeg(r.argpo),
    meanAnomalyDeg: toDeg(r.mo),
    meanMotionRevPerDay: (nRadPerMin * 1440) / (2 * Math.PI),
    periodMin: (2 * Math.PI) / nRadPerMin,
    semiMajorAxisKm: a,
    perigeeKm: a * (1 - r.ecco) - EARTH_RADIUS_KM,
    apogeeKm: a * (1 + r.ecco) - EARTH_RADIUS_KM,
    bstar: r.bstar,
  };
}

/** Yer istasyonunun min. yukselti acisina karsilik gelen gorus konisi yaricapi (derece). */
export function visibilityConeRadiusDeg(altKm: number): number {
  const Re = 6371;
  const eps = (GS.min_elevation_deg * Math.PI) / 180;
  const r = Re + altKm;
  const arg = Math.min(1, (Re / r) * Math.cos(eps));
  const lambda = Math.PI / 2 - eps - Math.asin(arg);
  return (lambda * 180) / Math.PI;
}

export const GROUND_STATION = GS;
