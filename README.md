# Odds Lounge ♠♥♦♣

Casino games with the odds out in the open. Watch your chance to win change with every card, get best-play advice, play real hands, then replay them to see what was skill and what was luck.

**Play it:** https://yinanjushi.github.io/odds-lounge/

A plain static site (HTML + CSS + JavaScript). No backend, no build step, no dependencies.

## Games

### ♠ Texas Hold'em (`index.html`)

Choose the table before you play: 1–8 opponents, starting stack (50 / 100 / 200 big blinds), no-limit or pot-limit, antes, and how opponents play (mixed, tight, loose, aggressive).

- **Live odds**: Monte Carlo simulation (30,000 runs per street) of your equity against the players still in the hand, with a preflop → flop → turn → river chart.
- **Real betting**: 1–8 AI opponents, each with a style (Tight / Loose / Aggressive / Solid). Blinds 1/2, 200 chips per hand, rotating dealer button. Fold, check, call, bet or raise with preset sizes, a slider, or all-in.
- **Betting advice**: an action and size from your odds, number of opponents, street, draws and pot odds. One click to follow it.
- **Hand analysis**: what each street changed, board texture, how many opponent hands already beat you, outs and the rule of 4 and 2.
- **Next-card heatmap**: how every possible turn or river card would move your odds.
- **Showdown replay**: the odds you saw vs your real odds once opponents' cards are revealed, the key card, and a grade for each decision.
- **Pick cards** mode to analyze hands you've played.

### 🂡 Blackjack (`blackjack.html`)

- **Rules you choose**: 1, 2, 6 or 8 decks; dealer stands or hits on soft 17; blackjack pays 3:2 or 6:5; double after split allowed or not. The house edge for your choice is shown before you play. Always: dealer peeks for blackjack, double on any two cards, one split, split aces get one card.
- **Live odds**: your chance to win, push or lose and the expected value (EV) of every option (stand, hit, double, split), computed exactly from the cards left in the shoe.
- **Best-play advice**: the highest-EV play, how much the alternatives cost, and one click to follow it.
- **Next-card tiles**: each card's chance of coming next, your new total, and your win chance after it.
- **Dealer outlook**: how the dealer is likely to finish given the up card.
- **Card counting**: Hi-Lo running count, true count and your edge on the next hand before you bet.
- **Hand replay**: the dealer's hole card, every decision checked against best play with its cost in chips, and how much of the result was luck.

### Slots & prize wheel (`slots.html`)

- **Three themes**, all original art: Fruit Party, Safari Gold and Ocean Treasure. Same maths in every theme.
- **The machine**: 5 reels × 3 rows, 10 paylines, a wild, and bonus symbols. Three or more bonus symbols spin the **bonus wheel** on top: 10, 15 or 20 free spins (wins ×2) or one of four jackpots, Mini (25× bet), Minor (60×), Major (250×) and the progressive Grand. Five top symbols on a line also win the Grand. Tuned by simulation to return about 95%.
- **Coin-in**: insert chips from your wallet as machine credits and cash out any time.
- **Effects**: blurred spinning reels, a slow tease when two bonus symbols land, drawn paylines, and celebrations whose title climbs (Nice → Big → Super → Mega → Epic win) as the counter rises, with fireworks, confetti, a coin fountain, light rays, screen shake and sound.
- **Prize wheel**: one free spin a day, then 100 chips a spin. Wheels have chasing rim lights, a flapper that ticks on every peg, and slice sizes that match the real odds.

Both card games have a **Cards** picker (twelve card backs: the classic claret lattice or a solid colour; classic serif or simple faces) and a **Guess first** mode, plus **Hide analysis** for play-only mode and **Full screen**: guess your odds before they're revealed to train your feel.

Keys — Hold'em: Space deal, F fold, C check/call, R raise. Blackjack: Space deal, H hit, S stand, D double, P split.

## Chips and stats

- **Daily chips**: both games share one chip wallet. You can claim 1,000 free chips once a day; when you run out, you wait until tomorrow. In Hold'em each hand buys in from the wallet (up to the table's starting stack); leaving mid-hand forfeits the chips already in the pot.
- **Stats page** (`stats.html`): Hold'em hands won, VPIP, PFR, how often you see the flop, go to showdown and win there, where your hands end in a fold, folding when facing a bet by street, preflop strength of hands played vs folded, and your running result. Blackjack win/push/lose and bust rates, blackjacks, doubles won, best-play accuracy, chips lost to mistakes, luck, and your running result.
- Chips and stats are stored in the browser only.

## Accounts (optional)

With a Supabase project configured in `config.js`, players can sign in with an email link and their chips sync across devices. Daily claims, secret codes (each once per account) and balance changes are checked on the server by the functions in `supabase/schema.sql`. Without a project the site runs in guest mode with chips stored in the browser.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Files

- `engine.js`: poker hand evaluator and Monte Carlo simulation
- `app.js`: Hold'em table, betting engine, AI opponents, analysis and replay
- `bj-engine.js`: blackjack odds (dealer outcome distribution, optimal-play EV, pre-deal edge)
- `blackjack.js`: blackjack table, shoe, betting, advice and replay
- `ui.js`: tabs, rules dialog, card picker, chip wallet and stats storage
- `stats.js`: the stats page
- `account.js`, `config.js`, `supabase/schema.sql`: accounts and synced chips
- `slots-engine.js`, `slots-themes.js`, `slots.js`, `slots.css`: slot machine, themes and wheels
- `style.css`: styles
- `index.html`, `blackjack.html`, `slots.html`, `stats.html`: pages

> Advice and analysis are for practice and hand review. Don't use it during real-money games.

## Credits

- 3D faces at the card tables: "Infinite" 3D head scan by Lee Perry-Smith (Infinite-Realities), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), loaded from the three.js examples. The head is trimmed to the neck and tinted per character.
- 3D rendering: [three.js](https://threejs.org) (MIT).
