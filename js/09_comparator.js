// ═══════════════════════════════════════════
// 09_comparator.js — Comparateur modes de garde
// v1.2 — corrigé : injection HTML + branchement bouton sans id
// ═══════════════════════════════════════════

let salaryMode = 'net'; // 'net' | 'brut'

// ─────────────────────────────────────────────
// initComparator()
// 1. Injecte le HTML du comparateur dans le DOM
// 2. Branche le bouton d'ouverture (le .hcta dans le header)
// 3. Lance un premier calcul
// ─────────────────────────────────────────────
export function initComparator() {
  // ── 1. Injection du HTML de la modale ───────────────────
  if (!document.getElementById('cmpOverlay')) {
    document.body.insertAdjacentHTML('beforeend', buildComparatorHTML());
  }

  // ── 2. Branchement du bouton header (.hcta) ──────────────
  // Le bouton n'a pas d'id, on le trouve par sa classe
  const btnOpen = document.querySelector('button.hcta');
  if (btnOpen) {
    btnOpen.addEventListener('click', openCmp);
  }

  // ── 3. Branchement du slider ─────────────────────────────
  document.getElementById('salarySlider').addEventListener('input', updateCmp);

  // ── 4. Premier calcul ────────────────────────────────────
  updateCmp();

  // ── 5. Exposition sur window (pour les onclick dans le HTML injecté)
  window.closeCmp      = closeCmp;
  window.setSalaryMode = setSalaryMode;
  window.openCmp       = openCmp;
}

// ─────────────────────────────────────────────
// buildComparatorHTML()
// Retourne le HTML complet de la modale comparateur
// ─────────────────────────────────────────────
function buildComparatorHTML() {
  return `
<div class="cmp-overlay" id="cmpOverlay">
  <div class="cmp-modal">

    <div class="cmp-hdr">
      <div>
        <h2>⚖️ Comparer les modes de garde</h2>
        <div class="cmp-hdr-sub">Coût mensuel net estimé · enfant &lt; 3 ans · Paris · temps plein</div>
      </div>
      <button class="cmp-close" onclick="closeCmp()">✕</button>
    </div>

    <div class="cmp-body">

      <div class="cmp-salary">
        <label>Votre revenu mensuel</label>
        <div class="salary-input-wrap">
          <div class="salary-toggle">
            <button id="btnNet"  class="active" onclick="setSalaryMode('net')">Net</button>
            <button id="btnBrut"               onclick="setSalaryMode('brut')">Brut</button>
          </div>
          <input type="range" id="salarySlider" min="700" max="8000" step="100" value="2500">
          <span class="salary-val" id="salaryVal">2 500 €</span>
        </div>
        <span class="cmp-aides-note">Aides CAF / crédit d'impôt déjà déduits</span>
      </div>

      <div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead>
            <tr>
              <th></th>
              <th class="mode-hdr"><div class="mode-badge" style="background:#d4e8d8;color:#1a5c2a">🏛 Crèche publique</div></th>
              <th class="mode-hdr"><div class="mode-badge" style="background:#dde0f0;color:#2a3c7c">🏢 Crèche privée</div></th>
              <th class="mode-hdr"><div class="mode-badge" style="background:#ddeece;color:#2e5010">🤝 Crèche assoc.</div></th>
              <th class="mode-hdr"><div class="mode-badge" style="background:#fde8d8;color:#7a3a1a">👶 Ass. mat.</div></th>
              <th class="mode-hdr"><div class="mode-badge" style="background:#f0f0d4;color:#5c5c1a">🏠 Nounou partagée</div></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="row-label">Coût / mois</td>
              <td class="cost-cell" id="c-pub">–</td>
              <td class="cost-cell" id="c-priv">–</td>
              <td class="cost-cell" id="c-assoc">–</td>
              <td class="cost-cell" id="c-am">–</td>
              <td class="cost-cell" id="c-share">–</td>
            </tr>
            <tr>
              <td class="row-label">Disponibilité</td>
              <td class="mode-col"><span class="con">Liste d'attente 6–18 mois</span></td>
              <td class="mode-col"><span class="pro">Places + accessibles</span></td>
              <td class="mode-col"><span class="con">Liste d'attente variable</span></td>
              <td class="mode-col"><span class="pro">Souvent disponible</span></td>
              <td class="mode-col"><span class="pro">Flexible à l'embauche</span></td>
            </tr>
            <tr>
              <td class="row-label">Horaires</td>
              <td class="mode-col"><span class="con">7h30–18h30 fixe</span></td>
              <td class="mode-col"><span class="pro">Étendu souvent dispo</span></td>
              <td class="mode-col"><span class="con">7h30–18h30 fixe</span></td>
              <td class="mode-col"><span class="pro">Négociable</span></td>
              <td class="mode-col"><span class="pro">Très flexible</span></td>
            </tr>
            <tr>
              <td class="row-label">Encadrement</td>
              <td class="mode-col"><span class="pro">Puéricultrice · 1/5 enfants</span></td>
              <td class="mode-col"><span class="pro">Puéricultrice · 1/5</span></td>
              <td class="mode-col"><span class="pro">Puéricultrice · 1/5</span></td>
              <td class="mode-col"><span class="pro">1 adulte · max 6 enfants</span></td>
              <td class="mode-col"><span class="pro">1 adulte · 2–3 enfants</span></td>
            </tr>
            <tr>
              <td class="row-label">Socialisation</td>
              <td class="mode-col"><span class="pro">Très forte</span></td>
              <td class="mode-col"><span class="pro">Forte</span></td>
              <td class="mode-col"><span class="pro">Forte + projet parental</span></td>
              <td class="mode-col"><span class="pro">Bonne (RPE, sorties)</span></td>
              <td class="mode-col"><span class="pro">Bonne (2–3 enfants)</span></td>
            </tr>
            <tr>
              <td class="row-label">Démarches</td>
              <td class="mode-col"><span class="con">Inscription mairie obligatoire</span></td>
              <td class="mode-col"><span class="pro">Dossier allégé</span></td>
              <td class="mode-col"><span class="con">Adhésion asso requise</span></td>
              <td class="mode-col"><span class="con">Vous êtes employeur (Pajemploi)</span></td>
              <td class="mode-col"><span class="con">Employeur × 2 familles</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="cmp-footer">
      Estimations indicatives 2024 · Paris · 1 enfant &lt; 3 ans · couple · temps plein (200h/mois).
      Barème PSU CNAF 2023-010. CMG CNAF 3 tranches. Crédit d'impôt 50% plafonné 3 500€/an/enfant.
      <strong>Ces chiffres ne se substituent pas à un bilan CAF personnalisé.</strong>
    </div>

  </div>
</div>`;
}

// ─────────────────────────────────────────────
// Ouvrir / fermer
// ─────────────────────────────────────────────
function openCmp() {
  document.getElementById('cmpOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  updateCmp();
}

function closeCmp() {
  document.getElementById('cmpOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────
// Basculer net ↔ brut
// ─────────────────────────────────────────────
function setSalaryMode(mode) {
  salaryMode = mode;
  document.getElementById('btnNet').classList.toggle('active',  mode === 'net');
  document.getElementById('btnBrut').classList.toggle('active', mode === 'brut');
  updateCmp();
}

// ─────────────────────────────────────────────
// updateCmp() — recalcule et affiche les coûts
// ─────────────────────────────────────────────
function updateCmp() {
  const raw = +document.getElementById('salarySlider').value;

  const netMensuel = salaryMode === 'brut' ? Math.round(raw * 0.78) : raw;
  const netAnnuel  = netMensuel * 12;

  document.getElementById('salaryVal').textContent =
    raw.toLocaleString('fr-FR') + ' €' +
    (salaryMode === 'brut'
      ? ' brut → ' + netMensuel.toLocaleString('fr-FR') + ' € net'
      : '');

  // ── Barème PSU · Source : barème CNAF 2023-010 ───────────────
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
  const brutPSU = Math.round(tauxPSU * 200); // 200h/mois

  // Crédit d'impôt 50% plafonné 3 500€/an → ~146€/mois
  const ciMax = Math.round(1750 / 12);

  // ── CMG ───────────────────────────────────────────────────────
  const cmg = (() => {
    if (netAnnuel <= 21869) return 472;
    if (netAnnuel <= 47761) return 296;
    return 149;
  })();

  // ── Assistante maternelle ─────────────────────────────────────
  const coutAM_brut  = 1550;
  const coutAM_net   = Math.max(0, coutAM_brut - cmg);
  const ciAM         = Math.min(ciMax, Math.round(coutAM_net * 0.5));
  const coutAM_final = Math.max(0, coutAM_net - ciAM);

  // ── Nounou partagée ───────────────────────────────────────────
  const coutShare_brut  = 1400;
  const coutShare_net   = Math.max(0, coutShare_brut - cmg);
  const ciShare         = Math.min(ciMax, Math.round(coutShare_net * 0.5));
  const coutShare_final = Math.max(0, coutShare_net - ciShare);

  // ── Crèche privée ─────────────────────────────────────────────
  const brutPriv       = 1400;
  const ciPriv         = Math.min(ciMax, Math.round(brutPriv * 0.5));
  const coutPriv_final = Math.max(0, brutPriv - ciPriv);

  // ── Affichage ─────────────────────────────────────────────────
  const fmt = (n, sub = '') =>
    `<span>${n.toLocaleString('fr-FR')} €</span><span class="cost-sub">${sub}</span>`;

  document.getElementById('c-pub').innerHTML   = fmt(brutPSU,          'barème CAF, aucune aide sup.');
  document.getElementById('c-priv').innerHTML  = fmt(coutPriv_final,   `brut ~${brutPriv}€ · CI 50%`);
  document.getElementById('c-assoc').innerHTML = fmt(brutPSU,          'même barème PSU que public');
  document.getElementById('c-am').innerHTML    = fmt(coutAM_final,     `CMG −${cmg}€ · CI −${ciAM}€`);
  document.getElementById('c-share').innerHTML = fmt(coutShare_final,  `CMG −${cmg}€ · CI −${ciShare}€`);
}