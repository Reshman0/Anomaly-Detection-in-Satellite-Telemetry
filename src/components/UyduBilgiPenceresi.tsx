import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConsole } from '../store';
import { MIB, subsystemName } from '../engine/mib';
import { satByNorad, subPointAt } from '../engine/orbit';
import { stateLabel } from '../engine/limitChecker';
import { stateTextClass } from '../ui/colors';
import {
  dataVolume,
  fmtBytes,
  missionLife,
  nadirAngleDeg,
  orbitCount,
  recordedProblems,
  regionAt,
  regionTimeline,
} from '../engine/satelliteInfo';
import { portalHedefi, useModalKeys } from './useModalKeys';

/**
 * Ust seritteki "Bilgi" dugmesi ve actigi uydu bilgi penceresi.
 *
 * Satir ici "Operator bilgi paneli"nden (InfoPanel.tsx) ayridir: o panel
 * senaryonun tespit hikayesini anlatir, bu pencere ise secili uydunun genel
 * durumunu toplar — tur sayisi, aktarilan veri, gorev omru, sensorler ve
 * oturumda kaydedilen anomaliler.
 *
 * Gorunum konsolun diger pencereleriyle (Paket denetleyici, Erisilebilirlik,
 * Alarm detayi) ayni dili konusur: bg-black/55 zemin, card-in kutu, `num`
 * yazi tipinde 14 px buyuk harf baslik, sade ✕, text-3xs bolum basliklari ve
 * 11 px satirlar. Acilista odak ✕ dugmesine gider.
 *
 * Acik/kapali durumu bilesenin kendi icinde tutulur ve pencere #root'a portal
 * ile basilir (erisilebilirlik olcegini izlesin diye). Boylece store.ts'e ve
 * App.tsx'e yeni alan eklenmez.
 */

const ONEM = ['bilgi', 'düşük', 'orta', 'yüksek'];

const sayi = (n: number) => n.toLocaleString('tr-TR');
const ondalik = (n: number, h: number) => n.toFixed(h).replace('.', ',');

function gunAy(ms: number): string {
  const d = new Date(ms);
  return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear();
}

function saatDk(ms: number): string {
  const d = new Date(ms);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/** Erisilebilirlik penceresindeki Section ile ayni yapi. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">{title}</div>
      {note && <div className="text-3xs text-ops-faint leading-snug mb-1">{note}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Satir({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[2px] text-[11px] border-b border-ops-line/50 last:border-b-0">
      <span className="text-ops-dim shrink-0">{ad}</span>
      <span className="num text-ops-text text-right">{children}</span>
    </div>
  );
}

function Ozet({ etiket, deger, alt }: { etiket: string; deger: string; alt: string }) {
  return (
    <div className="px-3 py-1.5 min-w-0 border-r border-ops-line last:border-r-0">
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">{etiket}</div>
      <div className="num text-[14px] font-semibold text-ops-text leading-tight mt-[2px]">{deger}</div>
      <div className="text-3xs text-ops-dim leading-tight">{alt}</div>
    </div>
  );
}

export default function UyduBilgiPenceresi() {
  const [acik, setAcik] = useState(false);
  const kapat = useCallback(() => setAcik(false), []);
  useModalKeys(acik, kapat);

  // Dugme ust seritteki Paket / Erisim dugmeleriyle ayni grupta ve ayni stilde.
  return (
    <>
      <button
        onClick={() => setAcik(true)}
        title="Seçili uydunun bilgileri: tur, aktarılan veri, görev ömrü, sensörler, kayıtlı anomaliler"
        className="num text-[10px] tracking-[0.12em] uppercase px-2 py-[3px] border border-ops-line2 text-ops-dim hover:text-ops-text leading-none"
      >
        Bilgi
      </button>
      {acik && createPortal(<Pencere kapat={kapat} />, portalHedefi())}
    </>
  );
}

function Pencere({ kapat }: { kapat: () => void }) {
  const sim = useConsole((s) => s.sim);
  const selectedNorad = useConsole((s) => s.selectedNorad);
  useConsole((s) => s.version);
  const kapatRef = useRef<HTMLButtonElement>(null);

  // Diger pencerelerde oldugu gibi acilista odak kapat dugmesine gider.
  useEffect(() => {
    kapatRef.current?.focus();
  }, []);

  const sat = satByNorad(selectedNorad);
  const utcMs = sim.clock.utcMs();
  const missionT = sim.clock.missionT;

  // Bolge taramasi pahali (bir tur boyunca yorunge yayilimi): dakikada bir tazelenir.
  const dakika = Math.floor(utcMs / 60000);
  const bolgeler = useMemo(
    () => regionTimeline(sat, utcMs, Math.min(sat.periodMin, 100) * 60, 60),
    [sat, dakika], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sp = subPointAt(sat, utcMs);
  const suAn = sp ? regionAt(sp.latDeg, sp.lonDeg) : '—';
  const nadir = nadirAngleDeg(sat, utcMs);
  const omur = missionLife(sat, utcMs);
  const tur = orbitCount(sat, utcMs);

  const paketler = sim.packets;
  const ortBayt = paketler.length ? paketler.reduce((a, p) => a + p.bytes.length, 0) / paketler.length : 0;
  const veri = dataVolume(sim.packetCount, ortBayt, missionT, (utcMs - omur.firlatmaMs) / 1000);

  const durumlar = sim.snapshot().states;
  const sensorler = MIB.parameters
    .filter((p) => !p.derived)
    .map((p) => {
      const buf = sim.buffers.get(p.pid);
      const son = buf?.[buf.length - 1];
      return { p, durum: durumlar.get(p.pid) ?? 'NOMINAL', deger: son ? son.eng : null };
    });
  const nominalSensor = sensorler.filter((s) => s.durum === 'NOMINAL').length;

  const problemler = recordedProblems(sim.alarms);
  const toplamKayit = problemler.reduce((a, p) => a + p.adet, 0);
  const gecenYil = omur.gecenGun / 365.25;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={kapat}>
      {/* Boyut siniri olcege bolunur: pencere #root'un `zoom`u altinda cizildigi
          icin vh/vw degerleri de olcekle carpiliyor ve yuksek olcekte kutu
          ekrandan tasiyordu. Bolunce zoom sonrasi gercek ekrana sigar. */}
      <div
        data-tour="uydu-bilgi"
        role="dialog"
        aria-modal="true"
        aria-label="Uydu bilgileri"
        onClick={(e) => e.stopPropagation()}
        className="card-in w-[960px] max-w-[calc(96vw/var(--ui-scale,1))] max-h-[calc(88vh/var(--ui-scale,1))] bg-ops-panel border border-ops-line2 shadow-2xl flex flex-col"
      >
        <div className="flex items-center gap-3 px-3 py-2 border-b border-ops-line2 shrink-0">
          <span className="num text-[14px] font-semibold text-ops-text">UYDU BİLGİSİ · {sat.name.toLocaleUpperCase('tr-TR')}</span>
          <span className="text-3xs text-ops-faint tracking-[0.1em] min-w-0">
            NORAD {sat.norad} · {sat.orbitClass} · {sat.mission}
          </span>
          <button
            ref={kapatRef}
            onClick={kapat}
            className="ml-auto text-ops-dim hover:text-ops-text text-[13px] leading-none px-1"
            title="Kapat (Esc)"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-4 border-b border-ops-line shrink-0">
          <Ozet etiket="Dünya etrafında" deger={sayi(tur.toplam) + ' tur'} alt={'günde ' + ondalik(tur.gunluk, 1) + ' tur atıyor'} />
          <Ozet
            etiket="Aktarılan veri"
            deger={veri.gorevBayt === null ? fmtBytes(veri.oturumBayt) : '≈ ' + fmtBytes(veri.gorevBayt)}
            alt={veri.gorevBayt === null ? 'bu oturumda · hız ölçülüyor' : 'fırlatmadan bu yana (tahmin)'}
          />
          <Ozet
            etiket="Görev ömrü"
            deger={omur.yuzde === null ? '≈ ' + ondalik(gecenYil, 1) + ' yıl' : '%' + omur.yuzde.toFixed(0)}
            alt={omur.kalanGun === null ? 'görevde geçen süre' : sayi(omur.kalanGun) + ' gün kaldı (tasarıma göre)'}
          />
          <Ozet
            etiket="Sensörler"
            deger={nominalSensor + ' / ' + sensorler.length}
            alt={nominalSensor === sensorler.length ? 'hepsi nominal' : sensorler.length - nominalSensor + ' sensör limit dışında'}
          />
        </div>

        <div className="grid grid-cols-[1.15fr_1fr] gap-px flex-1 min-h-0 overflow-hidden">
          <div className="px-3 py-2 overflow-y-auto border-r border-ops-line">
            <Section title="Sensör durumu" note="Değerler uçuş yazılımının limit kontrolünden anlık okunur.">
              {sensorler.map(({ p, durum, deger }) => (
                <div
                  key={p.pid}
                  className="grid grid-cols-[52px_minmax(0,1fr)_64px_76px] items-baseline gap-2 py-[2px] text-[11px] border-b border-ops-line/50 last:border-b-0"
                >
                  <span className="num text-ops-text">{p.pid}</span>
                  <span className="text-ops-dim leading-tight">{subsystemName(p.subsystem)}</span>
                  <span className="num text-ops-dim text-right">{deger === null ? '—' : (deger >= 0 ? '+' : '') + deger.toFixed(2)}</span>
                  <span className={'num text-3xs font-semibold text-right ' + stateTextClass(durum)}>{stateLabel(durum)}</span>
                </div>
              ))}
            </Section>

            <Section
              title="Kaydedilen anomaliler"
              note={
                problemler.length === 0
                  ? undefined
                  : 'Aynı alt sistem ve aynı kaynaktan gelen alarmlar tek sorunun tekrarı sayılır. Bu oturumda ' +
                    problemler.length +
                    ' ayrı sorun, toplam ' +
                    toplamKayit +
                    ' kayıt var.'
              }
            >
              {problemler.length === 0 ? (
                <div className="text-[11px] text-ops-faint leading-snug">
                  Bu oturumda henüz bir sorun kaydedilmedi. Bir senaryo çalıştırıldığında simülasyonun yakaladığı her sorun burada
                  tekrar sayısıyla birlikte listelenir.
                </div>
              ) : (
                problemler.map((pr) => (
                  <div key={pr.anahtar} className="py-[3px] border-b border-ops-line/50 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="text-ops-text min-w-0 leading-tight">{pr.sonMetin}</span>
                      <span className="num text-ops-text font-semibold shrink-0">{pr.adet} kez</span>
                    </div>
                    <div className="flex items-baseline gap-x-2 flex-wrap text-3xs text-ops-faint num">
                      <span className={pr.kaynak === 'AI_DERIVED' ? 'text-ops-ai' : 'text-ops-soft'}>
                        {pr.kaynak === 'AI_DERIVED' ? '◆ yapay zeka' : '▲ limit kontrolü'}
                      </span>
                      <span>{subsystemName(pr.altSistem)}</span>
                      <span>önem: {ONEM[pr.enYuksekOnem] ?? pr.enYuksekOnem}</span>
                      <span>{pr.ilkUtc === pr.sonUtc ? pr.ilkUtc : pr.ilkUtc + ' → ' + pr.sonUtc}</span>
                      {pr.sureS > 0 && <span>{Math.round(pr.sureS)} s boyunca</span>}
                    </div>
                  </div>
                ))
              )}
            </Section>

            <Section
              title="Uydunun geçtiği yerler"
              note={'Önümüzdeki ' + Math.round(Math.min(sat.periodMin, 100)) + ' dakika boyunca yer izinin geçeceği bölgeler. Saatler UTC.'}
            >
              <Satir ad="Şu an">{suAn}</Satir>
              {bolgeler.map((b, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-[2px] text-[11px] border-b border-ops-line/50 last:border-b-0">
                  <span className={i === 0 ? 'text-ops-text' : 'text-ops-dim'}>{b.ad}</span>
                  <span className="num text-3xs text-ops-faint shrink-0">
                    {saatDk(b.girisMs)}
                    {b.cikisMs > b.girisMs ? ' – ' + saatDk(b.cikisMs) : ''}
                  </span>
                </div>
              ))}
            </Section>
          </div>

          <div className="px-3 py-2 overflow-y-auto">
            <Section
              title="Dünya etrafındaki turlar"
              note="Başlangıç sayısı uydunun yörünge verisinde (TLE) kayıtlı gerçek tur numarasıdır; sonrası tur süresiyle ilerletilir."
            >
              <Satir ad="Toplam tur">{sayi(tur.toplam)}</Satir>
              <Satir ad="Günlük">{ondalik(tur.gunluk, 2)} tur</Satir>
              <Satir ad="Tur süresi">{ondalik(sat.periodMin, 1)} dakika</Satir>
              <Satir ad="Son yörünge verisinden beri">{sayi(tur.epochtanBeri)} tur</Satir>
            </Section>

            <Section
              title="Aktarılan veri"
              note="Oturum hacmi ölçümdür. Görev boyu hacim bu akış hızının fırlatmadan beri sürdüğü varsayımıyla hesaplanır ve yalnızca durum telemetrisini kapsar, görüntü verisi dahil değildir."
            >
              <Satir ad="Bu oturumda">
                {sayi(sim.packetCount)} paket · {fmtBytes(veri.oturumBayt)}
              </Satir>
              <Satir ad="Akış hızı">
                {veri.hizBps === null ? <span className="text-ops-faint">ölçülüyor</span> : ondalik(veri.hizBps, 1) + ' bayt/s'}
              </Satir>
              <Satir ad="Fırlatmadan bu yana">
                {veri.gorevBayt === null ? <span className="text-ops-faint">—</span> : '≈ ' + fmtBytes(veri.gorevBayt)}
              </Satir>
            </Section>

            <Section
              title="Görev ömrü"
              note={
                omur.kesin
                  ? undefined
                  : 'Bu uydu için kesin fırlatma tarihi ve tasarım ömrü doğrulanmadı; fırlatma yılı yörünge verisindeki uluslararası tanımlayıcıdan okunur.'
              }
            >
              <Satir ad={omur.kesin ? 'Fırlatma' : 'Fırlatma yılı'}>{omur.kesin ? gunAy(omur.firlatmaMs) : String(sat.launchYear)}</Satir>
              <Satir ad="Geçen süre">
                {omur.kesin ? sayi(omur.gecenGun) + ' gün (' + ondalik(gecenYil, 1) + ' yıl)' : '≈ ' + ondalik(gecenYil, 1) + ' yıl'}
              </Satir>
              <Satir ad="Tasarım ömrü">
                {omur.tasarimYil === null ? <span className="text-ops-faint">katalogda yok</span> : omur.tasarimYil + ' yıl'}
              </Satir>
              {omur.kalanGun !== null && omur.yuzde !== null && omur.tasarimYil !== null && (
                <>
                  <Satir ad="Kalan (tasarıma göre)">{sayi(omur.kalanGun)} gün</Satir>
                  <div className="mt-1.5 h-[6px] bg-ops-sunken border border-ops-line overflow-hidden">
                    <div className="h-full bg-ops-nominal" style={{ width: omur.yuzde.toFixed(1) + '%' }} />
                  </div>
                  <div className="flex justify-between text-3xs text-ops-faint num mt-[2px]">
                    <span>tasarım ömrünün %{omur.yuzde.toFixed(0)}'i geçti</span>
                    <span>{omur.tasarimYil} yıl</span>
                  </div>
                </>
              )}
            </Section>

            <Section
              title="Yörünge ve bakış"
              note="Nadir açısı, uydunun tam altına bakan yönden ne kadar saptığını söyler. Sıfır derece doğrudan aşağı bakmak demektir; açı büyüdükçe bakış yana eğilir."
            >
              <Satir ad="Yükseklik">{sp ? ondalik(sp.altKm, 1) + ' km' : '—'}</Satir>
              <Satir ad="Alt nokta">{sp ? sp.latDeg.toFixed(2) + '° · ' + sp.lonDeg.toFixed(2) + '°' : '—'}</Satir>
              <Satir ad="Nadir açısı">
                {nadir === null ? <span className="text-ops-faint">istasyon görüş dışında</span> : ondalik(nadir, 1) + '°'}
              </Satir>
              <Satir ad="Eğim">{ondalik(sat.inclinationDeg, 2)}°</Satir>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
