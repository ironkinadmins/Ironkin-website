# Admin right-click board repair

## How to use
1. Sign in as a staff member and open `/battleship-bingo`.
2. Right-click any board tile.
3. Choose Hit, Miss, or Reset under the attacking team.
4. Refresh an open team page to see the same result there.

## Mirrored behavior
- Apey's Apes Attack result also appears on Harambe Hunters' **Your Waters**.
- Harambe Hunters Attack result also appears on Apey's Apes' **Your Waters**.
- Reset removes that attack from both mirrored views.

The action changes only Battleship attack state. It does not approve proofs or alter independent tile completion quantities.

## Security
The browser calls `/api/admin/bingo/manual-attack`. The endpoint re-checks the signed Discord staff session and validates team, result, and tile index server-side. Console changes cannot authorize the endpoint.

## Layout
Both the admin Bingo board and private team boards now use `max-width: 980px` and automatic left/right margins.
