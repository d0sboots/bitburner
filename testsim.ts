import { HackSim } from 'hacksim.ts';

// Example script for use of hacksim.ts
// This launches a simple shotgun batch, tuned for the benchmark save at
// https://discord.com/channels/415207508303544321/944647347625930762/1504930021960187944
export async function main(ns: NS) {
  const player = ns.getPlayer();
  const hostname = "rho-construction";
  const server = ns.getServer(hostname);
  // The third parameter is for the server network. If you are only
  // hacking one server, you can get away with only passing it.
  const sim = new HackSim(ns.formulas, player, [server]);
  // Keep a 2nd sim for predicting actions in serial. The first sim
  // will be "faithful", the 2nd used to calculate how to hack the 1st.
  const sim2 = new HackSim(ns.formulas, player, [server]);
  const sim2serv = sim2.servers.get(hostname)!;
  for (let rounds = 0; rounds < 13; rounds++) {
    // Have to use the *simulated* current values.
    // (Technically, the server should be in the same state, since it should remain prepped.)
    const hacktime = ns.formulas.hacking.hackTime(sim.servers.get(hostname)!, sim.player);
    let finishTime = 0;
    while (sim.currentRamMb < 35815_000) {
      finishTime = sim.hack(hostname, { threads: 1, additionalMsec: hacktime * 3 });
      sim2.advanceTime(sim2.hack(hostname, { threads: 1}));
      let gThreads = 1;
      while (ns.formulas.hacking.growAmount(sim2serv, sim2.player, gThreads, 3) < server.moneyMax!) {
        gThreads++;
      }
      gThreads--;  // Don't overgrow
      if (gThreads) {
        finishTime = sim.grow(hostname, { threads: gThreads, additionalMsec: hacktime * 0.8, cpuCores: 3 });
        sim2.advanceTime(sim2.grow(hostname, { threads: gThreads, cpuCores: 3}));
      }
      if (sim2serv.hackDifficulty! - sim2serv.minDifficulty! > 0.05 * 1.125) {
        finishTime = sim.weaken(hostname, { threads: 1, cpuCores: 3 });
        sim2.advanceTime(sim2.weaken(hostname, { threads: 1, cpuCores: 3}));
      }
    }
    if (rounds === 12) {
      sim.grow(hostname, { threads: 1, additionalMsec: hacktime * 0.8, cpuCores: 3 });
      finishTime = sim.weaken(hostname, { threads: 1, cpuCores: 3 });
    }
    sim.advanceTime(finishTime);
  }
  const newServ = sim.servers.get(hostname)!;
  ns.tprintf(
    `Overall time: %s
Money gained: $%s
Ram used: %fGB
Money diff on server: $%s
Security diff on server: %f
Final level: %d`,
    ns.format.time(sim.time),
    ns.format.number(sim.player.money - player.money),
    sim.maxRamMb / 1000,
    ns.format.number((newServ.moneyAvailable ?? NaN) - (server.moneyAvailable ?? NaN)),
    (newServ.hackDifficulty ?? NaN) - (server.hackDifficulty ?? NaN),
    sim.player.skills.hacking,
  );
}
