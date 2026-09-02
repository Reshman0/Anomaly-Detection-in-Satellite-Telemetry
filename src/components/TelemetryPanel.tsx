import { useConsole } from '../store';
import { PARAMETERS } from '../engine/mib';
import { WINDOW_S } from '../engine/simulation';
import TelemetryStrip from './TelemetryStrip';

/** ESA-ADB Mission 1 kanal sayisi (channels.csv). Ekranda yalnizca calismada
 *  kullanilan alt kume gosterilir; oran izleyiciye olcegi hissettirmek icin yazilir. */
const TOTAL_CHANNELS = 76;

export default function TelemetryPanel() {
  const sim = useConsole((s) => s.sim);
  useConsole((s) => s.version);

  const states = sim.snapshot().states;
  const shownChannels = PARAMETERS.filter((p) => !p.derived).length;
  const missionT = sim.clock.missionT;

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Uydudan gelen ölçümler</span>
        <span className="normal-case tracking-normal text-ops-faint">
          {TOTAL_CHANNELS} kanallık ESA veri setinden bizim kullandığımız {shownChannels} kanal akıyor ·
          son {WINDOW_S / 60} dk · ◆ yerde hesaplanıyor
        </span>
      </div>
      {/* Seritler kalan yuksekligi esit paylasir: mib.json'a parametre eklendiginde
          duzen kendini ayarlar, sabit satir yuksekligi yuzunden kirpilma olmaz. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {PARAMETERS.map((p) => (
          <TelemetryStrip
            key={p.pid}
            p={p}
            buf={sim.buffers.get(p.pid)!}
            state={states.get(p.pid) ?? 'NOMINAL'}
            missionT={missionT}
          />
        ))}
      </div>
    </section>
  );
}
