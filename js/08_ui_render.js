// ═══════════════════════════════════════════
// 08_ui_render.js — Rendu des cartes UI
// Extrait de main.js — v1.2
// ═══════════════════════════════════════════

import {
  TC, TL, TB,
  SRC_RING, SRC_BG, SRC_LABEL
} from "./01_config.js";

import { walkMin } from "./02_utils.js";
import { getBookingInfo } from "./06_business_rules.js";

// ─────────────────────────────────────────────
// filtered() — retourne les données filtrées
// selon les chips actives + les sélecteurs
// Paramètres :
//   allData  : tableau global de tous les résultats
//   activeT  : Set des types actuellement actifs (chips)
// ─────────────────────────────────────────────
export function filtered(allData, activeT) {
  const sort   = document.getElementById('fSort').value;
  const srcFlt = document.getElementById('fSource').value;

  // 1. Filtrer par type (chips)
  let d = allData.filter(r => activeT.has(r.type));

  // 2. Filtrer par source
  if (srcFlt === 'EAJE')  d = d.filter(r => r.sourceGroup === 'EAJE'  || r.sourceGroup === 'BOTH');
  if (srcFlt === 'OSM')   d = d.filter(r => r.sourceGroup === 'OSM'   || r.sourceGroup === 'BOTH');
  if (srcFlt === 'PARIS') d = d.filter(r => r.sourceGroup === 'PARIS' || r.sourceGroup === 'BOTH');

  // 3. Trier
  if (sort === 'name')   d = [...d].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (sort === 'source') d = [...d].sort((a, b) => a.sourceGroup.localeCompare(b.sourceGroup));

  return d;
}

// ─────────────────────────────────────────────
// cardHTML() — génère le HTML d'une carte
// Paramètre :
//   r : un objet établissement (issu de allData)
// ─────────────────────────────────────────────
export function cardHTML(r) {
  const walk    = walkMin(r.dist);
  const ring    = SRC_RING[r.sourceGroup]  || SRC_RING.OSM;
  const bg      = SRC_BG[r.sourceGroup]   || SRC_BG.OSM;
  const lbl     = SRC_LABEL[r.sourceGroup] || r.sourceGroup;
  const itinUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  const booking = getBookingInfo(r);

  const placesStr = r.places
    ? r.placesEst
      ? `<span title="Estimation réglementaire — donnée exacte non disponible" style="cursor:help">${r.placesLabel} places*</span>`
      : `${r.places} places`
    : '<span style="color:#bbb">places N/C</span>';

  const microNote = !r.placesEst && r.places <= 10 && (r.typeRaw || '').toLowerCase().includes('micro')
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