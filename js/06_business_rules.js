import { PRIV_OPERATORS } from "./01_config.js";

// Réseaux privés lucratifs connus — nom complet ou fragment distinctif

export function inferType(gestion, typeAccueil, name, operator) {
  const g = (gestion    || '').toLowerCase();
  const t = (typeAccueil|| '').toLowerCase();
  const n = (name       || '').toLowerCase();
  const o = (operator   || '').toLowerCase();
  const all = g + ' ' + t + ' ' + n + ' ' + o;

  // ── Type d'accueil prioritaire (sans ambiguïté) ──────────────
  if (t.includes('halte-garderie') || t.includes('halte garderie') ||
      t.includes('multi-accueil')  || t.includes('multi accueil')  ||
      n.includes('halte') || n.includes('multi-accueil')) return 'halte';

  if (t.includes('jardin d\'enfant') || n.includes('jardin d\'enfant')) return 'halte';

  if (t.includes('mam') || t.includes('maison d\'assistant') ||
      n.includes(' mam ') || n.startsWith('mam ')) return 'am';

  // ── Privé lucratif ────────────────────────────────────────────
  // 1. Statut juridique EAJE explicitement commercial
  const isPrivStatut =
    g.includes('entreprise') || g.includes('société') || g.includes('societe') ||
    g.includes('sarl') || g.includes('sas') || / sa[, )$]/.test(g) ||
    g.includes('personne physique') ||
    g.includes('autre organisme priv') ||
    g.includes('organisme privé') ||
    g.includes('établissement privé') || g.includes('etablissement prive') ||
    g.includes('clinique') || g.includes('cabinet');

  // 2. Opérateur OSM connu comme réseau commercial
  const isPrivOp = PRIV_OPERATORS.some(op => o.includes(op) || n.includes(op));

  // 3. Type d'accueil crèche d'entreprise
  const isPrivType =
    t.includes('crèche d\'entreprise') || t.includes('creche d\'entreprise') ||
    t.includes('crèche interentreprises') || t.includes('micro-crèche') ||
    (t.includes('micro') && (isPrivStatut || isPrivOp));

  if (isPrivStatut || isPrivOp || isPrivType) return 'creche_priv';

  // ── Associatif / parental ─────────────────────────────────────
  const isAssoc =
    g.includes('association') || g.includes('fondation') ||
    g.includes('mutuelle') || g.includes('mutualiste') ||
    g.includes('parental') || g.includes('parentale') ||
    t.includes('parental') || t.includes('parentale') ||
    t.includes('associat') ||
    n.includes('parental') || n.includes('associat') || n.includes('loi 1901') ||
    o.includes('associat') || o.includes('parental');

  if (isAssoc) return 'creche_assoc';

  // ── Public / municipal ────────────────────────────────────────
  const isPub =
    g.includes('commune') || g.includes('communal') || g.includes('municipal') ||
    g.includes('ccas') || g.includes('centre communal') ||
    g.includes('caf') || g.includes('caisse d\'allocation') ||
    g.includes('département') || g.includes('departement') ||
    g.includes('état') || g.includes('etat') ||
    g.includes('établissement public') || g.includes('etablissement public') ||
    g.includes('public') ||
    n.includes('municipal') || n.includes('ville de');

  if (isPub) return 'creche_pub';

  // ── Fallback : si aucun signal → public par défaut ───────────
  return 'creche_pub';
}

// ═══════════════════════════════════════════
// GÉNÉRATION DU LIEN "VÉRIFIER LES PLACES"
// Logique par opérateur/réseau connu, puis par type
// ═══════════════════════════════════════════
export function getBookingInfo(r) {
  // 1. Si l'établissement a une URL directe (KNOWN ou enrichi manuellement)
  if (r.bookingUrl) return { url: r.bookingUrl, label: r.bookingLabel || 'Vérifier les places' };

  const op  = (r.operator || '').toLowerCase();
  const name = (r.name || '').toLowerCase();
  const combined = op + ' ' + name;

  // 2. Réseaux privés avec URL de recherche connue
  if (combined.includes('chaperons') || combined.includes('lpcr') || combined.includes('grandir'))
    return { url: 'https://www.lpcr.fr/fr/trouver-une-creche/', label: 'Préinscription LPCR' };
  if (combined.includes('babilou'))
    return { url: 'https://www.babilou.fr/trouver-une-creche', label: 'Trouver sur Babilou' };
  if (combined.includes('explorateur'))
    return { url: 'https://www.lesbebesexplorateurs.com/reserver', label: 'Réserver une place' };
  if (combined.includes('maison bleue') || combined.includes('lamaisonbleue'))
    return { url: 'https://www.lamaisonbleue.org/trouver-une-creche', label: 'La Maison Bleue' };
  if (combined.includes('people') && combined.includes('baby'))
    return { url: 'https://www.people-and-baby.com/trouver-une-creche/', label: 'People & Baby' };
  if (combined.includes('rigolo comme la vie'))
    return { url: 'https://www.rigolo-comme-la-vie.fr/', label: 'Rigolo comme la vie' };

  // 3. Réseau privé non identifié → site propre ou monenfant
  if (r.type === 'creche_priv')
    return r.website
      ? { url: r.website, label: 'Site de la crèche' }
      : { url: `https://www.monenfant.fr/web/guest/recherche-de-modes-de-garde?commune=${encodeURIComponent(r.address||'Paris')}&modeGardeCode=EAJE`, label: 'Voir sur monenfant.fr' };

  // 4. Associatif → site propre ou email
  if (r.type === 'creche_assoc') {
    if (r.website) return { url: r.website, label: 'Site de la crèche' };
    if (r.email)   return { url: `mailto:${r.email}`, label: 'Contacter par email' };
    if (r.phone)   return { url: `tel:${r.phone}`, label: 'Appeler la crèche' };
  }

  // 5. Municipal / public → monenfant.fr géolocalisé (meilleur parcours parent)
  return {
    url: `https://monenfant.fr/web/guest/recherche-de-modes-de-garde?commune=75056&modeGardeCode=EAJE&latitudeCentre=${r.lat}&longitudeCentre=${r.lng}`,
    label: 'Voir sur monenfant.fr'
  };
}