import * as THREE from 'three';

/**
 * Kamera ucusu — on ayar dugmesine basilinca kamera hedefe ISINLANMAZ,
 * kure uzerinde suzulerek gider (ornegin dunyanin herhangi bir yerinden
 * TUSAS'a). Saf modul: DOM yok, store yok; testler `environment: 'node'`.
 *
 * Birim: kure yaricapi 1; irtifa a = d - 1 (dunya yaricapi cinsinden).
 *
 *   Yon      buyuk cember uzerinde (slerp); ucusun %65'lik bir diliminde
 *            tamamlanir, boylece son alcalma sirasinda yer ekranda kaymaz.
 *            Tumsekli ucusta donus %12'den baslar: kamera alcaktayken yana
 *            kaymasin, once yukselsin.
 *   Irtifa   LOGARITMIK ara degerleme: 32 000 km'den 19 km'ye inerken her
 *            esit zaman diliminde irtifa ayni ORANDA azalir (dogrusal olsa
 *            son saniyede yer "carpardi"). Egri sinus: tepe hizi ortalamanin
 *            1.57 kati (kubikte 3 kati; olculen: 870 km'de tek karede 125 km).
 *   Tumsek   uzak ve alcak bir yerden kalkiliyorsa kamera once yukselir,
 *            kure ekranda donerken gorulur, sonra alcalir. Tepe irtifasi
 *            katedilecek aciyla orantilidir; yakin sicramada tumsek yoktur.
 *            Bicimi sin²: kalkis ve inis yavaslayarak olur.
 *   Sure     aci, irtifa orani ve tumsekle uzar; 1.2-5 s.
 */

/** Tepe irtifasi (dunya yaricapi) / katedilecek aci (radyan). */
const PEAK_PER_RAD = 1.1;
/** Yonun tamamlandigi zaman dilimi ve tumsekli ucusta baslangici. */
const DIR_SHARE = 0.65;
const DIR_START_BUMP = 0.12;
export const MIN_UCUS_MS = 1200;
export const MAX_UCUS_MS = 5000;

export interface Ucus {
  from: THREE.Vector3;
  to: THREE.Vector3;
  u0: THREE.Vector3;
  /** Donus ekseni (u0'a dik birim vektor). */
  axis: THREE.Vector3;
  angle: number;
  la0: number;
  la1: number;
  /** Logaritmik irtifaya eklenen tumsegin genligi (0: tumsek yok). */
  bump: number;
  /** Donusun basladigi zaman orani. */
  dirStart: number;
  durationMs: number;
}

export function easeInOutCubic(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeInOutSine(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** `from` konumundan `to` konumuna ucus plani. */
export function ucusPlani(from: THREE.Vector3, to: THREE.Vector3): Ucus {
  const d0 = from.length();
  const d1 = to.length();
  const u0 = from.clone().divideScalar(d0);
  const u1 = to.clone().divideScalar(d1);
  const angle = Math.acos(Math.min(1, Math.max(-1, u0.dot(u1))));

  // Donus ekseni u0 x u1; tam ters yonde (ya da ayni yonde) tanimsiz: u0'a dik
  // herhangi bir eksen alinir.
  let axis = new THREE.Vector3().crossVectors(u0, u1);
  if (axis.lengthSq() < 1e-12) {
    axis = new THREE.Vector3().crossVectors(u0, Math.abs(u0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  }
  axis.normalize();

  const la0 = Math.log(Math.max(d0 - 1, 1e-6));
  const la1 = Math.log(Math.max(d1 - 1, 1e-6));
  // Ortadaki (tumseksiz) irtifa, kuredeki yolculugu gostermeye yetmiyorsa
  // aradaki fark kadar tumsek eklenir.
  const need = Math.log(Math.max(angle * PEAK_PER_RAD, 1e-6));
  const bump = Math.max(0, need - (la0 + la1) / 2);

  const durationMs = Math.min(
    MAX_UCUS_MS,
    Math.max(MIN_UCUS_MS, 1400 + 800 * angle + 230 * Math.abs(la0 - la1) + 200 * bump),
  );
  const dirStart = bump > 0 ? DIR_START_BUMP : 0;
  return { from: from.clone(), to: to.clone(), u0, axis, angle, la0, la1, bump, dirStart, durationMs };
}

/** Ucusun `t` (0..1) anindaki kamera konumu. t >= 1'de tam hedef. */
export function ucusKonumu(p: Ucus, t: number): THREE.Vector3 {
  if (t <= 0) return p.from.clone();
  if (t >= 1) return p.to.clone();
  const th = p.angle * easeInOutCubic((t - p.dirStart) / DIR_SHARE);
  // Rodrigues: u0, eksene dik oldugu icin u0·cos + (eksen x u0)·sin.
  const dir = p.u0
    .clone()
    .multiplyScalar(Math.cos(th))
    .add(new THREE.Vector3().crossVectors(p.axis, p.u0).multiplyScalar(Math.sin(th)));
  const s = Math.sin(Math.PI * t);
  const la = p.la0 + (p.la1 - p.la0) * easeInOutSine(t) + p.bump * s * s;
  return dir.multiplyScalar(1 + Math.exp(la));
}
