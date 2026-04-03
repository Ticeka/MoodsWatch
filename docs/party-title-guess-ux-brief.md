# Party Title Guess UX Brief

## Goal

Design a new `Title Guess` mode for Party that feels like a high-energy party game while fitting into the existing Party product structure.

This mode should:

- Reuse the existing Party lobby as the main room setup surface
- Avoid creating a completely separate pre-room lobby flow
- Stay visually close to the provided mockup during gameplay
- Feel game-like, dramatic, and rewarding
- Hold up under slow networks, reconnects, and larger rooms

Core rule:

- Players guess the title from 4 character clue cards
- Clues reveal from hard to easier
- No protagonist / obvious main hero clues
- Earlier correct answers earn more points

## Product Direction

`Title Guess` should behave as a Party mode, not as a standalone app inside Party.

That means:

- Enter room through the normal Party entry flow
- Configure the room inside the existing Party lobby
- Start the match from the same lobby players already know
- Use the mockup visual language mainly for in-match, reveal, and winner moments

Recommended rule:

- `Do not add a second full lobby before room entry`

Allowed exception:

- A lightweight `round intro / ready overlay` inside the room is acceptable
- This is not a separate lobby
- It should feel like a game transition layer

## Information Architecture

Recommended flow:

1. Party Hub
- Create room / join room as usual

2. Shared Party Lobby
- Host chooses mode: `Music Quiz`, `Vote Battle`, `Title Guess`
- Host configures `Title Guess` settings in the same room settings area
- Players ready up in the same player list / ready system

3. Match Intro Overlay
- Short countdown / cinematic transition
- Shows round number, mode name, and “no protagonist clues” reminder if needed

4. Gameplay Stage
- This should follow the mockup closely
- 4 clue cards center stage
- Timer, score pressure, answer input, activity feed, leaderboard

5. Round Result
- Reveal answer
- Show all 4 clue cards and round outcome

6. Final Winner Screen
- End-of-match celebration
- Top players
- Replay / switch set / back to lobby actions

## Shared Party Lobby Requirements

This is the most important integration rule.

Use the current Party lobby as the single setup space.

### Host setup additions

Inside the existing room settings panel, add:

- `Mode card: Title Guess`
- `Set / Deck selector`
- `Rounds`
- `Time per clue`
- `Reveal time`
- `Random order`
- `Live score visibility`

Optional advanced settings:

- `Difficulty mix`
- `Allow repeated franchise in same session`
- `Hide answer after first correct player`

### Recommended host summary block

When `Title Guess` is selected, the summary pills should show:

- Mode: `Title Guess`
- Set name
- Number of rounds
- Clue time
- Reveal time
- Question pool size

### Recommended helper copy

Short explanation in lobby:

- `Guess the title from 4 character cards`
- `No protagonist clues`
- `Earlier answers score higher`

### Player perspective in shared lobby

Players should still see:

- Room name
- Members
- Ready count
- Selected mode
- Current set / rules summary

No extra title-guess-only room entry step should be inserted before this.

## Optional Pre-Match Room Layer

Allowed as an overlay after host presses start:

- 3-second countdown
- Mode badge
- Round count
- Short scoring reminder

This should be:

- Full-screen
- Fast
- Dramatic
- Skippable only if everyone is already synced and ready

This replaces the need for a second lobby.

## Gameplay UX

Gameplay should follow the mockup closely.

### Layout

Recommended structure:

- Top HUD
- Center clue stage
- Answer zone
- Side / lower social rail
- Bottom scoring rail

### Top HUD

Must include:

- Mode label: `Title Guess`
- Round progress: `Round X / Y`
- Big timer
- Optional player count
- Progress bar

Behavior:

- Timer becomes more urgent as time runs low
- If clue reveal is step-based, timer represents current clue window, not whole round only

### Center clue stage

Primary focus area.

Use the mockup’s 4-card presentation as the base.

Card states:

- Locked
- Revealing
- Opened
- Previous clue

Opened card content:

- Character image
- Character name
- Role badge
- Clue number
- Point value tied to that reveal tier

Important:

- The currently active clue must visually dominate
- Previous clues stay visible but become lower emphasis

### Answer zone

Must remain simple and fast.

Use mockup behavior as base:

- Single input
- One strong submit button
- Strong reward copy like `Submit now for 300`

After submit:

- Input locks
- Show `Locked In`
- Keep player watching the rest of the reveal flow

### Social rail

Use as secondary information only.

Recommended content:

- Number of players answered
- Mini live leaderboard
- Recent answer lock-ins

Avoid:

- Large chat panels
- Heavy social blocks that steal focus from clue cards

### Bottom scoring rail

This should remain visible during match.

Show:

- Card 1 = 400
- Card 2 = 300
- Card 3 = 200
- Card 4 = 100

Highlight current opportunity:

- `Current reward: 300`

## Round Result UX

Use the mockup reveal/result direction as the base.

Must include:

- Correct title
- The 4 clues used
- Fastest correct player
- Current leaderboard after score update

Recommended extra detail:

- Which clue number each correct player answered on
- Best label per round:
  - `First Card Read`
  - `Clutch Guess`
  - `Late Save`

## Final Winner UX

The winner screen should feel celebratory and slightly oversized compared to the rest of Party.

Use the mockup direction:

- Winner spotlight
- Top 3
- Final rankings
- Play again CTA

Recommended actions:

- `Play Again`
- `Change Set`
- `Back to Lobby`

Important:

- `Back to Lobby` should return to the same Party room lobby, not a new separate lobby

## Interaction and Motion

The mockup is strong on game energy. Keep that.

### Must-have motion

- Match countdown intro
- Card unlock / flip reveal
- Active clue pulse
- Timer urgency pulse
- Answer lock-in confirmation
- Score pop
- Rank movement in leaderboard
- Final winner celebration

### Motion rule

Motion should increase tension, not slow pacing.

Recommended pacing:

- Card reveal: short and punchy
- Result reveal: satisfying but brief
- Winner screen: biggest animation payoff

## Responsive UX

The mode must work on mobile-first layouts.

### Mobile priorities

- Timer always visible
- Current clue cards visible without scrolling too far
- Input and submit button always reachable
- Keyboard should not hide the action button

Recommended order on mobile:

- HUD
- Clue stage
- Answer zone
- Current reward rail
- Mini leaderboard / activity

### Desktop priorities

- Keep center stage dominant
- Use right rail for leaderboard / activity
- Preserve high-contrast game-show feel

## Network and Traffic Resilience

This mode needs to feel fair even on slow connections.

Design should assume:

- Some players will join late
- Some clients will lag
- Images may load slowly
- Realtime events may arrive late or duplicated

### UX requirements for slow network

1. Server-driven round state
- UI should render from authoritative `current_match`
- Timer and reveal state should derive from server timestamps

2. Locked answer confirmation
- After submit, show immediate local confirmation
- If server ack is delayed, show `Submitting...`
- Once confirmed, switch to `Locked In`

3. Clue image loading fallback
- If image is slow, show character card frame + placeholder shimmer
- Never collapse the card layout
- Character name may appear after image or alongside placeholder

4. Reconnect state
- If connection drops, show small non-blocking banner:
  - `Reconnecting...`
  - `Syncing round state...`
- On recovery, snap to latest clue count and timer

5. Duplicate submit protection
- If player taps submit multiple times, UX should still show one locked state
- Do not let duplicate requests create duplicate visual feedback

6. Late join handling
- If a player joins while a match is live:
  - show spectator-style state by default
  - optionally allow participation from next round only

### Performance and scale recommendations

- Preload current clue image and next clue image
- Do not preload the whole full-resolution set for the entire match
- Limit visible social feed items
- In large rooms, show only top players plus the current player
- Use summarized counters instead of rendering all answer events

## Worst Cases To Design For

### Missing clue image

Fallback:

- silhouette / placeholder artwork
- character name still visible if allowed
- no layout jump

### Question data incomplete

If a question is missing clues or aliases:

- exclude it before match start
- never let broken content reach gameplay UI

### Host starts with stale data

If the set changed or became invalid:

- block start in lobby
- explain why briefly

### Player submits exactly during clue transition

Rule:

- submission belongs to the clue tier active at authoritative server time
- UX should not expose this complexity, but should remain visually stable

### Large room

When player count is high:

- compact leaderboard
- summarized answer count
- reduced animation intensity for secondary elements

### Slow device

Fallback plan:

- reduce decorative particles
- keep essential timing and reveal animations only

## Recommended UX Copy

Keep copy short and game-like.

Examples:

- `Title Guess`
- `Clue Unlocked`
- `Lock In Your Guess`
- `Last Chance`
- `Answer now for 300`
- `Locked In`
- `Round Clear`
- `Final Results`

Avoid overly system-like copy such as:

- `Your answer was submitted successfully`

## Mapping from Mockup to Party

### Keep from mockup

- Gameplay stage composition
- Countdown energy
- Result reveal structure
- Winner celebration structure
- Big score-driven CTA language

### Adapt for Party product consistency

- Replace standalone mockup lobby with shared Party lobby setup
- Reuse Party member list / ready system
- Reuse Party room shell and room controls
- Keep in-room state transitions aligned with existing Party match lifecycle

## Recommended Screen List for UX/UI Team

Please design at least these screens:

1. Shared Party Lobby with `Title Guess` selected
2. Host setup state with set selected
3. Player ready state in shared lobby
4. Match intro overlay
5. Gameplay, clue 1
6. Gameplay, clue 2
7. Gameplay, clue 4 / last chance
8. Submitted / locked state
9. Round result
10. Final winner screen
11. Reconnecting / syncing state
12. Missing image fallback state

## Final Recommendation

Best product direction:

- Use one Party lobby only
- Use the provided mockup as the gameplay visual blueprint
- Add only a light pre-match overlay, not a second true lobby
- Make gameplay state server-driven and reconnect-safe
- Keep the experience dramatic and game-like, but operationally simple

