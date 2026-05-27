# Ironkin Static Website

A free GitHub Pages-ready website for the Ironkin OSRS clan.

## Pages
- Home
- Events with XP progress bar
- Ranks
- Ember Shop
- Rules

## How to edit the XP event
Open `script.js` and edit:

```js
const clanEvent = {
  name: 'The Ember Skill Forge',
  skill: 'Fishing',
  goalXp: 100000000,
  currentXpGained: 36450000
};
```

## What to change first
- Replace `https://discord.gg/YOUR-INVITE-HERE` in `index.html` with your real Discord invite.
- Edit event numbers in `script.js`.
- Edit rules, shop items, and ranks as needed.
