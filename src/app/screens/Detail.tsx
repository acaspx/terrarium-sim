import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Droplets, Eraser, Leaf, Scissors, Share2, Wind } from 'lucide-react';
import {
  alerts, dli, faunaSpecies, healthScore, LIDS, PLACEMENTS, GROW_LIGHTS, lightFor, plantSpecies, VESSELS,
  type Alert, type LidId, type PlacementId, type TerrariumState,
} from '../../engine/index.js';
import { Jar3D } from '../jar/Jar3D.js';
import { clockOf, dayOf, glassWord, headline, moistureWord, pHWord, plantStatus, soilAirWord, vpdWord } from '../format.js';
import { care, store, useStore, type JarRecord } from '../store.js';
import { Meter, Segmented, Sparkline } from '../ui/controls.js';
import { share, sharedFrom } from '../playground.js';

export function Detail({ id }: { id: string }) {
  useStore();
  const j = store.get(id);
  useEffect(() => {
    store.markSeen(id);
  });
  if (!j) {
    return (
      <main className="detail-page">
        <p className="empty-note">This terrarium is no longer on your shelf. <a href="#/">Back to the shelf</a></p>
      </main>
    );
  }
  const s = j.state;
  const h = headline(s);
  return (
    <main className="detail-page">
      <a className="back" href="#/"><ArrowLeft size={16} aria-hidden="true" /> Shelf</a>
      <div className="detail">
        <div className="detail-jar">
          <div className="stage-3d">
            <Jar3D spec={j.spec} state={s} title={`${j.spec.name}, day ${dayOf(s)}`} />
            <span className="stage-hint">Drag to spin. Tap plants, soil and glass.</span>
          </div>
          <p className="jar-caption">
            Day {dayOf(s)}, {clockOf(s)}. Lights {s.climate.lightOn ? 'on' : 'off'}.
          </p>
        </div>

        <div className="detail-body">
          <header className="detail-head">
            <NameField j={j} />
            <p className="detail-sub">
              {VESSELS.find((v) => v.id === j.spec.vessel)?.label}, {j.spec.sizeL} L. Health{' '}
              <span className={`score score-${h.tone}`}>{healthScore(s)}</span>
            </p>
            <ShareBox j={j} />
          </header>

          <Conditions s={s} history={j} />
          <Attention j={j} />
          <Care j={j} />
          <Plants j={j} />
          <Animals j={j} />
          <Journal s={s} />
          <Manage j={j} />
        </div>
      </div>
    </main>
  );
}

function NameField({ j }: { j: JarRecord }) {
  const [value, setValue] = useState(j.spec.name);
  return (
    <h1 className="name-field">
      <label className="visually-hidden" htmlFor="jar-name">Name</label>
      <input
        id="jar-name" value={value} onChange={(e) => setValue(e.target.value)}
        onBlur={() => store.rename(j.id, value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </h1>
  );
}

function Conditions({ s, history: j }: { s: TerrariumState; history: JarRecord }) {
  const cl = s.climate;
  const last = j.history.slice(-60);
  return (
    <section className="block" aria-labelledby="cond">
      <h2 id="cond">Conditions</h2>
      <dl className="vitals">
        <div>
          <dt>Soil</dt>
          <dd>{moistureWord(cl.moisture)}<span className="unit"> {Math.round(cl.moisture * 100)}%</span></dd>
          <Meter value={cl.moisture / 1.3} band={[0.5 / 1.3, 0.9 / 1.3]} label="Soil moisture, share of field capacity" />
        </div>
        <div>
          <dt>Humidity</dt>
          <dd>{Math.round(cl.rh * 100)}<span className="unit">%</span></dd>
          <Meter value={cl.rh} band={[0.7, 1]} label="Relative humidity" />
        </div>
        <div>
          <dt>Air</dt>
          <dd>{cl.airTempC.toFixed(1)}<span className="unit"> °C</span></dd>
          <Meter value={(cl.airTempC - 10) / 25} band={[(18 - 10) / 25, (27 - 10) / 25]} label="Air temperature" />
        </div>
        <div>
          <dt>Glass</dt>
          <dd>{glassWord(cl.condensationIndex)}</dd>
          <Meter value={cl.condensationIndex / 1.2} band={[0.05 / 1.2, 0.6 / 1.2]} label="Condensation on the glass" />
        </div>
        <div>
          <dt>CO₂</dt>
          <dd>{Math.round(cl.co2Ppm).toLocaleString()}<span className="unit"> ppm</span></dd>
          <Meter value={Math.min(1, cl.co2Ppm / 5000)} label="Carbon dioxide" />
        </div>
        {s.soil && (
          <>
            <div>
              <dt>Soil pH</dt>
              <dd>{s.soil.pH.toFixed(1)}<span className="unit"> {pHWord(s.soil.pH).toLowerCase()}</span></dd>
              <Meter value={(s.soil.pH - 3.5) / 5} band={[(5.5 - 3.5) / 5, (7 - 3.5) / 5]} label="Soil pH, 3.5 to 8.5" />
            </div>
            <div>
              <dt>Soil air</dt>
              <dd>{soilAirWord(s.soil.air)}</dd>
              <Meter value={s.soil.air} band={[0.6, 1]} label="Air in the soil, sour to open" />
            </div>
          </>
        )}
        <div>
          <dt>VPD</dt>
          <dd>{(cl.vpdKPa ?? 0).toFixed(2)}<span className="unit"> kPa</span></dd>
          <Meter value={Math.min(1, (cl.vpdKPa ?? 0) / 1.5)} band={[0, 0.6 / 1.5]} label={`Vapour pressure deficit: ${vpdWord(cl.vpdKPa ?? 0).toLowerCase()}`} />
        </div>
        <div>
          <dt>Daily light</dt>
          <dd>{dli(s.container).toFixed(1)}<span className="unit"> mol/m²</span></dd>
          <Meter value={Math.min(1, dli(s.container) / 15)} band={[2 / 15, 8 / 15]} label="Daily light integral" />
        </div>
      </dl>
      {last.length > 2 && (
        <div className="trends">
          <figure>
            <figcaption>Health, last {last.length} days</figcaption>
            <Sparkline values={last.map((p) => p.score)} min={0} max={100} band={[70, 100]} />
          </figure>
          <figure>
            <figcaption>Soil moisture</figcaption>
            <Sparkline values={last.map((p) => p.moist)} min={0} max={1.3} band={[0.5, 0.9]} />
          </figure>
          <figure>
            <figcaption>Mold</figcaption>
            <Sparkline values={last.map((p) => p.mold)} min={0} />
          </figure>
        </div>
      )}
    </section>
  );
}

/** Each alert carries the action that fixes it, one tap away. */
function fixFor(a: Alert, j: JarRecord): { label: string; run: () => void } | null {
  const act = (fn: (s: TerrariumState) => void) => () => store.act(j.id, fn);
  switch (a.code) {
    case 'too-dry': return { label: 'Mist 30 ml', run: act((s) => care.mist(s, 30)) };
    case 'too-wet':
    case 'heavy-condensation': return { label: 'Air out for 6 hours', run: act((s) => care.airOut(s, 6)) };
    case 'waterlogged': return { label: 'Air out for a day', run: act((s) => care.airOut(s, 24)) };
    case 'fungus-gnats': return { label: 'Air out for a day', run: act((s) => care.airOut(s, 24)) };
    case 'mold-bloom': return { label: 'Remove visible mold', run: act((s) => care.removeMold(s)) };
    case 'colony-crashing': return { label: 'Add leaf litter', run: act((s) => care.feed(s, 3)) };
    case 'overgrown': {
      const p = j.state.plants.find((pl) => a.message.startsWith(plantSpecies(pl.speciesId).commonName));
      return p ? { label: 'Prune by a third', run: act((s) => care.prune(s, p.id, 0.33)) } : null;
    }
    case 'overheating': return { label: 'Move to an east window', run: act((s) => care.setLight(s, 90, 9)) };
    default: return null;
  }
}

function Attention({ j }: { j: JarRecord }) {
  const list = alerts(j.state);
  if (list.length === 0) return null;
  return (
    <section className="block" aria-labelledby="att">
      <h2 id="att">Needs attention</h2>
      <ul className="alerts">
        {list.map((a) => {
          const fix = fixFor(a, j);
          return (
            <li key={a.code + a.message} className={`alert alert-${a.severity}`}>
              <div>
                <p className="alert-msg">{a.message}</p>
                <p className="alert-fix">{a.fix}</p>
              </div>
              {fix && <button type="button" className="button secondary" onClick={fix.run}>{fix.label}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Care({ j }: { j: JarRecord }) {
  const s = j.state;
  const act = (fn: (st: TerrariumState) => void) => store.act(j.id, fn);
  const vessel = VESSELS.find((v) => v.id === j.spec.vessel)!;
  const placement = PLACEMENTS.find((p) => p.ppfd === s.container.light.ppfd && p.hours === s.container.light.photoperiodH)?.id
    ?? (GROW_LIGHTS.some((g) => g.ppfd === s.container.light.ppfd) && s.container.light.photoperiodH === 12 ? 'grow-light' : j.spec.placement);
  const airing = s.ventRevert ? Math.max(0, s.ventRevert.hour - s.hour) : 0;
  return (
    <section className="block" aria-labelledby="care">
      <h2 id="care">Care</h2>
      <div className="care-actions">
        <button type="button" className="button" onClick={() => act((st) => care.mist(st, 20))}><Droplets size={16} aria-hidden="true" /> Mist</button>
        <button type="button" className="button" onClick={() => act((st) => care.airOut(st, 6))} disabled={airing > 0}>
          <Wind size={16} aria-hidden="true" /> {airing > 0 ? `Airing out, ${airing} h left` : 'Air out for 6 hours'}
        </button>
        <button type="button" className="button" onClick={() => act((st) => care.feed(st, 3))}><Leaf size={16} aria-hidden="true" /> Add leaf litter</button>
        <button type="button" className="button" onClick={() => act((st) => care.removeMold(st))}><Eraser size={16} aria-hidden="true" /> Remove mold</button>
      </div>
      <div className="care-settings">
        <div className="field">
          <span className="field-label">Lid</span>
          <Segmented<LidId>
            label="Lid" size="sm" value={j.spec.lid}
            options={LIDS.filter((l) => vessel.lids.includes(l.id)).map((l) => ({ id: l.id, label: l.label, detail: l.detail }))}
            onChange={(lid) => {
              j.spec.lid = lid;
              act((st) => care.setVentilation(st, (LIDS.find((l) => l.id === lid)!.vent) * vessel.opening + (j.spec.vessel === 'cloche' ? 0.02 : 0)));
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">Placement</span>
          <Segmented<PlacementId>
            label="Placement" size="sm" value={placement}
            options={PLACEMENTS.map((p) => ({ id: p.id, label: p.label, detail: p.detail }))}
            onChange={(id) => {
              j.spec.placement = id;
              const l = lightFor(j.spec);
              act((st) => care.setLight(st, l.ppfd, l.hours));
            }}
          />
        </div>
      </div>
    </section>
  );
}

function Plants({ j }: { j: JarRecord }) {
  const s = j.state;
  const lost = j.spec.plants.length - s.plants.length;
  return (
    <section className="block" aria-labelledby="plants">
      <h2 id="plants">Plants</h2>
      {s.plants.length === 0 ? <p className="empty-note">No plants are alive.</p> : (
        <ul className="roster">
          {s.plants.map((p) => {
            const sp = plantSpecies(p.speciesId);
            const st = plantStatus(p);
            return (
              <li key={p.id}>
                <div className="roster-name">
                  <span>{sp.commonName}</span>
                  <span className="roster-sci">{sp.scientificName}</span>
                  {(p.shade ?? 0) >= 0.2 && <span className="roster-note">In a taller plant's shade, losing {Math.round(p.shade! * 100)}% of its light</span>}
                </div>
                <span className={`pill tone-${st.tone}`}>{st.word}</span>
                <div className="roster-meter">
                  <Meter value={p.biomassG / sp.maxBiomassG} label={`${sp.commonName} size`} />
                  <span className="roster-num">{p.biomassG.toFixed(1)} g</span>
                </div>
                <button type="button" className="icon-button" aria-label={`Prune ${sp.commonName} by a third`} title="Prune by a third"
                  onClick={() => store.act(j.id, (st2) => care.prune(st2, p.id, 0.33))}>
                  <Scissors size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lost > 0 && <p className="note">{lost === 1 ? 'One plant has' : `${lost} plants have`} died and returned to the soil.</p>}
    </section>
  );
}

function Animals({ j }: { j: JarRecord }) {
  const s = j.state;
  if (s.fauna.length === 0) return (
    <section className="block" aria-labelledby="animals">
      <h2 id="animals">Animals</h2>
      <p className="empty-note">No animals. Mold and dead leaves will build up without a clean-up crew.</p>
    </section>
  );
  return (
    <section className="block" aria-labelledby="animals">
      <h2 id="animals">Animals</h2>
      <ul className="roster">
        {s.fauna.map((f) => {
          const sp = faunaSpecies(f.speciesId);
          const pop = Math.round(f.juveniles + f.adults);
          const series = j.history.slice(-60).map((p) => p.pop[f.speciesId] ?? 0);
          return (
            <li key={f.speciesId}>
              <div className="roster-name">
                <span>{sp.commonName}{sp.role === 'pest' && <span className="pill tone-warn">Pest</span>}</span>
                <span className="roster-sci">{sp.scientificName}</span>
              </div>
              <span className="roster-count">{pop.toLocaleString()}<span className="unit"> + {Math.round(f.eggs).toLocaleString()} eggs</span></span>
              <Sparkline values={series} min={0} width={120} height={28} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Journal({ s }: { s: TerrariumState }) {
  const items = [...s.events].reverse().slice(0, 40);
  return (
    <section className="block" aria-labelledby="journal">
      <h2 id="journal">Journal</h2>
      {items.length === 0 ? <p className="empty-note">Nothing has happened yet. Give it a few days.</p> : (
        <ol className="journal">
          {items.map((e, i) => (
            <li key={`${e.hour}-${i}`} className={`journal-${e.type}`}>
              <span className="journal-day">Day {Math.floor(e.hour / 24)}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Manage({ j }: { j: JarRecord }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="block manage">
      <a className="button secondary" href={`#/new?from=${j.id}`}>Build another like this</a>
      {confirm ? (
        <span className="confirm">
          Remove {j.spec.name} from the shelf for good?
          <button type="button" className="button danger" onClick={() => { store.remove(j.id); location.hash = '#/'; }}>Remove it</button>
          <button type="button" className="button quiet" onClick={() => setConfirm(false)}>Keep it</button>
        </span>
      ) : (
        <button type="button" className="button quiet" onClick={() => setConfirm(true)}>Remove from shelf</button>
      )}
    </section>
  );
}

function ShareBox({ j }: { j: JarRecord }) {
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState(() => {
    try {
      return localStorage.getItem('terrarium-sim:author') ?? '';
    } catch {
      return '';
    }
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = sharedFrom(j.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem('terrarium-sim:author', author.trim());
      } catch {
        /* not essential */
      }
      const item = await share(j, author, note);
      location.hash = `#/playground/${item.id}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="share-row">
        <button type="button" className="button secondary" onClick={() => setOpen(true)} disabled={j.state.plants.length === 0}>
          <Share2 size={16} aria-hidden="true" /> Share to playground
        </button>
        {previous.length > 0 && (
          <a className="hint" href={`#/playground/${previous[previous.length - 1]}`}>
            {previous.length === 1 ? 'Shared once. See it' : `Shared ${previous.length} times. See the latest`}
          </a>
        )}
      </div>
    );
  }
  return (
    <form className="share-form" onSubmit={submit}>
      <p className="hint">
        Everyone visiting the playground will see {j.spec.name} as it is today, day {dayOf(j.state)}. Your jar stays on your shelf and keeps growing.
      </p>
      <label className="field">
        <span className="field-label">Your name <span className="unit">optional</span></span>
        <input className="small-input" value={author} maxLength={32} onChange={(e) => setAuthor(e.target.value)} placeholder="Anonymous keeper" autoComplete="nickname" />
      </label>
      <label className="field">
        <span className="field-label">A note <span className="unit">optional</span></span>
        <textarea className="small-input" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="What you would tell someone planting one like it" />
      </label>
      {error && <p className="issue issue-critical" role="alert">{error}</p>}
      <div className="share-row">
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Sharing…' : 'Share it'}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
