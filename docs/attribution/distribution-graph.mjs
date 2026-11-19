/** Trace dependency closure and source obligations to each published view. */
export function graphIndex(manifest) {
  return {
    sources: new Map(manifest.sources.map(s => [s.id, s])),
    assets: new Map(manifest.assets.map(a => [a.id, a])),
    views: new Map(manifest.views.map(v => [v.id, v])),
    reverseAssets: reverseDependencies(manifest.assets),
  };
}
export function reverseDependencies(assets) {
  const reverse = new Map(assets.map(a => [a.id, new Set()]));
  for (const asset of assets) for (const dependency of asset.dependencyIds) {
    if (!reverse.has(dependency)) reverse.set(dependency, new Set());
    reverse.get(dependency).add(asset.id);
  }
  return reverse;
}
/** Iterative traversal avoids blowing the call stack on a deep manifest. */
export function assetClosure(startIds, index, maxNodes = 1600) {
  const visited = new Set();
  const missing = new Set();
  const queue = [...startIds];
  while (queue.length) {
    const next = queue.pop();
    if (visited.has(next)) continue;
    visited.add(next);
    if (visited.size > maxNodes) throw new Error('Dependency closure exceeds limit');
    const asset = index.assets.get(next);
    if (!asset) { missing.add(next); continue; }
    for (const dependency of asset.dependencyIds) if (!visited.has(dependency)) queue.push(dependency);
  }
  return { ids: [...visited].filter(x => index.assets.has(x)).sort(), missing: [...missing].sort() };
}
export function sourceClosure(view, index) {
  const assets = assetClosure(view.assetIds, index);
  const sourceIds = new Set();
  for (const id of assets.ids) for (const sid of index.assets.get(id).sourceIds) sourceIds.add(sid);
  return { assets, sources: [...sourceIds].sort() };
}
/** Full asset/source reachability by view, including declarations not in closure. */
export function distributionMatrix(manifest) {
  const index = graphIndex(manifest);
  const result = [];
  for (const view of manifest.views) {
    const closure = sourceClosure(view, index);
    const affected = closure.assets.ids.map(id => index.assets.get(id));
    const sourceRows = [...new Set([...closure.sources, ...view.sourceIds])].sort().map(id => ({
      id,
      recorded: index.sources.has(id),
      declared: view.sourceIds.includes(id),
      usedByAssets: closure.sources.includes(id),
      assetIds: affected.filter(a => a.sourceIds.includes(id)).map(a => a.id).sort(),
    }));
    result.push({
      viewId: view.id, locale: view.locale, path: view.path,
      assetIds: closure.assets.ids,
      missingAssetIds: closure.assets.missing,
      sources: sourceRows,
      unusedDeclarations: sourceRows.filter(s => s.declared && !s.usedByAssets).map(s => s.id),
      missingDeclarations: sourceRows.filter(s => !s.declared && s.usedByAssets).map(s => s.id),
    });
  }
  return result.sort((a, b) => a.viewId.localeCompare(b.viewId));
}
/** Detect cycles using Tarjan's algorithm without duplicate cycle reports. */
export function dependencyCycles(assets) {
  const index = new Map(assets.map(a => [a.id, a]));
  const visited = new Map();
  const low = new Map();
  const active = new Set();
  const stack = [];
  const found = [];
  let clock = 0;
  const explore = id => {
    visited.set(id, clock); low.set(id, clock); clock += 1;
    stack.push(id); active.add(id);
    for (const edge of index.get(id)?.dependencyIds ?? []) {
      if (!index.has(edge)) continue;
      if (!visited.has(edge)) {
        explore(edge);
        low.set(id, Math.min(low.get(id), low.get(edge)));
      } else if (active.has(edge)) low.set(id, Math.min(low.get(id), visited.get(edge)));
    }
    if (low.get(id) !== visited.get(id)) return;
    const group = [];
    let last;
    do {
      last = stack.pop();
      active.delete(last);
      group.push(last);
    } while (last !== id);
    if (group.length > 1 || index.get(id).dependencyIds.includes(id)) found.push(group.sort());
  };
  for (const asset of assets) if (!visited.has(asset.id)) explore(asset.id);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
}
export function impactedViews(manifest, changedSourceIds = [], changedAssetIds = []) {
  const changedSources = new Set(changedSourceIds);
  const changedAssets = new Set(changedAssetIds);
  const matrix = distributionMatrix(manifest);
  return matrix.filter(row => row.assetIds.some(id => changedAssets.has(id)) || row.sources.some(source => changedSources.has(source.id))).map(row => row.viewId);
}
export function upstreamPaths(manifest, viewId, sourceId) {
  const index = graphIndex(manifest);
  const view = index.views.get(viewId);
  if (!view) return [];
  const paths = [];
  const visit = (assetId, chain, visited) => {
    if (visited.has(assetId)) return;
    const asset = index.assets.get(assetId);
    if (!asset) return;
    const current = [...chain, assetId];
    if (asset.sourceIds.includes(sourceId)) paths.push(current);
    const next = new Set([...visited, assetId]);
    for (const dep of asset.dependencyIds) visit(dep, current, next);
  };
  for (const assetId of view.assetIds) visit(assetId, [], new Set());
  return paths.sort((a, b) => a.join('/').localeCompare(b.join('/')));
}
