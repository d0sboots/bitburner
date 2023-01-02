// Directly copied from the source, with a few utility functions added
export class WHRNG {
  s1 = 0;
  s2 = 0;
  s3 = 0;

  constructor(seed) {
    const v = (seed / 1000) % 30000;
    this.s1 = v;
    this.s2 = v;
    this.s3 = v;
  }

  step() {
    this.s1 = (171 * this.s1) % 30269;
    this.s2 = (172 * this.s2) % 30307;
    this.s3 = (170 * this.s3) % 30323;
  }

  random() {
    this.step();
    return Math.floor(
      ((this.s1 / 30269.0 + this.s2 / 30307.0 + this.s3 / 30323.0) % 1.0) * 37
    );
  }

  clone() {
    const copy = new WHRNG(0);
    copy.s1 = this.s1;
    copy.s2 = this.s2;
    copy.s3 = this.s3;
    return copy;
  }

  matches(num, won) {
    while (true) {
      const val = this.random();
      // If value is in low range, it may have been skipped due to house
      // cheating.
      if (!won && val > 0 && val <= 18) continue;
      return val === num;
    }
  }
}

// Scrape the DOM and get the current roulette state
function getLastPlay(h4s) {
  for (let i = 0; i < h4s.length; ++i) {
    const e = h4s[i];
    if (e.innerText !== "Iker Molina Casino") continue;
    if (h4s.length <= i + 2) {
      return null;
    }
    const match1 = /^(\d\d?)[RB]?$/.exec(h4s[i + 1].innerText);
    if (!match1) {
      return null;
    }
    const match2 = /^won|^lost|^playing$|^waiting$/.exec(h4s[i + 2].innerText);
    if (!match2) {
      return null;
    }
    return [match2[0], match1[1] | 0];
  }
  return null;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  ns.clearLog();
  ns.tail();
  ns.atExit(() => ns.closeTail());
  await ns.asleep(5);
  ns.resizeTail(389, 100);
  const doc = globalThis["document"];
  // State is both used as an enum, but also is the function to call to
  // process the current state and transition to the next one.
  let state = waiting;
  let timebase = 0;
  let seeds = [];
  let bet = 0;
  let nextseq = "";

  while (true) {
    ns.clearLog();
    state();
    await ns.asleep(100);
  }
  return;

  function next_bet() {
    const seed_copy = seeds[0].clone();
    bet = seeds[0].random();
    const acc = [];
    for (let i = 0; i < 8; ++i) {
      acc.push(seed_copy.random());
    }
    nextseq = acc.join(" ");
  }

  function ready_playing() {
    return ready();
  }

  function ready() {
    const play = getLastPlay(doc.getElementsByTagName("h4"));
    if (!play) {
      state = waiting;
      return state();
    }
    if (play[0] === "playing") {
      state = ready_playing;
    }
    if (play[0] === "waiting") {
      state = error;
      return state();
    }
    if ((play[0] === "won" || play[0] === "lost") && state == ready_playing) {
      state = ready;
      if (play[0] === "won") {
        if (play[1] !== bet) {
          state = error;
          return state();
        }
      } else {
        // Player might misclick on the wrong thing, we're still OK if we lose
        // but land on the predicted number.
        if (play[1] !== bet) {
          let nextnum;
          while ((nextnum = seeds[0].random()) === bet) {}
          if (play[1] !== nextnum) {
            state = error;
            return state();
          }
        }
      }
      next_bet();
    }
    const state_str = state === ready_playing ? "Playing" : "Ready";
    const bet_str = state === ready_playing ? "" : bet;
    ns.printf(
      `
State: ${state_str}
Bet on: ${bet_str}
Go big: \x1b[5mYES\x1b[0m
Bet sequence: ${nextseq}
      `.trim()
    );
  }

  function error() {
    const play = getLastPlay(doc.getElementsByTagName("h4"));
    if (!play) {
      state = waiting;
      return state();
    }
    // "ERROR" is written with an Omicron to avoid triggering the style regex
    ns.printf(
      `
State: \x1b[31mERRΟR\x1b[0m
Couldn't determine seed. Leave the Roulette table and come back.
This may be caused by betting incorrectly, or possibly by a logic bug.
      `.trim()
    );
  }

  function playing() {
    return study();
  }

  function study() {
    const play = getLastPlay(doc.getElementsByTagName("h4"));
    if (!play) {
      state = waiting;
      return state();
    }
    if (play[0] === "playing") {
      state = playing;
    }
    if (play[0] === "waiting" && state === waiting) {
      state = study;
      timebase = Date.now();
      seeds = [];
      for (let i = -1000; i <= 0; ++i) {
        seeds[i + 1000] = new WHRNG(timebase + i);
      }
    }
    if ((play[0] === "won" || play[0] === "lost") && state == playing) {
      state = study;
      const won = play[0] === "won";
      const num = play[1];
      // Always clear seeds if won doesn't line up with Low/High expectation,
      // that way we will fall into error state immediately.
      if ((won && num > 18) || (!won && num <= 18 && num > 0)) {
        seeds = [];
      }
      let pushIdx = 0;
      for (let i = 0; i < seeds.length; ++i) {
        const seed = seeds[i];
        seeds[pushIdx] = seed;
        if (seed.matches(num, won)) {
          pushIdx++;
        }
      }
      seeds.splice(pushIdx);
      if (!seeds.length) {
        state = error;
        return state();
      }
      if (seeds.length === 1) {
        state = ready;
        next_bet();
        return state();
      }
    }
    const state_str = state === playing ? "Playing" : "Finding state";
    ns.printf(
      `
State: ${state_str}
Bet on: Low
Go big: \x1b[31mNO\x1b[0m
Seeds remaining: ${seeds.length}
      `.trim()
    );
  }

  function waiting() {
    const play = getLastPlay(doc.getElementsByTagName("h4"));
    if (play) {
      return study();
    }
    ns.printf(
      `
State: Waiting to play roulette
Bet on: Low
Go big: \x1b[31mNO\x1b[0m
\u180e
      `.trim()
    );
  }
}
