import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { useConsole } from '../store';
import { TOURS, audioFor } from './tourScript';
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
  ret: 260,
  fade: 140,
  move: 620,
  captureAfter: 260,
  lockMin: 760,
  /** Canli adimda cerceve kilitlenme suresi: fotograf beklenmedigi icin kisa. */
  liveLock: 260,
  /** Canli panelin yerinde buyume suresi. */
  grow: 460,
  raise: 160,
  fly: 850,
};

/** Cerceve hareketi: adimlar arasi kayma ve panelle birlikte buyume. */
const HALKA_KAYMA = { ms: T.move, egri: 'cubic-bezier(.65,0,.35,1)' };
const HALKA_BUYUME = { ms: T.grow, egri: 'cubic-bezier(.2,.8,.2,1)' };

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

/** Alt karttan once kalan dikey alan (ust kenar, alt kenar). */
function freeBand(vh: number, cardH: number) {
  const top = vh * 0.03;
  const bottom = vh - vh * 0.03 - cardH - Math.max(14, vh * 0.02);
  return { top, bottom: Math.max(top + 80, bottom) };
}

function placeFor(layout: Layout, r: Rect, vw: number, vh: number, cardH: number): Placement {
  if (layout === 'side') {
    return { cx: vw * 0.33, cy: vh * 0.5, scale: Math.min((vw * 0.56) / r.width, (vh * 0.9) / r.height, 1.9) };
  }
  if (layout === 'wide') {
    return { cx: vw / 2, cy: vh * 0.12, scale: stripScale(r, vw) };
  }
  const band = freeBand(vh, cardH);
  const h = band.bottom - band.top;
  return {
    cx: vw / 2,
    cy: (band.top + band.bottom) / 2,
    scale: Math.min((vw * 0.92) / r.width, h / r.height, 1.9),
  };
}

/**
 * html2canvas yazinin taban cizgisini gizli bir 1x1 <img> ile olcer. Tailwind
 * preflight'i `img { display: block }` yaptigi icin bu resim alt satira duser,
 * olcum sasar ve tum yazilar goruntude birkac piksel asagi cizilir (rozet ve
 * dugme yazilari cerceveye biner). Kural yalnizca o olcum resmini hedefler.
 */
const METRIC_FIX_ID = 'tour-h2c-metric-fix';
function fixFontMetrics() {
  if (document.getElementById(METRIC_FIX_ID)) return;
  const s = document.createElement('style');
  s.id = METRIC_FIX_ID;
  s.textContent = 'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"]{display:inline!important}';
  document.head.appendChild(s);
}

async function capture(target: HTMLElement, panelScale: number): Promise<Shot> {
  fixFontMetrics();
  const root = document.getElementById('root') ?? document.body;
  const canvas = await html2canvas(root, {
    backgroundColor: null,
    logging: false,
    scale: panelScale,
    ignoreElements: (el) => el.hasAttribute('data-tour-overlay'),
    // html2canvas metni tarayicidan birkac piksel asagi cizer; `truncate`
    // (overflow: hidden) kutularinda harflerin alti kesilir. Yalnizca kopyada ve
    // yalnizca gercekten sigan yazilarda kirpmayi kaldir.
    onclone: (doc) => {
      doc.querySelectorAll<HTMLElement>('.truncate').forEach((el) => {
        if (el.scrollWidth <= el.clientWidth + 1) el.style.overflow = 'visible';
      });
    },
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

/** Canli adimda kartin hangi yana gececegi (panel cok genisse null: kart altta). */
function liveSideFor(r: Rect, vw: number): 'left' | 'right' | null {
  if (r.width > vw * 0.62) return null;
  if (r.left + r.width < vw * 0.56) return 'right';
  if (r.left > vw * 0.44) return 'left';
  return null;
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
  const tourId = useTour((s) => s.tour);
  const steps = TOURS[tourId];
  const stop = useTour((s) => s.stop);
  const reduceMotion = useConsole((s) => s.a11y.reduceMotion);

  const [phase, setPhase] = useState<Phase>('idle');
  const [ring, setRing] = useState<Rect | null>(null);
  const [ringAnim, setRingAnim] = useState(false);
  /**
   * Cercevenin gecis suresi ve egrisi. Panel yerinde buyurken cerceve de AYNI
   * sure ve egriyle buyumeli; farkli olursa (eskiden 620 ms / farkli egri)
   * cerceve panelden ayrilip yuzlerce piksel kayiyordu.
   */
  const [ringGecis, setRingGecis] = useState(HALKA_KAYMA);
  const [shot, setShot] = useState<Shot | null>(null);
  const [stepMs, setStepMs] = useState(0);
  /** Kartta gosterilen adim: kart kaybolurken siradaki adimin metni gorunmesin. */
  const [cardIndex, setCardIndex] = useState(0);
  /** Kartin olculen yuksekligi: buyutulen panel kartin ustune yerlestirilir. */
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shotRef = useRef<Shot | null>(null);
  /** Canli adimda CSS ile buyutulen panel; adim bitince eski haline doner. */
  const zoomedRef = useRef<HTMLElement | null>(null);
  /** Buyurken kirpilmasin diye gecici olarak acilan ust kapsayicilar. */
  const clipRef = useRef<{ el: HTMLElement; overflow: string }[]>([]);
  const ringRef = useRef<Rect | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Siradaki adimin sesi onceden cozulur. Sesler derlemeye data URI olarak
   * gomulu; ilk calmada cozme ~0,8 sn suruyordu ve adimlar arasi sessizlik
   * buradan geliyordu. Onden yuklenince `play()` neredeyse aninda baslar.
   */
  const primedRef = useRef<Record<string, HTMLAudioElement>>({});
  shotRef.current = shot;
  ringRef.current = ring;

  const step = steps[stepIndex];

  /** Buyuyen panelin ust kapsayicilarindaki kirpmayi gecici olarak kaldirir. */
  function openClips(el: HTMLElement) {
    const root = document.getElementById('root');
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const o = getComputedStyle(p).overflow;
      if (o !== 'visible') {
        clipRef.current.push({ el: p, overflow: p.style.overflow });
        p.style.overflow = 'visible';
      }
    }
  }

  /** Buyutulen canli paneli eski haline dondurur. */
  function restoreZoom() {
    for (const c of clipRef.current) c.el.style.overflow = c.overflow;
    clipRef.current = [];
    const el = zoomedRef.current;
    if (!el) return;
    el.style.transform = '';
    el.style.transition = '';
    el.style.zIndex = '';
    el.style.transformOrigin = '';
    zoomedRef.current = null;
  }

  // Tur kapaninca her seyi birak.
  useEffect(() => {
    if (active) return;
    setShot(null);
    setRing(null);
    setRingAnim(false);
    setPhase('idle');
    primedRef.current = {};
  }, [active]);

  // Tur acilirken ilk iki adimin sesini onden coz: acilista bekleme olmasin.
  useEffect(() => {
    if (!active) return;
    for (const s of steps.slice(stepIndex, stepIndex + 2)) {
      if (primedRef.current[s.id]) continue;
      const src = audioFor(s.id);
      if (!src) continue;
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.load();
      primedRef.current[s.id] = a;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Kart yuksekligi ekran boyutuna ve metne gore degisir; olc.
  useEffect(() => {
    const el = cardRef.current;
    if (!active || !el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    setCardH(el.offsetHeight);
    return () => ro.disconnect();
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
    /** Cercevenin paneli izledigi dongu ve onu baslatan bekleme (asagida). */
    let takip: ReturnType<typeof setInterval> | undefined;
    let takipBaslangic: ReturnType<typeof setTimeout> | undefined;
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
      await sleep(80);
      if (cancelled) return;

      // Kapak adimi (acilis / kapanis): panel yok, kart ortada durur.
      if (step.kind === 'cover') {
        setRing(null);
        setRingAnim(false);
        setCardIndex(stepIndex);
        setPhase('show');
        await narrate();
        return;
      }

      const targetId = step.target ?? step.id;
      const target = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
      if (!target || target.getBoundingClientRect().width < 2) {
        console.warn(`[tur] Hedef bulunamadı: data-tour="${targetId}" — adım atlanıyor.`);
        timer = setTimeout(advance, 400);
        return;
      }

      // 2) Hedef cercevesi kayar ve kilitlenir.
      const r0 = rectOf(target);
      const vw = window.innerWidth;
      const t0 = performance.now();
      setRingAnim(ringRef.current !== null && !reduceMotion);
      setRingGecis(HALKA_KAYMA);
      setRing(r0);
      setPhase('locate');
      // Fotograf, cerceve kayarken cekilmeye baslar: overlay zaten kareye
      // girmiyor, bekleyip sonra cekmek adimlar arasina olu zaman katiyordu.
      const wide = layoutFor(r0, vw) === 'wide';
      const shotPromise =
        step.kind === 'live'
          ? null
          : // Olcek yukseldikce html2canvas belirgin yavasliyor; serit disinda 2 yeter.
            capture(target, Math.max(wide ? 2.5 : 2, window.devicePixelRatio || 1)).catch((err) => {
              console.warn('[tur] Ekran görüntüsü alınamadı:', err);
              return null;
            });
      await sleep(m(T.captureAfter));
      if (cancelled) return;

      // Canli adim: panel yerinde kalir ve oynamaya devam eder (kure doner,
      // seritler akar). Fotograf cekilmez; cerceve panelin uzerinde durur,
      // cevresi kararir. Adim boyunca `act` konsolu yonetebilir.
      if (step.kind === 'live') {
        // Canli adimda fotograf beklemesi yok: cerceve kilitlenince hemen basla.
        const rest0 = m(T.liveLock) - (performance.now() - t0);
        if (rest0 > 0) await sleep(rest0);
        if (cancelled) return;
        // Koreografi kart gelmeden baslar; izleyici beklemez.
        step.act?.({
          wait: (ms) => new Promise<void>((r) => setTimeout(r, reduceMotion ? 0 : ms)),
          alive: () => !cancelled,
        });

        // Panel yerinde CSS ile buyutulur: icerik canli oynamaya devam eder,
        // yazi da vektor olarak buyur (fotograf degil).
        const vh = window.innerHeight;
        const band = freeBand(vh, cardRef.current?.offsetHeight ?? 260);
        const sideFor = liveSideFor(r0, vw);
        const maxW = sideFor ? vw * 0.56 : vw * 0.92;
        const k = step.noZoom ? 1 : Math.min(maxW / r0.width, (band.bottom - band.top) / r0.height, 1.75);
        if (k > 1.04) {
          const cx = sideFor === 'right' ? vw * 0.3 : sideFor === 'left' ? vw * 0.7 : vw / 2;
          const cy = (band.top + band.bottom) / 2;
          const x = cx - (r0.left + r0.width / 2);
          const y = cy - (r0.top + r0.height / 2);
          zoomedRef.current = target;
          openClips(target);
          target.style.transition = `transform ${m(T.grow)}ms cubic-bezier(.2,.8,.2,1)`;
          target.style.transformOrigin = 'center center';
          target.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
          target.style.zIndex = '40';
          // Cerceve panelle birlikte buyur: ayni sure, ayni egri.
          setRingAnim(!reduceMotion);
          setRingGecis(HALKA_BUYUME);
          setRing({
            left: r0.left + x - (r0.width * (k - 1)) / 2,
            top: r0.top + y - (r0.height * (k - 1)) / 2,
            width: r0.width * k,
            height: r0.height * k,
          });
        }
        setCardIndex(stepIndex);
        setPhase('show');
        cerceveyiTakipEttir(target, m(T.grow) + 80);
        await narrate();
        return;
      }

      const next = await shotPromise;
      if (cancelled) return;
      if (!next) {
        timer = setTimeout(advance, 600);
        return;
      }
      const rest = m(T.lockMin) - (performance.now() - t0);
      if (rest > 0) {
        await sleep(rest);
        if (cancelled) return;
      }

      // 3) Panel yerinden kalkar ve ortaya ucar.
      setRing(next.from);
      setShot(next);
      setCardIndex(stepIndex);
      setPhase('lift');
      await nextFrames();
      if (cancelled) return;
      setPhase('raise');
      await sleep(m(T.raise));
      if (cancelled) return;
      setPhase('show');

      await narrate();
    })();

    // 4) Anlatim: ses varsa ses kadar, yoksa durationMs.
    async function narrate() {
      const hold = (ms: number) => {
        setStepMs(ms);
        timer = setTimeout(advance, ms);
      };
      // `?sessiz`: stantta iki monitorde iki tur ayni anda konusmasin diye bu
      // pencere yalnizca altyaziyla doner.
      const muted = new URLSearchParams(window.location.search).has('sessiz');
      const src = muted ? undefined : audioFor(step.id);
      if (!src) {
        hold(step.durationMs);
        return;
      }
      // Onden cozulmus ses varsa onu kullan; yoksa simdi olustur.
      const audio = primedRef.current[step.id] ?? new Audio(src);
      delete primedRef.current[step.id];
      try {
        audio.currentTime = 0;
      } catch {
        /* metadata henuz yoksa gerek yok */
      }
      audioRef.current = audio;
      audio.onended = advance;
      audio.onerror = () => hold(step.durationMs);
      const mark = () => {
        if (Number.isFinite(audio.duration)) setStepMs(audio.duration * 1000);
      };
      audio.onloadedmetadata = mark;
      mark();
      // Tarayici etkilesim olmadan sesi engellerse tur sessiz ama altyazili surer.
      audio.play().catch(() => hold(step.durationMs));
      if (!muted) prime(stepIndex + 1);
    }

    /**
     * Cerceveyi panele kilitler ve panelde kalmasini saglar.
     *
     * Cerceve bir kez hesaplanip birakildiginda, panel adim ORTASINDA boyut
     * degistirirse (bilgi panelinde senaryo ilerledikce icerik buyuyor, sekme
     * degisiyor, liste uzuyor) cerceve eski olcude kaliyor ve panelden kayiyor.
     * Burada panelin gercek yeri kisa araliklarla okunur; sadece gercekten
     * degistiyse cerceve guncellenir, o yuzden normalde hic is yapmaz.
     *
     * Buyume animasyonu bitmeden baslamaz: yoksa animasyonun ara karelerini
     * kovalar ve titrer.
     */
    function cerceveyiTakipEttir(target: HTMLElement, gecikme: number) {
      // Kendi zamanlayicisi: `timer` sesin / surenin zamanlayicisi, paylasilirsa
      // biri digerini iptal eder.
      takipBaslangic = setTimeout(() => {
        if (cancelled) return;
        // Duzeltmeler animasyonsuz olsun: cerceve panelin gerisinde kalmasin.
        setRingAnim(false);
        takip = setInterval(() => {
          if (cancelled || !target.isConnected) return;
          const r = rectOf(target);
          const o = ringRef.current;
          if (!o || Math.abs(o.left - r.left) > 1 || Math.abs(o.top - r.top) > 1 ||
              Math.abs(o.width - r.width) > 1 || Math.abs(o.height - r.height) > 1) {
            setRing(r);
          }
        }, 200);
      }, gecikme);
    }

    /** Verilen adimin sesini arka planda cozer (calmaz). */
    function prime(i: number) {
      const s = steps[i];
      if (!s || primedRef.current[s.id]) return;
      const src = audioFor(s.id);
      if (!src) return;
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.load();
      primedRef.current[s.id] = a;
    }

    return () => {
      cancelled = true;
      if (takipBaslangic) clearTimeout(takipBaslangic);
      if (takip) clearInterval(takip);
      step.leave?.();
      restoreZoom();
      if (timer) clearTimeout(timer);
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [active, tourId, stepIndex, step, reduceMotion]);

  if (!active || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const showing = SHOW_PHASES.includes(phase);
  const flying = phase === 'show' && shot !== null;
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  const origin = shot?.from ?? ring;
  const layout: Layout = origin ? layoutFor(origin, vw) : 'bottom';
  const place = shot ? placeFor(layout, shot.from, vw, vh, cardH) : null;

  // --- Hedef cercevesi (yuva) ---
  let ringEl: React.ReactNode = null;
  if (ring) {
    // Pay her kenarda ayri hesaplanir: ekran kenarina dayanan panelde cerceve
    // panelin icine dogru kaymaz, kenarla ayni hizada durur.
    const P = 5;
    const pay = (bosluk: number) => Math.max(0, Math.min(P, bosluk));
    const left = ring.left - pay(ring.left);
    const top = ring.top - pay(ring.top);
    const width = ring.width + pay(ring.left) + pay(vw - (ring.left + ring.width));
    const height = ring.height + pay(ring.top) + pay(vh - (ring.top + ring.height));
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
            ringAnim ? `left ${dur(ringGecis.ms)}ms ${ringGecis.egri}` : '',
            ringAnim ? `top ${dur(ringGecis.ms)}ms ${ringGecis.egri}` : '',
            ringAnim ? `width ${dur(ringGecis.ms)}ms ${ringGecis.egri}` : '',
            ringAnim ? `height ${dur(ringGecis.ms)}ms ${ringGecis.egri}` : '',
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
      const avail = freeBand(vh, cardH).bottom - top0;
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
  const cs = steps[cardIndex] ?? step;
  const cover = cs.kind === 'cover';
  const live = cs.kind === 'live';
  // Canli adimda panel yerinde durdugu icin kart panelin bos tarafina gecer.
  const liveSide: 'left' | 'right' | null = live && ring ? liveSideFor(ring, vw) : null;
  const side = (layout === 'side' && !cover && !live) || liveSide !== null;
  const card = (
    <div
      ref={cardRef}
      className="absolute"
      aria-live="polite"
      style={{
        zIndex: 6,
        ...(cover
          ? { left: '50%', top: '50%', width: 'min(1080px, 86vw)', transform: 'translate(-50%, -50%)' }
          : liveSide
            ? {
                [liveSide === 'right' ? 'right' : 'left']: '3vw',
                top: '50%',
                width: 'min(560px, 38vw)',
                transform: 'translateY(-50%)',
              }
          : side
            ? { right: '3vw', top: '50%', width: '31vw', transform: 'translateY(-50%)' }
            : { left: '50%', bottom: '3vh', width: 'min(1180px, 92vw)', transform: 'translateX(-50%)' }),
        background: 'rgb(6 10 14 / 0.95)',
        border: `1px solid ${acc(0.35)}`,
        borderTop: `4px solid ${acc(1)}`,
        boxShadow: `0 20px 60px rgb(0 0 0 / 0.6), 0 0 40px ${acc(0.12)}`,
        padding: 'clamp(12px, 1.7vh, 18px) clamp(16px, 1.4vw, 26px) clamp(14px, 1.9vh, 20px)',
        opacity: showing ? 1 : 0,
        transition: `opacity ${dur(showing ? 450 : 200)}ms ease ${dur(showing ? 250 : 0)}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] uppercase tracking-[0.2em] font-semibold" style={{ color: acc(1) }}>
            AzSonra · tanıtım turu{tourId === 'ozet' ? ' · özet görünüm' : ''}
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] px-2 py-[1px] border border-white/30 text-white/70">
            simüle veri
          </span>
        </div>
        <span className="num text-[16px]" style={{ color: INK_SOFT }}>
          <span style={{ color: INK }} className="text-[22px] font-semibold">
            {pad2(cardIndex + 1)}
          </span>{' '}
          / {pad2(steps.length)}
        </span>
      </div>

      {/* Adim seridi */}
      <div className="flex gap-[5px] mt-3">
        {steps.map((s, i) => (
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

      <div
        className="leading-[1.12] font-semibold mt-3"
        style={{ color: INK, fontSize: cover ? 'clamp(30px, 4.6vh, 50px)' : 'clamp(22px, 3.15vh, 34px)' }}
      >
        {cs.title}
      </div>
      <div
        className="leading-[1.45] mt-2"
        style={{ color: INK_SOFT, fontSize: cover ? 'clamp(17px, 2.3vh, 25px)' : 'clamp(15px, 1.95vh, 21px)' }}
      >
        {cs.caption}
      </div>
      {cs.look ? (
      <div
        className="mt-3 px-4 py-[10px] flex gap-3 items-baseline"
        style={{ background: acc(0.1), borderLeft: `4px solid ${acc(1)}` }}
      >
        <span className="text-[13px] uppercase tracking-[0.16em] font-bold shrink-0" style={{ color: acc(1) }}>
          ▸ Buraya bakın
        </span>
        <span className="leading-[1.4]" style={{ color: INK, fontSize: 'clamp(14px, 1.76vh, 19px)' }}>
          {cs.look}
        </span>
      </div>
      ) : null}

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
      data-tour-shown={showing ? cs.id : ''}
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

      {/* Kapak adiminda panel yok: konsol karartilir, kart ortada durur. */}
      {cover && (
        <div
          className="absolute inset-0"
          style={{
            zIndex: 1,
            background: 'rgb(2 5 8 / 0.86)',
            opacity: showing ? 1 : 0,
            transition: `opacity ${dur(400)}ms ease`,
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
