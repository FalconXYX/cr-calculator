import type { CrRow, Tier } from './types.ts';

/* Monster Statistics by Challenge Rating.
   `i` is the rung on the CR ladder — CR adjustments move by rungs, not by
   arithmetic, which is what keeps sub-CR-1 monsters sane.
   `cap: true` marks CR 0, where the table reads "<=13 AC / <=+3 atk / <=13 DC":
   those are ceilings, not targets, so being under them is not a penalty. */
export const CR_TABLE: CrRow[] = [
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
export const TIERS: Tier[] = [
  { id:'0-4',   label:'CR 0-4',   min:0,  max:4,        resist:2,    immune:2,    fortHP:7,  lowLevel:true  },
  { id:'5-10',  label:'CR 5-10',  min:5,  max:10,       resist:1.5,  immune:2,    fortHP:14, lowLevel:true  },
  { id:'11-16', label:'CR 11-16', min:11, max:16,       resist:1.25, immune:1.5,  fortHP:21, lowLevel:false },
  { id:'17+',   label:'CR 17+',   min:17, max:Infinity, resist:1,    immune:1.25, fortHP:28, lowLevel:false },
];
