import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Film, Flag, Heart, Link2, Sprout, Trash2 } from 'lucide-react';
import {
  DRAINAGE, faunaSpecies, LIDS, PLACEMENTS, plantSpecies, SUBSTRATES, VESSELS,
} from '../../engine/index.js';
import { Jar3D } from '../jar/Jar3D.js';
import { glassWord, headline, moistureWord, pHWord, plural, pluralName, soilAirWord } from '../format.js';
import {
  getKeeper, getShared, hasLiked, like, listByKeeper, listShared, plantCopy, report, signOut, unshare, useIdentity,
  type KeeperProfile, type Submission,
} from '../playground.js';
import { Segmented } from '../ui/controls.js';
import { KeeperForm } from '../ui/KeeperForm.js';
import { dayOfState, grownNow, JarStill, scoreOf, useGrown } from '../ui/Living.js';
import { TimeLapse } from '../ui/TimeLapse.js';
import { lifeOf, type Moment } from '../../playground/living.js';
import type { TerrariumState } from '../../engine/index.js';

type Sort = 'recent' | 'liked';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return plural(h, 'hour') + ' ago';
  const d = Math.round(h / 24);
  return d < 60 ? plural(d, 'day') + ' ago' : new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

// ------------------------------------------------------------------ shelves

type Page = { items: Submission[]; next: number | null };

/** A paged shelf of shared jars, used for the community shelf and for each keeper's shelf. */
function SharedGrid({ load, empty, label, showKeeper = true }: {
  load: (cursor: number) => Promise<Page>; empty: ReactNode; label: string; showKeeper?: boolean;
}) {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    load(0)
      .then((r) => {
        if (!live) return;
        setItems(r.items);
        setNext(r.next);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [load, attempt]);

  const more = () => {
    if (next === null) return;
    setLoadingMore(true);
    load(next)
      .then((r) => {
        setItems((cur) => [...(cur ?? []), ...r.items]);
        setNext(r.next);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMore(false));
  };

  if (error) {
    return (
      <div className="notice" role="alert">
        <p>{error}</p>
        <button type="button" className="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      </div>
    );
  }
  if (items === null) return <p className="empty-note" aria-live="polite">Loading the shelf…</p>;
  if (items.length === 0) return <p className="empty-note">{empty}</p>;
  return (
    <>
      <ul className="shelf" aria-label={label}>
        {items.map((s) => <li key={s.id}><LivingCard sub={s} showKeeper={showKeeper} /></li>)}
      </ul>
      {next !== null && (
        <div className="more">
          <button type="button" className="button" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
        </div>
      )}
    </>
  );
}

/** A shared jar on a shelf: grown to today, drawn as a 3D still once the page is idle. */
function LivingCard({ sub, showKeeper }: { sub: Submission; showKeeper: boolean }) {
  const state = useGrown(sub);
  const day = dayOfState(state);
  const title = `${sub.spec.name} by @${sub.keeper}, day ${day}`;
  return (
    <a className="shelf-slot" href={`#/community/${sub.id}`}>
      <span className="jar-stage">
        <JarStill k={`${sub.id}:${day}`} spec={sub.spec} state={state} title={title} />
      </span>
      <span className="tag">
        <span className="tag-top">
          <span className="tag-name">{sub.spec.name}</span>
          <span className={`score score-${headline(state).tone}`}>{scoreOf(state)}</span>
        </span>
        <span className="tag-line">{showKeeper ? `@${sub.keeper}, ` : ''}day {day}{day > sub.day ? <span className="grown-note"> · growing on its own</span> : null}</span>
        <span className="tag-line likes"><Heart size={12} aria-hidden="true" /> {sub.likes}<span className="visually-hidden"> likes</span></span>
      </span>
    </a>
  );
}

/** The community shelf: every keeper's shared terrariums, newest or most liked. */
export function Playground() {
  const me = useIdentity();
  const [sort, setSort] = useState<Sort>(() => (new URLSearchParams(location.hash.split('?')[1] ?? '').get('sort') === 'liked' ? 'liked' : 'recent'));
  const load = useCallback((cursor: number) => listShared(sort, cursor), [sort]);
  return (
    <main className="shelf-page">
      <div className="shelf-intro">
        <h1>Community shelf</h1>
        <p className="lede">
          Terrariums keepers are proud of. Look inside any of them, or plant a copy of your own.{' '}
          {me ? <a href={`#/u/${me.name}`}>Your shelf</a> : <a href="#/keeper">Pick a username to share yours</a>}.
        </p>
        <Segmented<Sort> label="Sort" size="sm" value={sort} onChange={setSort}
          options={[{ id: 'recent', label: 'Newest' }, { id: 'liked', label: 'Most liked' }]} />
      </div>
      <SharedGrid load={load} label="Shared terrariums"
        empty={<>Nothing has been shared yet. Open a jar on <a href="#/">your shelf</a> and choose <strong>Share to community shelf</strong>.</>} />
    </main>
  );
}

/** One keeper's shelf, at #/u/name. */
export function KeeperShelf({ name }: { name: string }) {
  const me = useIdentity();
  const [profile, setProfile] = useState<KeeperProfile | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    getKeeper(name).then(setProfile).catch((e: Error) => setMissing(e.message));
  }, [name]);
  const load = useCallback((cursor: number) => listByKeeper(name, cursor), [name]);
  const mine = me?.name === name;
  if (missing) {
    return (
      <main className="shelf-page">
        <a className="back" href="#/community"><ArrowLeft size={16} aria-hidden="true" /> Community shelf</a>
        <p className="empty-note">{missing}</p>
      </main>
    );
  }
  return (
    <main className="shelf-page">
      <a className="back" href="#/community"><ArrowLeft size={16} aria-hidden="true" /> Community shelf</a>
      <div className="shelf-intro">
        <h1>@{name}</h1>
        <p className="lede">
          {profile ? <>Keeper since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. {plural(profile.count, 'terrarium')} shared.</> : '\u00a0'}
          {mine && <> This is your shelf. <a href="#/keeper">Your account</a></>}
        </p>
      </div>
      <SharedGrid load={load} label={`Terrariums shared by @${name}`} showKeeper={false}
        empty={mine
          ? <>Nothing here yet. Open a jar on <a href="#/">your shelf</a> and choose <strong>Share to community shelf</strong>.</>
          : <>@{name} has not shared anything yet.</>} />
    </main>
  );
}

/** #/keeper: pick a username, sign in elsewhere, or see your recovery code. */
export function KeeperPage() {
  const me = useIdentity();
  const [reveal, setReveal] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  // Stay on the form until a new keeper has saved their recovery code.
  const [joining, setJoining] = useState(!me);
  return (
    <main className="detail-page keeper-page">
      <a className="back" href="#/community"><ArrowLeft size={16} aria-hidden="true" /> Community shelf</a>
      {me && !joining ? (
        <>
          <h1>@{me.name}</h1>
          <p className="detail-sub">Signed in on this browser.</p>
          <div className="share-row">
            <a className="button primary" href={`#/u/${me.name}`}>Your shelf</a>
            <button type="button" className="button" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide recovery code' : 'Show recovery code'}</button>
          </div>
          {reveal && (
            <div className="keeper-form">
              <p className="recovery-code">{me.key}</p>
              <p className="hint">Use it with your username to sign in on another phone or browser. Anyone who has it can share and remove terrariums as you.</p>
            </div>
          )}
          <section className="block manage">
            {confirmOut ? (
              <span className="confirm">
                You will need your recovery code to sign back in.
                <button type="button" className="button danger" onClick={() => { signOut(); setConfirmOut(false); setJoining(true); }}>Sign out</button>
                <button type="button" className="button quiet" onClick={() => setConfirmOut(false)}>Stay signed in</button>
              </span>
            ) : (
              <button type="button" className="button quiet" onClick={() => setConfirmOut(true)}>Sign out</button>
            )}
          </section>
        </>
      ) : (
        <>
          <h1>Join the community shelf</h1>
          <p className="detail-sub">
            Pick a username to share terrariums you are proud of. No email or password: you get a recovery code instead. Liking and
            browsing need no account.
          </p>
          <KeeperForm onDone={(m) => (location.hash = `#/u/${m.name}`)} />
        </>
      )}
    </main>
  );
}

// ------------------------------------------------------------------ one shared jar

export function SharedJar({ id }: { id: string }) {
  const me = useIdentity();
  const [s, setS] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(() => hasLiked(id));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // The jar as it is today: the shared snapshot, grown on by itself since.
  const living = useMemo(() => (s ? grownNow(s) : null), [s]);
  const [life, setLife] = useState<Moment[] | null>(null);
  const [showing, setShowing] = useState<TerrariumState | null>(null);
  const show = useCallback((st: TerrariumState | null) => setShowing(st), []);

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
        <a className="back" href="#/community"><ArrowLeft size={16} aria-hidden="true" /> Community shelf</a>
        <p className="empty-note">{error}</p>
      </main>
    );
  }
  if (!s || !living) return <main className="detail-page"><p className="empty-note" aria-live="polite">Opening the jar…</p></main>;

  const st = living;
  const today = dayOfState(st);
  const score = scoreOf(st);
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
      location.hash = `#/u/${s.keeper}`;
    } catch (e) {
      say((e as Error).message);
    }
  };

  return (
    <main className="detail-page">
      <a className="back" href="#/community"><ArrowLeft size={16} aria-hidden="true" /> Community shelf</a>
      <div className="detail">
        <div className="detail-jar">
          <div className="stage-3d">
            <Jar3D spec={s.spec} state={showing ?? st} autoRotate={!life} title={`${s.spec.name} by @${s.keeper}, day ${today}`} />
            <span className="stage-hint">Drag to spin. Tap plants, soil and glass.</span>
          </div>
          {life ? (
            <TimeLapse moments={life} onShow={show} onClose={() => setLife(null)} />
          ) : (
            <div className="preview-bar">
              <button type="button" className="button" onClick={() => setLife(lifeOf(s, Date.now()))}>
                <Film size={16} aria-hidden="true" /> Watch its life
              </button>
              <span className="hint">{(s.frameCount ?? s.frames?.length ?? 0) > 0 ? `From planting to today, a week at a time.` : `From the day it was shared to today.`}</span>
            </div>
          )}
          <p className="jar-caption">
            Day {today}. Shared on day {s.day}, {ago(s.createdAt)}{today > s.day ? ', and growing on its own since: nobody mists or airs it' : ''}.
            {' '}Lights {cl.lightOn ? 'on' : 'off'}.
          </p>
        </div>

        <div className="detail-body">
          <header className="detail-head">
            <h1>{s.spec.name}</h1>
            <p className="detail-sub">
              by <a href={`#/u/${s.keeper}`}>@{s.keeper}</a>. Health <span className={`score score-${h.tone}`}>{score}</span>
              <span className={`pill tone-${h.tone}`}>{h.text}</span>
            </p>
            {s.note && <blockquote className="keeper-note">{s.note}</blockquote>}
          </header>

          <div className="shared-actions">
            <button type="button" className="button primary" onClick={() => plantCopy(s.spec, `@${s.keeper}`)}>
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
            <h2 id="now">On day {today}</h2>
            <dl className="vitals">
              <div><dt>Soil</dt><dd>{moistureWord(cl.moisture)}</dd></div>
              <div><dt>Humidity</dt><dd>{Math.round(cl.rh * 100)}<span className="unit">%</span></dd></div>
              <div><dt>Air</dt><dd>{cl.airTempC.toFixed(1)}<span className="unit">°C</span></dd></div>
              <div><dt>Glass</dt><dd>{glassWord(cl.condensationIndex)}</dd></div>
              {st.soil && <div><dt>Soil pH</dt><dd>{st.soil.pH.toFixed(1)}<span className="unit"> {pHWord(st.soil.pH).toLowerCase()}</span></dd></div>}
              {st.soil && <div><dt>Soil air</dt><dd>{soilAirWord(st.soil.air)}</dd></div>}
            </dl>
            {(st.pools.mushroomG ?? 0) > 0 && <p className="note">Mushrooms are up on the driftwood.</p>}
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
            {me?.name === s.keeper ? (
              confirmRemove ? (
                <span className="confirm">
                  Remove it from the community shelf? Your jar stays on your own shelf.
                  <button type="button" className="button danger" onClick={onRemove}>Remove</button>
                  <button type="button" className="button quiet" onClick={() => setConfirmRemove(false)}>Keep it</button>
                </span>
              ) : (
                <button type="button" className="button" onClick={() => setConfirmRemove(true)}><Trash2 size={16} aria-hidden="true" /> Remove from community shelf</button>
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
