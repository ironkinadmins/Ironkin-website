
function handbookSanitizeHtml(htmlValue) {
  const template = document.createElement("template");
  template.innerHTML = String(htmlValue || "");
  template.content.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,link,meta").forEach(node => node.remove());
  template.content.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || "").trim();
      if (name.startsWith("on") || name === "srcdoc") node.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^javascript:/i.test(value)) node.removeAttribute(attr.name);
      if (name === "style") node.removeAttribute("style");
    });
  });
  return template.innerHTML;
}

function handbookEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderManagedHandbook(handbook) {
  const layout = document.getElementById("handbookContent");
  if (!layout) return;

  const sections = Array.isArray(handbook?.document?.sections)
    ? handbook.document.sections.filter(section => section && section.visible !== false)
    : [];
  if (!sections.length) return; // Keep the code-based fallback.

  const title = String(handbook?.title || "Staff Handbook");
  const titleNode = document.querySelector(".handbook-hero h1");
  if (titleNode) titleNode.textContent = title;

  let sidebar = layout.querySelector(".handbook-sidebar");
  let content = layout.querySelector(".handbook-content");
  if (!sidebar || !content) return;

  sidebar.innerHTML = sections.map(section =>
    `<a href="#${handbookEscapeHtml(section.id)}">${handbookEscapeHtml(section.title || "Section")}</a>`
  ).join("");

  content.innerHTML = sections.map(section => {
    const images = Array.isArray(section.images) ? section.images : [];
    const media = images.length ? `
      <div class="handbook-media-grid">
        ${images.map(image => `
          <figure class="handbook-figure">
            <img
              src="/api/handbook-image?path=${encodeURIComponent(image.path)}"
              alt="${handbookEscapeHtml(image.caption || section.title || "Handbook screenshot")}"
              loading="lazy"
            />
            ${image.caption ? `<figcaption>${handbookEscapeHtml(image.caption)}</figcaption>` : ""}
          </figure>
        `).join("")}
      </div>
    ` : "";

    return `
      <article id="${handbookEscapeHtml(section.id)}" class="handbook-card">
        ${section.eyebrow ? `<p class="eyebrow">${handbookEscapeHtml(section.eyebrow)}</p>` : ""}
        <h2>${handbookEscapeHtml(section.title || "Section")}</h2>
        <div class="handbook-managed-body">${handbookSanitizeHtml(section.bodyHtml || "")}</div>
        ${media}
      </article>
    `;
  }).join("");
}

async function loadManagedHandbook() {
  const response = await fetch("/api/handbook", { cache: "no-store" });
  if (response.status === 404) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load the saved handbook.");
  if (data.handbook) renderManagedHandbook(data.handbook);
}

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

    try {
      await loadManagedHandbook();
    } catch (error) {
      console.warn("Using code-based staff handbook fallback:", error);
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
