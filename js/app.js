/* ------------------------------------------------------------------
   app.js — interface wiring.

   Every trait explains BOTH what it does at the table and what it does to
   the challenge rating, on hover for mouse users and on tap for everyone
   else. Everything that can change the CR lives in the one checklist.
   ------------------------------------------------------------------ */

(function () {
  'use strict';

  const E = window.CREngine;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'cr-calc-state-v3';
  const THEME_KEY = 'cr-calc-theme';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------- State ---------------- */

  const DEFAULTS = {
    tierId: '0-4',
    ac: 13, hp: 75,
    attackBonus: 4, saveDC: 12,
    extraDamage: 0,
    roundCount: 1,
    primary: [5, 0, 0, 0, 0, 0],
    secondary: [5, 0, 0, 0, 0, 0],
    traits: {}, traitValues: {},
    showNoEffect: false,
  };

  let state = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved === 'object') {
        return Object.assign({}, DEFAULTS, saved, {
          traits: Object.assign({}, saved.traits),
          traitValues: Object.assign({}, saved.traitValues),
          primary: Array.isArray(saved.primary) ? saved.primary.slice(0, 6) : DEFAULTS.primary.slice(),
          secondary: Array.isArray(saved.secondary) ? saved.secondary.slice(0, 6) : DEFAULTS.secondary.slice(),
        });
      }
    } catch (_) { /* fall through to defaults */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  /* ---------------- Static help topics ---------------- */

  const HELP = {
    tier: {
      title: 'Target CR Range',
      desc: 'The band you are aiming for. Several features are worth more against a low-level party than a high-level one, so this has to be set before the rest of the numbers mean anything.',
      effect: 'Sets the HP multiplier for resistances and immunities, the value of Relentless and Undead Fortitude, and whether the flying and fear bonuses apply at all.',
    },
    extra: {
      title: 'Off-turn damage',
      desc: 'Damage the creature deals outside its own action: damaging auras, reactions, legendary actions and lair actions. A fire aura that burns whoever melees it, for instance.',
      effect: 'Added to effective damage every round. Assume one character is in range and triggering it each round.',
    },
    damage: {
      title: 'Damage per round',
      desc: 'Add up the average damage of everything the creature does in a round, using its most effective attack routine. Assume attacks hit and that targets fail their saves.',
      effect: 'Averaged over however many rounds you show. Add rounds when the damage varies — a breath weapon on round one and claws after, say.',
    },
  };

  /* Everything tickable, in one list: the bracketed statistics first (as in
     the original), then the traits alphabetically. */
  const ALL_TRAITS = window.STAT_TRAITS.concat(window.TRAITS);
  const BY_ID = {};
  ALL_TRAITS.forEach((t) => { BY_ID[t.id] = t; });

  /* ---------------- Popover ---------------- */

  const pop = $('popover');
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let pinned = null;
  let hideTimer = null;
  let anchor = null;

  function popoverContent({ title, example, desc, effect, gated }) {
    pop.textContent = '';
    pop.appendChild(el('div', 'pop-title', title));
    if (example) pop.appendChild(el('div', 'pop-example', 'e.g. ' + example));
    if (desc) pop.appendChild(el('p', 'pop-desc', desc));
    if (effect) {
      const box = el('div', 'pop-effect');
      box.appendChild(el('b', null, 'Effect on CR'));
      box.appendChild(document.createTextNode(effect));
      pop.appendChild(box);
    }
    if (gated) pop.appendChild(el('p', 'pop-gate', 'Not applied at your current target CR range.'));
  }

  function placePopover(trigger) {
    pop.hidden = false;
    pop.style.left = '0px';
    pop.style.top = '0px';

    const t = trigger.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const margin = 8;

    let left = t.left + t.width / 2 - p.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));

    let top = t.bottom + 5;
    if (top + p.height > window.innerHeight - margin) {
      const above = t.top - p.height - 5;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - p.height - margin);
    }

    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  function showPopover(trigger, content) {
    clearTimeout(hideTimer);
    anchor = trigger;
    popoverContent(content);
    placePopover(trigger);
  }

  function hidePopover(force) {
    if (pinned && !force) return;
    clearTimeout(hideTimer);
    pop.hidden = true;
    anchor = null;
    if (pinned) { pinned.classList.remove('open'); pinned = null; }
    document.querySelectorAll('.info-btn.open').forEach((b) => b.classList.remove('open'));
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!pinned) pop.hidden = true; }, 120);
  }

  /* The trait list scrolls inside its own box, so a scroll event does not mean
     the popover should vanish — it means it must follow its anchor. */
  function reposition() {
    if (pop.hidden || !anchor) return;
    if (!anchor.isConnected) { hidePopover(true); return; }
    const r = anchor.getBoundingClientRect();
    const gone = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
    if (gone) hidePopover(true);
    else placePopover(anchor);
  }

  function contentFor(trigger) {
    const topic = trigger.dataset.help;
    if (topic && HELP[topic]) {
      const h = HELP[topic];
      return { title: h.title, desc: h.desc, effect: h.effect };
    }
    const row = trigger.closest('[data-trait]');
    if (!row) return null;
    const id = row.dataset.trait;

    const trait = BY_ID[id];
    if (trait) {
      const tier = E.tierById(state.tierId);
      return {
        title: trait.name,
        example: trait.example,
        desc: trait.desc,
        effect: trait.effect,
        gated: Boolean(trait.lowLevel && !tier.lowLevel),
      };
    }
    const plain = window.NO_EFFECT_TRAITS.find((t) => t.name === id);
    if (plain) {
      return { title: plain.name, example: plain.example, desc: plain.desc, effect: 'None. This trait does not change the challenge rating.' };
    }
    if (id === '__spellcasting') {
      const s = window.SPELLCASTING_NOTE;
      return { title: s.name, desc: s.desc, effect: s.effect };
    }
    return null;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-btn:not(.static)');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const content = contentFor(btn);
      if (!content) return;
      if (pinned === btn) { hidePopover(true); return; }
      hidePopover(true);
      pinned = btn;
      btn.classList.add('open');
      showPopover(btn, content);
      return;
    }
    if (!e.target.closest('.popover')) hidePopover(true);
  });

  if (canHover) {
    /* Only the "i" opens it. Hovering the whole row meant the popover fired
       every time the pointer crossed the list on its way somewhere else. */
    document.addEventListener('pointerover', (e) => {
      if (pinned) return;
      const trigger = e.target.closest('.info-btn:not(.static)');
      if (!trigger || pop.contains(trigger)) return;
      const content = contentFor(trigger);
      if (!content) return;
      showPopover(trigger, content);
    });
    document.addEventListener('pointerout', (e) => {
      if (pinned) return;
      const trigger = e.target.closest('.info-btn:not(.static)');
      if (!trigger) return;
      if (e.relatedTarget && (trigger.contains(e.relatedTarget) || pop.contains(e.relatedTarget))) return;
      scheduleHide();
    });
    pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    pop.addEventListener('pointerleave', () => { if (!pinned) scheduleHide(); });
  }

  document.addEventListener('focusin', (e) => {
    const btn = e.target.closest('.info-btn:not(.static)');
    if (!btn) return;
    const content = contentFor(btn);
    if (content) showPopover(btn, content);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePopover(true); });
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  /* ---------------- Inputs ---------------- */

  function bindNumber(id, key, min, max) {
    const input = $(id);
    input.addEventListener('input', () => {
      const n = parseFloat(input.value);
      if (Number.isFinite(n)) { state[key] = n; render(); }
    });
    input.addEventListener('change', () => {
      let n = parseFloat(input.value);
      if (!Number.isFinite(n)) n = DEFAULTS[key];
      n = Math.max(min, Math.min(max, n));
      state[key] = n;
      input.value = n;
      render();
    });
  }

  bindNumber('ac', 'ac', 1, 40);
  bindNumber('hp', 'hp', 1, 2000);
  bindNumber('attackBonus', 'attackBonus', -5, 30);
  bindNumber('saveDC', 'saveDC', 1, 40);
  bindNumber('extraDamage', 'extraDamage', 0, 1000);

  const tierSelect = $('tier');
  E.TIERS.forEach((t) => {
    const opt = el('option', null, t.label);
    opt.value = t.id;
    tierSelect.appendChild(opt);
  });
  tierSelect.value = state.tierId;
  tierSelect.addEventListener('change', () => { state.tierId = tierSelect.value; render(); });

  /* ---------------- Damage table ---------------- */

  function buildDamageRows() {
    const body = $('dmgBody');
    body.textContent = '';
    for (let i = 0; i < state.roundCount; i++) {
      const tr = el('tr');
      tr.appendChild(el('td', null, String(i + 1)));

      ['primary', 'secondary'].forEach((which) => {
        const td = el('td');
        const input = el('input');
        input.type = 'number';
        input.min = '0';
        input.max = '1000';
        input.inputMode = 'numeric';
        input.value = state[which][i] != null ? state[which][i] : 0;
        input.setAttribute('aria-label', which + ' damage, round ' + (i + 1));
        const commit = (clamp) => {
          let n = parseFloat(input.value);
          if (!Number.isFinite(n)) { if (!clamp) return; n = 0; }
          n = Math.max(0, Math.min(1000, n));
          state[which][i] = n;
          if (clamp) input.value = n;
          render();
        };
        input.addEventListener('input', () => commit(false));
        input.addEventListener('change', () => commit(true));
        td.appendChild(input);
        tr.appendChild(td);
      });

      const total = el('td', 'by-round');
      total.id = 'byRound' + i;
      tr.appendChild(total);
      body.appendChild(tr);
    }
  }

  $('addRound').addEventListener('click', () => {
    if (state.roundCount >= 6) return;
    state.roundCount++;
    buildDamageRows();
    render();
  });
  $('removeRound').addEventListener('click', () => {
    if (state.roundCount <= 1) return;
    state.roundCount--;
    buildDamageRows();
    render();
  });

  /* ---------------- Trait list ---------------- */

  function traitRow(trait, readonly) {
    const row = el('div', 'trait' + (readonly ? ' readonly' : ''));
    row.dataset.trait = readonly ? trait.name : trait.id;

    if (readonly) {
      row.appendChild(el('span', 'trait-name', trait.name));
    } else {
      const main = el('label', 'trait-main');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !!state.traits[trait.id];
      box.addEventListener('change', () => {
        if (box.checked) state.traits[trait.id] = true;
        else delete state.traits[trait.id];
        render();
      });
      main.appendChild(box);
      main.appendChild(el('span', 'trait-name', trait.name));
      row.appendChild(main);

      if (trait.value) {
        const val = el('input');
        val.type = 'number';
        val.min = String(trait.value.min);
        val.max = String(trait.value.max);
        val.inputMode = 'numeric';
        val.setAttribute('aria-label', trait.name + ' — ' + trait.value.label);
        val.value = state.traitValues[trait.id] != null ? state.traitValues[trait.id] : trait.value.def;
        const commit = (clamp) => {
          let n = parseFloat(val.value);
          if (!Number.isFinite(n)) { if (!clamp) return; n = trait.value.def; }
          n = Math.max(trait.value.min, Math.min(trait.value.max, n));
          state.traitValues[trait.id] = n;
          if (clamp) val.value = n;
          render();
        };
        val.addEventListener('input', () => commit(false));
        val.addEventListener('change', () => commit(true));
        row.appendChild(val);
      }
    }

    const info = el('button', 'info-btn', 'i');
    info.type = 'button';
    info.setAttribute('aria-label', 'What ' + trait.name + ' does');
    row.appendChild(info);
    return row;
  }

  function buildTraitList() {
    const host = $('traitList');
    host.textContent = '';
    const q = ($('traitSearch').value || '').trim().toLowerCase();
    const hit = (t) => !q || (t.name + ' ' + (t.example || '') + ' ' + t.desc + ' ' + (t.effect || '')).toLowerCase().includes(q);

    const stats = window.STAT_TRAITS.filter(hit);
    const traits = window.TRAITS.filter(hit).sort((a, b) => a.name.localeCompare(b.name));
    const none = window.NO_EFFECT_TRAITS.filter(hit);

    stats.forEach((t) => host.appendChild(traitRow(t, false)));
    if (stats.length && traits.length) host.appendChild(el('div', 'grouphead', 'Traits'));
    traits.forEach((t) => host.appendChild(traitRow(t, false)));

    if (none.length) {
      /* Collapsed by default — these change nothing, they are only here so
         that "what about X?" has a visible answer. A search that matches
         them opens the group so the hits are not hidden. */
      const open = state.showNoEffect || Boolean(q);
      const toggle = el('button', 'grouphead grouptoggle');
      toggle.type = 'button';
      toggle.id = 'noEffectToggle';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-controls', 'noEffectGroup');
      toggle.textContent = (open ? '▾ ' : '▸ ') + 'No effect on CR (' + (none.length + 1) + ')';
      toggle.addEventListener('click', () => {
        state.showNoEffect = !state.showNoEffect;
        buildTraitList();
        syncTraitStates();
        save();
      });
      host.appendChild(toggle);

      const group = el('div', 'noeffect-group');
      group.id = 'noEffectGroup';
      group.hidden = !open;

      const spell = el('div', 'trait readonly');
      spell.dataset.trait = '__spellcasting';
      spell.appendChild(el('span', 'trait-name', window.SPELLCASTING_NOTE.name));
      const si = el('button', 'info-btn', 'i');
      si.type = 'button';
      si.setAttribute('aria-label', 'How to handle spellcasting');
      spell.appendChild(si);
      group.appendChild(spell);

      none.forEach((t) => group.appendChild(traitRow(t, true)));
      host.appendChild(group);
    }

    if (!host.children.length) host.appendChild(el('p', 'tip', 'No traits match “' + q + '”.'));
  }

  $('traitSearch').addEventListener('input', () => { buildTraitList(); syncTraitStates(); });

  function syncTraitStates() {
    const tier = E.tierById(state.tierId);
    document.querySelectorAll('#traitList [data-trait]').forEach((row) => {
      const trait = BY_ID[row.dataset.trait];
      if (!trait) return;
      const on = !!state.traits[trait.id];
      row.classList.toggle('checked', on);
      /* Boolean() matters: `on && trait.lowLevel` is undefined for any trait
         without the flag, and classList.toggle treats undefined as "flip". */
      row.classList.toggle('gated', Boolean(on && trait.lowLevel && !tier.lowLevel));
    });
    const count = Object.keys(state.traits).length;
    const pill = $('traitCount');
    pill.textContent = String(count);
    pill.classList.toggle('on', count > 0);
  }

  /* ---------------- Reference table ---------------- */

  /* Collapsed by default. This is chrome rather than monster data, so it
     lives in its own key instead of the working state — otherwise loading
     a profile would yank the panel open or shut. */
  const REF_KEY = 'cr-calc-ref-open';
  let refOpen = false;
  try { refOpen = localStorage.getItem(REF_KEY) === '1'; } catch (_) {}

  function applyRefState() {
    $('refScroll').hidden = !refOpen;
    $('refToggle').setAttribute('aria-expanded', String(refOpen));
    $('app').classList.toggle('ref-open', refOpen);
  }

  $('refToggle').addEventListener('click', () => {
    refOpen = !refOpen;
    try { localStorage.setItem(REF_KEY, refOpen ? '1' : '0'); } catch (_) {}
    applyRefState();
  });

  function buildRefTable() {
    const body = $('refBody');
    body.textContent = '';
    E.CR_TABLE.forEach((r) => {
      const tr = el('tr');
      tr.dataset.cr = r.cr;
      [
        r.cr, r.xpLabel, '+' + r.prof,
        r.cap ? '≤' + r.ac : String(r.ac),
        r.hpMin + '–' + r.hpMax,
        (r.cap ? '≤+' : '+') + r.atk,
        r.dmgMin + '–' + r.dmgMax,
        r.cap ? '≤' + r.dc : String(r.dc),
      ].forEach((text) => tr.appendChild(el('td', null, text)));
      body.appendChild(tr);
    });
  }

  /* ---------------- Render ---------------- */

  const signed = (n) => (n > 0 ? '+' + n : String(n));
  /* CR adjustments always carry a sign, including "+0 CR". */
  const signedAlways = (n) => (n < 0 ? String(n) : '+' + n);

  function setValue(id, main, adjust) {
    const node = $(id);
    node.textContent = main;
    if (adjust !== undefined) {
      node.appendChild(document.createTextNode(' '));
      node.appendChild(el('small', null, '(' + signedAlways(adjust) + ' CR)'));
    }
  }

  function render() {
    const tier = E.tierById(state.tierId);

    const rounds = [];
    for (let i = 0; i < state.roundCount; i++) {
      rounds.push((state.primary[i] || 0) + (state.secondary[i] || 0));
    }

    const result = E.compute({
      tierId: state.tierId,
      ac: state.ac,
      hp: state.hp,
      damageResistance: !!state.traits.damageResistance,
      damageImmunity: !!state.traits.damageImmunity,
      flyAndRanged: !!state.traits.flyAndRanged,
      saveProficiencies: state.traits.saveProficiencies
        ? (state.traitValues.saveProficiencies != null ? state.traitValues.saveProficiencies : 3)
        : 0,
      attackBonus: state.attackBonus,
      saveDC: state.saveDC,
      offenseBy: 'auto',
      damageMode: 'rounds',
      roundCount: state.roundCount,
      rounds: rounds,
      extraDamage: state.extraDamage,
      traits: state.traits,
      traitValues: state.traitValues,
    });

    /* Baseline strip */
    const band = E.CR_TABLE.filter((r) => r.v >= tier.min && r.v <= tier.max);
    const first = band[0], last = band[band.length - 1];
    const span = (a, b, p) => (a === b ? p + a : p + a + '–' + p + b);
    $('baseline').textContent =
      'Baseline for ' + tier.label + '  ·  AC ' + span(first.ac, last.ac, '') +
      '  ·  HP ' + first.hpMin + '–' + last.hpMax +
      '  ·  Attack ' + span(first.atk, last.atk, '+') +
      '  ·  Damage ' + first.dmgMin + '–' + last.dmgMax +
      '  ·  DC ' + span(first.dc, last.dc, '');

    /* Damage table */
    for (let i = 0; i < state.roundCount; i++) {
      const cell = $('byRound' + i);
      if (cell) cell.textContent = String(rounds[i]);
    }
    $('avgLabel').textContent = 'Average over ' + state.roundCount + (state.roundCount === 1 ? ' round' : ' rounds');
    $('avgDmg').textContent = String(Math.round((rounds.reduce((a, b) => a + b, 0) / state.roundCount) * 10) / 10);
    $('addRound').disabled = state.roundCount >= 6;
    $('removeRound').disabled = state.roundCount <= 1;

    /* Defensive */
    const eff = result.effective;
    $('effAC').textContent = String(eff.ac);
    $('effHP').textContent = String(eff.hp);
    $('crByHP').textContent = result.defensive.hpRow.cr;
    setValue('expAC', String(result.defensive.expectedAC), result.defensive.acShift);
    $('defCR').textContent = result.defensive.row.cr;

    /* Offensive */
    $('effAtk').textContent = signed(eff.attack);
    $('effDmg').textContent = String(eff.damage);
    $('effDC').textContent = String(eff.saveDC);
    $('crByDmg').textContent = result.offensive.dmgRow.cr;
    setValue('expAtk', signed(result.offensive.expectedAtk), result.offensive.atkShift);
    setValue('expDC', String(result.offensive.expectedDC), result.offensive.dcShift);
    $('offCRAtk').textContent = result.offensive.byAttackRow.cr;
    $('offCRSave').textContent = result.offensive.bySaveRow.cr;
    $('offCR').textContent = result.offensive.row.cr;

    /* Grey out whichever of attack / save DC is not setting the CR */
    const usingAttack = result.offensive.offenseBy === 'attack';
    $('cellByAtk').classList.toggle('muted-out', !usingAttack);
    $('cellBySave').classList.toggle('muted-out', usingAttack);

    /* Overall */
    $('finalCR').textContent = result.final.row.cr;
    $('finalMeta').textContent = result.final.row.xpLabel + ' XP  ·  Prof +' + result.final.row.prof;
    const flag = $('targetFlag');
    flag.hidden = result.final.inTarget;
    if (!result.final.inTarget) flag.textContent = 'Outside ' + tier.label;

    document.querySelectorAll('#refBody tr').forEach((tr) => {
      tr.classList.toggle('is-current', tr.dataset.cr === result.final.row.cr);
    });

    syncTraitStates();
    save();
  }

  /* ---------------- Theme & reset ---------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }
  $('themeToggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) applyTheme(savedTheme);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  } catch (_) {}

  $('resetBtn').addEventListener('click', () => {
    state = JSON.parse(JSON.stringify(DEFAULTS));
    currentProfile = '';
    $('traitSearch').value = '';
    syncInputs();
    buildDamageRows();
    buildTraitList();
    render();
    refreshProfiles();
  });

  /* ---------------- Profiles ---------------- */

  /* Saved calculations, kept separate from the working state so that
     reloading the page still resumes wherever you left off. */
  const PROFILE_KEY = 'cr-calc-profiles';
  let currentProfile = '';

  function readProfiles() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch (_) { return {}; }
  }
  function writeProfiles(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function refreshProfiles() {
    const sel = $('profileSelect');
    const profiles = readProfiles();
    const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
    if (!profiles[currentProfile]) currentProfile = '';

    sel.textContent = '';
    const placeholder = el('option', null, names.length ? 'Load…' : 'No profiles');
    placeholder.value = '';
    sel.appendChild(placeholder);
    names.forEach((n) => {
      const o = el('option', null, n);
      o.value = n;
      sel.appendChild(o);
    });
    sel.value = currentProfile;
    $('profileDelete').disabled = !currentProfile;
  }

  $('profileSave').addEventListener('click', () => {
    const profiles = readProfiles();
    const suggested = currentProfile || 'Monster ' + (Object.keys(profiles).length + 1);
    let name;
    try { name = window.prompt('Save this calculation as:', suggested); }
    catch (_) { name = suggested; }
    name = (name || '').trim();
    if (!name) return;
    profiles[name] = JSON.parse(JSON.stringify(state));
    writeProfiles(profiles);
    currentProfile = name;
    refreshProfiles();
  });

  $('profileSelect').addEventListener('change', () => {
    const name = $('profileSelect').value;
    if (!name) { currentProfile = ''; $('profileDelete').disabled = true; return; }
    const saved = readProfiles()[name];
    if (!saved) { refreshProfiles(); return; }
    state = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), saved, {
      traits: Object.assign({}, saved.traits),
      traitValues: Object.assign({}, saved.traitValues),
      primary: Array.isArray(saved.primary) ? saved.primary.slice(0, 6) : DEFAULTS.primary.slice(),
      secondary: Array.isArray(saved.secondary) ? saved.secondary.slice(0, 6) : DEFAULTS.secondary.slice(),
    });
    currentProfile = name;
    $('traitSearch').value = '';
    syncInputs();
    buildDamageRows();
    buildTraitList();
    render();
    refreshProfiles();
  });

  $('profileDelete').addEventListener('click', () => {
    if (!currentProfile) return;
    let go = true;
    try { go = window.confirm('Delete the profile “' + currentProfile + '”?'); }
    catch (_) { go = true; }
    if (!go) return;
    const profiles = readProfiles();
    delete profiles[currentProfile];
    writeProfiles(profiles);
    currentProfile = '';
    refreshProfiles();
  });

  function syncInputs() {
    $('ac').value = state.ac;
    $('hp').value = state.hp;
    $('attackBonus').value = state.attackBonus;
    $('saveDC').value = state.saveDC;
    $('extraDamage').value = state.extraDamage;
    $('tier').value = state.tierId;
  }

  /* ---------------- Boot ---------------- */

  syncInputs();
  buildDamageRows();
  buildTraitList();
  buildRefTable();
  applyRefState();
  refreshProfiles();
  render();
})();
