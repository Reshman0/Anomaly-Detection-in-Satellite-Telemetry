import { useRef } from 'react';
import { elevationAt, isVisible, nextPassEvent, satByNorad } from '../engine/orbit';

export interface Temas {
  /** Siradaki AOS ya da LOS; 6 saatlik ufukta yoksa null (istasyon boylamindaki GEO). */
  pass: { kind: 'AOS' | 'LOS'; targetMs: number } | null;
  visible: boolean;
  elevation: number;
}

interface Onbellek {
  atMs: number;
  norad: string;
  pass: Temas['pass'];
}

/**
 * Secili uydunun istasyonla temasi. AOS/LOS aramasi pahalidir; birkac saniyede
 * bir, uydu degisince ya da hedef an gecince tazelenir. "Gecis yok" sonucu da
 * onbelleklenir (GEO uydusunda her karede arama yapilmasin). Ust serit ve ozet
 * panosu ayni hesabi kullanir.
 */
export function useTemas(norad: string, utcMs: number): Temas {
  const ref = useRef<Onbellek | null>(null);
  const c = ref.current;
  const sat = satByNorad(norad);
  if (!c || c.norad !== norad || Math.abs(utcMs - c.atMs) > 4000 || (c.pass !== null && utcMs > c.pass.targetMs)) {
    const ev = nextPassEvent(sat, utcMs);
    ref.current = { atMs: utcMs, norad, pass: ev ? { kind: ev.kind, targetMs: ev.unixMs } : null };
  }
  return {
    pass: ref.current!.pass,
    visible: isVisible(sat, utcMs),
    elevation: elevationAt(sat, utcMs),
  };
}
