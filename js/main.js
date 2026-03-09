import { 
  TC, TL, TB,
  SRC_RING, SRC_BG, SRC_LABEL,
  PRIV_OPERATORS
} from "./01_config.js";

import {
  hav,
  walkMin,
  decodeRot13,
  cleanEmail,
  buildAddress,
  sanitizeHTML
} from "./02_utils.js";

import { inferType, getBookingInfo } from "./06_business_rules.js";

import { mergeAll, applyFix } from "./05_merge.js";

import { RPE_PARIS, parisArr, getRPE } from "./04_data_local.js";

import {
  map,
  clearMarkers,
  renderMarkers,
  updateUserLocation,
  openMarkerById,
  renderRPEMarker
} from "./07_map.js";

let allData = [];

let activeT = new Set([
  'creche_pub',
  'creche_assoc',
  'creche_priv',
  'am',
  'halte'
]);

// ═══════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════


// ═══════════════════════════════════════════
// ÉVÉNEMENTS UI
// ═══════════════════════════════════════════
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  const t = c.dataset.t;
  if (activeT.has(t)) { activeT.delete(t); c.classList.remove('on'); }
  else                { activeT.add(t);    c.classList.add('on');    }
  render();
}));
['fSort','fSource'].forEach(id => document.getElementById(id).addEventListener('change', render));
document.getElementById('addr').addEventListener('keydown', e => { if (e.key==='Enter') runSearch(); });




// ═══════════════════════════════════════════
// REVERSE GEOCODING — remplit les adresses manquantes
// api-adresse.data.gouv.fr/reverse : gratuit, pas de clé
// On fait les appels en batch pour ne pas bloquer le rendu.
// ═══════════════════════════════════════════
async function reverseGeocodeMissing(records) {
  const missing = records.filter(r => !r.address);
  if (!missing.length) return records;

  // Batch de max 50 en parallèle
  const BATCH = 50;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(batch.map(async r => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/reverse/?lon=${r.lng}&lat=${r.lat}&limit=1`
        );
        if (!res.ok) return;
        const d = await res.json();
        if (d.features?.length) {
          const p = d.features[0].properties;
          r.address = [p.housenumber, p.street, p.postcode, p.city]
            .filter(Boolean).join(' ');
        }
      } catch(_) {}
    }));
  }
  return records;
}

// ═══════════════════════════════════════════
// GÉOCODAGE
// ═══════════════════════════════════════════
async function geocode(q) {
  let r;
try {
  r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`);
} catch(e) {
  throw new Error("Service de géocodage momentanément indisponible. Réessayez.");
};
  if (!r.ok) throw new Error('Erreur géocodage HTTP '+r.status);
  const d = await r.json();
  if (!d.features.length) throw new Error('Adresse introuvable. Soyez plus précis.');
  const f = d.features[0];
  const cc = f.properties.citycode || '';
  const dept = cc.startsWith('75') ? '75' : cc.slice(0,2);
  return { lat:f.geometry.coordinates[1], lng:f.geometry.coordinates[0], label:f.properties.label, dept };
}

// ═══════════════════════════════════════════
// TYPAGE UNIFIÉ — statut juridique EAJE + opérateur OSM + tags
//
// Valeurs réelles du champ statut_juridique CNAF/EAJE :
//   Privé lucratif  : "Entreprise (société, SARL, SAS...)",
//                     "Personne physique", "Autre organisme privé"
//   Non-lucratif    : "Association", "Fondation", "Mutuelle"
//   Public          : "Commune", "CCAS", "CAF", "Département",
//                     "État", "Établissement public"
// ═══════════════════════════════════════════



// ═══════════════════════════════════════════
// SOURCE 1 — Overpass / OSM (requête complémentaire)
// Rationale : APUR (carto2.apur.org) bloque le CORS depuis navigateur.
// On utilise une deuxième requête Overpass avec des tags complémentaires
// à fetchOSM pour maximiser la couverture sans doublon.
// fetchOSM  → amenity=childcare + nursery + kindergarten
// fetchEAJE → social_facility + name contenant "crèche/halte/multi-accueil"
//             + operator:type=public_institution filtré petite enfance
// ═══════════════════════════════════════════
async function fetchEAJE(lat, lng, radiusM) {
  // Tags complémentaires à fetchOSM (pas de doublon grâce au dédup 150m)
  // PAS de regex ~name : trop lente sur grand rayon → timeout Overpass
  const query = `[out:json][timeout:25];
(
  nwr["social_facility"="childcare"](around:${radiusM},${lat},${lng});
  nwr["amenity"="social_facility"]["social_facility"="childcare"](around:${radiusM},${lat},${lng});
);
out center tags;`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const d = await res.json();
    return (d.elements||[]).map((e,i) => {
      const eLat = e.lat ?? e.center?.lat;
      const eLng = e.lon ?? e.center?.lon;
      if (!eLat || !eLng) return null;
      const tags = e.tags || {};
      const name = tags.name || tags['name:fr'] || 'Établissement';
      const operator = tags.operator || '';
      return {
        id:'osm2_'+e.id,
        name, address: buildAddress([
          [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
          tags['addr:postcode'], tags['addr:city']
        ]) || tags['addr:full'] || null,
        lat:+eLat, lng:+eLng,
        type: inferType(tags['operator:type']||'', tags.amenity||tags.social_facility||'', name, operator),
        typeRaw: tags.amenity||tags.social_facility||null, gestion: null,
        places: tags.capacity ? +tags.capacity : null,
        phone: tags.phone||tags['contact:phone']||null,
        email: tags.email||tags['contact:email']||null,
        hours: tags.opening_hours||null,
        website: tags.website||tags['contact:website']||null,
        operator: operator||null,
        sourceGroup:'EAJE', sourceLabel:'OSM+', agrément:null,
      };
    }).filter(Boolean);
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

// ═══════════════════════════════════════════
// SOURCE 2 — OpenStreetMap / Overpass
// ═══════════════════════════════════════════
async function fetchOSM(lat, lng, radiusM) {
  const query = `[out:json][timeout:25];
(
  nwr["amenity"="childcare"](around:${radiusM},${lat},${lng});
  nwr["amenity"="nursery"](around:${radiusM},${lat},${lng});
  nwr["amenity"="kindergarten"]["school:FR"!="maternelle"]["isced:level"!="1"](around:${radiusM},${lat},${lng});
);
out center tags;`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const d = await res.json();
    const ASSOC_OPS = ['association','parental','parentale','loi 1901','associatif'];
    return (d.elements||[]).map((e,i) => {
      const eLat = e.lat ?? e.center?.lat;
      const eLng = e.lon ?? e.center?.lon;
      if (!eLat || !eLng) return null;
      const tags     = e.tags || {};
      const name     = tags.name || tags['name:fr'] || 'Établissement';
      const operator = tags.operator || tags['operator:name'] || '';
      const cfr      = (tags['childcare:FR']||'').toLowerCase();
      let type = inferType(tags['operator:type']||'', tags.amenity||'', name, operator);
      if (cfr.includes('halte') || cfr.includes('multi')) type = 'halte';
      if (cfr.includes('mam')) type = 'am';
      const assocOp = ASSOC_OPS.some(op => operator.toLowerCase().includes(op));
      if (assocOp && type === 'creche_pub') type = 'creche_assoc';
      const addr = buildAddress([
        [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
        tags['addr:postcode'], tags['addr:city']
      ]) || tags['addr:full'] || null;
      return {
        id:'osm_'+e.id, osmId:e.id, osmType:e.type,
        name, address:addr, lat:+eLat, lng:+eLng, type,
        typeRaw:tags.amenity||null, gestion:null,
        places:tags.capacity?+tags.capacity:null,
        phone:tags.phone||tags['contact:phone']||null,
        email:tags.email||tags['contact:email']||null,
        hours:tags.opening_hours||null,
        website:tags.website||tags['contact:website']||null,
        operator: operator||null,
        sourceGroup:'OSM', sourceLabel:'OpenStreetMap', agrément:null,
      };
    }).filter(Boolean);
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

// ═══════════════════════════════════════════
// SOURCE 3 — Paris Data : "Que Faire à Paris"
//
// Dataset : que-faire-a-paris-
// Filtre  : tags like "Petite enfance" OR tags like "Crèche"
// Champ géo confirmé : lat_lon (objet {lat, lon} en ODS v2.1)
//
// Fallback sur tous les champs géo possibles ODS :
//   lat_lon, latlon, geo_point_2d, location, geolocalisation
//
// Distance filtrée côté serveur avec le prédicat distance()
// en utilisant le champ lat_lon.
//
// Note architecture : ce fetch est enveloppé dans DEPT_SOURCES
// pour permettre l'extension future aux autres départements.
// ═══════════════════════════════════════════
async function fetchParisQFP(lat, lng, radiusM) {
  const url = new URL('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records');

  // Filtre : établissements tagués "Petite enfance" ou "Crèche"
  // + filtre géo par distance sur le champ lat_lon
  url.searchParams.set('where',
    `(tags like "Petite enfance" OR tags like "Crèche" OR tags like "Assistante maternelle") ` +
    `AND distance(lat_lon, geom'POINT(${lng} ${lat})', ${radiusM}m)`
  );
  url.searchParams.set('limit', '100');
  url.searchParams.set('select', [
    'title','description','tags',
    'address_name','address_street','address_zipcode','address_city',
    'contact_phone','contact_email','contact_url',
    'lat_lon',          // champ géo principal ODS v2.1
    'latlon',           // variante
    'geo_point_2d',     // variante GeoJSON
    'location',         // variante générique
  ].join(','));

  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP '+res.status);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));

  const results = [];
  for (const [i, rec] of (d.results||[]).entries()) {
    // ── Extraction coordonnées ──────────────────────────────
    // Tester tous les champs géo possibles dans l'ordre
    let eLat = null, eLng = null;
    const geoFields = ['lat_lon','latlon','geo_point_2d','location','geolocalisation'];
    for (const f of geoFields) {
      const v = rec[f];
      if (!v) continue;
      if (typeof v === 'object' && v !== null) {
        eLat = v.lat ?? v.latitude ?? v.y ?? null;
        eLng = v.lon ?? v.lng ?? v.longitude ?? v.x ?? null;
      } else if (typeof v === 'string' && v.includes(',')) {
        const [a,b] = v.split(',').map(s=>+s.trim());
        if (!isNaN(a) && !isNaN(b)) { eLat=a; eLng=b; }
      }
      if (eLat && eLng) break;
    }
    if (!eLat || !eLng) continue; // pas de coordonnées → ignorer

    // ── Typage depuis les tags ──────────────────────────────
    const tags    = (rec.tags||'').toLowerCase();
    const title   = (rec.title||'').toLowerCase();
    const desc    = (rec.description||'').toLowerCase();
    const allText = tags + ' ' + title + ' ' + desc;
    let type = 'creche_pub';
    if (allText.includes('halte') || allText.includes('multi-accueil') || allText.includes('jardin d\'enfant')) {
      type = 'halte';
    } else if (allText.includes('assistante maternelle') || allText.includes('mam')) {
      type = 'am';
    } else if (allText.includes('parental') || allText.includes('associat') || allText.includes('loi 1901')) {
      type = 'creche_assoc';
    } else if (allText.includes('privé') || allText.includes('micro-crèche') || allText.includes('micro crèche')) {
      type = 'creche_priv';
    }

    results.push({
      id: 'paris_'+i,
      name: rec.title || rec.address_name || 'Établissement',
      address: buildAddress([rec.address_street, rec.address_zipcode, rec.address_city]),
      lat: +eLat, lng: +eLng, type,
      typeRaw: rec.tags||null, gestion: null,
      places: null,
      phone:   rec.contact_phone||null,
      email:   cleanEmail(rec.contact_email)||null,
      website: rec.contact_url||null,
      hours: null, operator: null,
      sourceGroup:'PARIS', sourceLabel:'Paris Data', agrément:null,
    });
  }
  return results;
}

// SOURCE 3 — Paris Data : désactivée
// "Que Faire à Paris" est un agenda d'événements participatifs, pas un annuaire
// d'établissements. La source OSM (source 1) couvre déjà Paris et la petite
// couronne de manière bien plus fiable. QFP retournait 0 résultats pertinents
// et causait des erreurs HTTP 400 dues à un changement de schéma du dataset.

// ═══════════════════════════════════════════
// REGISTRE DÉPARTEMENTAL
// OSM+ couvre 75+92+93+94 → source principale
// ═══════════════════════════════════════════
const DEPT_SOURCES = [
  // Paris Data QFP désactivé (agenda événements, pas annuaire structures)
  // L'OSM+ (source 1) couvre déjà Paris et la petite couronne
];

function getLocalFetch(dept) {
  const entry = DEPT_SOURCES.find(s => s.depts.includes(dept));
  return entry ? entry.fetch : null;
}



// ═══════════════════════════════════════════
// SEARCH PRINCIPAL
// ═══════════════════════════════════════════
async function runSearch() {
  const addr    = document.getElementById('addr').value.trim();
  const radiusM = +document.getElementById('radius').value;
  if (!addr) { toast('⚠️ Entrez une adresse'); return; }

  const btn = document.getElementById('btnS');
  btn.disabled = true; btn.textContent = '…';
  document.getElementById('lspin').style.display = 'inline-block';
  setAllDots('loading');
  document.getElementById('cnt-eaje').textContent  = '…';
  document.getElementById('cnt-osm').textContent   = '…';
  document.getElementById('cnt-paris').textContent = '…';
  document.getElementById('err-eaje').textContent  = '';
  document.getElementById('err-osm').textContent   = '';
  document.getElementById('err-paris').textContent = '';
  setProgress(5);
  document.getElementById('lcount').textContent = 'Géocodage…';
  document.getElementById('lbody').innerHTML = '';

  try {
    const geo = await geocode(addr);
    currentGeo = geo;
    setProgress(15);

    // Carte
    const zoom = radiusM<=500?16 : radiusM<=1000?15 : radiusM<=2000?14 : 13;
    map.setView([geo.lat, geo.lng], zoom);
    updateUserLocation(geo.lat, geo.lng, geo.label, radiusM);
    L.marker([geo.lat, geo.lng]).addTo(map).bindPopup(`<b>📍 Votre adresse</b><br>${geo.label}`);

    document.getElementById('lcount').textContent = 'Interrogation OSM+, OSM, Paris Data…';

    const localFetch = getLocalFetch(geo.dept);
    const [resEAJE, resOSM, resPARIS] = await Promise.allSettled([
      fetchEAJE(geo.lat, geo.lng, radiusM),
      fetchOSM(geo.lat, geo.lng, radiusM),
      localFetch ? localFetch(geo.lat, geo.lng, radiusM) : Promise.resolve([]),
    ]);

    setProgress(75);

    const eajeData  = resEAJE.status  === 'fulfilled' ? resEAJE.value  : [];
    const osmData   = resOSM.status   === 'fulfilled' ? resOSM.value   : [];
    const parisData = resPARIS.status === 'fulfilled' ? resPARIS.value : [];

    // Dots
    applyDotResult('eaje',  resEAJE,  eajeData.length);
    applyDotResult('osm',   resOSM,   osmData.length);
    if (localFetch) {
      applyDotResult('paris', resPARIS, parisData.length);
    } else {
      document.getElementById('dot-paris').className  = 'sdot na';
      document.getElementById('cnt-paris').textContent = 'N/A (hors Paris)';
    }

    setProgress(85);

    // Fusion : KNOWN injectés + correctifs + filtre rayon + tri
    const merged = mergeAll(eajeData, osmData, parisData, geo.lat, geo.lng, radiusM);
    console.log(`[PetitNid] EAJE:${eajeData.length} OSM:${osmData.length} Paris:${parisData.length} merged:${merged.length}`);
    console.log(`[PetitNid] resEAJE:${resEAJE.status} resOSM:${resOSM.status} resPARIS:${resPARIS.status}`);
    if (resEAJE.status==='rejected')  console.error('[PetitNid] EAJE error:', resEAJE.reason);
    if (resOSM.status==='rejected')   console.error('[PetitNid] OSM error:',  resOSM.reason);
    if (resPARIS.status==='rejected') console.error('[PetitNid] Paris error:', resPARIS.reason);
    allData = merged
      .map(r => ({...r, dist: hav(geo.lat, geo.lng, r.lat, r.lng)}))
      .filter(r => r.dist <= (radiusM/1000)*1.1 && isFinite(r.lat) && isFinite(r.lng))
      .sort((a,b) => a.dist - b.dist);

    setProgress(95);

    // ── Fallback places théoriques ────────────────────────────
    // Ordre de priorité :
    //   1. Donnée réelle (EAJE nb_places ou OSM capacity)  → affichage direct
    //   2. Règle réglementaire stricte (plafond légal)      → affichage "≤ X"
    //   3. Fourchette typologique (statistiques nationales) → affichage "~X"
    //
    // Sources réglementaires :
    //   Micro-crèche           : arrêté du 26/12/2000 modifié → max 10 simultanés
    //   Crèche parentale       : décret 2021-1131 → max 20 places
    //   Crèche collective PSU  : pas de plafond légal, moyenne nationale 33 pl.
    //   Multi-accueil          : combinaison halte + crèche, moyenne ~35 pl.
    //   Assistante maternelle  : max 6 enfants (dont max 4 < 3 ans) → non applicable ici
    allData.forEach(r => {
      if (r.places) return; // déjà renseigné → ne pas écraser
      const t   = r.type || '';
      const raw = (r.typeRaw  || '').toLowerCase();
      const ges = (r.gestion  || '').toLowerCase();
      const nom = (r.name     || '').toLowerCase();
      const all = raw + ' ' + ges + ' ' + nom;

      // Micro-crèche : plafond légal absolu
      if (all.includes('micro') || (t === 'creche_priv' && r.sourceGroup === 'KNOWN'))  {
        r.places = 10; r.placesLabel = '≤ 10'; r.placesEst = true; return;
      }
      // Crèche parentale : plafond légal
      if (t === 'creche_assoc' && (all.includes('parental') || all.includes('parentale'))) {
        r.places = 20; r.placesLabel = '≤ 20'; r.placesEst = true; return;
      }
      // Halte-garderie / multi-accueil : fourchette typologique
      if (t === 'halte') {
        r.places = 35; r.placesLabel = '~35'; r.placesEst = true; return;
      }
      // Crèche collective publique PSU : moyenne nationale
      if (t === 'creche_pub') {
        r.places = 33; r.placesLabel = '~33'; r.placesEst = true; return;
      }
      // Crèche associative collective : moyenne légèrement inférieure
      if (t === 'creche_assoc') {
        r.places = 25; r.placesLabel = '~25'; r.placesEst = true; return;
      }
      // Crèche privée collective (non micro) : fourchette large
      if (t === 'creche_priv') {
        r.places = 40; r.placesLabel = '~40'; r.placesEst = true; return;
      }
    });

    render();
    setProgress(100);

    // Compléter les adresses manquantes en arrière-plan puis re-render silencieux
    reverseGeocodeMissing(allData).then(() => render());

    // Header
    const nE = allData.filter(r=>r.sourceGroup==='EAJE').length;
    const nO = allData.filter(r=>r.sourceGroup==='OSM').length;
    const nP = allData.filter(r=>r.sourceGroup==='PARIS').length;
    const nB = allData.filter(r=>r.sourceGroup==='BOTH').length;
    const nK = allData.filter(r=>r.sourceGroup==='KNOWN').length;
    toast(allData.length
      ? `✅ ${allData.length} établissements — EAJE:${eajeData.length} · OSM:${osmData.length} · Paris:${parisData.length} · vérifiés:${nK}`
      : `⚠️ Aucun résultat — EAJE:${eajeData.length} OSM:${osmData.length} Paris:${parisData.length}`);

    if (allData.length) {
      const ll = allData.map(r=>[r.lat,r.lng]);
      ll.push([geo.lat,geo.lng]);
      map.fitBounds(L.latLngBounds(ll).pad(.12));
    }

  } catch(e) {
    toast('❌ '+e.message);
    document.getElementById('lcount').textContent = 'Erreur';
    document.getElementById('lbody').innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${e.message}</p></div>`;
  }

  btn.disabled = false; btn.textContent = 'Chercher';
  document.getElementById('lspin').style.display = 'none';
  setTimeout(() => setProgress(0), 1000);
}

window.runSearch = runSearch;


// ── Modal RPE — injecté une fois dans le DOM ─────────────────
function ensureRPEModal() {
  if (document.getElementById('rpe-modal')) return;
  const el = document.createElement('div');
  el.id = 'rpe-modal';
  el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(30,20,10,.45);align-items:center;justify-content:center;padding:1rem';
  el.innerHTML = `
    <div id="rpe-modal-box" style="background:#fff;border-radius:14px;max-width:420px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.18);overflow:hidden;font-family:'DM Sans',sans-serif">
      <div style="background:#c8663a;padding:.8rem 1.1rem;display:flex;align-items:center;justify-content:space-between">
        <div style="color:white;font-weight:800;font-size:.9rem">👶 Relais Petite Enfance</div>
        <button onclick="document.getElementById('rpe-modal').style.display='none'"
          style="background:none;border:none;color:white;font-size:1.2rem;cursor:pointer;line-height:1;opacity:.85">✕</button>
      </div>
      <div style="padding:1rem 1.1rem;overflow-y:auto;max-height:70vh">
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.5rem">C'est quoi un RPE ?</div>
        <p style="font-size:.75rem;color:#555;line-height:1.55;margin:0 0 .7rem">
          Le <strong>Relais Petite Enfance</strong> est un service public gratuit géré par la Ville de Paris. 
          Il met en relation les familles avec les assistantes maternelles agréées du quartier, 
          et accompagne les professionnelles dans leur pratique quotidienne.
        </p>
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.4rem">Pourquoi les contacter ?</div>
        <ul style="font-size:.75rem;color:#555;line-height:1.6;margin:0 0 .8rem;padding-left:1.1rem">
          <li>Obtenir la <strong>liste des AM disponibles</strong> dans votre secteur</li>
          <li>Être conseillé sur le <strong>contrat de travail</strong> et les aides CMG</li>
          <li>Participer à des <strong>temps collectifs</strong> avec votre enfant et son AM</li>
          <li>Résoudre un <strong>problème avec votre AM actuelle</strong></li>
        </ul>
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.4rem">Votre RPE de secteur</div>
        <div id="rpe-modal-details" style="font-size:.75rem;color:#444;line-height:1.7;background:#fff8f4;border-radius:8px;padding:.65rem .8rem;border-left:3px solid #c8663a"></div>
        <a href="https://monenfant.fr/que-recherchez-vous" target="_blank"
          style="display:block;margin-top:.85rem;background:#c8663a;color:white;font-weight:700;font-size:.78rem;text-align:center;padding:.55rem;border-radius:8px;text-decoration:none">
          Rechercher une assistante maternelle sur monenfant.fr →
        </a>
        <div style="font-size:.62rem;color:#bbb;margin-top:.5rem;text-align:center">
          Accès libre et gratuit · Aucune inscription requise au RPE
        </div>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) el.style.display='none'; });
  document.body.appendChild(el);
}

function openRPEModal(rpe, amZone, placesZone, radiusM) {
  ensureRPEModal();
  const radLabel = radiusM >= 1000 ? (radiusM/1000)+'km' : radiusM+'m';
  document.getElementById('rpe-modal-details').innerHTML = `
    <div style="font-weight:700;color:#2d4a3e;margin-bottom:.25rem">${rpe.name}</div>
    <div>📍 ${rpe.address}</div>
    ${rpe.phone ? `<div>📞 <a href="tel:${rpe.phone}" style="color:#c8663a;font-weight:600;text-decoration:none">${rpe.phone}</a></div>` : ''}
    ${rpe.email ? `<div>✉️ <a href="mailto:${rpe.email}" style="color:#c8663a;text-decoration:none">${rpe.email}</a></div>` : ''}
    ${rpe.hours ? `<div>⏰ ${rpe.hours}</div>` : '<div style="color:#aaa;font-size:.7rem">Horaires : nous contacter</div>'}
    <div style="margin-top:.4rem;padding-top:.35rem;border-top:1px solid #fde8dc;color:#888;font-size:.7rem">
      ~${amZone} AM agréées · ~${placesZone} places théoriques dans un rayon de ${radLabel}
    </div>`;
  document.getElementById('rpe-modal').style.display = 'flex';
}

// ── Bloc nounou compact (clic → modal détail) ─────────────
function nounouCardHTML() {
  return `<div class="card nounou-card" id="nounou-block"
    onclick="openNounouModal()"
    style="border:2px solid #9a6a3a;background:linear-gradient(135deg,#fdf8f2 0%,#fff 100%)">
    <div class="ctop" style="margin-bottom:.2rem">
      <span class="tbadge" style="background:#f5e8d8;color:#7a4a1a;font-size:.7rem;padding:.18rem .55rem">🏠 Garde à domicile</span>
      <span style="font-size:.67rem;color:#9a6a3a;font-weight:600">Cliquez pour en savoir plus →</span>
    </div>
    <div style="font-size:.7rem;color:#666;line-height:1.45;margin:.1rem 0 .35rem">
      Pas d'agrément obligatoire → aucun fichier public. Trouvez via plateformes, bouche-à-oreille ou agences.
    </div>
    <div style="display:flex;gap:.3rem;flex-wrap:wrap">
      <span style="font-size:.62rem;background:#eef4fb;color:#1a3a6a;padding:.1rem .4rem;border-radius:4px;font-weight:600">Yoopala</span>
      <span style="font-size:.62rem;background:#fef6ec;color:#7a4a00;padding:.1rem .4rem;border-radius:4px;font-weight:600">Nounou Top</span>
      <span style="font-size:.62rem;background:#f0faf0;color:#1a5a1a;padding:.1rem .4rem;border-radius:4px;font-weight:600">Care.com</span>
      <span style="font-size:.62rem;background:#f5f0ff;color:#4a2a8a;padding:.1rem .4rem;border-radius:4px;font-weight:600">+ agences</span>
    </div>
  </div>`;
}

function openNounouModal()  { document.getElementById('nounouModal').classList.add('open');    document.body.style.overflow='hidden'; }
function closeNounouModal() { document.getElementById('nounouModal').classList.remove('open'); document.body.style.overflow=''; }

// ═══════════════════════════════════════════
// COMPARATEUR MODES DE GARDE
// ═══════════════════════════════════════════
let salaryMode = 'net'; // 'net' | 'brut'

function openCmp() {
  document.getElementById('cmpOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  updateCmp();
}
function closeCmp() {
  document.getElementById('cmpOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function setSalaryMode(mode) {
  salaryMode = mode;
  document.getElementById('btnNet').classList.toggle('active', mode==='net');
  document.getElementById('btnBrut').classList.toggle('active', mode==='brut');
  updateCmp();
}

function updateCmp() {
  const raw   = +document.getElementById('salarySlider').value;
  // Convertir en net mensuel si brut saisi (approximation : net ≈ brut × 0.78)
  const netMensuel = salaryMode === 'brut' ? Math.round(raw * 0.78) : raw;
  const netAnnuel  = netMensuel * 12;

  // Affichage slider
  document.getElementById('salaryVal').textContent =
    raw.toLocaleString('fr-FR') + ' €' + (salaryMode==='brut' ? ' brut → ' + netMensuel.toLocaleString('fr-FR') + ' € net' : '');

  // ── Barème PSU (crèches publiques, assoc, et certaines privées)
  // Planchers/plafonds CNAF 2024 : taux horaire × 200h/mois (10h/j × 20j)
  // Taux PSU : de 0,28€/h (≤ 700€/mois) à 2,85€/h (≥ 6 500€/mois)
  // Source : barème CNAF lettre-circulaire 2023-010
  const tauxPSU = (() => {
    if (netMensuel <= 700)  return 0.28;
    if (netMensuel <= 1000) return 0.35;
    if (netMensuel <= 1500) return 0.55;
    if (netMensuel <= 2000) return 0.85;
    if (netMensuel <= 2500) return 1.15;
    if (netMensuel <= 3000) return 1.45;
    if (netMensuel <= 3500) return 1.75;
    if (netMensuel <= 4000) return 2.05;
    if (netMensuel <= 5000) return 2.35;
    if (netMensuel <= 6500) return 2.65;
    return 2.85;
  })();
  const hMois = 200; // 10h/j × 20j ouvrés — hypothèse temps plein
  const brutPSU = Math.round(tauxPSU * hMois);

  // Crédit d'impôt 50% plafonné 3 500€/an/enfant → max 1 750€/an → 146€/mois
  // (S'applique aux dépenses réelles, hors crèche publique PSU)
  const ciMax = Math.round(1750 / 12); // ~146€/mois

  // ── CMG (Complément Mode de Garde) pour AM et nounou
  // 3 tranches CNAF 2024 (enfant < 3 ans, 1 enfant, couple)
  // Tranche 1 : ≤ 21 869€/an → 472€/mois
  // Tranche 2 : ≤ 47 761€/an → 296€/mois
  // Tranche 3 : > 47 761€/an → 149€/mois
  const cmg = (() => {
    if (netAnnuel <= 21869) return 472;
    if (netAnnuel <= 47761) return 296;
    return 149;
  })();

  // Salaire brut AM / nounou plein temps Paris 2024
  // SMIC horaire 11,65€ → AM agréée ~ 4,63€ net/h (≥ SMIC×0,281)
  // En pratique AM Paris : ~1 100€ net/mois + cotisations patronales ~450€ → coût employeur ~1 550€
  const coutAM_brut = 1550;
  const coutAM_net  = Math.max(0, coutAM_brut - cmg);
  // CI 50% sur (coût employeur - CMG) plafonné 3 500€/an
  const ciAM = Math.min(ciMax, Math.round(coutAM_net * 0.5));
  const coutAM_final = Math.max(0, coutAM_net - ciAM);

  // Nounou partagée : 2 familles partagent 1 nounou → salaire ~2 000€ net/mois
  // Coût employeur ~2 800€ → part de chaque famille ~1 400€ avant aides
  const coutShare_brut = 1400;
  const coutShare_net  = Math.max(0, coutShare_brut - cmg);
  const ciShare = Math.min(ciMax, Math.round(coutShare_net * 0.5));
  const coutShare_final = Math.max(0, coutShare_net - ciShare);

  // Crèche privée : tarif brut moyen Paris ~1 200–1 800€/mois
  // PSU si conventionnée (cas fréquent Babilou, Les Petits Chaperons…)
  // Micro-crèche PAJE : tarif libre ~1 400€ brut, CI 50% plafonné
  const brutPriv = 1400;
  const ciPriv   = Math.min(ciMax, Math.round(brutPriv * 0.5));
  const coutPriv_final = Math.max(0, brutPriv - ciPriv);

  // Helper affichage
  const fmt = (n, sub='') => `<span>${n.toLocaleString('fr-FR')} €</span><span class="cost-sub">${sub}</span>`;

  document.getElementById('c-pub').innerHTML   = fmt(brutPSU,           'barème CAF, aucune aide sup.');
  document.getElementById('c-priv').innerHTML  = fmt(coutPriv_final,    `brut ~${brutPriv}€ · CI 50%`);
  document.getElementById('c-assoc').innerHTML = fmt(brutPSU,           'même barème PSU que public');
  document.getElementById('c-am').innerHTML    = fmt(coutAM_final,      `CMG −${cmg}€ · CI −${ciAM}€`);
  document.getElementById('c-share').innerHTML = fmt(coutShare_final,   `CMG −${cmg}€ · CI −${ciShare}€`);
}

// ── Carte AM compacte — tête de liste ────────────────────────
function amCardHTML(rpe, userLat, userLng, radiusM) {
  const circleKm2  = Math.PI * (radiusM / 1000) ** 2;
  const fraction   = Math.min(1, circleKm2 / rpe.surface_km2);
  const amZone     = Math.max(1, Math.round(rpe.am_count * fraction));
  const placesZone = amZone * 4;
  const couverture = fraction >= 0.95 ? 'zone complète' : `~${Math.round(fraction*100)}% de la zone`;
  const radLabel   = radiusM >= 1000 ? (radiusM/1000)+'km' : radiusM+'m';

  return `<div class="card am-card" id="am-block"
    style="border-left:4px solid #c8663a;background:#fff8f4;cursor:pointer"
    onclick="openRPEModal(window._currentRPE, ${amZone}, ${placesZone}, ${radiusM})">
    <div class="ctop" style="margin-bottom:.2rem">
      <span class="tbadge tb-am">👶 Ass. maternelles · ${rpe.arr.join('/')}e</span>
      <span style="font-size:.65rem;color:#c8663a;font-weight:600;white-space:nowrap">ℹ️ En savoir +</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;margin:.15rem 0 .1rem">
      <span style="font-size:1.1rem;font-weight:800;color:#c8663a">~${amZone} AM</span>
      <span style="font-size:.7rem;color:#888">·</span>
      <span style="font-size:1.1rem;font-weight:800;color:#c8663a">~${placesZone} places*</span>
      <span style="font-size:.65rem;color:#aaa">${couverture} · rayon ${radLabel}</span>
    </div>
    <div style="font-size:.68rem;color:#777;margin:.1rem 0 .3rem;line-height:1.4">
      🏠 Accueil à domicile — adresses non publiées
    </div>
    <div style="border-top:1px solid #fde8dc;padding-top:.3rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
      <div style="font-size:.69rem;color:#555">
        <span style="font-weight:600">${rpe.name}</span>
        &nbsp;·&nbsp;${rpe.address.split(',')[0]}
        ${rpe.phone ? `&nbsp;·&nbsp;<a href="tel:${rpe.phone}" onclick="event.stopPropagation()" style="color:#c8663a;font-weight:600;text-decoration:none">${rpe.phone}</a>` : ''}
      </div>
      <a href="https://monenfant.fr/que-recherchez-vous" target="_blank"
        onclick="event.stopPropagation()"
        class="cbtn" style="background:#c8663a;border-color:#c8663a;font-size:.68rem;padding:.22rem .6rem;flex-shrink:0">
        Trouver une AM →
      </a>
    </div>
    <div style="font-size:.57rem;color:#ccc;margin-top:.25rem">* Capacité max réglementaire : 4 enfants &lt; 3 ans par AM agréée</div>
  </div>`;
}
function filtered() {
  const sort   = document.getElementById('fSort').value;
  const srcFlt = document.getElementById('fSource').value;
  let d = allData.filter(r => activeT.has(r.type));
  if (srcFlt==='EAJE')  d = d.filter(r => r.sourceGroup==='EAJE'  || r.sourceGroup==='BOTH');
  if (srcFlt==='OSM')   d = d.filter(r => r.sourceGroup==='OSM'   || r.sourceGroup==='BOTH');
  if (srcFlt==='PARIS') d = d.filter(r => r.sourceGroup==='PARIS' || r.sourceGroup==='BOTH');
  if (sort==='name')    d = [...d].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  if (sort==='source')  d = [...d].sort((a,b)=>a.sourceGroup.localeCompare(b.sourceGroup));
  return d;
}

let currentGeo = null; // géo courante pour le bloc AM

function render() {
  const d = filtered();
  document.getElementById('lcount').innerHTML = allData.length
    ? `<strong>${d.length}</strong> / ${allData.length}` : 'Lancez une recherche…';
  const body = document.getElementById('lbody');
  if (!allData.length) return;
  if (!d.length) { body.innerHTML=`<div class="empty"><div class="big">🔎</div><p>Aucun résultat avec ces filtres.</p></div>`; clearMarkers(); return; }

  // Bloc AM en tête si on est à Paris et qu'on a une géolocalisation
  let amHtml = '';
  if (currentGeo && currentGeo.dept === '75') {
    const radiusM = +document.getElementById('radius').value;
    const rpe = getRPE(currentGeo.lat, currentGeo.lng);
    window._currentRPE = rpe;
    amHtml = amCardHTML(rpe, currentGeo.lat, currentGeo.lng, radiusM);
    // Marqueur RPE sur la carte
renderRPEMarker(rpe, radiusM);  }

  // Bloc nounou toujours affiché (pas de données publiques → guide uniquement)
  const nounouHtml = allData.length ? nounouCardHTML() : '';

  body.innerHTML = amHtml + nounouHtml + d.map(cardHTML).join('');
  body.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => {
    body.querySelectorAll('.card').forEach(x=>x.classList.remove('active'));
    c.classList.add('active');
    const r = allData.find(x=>x.id===c.dataset.id);
    if (r) {
      map.setView([r.lat,r.lng],17);
      // Ouvrir le popup du marqueur correspondant
      openMarkerById(r.id);
    }
  }));
  renderMarkers(d);
}

function cardHTML(r) {
  const walk = walkMin(r.dist);
  const ring = SRC_RING[r.sourceGroup]  || SRC_RING.OSM;
  const bg   = SRC_BG[r.sourceGroup]   || SRC_BG.OSM;
  const lbl  = SRC_LABEL[r.sourceGroup] || r.sourceGroup;
  const itinUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  const booking = getBookingInfo(r);
  const placesStr = r.places
    ? r.placesEst
      ? `<span title="Estimation réglementaire — donnée exacte non disponible" style="cursor:help">${r.placesLabel} places*</span>`
      : `${r.places} places`
    : '<span style="color:#bbb">places N/C</span>';
  const microNote = !r.placesEst && r.places <= 10 && (r.typeRaw||'').toLowerCase().includes('micro')
    ? ' <span style="color:#aaa;font-size:.6rem">(micro)</span>' : '';
  return `<div class="card" data-id="${r.id}">
    <div class="ctop">
      <span class="tbadge ${TB[r.type]}">${TL[r.type]}</span>
      <span class="cdist">🚶 ${walk}</span>
    </div>
    <div class="cname">${r.name}</div>
    ${r.address ? `<div class="caddr">📍 ${r.address}</div>` : ''}
    <div class="cmeta">
      ${r.phone   ? `<span class="m">📞 <a href="tel:${r.phone}" style="color:inherit;text-decoration:none">${r.phone}</a></span>` : ''}
      ${r.email   ? `<span class="m">✉️ <a href="mailto:${r.email}" style="color:inherit;text-decoration:none">${r.email}</a></span>` : ''}
      <span class="m">👶 ${placesStr}${microNote}</span>
      ${r.hours   ? `<span class="m">⏰ ${r.hours}</span>` : ''}
      ${r.website ? `<span class="m">🌐 <a href="${r.website}" target="_blank" style="color:var(--forest);text-decoration:none">Site web</a></span>` : ''}
    </div>
    <div class="cfooter">
      <span class="src-pill" style="background:${bg};color:${ring}">${lbl}</span>
      <a href="${booking.url}" target="_blank" class="cbtn">🔍 ${booking.label}</a>
      <a href="${itinUrl}" target="_blank" class="citin">→ Itinéraire</a>
    </div>
  </div>`;
}


// ═══════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════
function setProgress(p) { document.getElementById('prog').style.width = p+'%'; }
function setAllDots(state) { ['eaje','osm','paris'].forEach(k => document.getElementById('dot-'+k).className='sdot '+state); }
function applyDotResult(key, result, count) {
  const ok = result.status === 'fulfilled';
  document.getElementById('dot-'+key).className   = 'sdot '+(ok?'ok':'err');
  document.getElementById('cnt-'+key).textContent = ok ? count+' résultats' : '0';
  document.getElementById('err-'+key).textContent = ok ? '' : (result.reason?.message||'Erreur').slice(0,50);
}
let tT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(tT); tT = setTimeout(()=>el.classList.remove('show'), 5000);
}

window.openCmp = openCmp;
window.closeCmp = closeCmp;
window.setSalaryMode = setSalaryMode;
window.openNounouModal = openNounouModal;
window.closeNounouModal = closeNounouModal;
window.openRPEModal = openRPEModal;