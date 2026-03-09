const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const yearEl = document.getElementById("year");
const mobileToggle = document.getElementById("mobile-toggle");
const navLinks = document.getElementById("nav-links");

yearEl.textContent = new Date().getFullYear();

/* ---- Mobile menu toggle ---- */
mobileToggle.addEventListener("click", () => {
  navLinks.classList.toggle("open");
  mobileToggle.setAttribute(
    "aria-expanded",
    navLinks.classList.contains("open")
  );
});

/* Close mobile menu when a nav link is clicked */
navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    mobileToggle.setAttribute("aria-expanded", "false");
  });
});

/* ---- Scroll: shrink topbar ---- */
const topbar = document.querySelector(".topbar");
let lastScroll = 0;
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  if (y > 60) {
    topbar.style.borderBottomColor = "rgba(37,47,85,.9)";
  } else {
    topbar.style.borderBottomColor = "";
  }
  lastScroll = y;
}, { passive: true });

/* ---- Form submission ---- */
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const businessName = String(data.get("businessName") || "").trim();
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const details = String(data.get("details") || "").trim();

  if (!businessName || !name || !email || !details) {
    statusEl.textContent = "Please fill out all fields.";
    statusEl.classList.remove("success");
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    statusEl.textContent = "Please enter a valid email address.";
    statusEl.classList.remove("success");
    return;
  }

  statusEl.textContent = "Thanks! Your inquiry is ready to send. Connect this form to your email or backend next.";
  statusEl.classList.add("success");
  form.reset();
});
