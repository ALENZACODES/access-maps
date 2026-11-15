import { useState } from 'react';
import type { BarrierEvent, OsmEdit } from './index';
import { OSM_ATTRIBUTION, OSM_HELP_URL, previewOsmTags, toAgencyReport, toOsmChange } from './index';

type Language = 'en' | 'fr';
const strings = {
  en: {
    title: 'Export reviewed drafts', osm: 'OSM changeset', agency: 'Agency barrier report',
    choose: 'Choose a reviewed draft', preview: 'Preview selected tags', exportOsm: 'Download .osc',
    exportCsv: 'Download CSV', exportText: 'Download text', agencyName: 'Agency or city name',
    help: 'A human submits this file. The App never logs in to OSM. Check the tags and existing map details in an editor before uploading.',
    helpLink: 'Official OSM editor help', error: 'Export unavailable', checked: 'Last checked',
    unknown: 'Unknown', reviewed: 'I reviewed these facts and selected the tags for export',
    source: 'Source', licence: 'Licence', tier: 'Tier',
  },
  fr: {
    title: 'Exporter les brouillons vérifiés', osm: 'Modifications OSM', agency: 'Rapport des obstacles',
    choose: 'Choisir un brouillon vérifié', preview: 'Aperçu des attributs choisis', exportOsm: 'Télécharger .osc',
    exportCsv: 'Télécharger CSV', exportText: 'Télécharger le texte', agencyName: 'Nom de l’agence ou de la ville',
    help: 'Une personne soumet ce fichier. L’App ne se connecte jamais à OSM. Vérifiez les attributs et les données de la carte dans un éditeur avant l’envoi.',
    helpLink: 'Aide officielle de l’éditeur OSM', error: 'Exportation indisponible', checked: 'Dernière vérification',
    unknown: 'Inconnu', reviewed: 'J’ai vérifié ces faits et choisi les attributs à exporter',
    source: 'Source', licence: 'Licence', tier: 'Niveau',
  },
} as const;

function download(filename: string, data: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The parent supplies only person-reviewable local drafts; nothing is transmitted. */
export function WritebackPanel({ edits, events, language = 'en' }: {
  edits: OsmEdit[]; events: BarrierEvent[]; language?: Language;
}) {
  const s = strings[language];
  const [selected, setSelected] = useState<number[]>([]);
  const [approved, setApproved] = useState(false);
  const [agency, setAgency] = useState('');
  const [error, setError] = useState('');
  const chosen = selected.map((index) => edits[index]).filter((edit): edit is OsmEdit => Boolean(edit));
  const canExport = approved && chosen.length > 0;
  function act(task: () => void) {
    try { setError(''); task(); } catch (err) { setError(`${s.error}: ${err instanceof Error ? err.message : ''}`); }
  }
  return (
    <section aria-labelledby="writeback-title">
      <h2 id="writeback-title">{s.title}</h2>
      <fieldset>
        <legend>{s.choose}</legend>
        {edits.map((edit, index) => (
          <label key={index} style={{ display: 'block' }}>
            <input type="checkbox" checked={selected.includes(index)} onChange={(event) => {
              setApproved(false);
              setSelected((before) => event.target.checked ? [...before, index] : before.filter((n) => n !== index));
            }} />
            {edit.osmType} {edit.osmId ?? `${edit.lat ?? '?'}, ${edit.lon ?? '?'}`} — {edit.comment}
          </label>
        ))}
      </fieldset>
      <h3>{s.preview}</h3>
      {chosen.map((edit, index) => (
        <div key={index}>
          <p>{edit.comment}</p>
          <dl>{edit.confirmedFields.map((field) => {
            const fact = edit.tags[field];
            return <div key={field}>
              <dt>{field}</dt><dd>{fact?.value === 'UNKNOWN' || !fact ? s.unknown : String(fact.value)}
                {' — '}{s.source}: {fact?.source_id ?? s.unknown}; {s.licence}: {fact?.licence ?? s.unknown};
                {' '}{s.checked}: {fact?.retrieved_at ?? s.unknown}; {s.tier}: {fact?.tier ?? s.unknown}
              </dd>
            </div>;
          })}</dl>
        </div>
      ))}
      <label><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />{s.reviewed}</label>
      <p>{OSM_ATTRIBUTION}</p>
      <h3>{s.osm}</h3>
      <button type="button" disabled={!canExport} onClick={() => act(() => {
        chosen.forEach(previewOsmTags);
        download('reviewed-changes.osc', toOsmChange(chosen), 'application/xml;charset=utf-8');
      })}>{s.exportOsm}</button>
      <p>{s.help} <a href={OSM_HELP_URL} target="_blank" rel="noopener noreferrer">{s.helpLink}</a></p>
      <h3>{s.agency}</h3>
      <label>{s.agencyName} <input value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
      <button type="button" disabled={!approved || !agency.trim() || !events.length} onClick={() => act(() => {
        download('barrier-observations.csv', toAgencyReport(events, { name: agency }).csv, 'text/csv;charset=utf-8');
      })}>{s.exportCsv}</button>
      <button type="button" disabled={!approved || !agency.trim() || !events.length} onClick={() => act(() => {
        download('barrier-observations.txt', toAgencyReport(events, { name: agency }).text, 'text/plain;charset=utf-8');
      })}>{s.exportText}</button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
