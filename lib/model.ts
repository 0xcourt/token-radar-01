// Token Radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board ranks every genuine pre-token protocol the snapshot carries: the 40 watchlist slugs
// (the floor, never the ceiling) plus every other pre-token protocol below the floor that passes
// the same genuineness rule the watchlist uses. A protocol is pre-token when its record lists no
// token (no market cap, no CoinGecko id, no symbol). Live-token protocols are kept apart and shown
// with their market caps, never mixed into the ranking.
//
// A wrapped, staked or bridged product of a token that already trades is not a launch waiting to
// happen, so the board sets those aside: Bridge / Canonical Bridge / Liquid Staking / Liquid
// Restaking / Restaked BTC categories, exchange products, versioned pools (a name ending in V2,
// 2.0 and the like) and names carrying a whole word wrapped, staked or staking. That is the
// watchlist's own rule, applied to the whole board instead of only to its floor.
//
// Implied value follows only from the snapshot's own figures, through four factors:
//
//   scale   = 5 x tvl_usd^0.85          sublinear: a 10x bigger TVL is worth ~7x, not 10x,
//                                          so growth, age and reach can still move a rank
//   growth  = 1 + 0.6 x clamp(change_7d, -50, 100) / 100
//                                          the week's momentum, capped so one wild print
//                                          (the snapshot's biggest is +4,448%) cannot buy rank 1
//   age     = the launch window: ramps 0.55 -> 1.00 over the first 90 days (too young to
//                                          have proven anything), 0.85 -> 1.00 across days 90..1095
//                                          (the prime window: old enough to matter, young enough
//                                          to still launch), then fades 1.00 -> 0.85 past day 1095
//                                          (four years with no token starts to look like never);
//                                          an unknown listing date scores 0.80
//   chains  = 1 + 0.04 x min(chains - 1, 4)
//                                          each extra chain is one more surface to farm on
//   implied = max(1, round(scale x growth x age x chains))
//
// No protocol name is ever special-cased: the same function scores every row. A readiness score
// 0..100, shown on the board, is the same four factors blended (age 50%, growth 30%, chains 20%),
// so a reader can see at a glance why a row sits where it sits.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  scale: number;
  tvl_exponent: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_ramp_days: number;
  age_peak_days: number;
  age_fade_days: number;
  age_unknown: number;
  chain_step: number;
  chain_max_steps: number;
}

export const MODEL: ModelConstants = {
  scale: 5,
  tvl_exponent: 0.85,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  age_ramp_days: 90,
  age_peak_days: 1095,
  age_fade_days: 730,
  age_unknown: 0.8,
  chain_step: 0.04,
  chain_max_steps: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  readiness: number;
  model: {
    scale: number;
    tvl_exponent: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included so the page and the board agree. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  readiness: number;
  growth_multiplier: number;
  age_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pre_token_count: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The launch-window factor for an age in days: ramps up, holds the prime window, fades slowly. */
export function ageMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return model.age_unknown;
  if (age < model.age_ramp_days) return 0.55 + (0.45 * age) / model.age_ramp_days;
  if (age <= model.age_peak_days) return 0.85 + (0.15 * (age - model.age_ramp_days)) / (model.age_peak_days - model.age_ramp_days);
  const past = Math.min(age - model.age_peak_days, model.age_fade_days);
  return Math.max(0.85, 1 - (0.15 * past) / model.age_fade_days);
}

/** The chain-breadth factor: one more surface per extra chain, up to the cap. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, Math.min(chains.length - 1, model.chain_max_steps));
  return 1 + model.chain_step * extra;
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; ageMult: number; chainMult: number; age: number | null; readiness: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageMult = ageMultiplier(age, model);
  const chainMult = chainMultiplier(protocol.chains, model);
  const scale = model.scale * Math.pow(Math.max(protocol.tvl_usd, 1), model.tvl_exponent);
  const implied = Math.max(1, Math.round(scale * growthMult * ageMult * chainMult));
  const readiness = Math.max(
    1,
    Math.min(
      100,
      Math.round(100 * (0.5 * ageMult + 0.3 * ((growthMult - 0.7) / 0.9) + 0.2 * ((chainMult - 1) / (model.chain_step * model.chain_max_steps)))),
    ),
  );
  return { implied, growthPct, growthMult, ageMult, chainMult, age, readiness };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name: a product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Names that begin with an exchange's name are that exchange's product, not a launch. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
/** Categories that are a wrapped, staked or bridged product, or an exchange itself. */
const SET_ASIDE_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and a genuine launch candidate. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !SET_ASIDE_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other genuine pre-token protocol in the snapshot, whatever its TVL.
  // No cap, no hand-picked list: the radar exists to find these early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    readiness: s.readiness,
    model: {
      scale: model.scale,
      tvl_exponent: model.tvl_exponent,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** Typical gas for one transaction on the protocol's first chain, in whole dollars. */
function gasFor(chain: string): string {
  const g: Record<string, string> = {
    Ethereum: '$8',
    Solana: '$0.05',
    Base: '$0.30',
    Arbitrum: '$0.40',
    Optimism: '$0.40',
    Binance: '$0.20',
    Avalanche: '$0.50',
    Polygon: '$0.10',
    Tron: '$1',
    Bitcoin: '$3',
  };
  return g[chain] ?? '$2';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main farming action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and leave it earning.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position open.`;
  if (c.includes('yield'))
    return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and keep the shares.`;
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares while its curator allocates.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the yield-bearing asset ${name} offers on ${chain} and hold it.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade.`;
  if (c.includes('prediction'))
    return `Fund $${capital} of USDC on ${name} and place one position on a market that settles within a month.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once.`;
}

/** The category's second qualifying action: a different touchpoint, so the wallet is not one-note. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Borrow $20 of USDC against the supply on ${name}, repay it within a week, and keep the supply untouched.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Swap $10 of USDC for another asset through ${name}'s own pool on ${chain} and leave the liquidity position open.`;
  if (c.includes('yield') || c.includes('risk curator') || c.includes('capital allocator') || c.includes('curator') || c.includes('allocator'))
    return `Add a second, smaller deposit to a different ${name} vault on ${chain} so the wallet touches two products.`;
  if (c.includes('rwa'))
    return `Move a second $25 into the same ${name} asset on ${chain} a week later, so the position grows in two steps.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Close the first trade on ${name} after a few days and open a second small one, so the wallet shows repeat use.`;
  if (c.includes('prediction'))
    return `Place a second $10 position on a different ${name} market, so the wallet is not a single bet.`;
  if (c.includes('insurance'))
    return `Renew or top up the ${name} cover on ${chain} once, so the policy spans more than one month.`;
  if (c.includes('stable'))
    return `Swap $10 of the stable asset back and forth through ${name} on ${chain} once, to show the wallet uses it.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Delegate a second small stake through ${name} a week later, so the wallet stakes more than once.`;
  if (c.includes('bridge'))
    return `Bridge $10 back through ${name} a week later, so the wallet shows two-way use.`;
  return `Use a second feature of ${name} on ${chain} once, such as a swap, a vote or a claim, so the wallet is not one-note.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step names what to do, what it costs and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, write its seed phrase on paper, and keep it offline.`,
      cost: 'nothing to open, about $3 to fund it',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: `about ${gas} of gas plus the small amounts moved`,
      time: '10 minutes',
    },
    {
      text: `Do one qualifying action each week on ${p.name}, such as a deposit, a swap, a vote or a claim, and never let a month pass with no activity.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity is counted in more than one snapshot instead of a single week.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from the link the protocol itself publishes, and check whether the wallet qualifies.`,
      cost: 'no fee to check, and never pay anyone to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in reverse: claim first, withdraw the position, and only then close the wallet.`,
      cost: `about ${gas} of gas to exit`,
      time: '15 minutes to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    readiness: row.readiness,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_count: preToken,
    watchlist: snapshot.watchlist.slice(),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
