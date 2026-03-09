// ═══════════════════════════════════════════
// HAVERSINE (retourne km)
// ═══════════════════════════════════════════
export function hav(la1,lo1,la2,lo2) {
  const R=6371, dL=(la2-la1)*Math.PI/180, dG=(lo2-lo1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Minutes à pied (vitesse piétonne ~4,5 km/h)
export function walkMin(km) {
  const min = Math.round(km / 4.5 * 60);
  return min < 1 ? '1 min à pied' : `${min} min à pied`;
}

// ═══════════════════════════════════════════
// ROT13 — paris.fr encode les emails en rot13
// pour contrer le scraping. On décode proprement.
// ═══════════════════════════════════════════
export function decodeRot13(str) {
  if (!str) return null;
  return str.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}
export function cleanEmail(email) {
  if (!email) return null;
  // Détecter si l'email est en rot13 : après décodage, doit contenir @ et un TLD valide
  const decoded = decodeRot13(email);
  const looksValid = e => e && e.includes('@') && /\.[a-z]{2,}$/.test(e);
  if (!looksValid(email) && looksValid(decoded)) return decoded;
  return looksValid(email) ? email : null;
}
// Garantit qu'on a toujours une adresse lisible
// quelle que soit la source.
// ═══════════════════════════════════════════
export function buildAddress(parts) {
  // parts = tableau de valeurs possibles, on prend la première non-vide
  const clean = parts
    .map(p => (p||'').toString().trim())
    .filter(p => p && p !== 'undefined' && p !== 'null');
  return clean.join(', ') || null;
}

export function sanitizeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}