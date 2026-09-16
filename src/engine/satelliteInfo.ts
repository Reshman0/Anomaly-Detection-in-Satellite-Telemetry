/**
 * Uydu durum bilgisi: nadir acisi, gorev omru, tur sayisi, aktarilan veri,
 * yer izi uzerindeki bolgeler ve oturumda kaydedilen anomali gecmisi.
 *
 * Ust seritteki "Bilgi" penceresinin (bkz. components/UyduBilgiPenceresi.tsx)
 * veri kaynagi. Tum fonksiyonlar secili uyduya gore calisir.
 */
import tleRaw from '../data/tle.txt?raw';
import { GROUND_STATION, elevationAt, subPointAt, type SatelliteRecord } from './orbit';
import type { Alarm } from './types';

/** WGS84 ekvator yaricapi (km). */
const WGS84_A_KM = 6378.137;

/* ------------------------------------------------------------------ */
/* Nadir acisi                                                         */
/* ------------------------------------------------------------------ */

/**
 * Uydunun yer istasyonuna bakarken nadir yonunden (tam asagi) sapma acisi.
 *
 *   sin(nadir) = R / (R + h) * cos(yukselti)
 */
export function nadirFromElevation(altKm: number, elevationDeg: number): number {
  const oran = (WGS84_A_KM / (WGS84_A_KM + altKm)) * Math.cos((elevationDeg * Math.PI) / 180);
  return (Math.asin(Math.max(-1, Math.min(1, oran))) * 180) / Math.PI;
}

/** Istasyon ufkun altindayken tanimsizdir, `null` doner. */
export function nadirAngleDeg(sat: SatelliteRecord, unixMs: number): number | null {
  const sp = subPointAt(sat, unixMs);
  if (!sp) return null;
  const elev = elevationAt(sat, unixMs);
  if (elev < GROUND_STATION.min_elevation_deg) return null;
  return nadirFromElevation(sp.altKm, elev);
}

/* ------------------------------------------------------------------ */
/* Gorev omru                                                          */
/* ------------------------------------------------------------------ */

/**
 * Kesin firlatma tarihi ve tasarim omru yalnizca dogrulanmis uydular icin
 * tutulur. Katalogdaki diger uydular icin firlatma yili TLE'nin uluslararasi
 * tanimlayicisindan gelir ve tasarim omru UYDURULMAZ.
 *
 * NORAD 56178 (ekranda GOKTURK-2B, katalogda IMECE): 15 Nisan 2023, SpaceX
 * Transporter-7; tasarim omru 5 yil. Kunye fiziksel uyduya aittir, ekran
 * adindan bagimsizdir.
 */
const GOREV_KUNYESI: Record<string, { firlatma: string; tasarimYil: number }> = {
  '56178': { firlatma: '2023-04-15T06:47:00Z', tasarimYil: 5 },
};

export interface MissionLife {
  firlatmaMs: number;
  /** Firlatma tarihi kesin mi, yoksa yalnizca yil mi biliniyor. */
  kesin: boolean;
  gecenGun: number;
  tasarimYil: number | null;
  kalanGun: number | null;
  yuzde: number | null;
}

export function missionLife(sat: SatelliteRecord, nowMs: number): MissionLife {
  const gun = 86400_000;
  const kunye = GOREV_KUNYESI[sat.norad];
  const firlatmaMs = kunye ? Date.parse(kunye.firlatma) : Date.UTC(sat.launchYear, 0, 1);
  const gecenGun = Math.max(0, Math.floor((nowMs - firlatmaMs) / gun));
  if (!kunye) {
    return { firlatmaMs, kesin: false, gecenGun, tasarimYil: null, kalanGun: null, yuzde: null };
  }
  const toplamGun = Math.round(kunye.tasarimYil * 365.25);
  return {
    firlatmaMs,
    kesin: true,
    gecenGun,
    tasarimYil: kunye.tasarimYil,
    kalanGun: Math.max(0, toplamGun - gecenGun),
    yuzde: Math.min(100, (gecenGun / toplamGun) * 100),
  };
}

/* ------------------------------------------------------------------ */
/* Tur sayisi                                                          */
/* ------------------------------------------------------------------ */

/**
 * TLE ikinci satirinin 64-68. sutunlari, uydunun epoch anindaki GERCEK tur
 * numarasini tasir. satellite.js bu alani saklamadigi icin gomulu TLE
 * dosyasindan NORAD numarasina gore okunur.
 */
const TUR_NO = new Map<string, number>();
for (const satir of tleRaw.split('\n')) {
  const s = satir.trim();
  if (!s.startsWith('2 ')) continue;
  const norad = s.slice(2, 7).trim();
  const no = Number(s.slice(63, 68).trim());
  if (norad && Number.isFinite(no)) TUR_NO.set(norad, no);
}

export function revAtEpoch(norad: string): number {
  return TUR_NO.get(norad) ?? 0;
}

export interface OrbitCount {
  toplam: number;
  gunluk: number;
  epochtanBeri: number;
}

export function orbitCount(sat: SatelliteRecord, nowMs: number): OrbitCount {
  const turMs = sat.periodMin * 60_000;
  const epochtanBeri = Math.max(0, Math.floor((nowMs - sat.epochMs) / turMs));
  return { toplam: revAtEpoch(sat.norad) + epochtanBeri, gunluk: 1440 / sat.periodMin, epochtanBeri };
}

/* ------------------------------------------------------------------ */
/* Aktarilan veri                                                      */
/* ------------------------------------------------------------------ */

export interface DataVolume {
  /** Bu oturumda gercekten alinan paketlerin toplam boyutu. */
  oturumBayt: number;
  /** Olculen akis hizi (bayt/saniye); oturum cok kisaysa null. */
  hizBps: number | null;
  /** Ayni akis hiziyla firlatmadan bu yana aktarilmis olacak hacim. */
  gorevBayt: number | null;
}

/**
 * Oturum hacmi olcumdur. Gorev boyu hacim bir TAHMINDIR: bu konsolun olctugu
 * telemetri akis hizinin firlatmadan bu yana surdugu varsayilir. Yalnizca durum
 * telemetrisini kapsar; gorev verisi (goruntu) dahil degildir.
 */
export function dataVolume(
  paketSayisi: number,
  ortalamaBayt: number,
  oturumS: number,
  firlatmadanBeriS: number,
): DataVolume {
  const oturumBayt = paketSayisi * ortalamaBayt;
  if (oturumS < 60 || paketSayisi === 0) return { oturumBayt, hizBps: null, gorevBayt: null };
  const hizBps = oturumBayt / oturumS;
  return { oturumBayt, hizBps, gorevBayt: hizBps * Math.max(0, firlatmadanBeriS) };
}

export function fmtBytes(b: number): string {
  const birimler = ['B', 'kB', 'MB', 'GB', 'TB'];
  let v = b;
  let i = 0;
  while (v >= 1000 && i < birimler.length - 1) {
    v /= 1000;
    i++;
  }
  return (i === 0 ? v.toFixed(0) : v.toFixed(v < 10 ? 2 : 1)).replace('.', ',') + ' ' + birimler[i];
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
 * dogrulugu degil, "su an nerenin ustunden geciyor" sorusuna okunur bir cevap.
 * En yakin nokta ESIK_KM'den uzaksa bolge "acik deniz" sayilir.
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

function mesafeKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * WGS84_A_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

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

/** Zaman araliginda yer izinin gectigi bolgeler; ardisik ayni bolgeler birlesir. */
export function regionTimeline(sat: SatelliteRecord, baslangicMs: number, spanS: number, stepS = 60): RegionPass[] {
  const out: RegionPass[] = [];
  for (let dt = 0; dt <= spanS; dt += stepS) {
    const tMs = baslangicMs + dt * 1000;
    const nokta = subPointAt(sat, tMs);
    if (!nokta) continue;
    const ad = regionAt(nokta.latDeg, nokta.lonDeg);
    const son = out[out.length - 1];
    if (son && son.ad === ad) son.cikisMs = tMs;
    else out.push({ ad, girisMs: tMs, cikisMs: tMs });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Kaydedilen anomaliler                                               */
/* ------------------------------------------------------------------ */

export interface RecordedProblem {
  anahtar: string;
  kaynak: Alarm['source'];
  altSistem: string;
  pid: string;
  adet: number;
  ilkUtc: string;
  sonUtc: string;
  /** ilk ve son kayit arasi gorev suresi (s) */
  sureS: number;
  enYuksekOnem: number;
  sonMetin: string;
}

/**
 * Oturum boyunca uretilen alarmlari ayni sorunun tekrarlari olarak gruplar:
 * ayni kaynak + ayni alt sistem + ayni parametre bir kayittir. Nominale donus
 * bildirimleri (onem 0) sorun sayilmaz. En son yasanan en uste gelir.
 */
export function recordedProblems(alarmlar: Alarm[]): RecordedProblem[] {
  const gruplar = new Map<string, RecordedProblem & { ilkT: number; sonT: number }>();
  for (const a of alarmlar) {
    if (a.severity <= 0) continue;
    const anahtar = a.source + '|' + a.subsystem + '|' + a.pid;
    const g = gruplar.get(anahtar);
    if (!g) {
      gruplar.set(anahtar, {
        anahtar,
        kaynak: a.source,
        altSistem: a.subsystem,
        pid: a.pid,
        adet: 1,
        ilkUtc: a.utc,
        sonUtc: a.utc,
        sureS: 0,
        enYuksekOnem: a.severity,
        sonMetin: a.text,
        ilkT: a.missionT,
        sonT: a.missionT,
      });
      continue;
    }
    g.adet++;
    if (a.missionT < g.ilkT) {
      g.ilkT = a.missionT;
      g.ilkUtc = a.utc;
    }
    if (a.missionT >= g.sonT) {
      g.sonT = a.missionT;
      g.sonUtc = a.utc;
      g.sonMetin = a.text;
    }
    g.enYuksekOnem = Math.max(g.enYuksekOnem, a.severity);
    g.sureS = g.sonT - g.ilkT;
  }
  return [...gruplar.values()].sort((x, y) => y.sonT - x.sonT).map(({ ilkT: _i, sonT: _s, ...geri }) => geri);
}
