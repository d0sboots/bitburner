import {expect} from "chai";
import {getBitnodeMultipliers, Formulas} from "../lib/formulas.js";

describe('Formulas.Hacking', function () {
  const formulas = new Formulas(getBitnodeMultipliers(1, 0));
  const hacking = formulas.hacking;
  const extra = formulas.extra;
  describe('#growThreads()', function () {
    it('End-to-end test', function () {
      const server = formulas.mockServer();
      Object.assign(server, {
        moneyMax: 2e9,
        moneyAvailable: 1e4,
        serverGrowth: 320,
        baseDifficulty: 30,
        hackDifficulty: 10,
        minDifficulty: 10,
        requiredHackingSkill: 20,
      });
      const person = formulas.mockPerson();
      person.skills.hacking = 50;

      const threads = hacking.growThreads(server, person, 1e9);
      expect(hacking.growAmount(server, person, threads)).at.least(1e9);
      expect(hacking.growAmount(server, person, threads-1)).is.below(1e9);

      const threads2 = extra.growThreadsFractional(server, person, 1e9, server.moneyAvailable, 1, 1e-4);
      expect(threads2).is.within(threads - 1, threads);
      expect(hacking.growAmount(server, person, threads2)).is.within(1e9 - 1e-4, 1e9 + 1e-4);
    });
  });
  describe('#calculateBatchThreads()', function () {
    it('hgw, fixed g', function () {
      const server = formulas.mockServer();
      Object.assign(server, {
        moneyMax: 2e9,
        moneyAvailable: 1e4,
        serverGrowth: 320,
        baseDifficulty: 30,
        hackDifficulty: 10,
        minDifficulty: 10,
        requiredHackingSkill: 20,
      });
      const person = formulas.mockPerson();
      person.skills.hacking = 50;
      const opts = {
        batchType: "hgw",
        server,
        person,
        threadConstant: 50,
        relError: 1e-10,
      };
      const h_threads = extra.calculateBatchThreads(opts);
      const pmh = hacking.hackPercent(server, person);
      server.moneyAvailable = server.moneyMax - server.moneyMax * pmh * h_threads;
      server.hackDifficulty += 0.002 * h_threads;
      expect(hacking.growAmount(server, person, 49.99999)).is.below(server.moneyMax);
      expect(hacking.growAmount(server, person, 50)).is.within(server.moneyMax - 1e-4, server.moneyMax);
    });

    it('hgw, fixed w', function () {
      const server = formulas.mockServer();
      Object.assign(server, {
        moneyMax: 2e9,
        moneyAvailable: 1e4,
        serverGrowth: 320,
        baseDifficulty: 30,
        hackDifficulty: 10,
        minDifficulty: 10,
        requiredHackingSkill: 20,
      });
      const person = formulas.mockPerson();
      person.skills.hacking = 50;
      const opts = {
        batchType: "hgw",
        server,
        person,
        threadConstant: 100,
        threadMultiplier: -0.5,
        relError: 1e-10,
        fortify: 0.2,
      };
      const h_threads = extra.calculateBatchThreads(opts);
      const g_threads = 100 - 0.5 * h_threads;
      const pmh = hacking.hackPercent(server, person);
      server.moneyAvailable = server.moneyMax - server.moneyMax * pmh * h_threads;
      server.hackDifficulty += 0.002 * h_threads - opts.fortify;
      expect(hacking.growAmount(server, person, g_threads - 1e-5)).is.below(server.moneyMax);
      expect(hacking.growAmount(server, person, g_threads)).is.within(server.moneyMax - 1e-4, server.moneyMax);
    });
  });
});
