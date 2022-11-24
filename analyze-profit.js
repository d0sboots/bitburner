// Analyze server(s) for hack profitability.
// This returns the theoretical maximum profitability, in terms of Dollars/(GB ram * seconds).
// The actual profitability will be less, depending on how your hacking scripts work.

/**
 * @typedef {Server} ServerData - Base Server info
 * All of the following are only valid for the current hacking level:
 * @property {number} hackAnalyze_
 * @property {number} hackAnalyzeChance_
 * @property {number} getHackTime_
 * @property {number} growthAnalyze_ - Done with E as the param
 */

/**
 * @param {ServerData} s
 * @returns Object including profit
 */
export function getProfitability(s) {
    // Adjustment factor for converting current hacking results into
    // results assuming minimum security. This lets us not need Formulas.exe.
    const hackAdj = (100 - s.minDifficulty) / (100 - s.hackDifficulty);
    const hackChance_ = Math.min(1, s.hackAnalyzeChance_ * hackAdj);
    const hackPercent_ = Math.min(1, s.hackAnalyze_ * hackAdj);
    // Hacking time adjustment.
    const hackTimeTermCurr = 2.5 * s.requiredHackingSkill * s.hackDifficulty + 500;
    const hackTimeTerm = 2.5 * s.requiredHackingSkill * s.minDifficulty + 500;
    const hackTime_ = s.getHackTime_ * hackTimeTerm / hackTimeTermCurr;
    // These factors are pulled from the game code for growth calculation.
    // They're used to turn current growth rate to growth rate assuming min security.
    const adjGrowthRateCurr = Math.min(1 + 0.03 / s.hackDifficulty, 1.0035);
    const adjGrowthRate = Math.min(1 + 0.03 / s.minDifficulty, 1.0035);
    // e^growthBase is the fraction grown for hacking with 1 thread.
    const growthBase = Math.log(adjGrowthRate) / (Math.log(adjGrowthRateCurr) * s.growthAnalyze_);
    // Number of grows/weakens required per hack. This assumes full coverage even when hackPercent is < 1.
    // (This assumption is not strictly optimal, but is how most practical scripts work.)
    const growPerHack = -Math.log(1 - hackPercent_) / growthBase;
    const weakenPerHack = (1 + 2 * growPerHack) * .002 / .05;
    // Fraction of total RAM timeshare spent on hacking.
    // This doesn't account for the small potential difference between hack
    // and grow/weaken RAM size.
    const hackingFraction = 1 / (1 + 3.2 * growPerHack + 4 * weakenPerHack);
    // Amount of money/hack, if doing the theoretical optimum of 1 hack at a time.
    const hackMoney = hackPercent_ * s.moneyMax;

    const profit = hackingFraction * hackChance_ * hackMoney / (hackTime_ * 1.75 / 1000);
    return {
        hackChance_, hackPercent_, hackTime_, growthBase, growPerHack, weakenPerHack,
        hackingFraction, hackMoney, profit,
    };
}

/**
 * @param {NS} ns
 * @param {Object.<string, ServerData>} allServerData
 * @param {string} host
 * 
 * We take allServerData as an option because there are alternate
 * ways of getting the values that don't increase the RAM of the calling script.
 */
export function analyzeHost(ns, allServerData, host) {
    const s = allServerData[host];
    const p = getProfitability(s);
    ns.tprintf("Analysis of %s:", s.hostname);
    ns.tprintf("Max Money:             %15d", s.moneyMax);
    ns.tprintf("Hacking Skill Required:%15d", s.requiredHackingSkill);
    ns.tprintf("Min Security Level:    %15d", s.minDifficulty);
    ns.tprintf("Server Growth Rate:    %15d", s.serverGrowth);
    ns.tprintf("Hacking time (sec)     %15.3f", p.hackTime_ / 1000);
    ns.tprintf("Hacking Chance:        %15.2f%%", p.hackChance_ * 100);
    ns.tprintf("Money per Hack Success:%15.0f", p.hackMoney);
    ns.tprintf("Growth per Grow:       %15.6fx", Math.exp(p.growthBase));
    ns.tprintf("Grows needed/Hack:     %15.3f", p.growPerHack);
    ns.tprintf("Weakens needed/Hack:   %15.3f", p.weakenPerHack);
    ns.tprintf("Hack RAM timeshare:    %15.2f%%", p.hackingFraction * 100);
    ns.tprintf("$/(GB * sec):          %15.2f", p.profit);
}

export function analyzeTable(ns, allServerData) {
    const servers = Object.values(allServerData).slice();
    for (const s of servers) {
        const p = getProfitability(s);
        s.profit = p.profit;
        s.getHackTime_ = p.hackTime_;
        s.hackChance_ = p.hackChance_;
    }
    // Sort descending
    servers.sort((a, b) => b.profit - a.profit);
    ns.tprintf("          Hostname │ Skill │ Security │ Chance │ Hack Time │ $/(GB * sec)");
    ns.tprintf("───────────────────┼───────┼──────────┼────────┼───────────┼─────────────")
    for (const s of servers) {
        if (s.profit === 0) continue;
        ns.tprintf("%18s │%6d │%9d │%6.2f%% │%10.3f │%13.2f",
            s.hostname, s.requiredHackingSkill, s.minDifficulty,
            s.hackChance_ * 100, s.getHackTime_ / 1000, s.profit);
    }
}

/** @param {NS} ns */
export function getAllServerData(ns) {
    const result = {};
    function getData_(host) {
        const s = ns.getServer(host);
        s.hackAnalyze_ = ns.hackAnalyze(host);
        s.hackAnalyzeChance_ = ns.hackAnalyzeChance(host);
        s.getHackTime_ = ns.getHackTime(host);
        s.growthAnalyze_ = ns.growthAnalyze(host, Math.E);
        result[host] = s;
        for (const child of host == 'home' ? ns.scan(host) : ns.scan(host).slice(1)) {
            getData_(child);
        }
    }
    getData_("home");
    return result;
}

/** @param {NS} ns */
export async function main(ns) {
    if (!ns.args.length) {
        analyzeTable(ns, getAllServerData(ns));
    } else {
        analyzeHost(ns, getAllServerData(ns), ns.args[0]);
    }
}
