import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { useConsole } from '../store';
import { TOUR_STEPS, audioFor } from './tourScript';
import { useTour } from './tourStore';

/**
 * Tanitim turu katmani (stant / kiosk).
 *
 * Her adim dort asamada oynar; amac izleyicinin panelin konsolda NEREDE
 * durdugunu gormesi:
 *   1. return  — onceki panel ekrandaki yerine geri doner, arka plan netlesir.
 *   2. locate  — canli konsol uzerinde hedef cercevesi yeni panele kayar ve
 *                kilitlenir; cevresi kararir, panelin adi cercevenin yaninda.
 *   3. raise / show — panelin goruntusu yerinden hafifce kalkar, ortaya ucar;
 *                arka plan bulaniklasir. Eski yerinde kesikli bir "yuva"
 *                kalir ve yuvadan panele bir baglanti cizgisi cekilir.
 *   4. show    — aciklama karti, "buraya bakin" ipucu, ses / sure.
 *
 * Goruntu html2canvas ile alinir (kure `preserveDrawingBuffer: true`).
 * Canli bilesen klonlanmaz: kure ve seritler ikinci kez baglanirsa WebGL
 * baglami ve performans sorunu cikar. Bu katman `data-tour-overlay` ile
 * isaretlidir ve goruntuye girmez.
 *
 * Tur renkleri konsolun siddet renklerinden (yesil/sari/turuncu/kirmizi/mor)
 * bilerek ayri bir camgobegidir: izleyici vurguyu alarmla karistirmasin.
 */

type Rect = { left: number; top: number; width: number; height: number };
type Phase = 'idle' | 'return' | 'fade' | 'locate' | 'lift' | 'raise' | 'show';
type Layout = 'bottom' | 'side' | 'wide';

interface Shot {
  bg: string;
  panel: string;
  from: Rect;
}

/** Animasyon sureleri (ms). */
const T = {
  ret: 520,
  fade: 260,
  move: 750,
  captureAfter: 800,
  lockMin: 1600,
  raise: 260,
  fly: 950,
};

const ACCENT = '61 217 235';
const acc = (a = 1) => `rgb(${ACCENT} / ${a})`;
const DIM = 'rgb(2 5 8 / 0.74)';
const INK = '#F3F8FB';
const INK_SOFT = '#D2DEE6';

const SHOW_PHASES: Phase[] = ['show'];
const CHIP_PHASES: Phase[] = ['locate', 'lift', 'raise'];

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Serit gibi cok genis ve alcak paneller buyutulunce de okunmaz: yakin plan eklenir. */
function stripScale(r: Rect, vw: number) {
  return Math.min((vw * 0.96) / r.width, 1.9);
}

function layoutFor(r: Rect, vw: number): Layout {
  const aspect = r.width / r.height;
  if (aspect > 6 && r.height * stripScale(r, vw) < 70) return 'wide';
  if (aspect < 1.15) return 'side';
  return 'bottom';
}

interface Placement {
  cx: number;
  cy: number;
  scale: number;
}

function placeFor(layout: Layout, r: Rect, vw: number, vh: number): Placement {
  if (layout === 'side') {
    return { cx: vw * 0.33, cy: vh * 0.5, scale: Math.min((vw * 0.56) / r.width, (vh * 0.9) / r.height, 1.9) };
  }
  if (layout === 'wide') {
    return { cx: vw / 2, cy: vh * 0.12, scale: stripScale(r, vw) };
  }
  return { cx: vw / 2, cy: vh * 0.36, scale: Math.min((vw * 0.92) / r.width, (vh * 0.6) / r.height, 1.9) };
}

async function capture(target: HTMLElement, panelScale: number): Promise<Shot> {
  const root = document.getElementById('root') ?? document.body;
  const canvas = await html2canvas(root, {
    backgroundColor: null,
    logging: false,
    scale: panelScale,
    ignoreElements: (el) => el.hasAttribute('data-tour-overlay'),
  });
  const rr = root.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  const kx = canvas.width / rr.width;
  const ky = canvas.height / rr.height;

  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(tr.width * kx));
  crop.height = Math.max(1, Math.round(tr.height * ky));
  crop
    .getContext('2d')!
    .drawImage(canvas, (tr.left - rr.left) * kx, (tr.top - rr.top) * ky, crop.width, crop.height, 0, 0, crop.width, crop.height);

  // Arka plan zaten bulaniklasacak: ekran cozunurlugunde yeter.
  const dpr = window.devicePixelRatio || 1;
  const bg = document.createElement('canvas');
  bg.width = Math.round(rr.width * dpr);
  bg.height = Math.round(rr.height * dpr);
  bg.getContext('2d')!.drawImage(canvas, 0, 0, bg.width, bg.height);

  return {
    bg: bg.toDataURL('image/jpeg', 0.8),
    panel: crop.toDataURL('image/png'),
    from: { left: tr.left, top: tr.top, width: tr.width, height: tr.height },
  };
}

const nextFrames = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const CORNERS: { pos: React.CSSProperties; bw: string; dx: string; dy: string }[] = [
  { pos: { left: -9, top: -9 }, bw: '3px 0 0 3px', dx: '-16px', dy: '-16px' },
  { pos: { right: -9, top: -9 }, bw: '3px 3px 0 0', dx: '16px', dy: '-16px' },
  { pos: { left: -9, bottom: -9 }, bw: '0 0 3px 3px', dx: '-16px', dy: '16px' },
  { pos: { right: -9, bottom: -9 }, bw: '0 3px 3px 0', dx: '16px', dy: '16px' },
];

const KEYFRAMES = `
@keyframes tour-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes tour-lock{0%{transform:translate(var(--dx),var(--dy));opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}
@keyframes tour-pulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
@keyframes tour-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes tour-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
`;

export default function TourOverlay() {
  const active = useTour((s) => s.active);
  const stepIndex = useTour((s) => s.stepIndex);
  const stop = useTour((s) => s.stop);
  const reduceMotion = useConsole((s) => s.a11y.reduceMotion);

  const [phase, setPhase] = useState<Phase>('idle');
  const [ring, setRing] = useState<Rect | null>(null);
  const [ringAnim, setRingAnim] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [stepMs, setStepMs] = useState(0);
  /** Kartta gosterilen adim: kart kaybolurken siradaki adimin metni gorunmesin. */
  const [cardIndex, setCardIndex] = useState(0);
  const shotRef = useRef<Shot | null>(null);
  const ringRef = useRef<Rect | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  shotRef.current = shot;
  ringRef.current = ring;

  const step = TOUR_STEPS[stepIndex];

  // Tur kapaninca her seyi birak.
  useEffect(() => {
    if (active) return;
    setShot(null);
    setRing(null);
    setRingAnim(false);
    setPhase('idle');
  }, [active]);

  // Esc turu kapatir.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stop();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, stop]);

  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const m = (ms: number) => (reduceMotion ? 0 : ms);
    const sleep = (ms: number) =>
      new Promise<void>((r) => {
        timer = setTimeout(r, ms);
      });
    const advance = () => {
      if (!cancelled) useTour.getState().next();
    };

    (async () => {
      // 1) Onceki panel yerine doner, sonra goruntu kalkar (canli konsol gorunur).
      if (shotRef.current) {
        setPhase('return');
        await sleep(m(T.ret));
        if (cancelled) return;
        setPhase('fade');
        await sleep(m(T.fade));
        if (cancelled) return;
      }
      setShot(null);
      step.onEnter?.();
      await sleep(120);
      if (cancelled) return;

      const target = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (!target || target.getBoundingClientRect().width < 2) {
        console.warn(`[tur] Hedef bulunamadı: data-tour="${step.id}" — adım atlanıyor.`);
        timer = setTimeout(advance, 400);
        return;
      }

      // 2) Hedef cercevesi kayar ve kilitlenir.
      const r0 = rectOf(target);
      const vw = window.innerWidth;
      const t0 = performance.now();
      setRingAnim(ringRef.current !== null && !reduceMotion);
      setRing(r0);
      setPhase('locate');
      await sleep(m(T.captureAfter));
      if (cancelled) return;

      let next: Shot;
      try {
        const wide = layoutFor(r0, vw) === 'wide';
        next = await capture(target, Math.max(wide ? 3 : 2, window.devicePixelRatio || 1));
      } catch (err) {
        console.warn('[tur] Ekran görüntüsü alınamadı:', err);
        timer = setTimeout(advance, 1000);
        return;
      }
      if (cancelled) return;
      const rest = m(T.lockMin) - (performance.now() - t0);
      if (rest > 0) {
        await sleep(rest);
        if (cancelled) return;
      }

      // 3) Panel yerinden kalkar ve ortaya ucar.
      setRing(next.from);
      setShot(next);
      setPhase('lift');
      await nextFrames();
      if (cancelled) return;
      setPhase('raise');
      await sleep(m(T.raise));
      if (cancelled) return;
      setCardIndex(stepIndex);
      setPhase('show');

      // 4) Anlatim: ses varsa ses kadar, yoksa durationMs.
      const hold = (ms: number) => {
        setStepMs(ms);
        timer = setTimeout(advance, ms);
      };
      const src = audioFor(step.id);
      if (!src) {
        hold(step.durationMs);
        return;
      }
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = advance;
      audio.onerror = () => hold(step.durationMs);
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration)) setStepMs(audio.duration * 1000);
      };
      // Tarayici etkilesim olmadan sesi engellerse tur sessiz ama altyazili surer.
      audio.play().catch(() => hold(step.durationMs));
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [active, stepIndex, step, reduceMotion]);

  if (!active || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const showing = SHOW_PHASES.includes(phase);
  const flying = phase === 'show';
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  const origin = shot?.from ?? ring;
  const layout: Layout = origin ? layoutFor(origin, vw) : 'bottom';
  const place = shot ? placeFor(layout, shot.from, vw, vh) : null;

  // --- Hedef cercevesi (yuva) ---
  let ringEl: React.ReactNode = null;
  if (ring) {
    const P = 5;
    const left = Math.max(2, ring.left - P);
    const top = Math.max(2, ring.top - P);
    const width = Math.min(vw - 2, ring.left + ring.width + P) - left;
    const height = Math.min(vh - 2, ring.top + ring.height + P) - top;
    const slot = flying;
    const chipBelow = top < 70;
    ringEl = (
      <div
        className="absolute rounded-[4px] pointer-events-none"
        style={{
          left,
          top,
          width,
          height,
          zIndex: 2,
          border: `2px ${slot ? 'dashed' : 'solid'} ${acc(slot ? 0.75 : 1)}`,
          background: slot ? DIM : 'transparent',
          boxShadow: `0 0 26px 2px ${acc(slot ? 0.2 : 0.55)}, 0 0 0 200vmax ${DIM}`,
          opacity: phase === 'idle' ? 0 : 1,
          transition: [
            ringAnim ? `left ${dur(T.move)}ms cubic-bezier(.65,0,.35,1)` : '',
            ringAnim ? `top ${dur(T.move)}ms cubic-bezier(.65,0,.35,1)` : '',
            ringAnim ? `width ${dur(T.move)}ms cubic-bezier(.65,0,.35,1)` : '',
            ringAnim ? `height ${dur(T.move)}ms cubic-bezier(.65,0,.35,1)` : '',
            `background-color ${dur(400)}ms ease`,
            `box-shadow ${dur(400)}ms ease`,
            `opacity ${dur(300)}ms ease`,
          ]
            .filter(Boolean)
            .join(','),
        }}
      >
        {/* Kilitlenme koseleri: her adimda disaridan iceri kapanir. */}
        {CORNERS.map((c, i) => (
          <span
            key={`${step.id}-${i}`}
            className="absolute w-[24px] h-[24px]"
            style={
              {
                ...c.pos,
                borderStyle: 'solid',
                borderColor: acc(1),
                borderWidth: c.bw,
                '--dx': c.dx,
                '--dy': c.dy,
                animation: `tour-lock ${dur(520)}ms cubic-bezier(.2,.9,.3,1.2) ${dur(ringAnim ? T.move * 0.55 : 0)}ms both`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* Nabiz: yalnizca kilitlenme sirasinda. */}
        {phase === 'locate' && !reduceMotion && (
          <span
            className="absolute inset-[-2px] rounded-[4px]"
            style={{ border: `2px solid ${acc(1)}`, animation: `tour-pulse 1100ms ease-out ${ringAnim ? T.move : 0}ms infinite` }}
          />
        )}
        {/* Hedef etiketi */}
        <div
          className="absolute left-0 flex items-center gap-2 whitespace-nowrap px-3 py-[5px] font-semibold uppercase tracking-[0.12em] text-[15px]"
          style={{
            [chipBelow ? 'top' : 'bottom']: 'calc(100% + 10px)',
            background: acc(1),
            color: '#02161A',
            boxShadow: `0 6px 24px ${acc(0.35)}`,
            opacity: CHIP_PHASES.includes(phase) ? 1 : 0,
            // Cerceve yeni panele varmadan etiket gorunmesin (yanlis panelin adi gibi durur).
            transition: `opacity ${dur(250)}ms ease ${phase === 'locate' && ringAnim ? dur(T.move) : 0}ms`,
          }}
        >
          <span className="num">{pad2(stepIndex + 1)}</span>
          <span style={{ opacity: 0.55 }}>·</span>
          <span>{step.title}</span>
        </div>
      </div>
    );
  }

  // --- Buyuyen panel ---
  let panelEl: React.ReactNode = null;
  let detailEl: React.ReactNode = null;
  let lineEl: React.ReactNode = null;
  if (shot && place) {
    const { left, top, width, height } = shot.from;
    const dx = place.cx - (left + width / 2);
    const dy = place.cy - (top + height / 2);
    let transform = 'none';
    let transition = 'none';
    if (phase === 'raise') {
      transform = 'translateY(-6px) scale(1.035)';
      transition = `transform ${dur(T.raise)}ms ease-out, box-shadow ${dur(T.raise)}ms ease-out`;
    } else if (phase === 'show') {
      transform = `translate(${dx}px, ${dy}px) scale(${place.scale})`;
      transition = `transform ${dur(T.fly)}ms cubic-bezier(.16,1,.3,1), filter ${dur(T.fly)}ms ease`;
    } else if (phase === 'return' || phase === 'fade') {
      transition = `transform ${dur(T.ret)}ms cubic-bezier(.55,0,.75,.2), opacity ${dur(T.fade)}ms ease`;
    }
    const lifted = phase === 'raise' || phase === 'show';
    panelEl = (
      <div
        className="absolute rounded-[3px]"
        style={{
          left,
          top,
          width,
          height,
          zIndex: 4,
          backgroundImage: `url(${shot.panel})`,
          backgroundSize: '100% 100%',
          transformOrigin: 'center center',
          transform,
          transition,
          opacity: phase === 'fade' ? 0 : 1,
          filter: phase === 'show' ? 'brightness(1.14) contrast(1.12) saturate(1.1)' : 'none',
          boxShadow: lifted
            ? `0 0 0 1.5px ${acc(1)}, 0 0 44px ${acc(0.35)}, 0 28px 80px rgb(0 0 0 / 0.75)`
            : 'none',
        }}
      />
    );

    // Yuvadan panele baglanti cizgisi.
    if (phase === 'show') {
      const ox = left + width / 2;
      const oy = top + height / 2;
      lineEl = (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 3 }} aria-hidden="true">
          <line
            x1={ox}
            y1={oy}
            x2={place.cx}
            y2={place.cy}
            pathLength={1}
            stroke={acc(0.85)}
            strokeWidth={2.5}
            strokeDasharray="1"
            style={{ animation: `tour-draw ${dur(T.fly)}ms cubic-bezier(.16,1,.3,1) both` }}
          />
          <circle cx={ox} cy={oy} r={6} fill={acc(1)} />
          <circle cx={ox} cy={oy} r={12} fill="none" stroke={acc(0.5)} strokeWidth={2} />
        </svg>
      );
    }

    // Genis seritler icin iki parcali yakin plan.
    if (layout === 'wide' && phase === 'show') {
      // Iki parca %10 ust uste biner: ortadaki alan ikiye bolunse de birinde tam okunur.
      const PART = 0.55;
      const stripH = height * place.scale;
      const partW = width * PART;
      const top0 = place.cy + stripH / 2 + 34;
      const avail = vh * 0.7 - top0;
      const GAP = 36;
      const hs = Math.min((vw * 0.92) / partW, 3, (avail - GAP) / (2 * height));
      const w = partW * hs;
      const h = height * hs;
      detailEl = (
        <>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: (vw - w) / 2,
                top: top0 + i * (h + GAP),
                width: w,
                height: h,
                zIndex: 5,
                backgroundImage: `url(${shot.panel})`,
                backgroundSize: `${width * hs}px ${height * hs}px`,
                backgroundPosition: `${i === 0 ? 0 : -(width - partW) * hs}px 0`,
                filter: 'brightness(1.14) contrast(1.12) saturate(1.1)',
                boxShadow: `0 0 0 1.5px ${acc(0.7)}, 0 18px 50px rgb(0 0 0 / 0.7)`,
                animation: `tour-in ${dur(450)}ms ease-out ${dur(T.fly * 0.6 + i * 120)}ms both`,
              }}
            >
              <span
                className="absolute -top-[22px] left-0 text-[12px] uppercase tracking-[0.16em] font-semibold"
                style={{ color: acc(1) }}
              >
                Yakın plan · {i === 0 ? 'sol' : 'sağ'} bölüm
              </span>
            </div>
          ))}
        </>
      );
    }
  }

  // --- Aciklama karti ---
  const side = layout === 'side';
  const cs = TOUR_STEPS[cardIndex] ?? step;
  const card = (
    <div
      className="absolute"
      aria-live="polite"
      style={{
        zIndex: 6,
        ...(side
          ? { right: '3vw', top: '50%', width: '31vw', transform: 'translateY(-50%)' }
          : { left: '50%', bottom: '3vh', width: 'min(1180px, 92vw)', transform: 'translateX(-50%)' }),
        background: 'rgb(6 10 14 / 0.95)',
        border: `1px solid ${acc(0.35)}`,
        borderTop: `4px solid ${acc(1)}`,
        boxShadow: `0 20px 60px rgb(0 0 0 / 0.6), 0 0 40px ${acc(0.12)}`,
        padding: '18px 26px 20px',
        opacity: showing ? 1 : 0,
        transition: `opacity ${dur(showing ? 450 : 200)}ms ease ${dur(showing ? 250 : 0)}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] uppercase tracking-[0.2em] font-semibold" style={{ color: acc(1) }}>
            AzSonra · tanıtım turu
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] px-2 py-[1px] border border-white/30 text-white/70">
            simüle veri
          </span>
        </div>
        <span className="num text-[16px]" style={{ color: INK_SOFT }}>
          <span style={{ color: INK }} className="text-[22px] font-semibold">
            {pad2(cardIndex + 1)}
          </span>{' '}
          / {pad2(TOUR_STEPS.length)}
        </span>
      </div>

      {/* Adim seridi */}
      <div className="flex gap-[5px] mt-3">
        {TOUR_STEPS.map((s, i) => (
          <div key={s.id} className="flex-1 min-w-0">
            <div
              className="h-[6px]"
              style={{
                background: i < cardIndex ? acc(0.5) : i === cardIndex ? acc(1) : 'rgb(255 255 255 / 0.13)',
                boxShadow: i === cardIndex ? `0 0 12px ${acc(0.8)}` : 'none',
              }}
            />
            {!side && (
              <div
                className="text-[11px] mt-[4px] truncate"
                style={{ color: i === cardIndex ? INK : 'rgb(255 255 255 / 0.42)', fontWeight: i === cardIndex ? 600 : 400 }}
              >
                {s.short}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-[34px] leading-[1.15] font-semibold mt-3" style={{ color: INK }}>
        {cs.title}
      </div>
      <div className="text-[21px] leading-[1.45] mt-2" style={{ color: INK_SOFT }}>
        {cs.caption}
      </div>
      <div
        className="mt-3 px-4 py-[10px] flex gap-3 items-baseline"
        style={{ background: acc(0.1), borderLeft: `4px solid ${acc(1)}` }}
      >
        <span className="text-[13px] uppercase tracking-[0.16em] font-bold shrink-0" style={{ color: acc(1) }}>
          ▸ Buraya bakın
        </span>
        <span className="text-[19px] leading-[1.4]" style={{ color: INK }}>
          {cs.look}
        </span>
      </div>

      {/* Adim ilerleme cubugu */}
      <div className="h-[4px] mt-4 overflow-hidden" style={{ background: 'rgb(255 255 255 / 0.1)' }}>
        {showing && stepMs > 0 && (
          <div
            key={`${cs.id}-${stepMs}`}
            className="h-full origin-left"
            style={{ background: acc(1), animation: `tour-progress ${stepMs}ms linear forwards` }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div
      data-tour-overlay=""
      data-tour-phase={phase}
      data-tour-step={step.id}
      className="fixed inset-0 z-[1000] select-none overflow-hidden"
      role="dialog"
      aria-label="Tanıtım turu"
    >
      <style>{KEYFRAMES}</style>

      {/* Bulaniklasan arka plan (yalnizca panel kalkarken ve anlatimda). */}
      {shot && (
        <img
          src={shot.bg}
          alt=""
          className="absolute inset-0 w-full h-full object-fill"
          style={{
            zIndex: 1,
            filter: flying ? 'blur(11px) saturate(0.7)' : 'blur(0px) saturate(1)',
            transform: flying ? 'scale(1.03)' : 'none',
            opacity: phase === 'fade' ? 0 : 1,
            transition: `filter ${dur(flying ? T.fly : T.ret)}ms ease, transform ${dur(flying ? T.fly : T.ret)}ms ease, opacity ${dur(T.fade)}ms ease`,
          }}
        />
      )}

      {ringEl}
      {lineEl}
      {panelEl}
      {detailEl}
      {card}

      <div
        className="absolute top-4 right-4 flex items-center gap-3"
        style={{ zIndex: 7, opacity: showing ? 1 : 0, transition: `opacity ${dur(300)}ms ease` }}
      >
        <span className="text-[13px]" style={{ color: INK_SOFT }}>
          G: tur · Esc: çık
        </span>
        <button
          onClick={stop}
          className="px-4 py-2 text-[15px] font-semibold transition-colors"
          style={{ background: 'rgb(6 10 14 / 0.9)', color: INK, border: `1px solid ${acc(0.6)}` }}
        >
          Turdan çık · konsolu keşfet
        </button>
      </div>
    </div>
  );
}
