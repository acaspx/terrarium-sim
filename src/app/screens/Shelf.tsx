import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Rows3, X } from 'lucide-react';
import { faunaSpecies, healthScore } from '../../engine/index.js';
import { EmptyJar, Jar } from '../jar/Jar.js';
import { dayOf, glassWord, headline, moistureWord, plural, pluralName } from '../format.js';
import { unseenEvents, useStore, type JarRecord } from '../store.js';
import { Segmented } from '../ui/controls.js';
import type React from 'react';

type View = 'shelf' | 'table';

export function Shelf() {
  const store = useStore();
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('terrarium-sim:view') as View) ?? 'shelf';
    } catch {
      return 'shelf';
    }
  });
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('terrarium-sim:view', v);
    } catch {
      /* not essential */
    }
  };
  const jars = store.jars;
  const needing = jars.filter((j) => headline(j.state).tone !== 'good').length;

  return (
    <main className="shelf-page">
      <div className="shelf-intro">
        <h1>Your shelf</h1>
        <p className="lede">
          {jars.length === 0
            ? 'Nothing planted yet.'
            : `${plural(jars.length, 'terrarium')}, ${needing === 0 ? 'all in balance' : `${needing} ${needing === 1 ? 'needs' : 'need'} attention`}.`}
        </p>
        <Segmented<View>
          label="Layout" size="sm" value={view} onChange={changeView}
          options={[
            { id: 'shelf', label: <><LayoutGrid size={14} aria-hidden="true" /> Shelf</> },
            { id: 'table', label: <><Rows3 size={14} aria-hidden="true" /> Compare</> },
          ]}
        />
      </div>

      <AwayNotes jars={jars} />

      {view === 'shelf' ? (
        <ShelfGrid count={jars.length + 1}>
          {jars.map((j) => (
            <li key={j.id}>
              <ShelfJar j={j} />
            </li>
          ))}
          <li>
            <a className="shelf-slot add-slot" href="#/new">
              <span className="jar-stage"><EmptyJar /></span>
              <span className="tag">
                <span className="tag-name">Build a terrarium</span>
                <span className="tag-line">Choose a vessel, layers, plants and crew.</span>
              </span>
            </a>
          </li>
        </ShelfGrid>
      ) : (
        <CompareTable jars={jars} />
      )}
    </main>
  );
}

/** Pads the last row with empty shelf so every plank runs the full width. */
function ShelfGrid({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e!.contentRect.width;
      setCols(w < 640 ? 2 : Math.max(1, Math.floor(w / 200)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fillers = (cols - (count % cols)) % cols;
  return (
    <ul className="shelf" aria-label="Terrariums" ref={ref}>
      {children}
      {Array.from({ length: fillers }, (_, i) => (
        <li key={`f${i}`} className="filler" aria-hidden="true">
          <span className="jar-stage"><svg viewBox="0 0 200 280" /></span>
        </li>
      ))}
    </ul>
  );
}

function ShelfJar({ j }: { j: JarRecord }) {
  const h = headline(j.state);
  const score = healthScore(j.state);
  const fresh = unseenEvents(j).length;
  return (
    <a className="shelf-slot" href={`#/jar/${j.id}`}>
      <span className="jar-stage">
        <Jar spec={j.spec} state={j.state} lively title={`${j.spec.name}, day ${dayOf(j.state)}`} />
      </span>
      <span className="tag">
        <span className="tag-top">
          <span className="tag-name">{j.spec.name}</span>
          <span className={`score score-${h.tone}`} aria-label={`Health ${score} of 100`}>{score}</span>
        </span>
        <span className="tag-line">Day {dayOf(j.state)}{fresh > 0 && <span className="fresh"> {plural(fresh, 'new note')}</span>}</span>
        <span className={`tag-status tone-${h.tone}`}>{h.text}</span>
      </span>
    </a>
  );
}

function AwayNotes({ jars }: { jars: JarRecord[] }) {
  const store = useStore();
  const withNews = jars.map((j) => ({ j, events: unseenEvents(j) })).filter((x) => x.events.length > 0);
  if (withNews.length === 0) return null;
  return (
    <section className="away" aria-labelledby="away-title">
      <div className="away-head">
        <h2 id="away-title">Since you last looked</h2>
        <button type="button" className="icon-button" onClick={() => store.markAllSeen()} aria-label="Dismiss these notes">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ul>
        {withNews.map(({ j, events }) => (
          <li key={j.id}>
            <a href={`#/jar/${j.id}`}>{j.spec.name}</a>
            <span>{events.slice(-3).map((e) => e.message).join(' ')}{events.length > 3 ? ` And ${events.length - 3} more.` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompareTable({ jars }: { jars: JarRecord[] }) {
  if (jars.length === 0) return <p className="empty-note"><a href="#/new">Build your first terrarium</a> to start comparing.</p>;
  return (
    <div className="table-wrap">
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">Terrarium</th>
            <th scope="col">Day</th>
            <th scope="col">Health</th>
            <th scope="col">Soil</th>
            <th scope="col">Humidity</th>
            <th scope="col">Air</th>
            <th scope="col">Glass</th>
            <th scope="col">Plants</th>
            <th scope="col">Crew</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {jars.map((j) => {
            const s = j.state;
            const h = headline(s);
            const crew = s.fauna
              .filter((f) => faunaSpecies(f.speciesId).role === 'cleanup')
              .map((f) => `${Math.round(f.juveniles + f.adults).toLocaleString()} ${pluralName(faunaSpecies(f.speciesId).commonName)}`)
              .join(', ');
            return (
              <tr key={j.id}>
                <th scope="row">
                  <a href={`#/jar/${j.id}`} className="compare-name">
                    <span className="compare-thumb"><Jar spec={j.spec} state={s} /></span>
                    {j.spec.name}
                  </a>
                </th>
                <td className="num">{dayOf(s)}</td>
                <td className="num"><span className={`score score-${h.tone}`}>{healthScore(s)}</span></td>
                <td>{moistureWord(s.climate.moisture)}</td>
                <td className="num">{Math.round(s.climate.rh * 100)}%</td>
                <td className="num">{s.climate.airTempC.toFixed(1)} °C</td>
                <td>{glassWord(s.climate.condensationIndex)}</td>
                <td className="num">{j.spec.plants.length === 0 ? '0' : `${s.plants.length} of ${j.spec.plants.length}`}</td>
                <td>{crew || 'None'}</td>
                <td className={`tone-${h.tone}`}>{h.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
