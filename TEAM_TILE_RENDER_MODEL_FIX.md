# Team Tile Render Model Fix

## What caused Dragon Harpoon to look shaded
Dragon Harpoon had completed progress for the signed-in team. Single-quantity completed tiles received the `complete` visual class, but the old team renderer did not show a visible completion counter for quantity-1 tiles. This made the tile look shaded with no explanation.

## Changes
- Every tile is now rendered from one team-specific view model.
- Completion is calculated only from `tile.teamProgress[state.viewerTeam]`.
- Quantity-1 completed tiles show a small orange check badge.
- Multi-quantity tiles continue to show their own team's `1/2`, `2/3`, etc.
- Completed tiles no longer receive a shaded or dimmed background.
- The other team's progress cannot affect the current team's tile styling.
- Fully completed tiles cannot open another proof form.

## Files changed
- `battleship-team.js`
- `battleship-team.css`
- `team-1.html`
- `team-2.html`
