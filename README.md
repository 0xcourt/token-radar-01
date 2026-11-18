# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xcourt/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xcourt/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar, model radar-2: a dashboard that ranks every genuine pre-token protocol in the frozen DefiLlama snapshot (758 protocols, 2026-11-14) by implied value — what its token would be worth if the protocol stays as it is today — and gives each one a concrete 7-step farm plan with a cost and a time on every step.

The board covers all 40 watchlist protocols plus 158 early finds below the $50M watchlist floor (198 rows), and sets the 24 live-token protocols aside with their market caps. Implied value is one function of the snapshot's own figures, never a list of names: sublinear TVL scale (5 × TVL^0.85), capped 7-day growth momentum, a launch-window age factor (ramps over 90 days, holds the prime 90–1095 day window, fades after), and chain breadth. Wrapped, staked and bridged products of tokens that already trade are set aside by the same rule the watchlist uses. The dashboard is a static, offline page: sortable and filterable board, top-10 spotlight, readiness score per row, per-protocol detail with the model's factor breakdown, and a live-token view.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=e57xstcn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
