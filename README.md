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

Both games have a **Cards** picker (twelve card backs: the classic claret lattice or a solid colour; classic serif or simple faces) and a **Guess first** mode, plus **Hide analysis** for play-only mode and **Full screen**: guess your odds before they're revealed to train your feel.

Keys — Hold'em: Space deal, F fold, C check/call, R raise. Blackjack: Space deal, H hit, S stand, D double, P split.

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
- `ui.js`: tabs and the rules dialog
- `style.css`: styles
- `index.html`, `blackjack.html`: pages

> Advice and analysis are for practice and hand review. Don't use it during real-money games.
