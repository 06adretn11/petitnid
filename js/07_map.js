import { TC, TL, SRC_RING, SRC_BG, SRC_LABEL } from "./01_config.js";
import { walkMin } from "./02_utils.js";
import { getBookingInfo } from "./06_business_rules.js";


// ═══════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════
export const map = L.map('map').setView([48.8566, 2.3522], 13);

L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap © CartoDB', maxZoom: 19 }
).addTo(map);

let mapM = [];
let uMark = null;
let uCirc = null;

export function setUserMarker(marker) {
  uMark = marker;
}

export function setUserCircle(circle) {
  uCirc = circle;
}

export function getUserMarker() {
  return uMark;
}

export function getUserCircle() {
  return uCirc;
}

export function openMarkerById(id) {
  const marker = mapM.find(m => m._petitNidId === id);
  if (marker) {
    marker.openPopup();
  }
}

export function renderRPEMarker(rpe, radiusM) {
  if (!rpe) return;

  // Évite doublon
  if (mapM.find(m => m._isRPE)) return;

  const circleKm2 = Math.PI * (radiusM / 1000) ** 2;
  const fraction  = Math.min(1, circleKm2 / rpe.surface_km2);
  const amZone    = Math.max(1, Math.round(rpe.am_count * fraction));

  const rpeIco = L.divIcon({
    html:`<div style="width:17px;height:17px;border-radius:50%;background:#c8663a;border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:9px">👶</div>`,
    className:'', iconAnchor:[8.5,8.5],
  });

  const rpeMark = L.marker([rpe.lat, rpe.lng], {icon:rpeIco})
    .addTo(map)
    .bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:200px">
        <div style="font-size:.6rem;font-weight:800;color:#c8663a;text-transform:uppercase;margin-bottom:.15rem">Relais Petite Enfance</div>
        <div style="font-weight:700;color:#2d4a3e;margin-bottom:.12rem">${rpe.name}</div>
        <div style="font-size:.7rem;color:#555;margin-bottom:.08rem">📍 ${rpe.address}</div>
        <div style="font-size:.67rem;color:#888;margin:.2rem 0 .3rem">~${amZone} AM · ~${amZone*4} places dans ce rayon</div>
      </div>
    `, {maxWidth:260});

  rpeMark._isRPE = true;
  mapM.push(rpeMark);
}

// Gestion du marqueur utilisateur
export function updateUserLocation(lat, lng, label, radiusM) {
  if (uMark) {
    map.removeLayer(uMark);
  }

  if (uCirc) {
    map.removeLayer(uCirc);
  }

  uCirc = L.circle([lat, lng], {
    radius: radiusM,
    color: '#2d4a3e',
    fillColor: '#2d4a3e',
    fillOpacity: 0.04,
    weight: 1.5,
    dashArray: '6 4',
  }).addTo(map);

  uMark = L.marker([lat, lng], {
    icon: L.divIcon({
      html: `<div style="width:16px;height:16px;background:#2d4a3e;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>`,
      className: '',
      iconAnchor: [8, 8],
    }),
  }).addTo(map).bindPopup(`<b>📍 Votre adresse</b><br>${label}`);
}

export function clearMarkers() { mapM.forEach(m=>map.removeLayer(m)); mapM=[]; }

export function renderMarkers(data) {
  clearMarkers();
  data.forEach(r => {
    const col  = TC[r.type] || '#888';
    const ring = SRC_RING[r.sourceGroup] || SRC_RING.OSM;
    const walk = walkMin(r.dist);
    const osmUrl = r.osmId ? `https://www.openstreetmap.org/${r.osmType||'node'}/${r.osmId}` : '';
    const booking = getBookingInfo(r);
    const microNote = r.places <= 10 && (r.typeRaw||'').toLowerCase().includes('micro')
      ? ' <span style="color:#aaa;font-size:.6rem">(micro-crèche)</span>' : '';
    const ico = L.divIcon({
      html:`<div style="width:15px;height:15px;border-radius:50%;background:${col};border:2.5px solid ${ring};box-shadow:0 1px 5px rgba(0,0,0,.25)"></div>`,
      className:'', iconAnchor:[7.5,7.5],
    });
    const m = L.marker([r.lat,r.lng],{icon:ico}).addTo(map).bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:240px;line-height:1.5">
        <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;color:${col};margin-bottom:.18rem">${TL[r.type]}</div>
        <div style="font-family:'Playfair Display',serif;font-size:.95rem;font-weight:700;color:#2d4a3e;margin-bottom:.25rem;line-height:1.3">${r.name}</div>
        ${r.address ? `<div style="font-size:.72rem;color:#555;margin-bottom:.1rem">📍 ${r.address}</div>` : ''}
        <div style="font-size:.72rem;color:#888;margin-bottom:.3rem">🚶 ${walk}</div>
        ${r.phone  ? `<div style="font-size:.72rem;margin-bottom:.06rem">📞 <a href="tel:${r.phone}" style="color:#2d4a3e">${r.phone}</a></div>` : ''}
        ${r.email  ? `<div style="font-size:.72rem;margin-bottom:.06rem">✉️ <a href="mailto:${r.email}" style="color:#2d4a3e">${r.email}</a></div>` : ''}
        <div style="font-size:.72rem;color:#555;margin-bottom:.06rem">👶 ${
          r.places
            ? r.placesEst
              ? `<span title="Estimation réglementaire">${r.placesLabel} places <span style="color:#aaa;font-size:.6rem">*estimé</span></span>`
              : `${r.places} places`
            : '<span style="color:#bbb">N/C</span>'
        }</div>
        ${r.hours  ? `<div style="font-size:.72rem;color:#666;margin-bottom:.06rem">⏰ ${r.hours}</div>` : ''}
        ${r.website? `<div style="font-size:.72rem;margin-bottom:.06rem"><a href="${r.website}" target="_blank" style="color:#2d4a3e">🌐 Site web</a></div>` : ''}
        <div style="display:flex;gap:.35rem;margin-top:.45rem;flex-wrap:wrap;align-items:center">
          <a href="${booking.url}" target="_blank"
             style="background:#2d4a3e;color:white;font-size:.68rem;font-weight:700;padding:.22rem .6rem;border-radius:5px;text-decoration:none;white-space:nowrap">
            🔍 ${booking.label}
          </a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}" target="_blank"
             style="font-size:.68rem;color:#2d4a3e;font-weight:600;text-decoration:none">→ Itinéraire</a>
          <span style="background:${SRC_BG[r.sourceGroup]};color:${ring};font-size:.6rem;font-weight:700;padding:.1rem .4rem;border-radius:3px">${SRC_LABEL[r.sourceGroup]||r.sourceGroup}</span>
          ${osmUrl ? `<a href="${osmUrl}" target="_blank" style="font-size:.6rem;color:#ccc">OSM</a>` : ''}
        </div>
      </div>
    `, {maxWidth:300});
    m._petitNidId = r.id;
    mapM.push(m);
  });
}
