import * as THREE from 'three';

/**
 * TAKIP kamerasinin bir sonraki konumu.
 *
 * Kamera uydunun uzerine gecerken YALNIZCA yon degisir; Dunya'ya olan uzaklik
 * korunur. Onceden konum dogrudan hedefe `lerp` ediliyordu: iki nokta ayni
 * kure uzerinde olsa bile aralarindaki duz cizgi (kiris) merkezden gectigi icin
 * vektorun boyu kisaliyordu ve kamera her karede biraz daha yaklasiyordu —
 * takip acilinca kure kendiliginden zoomlanmis gibi gorunuyordu.
 *
 * Istisna: kamera `minUzaklik`in altindaysa (ornegin Ankara yakin
 * goruntusundeyken takip acildi) mesafe ayni payla yumusakca yukselir. Yoksa
 * ~100 km'de takip edilen uydu kameranin arkasinda kalirdi.
 *
 * @param kamera     kameranin su anki konumu
 * @param hedef      uydunun konumu (yalnizca yonu kullanilir)
 * @param pay        0..1 arasi yumusatma payi (0 = hic donme, 1 = dogrudan hedefe)
 * @param minUzaklik takip sirasinda kameranin cikacagi en kucuk uzaklik (0 = sinir yok)
 */
export function takipKonumu(kamera: THREE.Vector3, hedef: THREE.Vector3, pay: number, minUzaklik = 0): THREE.Vector3 {
  const uzaklik = kamera.length();
  if (uzaklik === 0 || hedef.lengthSq() === 0) return kamera.clone();
  const yeniUzaklik = uzaklik < minUzaklik ? uzaklik + (minUzaklik - uzaklik) * pay : uzaklik;
  const yon = kamera.clone().normalize();
  const hedefYon = hedef.clone().normalize();
  const donus = new THREE.Quaternion().setFromUnitVectors(yon, hedefYon);
  return yon.applyQuaternion(new THREE.Quaternion().slerp(donus, pay)).multiplyScalar(yeniUzaklik);
}
