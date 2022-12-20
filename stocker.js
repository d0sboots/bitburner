import { stubCall } from "/lib/stubcall.js";

async function refreshPrice(ns, stocks) {
  return stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      stock.price = ns.stock["getPrice"](stock.sym);
    }
  });
}

async function refreshRemaining(ns, stocks) {
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      stock.bid = ns.stock["getBidPrice"](stock.sym);
    }
  });
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      stock.ask = ns.stock["getAskPrice"](stock.sym);
    }
  });
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      const res = ns.stock["getPosition"](stock.sym);
      stock.shares = res[0];
      stock.avgPx = res[1];
    }
  });
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      const f = (stock.forecast = ns.stock["getForecast"](stock.sym));
      stock.profit = stock.v * (2 * f - 1);
    }
  });
}

async function refresh(ns, stocks) {
  await refreshPrice(ns, stocks);
  return refreshRemaining(ns, stocks);
}

function deepCopy(stocks) {
  return new Map(
    (function* () {
      for (const [sym, entry] of stocks.entries()) {
        yield [sym, Object.assign({}, entry)];
      }
    })()
  );
}

async function getSymbols(ns) {
  return stubCall(ns, (ns) => {
    if (!ns.stock["hasWSEAccount"]()) {
      ns.tprintf("ERROR: Need WSE Account!");
      return false;
    }
    if (!ns.stock["hasTIXAPIAccess"]()) {
      ns.tprintf("ERROR: Need TIX API!");
      return false;
    }
    if (!ns.stock["has4SData"]()) {
      ns.tprintf("ERROR: Need 4S Data!");
      return false;
    }
    if (!ns.stock["has4SDataTIXAPI"]()) {
      ns.tprintf("ERROR: Need 4S Data API!");
      return false;
    }
    return ns.stock["getSymbols"]();
  });
}

async function getStocks(ns, allStocks) {
  const stocks = new Map();
  for (const sym of allStocks) {
    stocks.set(sym, {
      sym,
      avgPx: 0,
      maxShares: null,
      shares: 0,
      price: null,
      bid: null,
      ask: null,
      volatility: null,
      forecast: null,
    });
  }
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      const v = (stock.volatility = ns.stock["getVolatility"](stock.sym));
      stock.v = Math.log1p(v) * (1 / v + 1) - 1;
    }
  });
  await stubCall(ns, (ns) => {
    for (const stock of stocks.values()) {
      stock.maxShares = ns.stock["getMaxShares"](stock.sym);
    }
  });
  await refresh(ns, stocks);
  return stocks;
}

function printStats(ns, stats, stocks) {
  ns.clearLog();
  const moneyFmt = (x) => {
    const pf = ns.sprintf("$%.0f", x);
    const ef = ns.sprintf("$%.6e", x);
    return ef.length < pf.length ? ef : pf;
  };
  let invested = 0;
  for (const stock of stocks.values()) {
    invested += stock.avgPx * stock.shares;
  }
  const current = stats.current.length ? stats.current[0][0] : 0;
  const sLast = stats.current[stats.current.length - 1];
  const income =
    stats.current.length > 1
      ? ((sLast[0] - stats.current[0][0]) * 1000) /
        (sLast[1] - stats.current[0][1])
      : 0;
  ns.printf(
    `
┌──────────────┬─────────────────┐
│ Best         │ %15s │
│ Invested $$$ │ %15s │
│ Current $$$  │ %15s │
│ Total income │ %15s │
│ Money/sec    │ %15s │
│ Flip at:     │ %15d │
└──────────────┴─────────────────┘`,
    "",
    moneyFmt(invested),
    moneyFmt(current),
    moneyFmt(current + stats.total),
    moneyFmt(income),
    stats.flip
  );
}

function addObs(stats, stocks) {
  let value = 0;
  for (const stock of stocks.values()) {
    value += stock.price * stock.shares;
  }
  stats.current.unshift([value, performance.now()]);
  if (stats.current.length > 31) {
    stats.current.slice(31);
  }
}

async function trade(ns, stats, stocks, sym, amount, money) {
  const commision = 100e3;
  let cost;
  const s = stocks.get(sym);
  if (amount > 0) {
    amount = Math.min(amount, s.maxShares - s.shares) | 0;
    cost = s.ask * amount + commision;
    if (cost > money) {
      amount = ((money - commision) / s.ask) | 0;
      cost = s.ask * amount + commision;
    }
    if (amount > 0) {
      ns.tprintf("Buying %f shares of %s for %f", amount, sym, cost);
      const res = await stubCall(ns, (ns) => ns.stock["buyStock"](sym, amount));
      if (!res) {
        throw new Error(`Couldn't buy ${amount} shares of ${sym}`);
      }
    } else {
      cost = 0;
    }
  } else {
    if (-amount > s.shares) {
      amount = -s.shares;
    }
    amount = Math.ceil(amount);
    if (amount < 0) {
      cost = s.bid * amount + commision;
      ns.tprintf("Selling %f shares of %s for %f", -amount, sym, -cost);
      const res = await stubCall(ns, (ns) =>
        ns.stock["sellStock"](sym, -amount)
      );
      if (!res) {
        throw new Error(`Couldn't sell ${-amount} shares of ${sym}`);
      }
    } else {
      cost = 0;
    }
  }
  s.shares += amount;
  stats.total -= cost - commision;
  return money - cost;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.tail();
  ns.atExit(() => ns.closeTail());
  setTimeout(() => ns.resizeTail(333, 159), 5);
  const allStocks = await getSymbols(ns);
  if (!allStocks) return;
  const stocks = await getStocks(ns, allStocks);
  const stats = {
    best: "",
    current: [],
    total: 0,
    flip: 999,
  };

  let targetTime = performance.now();
  let first = true;
  while (true) {
    targetTime += 250;
    await ns.asleep(targetTime - performance.now());
    const old = deepCopy(stocks);
    await refreshPrice(ns, stocks);
    if (
      !first &&
      allStocks.every((sym) => old.get(sym).price === stocks.get(sym).price)
    ) {
      printStats(ns, stats, stocks);
      continue;
    }
    await refreshRemaining(ns, stocks);
    addObs(stats, stocks);
    stats.flip--;
    let flipcount = 0;
    for (const sym of allStocks) {
      const oldFc = old.get(sym).forecast;
      if ((oldFc - 0.5) * (stocks.get(sym).forecast - 0.5) < 0) {
        flipcount++;
      }
    }
    if (flipcount >= 3) {
      stats.flip = 75;
    } else if (!first) {
      printStats(ns, stats, stocks);
      continue;
    }
    first = false;
    let money = await stubCall(ns, (ns) =>
      ns["getServerMoneyAvailable"]("home")
    );
    const sorted = [...stocks.values()];
    // Sort descending
    sorted.sort((a, b) => b.profit - a.profit);
    let hole = false;
    for (const stock of sorted) {
      if (hole || stock.profit < 0) {
        // Sell all
        money = await trade(ns, stats, stocks, stock.sym, -1e100, money);
      }
      if (stock.shares < stock.maxShares) {
        hole = true;
      }
    }
    for (const stock of sorted) {
      if (stock.shares < stock.maxShares && stock.profit > 0) {
        // Buy all
        money = await trade(ns, stats, stocks, stock.sym, 1e100, money);
      }
      if (money <= 0) {
        break;
      }
    }
    global.stock = stocks.get("SGC").forecast > 0.5 ? "buy" : "sell";
    addObs(stats, stocks);
    printStats(ns, stats, stocks);
  }
}
