import { useCallback, useMemo, useState } from 'react';
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

function Satir({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px] border-b border-ops-line/60 last:border-b-0">
      <span className="text-[13px] text-ops-dim shrink-0">{ad}</span>
      <span className="num text-[14px] text-ops-text text-right">{children}</span>
    </div>
  );
}

function Blok({ baslik, children, className }: { baslik: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={'flex flex-col min-h-0 ' + (className ?? '')}>
      <h3 className="text-[11px] uppercase tracking-[0.16em] text-ops-faint mb-2">{baslik}</h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Ozet({ etiket, deger, alt }: { etiket: string; deger: string; alt: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 bg-ops-sunken border border-ops-line min-w-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-ops-faint">{etiket}</span>
      <span className="num text-[22px] font-semibold text-ops-text leading-none">{deger}</span>
      <span className="text-[12px] text-ops-dim truncate">{alt}</span>
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
    <div
      className="fixed inset-0 z-[90] bg-ops-bg/95 flex items-center justify-center p-6"
      onClick={kapat}
      role="dialog"
      aria-label="Uydu bilgileri"
    >
      {/* Boyut siniri olcege bolunur: pencere #root'un `zoom`u altinda cizildigi
          icin 92vh gibi degerler de olcekle carpiliyor ve 1.3 olcekte kutu
          ekranin %120'sine cikiyordu. Bolunce zoom sonrasi gercek ekrana sigar. */}
      <div
        className="relative bg-ops-panel border border-ops-line2 w-[min(calc(96vw/var(--ui-scale,1)),1180px)] max-h-[calc(92vh/var(--ui-scale,1))] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-6 px-6 py-4 border-b border-ops-line bg-ops-sunken shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-[20px] font-semibold text-ops-text">{sat.name}</span>
            <span className="num text-[13px] text-ops-faint">
              NORAD {sat.norad} · {sat.orbitClass} · {sat.mission}
            </span>
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

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-7">
          <div className="grid grid-cols-4 gap-3">
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

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-10 gap-y-7">
            <Blok baslik="Sensör durumu">
              {sensorler.map(({ p, durum, deger }) => (
                <div
                  key={p.pid}
                  className="grid grid-cols-[64px_minmax(0,1fr)_76px_92px] items-baseline gap-3 py-[5px] border-b border-ops-line/60 last:border-b-0"
                >
                  <span className="num text-[14px] text-ops-text">{p.pid}</span>
                  <span className="text-[13px] text-ops-dim truncate">{subsystemName(p.subsystem)}</span>
                  <span className="num text-[13px] text-ops-dim text-right">
                    {deger === null ? '—' : (deger >= 0 ? '+' : '') + deger.toFixed(2)}
                  </span>
                  <span className={'text-[12px] font-semibold text-right ' + stateTextClass(durum)}>{stateLabel(durum)}</span>
                </div>
              ))}
              <p className="text-[12px] text-ops-faint leading-snug mt-2">Değerler uçuş yazılımının limit kontrolünden anlık okunur.</p>
            </Blok>

            <Blok baslik="Kaydedilen anomaliler">
              {problemler.length === 0 ? (
                <p className="text-[13px] text-ops-faint leading-relaxed py-2">
                  Bu oturumda henüz bir sorun kaydedilmedi. Bir senaryo çalıştırıldığında simülasyonun yakaladığı her sorun
                  burada tekrar sayısıyla birlikte listelenir.
                </p>
              ) : (
                <>
                  <div className="flex flex-col max-h-[236px] overflow-y-auto pr-1">
                    {problemler.map((pr) => (
                      <div key={pr.anahtar} className="py-[7px] border-b border-ops-line/60 last:border-b-0 flex flex-col gap-[3px]">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] text-ops-text min-w-0 truncate">{pr.sonMetin}</span>
                          <span className="num text-[14px] font-semibold text-ops-text shrink-0">{pr.adet} kez</span>
                        </div>
                        <div className="flex items-baseline gap-x-3 flex-wrap text-[12px] text-ops-faint num">
                          <span className={pr.kaynak === 'AI_DERIVED' ? 'text-ops-ai' : 'text-ops-soft'}>
                            {pr.kaynak === 'AI_DERIVED' ? 'yapay zeka' : 'limit kontrolü'}
                          </span>
                          <span>{subsystemName(pr.altSistem)}</span>
                          <span>önem: {ONEM[pr.enYuksekOnem] ?? pr.enYuksekOnem}</span>
                          <span>{pr.ilkUtc === pr.sonUtc ? pr.ilkUtc : pr.ilkUtc + ' → ' + pr.sonUtc}</span>
                          {pr.sureS > 0 && <span>{Math.round(pr.sureS)} s boyunca</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[12px] text-ops-faint leading-snug mt-2">
                    Aynı alt sistem ve aynı kaynaktan gelen alarmlar tek sorunun tekrarı sayılır. Bu oturumda {problemler.length} ayrı
                    sorun, toplam {toplamKayit} kayıt var.
                  </p>
                </>
              )}
            </Blok>

            <Blok baslik="Dünya etrafındaki turlar">
              <Satir ad="Toplam tur">{sayi(tur.toplam)}</Satir>
              <Satir ad="Günlük">{ondalik(tur.gunluk, 2)} tur</Satir>
              <Satir ad="Tur süresi">{ondalik(sat.periodMin, 1)} dakika</Satir>
              <Satir ad="Son yörünge verisinden beri">{sayi(tur.epochtanBeri)} tur</Satir>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Başlangıç sayısı uydunun yörünge verisinde (TLE) kayıtlı gerçek tur numarasıdır; sonrası tur süresiyle ilerletilir.
              </p>
            </Blok>

            <Blok baslik="Aktarılan veri">
              <Satir ad="Bu oturumda">
                {sayi(sim.packetCount)} paket · {fmtBytes(veri.oturumBayt)}
              </Satir>
              <Satir ad="Akış hızı">
                {veri.hizBps === null ? <span className="text-ops-faint">ölçülüyor</span> : ondalik(veri.hizBps, 1) + ' bayt/s'}
              </Satir>
              <Satir ad="Fırlatmadan bu yana">
                {veri.gorevBayt === null ? <span className="text-ops-faint">—</span> : '≈ ' + fmtBytes(veri.gorevBayt)}
              </Satir>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Oturum hacmi ölçümdür. Görev boyu hacim bu akış hızının fırlatmadan beri sürdüğü varsayımıyla hesaplanır ve
                yalnızca durum telemetrisini kapsar, görüntü verisi dahil değildir.
              </p>
            </Blok>

            <Blok baslik="Görev ömrü">
              <Satir ad={omur.kesin ? 'Fırlatma' : 'Fırlatma yılı'}>
                {omur.kesin ? gunAy(omur.firlatmaMs) : String(sat.launchYear)}
              </Satir>
              <Satir ad="Geçen süre">
                {omur.kesin ? sayi(omur.gecenGun) + ' gün (' + ondalik(gecenYil, 1) + ' yıl)' : '≈ ' + ondalik(gecenYil, 1) + ' yıl'}
              </Satir>
              <Satir ad="Tasarım ömrü">
                {omur.tasarimYil === null ? <span className="text-ops-faint">katalogda yok</span> : omur.tasarimYil + ' yıl'}
              </Satir>
              {omur.kalanGun !== null && omur.yuzde !== null && omur.tasarimYil !== null && (
                <>
                  <Satir ad="Kalan (tasarıma göre)">{sayi(omur.kalanGun)} gün</Satir>
                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="h-2 bg-ops-sunken border border-ops-line overflow-hidden">
                      <div className="h-full bg-ops-nominal" style={{ width: omur.yuzde.toFixed(1) + '%' }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-ops-faint num">
                      <span>tasarım ömrünün %{omur.yuzde.toFixed(0)}'i geçti</span>
                      <span>{omur.tasarimYil} yıl</span>
                    </div>
                  </div>
                </>
              )}
              {!omur.kesin && (
                <p className="text-[12px] text-ops-faint leading-snug mt-2">
                  Bu uydu için kesin fırlatma tarihi ve tasarım ömrü doğrulanmadı; fırlatma yılı yörünge verisindeki
                  uluslararası tanımlayıcıdan okunur.
                </p>
              )}
            </Blok>

            <Blok baslik="Yörünge ve bakış">
              <Satir ad="Yükseklik">{sp ? ondalik(sp.altKm, 1) + ' km' : '—'}</Satir>
              <Satir ad="Alt nokta">{sp ? sp.latDeg.toFixed(2) + '° · ' + sp.lonDeg.toFixed(2) + '°' : '—'}</Satir>
              <Satir ad="Nadir açısı">
                {nadir === null ? <span className="text-ops-faint">istasyon görüş dışında</span> : ondalik(nadir, 1) + '°'}
              </Satir>
              <Satir ad="Eğim">{ondalik(sat.inclinationDeg, 2)}°</Satir>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Nadir açısı, uydunun tam altına bakan yönden ne kadar saptığını söyler. Sıfır derece doğrudan aşağı bakmak
                demektir; açı büyüdükçe bakış yana eğilir.
              </p>
            </Blok>

            <Blok baslik="Uydunun geçtiği yerler" className="col-span-2">
              <Satir ad="Şu an">{suAn}</Satir>
              <div className="mt-2 grid grid-cols-2 gap-x-10 max-h-[150px] overflow-y-auto pr-1">
                {bolgeler.map((b, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 text-[13px] py-[3px] border-b border-ops-line/40">
                    <span className={i === 0 ? 'text-ops-text' : 'text-ops-dim'}>{b.ad}</span>
                    <span className="num text-[12px] text-ops-faint shrink-0">
                      {saatDk(b.girisMs)}
                      {b.cikisMs > b.girisMs ? ' – ' + saatDk(b.cikisMs) : ''}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-ops-faint leading-snug mt-2">
                Önümüzdeki {Math.round(Math.min(sat.periodMin, 100))} dakika boyunca yer izinin geçeceği bölgeler. Saatler UTC.
              </p>
            </Blok>
          </div>
        </div>
      </div>
    </div>
  );
}
