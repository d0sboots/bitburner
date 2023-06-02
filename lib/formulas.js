// Drop-in replacement class for ns.formulas.
// Useful if you're poor/early-game.
// There are a few extra utilities relating to BN multipliers at the top-level. (getBitnodeMultipliers(),
// defaultBitnodeMultipliers, etc.) There are also extra functions in Formulas.extra, these mostly duplicate
// functionality found elsewhere (like top-level ns functions) that can be directly calculated without
// needing `ns` or RAM.
//
// Generally you create the class with `createCurrentFormulas(ns)`, but there is also
// `new Formulas(bnMultipliers)` for customizing the BN multipliers if you want.
//
// Implementations are directly copied from the source. Current as of 7f85237 (2023-05-30)

/**
 * @param {NS} ns
 * @return {Formulas}
 *
 * The primary way to create the class.
 * RAM cost: 1.1GB
 * (ns.getResetInfo() + ns.getServerRequiredHackingLevel()).
 */
export function createCurrentFormulas(ns) {
  ns.getResetInfo;
  return createCurrentFormulasNoRam(ns);
}

/**
 * @param {NS} ns
 * @return {Formulas}
 *
 * The same as createCurrentFormulas, but without the static RAM cost, for RAM dodging.
 * RAM cost: 1.0GB + 0.1GB in BN12
 * (ns.getResetInfo() + ns.getServerRequiredHackingLevel()).
 */
export function createCurrentFormulasNoRam(ns) {
  const currentBn = ns["getResetInfo"]().currentNode;
  const currentSf = currentBn === 12 ? getBn12SfLevelNoRam(ns) : 0;
  return new Formulas(getBitnodeMultipliers(currentBn, currentSf));
}

/**
 * @param {NS} ns
 * @return {number} The sourcefile of the current node, which must be BN12
 *
 * Measures the current level of BN12 by checking the w0r1d_d43m0n difficulty.
 * RAM cost: 0.1GB (ns.getServerRequiredHackingLevel())
 */
export function getBn12SfLevel(ns) {
  ns.getServerRequiredHackingLevel;
  return getBn12SfLevel(ns);
}

/**
 * @param {NS} ns
 * @return {number} The sourcefile of the current node, which must be BN12
 *
 * The same as getBn12SfLevel, but without the static RAM cost, for RAM dodging.
 * RAM cost: 0.1GB (ns.getServerRequiredHackingLevel())
 */
export function getBn12SfLevelNoRam(ns) {
  const difficulty = ns["getServerRequiredHackingLevel"]("w0r1d_d43m0n");
  // The constant is the fully precise value of log(1.02). (For technical
  // numerical reasons, JS itself can't give us the correct value, since there
  // are numerous "correct" values).
  const levels = Math.log(difficulty) / 0.019802627296179712;
  const rounded = Math.round(levels);
  if (rounded < 1 || Math.abs(levels - rounded) > 0.00000000001) {
    ns.tprintf("WARNING: Called getBn12SfLevel while not in BN12!");
    return -1;
  }
  // BN12 adds 1 to the value, we have to subtract to get the actual SF level.
  // I.e. BN12.1 has an SF level of 0, but starts with 1 level of modifier.
  return rounded - 1;
}

//
// From here on, no functions take `ns` as an argument, and thus nothing costs RAM.
//

export const defaultBitnodeMultipliers = {
  HackingLevelMultiplier: 1,
  StrengthLevelMultiplier: 1,
  DefenseLevelMultiplier: 1,
  DexterityLevelMultiplier: 1,
  AgilityLevelMultiplier: 1,
  CharismaLevelMultiplier: 1,

  ServerGrowthRate: 1,
  ServerMaxMoney: 1,
  ServerStartingMoney: 1,
  ServerStartingSecurity: 1,
  ServerWeakenRate: 1,

  HomeComputerRamCost: 1,

  PurchasedServerCost: 1,
  PurchasedServerSoftcap: 1,
  PurchasedServerLimit: 1,
  PurchasedServerMaxRam: 1,

  CompanyWorkMoney: 1,
  CrimeMoney: 1,
  HacknetNodeMoney: 1,
  ManualHackMoney: 1,
  ScriptHackMoney: 1,
  ScriptHackMoneyGain: 1,
  CodingContractMoney: 1,

  ClassGymExpGain: 1,
  CompanyWorkExpGain: 1,
  CrimeExpGain: 1,
  FactionWorkExpGain: 1,
  HackExpGain: 1,

  FactionPassiveRepGain: 1,
  FactionWorkRepGain: 1,
  RepToDonateToFaction: 1,

  AugmentationMoneyCost: 1,
  AugmentationRepCost: 1,

  InfiltrationMoney: 1,
  InfiltrationRep: 1,

  FourSigmaMarketDataCost: 1,
  FourSigmaMarketDataApiCost: 1,

  CorporationValuation: 1,
  CorporationSoftcap: 1,
  CorporationDivisions: 1,

  BladeburnerRank: 1,
  BladeburnerSkillCost: 1,

  GangSoftcap: 1,
  GangUniqueAugs: 1,

  DaedalusAugsRequirement: 30,

  StaneksGiftPowerMultiplier: 1,
  StaneksGiftExtraSize: 0,

  WorldDaemonDifficulty: 1,
};

Object.freeze(defaultBitnodeMultipliers);

/**
 * @param {number} bn
 * @param {number} sf Only matters for BN12
 * @return {BitNodeMultipliers} The BN mults for the given BN and SF level
 *
 * These are copied directly from the game.
 */
export function getBitnodeMultipliers(bn, sf) {
  sf++; // Adjust for source-file offset that happens elsewhere in the game code
  const mults = Object.assign({}, defaultBitnodeMultipliers);
  switch (bn) {
    case 1: {
      return mults;
    }
    case 2: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.8,

        ServerGrowthRate: 0.8,
        ServerMaxMoney: 0.08,
        ServerStartingMoney: 0.4,

        PurchasedServerSoftcap: 1.3,

        CrimeMoney: 3,

        FactionPassiveRepGain: 0,
        FactionWorkRepGain: 0.5,

        CorporationSoftcap: 0.9,
        CorporationDivisions: 0.9,

        InfiltrationMoney: 3,
        StaneksGiftPowerMultiplier: 2,
        StaneksGiftExtraSize: -6,
        WorldDaemonDifficulty: 5,
      });
    }
    case 3: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.8,

        ServerGrowthRate: 0.2,
        ServerMaxMoney: 0.04,
        ServerStartingMoney: 0.2,

        HomeComputerRamCost: 1.5,

        PurchasedServerCost: 2,
        PurchasedServerSoftcap: 1.3,

        CompanyWorkMoney: 0.25,
        CrimeMoney: 0.25,
        HacknetNodeMoney: 0.25,
        ScriptHackMoney: 0.2,

        RepToDonateToFaction: 0.5,

        AugmentationMoneyCost: 3,
        AugmentationRepCost: 3,

        GangSoftcap: 0.9,
        GangUniqueAugs: 0.5,

        StaneksGiftPowerMultiplier: 0.75,
        StaneksGiftExtraSize: -2,

        WorldDaemonDifficulty: 2,
      });
    }
    case 4: {
      return Object.assign(mults, {
        ServerMaxMoney: 0.1125,
        ServerStartingMoney: 0.75,

        PurchasedServerSoftcap: 1.2,

        CompanyWorkMoney: 0.1,
        CrimeMoney: 0.2,
        HacknetNodeMoney: 0.05,
        ScriptHackMoney: 0.2,

        ClassGymExpGain: 0.5,
        CompanyWorkExpGain: 0.5,
        CrimeExpGain: 0.5,
        FactionWorkExpGain: 0.5,
        HackExpGain: 0.4,

        FactionWorkRepGain: 0.75,

        GangUniqueAugs: 0.5,

        StaneksGiftPowerMultiplier: 1.5,
        StaneksGiftExtraSize: 0,

        WorldDaemonDifficulty: 3,
      });
    }
    case 5: {
      return Object.assign(mults, {
        ServerStartingSecurity: 2,
        ServerStartingMoney: 0.5,

        PurchasedServerSoftcap: 1.2,

        CrimeMoney: 0.5,
        HacknetNodeMoney: 0.2,
        ScriptHackMoney: 0.15,

        HackExpGain: 0.5,

        AugmentationMoneyCost: 2,

        InfiltrationMoney: 1.5,
        InfiltrationRep: 1.5,

        CorporationValuation: 0.75,
        CorporationDivisions: 0.75,

        GangUniqueAugs: 0.5,

        StaneksGiftPowerMultiplier: 1.3,
        StaneksGiftExtraSize: 0,

        WorldDaemonDifficulty: 1.5,
      });
    }
    case 6: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.35,

        ServerMaxMoney: 0.2,
        ServerStartingMoney: 0.5,
        ServerStartingSecurity: 1.5,

        PurchasedServerSoftcap: 2,

        CompanyWorkMoney: 0.5,
        CrimeMoney: 0.75,
        HacknetNodeMoney: 0.2,
        ScriptHackMoney: 0.75,

        HackExpGain: 0.25,

        InfiltrationMoney: 0.75,

        CorporationValuation: 0.2,
        CorporationSoftcap: 0.9,
        CorporationDivisions: 0.8,

        GangSoftcap: 0.7,
        GangUniqueAugs: 0.2,

        DaedalusAugsRequirement: 35,

        StaneksGiftPowerMultiplier: 0.5,
        StaneksGiftExtraSize: 2,

        WorldDaemonDifficulty: 2,
      });
    }
    case 7: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.35,

        ServerMaxMoney: 0.2,
        ServerStartingMoney: 0.5,
        ServerStartingSecurity: 1.5,

        PurchasedServerSoftcap: 2,

        CompanyWorkMoney: 0.5,
        CrimeMoney: 0.75,
        HacknetNodeMoney: 0.2,
        ScriptHackMoney: 0.5,

        HackExpGain: 0.25,

        AugmentationMoneyCost: 3,

        InfiltrationMoney: 0.75,

        FourSigmaMarketDataCost: 2,
        FourSigmaMarketDataApiCost: 2,

        CorporationValuation: 0.2,
        CorporationSoftcap: 0.9,
        CorporationDivisions: 0.8,

        BladeburnerRank: 0.6,
        BladeburnerSkillCost: 2,

        GangSoftcap: 0.7,
        GangUniqueAugs: 0.2,

        DaedalusAugsRequirement: 35,

        StaneksGiftPowerMultiplier: 0.9,
        StaneksGiftExtraSize: -1,

        WorldDaemonDifficulty: 2,
      });
    }
    case 8: {
      return Object.assign(mults, {
        PurchasedServerSoftcap: 4,

        CompanyWorkMoney: 0,
        CrimeMoney: 0,
        HacknetNodeMoney: 0,
        ManualHackMoney: 0,
        ScriptHackMoney: 0.3,
        ScriptHackMoneyGain: 0,
        CodingContractMoney: 0,

        RepToDonateToFaction: 0,

        InfiltrationMoney: 0,

        CorporationValuation: 0,
        CorporationSoftcap: 0,
        CorporationDivisions: 0,

        BladeburnerRank: 0,

        GangSoftcap: 0,
        GangUniqueAugs: 0,

        StaneksGiftExtraSize: -99,
      });
    }
    case 9: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.5,
        StrengthLevelMultiplier: 0.45,
        DefenseLevelMultiplier: 0.45,
        DexterityLevelMultiplier: 0.45,
        AgilityLevelMultiplier: 0.45,
        CharismaLevelMultiplier: 0.45,

        ServerMaxMoney: 0.01,
        ServerStartingMoney: 0.1,
        ServerStartingSecurity: 2.5,

        HomeComputerRamCost: 5,

        PurchasedServerLimit: 0,

        CrimeMoney: 0.5,
        ScriptHackMoney: 0.1,

        HackExpGain: 0.05,

        FourSigmaMarketDataCost: 5,
        FourSigmaMarketDataApiCost: 4,

        CorporationValuation: 0.5,
        CorporationSoftcap: 0.75,
        CorporationDivisions: 0.8,

        BladeburnerRank: 0.9,
        BladeburnerSkillCost: 1.2,

        GangSoftcap: 0.8,
        GangUniqueAugs: 0.25,

        StaneksGiftPowerMultiplier: 0.5,
        StaneksGiftExtraSize: 2,

        WorldDaemonDifficulty: 2,
      });
    }
    case 10: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.35,
        StrengthLevelMultiplier: 0.4,
        DefenseLevelMultiplier: 0.4,
        DexterityLevelMultiplier: 0.4,
        AgilityLevelMultiplier: 0.4,
        CharismaLevelMultiplier: 0.4,

        HomeComputerRamCost: 1.5,

        PurchasedServerCost: 5,
        PurchasedServerSoftcap: 1.1,
        PurchasedServerLimit: 0.6,
        PurchasedServerMaxRam: 0.5,

        CompanyWorkMoney: 0.5,
        CrimeMoney: 0.5,
        HacknetNodeMoney: 0.5,
        ManualHackMoney: 0.5,
        ScriptHackMoney: 0.5,
        CodingContractMoney: 0.5,

        AugmentationMoneyCost: 5,
        AugmentationRepCost: 2,

        InfiltrationMoney: 0.5,

        CorporationValuation: 0.5,
        CorporationSoftcap: 0.9,
        CorporationDivisions: 0.9,

        BladeburnerRank: 0.8,

        GangSoftcap: 0.9,
        GangUniqueAugs: 0.25,

        StaneksGiftPowerMultiplier: 0.75,
        StaneksGiftExtraSize: -3,

        WorldDaemonDifficulty: 2,
      });
    }
    case 11: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.6,

        ServerGrowthRate: 0.2,
        ServerMaxMoney: 0.01,
        ServerStartingMoney: 0.1,
        ServerWeakenRate: 2,

        PurchasedServerSoftcap: 2,

        CompanyWorkMoney: 0.5,
        CrimeMoney: 3,
        HacknetNodeMoney: 0.1,
        CodingContractMoney: 0.25,

        HackExpGain: 0.5,

        AugmentationMoneyCost: 2,

        InfiltrationMoney: 2.5,
        InfiltrationRep: 2.5,

        FourSigmaMarketDataCost: 4,
        FourSigmaMarketDataApiCost: 4,

        CorporationValuation: 0.1,
        CorporationSoftcap: 0.9,
        CorporationDivisions: 0.9,

        GangUniqueAugs: 0.75,

        WorldDaemonDifficulty: 1.5,
      });
    }
    case 12: {
      const inc = Math.pow(1.02, sf);
      const dec = 1 / inc;

      return Object.assign(mults, {
        DaedalusAugsRequirement: Math.floor(
          Math.min(mults.DaedalusAugsRequirement + inc, 40)
        ),

        HackingLevelMultiplier: dec,
        StrengthLevelMultiplier: dec,
        DefenseLevelMultiplier: dec,
        DexterityLevelMultiplier: dec,
        AgilityLevelMultiplier: dec,
        CharismaLevelMultiplier: dec,

        ServerGrowthRate: dec,
        ServerMaxMoney: dec * dec,
        ServerStartingMoney: dec,
        ServerWeakenRate: dec,

        // Does not scale, otherwise security might start at 300+
        ServerStartingSecurity: 1.5,

        HomeComputerRamCost: inc,

        PurchasedServerCost: inc,
        PurchasedServerSoftcap: inc,
        PurchasedServerLimit: dec,
        PurchasedServerMaxRam: dec,

        CompanyWorkMoney: dec,
        CrimeMoney: dec,
        HacknetNodeMoney: dec,
        ManualHackMoney: dec,
        ScriptHackMoney: dec,
        CodingContractMoney: dec,

        ClassGymExpGain: dec,
        CompanyWorkExpGain: dec,
        CrimeExpGain: dec,
        FactionWorkExpGain: dec,
        HackExpGain: dec,

        FactionPassiveRepGain: dec,
        FactionWorkRepGain: dec,
        RepToDonateToFaction: inc,

        AugmentationMoneyCost: inc,
        AugmentationRepCost: inc,

        InfiltrationMoney: dec,
        InfiltrationRep: dec,

        FourSigmaMarketDataCost: inc,
        FourSigmaMarketDataApiCost: inc,

        CorporationValuation: dec,
        CorporationSoftcap: 0.8,
        CorporationDivisions: 0.5,

        BladeburnerRank: dec,
        BladeburnerSkillCost: inc,

        GangSoftcap: 0.8,
        GangUniqueAugs: dec,

        StaneksGiftPowerMultiplier: inc,
        StaneksGiftExtraSize: inc,

        WorldDaemonDifficulty: inc,
      });
    }
    case 13: {
      return Object.assign(mults, {
        HackingLevelMultiplier: 0.25,
        StrengthLevelMultiplier: 0.7,
        DefenseLevelMultiplier: 0.7,
        DexterityLevelMultiplier: 0.7,
        AgilityLevelMultiplier: 0.7,

        PurchasedServerSoftcap: 1.6,

        ServerMaxMoney: 0.3375,
        ServerStartingMoney: 0.75,
        ServerStartingSecurity: 3,

        CompanyWorkMoney: 0.4,
        CrimeMoney: 0.4,
        HacknetNodeMoney: 0.4,
        ScriptHackMoney: 0.2,
        CodingContractMoney: 0.4,

        ClassGymExpGain: 0.5,
        CompanyWorkExpGain: 0.5,
        CrimeExpGain: 0.5,
        FactionWorkExpGain: 0.5,
        HackExpGain: 0.1,

        FactionWorkRepGain: 0.6,

        FourSigmaMarketDataCost: 10,
        FourSigmaMarketDataApiCost: 10,

        CorporationValuation: 0.001,
        CorporationSoftcap: 0.4,
        CorporationDivisions: 0.4,

        BladeburnerRank: 0.45,
        BladeburnerSkillCost: 2,

        GangSoftcap: 0.3,
        GangUniqueAugs: 0.1,

        StaneksGiftPowerMultiplier: 2,
        StaneksGiftExtraSize: 1,

        WorldDaemonDifficulty: 3,
      });
    }
    default: {
      throw new Error(`Invalid bn: ${bn}`);
    }
  }
}

/**
 * The main class. Contains all formula-replacement functions and subclasses.
 */
export class Formulas {
  // These sub-classes are initialized in the constructor
  reputation;
  skills;
  hacking;
  hacknetNodes;
  hacknetServers;
  gang;
  work;
  extra;

  /**
   * @param {BitNodeMultipliers} bnMults
   */
  constructor(bnMults) {
    if (
      bnMults === null ||
      typeof bnMults !== "object" ||
      !("ScriptHackMoney" in bnMults)
    ) {
      throw new Error(`bnMults is not a valid BN mults object: ${bnMults}`);
    }
    this.reputation = new Reputation(bnMults);
    this.skills = new Skills(bnMults);
    this.hacking = new Hacking(bnMults);
    this.hacknetNodes = new HacknetNodes(bnMults);
    this.hacknetServers = new HacknetServers(bnMults);
    this.gang = new Gang(bnMults);
    this.work = new Work(bnMults);
    this.extras = new Extra(bnMults);
  }

  mockServer() {
    return {
      cpuCores: 0,
      ftpPortOpen: false,
      hasAdminRights: false,
      hostname: "",
      httpPortOpen: false,
      ip: "",
      isConnectedTo: false,
      maxRam: 0,
      organizationName: "",
      ramUsed: 0,
      smtpPortOpen: false,
      sqlPortOpen: false,
      sshPortOpen: false,
      purchasedByPlayer: false,
      backdoorInstalled: false,
      baseDifficulty: 0,
      hackDifficulty: 0,
      minDifficulty: 0,
      moneyAvailable: 0,
      moneyMax: 0,
      numOpenPortsRequired: 0,
      openPortCount: 0,
      requiredHackingSkill: 0,
      serverGrowth: 0,
    };
  }

  mockPlayer() {
    return {
      // Person
      hp: { current: 0, max: 0 },
      skills: {
        hacking: 0,
        strength: 0,
        defense: 0,
        dexterity: 0,
        agility: 0,
        charisma: 0,
        intelligence: 0,
      },
      exp: {
        hacking: 0,
        strength: 0,
        defense: 0,
        dexterity: 0,
        agility: 0,
        charisma: 0,
        intelligence: 0,
      },
      mults: defaultMultipliers(),
      city: CityName.Sector12,
      // Player-specific
      numPeopleKilled: 0,
      money: 0,
      location: LocationName.TravelAgency,
      totalPlaytime: 0,
      jobs: {},
      factions: [],
      entropy: 0,
    };
  }

  mockPerson() {
    return {
      hp: { current: 0, max: 0 },
      skills: {
        hacking: 0,
        strength: 0,
        defense: 0,
        dexterity: 0,
        agility: 0,
        charisma: 0,
        intelligence: 0,
      },
      exp: {
        hacking: 0,
        strength: 0,
        defense: 0,
        dexterity: 0,
        agility: 0,
        charisma: 0,
        intelligence: 0,
      },
      mults: defaultMultipliers(),
      city: CityName.Sector12,
    };
  }
}

/** Equivalent of formulas.reputation */
class Reputation {
  /**
   * @param {BitNodeMultipliers} bnMults
   */
  constructor(bnMults) {
    this.bnMults = bnMults;
  }

  calculateFavorToRep(_favor) {
    const favor = helpers.number("favor", _favor);
    const raw = 25000 * (Math.pow(1.02, favor) - 1);
    return Math.round(raw * 10000) / 10000; // round to make things easier.
  }
  calculateRepToFavor(_rep) {
    const rep = helpers.number("rep", _rep);
    const raw = Math.log(rep / 25000 + 1) / Math.log(1.02);
    return Math.round(raw * 10000) / 10000; // round to make things easier.
  }
  get repFromDonation() {
    const BitNodeMultipliers = this.bnMults;
    return (_amount, _player) => {
      const amount = helpers.number("amount", _amount);
      const person = helpers.person(_player);
      return (
        (amount / CONSTANTS.DonateMoneyToRepDivisor) *
        person.mults.faction_rep *
        BitNodeMultipliers.FactionWorkRepGain
      );
    };
  }
}

/** Equivalent of formulas.skills */
class Skills {
  /**
   * @param {BitNodeMultipliers} bnMults
   */
  constructor(bnMults) {
    this.bnMults = bnMults;
  }

  calculateSkill(_exp, _mult = 1) {
    const exp = helpers.number("exp", _exp);
    const mult = helpers.number("mult", _mult);
    return Math.max(Math.floor(mult * (32 * Math.log(exp + 534.6) - 200)), 1);
  }
  calculateExp(_skill, _mult = 1) {
    const skill = helpers.number("skill", _skill);
    const mult = helpers.number("mult", _mult);
    return Math.exp((skill / mult + 200) / 32) - 534.6;
  }
}

/** Equivalent of formulas.hacking */
class Hacking {
  /**
   * @param {BitNodeMultipliers} bnMults
   */
  constructor(bnMults) {
    this.bnMults = bnMults;
  }

  hackChance(_server, _player) {
    const server = helpers.server(_server);
    const person = helpers.person(_player);
    const hackDifficulty = server.hackDifficulty ?? 100;
    const requiredHackingSkill = server.requiredHackingSkill ?? 1e9;
    // Unrooted or unhackable server
    if (!server.hasAdminRights || hackDifficulty >= 100) return 0;
    const hackFactor = 1.75;
    const difficultyMult = (100 - hackDifficulty) / 100;
    const skillMult = hackFactor * person.skills.hacking;
    const skillChance = (skillMult - requiredHackingSkill) / skillMult;
    const chance =
      skillChance *
      difficultyMult *
      person.mults.hacking_chance *
      calculateIntelligenceBonus(person.skills.intelligence, 1);
    return Math.min(1, Math.max(chance, 0));
  }
  get hackExp() {
    const BitNodeMultipliers = this.bnMults;
    return (_server, _player) => {
      const server = helpers.server(_server);
      const person = helpers.person(_player);

      const baseDifficulty = server.baseDifficulty;
      if (!baseDifficulty) return 0;
      const baseExpGain = 3;
      const diffFactor = 0.3;
      let expGain = baseExpGain;
      expGain += baseDifficulty * diffFactor;
      return (
        expGain * person.mults.hacking_exp * BitNodeMultipliers.HackExpGain
      );
    };
  }
  get hackPercent() {
    const BitNodeMultipliers = this.bnMults;
    return (_server, _player) => {
      const server = helpers.server(_server);
      const person = helpers.person(_player);

      const hackDifficulty = server.hackDifficulty ?? 100;
      if (hackDifficulty >= 100) return 0;
      const requiredHackingSkill = server.requiredHackingSkill ?? 1e9;
      // Adjust if needed for balancing. This is the divisor for the final calculation
      const balanceFactor = 240;

      const difficultyMult = (100 - hackDifficulty) / 100;
      const skillMult =
        (person.skills.hacking - (requiredHackingSkill - 1)) /
        person.skills.hacking;
      const percentMoneyHacked =
        (difficultyMult *
          skillMult *
          person.mults.hacking_money *
          BitNodeMultipliers.ScriptHackMoney) /
        balanceFactor;

      return Math.min(1, Math.max(percentMoneyHacked, 0));
    };
  }
  /* TODO 2.3: Remove growPercent, add growMultiplier function?
  Much better name given the output. Not sure if removedFunction error dialog/editing script will be too annoying.
  Changing the function name also allows reordering params as server, player, etc. like other formulas functions */
  get growPercent() {
    const BitNodeMultipliers = this.bnMults;
    return (_server, _threads, _player, _cores = 1) => {
      const server = helpers.server(_server);
      const p = helpers.person(_player);
      const threads = helpers.number("threads", _threads);
      const cores = helpers.number("cores", _cores);

      if (!server.serverGrowth) return 0;
      const hackDifficulty = server.hackDifficulty ?? 100;
      const numServerGrowthCycles = Math.max(Math.floor(threads), 0);

      // Get adjusted growth rate, which accounts for server security
      const growthRate = CONSTANTS.ServerBaseGrowthRate;
      let adjGrowthRate = 1 + (growthRate - 1) / hackDifficulty;
      if (adjGrowthRate > CONSTANTS.ServerMaxGrowthRate) {
        adjGrowthRate = CONSTANTS.ServerMaxGrowthRate;
      }

      // Calculate adjusted server growth rate based on parameters
      const serverGrowthPercentage = server.serverGrowth / 100;
      const numServerGrowthCyclesAdjusted =
        numServerGrowthCycles *
        serverGrowthPercentage *
        BitNodeMultipliers.ServerGrowthRate;

      // Apply serverGrowth for the calculated number of growth cycles
      const coreBonus = 1 + (cores - 1) / 16;
      return Math.pow(
        adjGrowthRate,
        numServerGrowthCyclesAdjusted * p.mults.hacking_grow * coreBonus
      );
    };
  }
  get growThreads() {
    const BitNodeMultipliers = this.bnMults;
    return (_server, _player, _targetMoney, _cores = 1) => {
      const server = helpers.server(_server);
      const person = helpers.person(_player);
      let targetMoney = helpers.number("targetMoney", _targetMoney);
      let startMoney = helpers.number(
        "server.moneyAvailable",
        server.moneyAvailable
      );
      const cores = helpers.number("cores", _cores);

      if (!server.serverGrowth) return Infinity;
      const moneyMax = server.moneyMax ?? 1;
      const hackDifficulty = server.hackDifficulty ?? 100;

      if (startMoney < 0) startMoney = 0; // servers "can't" have less than 0 dollars on them
      if (targetMoney > moneyMax) targetMoney = moneyMax; // can't grow a server to more than its moneyMax
      if (targetMoney <= startMoney) return 0; // no growth --> no threads

      // exponential base adjusted by security
      const adjGrowthRate =
        1 + (CONSTANTS.ServerBaseGrowthRate - 1) / hackDifficulty;
      const exponentialBase = Math.min(
        adjGrowthRate,
        CONSTANTS.ServerMaxGrowthRate
      ); // cap growth rate

      // total of all grow thread multipliers
      const serverGrowthPercentage = server.serverGrowth / 100.0;
      const coreMultiplier = 1 + (cores - 1) / 16;
      const threadMultiplier =
        serverGrowthPercentage *
        person.mults.hacking_grow *
        coreMultiplier *
        BitNodeMultipliers.ServerGrowthRate;

      /* To understand what is done below we need to do some math. I hope the explanation is clear enough.
       * First of, the names will be shortened for ease of manipulation:
       * n:= targetMoney (n for new), o:= startMoney (o for old), b:= exponentialBase, t:= threadMultiplier, c:= cycles/threads
       * c is what we are trying to compute.
       *
       * After growing, the money on a server is n = (o + c) * b^(c*t)
       * c appears in an exponent and outside it, this is usually solved using the productLog/lambert's W special function
       * this function will be noted W in the following
       * The idea behind lambert's W function is W(x)*exp(W(x)) = x, or in other words, solving for y, y*exp(y) = x, as a function of x
       * This function is provided in some advanced math library but we will compute it ourself here.
       *
       * Let's get back to solving the equation. It cannot be rewrote using W immediately because the base of the exponentiation is b
       * b^(c*t) = exp(ln(b)*c*t) (this is how a^b is defined on reals, it matches the definition on integers)
       * so n = (o + c) * exp(ln(b)*c*t) , W still cannot be used directly. We want to eliminate the other terms in 'o + c' and 'ln(b)*c*t'.
       *
       * A change of variable will do. The idea is to add an equation introducing a new variable (w here) in the form c = f(w) (for some f)
       * With this equation we will eliminate all references to c, then solve for w and plug the result in the new equation to get c.
       * The change of variable performed here should get rid of the unwanted terms mentioned above, c = w/(ln(b)*t) - o should help.
       * This change of variable is allowed because whatever the value of c is, there is a value of w such that this equation holds:
       * w = (c + o)*ln(b)*t  (see how we used the terms we wanted to eliminate in order to build this variable change)
       *
       * We get n = (o + w/(ln(b)*t) - o) * exp(ln(b)*(w/(ln(b)*t) - o)*t) [ = w/(ln(b)*t) * exp(w - ln(b)*o*t) ]
       * The change of variable exposed exp(w - o*ln(b)*t), we can rewrite that with exp(a - b) = exp(a)/exp(b) to isolate 'w*exp(w)'
       * n = w/(ln(b)*t) * exp(w)/exp(ln(b)*o*t) [ = w*exp(w) / (ln(b) * t * b^(o*t)) ]
       * Almost there, we just need to cancel the denominator on the right side of the equation:
       * n * ln(b) * t * b^(o*t) = w*exp(w), Thus w = W(n * ln(b) * t * b^(o*t))
       * Finally we invert the variable change: c = W(n * ln(b) * t * b^(o*t))/(ln(b)*t) - o
       *
       * There is still an issue left: b^(o*t) doesn't fit inside a double precision float
       * because the typical amount of money on servers is around 10^6~10^9
       * We need to get an approximation of W without computing the power when o is huge
       * Thankfully an approximation giving ~30% error uses log immediately so we will use
       * W(n * ln(b) * t * b^(o*t)) ~= log(n * ln(b) * t * b^(o*t)) = log(n * ln(b) * t) + log(exp(ln(b) * o * t))
       * = log(n * ln(b) * t) + ln(b) * o * t
       * (thanks to Drak for the grow formula, f4113nb34st and Wolfram Alpha for the rewrite, dwRchyngqxs for the explanation)
       */
      const x = threadMultiplier * Math.log(exponentialBase);
      const y = startMoney * x + Math.log(targetMoney * x);
      /* Code for the approximation of lambert's W function is adapted from
       * https://git.savannah.gnu.org/cgit/gsl.git/tree/specfunc/lambert.c
       * using the articles [1] https://doi.org/10.1007/BF02124750 (algorithm above)
       * and [2] https://doi.org/10.1145/361952.361970 (initial approximation when x < 2.5)
       */
      let w;
      if (y < Math.log(2.5)) {
        /* exp(y) can be safely computed without overflow.
         * The relative error on the result is better when exp(y) < 2.5
         * using Padé rational fraction approximation [2](5)
         */
        const ey = Math.exp(y);
        w = (ey + (4 / 3) * ey * ey) / (1 + (7 / 3) * ey + (5 / 6) * ey * ey);
      } else {
        /* obtain initial approximation from rough asymptotic [1](4.18)
         * w = y [- log y when 0 <= y]
         */
        w = y;
        if (y > 0) w -= Math.log(y);
      }
      let cycles = w / x - startMoney;

      /* Iterative refinement, the goal is to correct c until |(o + c) * b^(c*t) - n| < 1
       * or the correction on the approximation is less than 1
       * The Newton-Raphson method will be used, this method is a classic to find roots of functions
       * (given f, find c such that f(c) = 0).
       *
       * The idea of this method is to take the horizontal position at which the horizontal axis
       * intersects with of the tangent of the function's curve as the next approximation.
       * It is equivalent to treating the curve as a line (it is called a first order approximation)
       * If the current approximation is c then the new approximated value is c - f(c)/f'(c)
       * (where f' is the derivative of f).
       *
       * In our case f(c) = (o + c) * b^(c*t) - n, f'(c) = d((o + c) * b^(c*t) - n)/dc
       * = (ln(b)*t * (c + o) + 1) * b^(c*t)
       * And the update step is c[new] = c[old] - ((o + c) * b^(c*t) - n)/((ln(b)*t * (o + c) + 1) * b^(c*t))
       *
       * The main question to ask when using this method is "does it converges?"
       * (are the approximations getting better?), if it does then it does quickly.
       * DOES IT CONVERGES? In the present case it does. The reason why doesn't help explaining the algorithm.
       * If you are interested then check out the wikipedia page.
       */
      let bt = exponentialBase ** threadMultiplier;
      if (bt == Infinity) bt = 1e300;
      let corr = Infinity;
      // Two sided error because we do not want to get stuck if the error stays on the wrong side
      do {
        // c should be above 0 so Halley's method can't be used, we have to stick to Newton-Raphson
        let bct = bt ** cycles;
        if (bct == Infinity) bct = 1e300;
        const opc = startMoney + cycles;
        let diff = opc * bct - targetMoney;
        if (diff == Infinity) diff = 1e300;
        corr = diff / (opc * x + 1.0) / bct;
        cycles -= corr;
      } while (Math.abs(corr) >= 1);
      /* c is now within +/- 1 of the exact result.
       * We want the ceiling of the exact result, so the floor if the approximation is above,
       * the ceiling if the approximation is in the same unit as the exact result,
       * and the ceiling + 1 if the approximation is below.
       */
      const fca = Math.floor(cycles);
      if (
        targetMoney <=
        (startMoney + fca) * Math.pow(exponentialBase, fca * threadMultiplier)
      ) {
        return fca;
      }
      const cca = Math.ceil(cycles);
      if (
        targetMoney <=
        (startMoney + cca) * Math.pow(exponentialBase, cca * threadMultiplier)
      ) {
        return cca;
      }
      return cca + 1;
    };
  }
  hackTime(_server, _player) {
    const server = helpers.server(_server);
    const person = helpers.person(_player);
    return calculateHackingTime(server, person) * 1000;
  }
  growTime(_server, _player) {
    const server = helpers.server(_server);
    const person = helpers.person(_player);
    const growTimeMultiplier = 3.2; // Relative to hacking time. 16/5 = 3.2

    return growTimeMultiplier * calculateHackingTime(server, person) * 1000;
  }
  weakenTime(_server, _player) {
    const server = helpers.server(_server);
    const person = helpers.person(_player);
    const weakenTimeMultiplier = 4; // Relative to hacking time

    return weakenTimeMultiplier * calculateHackingTime(server, person) * 1000;
  }
}

/** Equivalent of formulas.hacknetNodes */
class HacknetNodes {}

/** Equivalent of formulas.hacknetServers */
class HacknetServers {}

/** Equivalent of formulas.gang */
class Gang {}

/** Equivalent of formulas.work */
class Work {}

/** Extra functions that calculate useful things. */
class Extra {}

const helpers = {
  server(s) {
    const fakeServer = {
      hostname: undefined,
      ip: undefined,
      sshPortOpen: undefined,
      ftpPortOpen: undefined,
      smtpPortOpen: undefined,
      httpPortOpen: undefined,
      sqlPortOpen: undefined,
      hasAdminRights: undefined,
      cpuCores: undefined,
      isConnectedTo: undefined,
      ramUsed: undefined,
      maxRam: undefined,
      organizationName: undefined,
      purchasedByPlayer: undefined,
    };
    const error = missingKey(fakeServer, s);
    if (error) {
      throw makeRuntimeErrorMsg(`server should be a Server.\n${error}`, "TYPE");
    }
    return s;
  },
  number(argName, v) {
    if (typeof v === "string") {
      const x = parseFloat(v);
      if (!isNaN(x)) return x; // otherwise it wasn't even a string representing a number.
    } else if (typeof v === "number") {
      if (isNaN(v)) throw makeRuntimeErrorMsg(`'${argName}' is NaN.`);
      return v;
    }
    throw makeRuntimeErrorMsg(
      `'${argName}' should be a number. ${debugType(v)}`,
      "TYPE"
    );
  },
  string(argName, v) {
    if (typeof v === "number") v = v + ""; // cast to string;
    assertString(argName, v);
    return v;
  },
  person(p) {
    const fakePerson = {
      hp: undefined,
      exp: undefined,
      mults: undefined,
      city: undefined,
    };
    const error = missingKey(fakePerson, p);
    if (error) {
      throw makeRuntimeErrorMsg(`person should be a Person.\n${error}`, "TYPE");
    }
    return p;
  },
};

const defaultMultipliers = () => {
  return {
    hacking_chance: 1,
    hacking_speed: 1,
    hacking_money: 1,
    hacking_grow: 1,
    hacking: 1,
    hacking_exp: 1,
    strength: 1,
    strength_exp: 1,
    defense: 1,
    defense_exp: 1,
    dexterity: 1,
    dexterity_exp: 1,
    agility: 1,
    agility_exp: 1,
    charisma: 1,
    charisma_exp: 1,
    hacknet_node_money: 1,
    hacknet_node_purchase_cost: 1,
    hacknet_node_ram_cost: 1,
    hacknet_node_core_cost: 1,
    hacknet_node_level_cost: 1,
    company_rep: 1,
    faction_rep: 1,
    work_money: 1,
    crime_success: 1,
    crime_money: 1,
    bladeburner_max_stamina: 1,
    bladeburner_stamina_gain: 1,
    bladeburner_analysis: 1,
    bladeburner_success_chance: 1,
  };
};

// These enums are accessible from ns, but we don't always *have* an NS object.

/** Names of all cities */
const CityName = {
  Aevum: "Aevum",
  Chongqing: "Chongqing",
  Sector12: "Sector-12",
  NewTokyo: "New Tokyo",
  Ishima: "Ishima",
  Volhaven: "Volhaven",
};

/** Names of all locations */
const LocationName = {
  AevumAeroCorp: "AeroCorp",
  AevumBachmanAndAssociates: "Bachman & Associates",
  AevumClarkeIncorporated: "Clarke Incorporated",
  AevumCrushFitnessGym: "Crush Fitness Gym",
  AevumECorp: "ECorp",
  AevumFulcrumTechnologies: "Fulcrum Technologies",
  AevumGalacticCybersystems: "Galactic Cybersystems",
  AevumNetLinkTechnologies: "NetLink Technologies",
  AevumPolice: "Aevum Police Headquarters",
  AevumRhoConstruction: "Rho Construction",
  AevumSnapFitnessGym: "Snap Fitness Gym",
  AevumSummitUniversity: "Summit University",
  AevumWatchdogSecurity: "Watchdog Security",
  AevumCasino: "Iker Molina Casino",

  ChongqingKuaiGongInternational: "KuaiGong International",
  ChongqingSolarisSpaceSystems: "Solaris Space Systems",
  ChongqingChurchOfTheMachineGod: "Church of the Machine God",

  Sector12AlphaEnterprises: "Alpha Enterprises",
  Sector12BladeIndustries: "Blade Industries",
  Sector12CIA: "Central Intelligence Agency",
  Sector12CarmichaelSecurity: "Carmichael Security",
  Sector12CityHall: "Sector-12 City Hall",
  Sector12DeltaOne: "DeltaOne",
  Sector12FoodNStuff: "FoodNStuff",
  Sector12FourSigma: "Four Sigma",
  Sector12IcarusMicrosystems: "Icarus Microsystems",
  Sector12IronGym: "Iron Gym",
  Sector12JoesGuns: "Joe's Guns",
  Sector12MegaCorp: "MegaCorp",
  Sector12NSA: "National Security Agency",
  Sector12PowerhouseGym: "Powerhouse Gym",
  Sector12RothmanUniversity: "Rothman University",
  Sector12UniversalEnergy: "Universal Energy",

  NewTokyoDefComm: "DefComm",
  NewTokyoGlobalPharmaceuticals: "Global Pharmaceuticals",
  NewTokyoNoodleBar: "Noodle Bar",
  NewTokyoVitaLife: "VitaLife",
  NewTokyoArcade: "Arcade",

  IshimaNovaMedical: "Nova Medical",
  IshimaOmegaSoftware: "Omega Software",
  IshimaStormTechnologies: "Storm Technologies",
  IshimaGlitch: "0x6C1",

  VolhavenCompuTek: "CompuTek",
  VolhavenHeliosLabs: "Helios Labs",
  VolhavenLexoCorp: "LexoCorp",
  VolhavenMilleniumFitnessGym: "Millenium Fitness Gym",
  VolhavenNWO: "NWO",
  VolhavenOmniTekIncorporated: "OmniTek Incorporated",
  VolhavenOmniaCybersystems: "Omnia Cybersystems",
  VolhavenSysCoreSecurities: "SysCore Securities",
  VolhavenZBInstituteOfTechnology: "ZB Institute of Technology",

  Hospital: "Hospital",
  Slums: "The Slums",
  TravelAgency: "Travel Agency",
  WorldStockExchange: "World Stock Exchange",

  Void: "The Void",
};

// Some of these (like version) will get out of date quickly, but they also
// aren't needed for formulas.
const CONSTANTS = {
  VersionString: "2.3.1",
  isDevBranch: true,
  VersionNumber: 31,

  /** Max level for any skill, assuming no multipliers. Determined by max numerical value in javascript for experience
   * and the skill level formula in Player.js. Note that all this means it that when experience hits MAX_INT, then
   * the player will have this level assuming no multipliers. Multipliers can cause skills to go above this.
   */
  MaxSkillLevel: 975,

  // Milliseconds per game cycle
  MilliPerCycle: 200,

  // How much reputation is needed to join a megacorporation's faction
  CorpFactionRepRequirement: 400e3,

  // Base RAM costs
  BaseCostFor1GBOfRamHome: 32000,
  BaseCostFor1GBOfRamServer: 55000, // 1 GB of RAM

  // Cost to travel to another city
  TravelCost: 200e3,

  // Faction and Company favor-related things
  BaseFavorToDonate: 150,
  DonateMoneyToRepDivisor: 1e6,
  FactionReputationToFavorBase: 500,
  FactionReputationToFavorMult: 1.02,
  CompanyReputationToFavorBase: 500,
  CompanyReputationToFavorMult: 1.02,

  // NeuroFlux Governor Augmentation cost multiplier
  NeuroFluxGovernorLevelMult: 1.14,

  NumNetscriptPorts: Number.MAX_SAFE_INTEGER,

  // Server-related constants
  HomeComputerMaxRam: 1073741824, // 2 ^ 30
  ServerBaseGrowthRate: 1.03, // Unadjusted Growth rate
  ServerMaxGrowthRate: 1.0035, // Maximum possible growth rate (max rate accounting for server security)
  ServerFortifyAmount: 0.002, // Amount by which server's security increases when its hacked/grown
  ServerWeakenAmount: 0.05, // Amount by which server's security decreases when weakened

  PurchasedServerLimit: 25,
  PurchasedServerMaxRam: 1048576, // 2^20

  // Augmentation Constants
  MultipleAugMultiplier: 1.9,

  // TOR Router
  TorRouterCost: 200e3,

  // Stock market
  WSEAccountCost: 200e6,
  TIXAPICost: 5e9,
  MarketData4SCost: 1e9,
  MarketDataTixApi4SCost: 25e9,
  StockMarketCommission: 100e3,

  // Hospital/Health
  HospitalCostPerHp: 100e3,

  // Intelligence-related constants
  IntelligenceCrimeWeight: 0.025, // Weight for how much int affects crime success rates
  IntelligenceInfiltrationWeight: 0.1, // Weight for how much int affects infiltration success rates
  IntelligenceCrimeBaseExpGain: 0.05,
  IntelligenceProgramBaseExpGain: 0.1, // Program required hack level divided by this to determine int exp gain
  IntelligenceGraftBaseExpGain: 0.05,
  IntelligenceTerminalHackBaseExpGain: 200, // Hacking exp divided by this to determine int exp gain
  IntelligenceSingFnBaseExpGain: 1.5,
  IntelligenceClassBaseExpGain: 0.01,

  // Time-related constants
  MillisecondsPer20Hours: 72000000,
  GameCyclesPer20Hours: 72000000 / 200,

  MillisecondsPer10Hours: 36000000,
  GameCyclesPer10Hours: 36000000 / 200,

  MillisecondsPer8Hours: 28800000,
  GameCyclesPer8Hours: 28800000 / 200,

  MillisecondsPer4Hours: 14400000,
  GameCyclesPer4Hours: 14400000 / 200,

  MillisecondsPer2Hours: 7200000,
  GameCyclesPer2Hours: 7200000 / 200,

  MillisecondsPerHour: 3600000,
  GameCyclesPerHour: 3600000 / 200,

  MillisecondsPerHalfHour: 1800000,
  GameCyclesPerHalfHour: 1800000 / 200,

  MillisecondsPerQuarterHour: 900000,
  GameCyclesPerQuarterHour: 900000 / 200,

  MillisecondsPerFiveMinutes: 300000,
  GameCyclesPerFiveMinutes: 300000 / 200,

  // Player Work & Action
  BaseFocusBonus: 0.8,

  ClassDataStructuresBaseCost: 40,
  ClassNetworksBaseCost: 80,
  ClassAlgorithmsBaseCost: 320,
  ClassManagementBaseCost: 160,
  ClassLeadershipBaseCost: 320,
  ClassGymBaseCost: 120,

  ClassStudyComputerScienceBaseExp: 0.5,
  ClassDataStructuresBaseExp: 1,
  ClassNetworksBaseExp: 2,
  ClassAlgorithmsBaseExp: 4,
  ClassManagementBaseExp: 2,
  ClassLeadershipBaseExp: 4,

  // Coding Contract
  // TODO: Move this into Coding contract implementation?
  CodingContractBaseFactionRepGain: 2500,
  CodingContractBaseCompanyRepGain: 4000,
  CodingContractBaseMoneyGain: 75e6,

  // Augmentation grafting multipliers
  AugmentationGraftingCostMult: 3,
  AugmentationGraftingTimeBase: 3600000,

  // SoA mults
  SoACostMult: 7,
  SoARepMult: 1.3,

  // Value raised to the number of entropy stacks, then multiplied to player multipliers
  EntropyEffect: 0.98,

  // BitNode/Source-File related stuff
  TotalNumBitNodes: 24,

  InfiniteLoopLimit: 2000,

  Donations: 79,

  // Also update doc/source/changelog.rst
  LatestUpdate: `
v2.3.1 dev
----------

GENERAL / MISC:

* Tail window overhaul, ability to set tail title with ns.setTitle, other tail bugfixes and improvements. (@d0sboots)
* Nerf noodle bar
`,
};

function assertString(argName, v) {
  if (typeof v !== "string") {
    throw makeRuntimeErrorMsg(
      ctx,
      `${argName} expected to be a string. ${debugType(v)}`,
      "TYPE"
    );
  }
}

/**
 * @param {string} msg
 * @param {string} type
 * @return {Error}
 * Creates an error message string with a stack trace.
 */
function makeRuntimeErrorMsg(msg, type = "RUNTIME") {
  return new Error(`Formulas ${type} error\n\n${msg}`);
}

function debugType(v) {
  if (v === null) return "Is null.";
  if (v === undefined) return "Is undefined.";
  if (typeof v === "function") return "Is a function.";
  return `Is of type '${typeof v}', value: ${userFriendlyString(v)}`;
}

function missingKey(expect, actual) {
  if (typeof actual !== "object" || actual === null) {
    return `Expected to be an object, was ${
      actual === null ? "null" : typeof actual
    }.`;
  }
  for (const key in expect) {
    if (!(key in actual)) {
      return `Property ${key} was expected but not present.`;
    }
  }
  return false;
}

function userFriendlyString(v) {
  const clip = (s) => {
    if (s.length > 15) return s.slice(0, 12) + "...";
    return s;
  };
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v === "") return "empty string";
    return `'${clip(v)}'`;
  }
  const json = JSON.stringify(v);
  if (!json) return "???";
  return `'${clip(json)}'`;
}

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
function calculateHackingTime(server, person) {
  const hackDifficulty = server.hackDifficulty;
  const requiredHackingSkill = server.requiredHackingSkill;
  if (!hackDifficulty || !requiredHackingSkill) return Infinity;
  const difficultyMult = requiredHackingSkill * hackDifficulty;

  const baseDiff = 500;
  const baseSkill = 50;
  const diffFactor = 2.5;
  let skillFactor = diffFactor * difficultyMult + baseDiff;
  skillFactor /= person.skills.hacking + baseSkill;

  const hackTimeMultiplier = 5;
  const hackingTime =
    (hackTimeMultiplier * skillFactor) /
    (person.mults.hacking_speed *
      calculateIntelligenceBonus(person.skills.intelligence, 1));

  return hackingTime;
}
