// ═══════════════════════════════════════════
// 10_ods.js — Sources ODS départementales
// Hauts-de-Seine (92) + Seine-Saint-Denis (93)
// Plateforme : data.iledefrance.fr (OpenDataSoft)
// Pas de 504 — serveurs stables, données PMI officielles
// v1.0
// ═══════════════════════════════════════════

import { inferType } from "./06_business_rules.js";

// ─────────────────────────────────────────────
// BASE URL commune aux deux datasets
// ─────────────────────────────────────────────
const ODS_BASE = 'https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets';

// ─────────────────────────────────────────────
// MAPPING TYPE — champ "type" (92) / "type_daccueil" (93)
// vers les valeurs internes PetitNid
// ─────────────────────────────────────────────
function mapType(typeRaw, gestion) {
  const t = (typeRaw  || '').toLowerCase();
  const g = (gestion  || '').toLowerCase();

  if (t.includes('micro'))                                   return 'creche_priv';
  if (t.includes('halte') || t.includes('multi'))           return 'halte';
  if (t.includes('jardin'))                                  return 'halte';
  if (t.includes('parental') || t.includes('parentale'))    return 'creche_assoc';
  if (t.includes('familial') || t.includes('familiale'))    return 'am';

  // Déduire depuis la gestion
  if (g.includes('association') || g.includes('associatif')) return 'creche_assoc';
  if (g.includes('entreprise') || g.includes('privé')
    || g.includes('prive') || g.includes('société'))         return 'creche_priv';
  if (g.includes('commune') || g.includes('communal')
    || g.includes('municipal') || g.includes('public')
    || g.includes('ccas') || g.includes('département'))      return 'creche_pub';

  // Fallback via inferType existant
  return inferType(gestion, typeRaw, '', '');
}

// ─────────────────────────────────────────────
// fetchODS92() — Hauts-de-Seine
// Dataset : hauts-de-seine-etablissements-accueil-petite-enfance
// Champs  : nom, type, adresse, cp, commune, tel,
//           gestion, gestionnaire, capacite, geo_point_2d
// ─────────────────────────────────────────────
export async function fetchODS92(lat, lng, radiusM) {
  const dataset = 'hauts-de-seine-etablissements-accueil-petite-enfance';
  const url = new URL(`${ODS_BASE}/${dataset}/records`);

  url.searchParams.set('limit', '100');
  url.searchParams.set('select', [
    'nom', 'type', 'adresse', 'cp', 'commune',
    'tel', 'gestion', 'gestionnaire', 'capacite', 'geo_point_2d'
  ].join(','));
  // Filtre géographique ODS natif — aucun timeout Overpass
  url.searchParams.set('where',
    `distance(geo_point_2d, geom'POINT(${lng} ${lat})', ${radiusM}m)`
  );

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error('ODS-92 HTTP ' + res.status);
    const d = await res.json();

    return (d.results || []).map((r, i) => {
      const eLat = r.geo_point_2d?.lat;
      const eLng = r.geo_point_2d?.lon;
      if (!eLat || !eLng) return null;

      const typeRaw = r.type || '';
      const gestion = r.gestion || r.gestionnaire || '';
      const adresse = [r.adresse, r.cp, r.commune]
        .filter(Boolean).join(' ').trim() || null;

      return {
        id:          'ods92_' + i,
        name:        r.nom || 'Établissement',
        address:     adresse,
        lat:         +eLat,
        lng:         +eLng,
        type:        mapType(typeRaw, gestion),
        typeRaw:     typeRaw || null,
        gestion:     gestion || null,
        places:      r.capacite ? Math.round(r.capacite) : null,
        phone:       r.tel || null,
        email:       null,
        hours:       null,
        website:     null,
        operator:    r.gestionnaire || null,
        sourceGroup: 'ODS',
        sourceLabel: 'Données 92 (PMI)',
        agrément:    true,
      };
    }).filter(Boolean);

  } catch (e) {
    clearTimeout(tid);
    throw e.name === 'AbortError'
      ? new Error('ODS-92 timeout — réessayez.')
      : e;
  }
}

// ─────────────────────────────────────────────
// fetchODS93() — Seine-Saint-Denis
// Dataset : eaje_cd93_l93
// Champs  : nom, type_daccueil, adresse, ville, code_insee,
//           gestionnaire, statut, nbr_place, geo_point_2d
// ─────────────────────────────────────────────
export async function fetchODS93(lat, lng, radiusM) {
  const dataset = 'eaje_cd93_l93';
  const url = new URL(`${ODS_BASE}/${dataset}/records`);

  url.searchParams.set('limit', '100');
  url.searchParams.set('select', [
    'nom', 'type_daccueil', 'adresse', 'ville', 'code_insee',
    'gestionnaire', 'statut', 'nbr_place', 'geo_point_2d'
  ].join(','));
  url.searchParams.set('where',
    `distance(geo_point_2d, geom'POINT(${lng} ${lat})', ${radiusM}m)`
  );

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error('ODS-93 HTTP ' + res.status);
    const d = await res.json();

    return (d.results || []).map((r, i) => {
      const eLat = r.geo_point_2d?.lat;
      const eLng = r.geo_point_2d?.lon;
      if (!eLat || !eLng) return null;

      const typeRaw = r.type_daccueil || '';
      const gestion = r.statut || r.gestionnaire || '';
      const adresse = [r.adresse, r.ville]
        .filter(Boolean).join(' ').trim() || null;

      return {
        id:          'ods93_' + i,
        name:        r.nom || 'Établissement',
        address:     adresse,
        lat:         +eLat,
        lng:         +eLng,
        type:        mapType(typeRaw, gestion),
        typeRaw:     typeRaw || null,
        gestion:     gestion || null,
        places:      r.nbr_place ? Math.round(r.nbr_place) : null,
        phone:       null,
        email:       null,
        hours:       null,
        website:     null,
        operator:    r.gestionnaire || null,
        sourceGroup: 'ODS',
        sourceLabel: 'Données 93 (PMI)',
        agrément:    true,
      };
    }).filter(Boolean);

  } catch (e) {
    clearTimeout(tid);
    throw e.name === 'AbortError'
      ? new Error('ODS-93 timeout — réessayez.')
      : e;
  }
}