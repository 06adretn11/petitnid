// bootstrap.js — PetitNid
// Initialisation UI — event listeners pour tous les éléments
// dont les onclick ont été retirés du HTML pour conformité CSP.
// Chargé en type="module" → window.toggleMapMobile exposé
// explicitement pour les appels depuis d'autres contextes.

document.addEventListener('DOMContentLoaded', () => {

  // ── Toggle carte / liste (mobile) ─────────────────────────
  const mapToggleBtn = document.getElementById('mapToggle');
  if (mapToggleBtn) {
    mapToggleBtn.addEventListener('click', toggleMapMobile);
  }

  // ── Modal nounous : fermeture ──────────────────────────────
  const nounouModal = document.getElementById('nounouModal');
  const nounouClose = document.getElementById('nounouClose');
  if (nounouClose) {
    nounouClose.addEventListener('click', () => {
      nounouModal.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
  if (nounouModal) {
    nounouModal.addEventListener('click', e => {
      if (e.target === nounouModal) {
        nounouModal.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

});

// ── Toggle carte / liste sur mobile ───────────────────────
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
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  }
}

window.toggleMapMobile = toggleMapMobile;