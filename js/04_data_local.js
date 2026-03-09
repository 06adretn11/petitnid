// ═══════════════════════════════════════════
// ÉTABLISSEMENTS CONNUS
// Source de vérité locale pour les établissements
// absents ou mal géolocalisés dans les bases publiques.
// Ces entrées sont INJECTÉES en début de pipeline ;
// si une API les retourne aussi, le dedup à 80m les fusionne.
// → Ajouter ici au fil des remontées utilisateurs.
// ═══════════════════════════════════════════
export const KNOWN_ESTABLISHMENTS = [
  {
    id: 'known_0',
    name: 'Crèche Grenadine et Menthe à l\'eau',
    address: '9 rue du Docteur Potain, 75019 Paris',
    lat: 48.8756045, lng: 2.3995549,
    type: 'creche_assoc',
    typeRaw: 'Crèche parentale associative',
    gestion: 'Associatif',
    places: 21,          // source : creche-grenadine.org (oct. 2016)
    phone: '01 40 16 55 85',
    email: 'resp-technique@creche-grenadine.org',
    website: 'https://www.creche-grenadine.org',
    hours: 'Lun–Ven 8h45–18h45',
    operator: null,
    bookingUrl: 'https://www.creche-grenadine.org/inscription',
    bookingLabel: 'Demande d\'inscription',
    sourceGroup: 'KNOWN', sourceLabel: 'Données vérifiées', agrément: true, _known: true,
  },
  {
    id: 'known_1',
    name: 'Les Petits Chaperons Rouges – Planchat',
    address: '28 rue Planchat, 75020 Paris',
    lat: 48.8617, lng: 2.3983,
    type: 'creche_priv',
    typeRaw: 'Micro-crèche privée',
    gestion: 'Entreprise (Groupe Grandir)',
    places: 10,           // micro-crèche → max 10 places réglementaires
    phone: null,
    email: null,
    website: 'https://www.lpcr.fr/fr/creches/paris/565',
    hours: 'Lun–Ven 8h30–19h00',
    operator: 'Les Petits Chaperons Rouges',
    bookingUrl: 'https://www.lpcr.fr/fr/creches/paris/565',
    bookingLabel: 'Préinscription LPCR',
    sourceGroup: 'KNOWN', sourceLabel: 'Données vérifiées', agrément: true, _known: true,
  },
  {
    id: 'known_2',
    name: 'Les Explorateurs de Ménilmontant – Bébés Explorateurs',
    address: '147 rue Oberkampf, 75011 Paris',
    lat: 48.8651, lng: 2.3821,
    type: 'creche_priv',
    typeRaw: 'Micro-crèche privée',
    gestion: 'Entreprise (Les Bébés Explorateurs)',
    places: 10,           // micro-crèche → max 10 places
    phone: '06 41 82 40 17',
    email: null,
    website: 'https://www.lesbebesexplorateurs.com/creche-paris-75011-menilmontant',
    hours: 'Lun–Ven 8h30–19h00',
    operator: 'Les Bébés Explorateurs',
    bookingUrl: 'https://www.lesbebesexplorateurs.com/reserver',
    bookingLabel: 'Réserver une place',
    sourceGroup: 'KNOWN', sourceLabel: 'Données vérifiées', agrément: true, _known: true,
  },
];

export const RPE_PARIS = [
  { arr:[1,2,3,4,10], name:'RPE Paris Centre & 10e', address:'50A rue du Faubourg Saint-Denis, 75010 Paris', lat:48.8702, lng:2.3571, phone:'01 53 24 31 00', email:null, am_count:210, surface_km2:8.45 },
  { arr:[11], name:'RPE du 11e', address:'25 rue Godefroy Cavaignac, 75011 Paris', lat:48.8545, lng:2.3793, phone:'01 84 82 16 79', email:null, am_count:195, surface_km2:3.67 },
  { arr:[12], name:'RPE du 12e', address:'31 rue de Rambouillet, 75012 Paris', lat:48.8448, lng:2.3793, phone:'01 55 78 86 47', email:null, am_count:165, surface_km2:16.32 },
  { arr:[13], name:'RPE du 13e', address:'239 rue de Tolbiac, 75013 Paris', lat:48.8255, lng:2.3521, phone:'01 71 28 72 28', email:null, am_count:175, surface_km2:7.15 },
  { arr:[14], name:'RPE du 14e', address:'3 avenue de la Porte de Vanves, 75014 Paris', lat:48.8274, lng:2.3164, phone:'06 48 05 95 94', email:null, am_count:130, surface_km2:5.62 },
  { arr:[5,6,7,15,16], name:'RPE du 15e', address:'91 rue Blomet, 75015 Paris', lat:48.8418, lng:2.3044, phone:'01 71 28 29 57', email:null, am_count:145, surface_km2:25.10 },
  { arr:[8,17], name:'RPE du 17e', address:'88 rue de la Jonquière, 75017 Paris', lat:48.8938, lng:2.3274, phone:'01 53 31 31 20', email:null, am_count:160, surface_km2:13.71 },
  { arr:[9], name:'RPE du 9e', address:'6 rue Drouot, 75009 Paris', lat:48.8748, lng:2.3456, phone:'06 47 10 97 10', email:null, am_count:85, surface_km2:2.18 },
  { arr:[18], name:'RPE du 18e', address:'2 rue Duc, 75018 Paris', lat:48.8903, lng:2.3546, phone:'01 84 82 36 22', email:null, am_count:185, surface_km2:6.01 },
  { arr:[19], name:'RPE du 19e', address:'10 rue de Thionville, 75019 Paris', lat:48.8847, lng:2.3813, phone:'06 08 96 13 27', email:null, am_count:200, surface_km2:6.79 },
  { arr:[20], name:'RPE du 20e', address:'62 rue du Surmelin, 75020 Paris', lat:48.8683, lng:2.4023, phone:'01 71 28 33 25', email:null, am_count:195, surface_km2:5.98 },
];

export function parisArr(lat, lng) {
  if (lat > 48.884) {
    if (lng < 2.33) return 17;
    if (lng < 2.36) return 18;
    return 19;
  }
  if (lat > 48.870) {
    if (lng < 2.32) return 17;
    if (lng < 2.345) return 9;
    if (lng < 2.365) return 10;
    if (lng < 2.39)  return 19;
    return 20;
  }
  if (lat > 48.860) {
    if (lng < 2.315) return 8;
    if (lng < 2.335) return 2;
    if (lng < 2.352) return 3;
    if (lng < 2.365) return 11;
    if (lng < 2.385) return 11;
    return 20;
  }
  if (lat > 48.848) {
    if (lng < 2.32)  return 15;
    if (lng < 2.338) return 7;
    if (lng < 2.348) return 6;
    if (lng < 2.358) return 4;
    if (lng < 2.37)  return 3;
    if (lng < 2.385) return 12;
    return 12;
  }
  if (lat > 48.835) {
    if (lng < 2.32)  return 15;
    if (lng < 2.338) return 14;
    if (lng < 2.355) return 5;
    if (lng < 2.365) return 13;
    return 12;
  }
  if (lng < 2.33) return 15;
  return 13;
}


// ═══════════════════════════════════════════
// DONNÉES RPE PARIS — Source : Ville de Paris / CAF Paris, sept. 2024
// 26 RPE (24 fixes + 2 itinérants), 2132 AM agréées à Paris
// Capacité réglementaire : 4 enfants < 3 ans max par AM → ~8 528 places théoriques
// ═══════════════════════════════════════════


// Récupérer le RPE correspondant
export function getRPE(lat, lng) {
  const arr = parisArr(lat, lng);
  return RPE_PARIS.find(r => r.arr.includes(arr)) || RPE_PARIS[0];
}
