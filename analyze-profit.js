import { scanOnly, ramDepsScanOnly } from "lib/scan.js";
import { createCurrentFormulas } from "lib/formulas.js";

/** Analyzes profit */
export class AnalyzeProfit {
  ns;
  allServerData;
  formulas;
  person;

  // Analyze server(s) for hack profitability.
  // This returns the theoretical maximum profitability, in terms of Dollars/(GB ram * seconds).
  // The actual profitability will be less, depending on how your hacking scripts work.

  /**
   * @param {ServerEntry} entry
   * @return {object} including profit
   */
  getProfitability(entry) {
    const s = entry.server;
    const h = this.formulas.hacking;
    const person = this.person;
    const hackPercent_ = h.hackPercent(s, person);
    const hackTime_ = h.hackTime(s, person) / 1000;
    const hackChance_ = h.hackChance(s, person);
    const growthBase = Math.log(h.growPercent(s, 1, person));
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

    const savedDiff = s.hackDifficulty;
    s.hackDifficulty = entry.recordedHackDifficulty;
    const lootPercent = h.hackPercent(s, person);
    const lootTime = h.hackTime(s, person) / 1000;
    const lootChance = h.hackChance(s, person);
    s.hackDifficulty = savedDiff;
    const loot =
      (lootChance * lootPercent * s.moneyAvailable) / (lootTime * 1.7);

    return {
      hackChance_,
      hackPercent_,
      hackTime_,
      growthBase,
      growPerHack,
      weakenPerHack,
      hackingFraction,
      hackMoney,
      loot,
      profit,
    };
  }

  // Returns (close to) the fractional number of threads needed to grow *this
  // server* from originalMoney to full. I.e. passing moneyMax will always return 0.
  // This takes current cores into account, and assumes current security.
  // Taking Math.ceil() of this will always give the correct number of integer
  // threads.
  numCycleForGrowthCorrected(s, originalMoney, guess = 0, eps = 0.5) {
    const moneyDiff = s.moneyMax - originalMoney;
    if (moneyDiff <= 0) return 0;
    const growthBase = Math.log(
      this.formulas.hacking.growPercent(s, 1, this.person)
    );
    // Shorthand vars: growthBase = b, threads = x, moneyMax = m, originalMoney = o
    // The formula we're dealing with is
    //   (o + x) * e^(b*x) = m
    // The logarithmic form will have better convergance:
    //   log(o + x) + b*x = log(m)
    //
    // Using Newton's method:
    //   log(o + x) + b*x - log(m) = y
    //   1/(o + x) + b = y'
    //   x_next = x - y/y'
    //
    //   x_next = x - (log(o + x) + b*x - log(m)) / (1/(o + x) + b)
    //   = x * (1/(o + x) + b) / (1/(o + x) + b) - (log((o + x)/m) + b*x) / (1/(o + x) + b)
    //   = (x/(o + x) + b*x - log((o + x)/m) - b*x) / (1/(o + x) + b)
    //   = (x/(o + x) - log((o + x)/m)) / (1/(o + x) + b)
    //   = (o + x) * (x/(o + x) - log((o + x)/m)) / ((o + x) * (1/(o + x) + b))
    //   = (x - (o + x)*log((o + x)/m)) / (1 + (o + x)*b)
    const invMoney = 1 / s.moneyMax;
    // Clamp the initial guess against inputs that would put it out of range,
    // or lead to slow convergance. The inverted test catches NaN.
    if (!(guess > 0 && guess < moneyDiff)) {
      // moneyDiff makes a good initial guess. However, using it causes the
      // log part to equal 0, so we can do one iteration here cheaply to get a
      // much better guess.
      guess = moneyDiff / (1 + s.moneyMax * growthBase);
    }
    // Now we iterate until it converges well enough.
    while (true) {
      const ox = originalMoney + guess;
      const nextGuess =
        (guess - ox * Math.log(ox * invMoney)) / (1 + ox * growthBase);
      if (nextGuess - guess > eps || guess - nextGuess > eps) {
        guess = nextGuess;
        continue;
      }
      // We know nextGuess is now very close to the answer, but there could
      // still be be rounding issues when using the result. We can use the
      // properties of the function to help: Since y'' is always negative, but
      // y' is always positive, we know that any guess to the right of the
      // target wil overshoot, and any guess to the left will undershoot.
      const ceil = Math.ceil(nextGuess);
      if (nextGuess <= guess) {
        // Overshoot case: The correct answer is between the two guesses
        if (guess < ceil) return nextGuess;
        // Try against full formula
        if (
          (originalMoney + ceil) * Math.exp(growthBase * ceil) >=
          s.moneyMax
        ) {
          return nextGuess;
        } else {
          return guess;
        }
      } else {
        // Undershoot case: The correct answer is greater than nextGuess
        // But it won't be farther than this step away
        if (ceil - nextGuess >= nextGuess - guess) return nextGuess;
        // Try against full formula
        if (
          (originalMoney + ceil) * Math.exp(growthBase * ceil) >=
          s.moneyMax
        ) {
          return nextGuess;
        } else {
          // Will ceil to the next largest integer, while being close to nextGuess.
          // The constant is 1 + EPSILON, to ensure that it will always round
          // up to the next integer.
          return ceil * 1.0000000000000002;
        }
      }
    }
  }

  /**
   * @param {ServerEntry} entry
   * @param {number} hackThreads
   * @return {object} including profit
   */
  hwgw(entry, hackThreads) {
    const s = entry.server;
    const h = this.formulas.hacking;
    const person = this.person;
    const hackPercent_ = h.hackPercent(s, person);
    const steal = s.moneyMax * Math.min(1.0, hackPercent_ * hackThreads);
    const hackChance_ = h.hackChance(s, person);
    // Number of grows/weakens required per hack. This assumes full coverage even when hackPercent is < 1.
    // (This assumption is not strictly optimal, but is how most practical scripts work.)
    const growThreads = Math.ceil(
      this.numCycleForGrowthCorrected(s, s.moneyMax - steal)
    );
    const weaken1Threads = Math.ceil(hackThreads * (0.002 / 0.05));
    const weaken2Threads = Math.ceil(growThreads * (0.004 / 0.05));
    const ramPerBatch =
      1.7 * 0.25 * hackThreads +
      1.75 * 0.8 * growThreads +
      1.75 * (weaken1Threads + weaken2Threads);
    const profitPerBatch = steal * hackChance_;
    const profitPerGB = profitPerBatch / ramPerBatch;

    return {
      hackThreads,
      weaken1Threads,
      growThreads,
      weaken2Threads,
      ramPerBatch,
      profitPerBatch,
      profitPerGB,
    };
  }

  /**
   * @param {string} host
   */
  host(host) {
    const entry = this.allServerData.get(host);
    const s = entry.server;
    const p = this.getProfitability(entry);
    const grow1 = this.numCycleForGrowthCorrected(
      s,
      0.99 * s.moneyMax,
      0,
      0.01
    );
    const grow99 = this.numCycleForGrowthCorrected(
      s,
      0.01 * s.moneyMax,
      0,
      0.01
    );
    const grow100 = this.numCycleForGrowthCorrected(s, 0, 0, 0.01);
    const hwgwRes = this.hwgw(entry, 10);
    const hwgwStr = `${hwgwRes.hackThreads}/${hwgwRes.weaken1Threads}/${hwgwRes.growThreads}/${hwgwRes.weaken2Threads}`;
    this.ns.tprintf("Analysis of %s:", s.hostname);
    this.ns.tprintf("Max Money:             %15d", s.moneyMax);
    this.ns.tprintf("Hacking Skill Required:%15d", s.requiredHackingSkill);
    this.ns.tprintf("Min Security Level:    %15d", s.minDifficulty);
    this.ns.tprintf("Server Growth Rate:    %15d", s.serverGrowth);
    this.ns.tprintf("  1%% grow threads:     %15.2f", grow1);
    this.ns.tprintf(" 99%% grow threads:     %15.2f", grow99);
    this.ns.tprintf("100%% grow threads:     %15.2f", grow100);
    this.ns.tprintf("HWGW (10)              %15s", hwgwStr);
    this.ns.tprintf("Hacking time (sec)     %15.3f", p.hackTime_);
    this.ns.tprintf("Hacking Chance:        %15.2f%%", p.hackChance_ * 100);
    this.ns.tprintf("Money per Hack Success:%15.0f", p.hackMoney);
    this.ns.tprintf("Growth per Grow:       %15.6fx", Math.exp(p.growthBase));
    this.ns.tprintf("Grows needed/Hack:     %15.3f", p.growPerHack);
    this.ns.tprintf("Weakens needed/Hack:   %15.3f", p.weakenPerHack);
    this.ns.tprintf("Hack RAM timeshare:    %15.2f%%", p.hackingFraction * 100);
    this.ns.tprintf("Loot $/(GB * sec):     %15.2f", p.loot);
    this.ns.tprintf("$/(GB * sec):          %15.2f", p.profit);
  }

  getSortedServers() {
    const servers = [];
    for (const entry of this.allServerData.values()) {
      const p = this.getProfitability(entry);
      const s = entry.server;
      if (
        isNaN(p.profit) ||
        s.requiredHackingSkill > this.person.skills.hacking
      ) {
        continue;
      }
      s.loot = p.loot;
      s.profit = p.profit;
      s.hackTime_ = p.hackTime_;
      s.hackChance_ = p.hackChance_;
      servers.push(s);
    }
    // Sort descending
    servers.sort((a, b) => b.profit - a.profit);
    return servers;
  }

  table() {
    const servers = this.getSortedServers();
    this.ns.tprintf(
      "          Hostname │ Skill │ Security │ Chance │ Hack Time │ Loot $/GB*s │ $/(GB * sec)"
    );
    this.ns.tprintf(
      "───────────────────┼───────┼──────────┼────────┼───────────┼─────────────┼─────────────"
    );
    for (const s of servers) {
      if (s.profit === 0) continue;
      this.ns.tprintf(
        "%18s │%6d │%9d │%6.2f%% │%10.3f │%13.2f│%13.2f",
        s.hostname,
        s.requiredHackingSkill,
        s.minDifficulty,
        s.hackChance_ * 100,
        s.hackTime_,
        s.loot,
        s.profit
      );
    }
  }

  benchmark() {
    let tmax = 0;
    let tmin = Infinity;
    let ttot = 0;
    let now = performance.now();
    const LOOPS = 1000;
    for (let i = 0; i < LOOPS; ++i) {
      this.getSortedServers();
      const tnext = performance.now();
      const diff = tnext - now;
      now = tnext;
      if (diff < tmin) tmin = diff;
      if (diff > tmax) tmax = diff;
      ttot += diff;
    }
    this.ns.tprintf(
      "Time to run analysis: Min %.1fms, Max %.1fms, Avg %.2fms",
      tmin,
      tmax,
      ttot / LOOPS
    );
  }

  constructor(ns, allServerData, formulas, person) {
    this.ns = ns;
    this.allServerData = allServerData;
    this.formulas = formulas;
    this.person = person;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ramDepsScanOnly();

  const serverTree = scanOnly(ns);
  const serverMap = new Map();
  for (const [key, entry] of Object.entries(serverTree)) {
    // Analyze based on min security.
    entry.recordedHackDifficulty = entry.server.hackDifficulty;
    entry.server.hackDifficulty = entry.server.minDifficulty;
    serverMap.set(key, entry);
  }
  const analyze = new AnalyzeProfit(
    ns,
    serverMap,
    createCurrentFormulas(ns),
    ns.getPlayer()
  );
  if (!ns.args.length) {
    analyze.table();
  } else if (ns.args[0] === "-b") {
    analyze.benchmark();
  } else {
    analyze.host(ns.args[0]);
  }
}
