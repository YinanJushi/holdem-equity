# Equity Lens ♠♥♦♣

A Texas Hold'em odds site: watch your win odds change with every card, play the hand out with real betting against AI opponents, then replay it against their actual cards.

**Play it:** https://yinanjushi.github.io/holdem-equity/

A plain static site (HTML + CSS + JavaScript). No backend, no build step, no dependencies.

## Features

- **Live odds**: Monte Carlo simulation (30,000 runs per street) of your equity against the players still in the hand, with a preflop → flop → turn → river chart.
- **Real betting**: 1–8 AI opponents, each with a style (Tight / Loose / Aggressive / Solid). Blinds 1/2, 200 chips per hand, rotating dealer button. Fold, check, call, bet or raise with preset sizes, a slider, or all-in.
- **Betting advice**: an action and size based on your odds, number of opponents, street, draws and pot odds. One click to follow it.
- **Hand analysis**: what each street changed, board texture, how many opponent hands already beat you, outs and the rule of 4 and 2.
- **Next-card heatmap**: how every possible turn or river card would move your odds.
- **Showdown replay**: compares the odds you saw with your real odds once opponents' cards are revealed, finds the key card, and grades each of your decisions.
- **Guess first**: guess your odds before they're revealed to train your feel.
- **Pick cards**: set your own hole cards and board to analyze hands you've played.

Keys: Space deals / next hand, F fold, C check or call, R raise.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Files

- `engine.js`: 7-card hand evaluator and Monte Carlo simulation
- `app.js`: table, betting engine, AI opponents, analysis and replay
- `style.css`: casino theme
- `index.html`: page structure

> Advice and analysis use simplified rules of thumb. Great for practice and hand review; don't use it during real-money games.
