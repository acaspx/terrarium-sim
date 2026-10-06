import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Minus, Plus, X } from 'lucide-react';
import {
  BLANK_SPEC, buildTerrarium, checkSpec, run, CREW_COUNTS, CREW_IDS, DEPTHS, DRAINAGE, faunaSpecies, forecast,
  GROW_LIGHTS, HARDSCAPE, LIDS, MOISTURES, PLACEMENTS, PLANT_IDS, PLANT_SIZES, plantSpecies, RECIPES, ROOMS,
  SIZE_LABELS, SUBSTRATES, VESSELS,
  type HardscapeId, type SpecIssue, type TerrariumSpec, type VesselId,
} from '../../engine/index.js';
import { EmptyJar } from '../jar/Jar.js';
import { Jar3D } from '../jar/Jar3D.js';
import { store } from '../store.js';
import { pluralName } from '../format.js';
import { ChoiceList, Segmented, Sparkline } from '../ui/controls.js';

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
  const shown = previewDay === 0 || deferred !== spec ? preview : fc.snapshots.find((x) => x.day === previewDay)?.state ?? preview;
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
            <Jar3D spec={spec} state={shown} title={`Preview of ${spec.name}, day ${previewDay}`} />
            <span className="stage-hint">Drag to turn</span>
          </div>
          <div className="day-scrub">
            <span className="field-label">Preview</span>
            <Segmented<number> label="Preview day" size="sm" value={previewDay} onChange={setPreviewDay}
              options={[0, ...fc.snapshots.map((x) => x.day)].map((d) => ({ id: d, label: d === 0 ? 'Planted' : `Day ${d}` }))} />
          </div>
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
            <div className="vessel-grid" role="radiogroup" aria-label="Vessel">
              {VESSELS.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={spec.vessel === v.id}
                  className={`vessel-option${spec.vessel === v.id ? ' on' : ''}`} onClick={() => chooseVessel(v.id)}>
                  <span className="vessel-icon"><EmptyJar vessel={v.id} icon /></span>
                  <span className="choice-label">{v.label}</span>
                  <span className="choice-detail">{v.detail}</span>
                </button>
              ))}
            </div>
            <Field label="Size">
              <Segmented<number> label="Size" value={spec.sizeL} onChange={(sizeL) => update({ sizeL })}
                options={vessel.sizes.map((s) => ({ id: s, label: <>{SIZE_LABELS[s]} <span className="unit">{s} L</span></> }))} />
            </Field>
            <Field label="Lid" issues={issuesFor('lid')}>
              <Segmented label="Lid" value={spec.lid} onChange={(lid) => update({ lid })}
                options={LIDS.filter((l) => vessel.lids.includes(l.id)).map((l) => ({ id: l.id, label: l.label, detail: l.detail }))} />
              <p className="hint">{LIDS.find((l) => l.id === spec.lid)?.detail}</p>
            </Field>
          </Step>

          <Step n={2} title="Layers" hint="From the bottom up: drainage keeps roots out of standing water, the substrate holds water and feeds everything.">
            <Field label="Drainage" issues={issuesFor('drainage')}>
              <Segmented label="Drainage" value={spec.drainage} onChange={(drainage) => update({ drainage })}
                options={DRAINAGE.map((d) => ({ id: d.id, label: d.label, detail: d.detail }))} />
              <p className="hint">{DRAINAGE.find((d) => d.id === spec.drainage)?.detail}</p>
            </Field>
            <Field label="Substrate" issues={issuesFor('substrate')}>
              <ChoiceList label="Substrate" value={spec.substrate} onChange={(substrate) => update({ substrate })}
                options={SUBSTRATES.map((s) => ({ id: s.id, label: s.label, detail: s.detail }))} />
            </Field>
            <Field label="Depth">
              <Segmented label="Depth" value={spec.depth} onChange={(depth) => update({ depth })}
                options={DEPTHS.map((d) => ({ id: d.id, label: d.label, detail: d.detail }))} />
            </Field>
            <Field label="Hardscape">
              <div className="toggles">
                {HARDSCAPE.map((h) => {
                  const on = spec.hardscape.includes(h.id);
                  return (
                    <button key={h.id} type="button" aria-pressed={on} className={`toggle${on ? ' on' : ''}`} title={h.detail}
                      onClick={() => update({ hardscape: on ? spec.hardscape.filter((x) => x !== h.id) : [...spec.hardscape, h.id as HardscapeId] })}>
                      {h.label}
                    </button>
                  );
                })}
              </div>
              <p className="hint">{spec.hardscape.length ? spec.hardscape.map((id) => HARDSCAPE.find((h) => h.id === id)!.detail).join(' ') : 'Optional. Wood and leaf litter feed the clean-up crew.'}</p>
            </Field>
          </Step>

          <Step n={3} title="Plants" hint={`Choose plants that like the same conditions. Up to ${MAX_PLANTS}.`}>
            <Issues list={issuesFor('plants')} />
            <ul className="species-list">
              {PLANT_IDS.map((id) => {
                const sp = plantSpecies(id);
                const chosen = spec.plants.map((p, i) => ({ p, i })).filter((x) => x.p.speciesId === id);
                return (
                  <li key={id} className={chosen.length ? 'on' : undefined}>
                    <div className="species-head">
                      <div>
                        <span className="choice-label">{sp.commonName}</span>
                        <span className="roster-sci">{sp.scientificName}</span>
                      </div>
                      <Counter
                        label={sp.commonName} value={chosen.length}
                        onAdd={spec.plants.length < MAX_PLANTS ? () => update({ plants: [...spec.plants, { speciesId: id, size: 'small' }] }) : undefined}
                        onRemove={() => {
                          const last = chosen[chosen.length - 1];
                          if (last) update({ plants: spec.plants.filter((_, i) => i !== last.i) });
                        }}
                      />
                    </div>
                    <p className="choice-detail">{sp.notes}</p>
                    {chosen.length > 0 && (
                      <div className="sizes">
                        {chosen.map(({ p, i }, k) => (
                          <Segmented key={i} label={`${sp.commonName} ${k + 1} size`} size="sm" value={p.size}
                            onChange={(size) => update({ plants: spec.plants.map((x, xi) => (xi === i ? { ...x, size } : x)) })}
                            options={PLANT_SIZES.map((s) => ({ id: s.id, label: s.label }))} />
                        ))}
                      </div>
                    )}
                    <Issues list={issuesFor(id)} />
                  </li>
                );
              })}
            </ul>
          </Step>

          <Step n={4} title="Clean-up crew" hint="Tiny animals that eat mold and dead leaves, and turn them back into plant food.">
            <Issues list={issuesFor('fauna')} />
            <ul className="species-list">
              {CREW_IDS.map((id) => {
                const sp = faunaSpecies(id);
                const current = spec.fauna.find((f) => f.speciesId === id)?.count ?? 0;
                return (
                  <li key={id} className={current ? 'on' : undefined}>
                    <div className="species-head">
                      <div>
                        <span className="choice-label">{pluralName(sp.commonName).replace(/^./, (c) => c.toUpperCase())}</span>
                        <span className="roster-sci">{sp.scientificName}</span>
                      </div>
                      <Segmented<number> label={`${sp.commonName} count`} size="sm" value={current}
                        onChange={(count) => update({ fauna: [...spec.fauna.filter((f) => f.speciesId !== id), ...(count ? [{ speciesId: id, count }] : [])] })}
                        options={[{ id: 0, label: 'None' }, ...(CREW_COUNTS[id] ?? [20]).map((n) => ({ id: n, label: String(n) }))]} />
                    </div>
                    <p className="choice-detail">{sp.notes}</p>
                    <Issues list={issuesFor(id)} />
                  </li>
                );
              })}
            </ul>
          </Step>

          <Step n={5} title="Placement" hint="Light drives everything: growth, warmth, and how much water cycles through the jar.">
            <Field label="Where it sits" issues={issuesFor('placement')}>
              <ChoiceList label="Where it sits" value={spec.placement} onChange={(placement) => update({ placement })}
                options={PLACEMENTS.map((p) => ({ id: p.id, label: p.label, detail: p.detail }))} />
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
              <Segmented label="How wet to start" value={spec.startMoisture} onChange={(startMoisture) => update({ startMoisture })}
                options={MOISTURES.map((m) => ({ id: m.id, label: m.label, detail: m.detail }))} />
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

function Counter({ label, value, onAdd, onRemove }: { label: string; value: number; onAdd?: () => void; onRemove: () => void }) {
  return (
    <div className="counter">
      <button type="button" className="icon-button" onClick={onRemove} disabled={value === 0} aria-label={`Remove one ${label}`}>
        {value === 1 ? <X size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
      </button>
      <span aria-live="polite" aria-label={`${value} ${label}`}>{value}</span>
      <button type="button" className="icon-button" onClick={onAdd} disabled={!onAdd} aria-label={`Add a ${label}`}>
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
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
