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

import { filtered, cardHTML } from "./08_ui_render.js";
import { initComparator }     from "./09_comparator.js";
import { fetchODS92, fetchODS93 } from "./10_ods.js";

let allData = [];

// ═══════════════════════════════════════════
// CACHE sessionStorage
// Clé : "pn_cache_{addr}_{radiusM}"
// TTL : 15 minutes — évite les appels Overpass répétés
// sur la même adresse/rayon dans la même session.
// ═══════════════════════════════════════════
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(addr, radiusM) {
  return `pn_cache_${addr.toLowerCase().trim()}_${radiusM}`;
}

function cacheGet(addr, radiusM) {
  try {
    const raw = sessionStorage.getItem(cacheKey(addr, radiusM));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(addr, radiusM));
      return null;
    }
    return data;
  } catch { return null; }
}

function cacheSet(addr, radiusM, data) {
  try {
    sessionStorage.setItem(cacheKey(addr, radiusM), JSON.stringify({ ts: Date.now(), data }));
  } catch { /* sessionStorage plein ou désactivé — on ignore */ }
}

let activeT = new Set([
  'creche_pub',
  'creche_assoc',
  'creche_priv',
  'am',
  'halte'
]);

// ═══════════════════════════════════════════
// OVERPASS — timeout adaptatif + retry délai
// Timeout selon rayon : évite d'attendre 20s
// inutilement sur un petit rayon, et donne
// plus de temps aux grandes zones.
// Retry : attend 2s avant le miroir — souvent
// suffisant pour passer une surcharge ponctuelle.
// ═══════════════════════════════════════════
const OVERPASS_SERVERS = [
  '/api/overpass',                                  // proxy Netlify — IPs serveur, moins de 504
  'https://overpass-api.de/api/interpreter',        // fallback direct si proxy KO
  'https://overpass.kumi.systems/api/interpreter',  // miroir fallback
];

function overpassTimeout(radiusM) {
  if (radiusM <= 500)  return 12000;
  if (radiusM <= 1000) return 18000;
  if (radiusM <= 2000) return 26000;
  return 38000;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function overpassFetch(query, radiusM = 1000) {
  const timeoutMs = overpassTimeout(radiusM);
  const ovTimeout = Math.floor(timeoutMs / 1000) - 2;
  const timedQuery = query.replace(/\[timeout:\d+\]/, `[timeout:${ovTimeout}]`);

  // Séquence : proxy Netlify → overpass-api.de direct → kumi.systems
  // Si le proxy Netlify répond (cas normal), les deux fallbacks ne sont jamais appelés
  const attempts = [
    { server: OVERPASS_SERVERS[0], delay: 0    }, // proxy
    { server: OVERPASS_SERVERS[1], delay: 1500 }, // direct
    { server: OVERPASS_SERVERS[2], delay: 3000 }, // miroir
  ];

  let lastError;
  for (const { server, delay } of attempts) {
    if (delay > 0) await sleep(delay);
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(server, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    'data=' + encodeURIComponent(timedQuery),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      if (res.status === 504 || res.status === 429) {
        lastError = new Error('Serveur cartographique surchargé.');
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(tid);
      lastError = e.name === 'AbortError'
        ? new Error('Délai dépassé.')
        : e;
    }
  }
  throw lastError ?? new Error('Serveurs indisponibles.');
}


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
document.getElementById('btnS').addEventListener('click', runSearch);

initComparator();


// ═══════════════════════════════════════════
// REVERSE GEOCODING
// ═══════════════════════════════════════════
async function reverseGeocodeMissing(records) {
  const missing = records.filter(r => !r.address);
  if (!missing.length) return records;
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
  }
  if (!r.ok) throw new Error('Erreur géocodage HTTP ' + r.status);
  const d = await r.json();
  if (!d.features.length) throw new Error('Adresse introuvable. Soyez plus précis.');
  const f  = d.features[0];
  const cc = f.properties.citycode || '';
  const dept = cc.startsWith('75') ? '75' : cc.slice(0,2);
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties.label, dept };
}


// ═══════════════════════════════════════════
// SOURCE 1 — OSM+ (social_facility childcare)
// ═══════════════════════════════════════════
async function fetchEAJE(lat, lng, radiusM) {
  const query = `[out:json][timeout:25];
(
  nwr["social_facility"="childcare"](around:${radiusM},${lat},${lng});
  nwr["amenity"="social_facility"]["social_facility"="childcare"](around:${radiusM},${lat},${lng});
);
out center tags;`;
  const d = await overpassFetch(query, radiusM);
  return (d.elements||[]).map(e => {
    const eLat = e.lat ?? e.center?.lat;
    const eLng = e.lon ?? e.center?.lon;
    if (!eLat || !eLng) return null;
    const tags     = e.tags || {};
    const name     = tags.name || tags['name:fr'] || 'Établissement';
    const operator = tags.operator || '';
    return {
      id: 'osm2_' + e.id, name,
      address: buildAddress([
        [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
        tags['addr:postcode'], tags['addr:city']
      ]) || tags['addr:full'] || null,
      lat: +eLat, lng: +eLng,
      type: inferType(tags['operator:type']||'', tags.amenity||tags.social_facility||'', name, operator),
      typeRaw: tags.amenity||tags.social_facility||null, gestion: null,
      places:  tags.capacity ? +tags.capacity : null,
      phone:   tags.phone||tags['contact:phone']||null,
      email:   tags.email||tags['contact:email']||null,
      hours:   tags.opening_hours||null,
      website: tags.website||tags['contact:website']||null,
      operator: operator||null,
      sourceGroup: 'EAJE', sourceLabel: 'OSM+', agrément: null,
    };
  }).filter(Boolean);
}

// ═══════════════════════════════════════════
// SOURCE 2 — OpenStreetMap (amenity childcare…)
// ═══════════════════════════════════════════
async function fetchOSM(lat, lng, radiusM) {
  const query = `[out:json][timeout:25];
(
  nwr["amenity"="childcare"](around:${radiusM},${lat},${lng});
  nwr["amenity"="nursery"](around:${radiusM},${lat},${lng});
  nwr["amenity"="kindergarten"]["school:FR"!="maternelle"]["isced:level"!="1"](around:${radiusM},${lat},${lng});
);
out center tags;`;
  const d = await overpassFetch(query, radiusM);
  const ASSOC_OPS = ['association','parental','parentale','loi 1901','associatif'];
  return (d.elements||[]).map(e => {
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
      id: 'osm_' + e.id, osmId: e.id, osmType: e.type,
      name, address: addr, lat: +eLat, lng: +eLng, type,
      typeRaw: tags.amenity||null, gestion: null,
      places:  tags.capacity ? +tags.capacity : null,
      phone:   tags.phone||tags['contact:phone']||null,
      email:   tags.email||tags['contact:email']||null,
      hours:   tags.opening_hours||null,
      website: tags.website||tags['contact:website']||null,
      operator: operator||null,
      sourceGroup: 'OSM', sourceLabel: 'OpenStreetMap', agrément: null,
    };
  }).filter(Boolean);
}

// ═══════════════════════════════════════════
// REGISTRE DÉPARTEMENTAL
// Branche automatiquement la bonne source ODS
// selon le département détecté par le géocodage.
// ═══════════════════════════════════════════
const DEPT_SOURCES = [
  { depts: ['92'], fetch: fetchODS92, label: 'Données 92 (PMI)' },
  { depts: ['93'], fetch: fetchODS93, label: 'Données 93 (PMI)' },
];

function getLocalFetch(dept) {
  return DEPT_SOURCES.find(s => s.depts.includes(dept)) || null;
}


// ═══════════════════════════════════════════
// SEARCH PRINCIPAL
// ═══════════════════════════════════════════
async function runSearch() {
  const addr    = document.getElementById('addr').value.trim();
  const radiusM = +document.getElementById('radius').value;
  if (!addr) { toast('⚠️ Entrez une adresse'); return; }

  // ── Lecture cache ──────────────────────────
  const cached = cacheGet(addr, radiusM);
  if (cached) {
    allData  = cached.allData;
    currentGeo = cached.geo;
    const zoom = radiusM<=500?16 : radiusM<=1000?15 : radiusM<=2000?14 : 13;
    map.setView([currentGeo.lat, currentGeo.lng], zoom);
    updateUserLocation(currentGeo.lat, currentGeo.lng, currentGeo.label, radiusM);
    setAllDots('ok');
    ['eaje','osm','local'].forEach(k => {
      const c1 = document.getElementById('cnt-'+k);
      const e1 = document.getElementById('err-'+k);
      if (c1) c1.textContent = '(cache)';
      if (e1) e1.textContent = '';
    });
    render();
    toast(`⚡ Résultats instantanés (cache) — ${allData.length} établissements`);
    return;
  }

  const btn = document.getElementById('btnS');
  btn.disabled = true; btn.textContent = '…';
  document.getElementById('lspin').style.display = 'inline-block';
  setAllDots('loading');
  // Reset des compteurs sources
  ['eaje','osm','local'].forEach(k => {
    const cnt = document.getElementById('cnt-'+k);
    const err = document.getElementById('err-'+k);
    if (cnt) cnt.textContent = '…';
    if (err) err.textContent = '';
  });
  setProgress(5);
  document.getElementById('lcount').textContent = 'Géocodage…';
  document.getElementById('lbody').innerHTML = '';

  try {
    const geo = await geocode(addr);
    currentGeo = geo;
    setProgress(15);

    const zoom = radiusM<=500?16 : radiusM<=1000?15 : radiusM<=2000?14 : 13;
    map.setView([geo.lat, geo.lng], zoom);
    updateUserLocation(geo.lat, geo.lng, geo.label, radiusM);
    L.marker([geo.lat, geo.lng]).addTo(map).bindPopup(`<b>📍 Votre adresse</b><br>${geo.label}`);

    const localEntry = getLocalFetch(geo.dept);
    const hasODS = !!localEntry;

    // Mettre à jour le label du dot local selon la source disponible
    const dotLocalLabel = document.getElementById('lbl-local');
    if (dotLocalLabel) {
      dotLocalLabel.textContent = hasODS ? localEntry.label : 'Source locale';
    }

    document.getElementById('lcount').textContent = hasODS
      ? `Interrogation OSM+, OSM, ${localEntry.label}…`
      : 'Interrogation OSM+, OSM…';

    const [resEAJE, resOSM, resLOCAL] = await Promise.allSettled([
      fetchEAJE(geo.lat, geo.lng, radiusM),
      fetchOSM(geo.lat, geo.lng, radiusM),
      hasODS ? localEntry.fetch(geo.lat, geo.lng, radiusM) : Promise.resolve([]),
    ]);

    setProgress(75);

    const eajeData  = resEAJE.status  === 'fulfilled' ? resEAJE.value  : [];
    const osmData   = resOSM.status   === 'fulfilled' ? resOSM.value   : [];
    const localData = resLOCAL.status === 'fulfilled' ? resLOCAL.value : [];

    // Dots statut
    applyDotResult('eaje',  resEAJE,  eajeData.length);
    applyDotResult('osm',   resOSM,   osmData.length);
    if (hasODS) {
      applyDotResult('local', resLOCAL, localData.length);
    } else {
      const dl = document.getElementById('dot-local');
      const cl = document.getElementById('cnt-local');
      if (dl) dl.className   = 'sdot na';
      if (cl) cl.textContent = 'N/A';
    }

    // Message utilisateur si Overpass en échec
    const eajeOk = resEAJE.status === 'fulfilled';
    const osmOk  = resOSM.status  === 'fulfilled';
    if (!eajeOk && !osmOk && eajeData.length === 0 && osmData.length === 0 && localData.length === 0) {
      // Echec total — aucun résultat : message prominent dans lbody avec bouton réessayer
      document.getElementById('lbody').innerHTML = `
        <div class="empty" style="padding:2rem 1.2rem;">
          <div class="big">😕</div>
          <p style="font-weight:700;color:#c8663a;margin-bottom:.5rem;">Serveurs surchargés</p>
          <p style="margin-bottom:1.2rem;font-size:.82rem;line-height:1.6;">
            Les serveurs cartographiques publics sont momentanément indisponibles.<br>
            Cela arrive en journée — ce n'est pas lié à votre adresse.
          </p>
          <button onclick="document.getElementById('btnS').click()"
            style="background:#2d4a3e;color:white;border:none;border-radius:8px;
                   padding:.6rem 1.4rem;font-family:'DM Sans',sans-serif;
                   font-size:.85rem;font-weight:600;cursor:pointer;">
            🔄 Réessayer
          </button>
          <p style="margin-top:.8rem;font-size:.72rem;color:#aaa;">
            Astuce : réduire le rayon de recherche améliore les chances de succès.
          </p>
        </div>`;
      document.getElementById('lcount').textContent = '0 résultat';
      setProgress(0);
      return;
    } else if (!eajeOk || !osmOk) {
      toast('⚠️ Résultats partiels — un serveur était indisponible. Réessayez pour compléter.');
    }

    setProgress(85);

    // Fusion — localData passe en 3e position (rôle "PARIS" dans mergeAll)
    const merged = mergeAll(eajeData, osmData, localData, geo.lat, geo.lng, radiusM);
    console.log(`[PetitNid] EAJE:${eajeData.length} OSM:${osmData.length} Local:${localData.length} merged:${merged.length} dept:${geo.dept}`);
    if (resEAJE.status==='rejected')  console.warn('[PetitNid] EAJE:',  resEAJE.reason?.message);
    if (resOSM.status==='rejected')   console.warn('[PetitNid] OSM:',   resOSM.reason?.message);
    if (resLOCAL.status==='rejected') console.warn('[PetitNid] Local:', resLOCAL.reason?.message);

    allData = merged
      .map(r => ({...r, dist: hav(geo.lat, geo.lng, r.lat, r.lng)}))
      .filter(r => r.dist <= (radiusM/1000)*1.1 && isFinite(r.lat) && isFinite(r.lng))
      .sort((a,b) => a.dist - b.dist);

    setProgress(95);

    // Fallback places théoriques (seulement si pas de données réelles)
    allData.forEach(r => {
      if (r.places) return;
      const t   = r.type || '';
      const raw = (r.typeRaw  || '').toLowerCase();
      const ges = (r.gestion  || '').toLowerCase();
      const nom = (r.name     || '').toLowerCase();
      const all = raw + ' ' + ges + ' ' + nom;
      if (all.includes('micro') || (t === 'creche_priv' && r.sourceGroup === 'KNOWN')) {
        r.places = 10; r.placesLabel = '≤ 10'; r.placesEst = true; return;
      }
      if (t === 'creche_assoc' && (all.includes('parental') || all.includes('parentale'))) {
        r.places = 20; r.placesLabel = '≤ 20'; r.placesEst = true; return;
      }
      if (t === 'halte')        { r.places = 35; r.placesLabel = '~35'; r.placesEst = true; return; }
      if (t === 'creche_pub')   { r.places = 33; r.placesLabel = '~33'; r.placesEst = true; return; }
      if (t === 'creche_assoc') { r.places = 25; r.placesLabel = '~25'; r.placesEst = true; return; }
      if (t === 'creche_priv')  { r.places = 40; r.placesLabel = '~40'; r.placesEst = true; return; }
    });

    render();
    setProgress(100);
    // ── Écriture cache ──────────────────────
    cacheSet(addr, radiusM, { allData, geo });
    reverseGeocodeMissing(allData).then(() => {
      cacheSet(addr, radiusM, { allData, geo }); // mise à jour avec adresses complètes
      render();
    });

    if (eajeOk && osmOk) {
      const nK = allData.filter(r=>r.sourceGroup==='KNOWN').length;
      const nO = hasODS ? ` · ${localEntry.label.split(' ')[1]}:${localData.length}` : '';
      toast(allData.length
        ? `✅ ${allData.length} établissements — OSM+:${eajeData.length} · OSM:${osmData.length}${nO} · vérifiés:${nK}`
        : `⚠️ Aucun résultat dans ce périmètre.`);
    }

    if (allData.length) {
      const ll = allData.map(r=>[r.lat,r.lng]);
      ll.push([geo.lat,geo.lng]);
      map.fitBounds(L.latLngBounds(ll).pad(.12));
    }

  } catch(e) {
    toast('❌ ' + e.message);
    document.getElementById('lcount').textContent = 'Erreur';
    document.getElementById('lbody').innerHTML =
      `<div class="empty"><div class="big">⚠️</div><p>${e.message}</p></div>`;
  }

  btn.disabled = false; btn.textContent = 'Chercher';
  document.getElementById('lspin').style.display = 'none';
  setTimeout(() => setProgress(0), 1000);
}


// ── Modal RPE ────────────────────────────────────────────────
function ensureRPEModal() {
  if (document.getElementById('rpe-modal')) return;
  const el = document.createElement('div');
  el.id = 'rpe-modal';
  el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(30,20,10,.45);align-items:center;justify-content:center;padding:1rem';
  el.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.18);overflow:hidden;font-family:'DM Sans',sans-serif">
      <div style="background:#c8663a;padding:.8rem 1.1rem;display:flex;align-items:center;justify-content:space-between">
        <div style="color:white;font-weight:800;font-size:.9rem">👶 Relais Petite Enfance</div>
        <button onclick="document.getElementById('rpe-modal').style.display='none'"
          style="background:none;border:none;color:white;font-size:1.2rem;cursor:pointer;line-height:1;opacity:.85">✕</button>
      </div>
      <div style="padding:1rem 1.1rem;overflow-y:auto;max-height:70vh">
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.5rem">C'est quoi un RPE ?</div>
        <p style="font-size:.75rem;color:#555;line-height:1.55;margin:0 0 .7rem">
          Le <strong>Relais Petite Enfance</strong> est un service public gratuit géré par la Ville de Paris. 
          Il met en relation les familles avec les assistantes maternelles agréées du quartier.
        </p>
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.4rem">Pourquoi les contacter ?</div>
        <ul style="font-size:.75rem;color:#555;line-height:1.6;margin:0 0 .8rem;padding-left:1.1rem">
          <li>Obtenir la <strong>liste des AM disponibles</strong> dans votre secteur</li>
          <li>Être conseillé sur le <strong>contrat de travail</strong> et les aides CMG</li>
          <li>Participer à des <strong>temps collectifs</strong> avec votre enfant et son AM</li>
        </ul>
        <div style="font-size:.8rem;font-weight:700;color:#2d4a3e;margin-bottom:.4rem">Votre RPE de secteur</div>
        <div id="rpe-modal-details" style="font-size:.75rem;color:#444;line-height:1.7;background:#fff8f4;border-radius:8px;padding:.65rem .8rem;border-left:3px solid #c8663a"></div>
        <a href="https://monenfant.fr/que-recherchez-vous" target="_blank"
          style="display:block;margin-top:.85rem;background:#c8663a;color:white;font-weight:700;font-size:.78rem;text-align:center;padding:.55rem;border-radius:8px;text-decoration:none">
          Rechercher une assistante maternelle sur monenfant.fr →
        </a>
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
    <div style="font-size:.68rem;color:#777;margin:.1rem 0 .3rem;line-height:1.4">🏠 Accueil à domicile — adresses non publiées</div>
    <div style="border-top:1px solid #fde8dc;padding-top:.3rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
      <div style="font-size:.69rem;color:#555">
        <span style="font-weight:600">${rpe.name}</span>&nbsp;·&nbsp;${rpe.address.split(',')[0]}
        ${rpe.phone ? `&nbsp;·&nbsp;<a href="tel:${rpe.phone}" onclick="event.stopPropagation()" style="color:#c8663a;font-weight:600;text-decoration:none">${rpe.phone}</a>` : ''}
      </div>
      <a href="https://monenfant.fr/que-recherchez-vous" target="_blank" onclick="event.stopPropagation()"
        class="cbtn" style="background:#c8663a;border-color:#c8663a;font-size:.68rem;padding:.22rem .6rem;flex-shrink:0">
        Trouver une AM →
      </a>
    </div>
    <div style="font-size:.57rem;color:#ccc;margin-top:.25rem">* Capacité max réglementaire : 4 enfants &lt; 3 ans par AM agréée</div>
  </div>`;
}

let currentGeo = null;

// ── Modal détail card — mobile uniquement ────────────────────
function openCardModal(r) {
  // Supprimer une éventuelle modal précédente
  const existing = document.getElementById('card-modal-overlay');
  if (existing) existing.remove();

  // TC/TL/TB/SRC_* sont importés directement depuis 01_config.js
  const itinUrl  = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  const ring     = SRC_RING[r.sourceGroup] || '#888';
  const bg       = SRC_BG[r.sourceGroup]   || '#eee';
  const lbl      = SRC_LABEL[r.sourceGroup] || r.sourceGroup;
  const typeLabel= TL[r.type] || r.type || '';
  const typeBadge= TB[r.type] || '';
  const walk     = r.dist ? `${Math.round(r.dist * 1000 / 80)} min à pied` : '';

  const placesStr = r.places
    ? (r.placesEst ? `${r.placesLabel} places*` : `${r.places} places`)
    : 'places N/C';

  const overlay = document.createElement('div');
  overlay.id = 'card-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:7000;
    background:rgba(0,0,0,.45);
    display:flex;align-items:flex-end;justify-content:center;
    padding:0;
  `;

  overlay.innerHTML = `
    <div id="card-modal" style="
      background:white;border-radius:16px 16px 0 0;
      width:100%;max-height:80vh;overflow-y:auto;
      padding:1.1rem 1.2rem 2rem;
      box-shadow:0 -4px 32px rgba(0,0,0,.18);
      font-family:'DM Sans',sans-serif;
    ">
      <!-- Poignée -->
      <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto .9rem;"></div>

      <!-- Type + distance -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
        <span class="tbadge ${typeBadge}" style="font-size:.7rem;">${typeLabel}</span>
        ${walk ? `<span style="font-size:.72rem;color:#888;">🚶 ${walk}</span>` : ''}
      </div>

      <!-- Nom -->
      <div style="font-family:'Playfair Display',serif;font-size:1.05rem;color:#2d4a3e;font-weight:700;margin-bottom:.3rem;line-height:1.3;">
        ${r.name}
      </div>

      <!-- Adresse -->
      ${r.address ? `<div style="font-size:.78rem;color:#888;margin-bottom:.6rem;">📍 ${r.address}</div>` : ''}

      <!-- Méta -->
      <div style="display:flex;flex-direction:column;gap:.3rem;margin-bottom:.8rem;">
        ${r.phone   ? `<span style="font-size:.8rem;color:#444;">📞 <a href="tel:${r.phone}" style="color:#2d4a3e;font-weight:600;text-decoration:none;">${r.phone}</a></span>` : ''}
        ${r.email   ? `<span style="font-size:.8rem;color:#444;">✉️ <a href="mailto:${r.email}" style="color:#2d4a3e;text-decoration:none;">${r.email}</a></span>` : ''}
        <span style="font-size:.8rem;color:#444;">👶 ${placesStr}</span>
        ${r.hours   ? `<span style="font-size:.8rem;color:#444;">⏰ ${r.hours}</span>` : ''}
        ${r.website ? `<span style="font-size:.8rem;"><a href="${r.website}" target="_blank" style="color:#2d4a3e;font-weight:600;">🌐 Site web</a></span>` : ''}
      </div>

      <!-- Badge source -->
      <div style="margin-bottom:1rem;">
        <span style="font-size:.65rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;background:${bg};color:${ring};">${lbl}</span>
      </div>

      <!-- Boutons action -->
      <div style="display:flex;flex-direction:column;gap:.55rem;">
        <button onclick="showOnMap('${r.id}', ${r.lat}, ${r.lng})" style="
          background:#2d4a3e;color:white;border:none;border-radius:9px;
          padding:.7rem 1rem;font-family:'DM Sans',sans-serif;
          font-size:.85rem;font-weight:600;cursor:pointer;text-align:center;
        ">🗺 Voir sur la carte</button>
        <a href="${itinUrl}" target="_blank" style="
          display:block;text-align:center;background:#f5f8f5;color:#2d4a3e;
          border:1.5px solid #c8d8c8;border-radius:9px;
          padding:.65rem 1rem;font-size:.85rem;font-weight:600;text-decoration:none;
        ">→ Itinéraire Google Maps</a>
      </div>
    </div>
  `;

  // Fermer au clic sur le fond
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeCardModal();
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function closeCardModal() {
  const el = document.getElementById('card-modal-overlay');
  if (el) el.remove();
  document.body.style.overflow = '';
}

function showOnMap(id, lat, lng) {
  closeCardModal();
  const mapContainer = document.getElementById('map-container');
  const listWrap     = document.querySelector('.listwrap');
  const toggleBtn    = document.getElementById('mapToggle');
  mapContainer.classList.add('visible');
  listWrap.classList.add('hidden');
  if (toggleBtn) toggleBtn.textContent = '📋 Voir la liste';
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    map.setView([lat, lng], 17);
    openMarkerById(id);
  }, 80);
}

function render() {
  const d = filtered(allData, activeT);
  document.getElementById('lcount').innerHTML = allData.length
    ? `<strong>${d.length}</strong> / ${allData.length}` : 'Lancez une recherche…';
  const body = document.getElementById('lbody');
  if (!allData.length) return;
  if (!d.length) {
    body.innerHTML = `<div class="empty"><div class="big">🔎</div><p>Aucun résultat avec ces filtres.</p></div>`;
    clearMarkers(); return;
  }
  let amHtml = '';
  if (currentGeo && currentGeo.dept === '75') {
    const radiusM = +document.getElementById('radius').value;
    const rpe = getRPE(currentGeo.lat, currentGeo.lng);
    window._currentRPE = rpe;
    amHtml = amCardHTML(rpe, currentGeo.lat, currentGeo.lng, radiusM);
    renderRPEMarker(rpe, radiusM);
  }
  const nounouHtml = allData.length ? nounouCardHTML() : '';
  body.innerHTML = amHtml + nounouHtml + d.map(cardHTML).join('');
  body.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => {
    body.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    const r = allData.find(x => x.id === c.dataset.id);
    if (!r) return;

    if (window.innerWidth <= 768) {
      // Mobile : ouvrir une modal par-dessus la liste
      openCardModal(r);
    } else {
      // Desktop : comportement existant — centrer carte + popup Leaflet
      map.setView([r.lat, r.lng], 17);
      openMarkerById(r.id);
    }
  }));
  renderMarkers(d);
}


// ═══════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════
function setProgress(p) { document.getElementById('prog').style.width = p+'%'; }
function setAllDots(state) {
  ['eaje','osm','local'].forEach(k => {
    const el = document.getElementById('dot-'+k);
    if (el) el.className = 'sdot ' + state;
  });
}
function applyDotResult(key, result, count) {
  const ok  = result.status === 'fulfilled';
  const dot = document.getElementById('dot-'+key);
  const cnt = document.getElementById('cnt-'+key);
  const err = document.getElementById('err-'+key);
  if (dot) dot.className   = 'sdot ' + (ok ? 'ok' : 'err');
  if (cnt) cnt.textContent = ok ? count + ' résultats' : '0';
  if (err) err.textContent = ok ? '' : (result.reason?.message||'Erreur').slice(0,50);
}
let tT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(tT); tT = setTimeout(() => el.classList.remove('show'), 5000);
}

window.openNounouModal  = openNounouModal;
window.closeNounouModal = closeNounouModal;
window.openRPEModal     = openRPEModal;
window.showOnMap        = showOnMap;
window.closeCardModal   = closeCardModal;