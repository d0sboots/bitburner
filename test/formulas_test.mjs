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
});
