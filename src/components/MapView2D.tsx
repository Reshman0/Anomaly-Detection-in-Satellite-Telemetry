import { useEffect, useRef } from 'react';
import { useConsole, type EarthTheme } from '../store';
import { currentImagery, earthCanvas, isBmngFailed, isBmngReady } from '../ui/earthTexture';
import { COLOR, alpha } from '../ui/colors';
import {
  GROUND_STATION,
  SATELLITES,
  SAT_GROUPS,
  groundTrack,
  rangeRateAt,
  satByNorad,
  stateAt,
  visibilityConeRadiusDeg,
  type SatelliteRecord,
} from '../engine/orbit';

/**
 * 2B dünya görünümü — eşdikdörtgen (plate carrée) izdüşüm.
 *
 * Kürenin tam karşılığıdır: aynı zemin dokuları (OPS / SİYASİ / FİZİKİ NASA
 * Blue Marble — gerçek renk, topografya gölgeli, batimetri işlenmiş), aynı
 * SGP4 durumları, aynı istasyon. Fazladan: seçili uydunun **tam yer izi**
 * (−½ / +¾ periyot), istasyonun seçili irtifa için **görüş dairesi**, görünen
 * uydulara kesikli görüş çizgisi, tüm filonun yer izdüşümleri.
 *
 * Terminator, bulut ve atmosfer yoktur (yönerge §11). Ölçek gerçektir:
 * 1° boylam = 1° enlem piksel olarak; kutuplara doğru alan şişer, bu izdüşümün
 * doğasıdır ve alt bilgide yazılıdır.
 *
 * Etkileşim: sürükle = kaydır · tekerlek = imleç etrafında yakınlaş ·
 * çift tık = sıfırla · uyduya tık = seç. Klavye: M ile 3B'ye dön.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const C_KM_S = 299792.458;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
/** Acilis: istasyon merkezde, Avrupa–Orta Asya paneli doldurur. */
const HOME_ZOOM = 1.7;

function clampLat(lat: number, zoom: number): number {
  const halfSpan = Math.min(90, 90 / zoom);
  return Math.max(-90 + halfSpan, Math.min(90 - halfSpan, lat));
}
const HOME: View = { cLon: GROUND_STATION.lon_deg, cLat: clampLat(GROUND_STATION.lat_deg, HOME_ZOOM), zoom: HOME_ZOOM };

interface View {
  cLon: number;
  cLat: number;
  zoom: number;
}

const groupColor = new Map(SAT_GROUPS.map((g) => [g.id, g.color]));

/** Küre üzerinde merkez etrafında açısal yarıçaplı çember — lat/lon noktaları. */
function circlePoints(latDeg: number, lonDeg: number, radiusDeg: number, n = 180): { lat: number; lon: number }[] {
  const lat1 = latDeg * D2R;
  const lon1 = lonDeg * D2R;
  const d = radiusDeg * D2R;
  const pts: { lat: number; lon: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const brg = (i / n) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    pts.push({ lat: lat2 * R2D, lon: ((lon2 * R2D + 540) % 360) - 180 });
  }
  return pts;
}

/**
 * Zemin dokusunun durumu — her karede yeniden turetilir. Eskiden tek atislik
 * bir callback'ten mandallanan bayrak kullaniliyordu; callback daha once
 * ateslendiyse mesaj sonsuza kadar asili kaliyordu.
 */
function basemapNote(theme: EarthTheme): string | null {
  if (theme === 'physical') {
    if (isBmngFailed()) return 'gömülü doku çözülemedi';
    if (!isBmngReady()) return 'Blue Marble yükleniyor…';
    return null;
  }
  if (theme === 'current') {
    const info = currentImagery();
    if (info.refreshing) return 'GIBS’ten görüntü alınıyor…';
    if (info.status === 'loading') return 'mozaik yükleniyor…';
    if (info.status === 'failed') return info.error ?? 'mozaik yüklenemedi';
    return null;
  }
  return null;
}

function rangeText(sat: SatelliteRecord, utcMs: number, rangeKm: number): string {
  const rr = rangeRateAt(sat, utcMs);
  const owlt = (rangeKm / C_KM_S) * 1000;
  return (rr === null ? '' : '   RR ' + (rr >= 0 ? '+' : '') + rr.toFixed(2) + ' km/s') + '   OWLT ' + owlt.toFixed(1) + ' ms';
}

export default function MapView2D() {
  const host = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const earthTheme = useConsole((s) => s.earthTheme);
  const view = useRef<View>({ ...HOME });
  const themeRef = useRef(earthTheme);
  themeRef.current = earthTheme;

  useEffect(() => {
    const el = host.current;
    const cv = cvRef.current;
    if (!el || !cv) return;
    const g = cv.getContext('2d')!;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      W = el.clientWidth;
      H = el.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Taban olcek: harita panel yuksekligini doldurur (istasyon cevresi buyuk gorunur);
    // tum dunyayi sigdirmak icin zoom minimuma (genislik/yukseklik oranina) indirilir.
    const baseK = () => H / 180;
    const minZoom = () => Math.min(MIN_ZOOM, W / 360 / (H / 180));
    const kOf = () => baseK() * view.current.zoom;
    const project = (lat: number, lon: number) => {
      const k = kOf();
      const v = view.current;
      // Merkeze en yakin sarma kopyasi
      let dl = lon - v.cLon;
      if (dl > 180) dl -= 360;
      if (dl < -180) dl += 360;
      return { x: W / 2 + dl * k, y: H / 2 - (lat - v.cLat) * k };
    };
    const unproject = (x: number, y: number) => {
      const k = kOf();
      const v = view.current;
      return { lon: ((v.cLon + (x - W / 2) / k + 540) % 360) - 180, lat: v.cLat - (y - H / 2) / k };
    };

    /** lat/lon dizisini antimeridyende kirarak cizer. */
    const polyline = (pts: { lat: number; lon: number }[], stroke: string, width: number, dash?: number[]) => {
      g.strokeStyle = stroke;
      g.lineWidth = width;
      g.setLineDash(dash ?? []);
      g.beginPath();
      let prev: { x: number; y: number } | null = null;
      for (const p of pts) {
        const q = project(p.lat, p.lon);
        if (!prev || Math.abs(q.x - prev.x) > W / 2) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
        prev = q;
      }
      g.stroke();
      g.setLineDash([]);
    };

    // Hit-test icin son karedeki uydu ekran konumlari.
    let hits: { sat: SatelliteRecord; x: number; y: number }[] = [];

    let raf = 0;
    let lastTrackMs = -1e12;
    let lastTrackNorad = '';
    let trackPts: { lat: number; lon: number }[] = [];

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (W === 0 || H === 0) return;
      const state = useConsole.getState();
      const utcMs = state.sim.clock.utcMs();
      const selected = state.selectedNorad;
      const k = kOf();
      const v = view.current;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = COLOR.sunken;
      g.fillRect(0, 0, W, H);

      // --- zemin: tema canvas'i, sarma icin uc kopya ---
      const theme = themeRef.current;
      // Asenkron doku henuz cozulmediyse bu kare OPS zeminiyle cizilir; her
      // kare yeniden soruldugu icin goruntu gelir gelmez kendiliginden gecer.
      let base = earthCanvas(theme);
      if (!base) base = earthCanvas('ops')!;
      const top = project(90, 0).y;
      const mapH = 180 * k;
      const mapW = 360 * k;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      // -180 meridyeninin merkeze en yakin kopyasi; komsu kopyalar ±mapW kaydirilir.
      const x0 = W / 2 + (-180 - v.cLon) * k;
      for (const off of [-1, 0, 1]) {
        const x = x0 + off * mapW;
        if (x + mapW < 0 || x > W) continue;
        g.drawImage(base, x, top, mapW, mapH);
      }
      // Harita disinda kalan (kutup otesi) bant
      g.fillStyle = COLOR.sunken;
      if (top > 0) g.fillRect(0, 0, W, top);
      if (top + mapH < H) g.fillRect(0, top + mapH, W, H - top - mapH);

      // --- graticule (30°) ---
      const gridColor = theme === 'ops' ? alpha(COLOR.text, 0.14) : 'rgba(255,255,255,0.28)';
      g.strokeStyle = gridColor;
      g.lineWidth = 1;
      g.font = '9px Consolas, monospace';
      g.fillStyle = theme === 'ops' ? alpha(COLOR.text, 0.5) : 'rgba(255,255,255,0.75)';
      g.textBaseline = 'top';
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = project(lat, 0).y;
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(W, y + 0.5);
        g.stroke();
        g.textAlign = 'left';
        g.fillText((lat >= 0 ? lat + '°N' : -lat + '°S'), 3, y + 2);
      }
      const halfLon = W / (2 * k);
      const lonStart = Math.floor((v.cLon - halfLon - 30) / 30) * 30;
      for (let lon = lonStart; lon <= v.cLon + halfLon + 30; lon += 30) {
        const x = project(0, lon).x;
        if (x < -1 || x > W + 1) continue;
        g.beginPath();
        g.moveTo(x + 0.5, top);
        g.lineTo(x + 0.5, top + mapH);
        g.stroke();
        const ln = ((lon + 540) % 360) - 180;
        g.textAlign = 'center';
        g.fillText(ln === 0 ? '0°' : ln > 0 ? ln + '°E' : -ln + '°W', x, Math.max(top, 0) + 2);
      }

      // --- secili uydu: yer izi + gorus dairesi + gorus cizgisi ---
      const sat = satByNorad(selected);
      const selState = stateAt(sat, utcMs);
      if (selState) {
        const periodS = sat.periodMin * 60;
        if (selected !== lastTrackNorad || Math.abs(utcMs - lastTrackMs) > periodS * 100) {
          lastTrackMs = utcMs;
          lastTrackNorad = selected;
          trackPts = groundTrack(sat, utcMs, periodS * 1.25, Math.max(20, periodS / 240)).map((q) => ({ lat: q.latDeg, lon: q.lonDeg }));
        }
        polyline(trackPts, alpha(COLOR.text, 0.55), 1.2);
        // gorus dairesi (istasyon merkezli, secili irtifaya gore)
        const cone = circlePoints(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, visibilityConeRadiusDeg(selState.sub.altKm));
        g.fillStyle = alpha(COLOR.nominal, 0.08);
        g.beginPath();
        let prev: { x: number; y: number } | null = null;
        let broken = false;
        for (const p of cone) {
          const q = project(p.lat, p.lon);
          if (prev && Math.abs(q.x - prev.x) > W / 2) broken = true;
          if (!prev) g.moveTo(q.x, q.y);
          else g.lineTo(q.x, q.y);
          prev = q;
        }
        if (!broken) g.fill();
        polyline(cone, alpha(COLOR.nominal, 0.7), 1.2, [4, 3]);
      }

      // --- yer istasyonu ---
      const gs = project(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg);
      g.fillStyle = COLOR.nominal;
      g.beginPath();
      g.arc(gs.x, gs.y, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = COLOR.sunken;
      g.lineWidth = 1;
      g.stroke();
      g.font = '600 10px Consolas, monospace';
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      g.fillStyle = COLOR.nominal;
      g.fillText(GROUND_STATION.name, gs.x + 6, gs.y - 3);

      // --- filo ---
      hits = [];
      let nVisible = 0;
      for (const s of SATELLITES) {
        const st = stateAt(s, utcMs);
        if (!st) continue;
        const p = project(st.sub.latDeg, st.sub.lonDeg);
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
        const inView = st.look.elevationDeg >= GROUND_STATION.min_elevation_deg;
        const color = groupColor.get(s.group) ?? COLOR.dim;
        const isSel = s.norad === selected;
        if (inView) {
          nVisible++;
          polyline([{ lat: GROUND_STATION.lat_deg, lon: GROUND_STATION.lon_deg }, { lat: st.sub.latDeg, lon: st.sub.lonDeg }], alpha(COLOR.nominal, isSel ? 0.8 : 0.35), 1, [3, 3]);
        }
        hits.push({ sat: s, x: p.x, y: p.y });
        g.fillStyle = color;
        g.beginPath();
        if (s.orbitClass === 'GEO') {
          g.rect(p.x - 3, p.y - 3, 6, 6);
        } else {
          g.moveTo(p.x, p.y - 4.5);
          g.lineTo(p.x + 4.5, p.y);
          g.lineTo(p.x, p.y + 4.5);
          g.lineTo(p.x - 4.5, p.y);
          g.closePath();
        }
        g.fill();
        g.strokeStyle = COLOR.sunken;
        g.lineWidth = 1;
        g.stroke();
        if (isSel) {
          g.strokeStyle = COLOR.text;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(p.x, p.y, 9, 0, Math.PI * 2);
          g.stroke();
        }
        if (isSel || inView || v.zoom >= 3) {
          g.font = (isSel ? '700 ' : '600 ') + '10px Consolas, monospace';
          g.textAlign = 'left';
          g.textBaseline = 'middle';
          g.lineWidth = 3;
          g.strokeStyle = alpha(COLOR.sunken, 0.85);
          g.strokeText(s.name, p.x + 10, p.y);
          g.fillStyle = isSel ? COLOR.text : color;
          g.fillText(s.name, p.x + 10, p.y);
        }
      }

      // --- olcek cubugu (ekvatorda) ---
      const kmPerDegEq = 111.32;
      const barDeg = v.zoom >= 6 ? 5 : v.zoom >= 3 ? 10 : 30;
      const barPx = barDeg * k;
      g.fillStyle = alpha(COLOR.sunken, 0.8);
      g.fillRect(W - barPx - 14, H - 26, barPx + 8, 18);
      g.strokeStyle = COLOR.text;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(W - barPx - 10, H - 12);
      g.lineTo(W - 10, H - 12);
      g.stroke();
      g.font = '9px Consolas, monospace';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillStyle = COLOR.text;
      g.fillText(barDeg + '° ≈ ' + Math.round(barDeg * kmPerDegEq) + ' km (ekvator)', W - 10, H - 14);

      if (readout.current && selState) {
        const sp = selState.sub;
        const la = selState.look;
        readout.current.textContent =
          sat.name +
          '   ALT ' + sp.altKm.toFixed(1) + ' km   LAT ' + sp.latDeg.toFixed(2) + '°   LON ' + sp.lonDeg.toFixed(2) +
          '°   AZ ' + ((la.azimuthDeg + 360) % 360).toFixed(1) + '°   EL ' + la.elevationDeg.toFixed(1) +
          '°   RANGE ' + la.rangeKm.toFixed(0) + ' km' + rangeText(sat, utcMs, la.rangeKm) +
          '   ·   görünen ' + nVisible + '   ·   ' + (basemapNote(theme) ?? 'zoom ' + v.zoom.toFixed(1) + '×');
      }
    };
    draw();

    // --- etkilesim ---
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: MouseEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragging) {
        const k = kOf();
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        lastX = e.clientX;
        lastY = e.clientY;
        const v = view.current;
        v.cLon = ((v.cLon - dx / k + 540) % 360) - 180;
        v.cLat = clampLat(v.cLat + dy / k, v.zoom);
        return;
      }
      // hover: en yakin uydu
      let best: { sat: SatelliteRecord; d: number } | null = null;
      for (const h of hits) {
        const d = Math.hypot(h.x - mx, h.y - my);
        if (d < 10 && (!best || d < best.d)) best = { sat: h.sat, d };
      }
      cv.style.cursor = best ? 'pointer' : 'grab';
      if (hoverRef.current) {
        if (best) {
          const ll = unproject(mx, my);
          hoverRef.current.hidden = false;
          hoverRef.current.style.left = mx + 12 + 'px';
          hoverRef.current.style.top = my + 12 + 'px';
          hoverRef.current.textContent = best.sat.name + ' · NORAD ' + best.sat.norad + ' · ' + best.sat.orbitClass + '  (' + ll.lat.toFixed(1) + '°, ' + ll.lon.toFixed(1) + '°)';
        } else {
          hoverRef.current.hidden = true;
        }
      }
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: { sat: SatelliteRecord; d: number } | null = null;
      for (const h of hits) {
        const d = Math.hypot(h.x - mx, h.y - my);
        if (d < 10 && (!best || d < best.d)) best = { sat: h.sat, d };
      }
      if (best) useConsole.getState().selectSatellite(best.sat.norad);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const before = unproject(mx, my);
      const v = view.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      v.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, v.zoom * factor));
      // Imlecin altindaki nokta sabit kalsin
      const after = unproject(mx, my);
      v.cLon = ((v.cLon + (before.lon - after.lon) + 540) % 360) - 180;
      v.cLat = clampLat(v.cLat + (before.lat - after.lat), v.zoom);
    };
    const onDbl = () => {
      view.current = { ...HOME };
    };
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('dblclick', onDbl);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('dblclick', onDbl);
    };
  }, []);

  return (
    <div ref={host} className="absolute inset-y-0 right-0 left-[196px] overflow-hidden">
      <canvas ref={cvRef} className="block cursor-grab" aria-label="2B dünya haritası: uydu yer izdüşümleri, seçili uydunun yer izi ve istasyon görüş dairesi" />
      <div ref={hoverRef} hidden className="absolute num text-3xs text-ops-text bg-ops-sunken/90 border border-ops-line2 px-1.5 py-[2px] pointer-events-none whitespace-nowrap" />
      <div
        ref={readout}
        // Gorunum dugmelerinin ALTINDA durur; boylece tam genislik kullanip
        // satira sigmayan okumayi alt satira sarabilir.
        className="ozet-gizle absolute left-2 top-[56px] max-w-[calc(100%-16px)] num text-3xs text-ops-dim leading-[13px] bg-ops-sunken/85 px-1.5 py-1 pointer-events-none"
      />
    </div>
  );
}
