import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Move, X } from 'lucide-react';
import {
  BLANK_SPEC, buildTerrarium, checkSpec, run, CREW_COUNTS, CREW_IDS, DEPTHS, DRAINAGE, faunaSpecies, forecast,
  GROW_LIGHTS, HARDSCAPE, LIDS, MOISTURES, PLACEMENTS, PLANT_IDS, PLANT_SIZES, plantSpecies, RECIPES, ROOMS,
  SIZE_LABELS, SUBSTRATES, VESSELS,
  type HardscapeId, type SpecIssue, type TerrariumSpec, type VesselId,
} from '../../engine/index.js';
import { Jar3D } from '../jar/Jar3D.js';
import { store } from '../store.js';
import { pluralName } from '../format.js';
import { Segmented, Sparkline } from '../ui/controls.js';
import { Swatch, SwatchRow } from '../ui/Swatch.js';

const MAX_PLANTS = 8;

function initialSpec(): TerrariumSpec {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const from = q.get('from');
  const recipe = q.get('recipe');
  if (q.get('draft')) {
    try {
      const draft = sessionStorage.getItem('terrarium-sim:draft');
      if (draft) return { ...(JSON.parse(draft) as TerrariumSpec), seed: Date.now() % 1e6 };
    } catch {
      // Fall through to a recipe.
    }
  }
  if (from) {
    const j = store.get(from);
    if (j) return { ...structuredClone(j.spec), name: `${j.spec.name} II`, seed: Date.now() % 1e6 };
  }
  const r = RECIPES.find((x) => x.id === recipe);
  return structuredClone(r ? r.spec : RECIPES[0]!.spec);
}

export function Builder() {
  const [spec, setSpec] = useState<TerrariumSpec>(initialSpec);
  const [recipe, setRecipe] = useState<string>(() => RECIPES.find((r) => r.spec.name === spec.name)?.id ?? 'custom');
  const update = (patch: Partial<TerrariumSpec>) => {
    setSpec((s) => ({ ...s, ...patch }));
    setRecipe('custom');
  };

  const preview = useMemo(() => {
    // Planted in the morning, shown in the afternoon light.
    const s = buildTerrarium(spec);
    run(s, 14);
    return s;
  }, [spec]);
  const deferred = useDeferredValue(spec);
  const fc = useMemo(() => forecast(deferred, 90), [deferred]);
  const [previewDay, setPreviewDay] = useState(0);
  // The plant or animal last tapped, whose notes show under its row.
  const [focusPlant, setFocusPlant] = useState<string | null>(null);
  const [focusCrew, setFocusCrew] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const shown = arranging || previewDay === 0 || deferred !== spec ? preview : fc.snapshots.find((x) => x.day === previewDay)?.state ?? preview;
  // Preview plant ids are "<species>-<n>", numbered in planting order, so n - 1 is the plant's place in the design.
  const arrange = (plantId: string, at: [number, number]) => {
    const i = Number(plantId.slice(plantId.lastIndexOf('-') + 1)) - 1;
    if (spec.plants[i]) update({ plants: spec.plants.map((p, j) => (j === i ? { ...p, at } : p)) });
  };
  const placed = spec.plants.some((p) => p.at);
  const issues = useMemo(() => checkSpec(spec), [spec]);
  const issuesFor = (target: string) => issues.filter((i) => i.target === target);

  const vessel = VESSELS.find((v) => v.id === spec.vessel)!;

  const chooseVessel = (id: VesselId) => {
    const v = VESSELS.find((x) => x.id === id)!;
    update({
      vessel: id,
      sizeL: v.sizes.includes(spec.sizeL) ? spec.sizeL : v.sizes[Math.min(1, v.sizes.length - 1)]!,
      lid: v.lids.includes(spec.lid) ? spec.lid : v.defaultLid,
    });
  };

  const create = () => {
    const id = store.create({ ...spec, name: spec.name.trim() || 'Untitled terrarium' });
    location.hash = `#/jar/${id}`;
  };

  return (
    <main className="builder-page">
      <a className="back" href="#/"><ArrowLeft size={16} aria-hidden="true" /> Shelf</a>
      <div className="builder">
        <aside className="builder-preview" aria-label="Preview and forecast">
          <div className="stage-3d">
            <Jar3D spec={spec} state={shown} title={`Preview of ${spec.name}, day ${arranging ? 0 : previewDay}`} onArrange={arranging ? arrange : undefined} />
            <span className="stage-hint">{arranging ? 'Drag a plant to move it. Drag elsewhere to spin the jar.' : 'Drag to spin. Tap plants, soil and glass.'}</span>
          </div>
          <div className="arrange-row">
            <button type="button" className={`button${arranging ? ' primary' : ''}`} aria-pressed={arranging}
              onClick={() => setArranging((a) => !a)} disabled={spec.plants.length === 0}>
              <Move size={16} aria-hidden="true" /> {arranging ? 'Done arranging' : 'Arrange plants'}
            </button>
            {placed && (
              <button type="button" className="button quiet" onClick={() => update({ plants: spec.plants.map(({ at: _at, ...p }) => p) })}>
                Reset layout
              </button>
            )}
          </div>
          {arranging ? (
            <p className="hint arrange-hint">Tall plants shade whatever grows close beneath them. In dim light that slows it down; under bright light it barely matters.</p>
          ) : (
            <div className="day-scrub">
              <span className="field-label">Preview</span>
              <Segmented<number> label="Preview day" size="sm" value={previewDay} onChange={setPreviewDay}
                options={[0, ...fc.snapshots.map((x) => x.day)].map((d) => ({ id: d, label: d === 0 ? 'Planted' : `Day ${d}` }))} />
            </div>
          )}
          <Forecast fc={fc} stale={deferred !== spec} issues={issues} />
        </aside>

        <div className="builder-form">
          <header className="builder-head">
            <h1>New terrarium</h1>
            <div className="field">
              <span className="field-label">Start from</span>
              <Segmented<string>
                label="Start from" size="sm" value={recipe}
                options={[...RECIPES.map((r) => ({ id: r.id, label: r.label, detail: r.detail })), { id: 'blank', label: 'Blank', detail: 'An empty jar.' }, ...(recipe === 'custom' ? [{ id: 'custom', label: 'Your design' }] : [])]}
                onChange={(id) => {
                  if (id === 'custom') return;
                  const r = RECIPES.find((x) => x.id === id);
                  setSpec(structuredClone(r ? r.spec : { ...BLANK_SPEC }));
                  setRecipe(id);
                }}
              />
            </div>
          </header>

          <Step n={1} title="Vessel" hint="The vessel decides how much air, light and water the jar can hold, and how easy it is to work in.">
            <SwatchRow label="Vessel">
              {VESSELS.map((v) => (
                <Swatch key={v.id} k={`vessel:${v.id}`} label={v.label} detail={v.detail} selected={spec.vessel === v.id} onClick={() => chooseVessel(v.id)} />
              ))}
            </SwatchRow>
            <p className="choice-note">{vessel.detail}</p>
            <Field label="Size">
              <Segmented<number> label="Size" value={spec.sizeL} onChange={(sizeL) => update({ sizeL })}
                options={vessel.sizes.map((s) => ({ id: s, label: <>{SIZE_LABELS[s]} <span className="unit">{s} L</span></> }))} />
            </Field>
            <Field label="Lid" issues={issuesFor('lid')}>
              <SwatchRow label="Lid">
                {LIDS.filter((l) => vessel.lids.includes(l.id)).map((l) => (
                  <Swatch key={l.id} k={`lid:${l.id}`} label={l.label} detail={l.detail} selected={spec.lid === l.id} onClick={() => update({ lid: l.id })} />
                ))}
              </SwatchRow>
              <p className="hint">{LIDS.find((l) => l.id === spec.lid)?.detail}</p>
            </Field>
          </Step>

          <Step n={2} title="Layers" hint="From the bottom up: drainage keeps roots out of standing water, the substrate holds water and feeds everything.">
            <Field label="Drainage" issues={issuesFor('drainage')}>
              <SwatchRow label="Drainage">
                {DRAINAGE.map((d) => (
                  <Swatch key={d.id} k={`drainage:${d.id}`} empty={d.id === 'none'} label={d.label} detail={d.detail} selected={spec.drainage === d.id} onClick={() => update({ drainage: d.id })} />
                ))}
              </SwatchRow>
              <p className="hint">{DRAINAGE.find((d) => d.id === spec.drainage)?.detail}</p>
            </Field>
            <Field label="Substrate" issues={issuesFor('substrate')}>
              <SwatchRow label="Substrate">
                {SUBSTRATES.map((x) => (
                  <Swatch key={x.id} k={`substrate:${x.id}`} label={x.label} detail={x.detail} selected={spec.substrate === x.id} onClick={() => update({ substrate: x.id })} />
                ))}
              </SwatchRow>
              <p className="hint">{SUBSTRATES.find((x) => x.id === spec.substrate)?.detail}</p>
            </Field>
            <Field label="Depth">
              <Segmented label="Depth" value={spec.depth} onChange={(depth) => update({ depth })}
                options={DEPTHS.map((d) => ({ id: d.id, label: d.label, detail: d.detail }))} />
            </Field>
            <Field label="Hardscape">
              <SwatchRow label="Hardscape" multi>
                {HARDSCAPE.map((h) => {
                  const on = spec.hardscape.includes(h.id);
                  return (
                    <Swatch key={h.id} k={`hardscape:${h.id}`} kind="toggle" label={h.label} detail={h.detail} selected={on}
                      onClick={() => update({ hardscape: on ? spec.hardscape.filter((x) => x !== h.id) : [...spec.hardscape, h.id as HardscapeId] })} />
                  );
                })}
              </SwatchRow>
              <p className="hint">{spec.hardscape.length ? spec.hardscape.map((id) => HARDSCAPE.find((h) => h.id === id)!.detail).join(' ') : 'Optional. Wood and leaf litter feed the clean-up crew.'}</p>
            </Field>
          </Step>

          <Step n={3} title="Plants" hint={`Tap a plant to add one, up to ${MAX_PLANTS}. Choose plants that like the same conditions.`}>
            <Issues list={issuesFor('plants')} />
            <SwatchRow label="Add a plant" multi>
              {PLANT_IDS.map((id) => {
                const sp = plantSpecies(id);
                const n = spec.plants.filter((p) => p.speciesId === id).length;
                return (
                  <Swatch key={id} k={`plant:${id}`} kind="action" label={sp.commonName} detail={sp.notes} selected={n > 0} badge={n || undefined}
                    disabled={spec.plants.length >= MAX_PLANTS}
                    onClick={() => {
                      update({ plants: [...spec.plants, { speciesId: id, size: 'small' }] });
                      setFocusPlant(id);
                    }} />
                );
              })}
            </SwatchRow>
            {focusPlant && (
              <p className="choice-note">
                <strong>{plantSpecies(focusPlant).commonName}</strong> <span className="roster-sci">{plantSpecies(focusPlant).scientificName}</span>
                {plantSpecies(focusPlant).notes}
              </p>
            )}
            {spec.plants.length > 0 && (
              <ul className="chosen" aria-label="Plants in this jar">
                {spec.plants.map((p, i) => {
                  const sp = plantSpecies(p.speciesId);
                  const first = spec.plants.findIndex((x) => x.speciesId === p.speciesId) === i;
                  return (
                    <li key={i}>
                      <span>{sp.commonName}</span>
                      <Segmented label={`${sp.commonName} ${i + 1} size`} size="sm" value={p.size}
                        onChange={(size) => update({ plants: spec.plants.map((x, xi) => (xi === i ? { ...x, size } : x)) })}
                        options={PLANT_SIZES.map((z) => ({ id: z.id, label: z.label }))} />
                      <button type="button" className="icon-button" aria-label={`Remove this ${sp.commonName.toLowerCase()}`}
                        onClick={() => update({ plants: spec.plants.filter((_, xi) => xi !== i) })}>
                        <X size={15} aria-hidden="true" />
                      </button>
                      {first && <Issues list={issuesFor(p.speciesId)} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Step>

          <Step n={4} title="Clean-up crew" hint="Tiny animals that eat mold and dead leaves, and turn them back into plant food. Tap to change how many.">
            <Issues list={issuesFor('fauna')} />
            <SwatchRow label="Clean-up crew" multi>
              {CREW_IDS.map((id) => {
                const sp = faunaSpecies(id);
                const counts = [0, ...(CREW_COUNTS[id] ?? [20])];
                const current = spec.fauna.find((f) => f.speciesId === id)?.count ?? 0;
                const next = counts[(counts.indexOf(current) + 1) % counts.length]!;
                return (
                  <Swatch key={id} k={`crew:${id}`} kind="action" label={pluralName(sp.commonName).replace(/^./, (c) => c.toUpperCase())} detail={sp.notes}
                    selected={current > 0} badge={current || undefined}
                    onClick={() => {
                      update({ fauna: [...spec.fauna.filter((f) => f.speciesId !== id), ...(next ? [{ speciesId: id, count: next }] : [])] });
                      setFocusCrew(id);
                    }} />
                );
              })}
            </SwatchRow>
            {focusCrew && (
              <>
                <p className="choice-note">
                  <strong>{pluralName(faunaSpecies(focusCrew).commonName).replace(/^./, (c) => c.toUpperCase())}</strong>{' '}
                  <span className="roster-sci">{faunaSpecies(focusCrew).scientificName}</span>
                  {faunaSpecies(focusCrew).notes}
                </p>
                <Issues list={issuesFor(focusCrew)} />
              </>
            )}
            {spec.fauna.filter((f) => f.speciesId !== focusCrew).map((f) => <Issues key={f.speciesId} list={issuesFor(f.speciesId)} />)}
          </Step>

          <Step n={5} title="Placement" hint="Light drives everything: growth, warmth, and how much water cycles through the jar.">
            <Field label="Where it sits" issues={issuesFor('placement')}>
              <SwatchRow label="Where it sits">
                {PLACEMENTS.map((p) => (
                  <Swatch key={p.id} k={`placement:${p.id}`} label={p.label} detail={p.detail} selected={spec.placement === p.id} onClick={() => update({ placement: p.id })} />
                ))}
              </SwatchRow>
              <p className="hint">{PLACEMENTS.find((p) => p.id === spec.placement)?.detail}</p>
            </Field>
            {spec.placement === 'grow-light' && (
              <Field label="Light strength">
                <Segmented label="Light strength" value={spec.growLight} onChange={(growLight) => update({ growLight })}
                  options={GROW_LIGHTS.map((g) => ({ id: g.id, label: g.label, detail: g.detail }))} />
              </Field>
            )}
            <Field label="Room">
              <Segmented label="Room" value={spec.room} onChange={(room) => update({ room })}
                options={ROOMS.map((r) => ({ id: r.id, label: r.label, detail: r.detail }))} />
            </Field>
            <Field label="How wet to start" issues={issuesFor('moisture')}>
              <SwatchRow label="How wet to start">
                {MOISTURES.map((m) => (
                  <Swatch key={m.id} k={`moisture:${m.id}`} label={m.label} detail={m.detail} selected={spec.startMoisture === m.id} onClick={() => update({ startMoisture: m.id })} />
                ))}
              </SwatchRow>
              <p className="hint">{MOISTURES.find((m) => m.id === spec.startMoisture)?.detail}</p>
            </Field>
          </Step>

          <Step n={6} title="Name">
            <label className="visually-hidden" htmlFor="spec-name">Name</label>
            <input id="spec-name" className="text-input" value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} />
          </Step>

          <div className="builder-submit">
            <button type="button" className="button primary" onClick={create} disabled={spec.plants.length === 0}>
              Plant this terrarium
            </button>
            <span className="hint">{spec.plants.length === 0 ? 'Add at least one plant first.' : 'It joins your shelf and starts growing.'}</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="step" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`}><span className="step-n" aria-hidden="true">{n}</span>{title}</h2>
      {hint && <p className="step-hint">{hint}</p>}
      {children}
    </section>
  );
}

function Field({ label, issues = [], children }: { label: string; issues?: SpecIssue[]; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      <Issues list={issues} />
    </div>
  );
}

function Issues({ list }: { list: SpecIssue[] }) {
  if (list.length === 0) return null;
  return (
    <ul className="issues">
      {list.map((i) => <li key={i.message} className={`issue issue-${i.severity}`}>{i.message}</li>)}
    </ul>
  );
}

function Forecast({ fc, stale, issues }: { fc: ReturnType<typeof forecast>; stale: boolean; issues: SpecIssue[] }) {
  const critical = issues.filter((i) => i.severity === 'critical');
  const tone = fc.finalScore >= 80 ? 'good' : fc.finalScore >= 55 ? 'warn' : 'critical';
  return (
    <section className={`forecast${stale ? ' stale' : ''}`} aria-labelledby="fc" aria-live="polite">
      <h2 id="fc">First {fc.days} days</h2>
      <div className="forecast-score">
        <span className={`score score-${tone} big`}>{fc.finalScore}</span>
        <span>
          health at day {fc.days}
          <br />
          {fc.plantsStart === 0 ? 'no plants yet' : `${fc.plantsAlive} of ${fc.plantsStart} plants alive`}
        </span>
      </div>
      <Sparkline values={fc.scores} min={0} max={100} band={[70, 100]} width={260} height={44} />
      <ul className="forecast-notes">
        {critical.map((i) => <li key={i.message} className="issue issue-critical">{i.message}</li>)}
        {fc.headlines.map((h) => <li key={h}>{h}</li>)}
      </ul>
      <p className="hint">A simulation, not a promise. Real jars vary.</p>
    </section>
  );
}
