// Drop-in replacements for ns.formulas.hacking.
// These are directly copied from the source. Current as of 8e0e0ea (2022-12-01)
// Useful if you're poor/early-game.

/**
 * @param {number} intelligence
 * @param {number} weight
 * @return {number}
 */
function calculateIntelligenceBonus(intelligence, weight = 1) {
  return 1 + (weight * Math.pow(intelligence, 0.8)) / 600;
}

/**
 * @param {Server} server
 * @param {Person} person
 * @return {number}
 */
export function hackChance(server, person) {
  const hackFactor = 1.75;
  const difficultyMult = (100 - server.hackDifficulty) / 100;
  const skillMult = hackFactor * person.skills.hacking;
  const skillChance = (skillMult - server.requiredHackingSkill) / skillMult;
  const chance =
    skillChance *
    difficultyMult *
    person.mults.hacking_chance *
    calculateIntelligenceBonus(person.skills.intelligence, 1);
  if (chance > 1) {
    return 1;
  }
  if (chance < 0) {
    return 0;
  }

  return chance;
}

/**
 * @param {Server} server
 * @param {Person} player
 * @param {BitNodeMultipliers} bitNodeMultipliers
 * @return {number}
 */
export function hackExp(server, person, bitNodeMultipliers = null) {
  bitNodeMultipliers ??= { HackExpGain: 1 };

  const baseExpGain = 3;
  const diffFactor = 0.3;
  if (server.baseDifficulty == null) {
    server.baseDifficulty = server.hackDifficulty;
  }
  let expGain = baseExpGain;
  expGain += server.baseDifficulty * diffFactor;

  return expGain * person.mults.hacking_exp * bitNodeMultipliers.HackExpGain;
}

/**
 * @param {Server} server
 * @param {Person} person
 * @param {BitNodeMultipliers} bitNodeMultipliers
 * @return {number}
 */
export function hackPercent(server, person, bitNodeMultipliers = null) {
  bitNodeMultipliers ??= { ScriptHackMoney: 1 };

  // Adjust if needed for balancing. This is the divisor for the final calculation
  const balanceFactor = 240;

  const difficultyMult = (100 - server.hackDifficulty) / 100;
  const skillMult =
    (person.skills.hacking - (server.requiredHackingSkill - 1)) /
    person.skills.hacking;
  const percentMoneyHacked =
    (difficultyMult *
      skillMult *
      person.mults.hacking_money *
      bitNodeMultipliers.ScriptHackMoney) /
    balanceFactor;
  if (percentMoneyHacked < 0) {
    return 0;
  }
  if (percentMoneyHacked > 1) {
    return 1;
  }

  return percentMoneyHacked;
}

const CONSTANTS = {
  ServerBaseGrowthRate: 1.03,
  ServerMaxGrowthRate: 1.0035,
};

/**
 * @param {Server} server
 * @param {Person} p
 * @param {number} cores
 * @param {BitNodeMultipliers} bitNodeMultipliers
 * @return {number}
 */
export function growPercent(
  server,
  threads,
  p,
  cores = 1,
  bitNodeMultipliers = null
) {
  bitNodeMultipliers ??= { ServerGrowthRate: 1 };

  const numServerGrowthCycles = Math.max(Math.floor(threads), 0);

  //Get adjusted growth rate, which accounts for server security
  const growthRate = CONSTANTS.ServerBaseGrowthRate;
  let adjGrowthRate = 1 + (growthRate - 1) / server.hackDifficulty;
  if (adjGrowthRate > CONSTANTS.ServerMaxGrowthRate) {
    adjGrowthRate = CONSTANTS.ServerMaxGrowthRate;
  }

  //Calculate adjusted server growth rate based on parameters
  const serverGrowthPercentage = server.serverGrowth / 100;
  const numServerGrowthCyclesAdjusted =
    numServerGrowthCycles *
    serverGrowthPercentage *
    bitNodeMultipliers.ServerGrowthRate;

  //Apply serverGrowth for the calculated number of growth cycles
  const coreBonus = 1 + (cores - 1) / 16;
  return Math.pow(
    adjGrowthRate,
    numServerGrowthCyclesAdjusted * p.mults.hacking_grow * coreBonus
  );
}

/**
 * @param {Server} server
 * @param {Person} person
 * @return {number}
 */
export function hackTime(server, person) {
  const difficultyMult = server.requiredHackingSkill * server.hackDifficulty;

  const baseDiff = 500;
  const baseSkill = 50;
  const diffFactor = 2.5;
  let skillFactor = diffFactor * difficultyMult + baseDiff;
  // tslint:disable-next-line
  skillFactor /= person.skills.hacking + baseSkill;

  const hackTimeMultiplier = 5;
  const hackingTime =
    (hackTimeMultiplier * skillFactor) /
    (person.mults.hacking_speed *
      calculateIntelligenceBonus(person.skills.intelligence, 1));

  return hackingTime;
}

/**
 * @param {Server} server
 * @param {Person} person
 * @return {number}
 */
export function growTime(server, person) {
  const growTimeMultiplier = 3.2; // Relative to hacking time. 16/5 = 3.2

  return growTimeMultiplier * hackTime(server, person);
}

/**
 * @param {Server} server
 * @param {Person} person
 * @return {number}
 */
export function weakenTime(server, person) {
  const weakenTimeMultiplier = 4; // Relative to hacking time

  return weakenTimeMultiplier * hackTime(server, person);
}
