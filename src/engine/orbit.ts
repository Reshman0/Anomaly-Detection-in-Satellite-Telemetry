import * as satellite from 'satellite.js';
import tleRaw from '../data/tle.txt?raw';
import { MIB } from './mib';

/**
 * SGP4 yorunge yayilimi (satellite.js). TLE dosyaya gomuludur; agdan cekilmez.
 * GEO uydusunda AOS/LOS gecisi olmayacagi icin LEO bir uydunun kamuya acik,
 * son yayinlanmis TLE'si kullanilir (yonerge §7).
 */

const lines = tleRaw
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

export const TLE_NAME = lines[0];
export const TLE_LINE1 = lines[1];
export const TLE_LINE2 = lines[2];

const satrec = satellite.twoline2satrec(TLE_LINE1, TLE_LINE2);

/** TLE epogu (yil + gunun kesri alanlarindan). */
export const TLE_EPOCH_MS = (() => {
  const yy = Number(TLE_LINE1.slice(18, 20));
  const doy = Number(TLE_LINE1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
})();

/** NORAD katalog numarasi. */
export const NORAD_ID = TLE_LINE1.slice(2, 7).trim();

/** TLE ortalama hareketinden yorunge periyodu (saniye). */
export const ORBIT_PERIOD_S = 86400 / Number(TLE_LINE2.slice(52, 63));

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

export function subPointAt(unixMs: number): SubPoint | null {
  const d = new Date(unixMs);
  const pv = satellite.propagate(satrec, d);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const gmst = satellite.gstime(d);
  const gd = satellite.eciToGeodetic(pv.position, gmst);
  return {
    latDeg: satellite.degreesLat(gd.latitude),
    lonDeg: satellite.degreesLong(gd.longitude),
    altKm: gd.height,
  };
}

export function lookAnglesAt(unixMs: number): LookAngles | null {
  const d = new Date(unixMs);
  const pv = satellite.propagate(satrec, d);
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

export function elevationAt(unixMs: number): number {
  const la = lookAnglesAt(unixMs);
  return la ? la.elevationDeg : -90;
}

export function isVisible(unixMs: number): boolean {
  return elevationAt(unixMs) >= GS.min_elevation_deg;
}

/** Yorunge izi: merkez zamanin etrafinda +-spanS saniye. */
export function groundTrack(centerMs: number, spanS: number, stepS: number): SubPoint[] {
  const out: SubPoint[] = [];
  for (let t = -spanS; t <= spanS; t += stepS) {
    const p = subPointAt(centerMs + t * 1000);
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
 * Kaba tarama + ikili arama ile saniye altinda hassasiyet.
 */
export function nextPassEvent(nowMs: number, horizonS = 6 * 3600): PassEvent | null {
  const visibleNow = isVisible(nowMs);
  const target = visibleNow ? 'LOS' : 'AOS';
  const coarse = 15;
  let prevT = nowMs;
  let prevVis = visibleNow;

  for (let dt = coarse; dt <= horizonS; dt += coarse) {
    const t = nowMs + dt * 1000;
    const vis = isVisible(t);
    if (vis !== prevVis) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (isVisible(mid) === prevVis) lo = mid;
        else hi = mid;
      }
      return { kind: target, unixMs: hi, secondsAway: (hi - nowMs) / 1000 };
    }
    prevT = t;
    prevVis = vis;
  }
  return null;
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
