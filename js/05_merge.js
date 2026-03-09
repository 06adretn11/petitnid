import { KNOWN_ESTABLISHMENTS } from "./04_data_local.js";

import { hav } from "./02_utils.js";

// Appliquer les correctifs sur un enregistrement si son nom correspond
export function applyFix(r) {
  const rName = r.name.toLowerCase();
  const fix = KNOWN_ESTABLISHMENTS.find(k => {
    // Mots distinctifs = mots > 5 lettres, hors termes génériques
    const GENERIC = new Set(['crèche','creche','collective','municipale','parentale','associative','enfants','enfant','multi','accueil','jardin','halte','maison']);
    const keywords = k.name.toLowerCase().split(/\s+/)
      .filter(w => w.length > 5 && !GENERIC.has(w));
    // Il faut que TOUS les mots distinctifs soient présents dans le nom
    return keywords.length > 0 && keywords.every(w => rName.includes(w));
  });
  if (!fix) return r;
  return {
    ...r,
    lat:     fix.lat,
    lng:     fix.lng,
    address: fix.address || r.address,
    phone:   fix.phone   || r.phone,
    email:   fix.email   || r.email,
    website: fix.website || r.website,
    hours:   fix.hours   || r.hours,
    places:  fix.places  ?? r.places,
    type:    fix.type    || r.type,
    _known:  true,
  };
}

// ═══════════════════════════════════════════
// FUSION — KNOWN prioritaire, puis EAJE, PARIS, OSM
// Règle clé : un KNOWN n'absorbe jamais un voisin géographique
// par simple proximité (coords imprécises). Il fusionne uniquement
// si applyFix() reconnaît le nom de l'établissement.
// Le dédup géographique (80m) s'applique UNIQUEMENT entre
// les sources API (EAJE, OSM, PARIS) entre elles.
// ═══════════════════════════════════════════
export function mergeAll(eaje, osm, local, userLat, userLng, radiusM) {
  // 1. Injecter les KNOWN dans le rayon
  const knownInRadius = KNOWN_ESTABLISHMENTS.filter(k =>
    hav(userLat, userLng, k.lat, k.lng) <= (radiusM / 1000) * 1.1
  );
  const pool = knownInRadius.map(k => ({...k, _srcs: new Set(['KNOWN'])}));

  // 2. Absorber les sources API
  const absorb = (item, key) => {
    // Appliquer correctif de coordonnées si le nom correspond à un KNOWN
    // (applyFix ne fait QUE corriger les champs — la décision d'absorption
    //  reste entièrement géographique ci-dessous)
    const fixed = applyFix(item);

    // Dédup géographique entre sources API uniquement (jamais avec les KNOWN)
    // Rayon 150m : les coords EAJE et OSM peuvent différer de 50–120m
    const apiEntries = pool.filter(x => !x._known);
    const near = apiEntries.find(x => hav(x.lat, x.lng, fixed.lat, fixed.lng) < 0.15);
    if (near) {
      near._srcs.add(key);
      if (!near.phone    && fixed.phone)    near.phone    = fixed.phone;
      if (!near.email    && fixed.email)    near.email    = fixed.email;
      if (!near.hours    && fixed.hours)    near.hours    = fixed.hours;
      if (!near.website  && fixed.website)  near.website  = fixed.website;
      if (!near.places   && fixed.places)   near.places   = fixed.places;
      if (near.places && fixed.places && fixed.places > near.places) near.places = fixed.places;
      if (!near.address  && fixed.address)  near.address  = fixed.address;
      if (!near.gestion  && fixed.gestion)  near.gestion  = fixed.gestion;
      if (!near.operator && fixed.operator) near.operator = fixed.operator;
    } else {
      pool.push({...fixed, _srcs: new Set([key])});
    }
  };

  eaje.forEach(e  => absorb(e,  'EAJE'));
  local.forEach(p => absorb(p, 'PARIS'));
  osm.forEach(o   => absorb(o, 'OSM'));

  return pool.map(item => {
    const srcs = [...item._srcs];
    const hasKnown = srcs.includes('KNOWN');
    const sourceGroup = hasKnown ? 'KNOWN'
      : srcs.length > 1 ? 'BOTH'
      : srcs[0];
    const sourceLabel = hasKnown ? 'Données vérifiées'
      : srcs.length > 1
        ? srcs.map(s=>({EAJE:'OSM+',OSM:'OSM',PARIS:'Paris Data'}[s]||s)).join('+')
        : {EAJE:'OSM+', OSM:'OpenStreetMap', PARIS:'Paris Data'}[srcs[0]] || srcs[0];
    return {...item, sourceGroup, sourceLabel, _srcs: undefined, _known: undefined};
  });
}