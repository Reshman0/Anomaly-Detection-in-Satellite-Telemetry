/**
 * WGS84 referans elipsoidi — konsolun kullandigi Dunya modeli.
 *
 * Yorunge yayilimi (satellite.js `eciToGeodetic` / `ecfToLookAngles`) WGS84
 * jeodezik enlem-boylam-yukseklik uretir. Kure kusursuz bir kure olarak
 * cizilir ve jeodezik enlem jeosentrik enlemmis gibi kullanilirsa ekranda
 * gosterilen nokta hesaplanan noktayla ayni yer olmaz; sapma orta enlemlerde
 * 0.1924 dereceye, yani yerde ~21 km'ye cikar. Bu dosya gosterim tarafini
 * yayilim tarafiyla ayni elipsoide oturtur.
 *
 * Kaynak: NIMA TR8350.2, WGS84 tanimlayici parametreler.
 */

/** Ekvator (buyuk) yaricapi, km. */
export const WGS84_A_KM = 6378.137;
/** Basiklik (flattening). */
export const WGS84_F = 1 / 298.257223563;
/** Kutup (kucuk) yaricapi, km — tureilmis: a(1 - f). */
export const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
/** Kutup / ekvator yaricap orani. Sahnedeki kure y ekseninde bununla ezilir. */
export const POLAR_RATIO = WGS84_B_KM / WGS84_A_KM;
/** Birinci eksantriklik karesi: f(2 - f). */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const D2R = Math.PI / 180;

/** Sahne birimi cinsinden konum. Kutup ekseni y'dir (three.js sahnesiyle ayni). */
export interface EcefUnit {
  x: number;
  y: number;
  z: number;
}

/**
 * WGS84 jeodezik (enlem, boylam, elipsoit uzeri yukseklik) -> ECEF.
 *
 * Birim: ekvator yaricapi = 1. Boylece yuzeydeki bir nokta ekvatorda 1,
 * kutupta POLAR_RATIO uzunlugunda olur.
 */
export function geodeticToEcefUnit(latDeg: number, lonDeg: number, hKm = 0): EcefUnit {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  // Birinci dikey egrilik yaricapi N(lat), a = 1 olcusunde.
  const n = 1 / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const h = hKm / WGS84_A_KM;
  return {
    x: (n + h) * cosLat * Math.cos(lon),
    y: (n * (1 - WGS84_E2) + h) * sinLat,
    z: (n + h) * cosLat * Math.sin(lon),
  };
}

/**
 * Bir merkez etrafinda, merkezi acisal yaricapi radiusDeg olan halkanin
 * enlem-boylam noktalari (yer istasyonu gorus konisinin yer izdusumu).
 * Buyuk daire uzerinde uretilir; halka kapalidir (ilk nokta sonda tekrarlanir).
 */
export function footprintRingLatLon(
  latDeg: number,
  lonDeg: number,
  radiusDeg: number,
  segments = 128,
): Array<{ latDeg: number; lonDeg: number }> {
  const lat0 = latDeg * D2R;
  const lon0 = lonDeg * D2R;
  const a = radiusDeg * D2R;
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const out: Array<{ latDeg: number; lonDeg: number }> = [];
  for (let i = 0; i <= segments; i++) {
    const brg = (i / segments) * Math.PI * 2;
    const lat = Math.asin(sinLat0 * cosA + cosLat0 * sinA * Math.cos(brg));
    const lon = lon0 + Math.atan2(Math.sin(brg) * sinA * cosLat0, cosA - sinLat0 * Math.sin(lat));
    out.push({ latDeg: lat / D2R, lonDeg: lon / D2R });
  }
  return out;
}
