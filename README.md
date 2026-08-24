# ONE MORE DOOR

A fast, mobile-first risk/reward arcade roguelite built around one decision:

**Bank the run — or open ONE MORE DOOR.**

All coins and rewards are fictional in-game progression only. There are no real-money wagers or purchasable betting mechanics.

## What is implemented

- Three-door risk/reward choices: Challenge, Danger, Treasure, Mystery and Glitch
- Boss door every 10th room: **The Elevator**
- Fast micro-challenges: falling steel, laser grid, gates, closing walls, memory lanes, spinner, mines, gravity failure and compound rooms
- Difficulty that ramps with room depth and combines mechanics later in a run
- Checkpoints every five cleared rooms with a bank-or-continue decision
- Escalating run multiplier and door-specific risk/reward modifiers
- Coins, persistent bank, permanent unlocks and 3-slot loadout system
- Abilities: Second Chance, Coin Magnet, Phase Shield, Door Peek, Slow Pulse and Greed Engine
- Daily deterministic challenge seed
- Local records/statistics and personal bests
- Touch-first controls: drag to steer, tap to dash
- Keyboard fallback for desktop testing
- Procedural neon visuals, particles, screen shake, audio synthesis and haptics
- PWA/offline support with no external art or runtime service dependency
- Capacitor Android packaging and automatic APK release workflow

## Controls

- **Drag** anywhere in the arena to steer
- **Tap** to dash through a tight moment
- Survive until the room progress bar reaches the end

## Android

The GitHub Actions workflow builds a signed debug APK and publishes it to the rolling release tag `one-more-door-android-latest`. The signing key is deliberately a non-secret debug key committed only to keep upgrades installable over previous debug builds.

## Design principle

Runs should feel fast, tense and fair. Death should usually feel like a decision or movement error, not random punishment. The game starts readable, then progressively layers patterns until late runs become controlled chaos.
