import { useEffect, useRef } from 'react';
import { useConsole } from '../store';
import { COLOR_VISION_LABELS, SCALE_STEPS, buildPalette, contrastRatio, type ColorVision } from '../ui/a11y';

/**
 * Erişilebilirlik ayar penceresi — üst şeritteki `ERİŞİLEBİLİRLİK` düğmesi ya da `A`.
 *
 * Her ayarın yanında dayandığı kural yazılıdır (WCAG 2.2 / ISO 9241-171 /
 * ECSS-E-ST-10-11C) ki gözden geçirenler "neden var" sorusunu sormasın.
 * Sağ sütunda canlı palet ve ölçülen kontrast oranları görünür.
 */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint">{title}</div>
      {note && <div className="text-3xs text-ops-faint leading-snug mb-1">{note}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  note,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  note: string;
}) {
  return (
    <label className="flex items-start gap-2 py-[3px] cursor-pointer">
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[2px] accent-current"
      />
      <span className="flex-1">
        <span className="text-[12px] text-ops-text">{label}</span>
        <span className="block text-3xs text-ops-faint leading-snug">{note}</span>
      </span>
    </label>
  );
}

const SWATCHES: { key: 'nominal' | 'soft' | 'warn' | 'hard' | 'ai' | 'text' | 'dim'; label: string }[] = [
  { key: 'nominal', label: 'nominal / bilgi' },
  { key: 'soft', label: 'yumuşak / düşük' },
  { key: 'warn', label: 'orta' },
  { key: 'hard', label: 'sert / yüksek' },
  { key: 'ai', label: 'AI türetilmiş' },
  { key: 'text', label: 'metin' },
  { key: 'dim', label: 'ikincil metin' },
];

export default function AccessibilityPanel() {
  const open = useConsole((s) => s.a11yOpen);
  const setOpen = useConsole((s) => s.setA11yOpen);
  const a11y = useConsole((s) => s.a11y);
  const setA11y = useConsole((s) => s.setA11y);
  const reset = useConsole((s) => s.resetA11y);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const pal = buildPalette(a11y);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Erişilebilirlik ayarları"
        onClick={(e) => e.stopPropagation()}
        className="card-in w-[820px] max-w-[calc(96vw/var(--ui-scale,1))] max-h-[calc(88vh/var(--ui-scale,1))] bg-ops-panel border border-ops-line2 shadow-2xl flex flex-col"
      >
        <div className="flex items-center gap-3 px-3 py-2 border-b border-ops-line2">
          <span className="num text-[14px] font-semibold text-ops-text">ERİŞİLEBİLİRLİK</span>
          <span className="text-3xs text-ops-faint tracking-[0.1em]">
            ECSS-E-ST-10-11C · ISO 9241-171 · WCAG 2.2 AA · ayarlar bu tarayıcıda saklanır
          </span>
          <button
            ref={firstRef}
            onClick={() => setOpen(false)}
            className="ml-auto text-ops-dim hover:text-ops-text text-[13px] leading-none px-1"
            title="Kapat (Esc)"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-[1.3fr_1fr] gap-px flex-1 min-h-0 overflow-hidden">
          <div className="px-3 py-2 overflow-y-auto border-r border-ops-line">
            <Section title="Kontrast" note="WCAG 1.4.3 / 1.4.6 — normal ≥ 4.5:1, yüksek ≥ 7:1. ISO 11064: karanlık kontrol odası için koyu zemin korunur.">
              <div className="flex gap-[3px]">
                {(['normal', 'high'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setA11y({ contrast: c })}
                    aria-pressed={a11y.contrast === c}
                    className={
                      'num text-2xs px-3 py-[3px] border tracking-[0.08em] ' +
                      (a11y.contrast === c ? 'border-ops-text text-ops-text bg-ops-sunken' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
                    }
                  >
                    {c === 'normal' ? 'STANDART' : 'YÜKSEK KONTRAST'}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              title="Renk görme"
              note="WCAG 1.4.1: renk hiçbir yerde tek başına anlam taşımaz (▲ ◆ glifleri, şiddet çubuğu, durum sözcükleri). Paletler Okabe–Ito güvenli setinden türetilmiştir."
            >
              <div className="flex flex-col gap-[2px]">
                {(Object.keys(COLOR_VISION_LABELS) as ColorVision[]).map((cv) => (
                  <button
                    key={cv}
                    onClick={() => setA11y({ colorVision: cv })}
                    aria-pressed={a11y.colorVision === cv}
                    className={
                      'text-left px-2 py-[3px] border flex items-center gap-3 ' +
                      (a11y.colorVision === cv ? 'border-ops-text bg-ops-sunken' : 'border-ops-line2 hover:bg-white/[0.03]')
                    }
                  >
                    <span className="num text-[12px] text-ops-text w-[110px]">{COLOR_VISION_LABELS[cv].label}</span>
                    <span className="text-3xs text-ops-faint flex-1">{COLOR_VISION_LABELS[cv].note}</span>
                    <span className="flex gap-[2px]">
                      {(['nominal', 'soft', 'warn', 'hard', 'ai'] as const).map((k) => (
                        <span key={k} className="inline-block w-[10px] h-[10px]" style={{ background: buildPalette({ ...a11y, colorVision: cv })[k] }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Arayüz ölçeği" note="WCAG 1.4.4 — %200'e kadar içerik kaybı olmadan. Küre ve şeritler yeniden boyutlanır.">
              <div className="flex gap-[3px] items-center">
                {SCALE_STEPS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setA11y({ scale: s })}
                    aria-pressed={a11y.scale === s}
                    className={
                      'num text-2xs px-[8px] py-[3px] border ' +
                      (a11y.scale === s ? 'border-ops-nominal text-ops-nominal bg-ops-nominal/10' : 'border-ops-line2 text-ops-dim hover:text-ops-text')
                    }
                  >
                    {Math.round(s * 100)}%
                  </button>
                ))}
                <span className="text-3xs text-ops-faint ml-2">Ctrl + / Ctrl − de çalışır</span>
              </div>
            </Section>

            <Section title="Davranış">
              <Toggle
                on={a11y.reduceMotion}
                onChange={(v) => setA11y({ reduceMotion: v })}
                label="Hareketi azalt"
                note="WCAG 2.3.3 — kart animasyonu ve kamera sönümlemesi kapanır; sistem tercihi (prefers-reduced-motion) açılışta okunur."
              />
              <Toggle
                on={a11y.boldText}
                onChange={(v) => setA11y({ boldText: v })}
                label="Kalın yazı"
                note="Düşük görme keskinliği için tüm metin 600 ağırlığa çıkar, küçük etiketler 700."
              />
              <Toggle
                on={a11y.patternCoding}
                onChange={(v) => setA11y({ patternCoding: v })}
                label="Desen kodlaması"
                note="Alarm kartlarının zeminine şiddete göre çizgi deseni, AI kaynaklı kartlara noktalı kenar eklenir — ECSS-E-ST-10-11C: renk yedeklenir."
              />
              <Toggle
                on={a11y.alwaysFocusRing}
                onChange={(v) => setA11y({ alwaysFocusRing: v })}
                label="Odak halkası her zaman görünür"
                note="WCAG 2.4.7 — fareyle tıklanan düğmelerde de odak çerçevesi kalır."
              />
              <Toggle
                on={a11y.announceAlarms}
                onChange={(v) => setA11y({ announceAlarms: v })}
                label="Alarmları ekran okuyucuya duyur"
                note="aria-live bölgesi: yeni alarm metni, şiddeti ve kaynağı okunur. Ekranda görünmez."
              />
              <Toggle
                on={a11y.audioAlerts}
                onChange={(v) => setA11y({ audioAlerts: v })}
                label="Sesli uyarı (orta / yüksek şiddet)"
                note="WebAudio ile üretilen kısa ton; yüksek şiddette çift ton. Ses dosyası ve ağ isteği yok. ISO 11064-5: işitsel uyarı görsel uyarıyı tamamlar."
              />
            </Section>
          </div>

          <div className="px-3 py-2 overflow-y-auto">
            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mb-1">Canlı palet · ölçülen kontrast</div>
            <div className="text-3xs text-ops-faint leading-snug mb-2">
              Panel zemini ({pal.panel}) üzerinde WCAG 2.x kontrast oranı. AA metin ≥ 4.5, AA büyük metin / grafik ≥ 3.0, AAA ≥ 7.0.
            </div>
            {SWATCHES.map((s) => {
              const r = contrastRatio(pal[s.key], pal.panel);
              const grade = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-büyük' : '—';
              return (
                <div key={s.key} className="flex items-center gap-2 py-[2px] text-[11px]">
                  <span className="inline-block w-[14px] h-[14px] border border-ops-line2" style={{ background: pal[s.key] }} />
                  <span className="text-ops-dim w-[110px]">{s.label}</span>
                  <span className="num text-ops-faint w-[64px]">{pal[s.key]}</span>
                  <span className="num text-ops-text w-[44px] text-right">{r.toFixed(1)}:1</span>
                  <span className={'num text-3xs ' + (r >= 4.5 ? 'text-ops-nominal' : r >= 3 ? 'text-ops-soft' : 'text-ops-hard')}>{grade}</span>
                </div>
              );
            })}

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">Örnek alarm kartı</div>
            <div className="border border-ops-line">
              <div className="px-2 py-1.5 border-b border-ops-line border-l-[3px] border-l-ops-hard sev-pattern-3">
                <div className="flex items-center gap-2">
                  <span className="num text-[12px] font-semibold text-ops-hard">TM[5,4]</span>
                  <span className="text-3xs uppercase tracking-[0.1em] text-ops-hard">yüksek</span>
                  <span className="ml-auto text-3xs tracking-[0.1em] text-ops-hard">▲ ST[12] LİMİT</span>
                </div>
                <div className="text-[11px] mt-[2px] text-ops-text">ch_11 SERT ÜST limit ihlali</div>
              </div>
              <div className="px-2 py-1.5 border-l-[3px] border-l-ops-ai src-ai sev-pattern-1">
                <div className="flex items-center gap-2">
                  <span className="num text-[12px] font-semibold text-ops-soft">TM[5,2]</span>
                  <span className="text-3xs uppercase tracking-[0.1em] text-ops-soft">düşük</span>
                  <span className="ml-auto text-3xs tracking-[0.1em] text-ops-ai">◆ AI TÜRETİLMİŞ</span>
                </div>
                <div className="text-[11px] mt-[2px] text-ops-dim">AI izleme — SS3 rekonstrüksiyon hatası yükseliyor</div>
              </div>
            </div>

            <div className="text-3xs uppercase tracking-[0.16em] text-ops-faint mt-3 mb-1">Klavye</div>
            <div className="text-3xs text-ops-dim leading-relaxed">
              <div><span className="num text-ops-text">A</span> bu pencere · <span className="num text-ops-text">P</span> paket denetleyici · <span className="num text-ops-text">M</span> 3B/2B harita</div>
              <div><span className="num text-ops-text">1 2 3</span> senaryo · <span className="num text-ops-text">N</span> nominal · <span className="num text-ops-text">L T</span> küre çerçevesi · <span className="num text-ops-text">F</span> takip · <span className="num text-ops-text">0</span> hız 1×</div>
              <div><span className="num text-ops-text">Esc</span> açık pencereyi kapatır · <span className="num text-ops-text">Tab</span> ile tüm düğmeler gezilir</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-t border-ops-line2">
          <span className="text-3xs text-ops-faint">Ayarlar yalnızca bu konsolu etkiler; telemetri, limitler ve paketler değişmez.</span>
          <button onClick={reset} className="ml-auto num text-2xs px-3 py-[3px] border border-ops-line2 text-ops-dim hover:text-ops-text">
            VARSAYILANA DÖN
          </button>
          <button onClick={() => setOpen(false)} className="num text-2xs px-3 py-[3px] border border-ops-nominal text-ops-nominal hover:bg-ops-nominal/10">
            KAPAT
          </button>
        </div>
      </div>
    </div>
  );
}
