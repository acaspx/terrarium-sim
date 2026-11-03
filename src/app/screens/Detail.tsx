import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Droplets, Eraser, Film, Leaf, PencilLine, Scissors, Shovel, Share2, Wind } from 'lucide-react';
import {
  alerts, autoLayout, CREW_COUNTS, CREW_IDS, dli, faunaSpecies, healthScore, LIDS, PLACEMENTS, PLANT_IDS, PLANT_SIZES, plantBiomass,
  GROW_LIGHTS, lightFor, plantSpecies, VESSELS,
  type Alert, type LidId, type PlacementId, type PlantSizeId, type TerrariumState,
} from '../../engine/index.js';
import { Jar3D } from '../jar/Jar3D.js';
import { clockOf, dayOf, glassWord, headline, moistureWord, pHWord, plantStatus, pluralName, soilAirWord, vpdWord } from '../format.js';
import { care, store, useStore, type JarRecord } from '../store.js';
import { Meter, Segmented, Sparkline } from '../ui/controls.js';
import { Swatch, SwatchRow } from '../ui/Swatch.js';
import { share, sharedFrom, useIdentity } from '../playground.js';
import { KeeperForm } from '../ui/KeeperForm.js';
import { TimeLapse } from '../ui/TimeLapse.js';
import { FOCUS_LABEL, useSectionFocus } from '../ui/useSectionFocus.js';
import { framesToMoments, type Moment } from '../../playground/living.js';

export function Detail({ id }: { id: string }) {
  useStore();
  const j = store.get(id);
  useEffect(() => {
    store.markSeen(id);
  });
  // While the time-lapse is open, the moment it is showing; otherwise the jar as it is now.
  const [showing, setShowing] = useState<TerrariumState | null>(null);
  const show = useCallback((st: TerrariumState | null) => setShowing(st), []);
  // The section being read decides what the view beside it frames, as in the builder.
  const { ref: bodyRef, focus: sectionFocus, setFocus, claim } = useSectionFocus();
  // Edit mode: plants and wood can be dragged in the view, and the Plants and Animals
  // sections offer planting, digging out, and adding or taking out animals.
  const [editing, setEditing] = useState(false);
  if (!j) {
    return (
      <main className="detail-page">
        <p className="empty-note">This terrarium is no longer on your shelf. <a href="#/">Back to the shelf</a></p>
      </main>
    );
  }
  const s = j.state;
  const h = headline(s);
  // While editing, look down onto the soil (as when arranging in the builder) unless the
  // Animals section is being worked on.
  const focus = editing && sectionFocus === 'all' ? 'plants' : sectionFocus;
  const movable = j.spec.hardscape.filter((x) => x === 'wood' || x === 'stone');
  const arrange = (plantId: string, at: [number, number]) => store.edit(j.id, (r) => movePlantIn(r, plantId, at));
  const place = (what: 'wood' | 'stone', placed: { at: [number, number]; turn?: number }) =>
    store.edit(j.id, (r) => { r.spec.placed = { ...r.spec.placed, [what]: placed }; });
  return (
    <main className="detail-page workbench-page">
      <a className="back" href="#/"><ArrowLeft size={16} aria-hidden="true" /> Shelf</a>
      <div className="detail workbench">
        <div className="detail-body" ref={bodyRef} onPointerDownCapture={claim} onFocusCapture={claim}>
          <header className="detail-head" data-focus="all">
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
          <Plants j={j} editing={editing} />
          <Animals j={j} editing={editing} />
          <Journal s={s} />
          <Manage j={j} />
        </div>

        <aside className="detail-jar workbench-view" aria-label={`${j.spec.name} in 3D`}>
          <div className="stage-3d" onPointerDownCapture={() => setFocus('all')}>
            <Jar3D spec={j.spec} state={editing ? s : showing ?? s} title={`${j.spec.name}, day ${dayOf(editing ? s : showing ?? s)}`} view="iso" focus={focus}
              onArrange={editing ? arrange : undefined} onPlace={editing && movable.length ? place : undefined} />
            <span className="stage-focus" aria-live="polite">{editing ? 'Editing' : FOCUS_LABEL[focus]}</span>
            <span className="stage-score">Health <span className={`score score-${h.tone}`}>{healthScore(s)}</span></span>
            {/* Keyed so the new hint shows (and fades) again. */}
            <span className="stage-hint" key={editing ? 'edit' : 'spin'}>{editing
              ? `Drag ${movable.length ? 'plants, wood or stone' : 'a plant'} to move ${movable.length ? 'them' : 'it'}.${movable.includes('wood') ? ' Tap the wood to turn it.' : ''} Drag elsewhere to spin the jar.`
              : 'Drag to spin. Tap plants, soil and glass.'}</span>
          </div>
          <div className="preview-bar">
            <button type="button" className={`button${editing ? ' primary' : ''}`} aria-pressed={editing}
              onClick={() => { setEditing((e) => !e); setShowing(null); }}>
              {editing ? <><Check size={16} aria-hidden="true" /> Done editing</> : <><PencilLine size={16} aria-hidden="true" /> Edit jar</>}
            </button>
            <p className="hint arrange-hint">
              {editing
                ? 'Changes happen to the jar as it is now: it keeps its age, soil, water and everything already living in it.'
                : 'Plant, dig out, add animals or move things around.'}
            </p>
          </div>
          {!editing && <OwnLife j={j} onShow={show} />}
          <p className="jar-caption">
            Day {dayOf(s)}, {clockOf(s)}. Lights {s.climate.lightOn ? 'on' : 'off'}.
          </p>
        </aside>
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
    <section className="block" aria-labelledby="cond" data-focus="all">
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
    case 'overheating': return { label: 'Move to an east window', run: act((s) => care.setLight(s, 90, 9, true)) };
    default: return null;
  }
}

function Attention({ j }: { j: JarRecord }) {
  const list = alerts(j.state);
  if (list.length === 0) return null;
  return (
    <section className="block" aria-labelledby="att" data-focus="all">
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

/** Mold below this shows no patches in the 3D jar (see Mold in Terrarium3D): only a trace is left. */
const visibleMold = (st: TerrariumState) => st.pools.moldG > 0.01 * st.container.substrateL;

function Care({ j }: { j: JarRecord }) {
  const s = j.state;
  const act = (fn: (st: TerrariumState) => void) => store.act(j.id, fn);
  // What the last action did. Their effects are small next to a whole jar (20 ml against
  // half a litre in the soil), so say so, with the reading that moved.
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(t);
  }, [note]);
  const say = (text: string) => setNote({ text, at: Date.now() });
  const soil = () => Math.round(j.state.climate.moisture * 100);
  const onMist = () => {
    const before = soil();
    act((st) => care.mist(st, 20));
    say(`Misted 20 ml. Soil ${before}% → ${soil()}%.`);
  };
  const onAirOut = () => {
    act((st) => care.airOut(st, 6));
    say('Lid off for 6 hours (6 jar hours: the clock above sets how fast). The glass clears and the soil dries a little; then it goes back on.');
  };
  const onFeed = () => {
    const before = j.state.pools.detritusG;
    act((st) => care.feed(st, 3));
    say(`Added 3 g of leaf litter. Food for the clean-up crew: ${before.toFixed(0)} g → ${j.state.pools.detritusG.toFixed(0)} g.`);
  };
  const onRemoveMold = () => {
    if (!visibleMold(j.state)) return say('No visible mold to remove.');
    act((st) => care.removeMold(st));
    say('Removed most of the visible mold. Spores stay, so it can come back while the jar is damp and still.');
  };
  const vessel = VESSELS.find((v) => v.id === j.spec.vessel)!;
  const placement = PLACEMENTS.find((p) => p.ppfd === s.container.light.ppfd && p.hours === s.container.light.photoperiodH)?.id
    ?? (GROW_LIGHTS.some((g) => g.ppfd === s.container.light.ppfd) && s.container.light.photoperiodH === 12 ? 'grow-light' : j.spec.placement);
  const airing = s.ventRevert ? Math.max(0, s.ventRevert.hour - s.hour) : 0;
  return (
    <section className="block" aria-labelledby="care" data-focus="all">
      <h2 id="care">Care</h2>
      <div className="care-actions">
        <button type="button" className="button" onClick={onMist}><Droplets size={16} aria-hidden="true" /> Mist</button>
        <button type="button" className="button" onClick={onAirOut} disabled={airing > 0}>
          <Wind size={16} aria-hidden="true" /> {airing > 0 ? `Airing out, ${airing} h left` : 'Air out for 6 hours'}
        </button>
        <button type="button" className="button" onClick={onFeed}><Leaf size={16} aria-hidden="true" /> Add leaf litter</button>
        <button type="button" className="button" onClick={onRemoveMold}><Eraser size={16} aria-hidden="true" /> Remove mold</button>
      </div>
      {/* Keyed so a repeated action shows (and fades in) again. */}
      <p className="care-note" role="status" key={note?.at}>{note?.text ?? '\u00a0'}</p>
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
              act((st) => care.setLight(st, l.ppfd, l.hours, id.endsWith('-window')));
            }}
          />
        </div>
      </div>
    </section>
  );
}

/** Living plants at once; the builder's limit. */
const MAX_PLANTS = 8;

/** Where each living plant stands, u and v in [-1, 1]. */
function plantSpots(st: TerrariumState, seed: number): [number, number][] {
  const auto = autoLayout(st.plants, seed);
  return st.plants.map((p, i) => p.at ?? auto[i]!);
}

/**
 * A free spot for a new plant: the place on the floor farthest from every plant already
 * there and from the wood and stone, leaning toward the middle when it is a tie.
 */
function freeSpot(j: JarRecord): [number, number] {
  const taken = [...plantSpots(j.state, j.spec.seed), ...[j.spec.placed?.wood?.at, j.spec.placed?.stone?.at].filter((x): x is [number, number] => !!x)];
  let best: [number, number] = [0, 0];
  let bestScore = -Infinity;
  for (let u = -0.7; u <= 0.701; u += 0.1) {
    for (let v = -0.7; v <= 0.701; v += 0.1) {
      if (Math.hypot(u, v) > 0.8) continue;
      const room = taken.length ? Math.min(...taken.map(([x, y]) => Math.hypot(u - x, v - y))) : 1;
      const score = room - 0.15 * Math.hypot(u, v);
      if (score > bestScore) {
        bestScore = score;
        best = [+u.toFixed(2), +v.toFixed(2)];
      }
    }
  }
  return best;
}

/** The design entry for a living plant: same species, and the same spot when it has one. */
function specIndexFor(j: JarRecord, plantId: string): number {
  const pl = j.state.plants.find((p) => p.id === plantId);
  if (!pl) return -1;
  const same = j.spec.plants.map((p, i) => ({ p, i })).filter(({ p }) => p.speciesId === pl.speciesId);
  const at = pl.at;
  const exact = at && same.find(({ p }) => p.at && p.at[0] === at[0] && p.at[1] === at[1]);
  return (exact ?? same[same.length - 1])?.i ?? -1;
}

function movePlantIn(j: JarRecord, plantId: string, at: [number, number]) {
  const i = specIndexFor(j, plantId);
  care.movePlant(j.state, plantId, at);
  if (i >= 0) j.spec.plants[i] = { ...j.spec.plants[i]!, at };
}

function Plants({ j, editing }: { j: JarRecord; editing: boolean }) {
  const s = j.state;
  const lost = j.spec.plants.length - s.plants.length;
  // A dig-out waits for a second tap: it cannot be undone.
  const [digging, setDigging] = useState<string | null>(null);
  useEffect(() => {
    if (!digging) return;
    const t = setTimeout(() => setDigging(null), 5000);
    return () => clearTimeout(t);
  }, [digging]);
  const digOut = (plantId: string) => store.edit(j.id, (r) => {
    const i = specIndexFor(r, plantId);
    care.digOut(r.state, plantId);
    if (i >= 0) r.spec.plants.splice(i, 1);
  });
  return (
    <section className="block" aria-labelledby="plants" data-focus="plants">
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
                {editing ? (
                  digging === p.id ? (
                    <span className="roster-actions">
                      <button type="button" className="button danger small" onClick={() => { digOut(p.id); setDigging(null); }}>Dig it out</button>
                      <button type="button" className="button quiet small" onClick={() => setDigging(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="icon-button" aria-label={`Dig out ${sp.commonName}`} title="Dig out"
                      onClick={() => setDigging(p.id)}>
                      <Shovel size={16} aria-hidden="true" />
                    </button>
                  )
                ) : (
                  <button type="button" className="icon-button" aria-label={`Prune ${sp.commonName} by a third`} title="Prune by a third"
                    onClick={() => store.act(j.id, (st2) => care.prune(st2, p.id, 0.33))}>
                    <Scissors size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lost > 0 && <p className="note">{lost === 1 ? 'One plant has' : `${lost} plants have`} died and returned to the soil.</p>}
      {editing && <PlantSomething j={j} />}
    </section>
  );
}

/** Plant something new in a living jar, at the size you would buy it. */
function PlantSomething({ j }: { j: JarRecord }) {
  const [size, setSize] = useState<PlantSizeId>('small');
  const [last, setLast] = useState<string | null>(null);
  const living = j.state.plants.length;
  const full = living >= MAX_PLANTS;
  const plant = (speciesId: string) => {
    store.edit(j.id, (r) => {
      const at = freeSpot(r);
      care.plant(r.state, speciesId, plantBiomass(speciesId, size), at);
      r.spec.plants.push({ speciesId, size, at });
    });
    setLast(speciesId);
  };
  return (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <h3>Plant something</h3>
        <Segmented<PlantSizeId> label="Size to plant" size="sm" value={size} onChange={setSize}
          options={PLANT_SIZES.map((z) => ({ id: z.id, label: z.label }))} />
      </div>
      <SwatchRow label="Plant something" multi>
        {PLANT_IDS.map((id) => {
          const sp = plantSpecies(id);
          const n = j.state.plants.filter((p) => p.speciesId === id).length;
          return (
            <Swatch key={id} k={`plant:${id}`} kind="action" label={sp.commonName} detail={sp.notes} selected={n > 0} badge={n || undefined}
              disabled={full} onClick={() => plant(id)} />
          );
        })}
      </SwatchRow>
      <p className="hint" role="status">
        {full
          ? `${MAX_PLANTS} plants is a full jar. Dig one out to make room.`
          : last
            ? `Planted a ${plantSpecies(last).commonName.toLowerCase()} in the clearest spot. Drag it in the view to move it.`
            : 'Each goes in the clearest spot on the soil. Drag it in the view to move it.'}
      </p>
    </div>
  );
}

function Animals({ j, editing }: { j: JarRecord; editing: boolean }) {
  const s = j.state;
  const takeAll = (speciesId: string) => store.edit(j.id, (r) => {
    care.removeAnimals(r.state, speciesId, Infinity);
    r.spec.fauna = r.spec.fauna.filter((f) => f.speciesId !== speciesId);
  });
  return (
    <section className="block" aria-labelledby="animals" data-focus="crew">
      <h2 id="animals">Animals</h2>
      {s.fauna.length === 0 ? (
        <p className="empty-note">No animals. Mold and dead leaves will build up without a clean-up crew.</p>
      ) : (
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
                {editing && (
                  <button type="button" className="button quiet small" onClick={() => takeAll(f.speciesId)}>
                    Take all out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <AddAnimals j={j} />}
    </section>
  );
}

/** Add a batch of a clean-up species, or take a batch back out. */
function AddAnimals({ j }: { j: JarRecord }) {
  const [note, setNote] = useState<string | null>(null);
  const batch = (id: string) => CREW_COUNTS[id]?.[0] ?? 10;
  const name = (id: string, n: number) => (n === 1 ? faunaSpecies(id).commonName.toLowerCase() : pluralName(faunaSpecies(id).commonName));
  const add = (id: string) => {
    const n = batch(id);
    store.edit(j.id, (r) => {
      care.addAnimals(r.state, id, n);
      const f = r.spec.fauna.find((x) => x.speciesId === id);
      if (f) f.count += n;
      else r.spec.fauna.push({ speciesId: id, count: n });
    });
    setNote(`Added ${n} ${name(id, n)}. They settle in over the next few days.`);
  };
  const remove = (id: string) => {
    const living = j.state.fauna.find((f) => f.speciesId === id);
    if (!living) return;
    const pop = Math.round(living.adults + living.juveniles);
    const n = Math.min(pop, batch(id));
    store.edit(j.id, (r) => {
      care.removeAnimals(r.state, id, n);
      const f = r.spec.fauna.find((x) => x.speciesId === id);
      if (f) f.count = Math.max(0, f.count - n);
      r.spec.fauna = r.spec.fauna.filter((x) => x.count > 0 || r.state.fauna.some((g) => g.speciesId === x.speciesId));
    });
    setNote(n >= pop ? `Took out all the ${pluralName(faunaSpecies(id).commonName)}.` : `Took out ${n} ${name(id, n)}.`);
  };
  return (
    <div className="edit-panel">
      <div className="edit-panel-head"><h3>Add animals</h3></div>
      <SwatchRow label="Add animals" multi>
        {CREW_IDS.map((id) => {
          const sp = faunaSpecies(id);
          const living = j.state.fauna.find((f) => f.speciesId === id);
          const pop = living ? Math.round(living.adults + living.juveniles) : 0;
          return (
            <Swatch key={id} k={`crew:${id}`} kind="action" label={pluralName(sp.commonName).replace(/^./, (c) => c.toUpperCase())} detail={sp.notes}
              selected={pop > 0} badge={pop ? (pop > 999 ? `${Math.round(pop / 1000)}k` : pop) : undefined}
              onClick={() => add(id)}
              removeLabel={`Take out ${Math.min(pop, batch(id))} ${name(id, 2)}`}
              onRemove={pop > 0 ? () => remove(id) : undefined} />
          );
        })}
      </SwatchRow>
      <p className="hint" role="status">{note ?? 'Tap to add a batch, as you would buy them. Tap \u2212 to take a batch out.'}</p>
    </div>
  );
}

function Journal({ s }: { s: TerrariumState }) {
  const items = [...s.events].reverse().slice(0, 40);
  return (
    <section className="block" aria-labelledby="journal" data-focus="all">
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
  const me = useIdentity();
  const [open, setOpen] = useState(false);
  // Signed out when the box opened: show the username step until it is finished
  // (including saving the recovery code), even though claiming signs you in at once.
  const [joining, setJoining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = sharedFrom(j.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const item = await share(j, note);
      location.hash = `#/community/${item.id}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="share-row">
        <button type="button" className="button secondary" onClick={() => { setOpen(true); setJoining(!me); }} disabled={j.state.plants.length === 0}>
          <Share2 size={16} aria-hidden="true" /> Share to community shelf
        </button>
        {previous.length > 0 && (
          <a className="hint" href={`#/community/${previous[previous.length - 1]}`}>
            {previous.length === 1 ? 'Shared once. See it' : `Shared ${previous.length} times. See the latest`}
          </a>
        )}
      </div>
    );
  }
  // Sharing is done as a keeper, so pick a username (or sign in) first.
  if (!me || joining) {
    return (
      <div className="share-form">
        <KeeperForm intro="To share, pick a username. It shows on everything you share, and gives you a shelf of your own."
          onDone={() => setJoining(false)} />
        <div className="share-row">
          <button type="button" className="button quiet" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <form className="share-form" onSubmit={submit}>
      <p className="hint">
        Everyone visiting the community shelf will see {j.spec.name} as it is today, day {dayOf(j.state)}, shared by{' '}
        <a href={`#/u/${me.name}`}>@{me.name}</a>. Your jar stays here and keeps growing.
      </p>
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

/** The jar's own time-lapse, from the weekly frames it has recorded. */
function OwnLife({ j, onShow }: { j: JarRecord; onShow: (s: TerrariumState | null) => void }) {
  const [life, setLife] = useState<Moment[] | null>(null);
  const frames = j.frames ?? [];
  if (life) return <TimeLapse moments={life} onShow={onShow} onClose={() => setLife(null)} />;
  return (
    <div className="preview-bar">
      <button type="button" className="button" disabled={frames.length < 2} onClick={() => setLife(framesToMoments(j.spec, frames, j.state))}>
        <Film size={16} aria-hidden="true" /> Watch its life
      </button>
      <span className="hint">
        {frames.length < 2 ? 'A picture is saved every week. Come back after a couple of weeks to watch it grow.' : `${frames.length} weeks recorded.`}
      </span>
    </div>
  );
}
