/* ------------------------------------------------------------------
   data.js — Monster Statistics by Challenge Rating, target-CR tiers,
   and the full Monster Features catalogue (DMG p.273-283).

   Pure data. No DOM, no side effects.
   ------------------------------------------------------------------ */

/* Monster Statistics by Challenge Rating.
   `i` is the rung on the CR ladder — CR adjustments move by rungs, not by
   arithmetic, which is what keeps sub-CR-1 monsters sane.
   `cap: true` marks CR 0, where the table reads "<=13 AC / <=+3 atk / <=13 DC":
   those are ceilings, not targets, so being under them is not a penalty. */
const CR_TABLE = [
  { i:0,  cr:'0',   v:0,     xp:10,     xpLabel:'0-10', prof:2, ac:13, hpMin:1,   hpMax:6,   atk:3,  dmgMin:0,   dmgMax:1,   dc:13, cap:true },
  { i:1,  cr:'1/8', v:0.125, xp:25,     xpLabel:'25',   prof:2, ac:13, hpMin:7,   hpMax:35,  atk:3,  dmgMin:2,   dmgMax:3,   dc:13 },
  { i:2,  cr:'1/4', v:0.25,  xp:50,     xpLabel:'50',   prof:2, ac:13, hpMin:36,  hpMax:49,  atk:3,  dmgMin:4,   dmgMax:5,   dc:13 },
  { i:3,  cr:'1/2', v:0.5,   xp:100,    xpLabel:'100',  prof:2, ac:13, hpMin:50,  hpMax:70,  atk:3,  dmgMin:6,   dmgMax:8,   dc:13 },
  { i:4,  cr:'1',   v:1,     xp:200,    xpLabel:'200',  prof:2, ac:13, hpMin:71,  hpMax:85,  atk:3,  dmgMin:9,   dmgMax:14,  dc:13 },
  { i:5,  cr:'2',   v:2,     xp:450,    xpLabel:'450',  prof:2, ac:13, hpMin:86,  hpMax:100, atk:3,  dmgMin:15,  dmgMax:20,  dc:13 },
  { i:6,  cr:'3',   v:3,     xp:700,    xpLabel:'700',  prof:2, ac:13, hpMin:101, hpMax:115, atk:4,  dmgMin:21,  dmgMax:26,  dc:13 },
  { i:7,  cr:'4',   v:4,     xp:1100,   xpLabel:'1,100',prof:2, ac:14, hpMin:116, hpMax:130, atk:5,  dmgMin:27,  dmgMax:32,  dc:14 },
  { i:8,  cr:'5',   v:5,     xp:1800,   xpLabel:'1,800',prof:3, ac:15, hpMin:131, hpMax:145, atk:6,  dmgMin:33,  dmgMax:38,  dc:15 },
  { i:9,  cr:'6',   v:6,     xp:2300,   xpLabel:'2,300',prof:3, ac:15, hpMin:146, hpMax:160, atk:6,  dmgMin:39,  dmgMax:44,  dc:15 },
  { i:10, cr:'7',   v:7,     xp:2900,   xpLabel:'2,900',prof:3, ac:15, hpMin:161, hpMax:175, atk:6,  dmgMin:45,  dmgMax:50,  dc:15 },
  { i:11, cr:'8',   v:8,     xp:3900,   xpLabel:'3,900',prof:3, ac:16, hpMin:176, hpMax:190, atk:7,  dmgMin:51,  dmgMax:56,  dc:16 },
  { i:12, cr:'9',   v:9,     xp:5000,   xpLabel:'5,000',prof:4, ac:16, hpMin:191, hpMax:205, atk:7,  dmgMin:57,  dmgMax:62,  dc:16 },
  { i:13, cr:'10',  v:10,    xp:5900,   xpLabel:'5,900',prof:4, ac:17, hpMin:206, hpMax:220, atk:7,  dmgMin:63,  dmgMax:68,  dc:16 },
  { i:14, cr:'11',  v:11,    xp:7200,   xpLabel:'7,200',prof:4, ac:17, hpMin:221, hpMax:235, atk:8,  dmgMin:69,  dmgMax:74,  dc:17 },
  { i:15, cr:'12',  v:12,    xp:8400,   xpLabel:'8,400',prof:4, ac:17, hpMin:236, hpMax:250, atk:8,  dmgMin:75,  dmgMax:80,  dc:17 },
  { i:16, cr:'13',  v:13,    xp:10000,  xpLabel:'10,000',prof:5,ac:18, hpMin:251, hpMax:265, atk:8,  dmgMin:81,  dmgMax:86,  dc:18 },
  { i:17, cr:'14',  v:14,    xp:11500,  xpLabel:'11,500',prof:5,ac:18, hpMin:266, hpMax:280, atk:8,  dmgMin:87,  dmgMax:92,  dc:18 },
  { i:18, cr:'15',  v:15,    xp:13000,  xpLabel:'13,000',prof:5,ac:18, hpMin:281, hpMax:295, atk:8,  dmgMin:93,  dmgMax:98,  dc:18 },
  { i:19, cr:'16',  v:16,    xp:15000,  xpLabel:'15,000',prof:5,ac:18, hpMin:296, hpMax:310, atk:9,  dmgMin:99,  dmgMax:104, dc:18 },
  { i:20, cr:'17',  v:17,    xp:18000,  xpLabel:'18,000',prof:6,ac:19, hpMin:311, hpMax:325, atk:10, dmgMin:105, dmgMax:110, dc:19 },
  { i:21, cr:'18',  v:18,    xp:20000,  xpLabel:'20,000',prof:6,ac:19, hpMin:326, hpMax:340, atk:10, dmgMin:111, dmgMax:116, dc:19 },
  { i:22, cr:'19',  v:19,    xp:22000,  xpLabel:'22,000',prof:6,ac:19, hpMin:341, hpMax:355, atk:10, dmgMin:117, dmgMax:122, dc:19 },
  { i:23, cr:'20',  v:20,    xp:25000,  xpLabel:'25,000',prof:6,ac:19, hpMin:356, hpMax:400, atk:10, dmgMin:123, dmgMax:140, dc:19 },
  { i:24, cr:'21',  v:21,    xp:33000,  xpLabel:'33,000',prof:7,ac:19, hpMin:401, hpMax:445, atk:11, dmgMin:141, dmgMax:158, dc:20 },
  { i:25, cr:'22',  v:22,    xp:41000,  xpLabel:'41,000',prof:7,ac:19, hpMin:446, hpMax:490, atk:11, dmgMin:159, dmgMax:176, dc:20 },
  { i:26, cr:'23',  v:23,    xp:50000,  xpLabel:'50,000',prof:7,ac:19, hpMin:491, hpMax:535, atk:11, dmgMin:177, dmgMax:194, dc:20 },
  { i:27, cr:'24',  v:24,    xp:62000,  xpLabel:'62,000',prof:7,ac:19, hpMin:536, hpMax:580, atk:12, dmgMin:195, dmgMax:212, dc:21 },
  { i:28, cr:'25',  v:25,    xp:75000,  xpLabel:'75,000',prof:8,ac:19, hpMin:581, hpMax:625, atk:12, dmgMin:213, dmgMax:230, dc:21 },
  { i:29, cr:'26',  v:26,    xp:90000,  xpLabel:'90,000',prof:8,ac:19, hpMin:626, hpMax:670, atk:12, dmgMin:231, dmgMax:248, dc:21 },
  { i:30, cr:'27',  v:27,    xp:105000, xpLabel:'105,000',prof:8,ac:19,hpMin:671, hpMax:715, atk:13, dmgMin:249, dmgMax:266, dc:22 },
  { i:31, cr:'28',  v:28,    xp:120000, xpLabel:'120,000',prof:8,ac:19,hpMin:716, hpMax:760, atk:13, dmgMin:267, dmgMax:284, dc:22 },
  { i:32, cr:'29',  v:29,    xp:135000, xpLabel:'135,000',prof:9,ac:19,hpMin:761, hpMax:805, atk:13, dmgMin:285, dmgMax:302, dc:22 },
  { i:33, cr:'30',  v:30,    xp:155000, xpLabel:'155,000',prof:9,ac:19,hpMin:806, hpMax:850, atk:14, dmgMin:303, dmgMax:320, dc:23 },
];

/* Target CR tiers. Several features scale with the CR band you are aiming
   for, so this drives resistance multipliers, the Undead Fortitude and
   Relentless value, and the two "level 10 or lower" gates. */
const TIERS = [
  { id:'0-4',   label:'CR 0-4',   min:0,  max:4,        resist:2,    immune:2,    fortHP:7,  lowLevel:true  },
  { id:'5-10',  label:'CR 5-10',  min:5,  max:10,       resist:1.5,  immune:2,    fortHP:14, lowLevel:true  },
  { id:'11-16', label:'CR 11-16', min:11, max:16,       resist:1.25, immune:1.5,  fortHP:21, lowLevel:false },
  { id:'17+',   label:'CR 17+',   min:17, max:Infinity, resist:1,    immune:1.25, fortHP:28, lowLevel:false },
];

/* Hit Dice by Size — powers the HP helper. */
const HIT_DICE = [
  { size:'Tiny',       die:'d4',  avg:2.5  },
  { size:'Small',      die:'d6',  avg:3.5  },
  { size:'Medium',     die:'d8',  avg:4.5  },
  { size:'Large',      die:'d10', avg:5.5  },
  { size:'Huge',       die:'d12', avg:6.5  },
  { size:'Gargantuan', die:'d20', avg:10.5 },
];

/* ------------------------------------------------------------------
   Monster Features.

   Every entry carries BOTH halves of what a tooltip needs:
     desc   - what the feature actually does at the table
     effect - what it does to the challenge rating

   Math hooks (all optional):
     ac          flat bonus to effective AC
     atk         flat bonus to effective attack bonus
     acActual    fn(v) -> bonus applied to the monster's ACTUAL AC
     hpFlat      fn(v, tier) -> flat effective HP added
     hpMultAdd   fn(v, tier) -> added to the HP multiplier (additive, not compounding)
     dprAll      fn(v) -> damage added to EVERY round
     dprOnce     fn(v) -> damage added to a SINGLE round, then averaged
     dprFromHp   fraction of actual HP added to every round
     value       { label, def, min, max } -> renders a number input
     lowLevel    true = only applies when the target tier is CR 10 or lower
   ------------------------------------------------------------------ */
const TRAITS = [
  /* ---- Effective AC ---- */
  {
    id:'avoidance', name:'Avoidance', example:'Demilich', group:'ac', ac:1,
    desc:'If the creature is subjected to an effect that allows it to make a saving throw to take only half damage, it instead takes no damage on a success, and only half damage on a failure.',
    effect:'+1 effective AC.',
  },
  {
    id:'constrict', name:'Constrict', example:'Constrictor snake', group:'ac', ac:1,
    desc:'A melee attack that grapples the target on a hit. Until the grapple ends the target is restrained, and the creature cannot constrict another target.',
    effect:'+1 effective AC.',
  },
  {
    id:'magicResistance', name:'Magic Resistance', example:'Balor', group:'ac', ac:2,
    desc:'The creature has advantage on saving throws against spells and other magical effects.',
    effect:'+2 effective AC.',
  },
  {
    id:'parry', name:'Parry', example:'Hobgoblin warlord', group:'ac', ac:1,
    desc:'Reaction. The creature adds a bonus to its AC against one melee attack that would hit it. It must see the attacker and be wielding a melee weapon.',
    effect:'+1 effective AC.',
  },
  {
    id:'shadowStealth', name:'Shadow Stealth', example:'Shadow demon', group:'ac', ac:4,
    desc:'While in dim light or darkness, the creature can take the Hide action as a bonus action.',
    effect:'+4 effective AC. Assumes the creature manages to hide every round.',
  },
  {
    id:'stench', name:'Stench', example:'Troglodyte', group:'ac', ac:1,
    desc:'Any creature that starts its turn within 5 feet must succeed on a Constitution save or be poisoned until the start of its next turn. On a success it is immune to that stench for 1 hour.',
    effect:'+1 effective AC.',
  },
  {
    id:'superiorInvisibility', name:'Superior Invisibility', example:'Faerie dragon', group:'ac', ac:2,
    desc:'As a bonus action the creature magically turns invisible until its concentration ends, along with anything it is wearing or carrying.',
    effect:'+2 effective AC.',
  },
  {
    id:'web', name:'Web', example:'Giant spider', group:'ac', ac:1,
    desc:'A ranged attack that restrains the target in webbing. The target can escape with a Strength check; the webbing can also be attacked and destroyed.',
    effect:'+1 effective AC.',
  },
  {
    id:'nimbleEscape', name:'Nimble Escape', example:'Goblin', group:'ac', ac:4, atk:4,
    desc:'The creature can take the Disengage or Hide action as a bonus action on each of its turns.',
    effect:'+4 effective AC and +4 effective attack bonus. Assumes it hides every round.',
  },
  {
    id:'fiendishBlessing', name:'Fiendish Blessing', example:'Cambion', group:'ac',
    value:{ label:'CHA mod', def:3, min:-5, max:10 },
    acActual:(v) => v,
    desc:'The creature adds its Charisma modifier to its Armor Class.',
    effect:'Applies to ACTUAL AC, not just effective AC — write the boosted number into the stat block.',
  },
  {
    id:'psychicDefense', name:'Psychic Defense', example:'Githzerai monk', group:'ac',
    value:{ label:'WIS mod', def:3, min:-5, max:10 },
    acActual:(v) => v,
    desc:'While wearing no armor and wielding no shield, the creature adds its Wisdom modifier to its Armor Class.',
    effect:'Applies to ACTUAL AC, not just effective AC — write the boosted number into the stat block.',
  },

  /* ---- Effective attack bonus ---- */
  {
    id:'ambusher', name:'Ambusher', example:'Doppelganger', group:'atk', atk:1,
    desc:'In the first round of combat, the creature has advantage on attack rolls against any creature it surprised.',
    effect:'+1 effective attack bonus.',
  },
  {
    id:'bloodFrenzy', name:'Blood Frenzy', example:'Sahuagin', group:'atk', atk:4,
    desc:'The creature has advantage on melee attack rolls against any creature that does not have all of its hit points.',
    effect:'+4 effective attack bonus.',
  },
  {
    id:'packTactics', name:'Pack Tactics', example:'Kobold', group:'atk', atk:1,
    desc:'The creature has advantage on an attack roll against a creature if at least one of its allies is within 5 feet of that creature and the ally is not incapacitated.',
    effect:'+1 effective attack bonus.',
  },

  /* ---- Effective HP ---- */
  {
    id:'regeneration', name:'Regeneration', example:'Troll', group:'hp',
    value:{ label:'HP/round', def:10, min:1, max:100 },
    hpFlat:(v) => v * 3,
    desc:'The creature regains hit points at the start of each of its turns. Usually a specific damage type (acid or fire for a troll) shuts the trait off until the end of its next turn.',
    effect:'+3x the hit points regained each round, as effective HP.',
  },
  {
    id:'relentless', name:'Relentless', example:'Wereboar', group:'hp',
    hpFlat:(v, tier) => tier.fortHP,
    desc:'If the creature takes damage that would reduce it to 0 hit points, it drops to 1 hit point instead. Recharges after a short or long rest.',
    effect:'+7 / 14 / 21 / 28 effective HP, scaling with the target CR tier.',
  },
  {
    id:'undeadFortitude', name:'Undead Fortitude', example:'Zombie', group:'hp',
    hpFlat:(v, tier) => tier.fortHP,
    desc:'When damage would reduce the creature to 0 hit points, it makes a Constitution save of DC 5 + the damage taken. On a success it drops to 1 hit point instead. Radiant damage and critical hits bypass this.',
    effect:'+7 / 14 / 21 / 28 effective HP, scaling with the target CR tier.',
  },
  {
    id:'frightfulPresence', name:'Frightful Presence', example:'Ancient black dragon', group:'hp',
    lowLevel:true, hpMultAdd:() => 0.25,
    desc:'Each creature of the monster\'s choice within range and aware of it must succeed on a Wisdom save or be frightened for 1 minute, repeating the save at the end of each of its turns.',
    effect:'+25% effective HP, but only when the target CR is 10 or lower — higher-level parties shrug off fear.',
  },
  {
    id:'horrifyingVisage', name:'Horrifying Visage', example:'Banshee', group:'hp',
    lowLevel:true, hpMultAdd:() => 0.25,
    desc:'Each non-undead creature that can see the monster must succeed on a Wisdom save or be frightened. A creature that fails badly may also age. A successful save grants immunity for 24 hours.',
    effect:'Same as Frightful Presence: +25% effective HP when the target CR is 10 or lower. The two do not stack.',
  },
  {
    id:'possession', name:'Possession', example:'Ghost', group:'hp',
    hpMultAdd:() => 1,
    desc:'The creature attempts to possess a humanoid it can see. On a failed Charisma save the target is possessed; the monster disappears into the body and controls it, and cannot be targeted by most effects while inside.',
    effect:'Doubles effective HP.',
  },
  {
    id:'damageTransfer', name:'Damage Transfer', example:'Cloaker', group:'hp',
    hpMultAdd:() => 1, dprFromHp:1/3,
    desc:'While attached to a creature, the monster takes only half the damage dealt to it, and the creature it is attached to takes the other half.',
    effect:'Doubles effective HP, and adds one third of actual HP to effective damage per round.',
  },

  /* ---- Effective damage, every round ---- */
  {
    id:'aggressive', name:'Aggressive', example:'Orc', group:'dmg', dprAll:() => 2,
    desc:'As a bonus action, the creature can move up to its speed toward a hostile creature it can see.',
    effect:'+2 effective damage per round.',
  },
  {
    id:'rampage', name:'Rampage', example:'Gnoll', group:'dmg', dprAll:() => 2,
    desc:'When the creature reduces a target to 0 hit points with a melee attack on its turn, it can use a bonus action to move up to half its speed and make a bite attack.',
    effect:'+2 effective damage per round.',
  },
  {
    id:'angelicWeapons', name:'Angelic Weapons', example:'Deva', group:'dmg',
    value:{ label:'extra dmg', def:18, min:0, max:200 }, dprAll:(v) => v,
    desc:'The creature\'s weapon attacks are magical, and deal significant extra radiant damage on a hit.',
    effect:'+the extra damage noted in the trait, to effective damage per round.',
  },
  {
    id:'brute', name:'Brute', example:'Bugbear', group:'dmg',
    value:{ label:'extra dmg', def:5, min:0, max:200 }, dprAll:(v) => v,
    desc:'A melee weapon deals one extra die of its damage when the creature hits with it.',
    effect:'+the extra damage noted in the trait, to effective damage per round.',
  },
  {
    id:'elementalBody', name:'Elemental Body', example:'Azer', group:'dmg',
    value:{ label:'extra dmg', def:5, min:0, max:200 }, dprAll:(v) => v,
    desc:'The creature is wreathed in elemental energy. Anything that touches it or hits it with a melee attack takes damage, and its own weapon attacks deal extra elemental damage.',
    effect:'+the extra damage noted in the trait, to effective damage per round.',
  },
  {
    id:'enlarge', name:'Enlarge', example:'Duergar', group:'dmg',
    value:{ label:'extra dmg', def:4, min:0, max:200 }, dprAll:(v) => v,
    desc:'The creature magically doubles in size for a short time. While enlarged it is one size larger, doubles its damage dice on Strength-based weapon attacks, and has advantage on Strength checks and saves.',
    effect:'+the extra damage noted in the trait, to effective damage per round.',
  },
  {
    id:'martialAdvantage', name:'Martial Advantage', example:'Hobgoblin', group:'dmg',
    value:{ label:'extra dmg', def:7, min:0, max:200 }, dprAll:(v) => v,
    desc:'Once per turn, the creature deals extra damage to a target it hits with a weapon attack if that target is within 5 feet of an ally of the creature that is not incapacitated.',
    effect:'+the extra damage of one attack per round, to effective damage per round.',
  },

  /* ---- Effective damage, one round (averaged across the fight) ---- */
  {
    id:'breathWeapon', name:'Breath Weapon', example:'Ancient black dragon', group:'burst',
    value:{ label:'dmg/target', def:63, min:0, max:400 }, dprOnce:(v) => v * 2,
    desc:'The creature exhales destructive energy in a cone or line. Creatures in the area make a saving throw, taking full damage on a failure and half on a success. Usually recharges on a 5-6.',
    effect:'Counted as hitting two targets who both fail their saves, in a single round.',
  },
  {
    id:'charge', name:'Charge', example:'Centaur', group:'burst',
    value:{ label:'extra dmg', def:10, min:0, max:200 }, dprOnce:(v) => v,
    desc:'If the creature moves at least a set distance straight toward a target and then hits it with a melee attack on the same turn, the target takes extra damage and may be knocked prone.',
    effect:'+the extra damage noted in the trait, on one attack in one round.',
  },
  {
    id:'dive', name:'Dive', example:'Aarakocra', group:'burst',
    value:{ label:'extra dmg', def:3, min:0, max:200 }, dprOnce:(v) => v,
    desc:'If the creature is flying and dives at least a set distance straight toward a target and then hits it with a melee attack, the attack deals extra damage.',
    effect:'+the extra damage noted in the trait, on one attack in one round.',
  },
  {
    id:'deathBurst', name:'Death Burst', example:'Magmin', group:'burst',
    value:{ label:'dmg/target', def:7, min:0, max:200 }, dprOnce:(v) => v * 2,
    desc:'When the creature dies it explodes. Each creature within range makes a saving throw, taking damage on a failure and half as much on a success.',
    effect:'Counted as affecting two creatures, in a single round.',
  },
  {
    id:'pounce', name:'Pounce', example:'Tiger', group:'burst',
    value:{ label:'bonus dmg', def:8, min:0, max:200 }, dprOnce:(v) => v,
    desc:'If the creature moves at least a set distance straight toward a target and hits it with a claw attack, the target must save or be knocked prone. If the target is prone, the creature can make one bite attack against it as a bonus action.',
    effect:'+the damage of the bonus-action attack, in a single round.',
  },
  {
    id:'surpriseAttack', name:'Surprise Attack', example:'Bugbear', group:'burst',
    value:{ label:'extra dmg', def:7, min:0, max:200 }, dprOnce:(v) => v,
    desc:'If the creature surprises a target and hits it during the first round of combat, the attack deals extra damage.',
    effect:'+the extra damage noted in the trait, in a single round.',
  },
  {
    id:'woundedFury', name:'Wounded Fury', example:'Quaggoth', group:'burst',
    value:{ label:'extra dmg', def:7, min:0, max:200 }, dprOnce:(v) => v,
    desc:'While at low hit points, the creature has advantage on attack rolls and deals extra damage on melee hits.',
    effect:'+the extra damage noted in the trait, in a single round.',
  },
  {
    id:'swallow', name:'Swallow', example:'Behir', group:'burst',
    value:{ label:'dmg/round', def:21, min:0, max:200 }, dprOnce:(v) => v * 2,
    desc:'The creature swallows a target it is grappling. The target is blinded and restrained inside, has total cover from outside, and takes damage at the start of each of the creature\'s turns.',
    effect:'Counted as swallowing one creature and dealing two rounds of damage to it.',
  },
];

/* Statistics rather than traits, but they live in the same checklist so that
   everything affecting the CR is in one place. Bracketed like the original. */
const STAT_TRAITS = [
  {
    id:'damageResistance', name:'[Damage Resistance(s)]',
    desc:'The creature takes half damage from one or more damage types. Only tick this when the party cannot readily bypass it — resistance to nonmagical bludgeoning, piercing and slashing is the usual case.',
    effect:'Multiplies effective HP: x2 at CR 0-4, x1.5 at 5-10, x1.25 at 11-16, x1 at 17+. Actual HP does not change.',
  },
  {
    id:'damageImmunity', name:'[Damage Immunity(ies)]',
    desc:'The creature ignores one or more damage types entirely. As with resistances, only count it when the party cannot easily work around it.',
    effect:'Multiplies effective HP: x2 at CR 0-4, x2 at 5-10, x1.5 at 11-16, x1.25 at 17+. Takes precedence over resistances.',
  },
  {
    id:'flyAndRanged', name:'[Fly Speed And Ranged Attack(s)]', lowLevel:true,
    desc:'The creature can stay airborne and still deal damage at range, which a low-level party often has no reliable way to answer.',
    effect:'+2 effective AC, but only when the target CR is 10 or lower. Higher-level characters have the tools to deal with fliers.',
  },
  {
    id:'saveProficiencies', name:'[Save Proficiencies]',
    value:{ label:'count', def:3, min:0, max:6 },
    desc:'The number of saving throws the creature is proficient in, adding its proficiency bonus to each. Best used to shore up an ability it is otherwise poor at.',
    effect:'Three or four proficiencies give +2 effective AC. Five or more give +4. Fewer than three make no difference.',
  },
];

/* Features from the DMG table that explicitly have no bearing on CR.
   Listed so the answer to "what about X?" is visible instead of missing. */
const NO_EFFECT_TRAITS = [
  { name:'Amorphous', example:'Black pudding', desc:'The creature can move through a space as narrow as 1 inch wide without squeezing.' },
  { name:'Amphibious', example:'Kuo-toa', desc:'The creature can breathe both air and water.' },
  { name:'Antimagic Susceptibility', example:'Flying sword', desc:'The creature is incapacitated in an antimagic field, and must save against dispel magic or fall unconscious.' },
  { name:'Blind Senses', example:'Grimlock', desc:'The creature cannot use its blindsight while deafened and unable to smell.' },
  { name:'Chameleon Skin', example:'Troglodyte', desc:'The creature has advantage on Stealth checks made to hide.' },
  { name:'Change Shape', example:'Ancient brass dragon', desc:'The creature magically polymorphs into a humanoid or beast, keeping its own statistics apart from size and speed.' },
  { name:'Charm', example:'Vampire', desc:'The creature charms a target that fails a Wisdom save, making it a willing servant until the charm is broken.' },
  { name:'Damage Absorption', example:'Flesh golem', desc:'The creature is healed rather than harmed by a particular damage type.' },
  { name:'Devil\'s Sight', example:'Barbed devil', desc:'Magical darkness does not impede the creature\'s darkvision.' },
  { name:'Echolocation', example:'Hook horror', desc:'The creature cannot use its blindsight while deafened.' },
  { name:'Etherealness', example:'Night hag', desc:'The creature can magically enter the Ethereal Plane from the Material Plane, and vice versa.' },
  { name:'False Appearance', example:'Gargoyle', desc:'While motionless, the creature is indistinguishable from an ordinary object.' },
  { name:'Fey Ancestry', example:'Drow', desc:'The creature has advantage on saves against being charmed, and magic cannot put it to sleep.' },
  { name:'Flyby', example:'Peryton', desc:'The creature does not provoke opportunity attacks when it flies out of an enemy\'s reach.' },
  { name:'Grappler', example:'Mimic', desc:'The creature has advantage on attacks against any creature it is grappling.' },
  { name:'Hold Breath', example:'Lizardfolk', desc:'The creature can hold its breath for an extended time.' },
  { name:'Illumination', example:'Flameskull', desc:'The creature sheds bright light in a radius around it.' },
  { name:'Illusory Appearance', example:'Green hag', desc:'The creature magically disguises itself; the illusion fails against physical inspection or a successful Investigation check.' },
  { name:'Immutable Form', example:'Iron golem', desc:'The creature is immune to any spell or effect that would alter its form.' },
  { name:'Incorporeal Movement', example:'Ghost', desc:'The creature can move through other creatures and objects as difficult terrain, taking damage if it ends its turn inside one.' },
  { name:'Inscrutable', example:'Androsphinx', desc:'The creature is immune to any effect that would sense its emotions or read its thoughts, and divination magic can only reveal what it allows.' },
  { name:'Invisibility', example:'Imp', desc:'The creature magically turns invisible until it attacks or until its concentration ends.' },
  { name:'Keen Senses', example:'Hell hound', desc:'The creature has advantage on Perception checks relying on a particular sense.' },
  { name:'Labyrinthine Recall', example:'Minotaur', desc:'The creature can perfectly recall any path it has ever walked.' },
  { name:'Leadership', example:'Hobgoblin captain', desc:'For 1 minute, the creature can grant an ally within range a bonus die on attack rolls or saves.' },
  { name:'Legendary Resistance', example:'Ancient black dragon', desc:'If the creature fails a saving throw, it can choose to succeed instead, a set number of times per day.' },
  { name:'Life Drain', example:'Wight', desc:'An attack that reduces the target\'s hit point maximum by the damage dealt until it finishes a long rest.' },
  { name:'Light Sensitivity', example:'Shadow demon', desc:'While in bright light, the creature has disadvantage on attack rolls and on Perception checks relying on sight.' },
  { name:'Magic Weapons', example:'Balor', desc:'The creature\'s weapon attacks are magical.' },
  { name:'Mimicry', example:'Kenku', desc:'The creature can mimic sounds and voices it has heard; a successful Insight check reveals the imitation.' },
  { name:'Otherworldly Perception', example:'Kuo-toa', desc:'The creature can sense the presence of any invisible or ethereal creature nearby.' },
  { name:'Reactive', example:'Marilith', desc:'The creature can take one reaction on every turn in a combat, not just its own.' },
  { name:'Read Thoughts', example:'Doppelganger', desc:'The creature magically reads the surface thoughts of a creature within range, gaining advantage on social checks against it.' },
  { name:'Reckless', example:'Minotaur', desc:'At the start of its turn the creature can gain advantage on all its melee attacks, at the cost of attacks against it having advantage too.' },
  { name:'Redirect Attack', example:'Goblin boss', desc:'Reaction. When an attack would hit the creature, it swaps places with a nearby ally so the ally is hit instead.' },
  { name:'Reel', example:'Roper', desc:'The creature pulls a creature it has grappled toward itself.' },
  { name:'Rejuvenation', example:'Lich', desc:'A destroyed creature re-forms after a period of time so long as its anchor survives.' },
  { name:'Shapechanger', example:'Wererat', desc:'The creature can shift between forms; its statistics are otherwise unchanged, and it reverts on death.' },
  { name:'Siege Monster', example:'Earth elemental', desc:'The creature deals double damage to objects and structures.' },
  { name:'Slippery', example:'Kuo-toa', desc:'The creature has advantage on ability checks and saves made to escape a grapple.' },
  { name:'Spider Climb', example:'Ettercap', desc:'The creature can climb difficult surfaces, including upside down on ceilings, without an ability check.' },
  { name:'Standing Leap', example:'Bullywug', desc:'The creature\'s long and high jumps are far longer than normal, with or without a running start.' },
  { name:'Steadfast', example:'Bearded devil', desc:'The creature cannot be frightened while it can see an allied creature nearby.' },
  { name:'Sunlight Sensitivity', example:'Kobold', desc:'While in sunlight, the creature has disadvantage on attack rolls and on Perception checks relying on sight.' },
  { name:'Sure-Footed', example:'Dao', desc:'The creature has advantage on Strength and Dexterity saves against effects that would knock it prone.' },
  { name:'Teleport', example:'Balor', desc:'The creature magically teleports itself, and anything it carries, to an unoccupied space it can see.' },
  { name:'Terrain Camouflage', example:'Bullywug', desc:'The creature has advantage on Stealth checks made to hide in its native terrain.' },
  { name:'Tunneler', example:'Umber hulk', desc:'The creature can burrow through solid rock, leaving a usable tunnel behind it.' },
  { name:'Turn Immunity', example:'Revenant', desc:'The creature is immune to effects that turn undead.' },
  { name:'Turn Resistance', example:'Lich', desc:'The creature has advantage on saves against effects that turn undead.' },
  { name:'Two Heads', example:'Ettin', desc:'The creature has advantage on Perception checks and on saves against being blinded, charmed, deafened, frightened, stunned, or knocked unconscious.' },
  { name:'Web Sense', example:'Giant spider', desc:'While in contact with a web, the creature knows the exact location of anything else touching that web.' },
  { name:'Web Walker', example:'Giant spider', desc:'The creature ignores movement restrictions caused by webbing.' },
];

/* Spellcasting is a judgement call rather than a fixed modifier. */
const SPELLCASTING_NOTE = {
  name:'Innate Spellcasting / Spellcasting',
  desc:'The creature casts spells, either innately a set number of times per day or as a full spellcaster with slots.',
  effect:'No fixed modifier. Judge it by hand: if a spell out-damages the creature\'s normal attack routine, use that damage in the damage-per-round field. If a spell raises its AC or hit points, raise the AC or HP field instead.',
};

/* Top-level `const` in a classic script lands in the global lexical scope,
   NOT on `window`, so the other files could not see any of this. Attach it
   explicitly. */
(function (root) {
  const api = { CR_TABLE, TIERS, HIT_DICE, TRAITS, STAT_TRAITS, NO_EFFECT_TRAITS, SPELLCASTING_NOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
