async function initStaffHandbook() {
  const notice = document.getElementById("handbookAccessNotice");
  const content = document.getElementById("handbookContent");

  try {
    const user = await getCurrentAuthUser();

    if (!user) {
      if (notice) {
        notice.innerHTML = 'Please <a href="/api/auth/login">sign in with Discord</a> to view the staff handbook.';
      }
      return;
    }

    if (!isStaffUser(user)) {
      if (notice) {
        notice.textContent = "This handbook is restricted to Ironkin staff.";
      }
      return;
    }

    if (notice) {
      const displayName = user.global_name || user.username || "Staff";
      notice.textContent = `Signed in as ${displayName}.`;
    }

    if (content) {
      content.style.display = "grid";
    }
  } catch (error) {
    if (notice) {
      notice.textContent = "Unable to verify access. Please refresh and try again.";
    }
  }
}

document.addEventListener("DOMContentLoaded", initStaffHandbook);
