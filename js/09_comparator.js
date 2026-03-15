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

  // ── 4. Bouton fermer ──────────────────────────────────────
  document.getElementById('cmpClose').addEventListener('click', closeCmp);

  // ── 5. Boutons Net / Brut ─────────────────────────────────
  document.getElementById('btnNet').addEventListener('click',  () => setSalaryMode('net'));
  document.getElementById('btnBrut').addEventListener('click', () => setSalaryMode('brut'));

  // ── 6. Boutons accordéon mobile ───────────────────────────
  document.querySelectorAll('[data-accord]').forEach(btn => {
    btn.addEventListener('click', () => toggleCmpAccord(btn.dataset.accord));
  });

  // ── 7. Fermer en cliquant sur le fond ─────────────────────
  document.getElementById('cmpOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('cmpOverlay')) closeCmp();
  });

  // ── 8. Premier calcul ────────────────────────────────────
  updateCmp();

  // ── 9. Exposition sur window ─────────────────────────────
  window.closeCmp = closeCmp;
  window.openCmp  = openCmp;
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
      <button class="cmp-close" id="cmpClose">✕</button>
    </div>

    <div class="cmp-body">

      <div class="cmp-salary">
        <label>Votre revenu mensuel</label>
        <div class="salary-input-wrap">
          <div class="salary-toggle">
            <button id="btnNet"  class="active">Net</button>
            <button id="btnBrut">Brut</button>
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

      <!-- ── Vue accordéon mobile (masquée sur desktop via CSS) ── -->
      <div class="cmp-accord-list" style="display:none;flex-direction:column;gap:.5rem;padding:.8rem 1rem;">

        <!-- Crèche publique -->
        <div style="border:1.5px solid #d4e8d8;border-radius:10px;overflow:hidden;">
          <button data-accord="pub" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:#f5fbf6;border:none;cursor:pointer;text-align:left;gap:.5rem;">
            <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0;">
              <span style="font-size:1.1rem">🏛</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#1a5c2a;">Crèche publique</div>
                <div id="mc-pub" style="font-size:.75rem;color:#2d4a3e;">–</div>
              </div>
            </div>
            <span id="accord-icon-pub" style="font-size:1.2rem;color:#888;flex-shrink:0;">›</span>
          </button>
          <div id="accord-body-pub" style="display:none;padding:.7rem 1rem .9rem;background:white;border-top:1px solid #e8f5ea;font-size:.78rem;line-height:1.6;">
            <div><span class="con">Liste d'attente 6–18 mois</span></div>
            <div><span class="con">Horaires 7h30–18h30 fixe</span></div>
            <div><span class="pro">Puéricultrice · ratio 1/5 enfants</span></div>
            <div><span class="pro">Socialisation très forte</span></div>
            <div><span class="con">Inscription mairie obligatoire</span></div>
          </div>
        </div>

        <!-- Crèche privée -->
        <div style="border:1.5px solid #dde0f0;border-radius:10px;overflow:hidden;">
          <button data-accord="priv" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:#f7f8fd;border:none;cursor:pointer;text-align:left;gap:.5rem;">
            <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0;">
              <span style="font-size:1.1rem">🏢</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#2a3c7c;">Crèche privée</div>
                <div id="mc-priv" style="font-size:.75rem;color:#2d4a3e;">–</div>
              </div>
            </div>
            <span id="accord-icon-priv" style="font-size:1.2rem;color:#888;flex-shrink:0;">›</span>
          </button>
          <div id="accord-body-priv" style="display:none;padding:.7rem 1rem .9rem;background:white;border-top:1px solid #e8eaf8;font-size:.78rem;line-height:1.6;">
            <div><span class="pro">Places plus accessibles</span></div>
            <div><span class="pro">Horaires étendus souvent disponibles</span></div>
            <div><span class="pro">Puéricultrice · ratio 1/5</span></div>
            <div><span class="pro">Socialisation forte</span></div>
            <div><span class="pro">Dossier allégé</span></div>
          </div>
        </div>

        <!-- Crèche associative -->
        <div style="border:1.5px solid #ddeece;border-radius:10px;overflow:hidden;">
          <button data-accord="assoc" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:#f6fbf2;border:none;cursor:pointer;text-align:left;gap:.5rem;">
            <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0;">
              <span style="font-size:1.1rem">🤝</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#2e5010;">Crèche associative</div>
                <div id="mc-assoc" style="font-size:.75rem;color:#2d4a3e;">–</div>
              </div>
            </div>
            <span id="accord-icon-assoc" style="font-size:1.2rem;color:#888;flex-shrink:0;">›</span>
          </button>
          <div id="accord-body-assoc" style="display:none;padding:.7rem 1rem .9rem;background:white;border-top:1px solid #eaf5e0;font-size:.78rem;line-height:1.6;">
            <div><span class="con">Liste d'attente variable</span></div>
            <div><span class="con">Horaires 7h30–18h30 fixe</span></div>
            <div><span class="pro">Puéricultrice · ratio 1/5</span></div>
            <div><span class="pro">Socialisation forte + projet parental</span></div>
            <div><span class="con">Adhésion association requise</span></div>
          </div>
        </div>

        <!-- Assistante maternelle -->
        <div style="border:1.5px solid #fde8d8;border-radius:10px;overflow:hidden;">
          <button data-accord="am" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:#fff8f4;border:none;cursor:pointer;text-align:left;gap:.5rem;">
            <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0;">
              <span style="font-size:1.1rem">👶</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#7a3a1a;">Assistante maternelle</div>
                <div id="mc-am" style="font-size:.75rem;color:#2d4a3e;">–</div>
              </div>
            </div>
            <span id="accord-icon-am" style="font-size:1.2rem;color:#888;flex-shrink:0;">›</span>
          </button>
          <div id="accord-body-am" style="display:none;padding:.7rem 1rem .9rem;background:white;border-top:1px solid #fde8d8;font-size:.78rem;line-height:1.6;">
            <div><span class="pro">Souvent disponible</span></div>
            <div><span class="pro">Horaires négociables</span></div>
            <div><span class="pro">1 adulte · max 6 enfants</span></div>
            <div><span class="pro">Bonne socialisation (RPE, sorties)</span></div>
            <div><span class="con">Vous êtes employeur (Pajemploi)</span></div>
          </div>
        </div>

        <!-- Nounou partagée -->
        <div style="border:1.5px solid #e8e8d0;border-radius:10px;overflow:hidden;">
          <button data-accord="share" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;background:#fafaf0;border:none;cursor:pointer;text-align:left;gap:.5rem;">
            <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0;">
              <span style="font-size:1.1rem">🏠</span>
              <div>
                <div style="font-size:.82rem;font-weight:700;color:#5c5c1a;">Nounou partagée</div>
                <div id="mc-share" style="font-size:.75rem;color:#2d4a3e;">–</div>
              </div>
            </div>
            <span id="accord-icon-share" style="font-size:1.2rem;color:#888;flex-shrink:0;">›</span>
          </button>
          <div id="accord-body-share" style="display:none;padding:.7rem 1rem .9rem;background:white;border-top:1px solid #e8e8d0;font-size:.78rem;line-height:1.6;">
            <div><span class="pro">Flexible à l'embauche</span></div>
            <div><span class="pro">Très flexible sur les horaires</span></div>
            <div><span class="pro">1 adulte · 2–3 enfants</span></div>
            <div><span class="pro">Bonne socialisation</span></div>
            <div><span class="con">Employeur × 2 familles (Pajemploi)</span></div>
          </div>
        </div>

      </div><!-- fin cmp-accord-list -->

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

function toggleCmpAccord(id) {
  const body   = document.getElementById('accord-body-' + id);
  const icon   = document.getElementById('accord-icon-' + id);
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '›' : '⌄';
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

  const costs = {
    pub:   { val: brutPSU,         sub: 'barème CAF, aucune aide sup.'    },
    priv:  { val: coutPriv_final,  sub: `brut ~${brutPriv}€ · CI 50%`     },
    assoc: { val: brutPSU,         sub: 'même barème PSU que public'       },
    am:    { val: coutAM_final,    sub: `CMG −${cmg}€ · CI −${ciAM}€`     },
    share: { val: coutShare_final, sub: `CMG −${cmg}€ · CI −${ciShare}€`  },
  };
  for (const [k, {val, sub}] of Object.entries(costs)) {
    // Tableau desktop
    const td = document.getElementById('c-' + k);
    if (td) td.innerHTML = fmt(val, sub);
    // Accordéon mobile
    const ma = document.getElementById('mc-' + k);
    if (ma) ma.innerHTML = `<span style="font-size:1rem;font-weight:800;color:#2d4a3e">${val.toLocaleString('fr-FR')} €/mois</span><span style="font-size:.68rem;color:#888;display:block;margin-top:.1rem">${sub}</span>`;
  }
}