const header = document.querySelector("[data-site-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const siteNav = document.querySelector("[data-site-nav]");
const navigationLinks = [...document.querySelectorAll(".site-nav a")];
const trackedSections = [...document.querySelectorAll("main section[id]")];

function closeNavigation() {
  if (!menuToggle || !siteNav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "false");
  siteNav.classList.remove("is-open");
}

function updateHeaderState() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";

  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  siteNav?.classList.toggle("is-open", !isOpen);
});

for (const link of navigationLinks) {
  link.addEventListener("click", closeNavigation);
}

window.addEventListener("scroll", updateHeaderState, { passive: true });
updateHeaderState();

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (!visibleEntry) {
        return;
      }

      for (const link of navigationLinks) {
        const isCurrent =
          link.getAttribute("href") === `#${visibleEntry.target.id}`;

        if (isCurrent) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    },
    {
      rootMargin: "-20% 0px -62% 0px",
      threshold: [0.12, 0.35, 0.6],
    },
  );

  for (const section of trackedSections) {
    sectionObserver.observe(section);
  }
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const copyValue = button.getAttribute("data-copy");

    if (!copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      button.textContent = "已复制";
      button.classList.add("is-copied");
    } catch {
      button.textContent = "请手动复制";
    }

    window.setTimeout(() => {
      button.textContent = "复制";
      button.classList.remove("is-copied");
    }, 1800);
  });
}
