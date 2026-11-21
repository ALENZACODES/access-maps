import {parseInventory, UNKNOWN} from './dependency-core.mjs';
import {auditInventory} from './dependency-audit.mjs';
import {safeTsvCell} from './dependency-report.mjs';

/** Enumerate actual paths from a publication view to a cited source or file. */
function allPaths(inventory, predicate) {
  const assets = new Map(inventory.assets.map(asset => [asset.id,asset]));
  const rows=[];
  for(const surface of inventory.surfaces) {
    for(const rootId of surface.assetIds) {
      function visit(id, path) {
        const asset=assets.get(id);
        const chain=[...path,id];
        if(predicate(asset)) {
          rows.push({surfaceId:surface.id,locale:surface.locale,route:surface.route,rootId,
            assetId:id,chain,assetPath:asset.path,assetMode:asset.mode,assetKind:asset.kind});
        }
        for(const dependency of asset.dependsOn)visit(dependency,chain);
      }
      visit(rootId,[]);
    }
  }
  return rows.sort((a,b)=>a.surfaceId.localeCompare(b.surfaceId)||a.rootId.localeCompare(b.rootId)||
    a.assetId.localeCompare(b.assetId)||a.chain.join('/').localeCompare(b.chain.join('/')));
}
export function sourceImpact(input, sourceId) {
  const inventory=parseInventory(input);
  const source=inventory.sources.find(row=>row.id===sourceId);
  if(!source)throw new RangeError(`Unknown source: ${sourceId}`);
  const paths=allPaths(inventory,asset=>asset.sourceIds.includes(sourceId));
  const audit=auditInventory(inventory);
  const surfaceIds=new Set(paths.map(path=>path.surfaceId));
  const findings=audit.findings.filter(item=>item.sourceId===sourceId ||
    (surfaceIds.has(item.surfaceId) && item.sourceId===UNKNOWN));
  return {schema:'attribution-source-impact/1',source:{...source},paths,
    affectedSurfaces:[...surfaceIds].sort(),findings,
    blocking:findings.filter(item=>item.severity==='block').length,
    note:'Only documented asset dependencies are followed. UNKNOWN remains UNKNOWN.'};
}
export function assetImpact(input, assetId) {
  const inventory=parseInventory(input);
  const asset=inventory.assets.find(row=>row.id===assetId);
  if(!asset)throw new RangeError(`Unknown asset: ${assetId}`);
  const paths=allPaths(inventory,row=>row.id===assetId);
  const surfaces=[...new Set(paths.map(row=>row.surfaceId))].sort();
  return {schema:'attribution-asset-impact/1',asset:{...asset},paths,affectedSurfaces:surfaces,
    used:paths.length>0};
}
export function sourceImpactMatrix(input) {
  const inventory=parseInventory(input);
  return inventory.sources.map(source=>{
    const report=sourceImpact(inventory,source.id);
    return {sourceId:source.id,sourceName:source.name,licence:source.licence,
      retrievedOn:source.retrievedOn,tier:source.tier,permission:source.permission,
      surfaceCount:report.affectedSurfaces.length,pathCount:report.paths.length,
      blocking:report.blocking,surfaces:report.affectedSurfaces};
  }).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
}
export function sourceImpactTsv(input) {
  const columns=['sourceId','sourceName','licence','retrievedOn','tier','permission',
    'surfaceCount','pathCount','blocking','surfaces'];
  const rows=sourceImpactMatrix(input);
  const lines=[columns.join('\t')];
  for(const row of rows)lines.push(columns.map(key=>safeTsvCell(Array.isArray(row[key])?row[key].join('; '):row[key])).join('\t'));
  return `${lines.join('\n')}\n`;
}
export function sourceImpactText(input, sourceId, locale='en') {
  const report=sourceImpact(input,sourceId);
  const french=locale==='fr';
  const colon=french?'\u00a0:':':';
  const line=(label,value)=>`${label}${colon} ${value}`;
  const lines=[french?'Incidence des sources dans les fichiers':'Source impact across files',
    line(french?'Source':'Source',report.source.name),
    line(french?'Licence':'Licence',report.source.licence),
    line(french?'Récupération le':'Retrieved on',report.source.retrievedOn),
    line(french?'Niveau de preuve':'Evidence tier',report.source.tier),
    line(french?'Vues concernées':'Affected views',report.affectedSurfaces.length),
    line(french?'Lacunes bloquantes':'Blocking gaps',report.blocking),''];
  for(const path of report.paths) {
    lines.push(`${path.surfaceId} | ${path.rootId} | ${path.chain.join(' > ')} | ${path.assetPath}`);
  }
  for(const finding of report.findings) {
    lines.push(`${finding.severity.toUpperCase()} | ${finding.code} | ${finding.surfaceId}`);
  }
  lines.push('',french?'Seules les dépendances consignées sont prises en compte. UNKNOWN reste UNKNOWN.':
    'Only recorded dependencies are followed. UNKNOWN remains UNKNOWN.');
  return `${lines.join('\n')}\n`;
}
