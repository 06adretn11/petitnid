// bootstrap.js — PetitNid
// Initialisation UI — fonctions globales appelées depuis le HTML

// ── Toggle carte / liste sur mobile ─────────────────────────
// Par défaut sur mobile : liste visible, carte masquée.
// Appelé par onclick="toggleMapMobile()" sur le bouton .map-toggle
function toggleMapMobile() {
  const mapC = document.getElementById('map-container');
  const list = document.querySelector('.listwrap');
  const btn  = document.getElementById('mapToggle');
  const showingMap = mapC.classList.contains('visible');
  if (showingMap) {
    mapC.classList.remove('visible');
    list.classList.remove('hidden');
    btn.textContent = '🗺 Voir la carte';
  } else {
    mapC.classList.add('visible');
    list.classList.add('hidden');
    btn.textContent = '📋 Voir la liste';
    // Forcer Leaflet à recalculer la taille après affichage
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }
}

// Exposition globale — nécessaire car appelé depuis un attribut onclick HTML
window.toggleMapMobile = toggleMapMobile;