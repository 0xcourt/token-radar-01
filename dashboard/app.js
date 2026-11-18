// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a top-10 spotlight, a filterable and sortable table, a
// per-protocol detail view with the model's own factors and the protocol's farm plan, and the
// live-token set kept apart. No network: every byte it shows is in data.js.
//
// The farm plan on screen is the farm plan board.json carries: data.js ships each row's seven
// steps, and the page renders them unchanged. The page also recomputes every row's implied value
// from the snapshot figures (impliedOf, the same four factors main.ts uses) and says so in the
// detail view, so the screenshots, the page's code and the board's data visibly agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: scale x growth x age x chains, recomputed from the row's own
  // snapshot figures and the model constants data.js carries. Same arithmetic as lib/model.ts.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? null : row.age_days;
    var ageMult;
    if (age === null) ageMult = model.age_unknown;
    else if (age < model.age_ramp_days) ageMult = 0.55 + (0.45 * age) / model.age_ramp_days;
    else if (age <= model.age_peak_days) ageMult = 0.85 + (0.15 * (age - model.age_ramp_days)) / (model.age_peak_days - model.age_ramp_days);
    else ageMult = Math.max(0.85, 1 - (0.15 * Math.min(age - model.age_peak_days, model.age_fade_days)) / model.age_fade_days);
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, model.chain_max_steps));
    var chainMult = 1 + model.chain_step * extra;
    return Math.max(1, Math.round(model.scale * Math.pow(Math.max(row.tvl_usd, 1), model.tvl_exponent) * growthMult * ageMult * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !WATCH[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'readiness') { av = a.readiness; bv = b.readiness; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function band() {
    var top = DATA.rows[0];
    return el('header', { class: 'band' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar · model ' + DATA.model_version })),
      el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
      el('p', { text: 'Every protocol in the snapshot that records no token, ranked by what its token would be worth if the protocol stays as it is today — and what to do about it, step by step, with a cost and a time on each step.' }),
      el('div', { class: 'band-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Top pick ', el('b', { text: top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) : 'n/a' })),
        el('span', null, 'Board ', el('b', { text: DATA.board_size + ' rows' }))
      )
    );
  }

  function facts() {
    return el('section', { class: 'facts' },
      el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is on the board' })),
      el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.pre_token_count + ' protocols record no token at all' })),
      el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) }), el('small', { text: 'found before the $50M watchlist line' })),
      el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'they already trade — market cap, not a model' }))
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 10);
    var cards = top.map(function (r) {
      return el('button', { class: 'card', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'RANK ' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) + ' implied' }),
        el('span', { class: 'ready' }, el('i', { style: 'width:' + r.readiness + '%' })),
        el('span', { class: 'ready-note', text: 'Readiness ' + r.readiness + '/100' })
      );
    });
    return el('section', { class: 'spot' },
      el('h2', { text: 'Top 10 to farm first' }),
      el('p', { text: 'The strongest implied values on the board. Select any card for its model and farm plan.' }),
      el('div', { class: 'spot-grid' }, cards)
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('label', { class: 'check', for: 'watch' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, el('span', { text: r.name }), WATCH[r.slug] ? el('span', { class: 'watch', text: 'WATCH' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'ready-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + r.readiness + '%' })),
          el('span', { class: 'num', text: String(r.readiness) })
        ),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. WATCH marks the 40 watchlist protocols. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('readiness', 'Ready'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The page recomputes each row from these same figures and checks the number board.json carries.' }),
      el('div', { class: 'formula' },
        'implied = round( ' + m.scale + ' x tvl_usd^' + m.tvl_exponent + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x age_window(age_days) x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_max_steps + ')) )'
      ),
      el('table', { class: 'factor-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Factor' }), el('th', { text: 'What it does' }), el('th', { class: 'num', text: 'Range' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'Scale' }), el('td', { text: 'Sublinear in TVL: a 10x bigger protocol is worth about 7x, so growth, age and reach can still move a rank.' }), el('td', { class: 'num', text: '5 x TVL^0.85' })),
          el('tr', null, el('td', { text: 'Growth' }), el('td', { text: 'The week\'s momentum, capped so one wild print cannot buy rank 1: the snapshot\'s biggest 7-day move is over +4,000%.' }), el('td', { class: 'num', text: '0.70 – 1.60' })),
          el('tr', null, el('td', { text: 'Launch window' }), el('td', { text: 'Ramps over the first 90 days, holds 0.85–1.00 across days 90–1095, then fades to 0.85: four years with no token starts to look like never.' }), el('td', { class: 'num', text: '0.55 – 1.00' })),
          el('tr', null, el('td', { text: 'Chains' }), el('td', { text: 'Each extra chain is one more surface to farm on, up to four extra chains.' }), el('td', { class: 'num', text: '1.00 – 1.16' }))
        )
      ),
      el('p', { text: 'Wrapped, staked and bridged products of tokens that already trade are set aside from the board — the same rule the watchlist uses — as are exchange products and versioned pools. Readiness (0–100) blends the same factors: age 50%, growth 30%, chains 20%. This is an estimate, not a price, and never a prediction of whether or when a token launches.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      var costAt = tail.indexOf(' Time: ');
      var cost = costAt >= 0 ? tail.slice(0, costAt) : tail;
      var time = costAt >= 0 ? tail.slice(costAt + 1) : '';
      return el('li', null, el('div', null, el('b', { text: action }), el('span', { class: 'cost' }, el('b', { text: cost }), time ? document.createTextNode(' · ' + time) : null)));
    });
    var chainsShown = row.chains && row.chains.length
      ? row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? ' + ' + (row.chains.length - 4) + ' more' : '')
      : 'an unnamed chain';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : ' · early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainsShown })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Readiness' }), el('b', { class: 'num', text: String(row.readiness) + ' / 100' })),
        el('div', null, el('span', { text: 'Growth × age × chains' }), el('b', { class: 'num', text: String(row.growth_multiplier) + ' × ' + String(row.age_multiplier) + ' × ' + String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('div', { class: 'factor-bars' },
        el('div', { class: 'row' }, el('span', { text: 'Growth' }), el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.round(((row.growth_multiplier - 0.7) / 0.9) * 100) + '%' })), el('span', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', { class: 'row' }, el('span', { text: 'Launch window' }), el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.round(row.age_multiplier * 100) + '%' })), el('span', { class: 'num', text: String(row.age_multiplier) })),
        el('div', { class: 'row' }, el('span', { text: 'Chains' }), el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.round(((row.chain_multiplier - 1) / 0.16) * 100) + '%' })), el('span', { class: 'num', text: String(row.chain_multiplier) }))
      ),
      el('p', { class: 'detail-note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, steps)
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(band());
    shell.appendChild(facts());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'foot' }, 'Token Radar, model ', el('b', { text: DATA.model_version }), ' · Snapshot ', el('b', { text: DATA.as_of }), ' · DefiLlama protocol index · Implied value is a model of what a token would be worth if the protocol stays as it is today, not a promise and not a prediction of a launch.'));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
