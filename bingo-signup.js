const DEFAULT_TEAM_LABELS = {
  team1: "Team 1",
  team2: "Team 2"
};

let countdownTimerId = null;

let hasRefreshedExistingSignupName = false;

let bingoSignupState = {
  signedIn: false,
  inGuild: false,
  isStaff: false,
  currentUser: null,
  currentSignup: null,
  signups: [],
  settings: {
    active: false,
    signupOpen: false,
    enableViewEvent: false,
    registrationEndsAt: "",
    teamOneName: "Team 1",
    teamTwoName: "Team 2",
    title: "Battleship Bingo",
    description: ""
  }
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

function getTeamLabel(team) {
  if (team === "team1") return bingoSignupState.settings?.teamOneName || DEFAULT_TEAM_LABELS.team1;
  if (team === "team2") return bingoSignupState.settings?.teamTwoName || DEFAULT_TEAM_LABELS.team2;
  return DEFAULT_TEAM_LABELS[team] || "Team";
}

function formatDeadline(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
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

        <div class="bingo-member-actions">
          ${isCurrentUser && isSignupOpen() ? `
            <button
              class="btn secondary bingo-remove-btn"
              type="button"
              data-discord-id="${member.discordId}"
              data-name="${safeName}"
            >
              Leave Team
            </button>
          ` : ""}

          ${bingoSignupState.isStaff ? `
            <button
              class="btn secondary bingo-move-btn"
              type="button"
              data-discord-id="${member.discordId}"
              data-team="${targetTeam}"
            >
              Move to ${getTeamLabel(targetTeam)}
            </button>
            ${!isCurrentUser ? `
              <button
                class="btn secondary bingo-remove-btn"
                type="button"
                data-discord-id="${member.discordId}"
                data-name="${safeName}"
              >
                Remove
              </button>
            ` : ""}
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderSignupSummary() {
  const total = document.getElementById("bingoTotalSignedUp");
  const teamOneTitle = document.getElementById("bingoTeamOneTitle");
  const teamTwoTitle = document.getElementById("bingoTeamTwoTitle");

  if (total) total.textContent = String(bingoSignupState.signups.length);
  if (teamOneTitle) teamOneTitle.textContent = getTeamLabel("team1");
  if (teamTwoTitle) teamTwoTitle.textContent = getTeamLabel("team2");
}

function renderRegistrationCountdown() {
  const card = document.getElementById("bingoRegistrationCountdown");
  const value = document.getElementById("bingoCountdownValue");
  const deadlineText = document.getElementById("bingoDeadlineText");
  const deadlineValue = bingoSignupState.settings?.registrationEndsAt || "";
  const deadline = deadlineValue ? new Date(deadlineValue) : null;

  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }

  if (!card || !value || !deadlineText || !deadline || !Number.isFinite(deadline.getTime())) {
    if (card) card.style.display = "none";
    return;
  }

  card.style.display = "grid";
  deadlineText.textContent = `Closes ${formatDeadline(deadlineValue)}`;

  const tick = () => {
    const remaining = deadline.getTime() - Date.now();

    if (remaining <= 0) {
      value.textContent = "Registration closed";
      deadlineText.textContent = `Closed ${formatDeadline(deadlineValue)}`;
      if (countdownTimerId) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
      return;
    }

    value.textContent = formatCountdown(remaining);
  };

  tick();
  countdownTimerId = setInterval(tick, 1000);
}

function renderStaffControls() {
  const controls = document.getElementById("bingoStaffControls");
  const startButton = document.getElementById("startBingoEventBtn");
  const reopenButton = document.getElementById("reopenBingoRegistrationBtn");

  if (!controls) return;

  controls.style.display = bingoSignupState.isStaff ? "flex" : "none";

  if (startButton) {
    startButton.style.display = bingoSignupState.settings?.enableViewEvent === true ? "none" : "inline-flex";
  }

  if (reopenButton) {
    reopenButton.style.display = bingoSignupState.settings?.signupOpen === true ? "none" : "inline-flex";
  }
}

function isSignupOpen() {
  return bingoSignupState.settings?.active === true && bingoSignupState.settings?.signupOpen === true;
}

function isEventStarted() {
  return bingoSignupState.settings?.active === true && bingoSignupState.settings?.enableViewEvent === true;
}

function updateSignupButton() {
  const button = document.getElementById("bingoSignupButton");
  const login = document.getElementById("bingoSignupLogin");
  if (!button || !login) return;

  login.style.display = bingoSignupState.signedIn ? "none" : "inline-flex";

  if (!bingoSignupState.signedIn) {
    button.style.display = "none";
    delete button.dataset.action;
    setSignupStatus("Sign in with Discord to join Battleship Bingo.", "info");
    return;
  }

  if (!bingoSignupState.inGuild) {
    button.style.display = "none";
    delete button.dataset.action;
    setSignupStatus("You must be in the Ironkin Discord server to sign up.", "error");
    return;
  }

  if (isEventStarted()) {
    button.style.display = "none";
    delete button.dataset.action;
    setSignupStatus(
      bingoSignupState.currentSignup
        ? `Battleship Bingo has started. You’re on ${getTeamLabel(bingoSignupState.currentSignup.team)}.`
        : "Battleship Bingo has started and registration is locked.",
      "info"
    );
    return;
  }

  if (!isSignupOpen()) {
    button.style.display = "none";
    delete button.dataset.action;
    setSignupStatus("Bingo registration is currently closed.", "info");
    return;
  }

  if (bingoSignupState.currentSignup) {
    button.style.display = "none";
    delete button.dataset.action;
    setSignupStatus(
      `You’re signed up as ${bingoSignupState.currentSignup.displayName} on ${getTeamLabel(bingoSignupState.currentSignup.team)}.`,
      "success"
    );
    return;
  }

  button.style.display = "inline-flex";
  button.disabled = false;
  button.dataset.action = "signup";
  button.textContent = "Sign Up for Bingo";
  setSignupStatus(
    `Signed in as ${bingoSignupState.currentUser?.displayName || "Ironkin member"}. Click below to join a team.`,
    "info"
  );
}

function renderSignupPage() {
  renderSignupSummary();
  renderRegistrationCountdown();
  renderStaffControls();
  updateSignupButton();
  renderTeamList("team1", "bingoTeamOneList", "bingoTeamOneCount");
  renderTeamList("team2", "bingoTeamTwoList", "bingoTeamTwoCount");
}

async function loadBingoSignups() {
  try {
    const response = await fetch(`/api/bingo/signups?t=${Date.now()}`, { cache: "no-store" });
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
      signups: Array.isArray(data.signups) ? data.signups : [],
      settings: data.settings || { active: false, signupOpen: false, enableViewEvent: false, registrationEndsAt: "", teamOneName: "Team 1", teamTwoName: "Team 2" }
    };

    const currentName = String(bingoSignupState.currentUser?.displayName || "");
    const savedName = String(bingoSignupState.currentSignup?.displayName || "");

    if (
      bingoSignupState.signedIn &&
      bingoSignupState.inGuild &&
      bingoSignupState.currentSignup &&
      currentName &&
      savedName !== currentName &&
      !hasRefreshedExistingSignupName
    ) {
      hasRefreshedExistingSignupName = true;
      await refreshExistingBingoSignupName();
      return;
    }

    renderSignupPage();
  } catch (error) {
    setSignupStatus(error.message, "error");
  }
}


async function refreshExistingBingoSignupName() {
  try {
    const response = await fetch("/api/bingo/signups", {
      method: "POST",
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not refresh signup name.");
    }

    await loadBingoSignups();
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
      method: "POST",
      cache: "no-store"
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
async function removeBingoSignup(discordId, name = "this member") {
  const currentUserId = bingoSignupState.currentUser?.discordId;
  const isSelfRemoval = !discordId || discordId === currentUserId;
  const confirmMessage = isSelfRemoval
    ? "Are you sure you want to leave Battleship Bingo?"
    : `Remove ${name} from Battleship Bingo?`;

  if (!window.confirm(confirmMessage)) return;

  try {
    const response = await fetch("/api/bingo/signups", {
      method: "DELETE",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ discordId: discordId || currentUserId })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not remove signup.");
    }

    bingoSignupState.currentSignup = data.currentSignup || null;
    bingoSignupState.signups = Array.isArray(data.signups) ? data.signups : [];

    renderSignupPage();

    const removedName = data.removedSignup?.displayName || name || "Member";
    setSignupStatus(
      isSelfRemoval
        ? "You’ve left Battleship Bingo. You can sign up again if you change your mind."
        : `${removedName} was removed from Battleship Bingo.`,
      "success"
    );
  } catch (error) {
    setSignupStatus(error.message, "error");
  }
}


async function saveBingoMode(mode) {
  if (!bingoSignupState.isStaff) return;

  const settings = bingoSignupState.settings || {};
  const nextSettings = {
    title: settings.title || "Battleship Bingo",
    description: settings.description || "Build a board, split into teams, claim tiles, and track summer progress.",
    active: true,
    signupOpen: mode === "registration",
    enableViewEvent: mode === "started",
    registrationEndsAt: settings.registrationEndsAt || "",
    teamOneName: settings.teamOneName || "Team 1",
    teamTwoName: settings.teamTwoName || "Team 2"
  };

  try {
    const response = await fetch("/api/admin/bingo/settings", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSettings)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not update Bingo settings.");
    }

    setSignupStatus(
      mode === "started"
        ? "Event started. Signups are locked and the Events page now routes to the board."
        : "Registration reopened. Members can sign up again.",
      "success"
    );

    await loadBingoSignups();
  } catch (error) {
    setSignupStatus(error.message, "error");
  }
}

document.addEventListener("click", event => {
  const signupButton = event.target.closest("#bingoSignupButton");
  if (signupButton) {
    if (signupButton.dataset.action === "leave") {
      removeBingoSignup(bingoSignupState.currentUser?.discordId, bingoSignupState.currentSignup?.displayName);
    } else {
      submitBingoSignup();
    }
    return;
  }

  const startEventButton = event.target.closest("#startBingoEventBtn");
  if (startEventButton) {
    if (!window.confirm("Start Battleship Bingo now? This locks signups and sends users to the board from the Events page.")) return;
    saveBingoMode("started");
    return;
  }

  const reopenButton = event.target.closest("#reopenBingoRegistrationBtn");
  if (reopenButton) {
    if (!window.confirm("Reopen Battleship Bingo registration? This sends users back to the signup page from the Events page.")) return;
    saveBingoMode("registration");
    return;
  }

  const moveButton = event.target.closest(".bingo-move-btn");
  if (moveButton) {
    moveBingoMember(moveButton.dataset.discordId, moveButton.dataset.team);
    return;
  }

  const removeButton = event.target.closest(".bingo-remove-btn");
  if (removeButton) {
    removeBingoSignup(removeButton.dataset.discordId, removeButton.dataset.name);
  }
});

loadBingoSignups();
