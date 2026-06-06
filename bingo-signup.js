const TEAM_LABELS = {
  team1: "Team 1",
  team2: "Team 2"
};

let bingoSignupState = {
  signedIn: false,
  inGuild: false,
  isStaff: false,
  currentUser: null,
  currentSignup: null,
  signups: []
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAvatarUrl(user) {
  if (!user?.avatar || !user?.discordId) return "";
  return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`;
}

function setSignupStatus(message, type = "info") {
  const status = document.getElementById("bingoSignupStatus");
  if (!status) return;

  status.className = `bingo-signup-status ${type}`;
  status.textContent = message;
}

function renderTeamList(team, mountId, countId) {
  const mount = document.getElementById(mountId);
  const count = document.getElementById(countId);
  if (!mount) return;

  const members = bingoSignupState.signups
    .filter(item => item.team === team)
    .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")));

  if (count) count.textContent = members.length;

  if (!members.length) {
    mount.innerHTML = `<p class="muted">No one has joined this team yet.</p>`;
    return;
  }

  mount.innerHTML = members.map(member => {
    const isCurrentUser = member.discordId === bingoSignupState.currentUser?.discordId;
    const targetTeam = member.team === "team1" ? "team2" : "team1";
    const avatarUrl = getAvatarUrl(member);
    const safeName = escapeHtml(member.displayName || member.username || "Unknown member");
    const safeInitial = escapeHtml(String(member.displayName || "?").charAt(0));

    return `
      <div class="bingo-team-member ${isCurrentUser ? "is-current-user" : ""}">
        <div class="bingo-member-main">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="" />` : `<span class="bingo-member-avatar-fallback">${safeInitial}</span>`}
          <div>
            <strong>${safeName}</strong>
            ${isCurrentUser ? `<small>You</small>` : `<small>Signed up</small>`}
          </div>
        </div>

        ${bingoSignupState.isStaff ? `
          <button
            class="btn secondary bingo-move-btn"
            type="button"
            data-discord-id="${member.discordId}"
            data-team="${targetTeam}"
          >
            Move to ${TEAM_LABELS[targetTeam]}
          </button>
        ` : ""}
      </div>
    `;
  }).join("");
}

function updateSignupButton() {
  const button = document.getElementById("bingoSignupButton");
  const login = document.getElementById("bingoSignupLogin");
  if (!button || !login) return;

  login.style.display = bingoSignupState.signedIn ? "none" : "inline-flex";

  if (!bingoSignupState.signedIn) {
    button.style.display = "none";
    setSignupStatus("Sign in with Discord to join Battleship Bingo.", "info");
    return;
  }

  button.style.display = "inline-flex";

  if (!bingoSignupState.inGuild) {
    button.disabled = true;
    setSignupStatus("You must be in the Ironkin Discord server to sign up.", "error");
    return;
  }

  if (bingoSignupState.currentSignup) {
    button.disabled = true;
    button.textContent = `Signed Up - ${TEAM_LABELS[bingoSignupState.currentSignup.team]}`;
    setSignupStatus(
      `You’re signed up as ${bingoSignupState.currentSignup.displayName} on ${TEAM_LABELS[bingoSignupState.currentSignup.team]}.`,
      "success"
    );
    return;
  }

  button.disabled = false;
  button.textContent = "Sign Up for Bingo";
  setSignupStatus(
    `Signed in as ${bingoSignupState.currentUser?.displayName || "Ironkin member"}. Click below to join a team.`,
    "info"
  );
}

function renderSignupPage() {
  updateSignupButton();
  renderTeamList("team1", "bingoTeamOneList", "bingoTeamOneCount");
  renderTeamList("team2", "bingoTeamTwoList", "bingoTeamTwoCount");
}

async function loadBingoSignups() {
  try {
    const response = await fetch("/api/bingo/signups");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load signups.");
    }

    bingoSignupState = {
      signedIn: data.signedIn === true,
      inGuild: data.inGuild === true,
      isStaff: data.isStaff === true,
      currentUser: data.currentUser,
      currentSignup: data.currentSignup,
      signups: Array.isArray(data.signups) ? data.signups : []
    };

    renderSignupPage();
  } catch (error) {
    setSignupStatus(error.message, "error");
  }
}

async function submitBingoSignup() {
  const button = document.getElementById("bingoSignupButton");
  if (!button) return;

  button.disabled = true;
  button.textContent = "Signing up...";

  try {
    const response = await fetch("/api/bingo/signups", {
      method: "POST"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not sign up.");
    }

    await loadBingoSignups();
  } catch (error) {
    setSignupStatus(error.message, "error");
    button.disabled = false;
    button.textContent = "Sign Up for Bingo";
  }
}

async function moveBingoMember(discordId, team) {
  try {
    const response = await fetch("/api/admin/bingo/move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ discordId, team })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not move member.");
    }

    await loadBingoSignups();
  } catch (error) {
    setSignupStatus(error.message, "error");
  }
}

document.addEventListener("click", event => {
  const signupButton = event.target.closest("#bingoSignupButton");
  if (signupButton) {
    submitBingoSignup();
    return;
  }

  const moveButton = event.target.closest(".bingo-move-btn");
  if (moveButton) {
    moveBingoMember(moveButton.dataset.discordId, moveButton.dataset.team);
  }
});

loadBingoSignups();
