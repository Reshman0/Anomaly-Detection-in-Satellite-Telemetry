/**
 * Uydu durum bilgisi: nadir acisi, gorev omru, yer izi uzerindeki bolgeler ve
 * kalici hafiza hata sayaci.
 *
 * INFO panelinin (bkz. `components/InfoPanel.tsx`) veri kaynagi. Ekran zaten
 * dolu oldugu icin bu bilgiler ayri bir panel yerine acilir pencerede toplandi.
 */
import { GROUND_STATION, TLE_NAME, elevationAt, subPointAt } from './orbit';
import { WGS84_A_KM } from './earth';

/* ------------------------------------------------------------------ */
/* Nadir acisi                                                         */
/* ------------------------------------------------------------------ */

/**
 * Uydunun yer istasyonuna bakarken nadir yonunden (tam asagi) sapma acisi.
 *
 *   sin(nadir) = R / (R + h) * cos(yukselti)
 *
 * Yer istasyonu ufkun altindayken tanimsizdir, `null` doner. Goruntuleme
 * uydusunda bu aci kameranin ne kadar egik baktigini soyler: 0 derece tam
 * altina, buyuk degerler yana bakmak demektir.
 */
export function nadirFromElevation(altKm: number, elevationDeg: number): number {
  const oran = (WGS84_A_KM / (WGS84_A_KM + altKm)) * Math.cos((elevationDeg * Math.PI) / 180);
  return (Math.asin(Math.max(-1, Math.min(1, oran))) * 180) / Math.PI;
}

export function nadirAngleDeg(unixMs: number): number | null {
  const sp = subPointAt(unixMs);
  if (!sp) return null;
  const elev = elevationAt(unixMs);
  if (elev < GROUND_STATION.min_elevation_deg) return null;
  return nadirFromElevation(sp.altKm, elev);
}

/* ------------------------------------------------------------------ */
/* Gorev omru                                                          */
/* ------------------------------------------------------------------ */

/**
 * IMECE 15 Nisan 2023'te firlatildi (SpaceX Transporter-7). Tasarim omru
 * 5 yildir; burada gosterilen "kalan omur" o tasarim degerine gore hesaplanir,
 * uydunun gercek saglik durumunu temsil etmez.
 */
export const LAUNCH_MS = Date.parse('2023-04-15T06:47:00Z');
export const DESIGN_LIFE_YEARS = 5;

export interface MissionLife {
  gecenGun: number;
  toplamGun: number;
  kalanGun: number;
  yuzde: number;
}

export function missionLife(nowMs: number): MissionLife {
  const gun = 86400_000;
  const toplamGun = Math.round(DESIGN_LIFE_YEARS * 365.25);
  const gecenGun = Math.max(0, Math.floor((nowMs - LAUNCH_MS) / gun));
  const kalanGun = Math.max(0, toplamGun - gecenGun);
  return { gecenGun, toplamGun, kalanGun, yuzde: Math.min(100, (gecenGun / toplamGun) * 100) };
}

/* ------------------------------------------------------------------ */
/* Yer izi uzerindeki bolgeler                                         */
/* ------------------------------------------------------------------ */

interface Yer {
  ad: string;
  lat: number;
  lon: number;
}

/**
 * Yer izini adlandirmak icin kaba bir referans noktasi tablosu. Amac harita
 * dogrulugu degil, operatorun "su an nerenin ustunden geciyor" sorusuna okunur
 * bir cevap verebilmek. En yakin nokta ESIK_KM'den uzaksa bolge "acik deniz"
 * sayilir, boylece okyanus ortasinda sehir adi yazilmaz.
 */
const ESIK_KM = 1400;

const YERLER: Yer[] = [
  { ad: 'Türkiye', lat: 39.0, lon: 35.0 },
  { ad: 'Karadeniz', lat: 43.5, lon: 34.0 },
  { ad: 'Akdeniz', lat: 34.5, lon: 18.0 },
  { ad: 'Ege', lat: 38.5, lon: 25.0 },
  { ad: 'Kafkasya', lat: 42.0, lon: 44.0 },
  { ad: 'İran', lat: 32.0, lon: 53.0 },
  { ad: 'Arap Yarımadası', lat: 23.0, lon: 45.0 },
  { ad: 'Mısır', lat: 26.0, lon: 30.0 },
  { ad: 'Kuzey Afrika', lat: 28.0, lon: 10.0 },
  { ad: 'Sahra', lat: 21.0, lon: 2.0 },
  { ad: 'Batı Afrika', lat: 10.0, lon: -5.0 },
  { ad: 'Orta Afrika', lat: 2.0, lon: 20.0 },
  { ad: 'Doğu Afrika', lat: 2.0, lon: 38.0 },
  { ad: 'Güney Afrika', lat: -28.0, lon: 25.0 },
  { ad: 'Balkanlar', lat: 43.0, lon: 21.0 },
  { ad: 'Orta Avrupa', lat: 50.0, lon: 15.0 },
  { ad: 'İskandinavya', lat: 62.0, lon: 16.0 },
  { ad: 'Batı Avrupa', lat: 47.0, lon: 2.0 },
  { ad: 'İber Yarımadası', lat: 40.0, lon: -4.0 },
  { ad: 'Britanya', lat: 54.0, lon: -2.0 },
  { ad: 'Batı Rusya', lat: 56.0, lon: 40.0 },
  { ad: 'Sibirya', lat: 62.0, lon: 90.0 },
  { ad: 'Orta Asya', lat: 45.0, lon: 65.0 },
  { ad: 'Hindistan', lat: 22.0, lon: 79.0 },
  { ad: 'Çin', lat: 35.0, lon: 105.0 },
  { ad: 'Moğolistan', lat: 46.0, lon: 104.0 },
  { ad: 'Güneydoğu Asya', lat: 12.0, lon: 103.0 },
  { ad: 'Japonya', lat: 36.0, lon: 138.0 },
  { ad: 'Endonezya', lat: -2.0, lon: 118.0 },
  { ad: 'Avustralya', lat: -25.0, lon: 134.0 },
  { ad: 'Yeni Zelanda', lat: -41.0, lon: 173.0 },
  { ad: 'Alaska', lat: 64.0, lon: -152.0 },
  { ad: 'Kanada', lat: 56.0, lon: -106.0 },
  { ad: 'ABD', lat: 39.0, lon: -98.0 },
  { ad: 'Meksika', lat: 23.0, lon: -102.0 },
  { ad: 'Karayipler', lat: 18.0, lon: -75.0 },
  { ad: 'Brezilya', lat: -10.0, lon: -53.0 },
  { ad: 'And Dağları', lat: -20.0, lon: -68.0 },
  { ad: 'Arjantin', lat: -36.0, lon: -64.0 },
  { ad: 'Grönland', lat: 72.0, lon: -40.0 },
  { ad: 'Kuzey Atlantik', lat: 45.0, lon: -35.0 },
  { ad: 'Güney Atlantik', lat: -25.0, lon: -20.0 },
  { ad: 'Hint Okyanusu', lat: -20.0, lon: 75.0 },
  { ad: 'Kuzey Pasifik', lat: 30.0, lon: -160.0 },
  { ad: 'Güney Pasifik', lat: -30.0, lon: -130.0 },
  { ad: 'Batı Pasifik', lat: 10.0, lon: 155.0 },
];

/** Iki jeodezik nokta arasi buyuk daire mesafesi (km). */
function mesafeKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * WGS84_A_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bir alt noktanin ustunden gectigi bolge adi. */
export function regionAt(latDeg: number, lonDeg: number): string {
  let enIyi = '';
  let enKisa = Infinity;
  for (const y of YERLER) {
    const d = mesafeKm(latDeg, lonDeg, y.lat, y.lon);
    if (d < enKisa) {
      enKisa = d;
      enIyi = y.ad;
    }
  }
  return enKisa <= ESIK_KM ? enIyi : 'açık deniz';
}

export interface RegionPass {
  ad: string;
  girisMs: number;
  cikisMs: number;
}

/**
 * Verilen zaman araliginda yer izinin gectigi bolgeleri sirayla dondurur.
 * Ardisik ayni bolgeler tek kayitta birlestirilir.
 */
export function regionTimeline(baslangicMs: number, spanS: number, stepS = 60): RegionPass[] {
  const out: RegionPass[] = [];
  // groundTrack merkez etrafinda +-span tarar; burada ileriye dogru duz bir
  // aralik gerektigi ve atlanan noktalar zaman eslemesini kaydiracagi icin
  // ornekleme dogrudan yapilir.
  for (let dt = 0; dt <= spanS; dt += stepS) {
    const tMs = baslangicMs + dt * 1000;
    const nokta = subPointAt(tMs);
    if (!nokta) continue;
    const ad = regionAt(nokta.latDeg, nokta.lonDeg);
    const son = out[out.length - 1];
    if (son && son.ad === ad) {
      son.cikisMs = tMs;
    } else {
      out.push({ ad, girisMs: tMs, cikisMs: tMs });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Kalici hafiza hata sayaci (EDAC)                                    */
/* ------------------------------------------------------------------ */

/**
 * Kalici hafizada duzeltilen tek bit hatalari.
 *
 * Uzayda yuksek enerjili parcaciklar hafiza hucrelerini rastgele cevirir
 * (SEU). Hata duzeltme donanimi bunlarin buyuk kismini kendiliginden duzeltir;
 * operatorun ilgilendigi sey sayinin normalin uzerine cikmasidir, cunku bu
 * hafizanin yorulmaya basladigina isaret eder.
 *
 * Deger gorev saatinden TOHUMLU uretilir: ayni saatte ayni sayi cikar, demo
 * her acilista baska bir rakam gostermez.
 */
export interface MemoryHealth {
  son24Saat: number;
  gunlukOrtalama: number;
  duzeltilemeyen: number;
  esikAsildi: boolean;
  oneri: string | null;
}

const EDAC_ESIK = 100;

export function memoryHealth(missionT: number): MemoryHealth {
  // Gorev saatinin gunu tohum olur: sayac gun icinde sabit kalir.
  const gun = Math.floor(missionT / 86400);
  let h = (gun * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  const son24Saat = 104 + (h % 47); // 104..150
  const gunlukOrtalama = 38;
  return {
    son24Saat,
    gunlukOrtalama,
    duzeltilemeyen: 0,
    esikAsildi: son24Saat > EDAC_ESIK,
    oneri:
      son24Saat > EDAC_ESIK
        ? 'Kalıcı hafızayı yeniden başlatın. Düzeltilen hata sayısı günlük ortalamanın ' +
          (son24Saat / gunlukOrtalama).toFixed(1) +
          ' katına çıktı.'
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Kunye                                                               */
/* ------------------------------------------------------------------ */

export const SATELLITE_NAME = TLE_NAME;
