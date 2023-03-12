import {
  ServerEntry,
  scanOnly,
  ramDepsScanOnly,
  ramDepsHackStats,
} from "lib/scan.js";

// Analyze server(s) for hack profitability.
// This returns the theoretical maximum profitability, in terms of Dollars/(GB ram * seconds).
// The actual profitability will be less, depending on how your hacking scripts work.

/**
 * @param {ServerEntry} entry
 * @returns Object including profit
 */
export function getProfitability(ns, entry, person) {
  const s = entry.server;
  const hackPercent_ = entry.hackPercent_(ns, person);
  const hackTime_ = entry.hackTime_(person);
  const hackChance_ = entry.hackChance_(person);
  const growthBase = entry.growthBase();
  // Number of grows/weakens required per hack. This assumes full coverage even when hackPercent is < 1.
  // (This assumption is not strictly optimal, but is how most practical scripts work.)
  const growPerHack = -Math.log(1 - hackPercent_) / growthBase;
  const weakenPerHack = ((1 + 2 * growPerHack) * 0.002) / 0.05;
  // Fraction of total RAM timeshare spent on hacking.
  const hackingFraction =
    1.7 / (1.7 + 1.75 * 3.2 * growPerHack + 1.75 * 4 * weakenPerHack);
  // Amount of money/hack, if doing the theoretical optimum of 1 hack at a time.
  const hackMoney = hackPercent_ * s.moneyMax;

  const profit =
    (hackingFraction * hackChance_ * hackMoney) / (hackTime_ * 1.7);
  return {
    hackChance_,
    hackPercent_,
    hackTime_,
    growthBase,
    growPerHack,
    weakenPerHack,
    hackingFraction,
    hackMoney,
    profit,
  };
}

/**
 * @param {NS} ns
 * @param {Object.<string, ServerEntry>} allServerData
 * @param {string} host
 *
 * We take allServerData as an option because there are alternate
 * ways of getting the values that don't increase the RAM of the calling script.
 */
export function analyzeHost(ns, allServerData, person, host) {
  const entry = allServerData[host];
  const s = entry.server;
  const p = getProfitability(ns, entry, person);
  const grow1 = Math.ceil(entry.numCycleForGrowthCorrected(0.99));
  const grow99 = Math.ceil(entry.numCycleForGrowthCorrected(0.01));
  const grow100 = Math.ceil(entry.numCycleForGrowthCorrected(0));
  ns.tprintf("Analysis of %s:", s.hostname);
  ns.tprintf("Max Money:             %15d", s.moneyMax);
  ns.tprintf("Hacking Skill Required:%15d", s.requiredHackingSkill);
  ns.tprintf("Min Security Level:    %15d", s.minDifficulty);
  ns.tprintf("Server Growth Rate:    %15d", s.serverGrowth);
  ns.tprintf("  1%% grow threads:     %15d", grow1);
  ns.tprintf(" 99%% grow threads:     %15d", grow99);
  ns.tprintf("100%% grow threads:     %15d", grow100);
  ns.tprintf("Hacking time (sec)     %15.3f", p.hackTime_);
  ns.tprintf("Hacking Chance:        %15.2f%%", p.hackChance_ * 100);
  ns.tprintf("Money per Hack Success:%15.0f", p.hackMoney);
  ns.tprintf("Growth per Grow:       %15.6fx", Math.exp(p.growthBase));
  ns.tprintf("Grows needed/Hack:     %15.3f", p.growPerHack);
  ns.tprintf("Weakens needed/Hack:   %15.3f", p.weakenPerHack);
  ns.tprintf("Hack RAM timeshare:    %15.2f%%", p.hackingFraction * 100);
  ns.tprintf("$/(GB * sec):          %15.2f", p.profit);
}

export function analyzeTable(ns, allServerData, person) {
  const servers = [];
  for (const entry of Object.values(allServerData)) {
    const p = getProfitability(ns, entry, person);
    const s = entry.server;
    if (isNaN(p.profit) || s.requiredHackingSkill > person.skills.hacking) {
      continue;
    }
    s.profit = p.profit;
    s.hackTime_ = p.hackTime_;
    s.hackChance_ = p.hackChance_;
    servers.push(s);
  }
  // Sort descending
  servers.sort((a, b) => b.profit - a.profit);
  ns.tprintf(
    "          Hostname │ Skill │ Security │ Chance │ Hack Time │ $/(GB * sec)"
  );
  ns.tprintf(
    "───────────────────┼───────┼──────────┼────────┼───────────┼─────────────"
  );
  for (const s of servers) {
    if (s.profit === 0) continue;
    ns.tprintf(
      "%18s │%6d │%9d │%6.2f%% │%10.3f │%13.2f",
      s.hostname,
      s.requiredHackingSkill,
      s.minDifficulty,
      s.hackChance_ * 100,
      s.hackTime_,
      s.profit
    );
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ramDepsScanOnly();
  ramDepsHackStats();

  const serverTree = scanOnly(ns);
  for (const entry of Object.values(serverTree)) {
    entry.hackStatsUpdate(ns);
    // Analyze based on min security.
    entry.server.hackDifficulty = entry.server.minDifficulty;
  }
  const person = ns.getPlayer();
  if (!ns.args.length) {
    analyzeTable(ns, serverTree, person);
  } else {
    analyzeHost(ns, serverTree, person, ns.args[0]);
  }
}
