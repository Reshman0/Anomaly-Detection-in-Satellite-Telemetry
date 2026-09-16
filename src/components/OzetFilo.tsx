import { fleet, useConsole } from '../store';
import { severityStyle } from '../ui/severity';
import { GROUND_STATION, SATELLITES, SAT_GROUPS, elevationAt } from '../engine/orbit';

/**
 * Ozet panosunun filo durumu: katalogdaki her uydu icin bir kutucuk. Ozet
 * modunda kurenin ustundeki katalog listesi gizlenir; uydu secimi buradan
 * yapilir. Kutucuk yalnizca olculen seyi yazar: gercek zamanli yukselti
 * (SGP4) ve uydunun kendi alarm hafizasi. Hic orneklenmemis uydu "temiz"
 * diye gosterilmez.
 */

const GROUP_COLOR = new Map(SAT_GROUPS.map((g) => [g.id, g.color]));

export default function OzetFilo() {
  const sim = useConsole((s) => s.sim);
  const selected = useConsole((s) => s.selectedNorad);
  const selectSatellite = useConsole((s) => s.selectSatellite);
  useConsole((s) => s.version);

  const summaries = fleet.summaries();
  const utcMs = sim.clock.utcMs();
  const rows = SATELLITES.map((sat) => {
    const el = elevationAt(sat, utcMs);
    return { sat, el, visible: el >= GROUND_STATION.min_elevation_deg, sum: summaries.get(sat.norad) };
  });
  const gorunen = rows.filter((r) => r.visible).length;
  const onaysiz = rows.reduce((n, r) => n + (r.sum?.unacked ?? 0), 0);

  return (
    <section className="panel flex flex-col min-h-0">
      <div className="panel-title flex items-center justify-between">
        <span>Filo durumu</span>
        <span className="normal-case tracking-normal text-ops-faint">
          <span className="num text-ops-dim">{gorunen}</span> uydu görünür · <span className="num text-ops-dim">{fleet.size}</span>/
          <span className="num">{SATELLITES.length}</span> örneklendi ·{' '}
          <span className={onaysiz > 0 ? 'text-ops-warn' : ''}>
            <span className="num">{onaysiz}</span> onaysız alarm
          </span>{' '}
          · seçmek için tıklayın
        </span>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-3 auto-rows-fr gap-px bg-ops-line overflow-y-auto">
        {rows.map(({ sat, el, visible, sum }) => {
          const isSel = sat.norad === selected;
          const sv = sum && sum.worstSeverity >= 0 ? severityStyle(sum.worstSeverity) : null;
          const durum = !sum
            ? { text: 'henüz örneklenmedi', cls: 'text-ops-faint' }
            : sum.alarms === 0
              ? { text: '✓ alarm yok', cls: 'text-ops-nominal/80' }
              : {
                  text: (sum.unacked > 0 ? sum.unacked + ' onaysız · ' : '') + sum.alarms + ' alarm',
                  cls: sv!.text,
                };
          return (
            <button
              key={sat.norad}
              onClick={() => selectSatellite(sat.norad)}
              aria-pressed={isSel}
              title={sat.operator + ' · ' + sat.mission + ' · ' + sat.intlDes}
              aria-label={sat.name + ', yükselti ' + el.toFixed(0) + ' derece, ' + durum.text}
              className={
                'min-h-[56px] px-3 py-1.5 text-left flex flex-col justify-center gap-[5px] border-l-2 transition-colors ' +
                (isSel
                  ? 'bg-ops-sunken border-l-ops-text'
                  : 'bg-ops-panel hover:bg-white/[0.03] ' + (sv && sum!.unacked > 0 ? sv.borderL : 'border-l-transparent'))
              }
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{ color: GROUP_COLOR.get(sat.group) }} className="text-[9px] leading-none">
                  ●
                </span>
                <span className={'text-[12px] leading-none truncate ' + (isSel ? 'text-ops-text font-semibold' : 'text-ops-dim')}>
                  {sat.name}
                </span>
                {isSel && <span className="text-3xs tracking-[0.14em] text-ops-text border border-ops-line2 px-1 leading-[12px]">SEÇİLİ</span>}
                <span className={'num text-[11px] leading-none ml-auto shrink-0 ' + (visible ? 'text-ops-nominal' : 'text-ops-faint')}>
                  {el >= 0 ? '+' : ''}
                  {el.toFixed(0)}°
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-3xs leading-none min-w-0">
                <span
                  className={
                    'inline-block w-[6px] h-[6px] shrink-0 ' +
                    (sv ? sv.dot + ' sev-pattern-' + sum!.worstSeverity : sum ? 'bg-ops-nominal/50' : 'border border-ops-line2')
                  }
                />
                <span className={'truncate ' + durum.cls}>{durum.text}</span>
                <span className="num text-ops-faint ml-auto shrink-0">
                  {sat.orbitClass} · {visible ? 'görünür' : 'görüş dışı'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
