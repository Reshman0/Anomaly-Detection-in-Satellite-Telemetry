import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import land from '../data/land_110m.json';
import { useConsole } from '../store';
import { POLAR_RATIO, footprintRingLatLon, geodeticToEcefUnit } from '../engine/earth';
import {
  GROUND_STATION,
  ORBIT_PERIOD_S,
  TLE_NAME,
  groundTrack,
  lookAnglesAt,
  subPointAt,
  visibilityConeRadiusDeg,
} from '../engine/orbit';
import { COLOR } from '../ui/colors';

/*
 * Yuzeye giydirilen katmanlarin elipsoit yuzeyinden yuksekligi (km).
 * Z-fighting'i onler; olcek sahne biriminde degil km cinsinden verilir ki
 * elipsoidin her enleminde ayni fiziksel pay kalsin.
 */
const GRID_H_KM = 3;
const TRACK_H_KM = 10;
const LAND_H_KM = 13;
const CONE_H_KM = 19;
const GS_H_KM = 25;

const D2R = Math.PI / 180;

/** Dunya modeli `engine/earth.ts` icindedir; burada yalnizca sahneye baglanir. */
function toEcef(latDeg: number, lonDeg: number, hKm = 0): THREE.Vector3 {
  const v = geodeticToEcefUnit(latDeg, lonDeg, hKm);
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** Gorus konisinin yer izdusumu, elipsoide oturtulmus halde. */
function footprintRing(
  latDeg: number,
  lonDeg: number,
  radiusDeg: number,
  hKm: number,
): THREE.Vector3[] {
  return footprintRingLatLon(latDeg, lonDeg, radiusDeg).map((p) =>
    toEcef(p.latDeg, p.lonDeg, hKm),
  );
}

function buildLand(): THREE.LineSegments {
  const positions: number[] = [];
  for (const ring of (land as { rings: number[][] }).rings) {
    for (let i = 0; i + 3 < ring.length; i += 2) {
      const a = toEcef(ring[i + 1], ring[i], LAND_H_KM);
      const b = toEcef(ring[i + 3], ring[i + 2], LAND_H_KM);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    // halkayi kapat
    const a = toEcef(ring[ring.length - 1], ring[ring.length - 2], LAND_H_KM);
    const b = toEcef(ring[1], ring[0], LAND_H_KM);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x6e93a6 }));
}

function buildGraticule(): THREE.LineSegments {
  const positions: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 5) {
      push(toEcef(lat, lon, GRID_H_KM), toEcef(lat, lon + 5, GRID_H_KM));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 5) {
      push(toEcef(lat, lon, GRID_H_KM), toEcef(lat + 5, lon, GRID_H_KM));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x22323c }));
}

export default function GlobeView() {
  const host = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(COLOR.sunken), 1);
    el.appendChild(renderer.domElement);
    /*
     * Canvas'in CSS boyutu ACIKCA yuzde olarak verilir. Verilmezse canvas
     * ekranda arka tampon boyutu kadar yer kaplar; arka tampon da
     * genislik x pixelRatio oldugu icin %125 olcekli bir ekranda (dpr 1.25)
     * kure panelinden %25 tasar ve komsu panellerin uzerine boyar.
     * setSize(w, h, false) arka tamponu ayarlar, stile dokunmaz — CSS boyutu
     * bu yuzden burada sabitlenir ve pixelRatio ne olursa olsun panele oturur.
     */
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    /*
     * Govde WGS84 elipsoidi: birim kure y ekseninde kutup/ekvator oraniyla
     * ezilir. Basiklik %0.335 — goze carpmaz ama limb (kenar) profili ve
     * uzerine giydirilen her nokta artik gercek Dunya seklinde.
     */
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x121e27 }),
    );
    globe.scale.set(1, POLAR_RATIO, 1);
    scene.add(globe);
    // Kure siluetini ayirmak icin ince bir kenar halkasi (ic yuzu cizilen buyuk elipsoit).
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.014, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x33566a, side: THREE.BackSide }),
    );
    rim.scale.set(1, POLAR_RATIO, 1);
    scene.add(rim);
    scene.add(buildGraticule());
    scene.add(buildLand());

    // Yer istasyonu
    // Istasyonun MIB'deki gercek yuksekligi (alt_km) + isaretcinin giydirme payi.
    const gsPos = toEcef(
      GROUND_STATION.lat_deg,
      GROUND_STATION.lon_deg,
      GROUND_STATION.alt_km + GS_H_KM,
    );
    const gsDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 12, 12),
      new THREE.MeshBasicMaterial({ color: COLOR.nominal }),
    );
    gsDot.position.copy(gsPos);
    scene.add(gsDot);

    // Gorus konisi (uydunun anlik irtifasina gore guncellenir)
    const coneMat = new THREE.LineBasicMaterial({ color: COLOR.nominal, transparent: true, opacity: 0.55 });
    const cone = new THREE.LineLoop(new THREE.BufferGeometry(), coneMat);
    scene.add(cone);

    // Yorunge izi
    const trackMat = new THREE.LineBasicMaterial({ color: 0x7d9aab });
    const track = new THREE.Line(new THREE.BufferGeometry(), trackMat);
    scene.add(track);

    // Uydu ve gorus vektoru
    const satMat = new THREE.MeshBasicMaterial({ color: COLOR.dim });
    const sat = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), satMat);
    scene.add(sat);
    const losMat = new THREE.LineBasicMaterial({ color: COLOR.nominal, transparent: true, opacity: 0.7 });
    const los = new THREE.Line(new THREE.BufferGeometry(), losMat);
    scene.add(los);

    camera.position.copy(
      toEcef(GROUND_STATION.lat_deg * 0.7, GROUND_STATION.lon_deg).setLength(3.1),
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.35;
    controls.maxDistance = 6;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;

    // Kullanici kamerayi elle oynatana kadar kure panele sigacak sekilde cerceveler.
    let userMoved = false;
    controls.addEventListener('start', () => {
      userMoved = true;
    });

    /** radius = 1 kureyi (pay ile) hem yatay hem dusey sigdiran kamera uzakligi. */
    const fitDistance = (aspect: number): number => {
      const margin = 1.22;
      const vFov = (camera.fov * D2R) / 2;
      const hFov = Math.atan(Math.tan(vFov) * aspect);
      return margin / Math.min(Math.sin(vFov), Math.sin(hFov));
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      // Pencere farkli olcekteki bir ekrana tasinirsa dpr degisir; her
      // olcumde yeniden okunur (mount aninda bir kez okumak yetmez).
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!userMoved) camera.position.setLength(fitDistance(camera.aspect));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let lastTrackMs = -1e12;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sim = useConsole.getState().sim;
      const utcMs = sim.clock.utcMs();

      const sp = subPointAt(utcMs);
      const la = lookAnglesAt(utcMs);
      if (sp && la) {
        const visible = la.elevationDeg >= GROUND_STATION.min_elevation_deg;
        // altKm, eciToGeodetic'ten gelir: WGS84 elipsoidi uzerindeki yukseklik.
        const satPos = toEcef(sp.latDeg, sp.lonDeg, sp.altKm);
        sat.position.copy(satPos);
        satMat.color.set(visible ? COLOR.nominal : COLOR.dim);

        cone.geometry.dispose();
        cone.geometry = new THREE.BufferGeometry().setFromPoints(
          footprintRing(
            GROUND_STATION.lat_deg,
            GROUND_STATION.lon_deg,
            visibilityConeRadiusDeg(sp.altKm),
            CONE_H_KM,
          ),
        );

        los.visible = visible;
        if (visible) {
          los.geometry.dispose();
          los.geometry = new THREE.BufferGeometry().setFromPoints([gsPos, satPos]);
        }

        // Yorunge izi pahali; birkac saniyede bir yeniden hesapla.
        if (Math.abs(utcMs - lastTrackMs) > ORBIT_PERIOD_S * 100) {
          lastTrackMs = utcMs;
          const pts = groundTrack(utcMs, ORBIT_PERIOD_S * 0.75, 40).map((q) =>
            toEcef(q.latDeg, q.lonDeg, TRACK_H_KM),
          );
          // Boylam sarmasinda kesintiyi onlemek icin uzun atlamalari at.
          const clean: THREE.Vector3[] = [];
          for (let i = 0; i < pts.length; i++) {
            if (i > 0 && pts[i].distanceTo(pts[i - 1]) > 0.35) break;
            clean.push(pts[i]);
          }
          track.geometry.dispose();
          track.geometry = new THREE.BufferGeometry().setFromPoints(clean);
        }

        if (readout.current) {
          readout.current.textContent =
            'Yükseklik ' +
            sp.altKm.toFixed(1) +
            ' km   Enlem ' +
            sp.latDeg.toFixed(2) +
            '°   Boylam ' +
            sp.lonDeg.toFixed(2) +
            '°   Yön ' +
            ((la.azimuthDeg + 360) % 360).toFixed(1) +
            '°   Açı ' +
            la.elevationDeg.toFixed(1) +
            '°   Uzaklık ' +
            la.rangeKm.toFixed(0) +
            ' km';
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Uydunun anlık konumu</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {TLE_NAME} · dünya turu {(ORBIT_PERIOD_S / 60).toFixed(0)} dakika
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={host} className="absolute inset-0" />
        <div
          ref={readout}
          className="absolute left-2 bottom-2 num text-3xs text-ops-dim bg-ops-sunken/80 px-1.5 py-1 pointer-events-none"
        />
        <div className="absolute right-2 bottom-2 text-3xs text-ops-faint bg-ops-sunken/80 px-1.5 py-1 pointer-events-none leading-relaxed">
          <div>
            <span className="text-ops-nominal">●</span> {GROUND_STATION.name} yer istasyonu ·
            uydunun görülebildiği alan
          </div>
          <div>
            <span className="text-ops-dim">▬</span> uydunun izlediği yol · sürükle döndür, tekerlek yakınlaştır
          </div>
        </div>
      </div>
    </section>
  );
}
