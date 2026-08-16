/* ------------------------------------------------------------------
   engine.js — challenge rating maths. Pure functions, no DOM.

   Notes on the two things the original calculator got wrong:

   1. CR is a LADDER, not a number line. Its rungs are
      0, 1/8, 1/4, 1/2, 1, 2, 3 ... 30.
      The DMG says to adjust a CR "by 1 for every 2 points" of difference.
      That means one RUNG, so a CR 1/8 monster with a great AC steps up to
      1/4, not to 1.125. All adjustment happens in rung-index space.

   2. Rounding a CR below 1 has to snap to a real rung. The old code could
      round an average of 0.1875 up to 0.25 and then print "0" because it
      only ever compared against 1/8.
   ------------------------------------------------------------------ */

(function (root, factory) {
  const api = factory(
    typeof module !== 'undefined' && module.exports ? require('./data.js') : root
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CREngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {

  const { CR_TABLE, TIERS } = D;
  const LAST = CR_TABLE.length - 1;

  const clampIndex = (i) => Math.max(0, Math.min(LAST, i));
  const row = (i) => CR_TABLE[clampIndex(i)];

  function num(value, fallback = 0) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function tierById(id) {
    return TIERS.find((t) => t.id === id) || TIERS[0];
  }

  /* ---- Table lookups. Both ranges are contiguous, so scan ascending. ---- */

  function crIndexByHP(hp) {
    if (hp <= 0) return 0;
    for (let i = 0; i <= LAST; i++) if (hp <= CR_TABLE[i].hpMax) return i;
    return LAST;
  }

  function crIndexByDamage(dmg) {
    if (dmg <= 0) return 0;
    for (let i = 0; i <= LAST; i++) if (dmg <= CR_TABLE[i].dmgMax) return i;
    return LAST;
  }

  /* Snap an averaged CR value onto the nearest real rung.
     Iterating ascending with <= means an exact tie rounds UP, which is the
     safer direction to be wrong in when you are building an encounter. */
  function snapToRung(value) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= LAST; i++) {
      const dist = Math.abs(CR_TABLE[i].v - value);
      if (dist <= bestDist + 1e-9) { bestDist = dist; best = i; }
    }
    return best;
  }

  /* The expected AC / attack / DC for a CR. At CR 0 the table reads "<=13",
     so it is a ceiling: sitting under it is not a penalty, only exceeding it
     counts. Returning the actual value in that case yields a diff of 0. */
  function expectedStat(crIndex, key, actual) {
    const r = row(crIndex);
    return r.cap ? Math.min(actual, r[key]) : r[key];
  }

  /* "Adjust by 1 for every 2 points of difference."
     Math.trunc keeps this symmetric — a 1-point gap in either direction is
     worth 0 rungs. The original used Math.floor, so a 1-point DEFICIT
     silently cost a full CR while a 1-point surplus gave nothing. */
  function rungShift(actual, expected) {
    return Math.trunc((actual - expected) / 2);
  }

  /* ---- Effective stats ---- */

  function activeTraits(input) {
    const tier = tierById(input.tierId);
    const out = [];
    for (const trait of D.TRAITS) {
      if (!input.traits || !input.traits[trait.id]) continue;
      const gated = trait.lowLevel && !tier.lowLevel;
      const raw = input.traitValues && input.traitValues[trait.id];
      const value = num(raw, trait.value ? trait.value.def : 0);
      out.push({ trait, value, gated });
    }
    return out;
  }

  function computeEffectiveAC(input, tier, traits) {
    const parts = [];
    let ac = num(input.ac, 10);

    for (const { trait, value, gated } of traits) {
      if (gated || !trait.acActual) continue;
      const bonus = trait.acActual(value);
      if (!bonus) continue;
      ac += bonus;
      parts.push({ label: trait.name + ' (actual AC)', amount: bonus });
    }
    const actualAC = ac;

    if (input.flyAndRanged && tier.lowLevel) {
      ac += 2;
      parts.push({ label: 'Flying + ranged attacks', amount: 2 });
    }

    const saves = Math.max(0, Math.floor(num(input.saveProficiencies, 0)));
    if (saves >= 5) { ac += 4; parts.push({ label: saves + ' save proficiencies', amount: 4 }); }
    else if (saves >= 3) { ac += 2; parts.push({ label: saves + ' save proficiencies', amount: 2 }); }

    for (const { trait, gated } of traits) {
      if (gated || !trait.ac) continue;
      ac += trait.ac;
      parts.push({ label: trait.name, amount: trait.ac });
    }

    return { value: ac, actualAC, parts };
  }

  function computeEffectiveHP(input, tier, traits) {
    const parts = [];
    const baseHP = Math.max(1, Math.round(num(input.hp, 1)));

    /* Resistance / immunity multiplier, then trait multipliers stacked
       ADDITIVELY so that "double" plus "double" is triple, not quadruple.
       Compounding them balloons out of control fast. */
    let multiplier = 1;
    if (input.damageImmunity) {
      multiplier = tier.immune;
      parts.push({ label: 'Damage immunities', amount: 'x' + tier.immune });
    } else if (input.damageResistance) {
      multiplier = tier.resist;
      parts.push({ label: 'Damage resistances', amount: 'x' + tier.resist });
    }

    for (const { trait, value, gated } of traits) {
      if (gated || !trait.hpMultAdd) continue;
      const add = trait.hpMultAdd(value, tier);
      if (!add) continue;
      multiplier += add;
      parts.push({ label: trait.name, amount: '+' + Math.round(add * 100) + '%' });
    }

    let hp = Math.round(baseHP * multiplier);

    for (const { trait, value, gated } of traits) {
      if (gated || !trait.hpFlat) continue;
      const add = Math.round(trait.hpFlat(value, tier));
      if (!add) continue;
      hp += add;
      parts.push({ label: trait.name, amount: '+' + add + ' hp' });
    }

    return { value: Math.max(1, hp), baseHP, multiplier, parts };
  }

  function computeEffectiveAttack(input, traits) {
    const parts = [];
    let atk = num(input.attackBonus, 0);
    for (const { trait, gated } of traits) {
      if (gated || !trait.atk) continue;
      atk += trait.atk;
      parts.push({ label: trait.name, amount: trait.atk });
    }
    return { value: atk, parts };
  }

  /* Damage per round.

     The DMG averages the first three rounds of combat. The old calculator
     counted only rounds you typed a number into, so a monster that did
     nothing on round 2 had round 2 dropped from the divisor entirely and
     came out looking stronger than it is. Here the divisor is always the
     number of rounds being averaged, stated plainly in the UI. */
  function computeEffectiveDamage(input, traits) {
    const parts = [];
    const baseHP = Math.max(1, Math.round(num(input.hp, 1)));

    let perRound = 0;
    let burst = 0;
    for (const { trait, value, gated } of traits) {
      if (gated) continue;
      if (trait.dprAll) {
        const add = trait.dprAll(value);
        if (add) { perRound += add; parts.push({ label: trait.name, amount: '+' + round1(add) + '/round' }); }
      }
      if (trait.dprFromHp) {
        const add = Math.floor(baseHP * trait.dprFromHp);
        if (add) { perRound += add; parts.push({ label: trait.name + ' (HP/3)', amount: '+' + add + '/round' }); }
      }
      if (trait.dprOnce) {
        const add = trait.dprOnce(value);
        if (add) { burst += add; parts.push({ label: trait.name, amount: '+' + round1(add) + ' once' }); }
      }
    }

    let rounds;
    let baseTotal;
    if (input.damageMode === 'rounds') {
      rounds = Math.max(1, Math.min(6, Math.floor(num(input.roundCount, 3))));
      const list = (input.rounds || []).slice(0, rounds).map((d) => Math.max(0, num(d, 0)));
      while (list.length < rounds) list.push(0);
      baseTotal = list.reduce((a, b) => a + b, 0);
    } else {
      /* Flat mode still averages a burst across three rounds, because a
         monster with a one-off nova by definition varies round to round. */
      rounds = 3;
      baseTotal = Math.max(0, num(input.damagePerRound, 0)) * rounds;
    }

    const extra = Math.max(0, num(input.extraDamage, 0));
    if (extra) parts.push({ label: 'Off-turn / other damage', amount: '+' + round1(extra) + '/round' });

    const value = (baseTotal + burst) / rounds + perRound + extra;
    return { value: round1(value), rounds, burst, perRound: perRound + extra, parts };
  }

  const round1 = (n) => Math.round(n * 10) / 10;

  /* ---- Defensive / offensive / final CR ---- */

  function compute(input) {
    const tier = tierById(input.tierId);
    const traits = activeTraits(input);

    const ac = computeEffectiveAC(input, tier, traits);
    const hp = computeEffectiveHP(input, tier, traits);
    const attack = computeEffectiveAttack(input, traits);
    const damage = computeEffectiveDamage(input, traits);
    const saveDC = num(input.saveDC, 10);

    /* Defensive */
    const hpIndex = crIndexByHP(hp.value);
    const expectedAC = expectedStat(hpIndex, 'ac', ac.value);
    const acShift = rungShift(ac.value, expectedAC);
    const defIndex = clampIndex(hpIndex + acShift);

    /* Offensive */
    const dmgIndex = crIndexByDamage(damage.value);
    const expectedAtk = expectedStat(dmgIndex, 'atk', attack.value);
    const expectedDC = expectedStat(dmgIndex, 'dc', saveDC);
    const atkShift = rungShift(attack.value, expectedAtk);
    const dcShift = rungShift(saveDC, expectedDC);
    const byAttackIndex = clampIndex(dmgIndex + atkShift);
    const bySaveIndex = clampIndex(dmgIndex + dcShift);

    let offenseBy = input.offenseBy || 'auto';
    let offIndex;
    if (offenseBy === 'attack') offIndex = byAttackIndex;
    else if (offenseBy === 'save') offIndex = bySaveIndex;
    else {
      offIndex = Math.max(byAttackIndex, bySaveIndex);
      offenseBy = byAttackIndex >= bySaveIndex ? 'attack' : 'save';
    }

    /* Final CR: average the two CR VALUES, then snap to a real rung. */
    const defRow = row(defIndex);
    const offRow = row(offIndex);
    const average = (defRow.v + offRow.v) / 2;
    const finalIndex = snapToRung(average);
    const finalRow = row(finalIndex);

    const inTarget = finalRow.v >= tier.min && finalRow.v <= tier.max;

    return {
      tier,
      effective: {
        ac: ac.value, actualAC: ac.actualAC, acParts: ac.parts,
        hp: hp.value, hpBase: hp.baseHP, hpMultiplier: hp.multiplier, hpParts: hp.parts,
        attack: attack.value, attackParts: attack.parts,
        damage: damage.value, damageRounds: damage.rounds, damageParts: damage.parts,
        saveDC,
      },
      defensive: {
        hpIndex, hpRow: row(hpIndex), expectedAC, acShift,
        index: defIndex, row: defRow,
      },
      offensive: {
        dmgIndex, dmgRow: row(dmgIndex),
        expectedAtk, atkShift, byAttackIndex, byAttackRow: row(byAttackIndex),
        expectedDC, dcShift, bySaveIndex, bySaveRow: row(bySaveIndex),
        index: offIndex, row: offRow, offenseBy,
      },
      final: { index: finalIndex, row: finalRow, average, inTarget },
    };
  }

  /* Average hit points for N hit dice of a given size, plus CON per die. */
  function hitDiceAverage(avgPerDie, count, conMod) {
    const n = Math.max(1, Math.floor(num(count, 1)));
    return Math.max(1, Math.floor(n * num(avgPerDie, 4.5) + n * num(conMod, 0)));
  }

  return {
    CR_TABLE, TIERS,
    compute, tierById,
    crIndexByHP, crIndexByDamage, snapToRung, rungShift, expectedStat,
    hitDiceAverage, clampIndex, row,
  };
});
