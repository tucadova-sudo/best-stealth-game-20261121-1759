[![make.fun](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/tucadova-sudo/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/tucadova-sudo/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

# The Night Gallery

A top-down stealth game for the [make.fun bounty](https://make.fun/bounty/best-stealth-game-20261121-1759): Wren slips into a night gallery past three patrolling guards, pockets the Jade Fox, the Sun Disk and the Moon Pearl, and leaves through the service door.

Stay out of the guards' vision cones — crates and the central display case block their sight. Being seen fills a guard's suspicion; at full meter it gives chase, and being caught costs a life. Three lives, three relics, one way out.

## Play

Serve `game/` and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

Move with WASD or the arrow keys. Pause with P. Start or restart with Space.

## Layout

- `game/` — the playable game as static files (`index.html`, `src/*.js`)
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes `dossier.json`
- `screenshots/` — three staged renders of the game's own code
- `vendor/makefun-game.ts` — the make.fun dossier library, unchanged
- `serve.ts` — a tiny static server for local playtesting
