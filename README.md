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

## How to host for free with GitHub Pages
1. Create a new GitHub repo named `ironkin-website`.
2. Upload all files in this folder.
3. Go to Settings > Pages.
4. Under Source, select `Deploy from a branch`.
5. Select branch `main` and folder `/root`.
6. Save.
7. Wait 1-2 minutes and GitHub will give you a website link.

## What to change first
- Replace `https://discord.gg/YOUR-INVITE-HERE` in `index.html` with your real Discord invite.
- Edit event numbers in `script.js`.
- Edit rules, shop items, and ranks as needed.
