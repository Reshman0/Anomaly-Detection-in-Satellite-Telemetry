import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import land from '../data/land_110m.json';
import { useConsole } from '../store';
import {
  GROUND_STATION,
  NORAD_ID,
  ORBIT_PERIOD_S,
  TLE_NAME,
  groundTrack,
  lookAnglesAt,
  subPointAt,
  visibilityConeRadiusDeg,
} from '../engine/orbit';
import { COLOR } from '../ui/colors';

const EARTH_R_KM = 6371;
const D2R = Math.PI / 180;

function toVec(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(r);
}

/** Kure yuzeyinde bir merkez etrafinda acisal yaricapli cember. */
function circleOnSphere(latDeg: number, lonDeg: number, radiusDeg: number, r: number, segments = 96): THREE.Vector3[] {
  const centre = toVec(latDeg, lonDeg, 1);
  const up = Math.abs(centre.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const e1 = new THREE.Vector3().crossVectors(up, centre).normalize();
  const e2 = new THREE.Vector3().crossVectors(centre, e1).normalize();
  const a = radiusDeg * D2R;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const v = centre
      .clone()
      .multiplyScalar(Math.cos(a))
      .add(e1.clone().multiplyScalar(Math.sin(a) * Math.cos(th)))
      .add(e2.clone().multiplyScalar(Math.sin(a) * Math.sin(th)));
    pts.push(v.multiplyScalar(r));
  }
  return pts;
}

function buildLand(): THREE.LineSegments {
  const positions: number[] = [];
  for (const ring of (land as { rings: number[][] }).rings) {
    for (let i = 0; i + 3 < ring.length; i += 2) {
      const a = toVec(ring[i + 1], ring[i], 1.002);
      const b = toVec(ring[i + 3], ring[i + 2], 1.002);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    // halkayi kapat
    const a = toVec(ring[ring.length - 1], ring[ring.length - 2], 1.002);
    const b = toVec(ring[1], ring[0], 1.002);
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
      push(toVec(lat, lon, 1.0005), toVec(lat, lon + 5, 1.0005));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 5) {
      push(toVec(lat, lon, 1.0005), toVec(lat + 5, lon, 1.0005));
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
    renderer.domElement.style.display = 'block';

    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshBasicMaterial({ color: 0x121e27 })));
    // Kure siluetini ayirmak icin ince bir kenar halkasi (ic yuzu cizilen buyuk kure).
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.014, 64, 48),
        new THREE.MeshBasicMaterial({ color: 0x33566a, side: THREE.BackSide }),
      ),
    );
    scene.add(buildGraticule());
    scene.add(buildLand());

    // Yer istasyonu
    const gsPos = toVec(GROUND_STATION.lat_deg, GROUND_STATION.lon_deg, 1.004);
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

    camera.position.copy(toVec(GROUND_STATION.lat_deg * 0.7, GROUND_STATION.lon_deg, 3.1));
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
        const r = 1 + sp.altKm / EARTH_R_KM;
        const satPos = toVec(sp.latDeg, sp.lonDeg, r);
        sat.position.copy(satPos);
        satMat.color.set(visible ? COLOR.nominal : COLOR.dim);

        cone.geometry.dispose();
        cone.geometry = new THREE.BufferGeometry().setFromPoints(
          circleOnSphere(
            GROUND_STATION.lat_deg,
            GROUND_STATION.lon_deg,
            visibilityConeRadiusDeg(sp.altKm),
            1.003,
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
          const pts = groundTrack(utcMs, ORBIT_PERIOD_S * 0.75, 40).map((q) => toVec(q.latDeg, q.lonDeg, 1.0015));
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
            'ALT ' +
            sp.altKm.toFixed(1) +
            ' km   LAT ' +
            sp.latDeg.toFixed(2) +
            '°   LON ' +
            sp.lonDeg.toFixed(2) +
            '°   AZ ' +
            ((la.azimuthDeg + 360) % 360).toFixed(1) +
            '°   EL ' +
            la.elevationDeg.toFixed(1) +
            '°   RANGE ' +
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
        <span>Dünya · SGP4 yörünge yayılımı</span>
        <span className="normal-case tracking-normal text-ops-faint num">
          {TLE_NAME} · NORAD {NORAD_ID} · T {(ORBIT_PERIOD_S / 60).toFixed(1)} dk
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
            <span className="text-ops-nominal">●</span> {GROUND_STATION.name} · görüş konisi ≥
            {GROUND_STATION.min_elevation_deg}°
          </div>
          <div>
            <span className="text-ops-dim">▬</span> yörünge izi · sürükle döndür, tekerlek yakınlaştır
          </div>
        </div>
      </div>
    </section>
  );
}
