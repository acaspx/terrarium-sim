import { useEffect, useState } from 'react';
import { ArrowLeft, Flag, Heart, Link2, Sprout, Trash2 } from 'lucide-react';
import {
  DRAINAGE, faunaSpecies, LIDS, PLACEMENTS, plantSpecies, SUBSTRATES, VESSELS,
} from '../../engine/index.js';
import { Jar } from '../jar/Jar.js';
import { Jar3D } from '../jar/Jar3D.js';
import { glassWord, headline, moistureWord, plural, pluralName } from '../format.js';
import { getShared, hasLiked, isMine, like, listShared, plantCopy, report, unshare, type Submission } from '../playground.js';
import { Segmented } from '../ui/controls.js';

type Sort = 'recent' | 'liked';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return plural(h, 'hour') + ' ago';
  const d = Math.round(h / 24);
  return d < 60 ? plural(d, 'day') + ' ago' : new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

// ------------------------------------------------------------------ gallery

export function Playground() {
  const [sort, setSort] = useState<Sort>(() => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('sort') === 'liked' ? 'liked' : 'recent'));
  const [items, setItems] = useState<Submission[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = (s: Sort) => {
    setItems(null);
    setError(null);
    listShared(s)
      .then((r) => {
        setItems(r.items);
        setNext(r.next);
      })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(() => load(sort), [sort]);

  const more = () => {
    if (next === null) return;
    setLoadingMore(true);
    listShared(sort, next)
      .then((r) => {
        setItems((cur) => [...(cur ?? []), ...r.items]);
        setNext(r.next);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMore(false));
  };

  return (
    <main className="shelf-page">
      <div className="shelf-intro">
        <h1>Playground</h1>
        <p className="lede">Terrariums other keepers have planted and shared. Look inside any of them, or plant a copy of your own.</p>
        <Segmented<Sort> label="Sort" size="sm" value={sort} onChange={setSort}
          options={[{ id: 'recent', label: 'Newest' }, { id: 'liked', label: 'Most liked' }]} />
      </div>

      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button type="button" className="button" onClick={() => load(sort)}>Try again</button>
        </div>
      )}
      {!error && items === null && <p className="empty-note" aria-live="polite">Loading the playground…</p>}
      {items && items.length === 0 && (
        <p className="empty-note">Nothing has been shared yet. Open a jar on <a href="#/">your shelf</a> and choose <strong>Share to playground</strong>.</p>
      )}
      {items && items.length > 0 && (
        <ul className="shelf" aria-label="Shared terrariums">
          {items.map((s) => (
            <li key={s.id}>
              <a className="shelf-slot" href={`#/playground/${s.id}`}>
                <span className="jar-stage">
                  <Jar spec={s.spec} state={s.state} lively title={`${s.spec.name} by ${s.author}`} />
                </span>
                <span className="tag">
                  <span className="tag-top">
                    <span className="tag-name">{s.spec.name}</span>
                    <span className={`score score-${headline(s.state).tone}`}>{s.score}</span>
                  </span>
                  <span className="tag-line">by {s.author}, day {s.day}</span>
                  <span className="tag-line likes"><Heart size={12} aria-hidden="true" /> {s.likes}<span className="visually-hidden"> likes</span></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {next !== null && items && (
        <div className="more">
          <button type="button" className="button" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
        </div>
      )}
    </main>
  );
}

// ------------------------------------------------------------------ one shared jar

export function SharedJar({ id }: { id: string }) {
  const [s, setS] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(() => hasLiked(id));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    getShared(id).then(setS).catch((e: Error) => setError(e.message));
  }, [id]);

  const say = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  };

  if (error) {
    return (
      <main className="detail-page">
        <a className="back" href="#/playground"><ArrowLeft size={16} aria-hidden="true" /> Playground</a>
        <p className="empty-note">{error}</p>
      </main>
    );
  }
  if (!s) return <main className="detail-page"><p className="empty-note" aria-live="polite">Opening the jar…</p></main>;

  const st = s.state;
  const cl = st.climate;
  const h = headline(st);
  const vessel = VESSELS.find((v) => v.id === s.spec.vessel)!;
  const planted = new Map<string, number>();
  for (const p of s.spec.plants) planted.set(p.speciesId, (planted.get(p.speciesId) ?? 0) + 1);
  const alive = new Map<string, number>();
  for (const p of st.plants) alive.set(p.speciesId, (alive.get(p.speciesId) ?? 0) + 1);

  const onLike = async () => {
    if (liked || busy) return;
    setBusy(true);
    try {
      const likes = await like(id);
      setS({ ...s, likes });
      setLiked(true);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      say('Link copied.');
    } catch {
      say('Copy the address from your browser bar.');
    }
  };
  const onReport = async () => {
    try {
      await report(id);
      say('Thanks. Jars reported by several people are hidden.');
    } catch (e) {
      say((e as Error).message);
    }
  };
  const onRemove = async () => {
    try {
      await unshare(id);
      location.hash = '#/playground';
    } catch (e) {
      say((e as Error).message);
    }
  };

  return (
    <main className="detail-page">
      <a className="back" href="#/playground"><ArrowLeft size={16} aria-hidden="true" /> Playground</a>
      <div className="detail">
        <div className="detail-jar">
          <div className="stage-3d">
            <Jar3D spec={s.spec} state={st} autoRotate title={`${s.spec.name} by ${s.author}, day ${s.day}`} />
            <span className="stage-hint">Drag to turn</span>
          </div>
          <p className="jar-caption">Day {s.day}, shared {ago(s.createdAt)}. Lights {cl.lightOn ? 'on' : 'off'}.</p>
        </div>

        <div className="detail-body">
          <header className="detail-head">
            <h1>{s.spec.name}</h1>
            <p className="detail-sub">
              by {s.author}. Health <span className={`score score-${h.tone}`}>{s.score}</span>
              <span className={`pill tone-${h.tone}`}>{h.text}</span>
            </p>
            {s.note && <blockquote className="keeper-note">{s.note}</blockquote>}
          </header>

          <div className="shared-actions">
            <button type="button" className="button primary" onClick={() => plantCopy(s.spec, s.author)}>
              <Sprout size={18} aria-hidden="true" /> Plant a copy
            </button>
            <button type="button" className={`button like${liked ? ' on' : ''}`} onClick={onLike} aria-pressed={liked} disabled={busy}>
              <Heart size={16} aria-hidden="true" fill={liked ? 'currentColor' : 'none'} /> {s.likes}
              <span className="visually-hidden">{liked ? ' likes, including yours' : ' likes. Like this terrarium'}</span>
            </button>
            <button type="button" className="button" onClick={onCopyLink}><Link2 size={16} aria-hidden="true" /> Copy link</button>
          </div>
          <p className="hint flash" aria-live="polite">{flash ?? ' '}</p>

          <section className="block" aria-labelledby="inside">
            <h2 id="inside">How it was built</h2>
            <dl className="spec-list">
              <dt>Vessel</dt><dd>{vessel.label}, {s.spec.sizeL} L, {LIDS.find((l) => l.id === s.spec.lid)?.label.toLowerCase()} lid</dd>
              <dt>Layers</dt><dd>{DRAINAGE.find((d) => d.id === s.spec.drainage)?.label} under {SUBSTRATES.find((x) => x.id === s.spec.substrate)?.label.replace(/^(?!ABG)./, (c) => c.toLowerCase())}</dd>
              <dt>Light</dt><dd>{PLACEMENTS.find((p) => p.id === s.spec.placement)?.label}</dd>
              {s.spec.hardscape.length > 0 && <><dt>Hardscape</dt><dd>{s.spec.hardscape.map((x) => x.replace('-', ' ')).join(', ')}</dd></>}
            </dl>
          </section>

          <section className="block" aria-labelledby="now">
            <h2 id="now">On day {s.day}</h2>
            <dl className="vitals">
              <div><dt>Soil</dt><dd>{moistureWord(cl.moisture)}</dd></div>
              <div><dt>Humidity</dt><dd>{Math.round(cl.rh * 100)}<span className="unit">%</span></dd></div>
              <div><dt>Air</dt><dd>{cl.airTempC.toFixed(1)}<span className="unit">°C</span></dd></div>
              <div><dt>Glass</dt><dd>{glassWord(cl.condensationIndex)}</dd></div>
            </dl>
          </section>

          <section className="block" aria-labelledby="living">
            <h2 id="living">Living in it</h2>
            <ul className="roster">
              {[...planted].map(([sid, n]) => {
                const sp = plantSpecies(sid);
                const a = alive.get(sid) ?? 0;
                return (
                  <li key={sid} className="roster-simple">
                    <span className="roster-name">{sp.commonName}<span className="roster-sci">{sp.scientificName}</span></span>
                    <span className={`roster-num ${a < n ? 'tone-critical' : ''}`}>{a} of {n} alive</span>
                  </li>
                );
              })}
              {st.fauna.map((f) => {
                const sp = faunaSpecies(f.speciesId);
                const pop = Math.round(f.juveniles + f.adults);
                return (
                  <li key={f.speciesId} className="roster-simple">
                    <span className="roster-name">{pluralName(sp.commonName).replace(/^./, (c) => c.toUpperCase())}<span className="roster-sci">{sp.scientificName}</span></span>
                    <span className="roster-count">{pop}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {st.events.length > 0 && (
            <section className="block" aria-labelledby="lately">
              <h2 id="lately">Lately</h2>
              <ul className="journal">
                {[...st.events].reverse().map((e, i) => (
                  <li key={i} className={`journal-${e.type}`}><span className="journal-day">Day {Math.floor(e.hour / 24)}</span><span>{e.message}</span></li>
                ))}
              </ul>
            </section>
          )}

          <section className="block manage">
            {isMine(id) ? (
              confirmRemove ? (
                <span className="confirm">
                  Remove it from the playground? Your jar stays on your shelf.
                  <button type="button" className="button danger" onClick={onRemove}>Remove</button>
                  <button type="button" className="button quiet" onClick={() => setConfirmRemove(false)}>Keep it</button>
                </span>
              ) : (
                <button type="button" className="button" onClick={() => setConfirmRemove(true)}><Trash2 size={16} aria-hidden="true" /> Remove from playground</button>
              )
            ) : (
              <button type="button" className="button quiet" onClick={onReport}><Flag size={14} aria-hidden="true" /> Report</button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
