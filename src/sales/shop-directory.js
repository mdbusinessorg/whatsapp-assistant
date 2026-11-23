const { unzipSync, strFromU8 } = require('fflate');

const URL = 'https://production-raw-data-api.s3.amazonaws.com/ISO3/AGO/points_of_interest/hotosm_ago_points_of_interest_osm_geojson.zip';
const groups = {
  Tecnologia: ['computer', 'electronics', 'mobile_phone', 'video_games', 'hifi'],
  Moda: ['clothes', 'shoes', 'fashion_accessories', 'bag', 'boutique'],
  Alimentação: ['bakery', 'supermarket', 'convenience', 'greengrocer', 'butcher', 'seafood', 'deli', 'pastry'],
  'Casa e decoração': ['furniture', 'interior_decoration', 'houseware', 'bed', 'kitchen', 'curtain'],
  Beleza: ['beauty', 'cosmetics', 'perfumery', 'hairdresser'],
  Automóvel: ['car', 'car_parts', 'tyres', 'motorcycle', 'car_repair'],
  Desporto: ['sports', 'bicycle', 'outdoor'],
  Papelaria: ['books', 'stationery', 'copyshop'],
};
const labels = new Map(Object.entries(groups).flatMap(([k, tags]) => tags.map(t => [t, k])));
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const sector = tag => labels.get(tag) || tag;
let cache, loading;

async function download() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Directório indisponível (HTTP ${res.status}).`);
  const zip = new Uint8Array(await res.arrayBuffer());
  if (zip.length > 12e6) throw new Error('Directório demasiado grande.');
  const files = unzipSync(zip, { filter: f => f.name === 'points_of_interest.geojson' && f.originalSize < 64e6 });
  if (!files['points_of_interest.geojson']) throw new Error('Formato do directório não reconhecido.');
  const entries = [];
  for (const { properties: p } of JSON.parse(strFromU8(files['points_of_interest.geojson'])).features) {
    if (!p?.name || !p.shop || !/^(node|way|relation)\/\d+$/.test(p.id) || !p.adm1_name) continue;
    entries.push({ id: p.id.replace('/', '-'), name: String(p.name).slice(0, 100), tag: p.shop,
      region: p.adm1_name, source: `https://www.openstreetmap.org/${p.id}` });
  }
  cache = { at: Date.now(), entries };
  return entries;
}

async function shops() {
  if (cache && Date.now() - cache.at < 86400000) return cache.entries;
  loading ||= download().finally(() => { loading = null; });
  return loading;
}

module.exports = { shops, groups, fold, sector };
