import { describe, expect, it } from 'vitest';
import {
  GIBS_LAYER,
  AOI_BBOX,
  MIN_AOI_BYTES,
  MIN_SNAPSHOT_BYTES,
  SNAPSHOT_HEIGHT,
  SNAPSHOT_WIDTH,
  fetchSnapshot,
  fmtTrDate,
  aoiCropUrl,
  isAoiCovered,
  isPlausibleSnapshot,
  latestAvailableDate,
  snapshotUrl,
} from './gibs';
import baked from '../assets/earth/gibs_current.json';

describe('GIBS — tarih seçimi', () => {
  it('UTC’ye göre dünü verir', () => {
    expect(latestAvailableDate(Date.UTC(2026, 8, 14, 12, 0))).toBe('2026-09-13');
  });

  it('ay sınırını geçer', () => {
    expect(latestAvailableDate(Date.UTC(2026, 0, 1, 0, 30))).toBe('2025-12-31');
  });

  it('artık günü doğru sayar', () => {
    expect(latestAvailableDate(Date.UTC(2028, 2, 1, 6, 0))).toBe('2028-02-29');
  });

  it('yerel saat dilimi UTC gününü kaydırmaz', () => {
    // 13 Eylül 21:30 UTC = Türkiye’de 14 Eylül 00:30; yine de UTC dünü gelmeli.
    expect(latestAvailableDate(Date.UTC(2026, 8, 13, 21, 30))).toBe('2026-09-12');
  });
});

describe('GIBS — URL', () => {
  it('beklenen sorguyu birebir kurar', () => {
    expect(snapshotUrl('2026-09-13')).toBe(
      'https://wvs.earthdata.nasa.gov/api/v1/snapshot?' +
        'REQUEST=GetSnapshot&TIME=2026-09-13&BBOX=-90%2C-180%2C90%2C180&CRS=EPSG%3A4326' +
        '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&FORMAT=image%2Fjpeg&WIDTH=2048&HEIGHT=1024',
    );
  });

  it('BBOX enlem-önce sırada ve CRS EPSG:4326', () => {
    const u = new URL(snapshotUrl('2026-09-13'));
    expect(u.searchParams.get('BBOX')).toBe('-90,-180,90,180');
    expect(u.searchParams.get('CRS')).toBe('EPSG:4326');
    expect(u.searchParams.get('LAYERS')).toBe(GIBS_LAYER);
  });

  it('varsayılan boyut eşdikdörtgen 2:1’dir', () => {
    expect(SNAPSHOT_WIDTH / SNAPSHOT_HEIGHT).toBe(2);
    const u = new URL(snapshotUrl('2026-09-13'));
    expect(Number(u.searchParams.get('WIDTH')) / Number(u.searchParams.get('HEIGHT'))).toBe(2);
  });
});

describe('GIBS — Türkçe tarih', () => {
  const cases: [string, string][] = [
    ['2026-01-05', '5 Ocak 2026'],
    ['2026-02-28', '28 Şubat 2026'],
    ['2026-03-01', '1 Mart 2026'],
    ['2026-04-30', '30 Nisan 2026'],
    ['2026-05-19', '19 Mayıs 2026'],
    ['2026-06-21', '21 Haziran 2026'],
    ['2026-07-15', '15 Temmuz 2026'],
    ['2026-08-30', '30 Ağustos 2026'],
    ['2026-09-13', '13 Eylül 2026'],
    ['2026-10-29', '29 Ekim 2026'],
    ['2026-11-10', '10 Kasım 2026'],
    ['2026-12-31', '31 Aralık 2026'],
  ];
  for (const [iso, tr] of cases) {
    it(iso + ' → ' + tr, () => expect(fmtTrDate(iso)).toBe(tr));
  }

  it('bozuk girdiyi olduğu gibi döndürür', () => {
    expect(fmtTrDate('yok')).toBe('yok');
    expect(fmtTrDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('GIBS — yanıt geçerliliği', () => {
  it('ölçülen gerçek vakaları ayırır', () => {
    // Aynı gün (2026-09-14): 200 döner ama kaplama eksik.
    expect(isPlausibleSnapshot(263_067, true)).toBe(false);
    // Dün (2026-09-13): tam mozaik.
    expect(isPlausibleSnapshot(608_703, true)).toBe(true);
    // Data-Present: false ise boyut ne olursa olsun geçersiz.
    expect(isPlausibleSnapshot(608_703, false)).toBe(false);
  });

  it('eşik MIN_SNAPSHOT_BYTES’ta keskin', () => {
    expect(isPlausibleSnapshot(MIN_SNAPSHOT_BYTES - 1, true)).toBe(false);
    expect(isPlausibleSnapshot(MIN_SNAPSHOT_BYTES, true)).toBe(true);
  });
});

describe('GIBS — eksik şerit (ilgi alanı kaplaması)', () => {
  it('Türkiye’nin üstü boş olan günü eler', () => {
    // Olculen gercek degerler. 2026-03-13 mozaiginde Avrupa-Ortadogu-Afrika'yi
    // kaplayan dev bir bosluk var ama dosya 521 kB ile boyut tabanini asiyor:
    // tam mozaik boyutu bu durumu YAKALAMAZ, ilgi alani kirpmasi yakalar.
    expect(isAoiCovered(908)).toBe(false); // 2026-03-13 — eksik şerit
    expect(isAoiCovered(28_207)).toBe(true); // 2026-09-13 — dolu
    expect(isAoiCovered(27_883)).toBe(true); // 2026-09-06 — dolu
  });

  it('boyut tabanı tek başına yetmez — bu yüzden ikinci denetim var', () => {
    // 2026-03-13: 521 537 bayt, boyut tabanini gecer…
    expect(isPlausibleSnapshot(521_537, true)).toBe(true);
    // …ama ilgi alani bos.
    expect(isAoiCovered(908)).toBe(false);
  });

  it('eşik MIN_AOI_BYTES’ta keskin', () => {
    expect(isAoiCovered(MIN_AOI_BYTES - 1)).toBe(false);
    expect(isAoiCovered(MIN_AOI_BYTES)).toBe(true);
  });

  it('kırpma URL’i Türkiye’yi kapsar', () => {
    const u = new URL(aoiCropUrl('2026-09-13'));
    expect(u.searchParams.get('BBOX')).toBe(AOI_BBOX);
    const [latMin, lonMin, latMax, lonMax] = AOI_BBOX.split(',').map(Number);
    // Kahramankazan yer istasyonu (40.161°N, 32.679°E) kırpmanın içinde olmalı.
    expect(latMin).toBeLessThan(40.161);
    expect(latMax).toBeGreaterThan(40.161);
    expect(lonMin).toBeLessThan(32.679);
    expect(lonMax).toBeGreaterThan(32.679);
  });
});

/** Sahte yanit: Node 22'de Headers ve Blob global, polyfill gerekmez. */
function stubResponse(body: BlobPart, headers: Record<string, string>, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers(headers),
    blob: async () => new Blob([body]),
  } as unknown as Response;
}

describe('GIBS — indirme', () => {
  const url = snapshotUrl('2026-09-13');

  it('başlıkları çıkarır ve boyutu ölçer', async () => {
    const body = new Uint8Array(1234);
    const snap = await fetchSnapshot(url, {
      fetchImpl: async () => stubResponse(body, { 'Acquisition-Time': '2026-09-13', 'Data-Present': 'true' }),
    });
    expect(snap.acquisitionDate).toBe('2026-09-13');
    expect(snap.dataPresent).toBe(true);
    expect(snap.bytes).toBe(1234);
  });

  it('Data-Present: false’ı taşır', async () => {
    const snap = await fetchSnapshot(url, {
      fetchImpl: async () => stubResponse(new Uint8Array(10), { 'Data-Present': 'false' }),
    });
    expect(snap.dataPresent).toBe(false);
  });

  it('başlık yoksa fırlatmaz, acquisitionDate null döner', async () => {
    const snap = await fetchSnapshot(url, {
      fetchImpl: async () => stubResponse(new Uint8Array(10), {}),
    });
    expect(snap.acquisitionDate).toBeNull();
    expect(snap.dataPresent).toBe(true);
  });

  it('HTTP hatasında fırlatır', async () => {
    await expect(
      fetchSnapshot(url, { fetchImpl: async () => stubResponse(new Uint8Array(0), {}, false, 503) }),
    ).rejects.toThrow('503');
  });

  it('zaman aşımında fırlatır (sinyali yok sayan uygulamada bile)', async () => {
    await expect(
      fetchSnapshot(url, { timeoutMs: 10, fetchImpl: () => new Promise<Response>(() => {}) }),
    ).rejects.toThrow('zaman aşımı');
  });
});

describe('GIBS — gömülü mozaik', () => {
  it('sidecar geçerli ve katman beklenen', () => {
    expect(baked.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(baked.layer).toBe(GIBS_LAYER);
    expect(baked.width / baked.height).toBe(2);
  });
});
