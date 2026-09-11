import { useEffect, useMemo } from 'react';
import { useConsole } from '../store';
import { NORAD_ID, ORBIT_PERIOD_S, TLE_EPOCH_MS, TLE_NAME, subPointAt } from '../engine/orbit';
import { MIB } from '../engine/mib';
import {
  DESIGN_LIFE_YEARS,
  LAUNCH_MS,
  memoryHealth,
  missionLife,
  nadirAngleDeg,
  regionAt,
  regionTimeline,
} from '../engine/satelliteInfo';

/**
 * Uydu bilgi penceresi.
 *
 * Konsolun yuzeyi (1600x900) tamamen dolu; bu bilgiler icin yeni panel acmak
 * mevcut panelleri kucultmek demekti. Bunun yerine hepsi tek bir acilir
 * pencerede toplandi: operator notu, gorev omru, anomali sikligi, yer izi
 * bolgeleri ve nadir acisi.
 *
 * Olceklenen yuzeyin DISINDA render edilir (bkz. `App.tsx`), boylece uzun
 * listeler kendi icinde kayabilir ve panel kirpmasina takilmaz.
 */

function gunAy(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getUTCDate()).padStart(2, '0') +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    d.getUTCFullYear()
  );
}

function saatDk(ms: number): string {
  const d = new Date(ms);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

function Satir({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px] border-b border-ops-line/60 last:border-b-0">
      <span className="text-[13px] text-ops-dim shrink-0">{ad}</span>
      <span className="num text-[14px] text-ops-text text-right">{children}</span>
    </div>
  );
}

function Blok({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-0">
      <h3 className="text-[11px] uppercase tracking-[0.16em] text-ops-faint mb-2">{baslik}</h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export default function InfoPanel() {
  const acik = useConsole((s) => s.infoAcik);
  const kapat = useConsole((s) => s.infoKapat);
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  useEffect(() => {
    if (!acik) return;
    const bas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kapat();
    };
    addEventListener('keydown', bas);
    return () => removeEventListener('keydown', bas);
  }, [acik, kapat]);

  const utcMs = sim.clock.utcMs();
  const missionT = sim.clock.missionT;

  const hafiza = useMemo(() => memoryHealth(missionT), [missionT]);
  const omur = useMemo(() => missionLife(utcMs), [utcMs]);

  /*
   * Bolge taramasi bir tur boyunca ~56 yorunge yayilimi demek. Pencere kapaliyken
   * hic hesaplanmamali (bilesen her karede render ediliyor), acikken de dakikada
   * bir tazelenmesi yeterli.
   */
  const bolgeAnahtar = Math.floor(utcMs / 60000);
  const bolgeler = useMemo(
    () => (acik ? regionTimeline(utcMs, 55 * 60, 60) : []),
    [bolgeAnahtar, acik], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const suAn = useMemo(() => {
    if (!acik) return '—';
    const p = subPointAt(utcMs);
    return p ? regionAt(p.latDeg, p.lonDeg) : '—';
  }, [bolgeAnahtar, acik]); // eslint-disable-line react-hooks/exhaustive-deps

  const sp = acik ? subPointAt(utcMs) : null;
  const nadir = acik ? nadirAngleDeg(utcMs) : null;

  // Bu oturumda gerceklesenler.
  const alarmlar = sim.alarms;
  const aiAlarm = alarmlar.filter((a) => a.source === 'AI_DERIVED').length;
  const limitAlarm = alarmlar.filter((a) => a.source === 'ST12_LIMIT').length;
  const oturumSaat = Math.max(1 / 60, missionT / 3600);

  if (!acik) return null;

  const tleYas = Math.round((Date.parse(MIB.epoch) - TLE_EPOCH_MS) / 86400000);

  return (
    <div
      className="fixed inset-0 z-[90] bg-ops-bg/95 flex items-center justify-center p-6"
      onClick={kapat}
      role="dialog"
      aria-label="Uydu bilgileri"
    >
      <div
        className="relative bg-ops-panel border border-ops-line2 w-[min(96vw,1180px)] max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-6 px-6 py-4 border-b border-ops-line bg-ops-sunken shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-[20px] font-semibold text-ops-text">{TLE_NAME}</span>
            <span className="num text-[13px] text-ops-faint">NORAD {NORAD_ID}</span>
          </div>
          <button
            onClick={kapat}
            aria-label="Kapat"
            title="Kapat (Esc)"
            className="shrink-0 w-9 h-9 flex items-center justify-center text-[20px] leading-none text-ops-dim border border-ops-line2 hover:text-ops-text hover:border-ops-dim transition-colors"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* --- operator notu: panelin en degerli satiri, en uste --- */}
          {hafiza.esikAsildi && (
            <div className="border border-ops-soft/60 bg-ops-soft/10 px-5 py-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-ops-soft font-semibold">
                  Operatöre not
                </span>
              </div>
              <p className="text-[15px] text-ops-text leading-relaxed">
                Uydunun kalıcı hafızasında son 24 saat içinde{' '}
                <b className="num text-ops-soft">{hafiza.son24Saat}</b> düzeltilebilir hata bulundu ve
                donanım hepsini kendiliğinden düzeltti. Günlük ortalama{' '}
                <b className="num">{hafiza.gunlukOrtalama}</b> iken bu sayı yüksek kalıyor.
              </p>
              <p className="text-[15px] text-ops-text leading-relaxed">
                <span className="text-ops-soft font-semibold">ÖNERİ:</span> {hafiza.oneri}
              </p>
              <p className="text-[12px] text-ops-faint">
                Düzeltilemeyen hata sayısı {hafiza.duzeltilemeyen}. Veri kaybı yok, görev devam edebilir.
              </p>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-10 gap-y-6">
            {/* --- gorev omru --- */}
            <Blok baslik="Görev ömrü">
              <Satir ad="Fırlatma">{gunAy(LAUNCH_MS)}</Satir>
              <Satir ad="Geçen süre">
                {omur.gecenGun} gün ({(omur.gecenGun / 365.25).toFixed(1)} yıl)
              </Satir>
              <Satir ad="Tasarım ömrü">{DESIGN_LIFE_YEARS} yıl</Satir>
              <Satir ad="Kalan (tasarıma göre)">{omur.kalanGun} gün</Satir>
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="h-2 bg-ops-sunken border border-ops-line overflow-hidden">
                  <div
                    className="h-full bg-ops-nominal"
                    style={{ width: omur.yuzde.toFixed(1) + '%' }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-ops-faint num">
                  <span>tasarım ömrünün %{omur.yuzde.toFixed(0)}'i geçti</span>
                  <span>{DESIGN_LIFE_YEARS} yıl</span>
                </div>
              </div>
            </Blok>

            {/* --- yorunge ve bakis --- */}
            <Blok baslik="Yörünge ve bakış">
              <Satir ad="Yükseklik">{sp ? sp.altKm.toFixed(1) + ' km' : '—'}</Satir>
              <Satir ad="Alt nokta">
                {sp ? sp.latDeg.toFixed(2) + '° · ' + sp.lonDeg.toFixed(2) + '°' : '—'}
              </Satir>
              <Satir ad="Nadir açısı">
                {nadir === null ? (
                  <span className="text-ops-faint">istasyon görüş dışında</span>
                ) : (
                  nadir.toFixed(1) + '°'
                )}
              </Satir>
              <Satir ad="Tur süresi">{(ORBIT_PERIOD_S / 60).toFixed(1)} dakika</Satir>
              <Satir ad="Yörünge verisi">{tleYas} gün önce</Satir>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Nadir açısı, uydunun tam altına bakan yönden ne kadar saptığını söyler. Sıfır derece
                doğrudan aşağı bakmak demektir; açı büyüdükçe kamera yana eğilir.
              </p>
            </Blok>

            {/* --- anomali sikligi --- */}
            <Blok baslik="Anomali sıklığı">
              <Satir ad="Bu oturumda toplam">{alarmlar.length} alarm</Satir>
              <Satir ad="Yapay zekâ kaynaklı">{aiAlarm}</Satir>
              <Satir ad="Limit kontrolü kaynaklı">{limitAlarm}</Satir>
              <Satir ad="Saatlik hız">
                {(alarmlar.length / oturumSaat).toFixed(1)} alarm/saat
              </Satir>
              <Satir ad="Yanlış alarm">{sim.falseAlarms}</Satir>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Sayılar bu oturumda gerçekten üretilen alarmlardır; görev saati{' '}
                <span className="num">{(missionT / 60).toFixed(0)}</span> dakikadır.
              </p>
            </Blok>

            {/* --- gectigi yerler --- */}
            <Blok baslik="Uydunun geçtiği yerler">
              <Satir ad="Şu an">{suAn}</Satir>
              <div className="mt-2 flex flex-col gap-[3px] max-h-[168px] overflow-y-auto pr-1">
                {bolgeler.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-[13px] py-[3px] border-b border-ops-line/40"
                  >
                    <span className={i === 0 ? 'text-ops-text' : 'text-ops-dim'}>{b.ad}</span>
                    <span className="num text-[12px] text-ops-faint shrink-0">
                      {saatDk(b.girisMs)}
                      {b.cikisMs > b.girisMs ? ' – ' + saatDk(b.cikisMs) : ''}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Önümüzdeki bir tur (≈{(ORBIT_PERIOD_S / 60).toFixed(0)} dakika) boyunca yer izinin
                geçeceği bölgeler. Saatler UTC.
              </p>
            </Blok>
          </div>
        </div>
      </div>
    </div>
  );
}
