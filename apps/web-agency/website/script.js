const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const yearEl = document.getElementById("year");
const mobileToggle = document.getElementById("mobile-toggle");
const navLinks = document.getElementById("nav-links");

let apiEndpoint = null;

if (yearEl) yearEl.textContent = new Date().getFullYear();

/* Load API endpoint from config */
fetch("./config.json")
  .then((res) => {
    if (!res.ok) throw new Error("No config found");
    return res.json();
  })
  .then((config) => {
    if (config.apiEndpoint) {
      apiEndpoint = config.apiEndpoint;
      if (form) form.setAttribute("data-api-endpoint", apiEndpoint);
    }
  })
  .catch(() => {
    /* Silently fail - form will use fallback */
  });

/* ---- Mobile menu toggle ---- */
if (mobileToggle && navLinks) {
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
}

/* ---- Scroll: shrink topbar ---- */
const topbar = document.querySelector(".topbar");
let lastScroll = 0;
if (topbar) {
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y > 60) {
      topbar.style.borderBottomColor = "rgba(37,47,85,.9)";
    } else {
      topbar.style.borderBottomColor = "";
    }
    lastScroll = y;
  }, { passive: true });
}

/* ---- Intersection Observer for scroll animations ---- */
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px"
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.animation = "none";
      setTimeout(() => {
        entry.target.style.animation = "";
      }, 10);
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

/* Observe animated elements */
document.querySelectorAll(
  ".service-card, .pricing-card, .testimonial-card, .process-step, .portfolio-item, .stat, .badge"
).forEach((el) => {
  observer.observe(el);
});

/* ---- Animated stat counters ---- */
const animateCounter = (el) => {
  const target = parseInt(el.textContent, 10);
  let current = 0;
  const increment = Math.ceil(target / 30);
  
  const counter = setInterval(() => {
    current += increment;
    if (current >= target) {
      el.textContent = target;
      clearInterval(counter);
    } else {
      el.textContent = current;
    }
  }, 50);
};

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const strong = entry.target.querySelector("strong");
      if (strong && /^\d+/.test(strong.textContent)) {
        animateCounter(strong);
      }
      statObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });

document.querySelectorAll(".stat").forEach((stat) => {
  statObserver.observe(stat);
});

/* ---- Form submission ---- */
if (form) {
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

  /* Get API endpoint from attribute or fallback */
  let endpoint = form.getAttribute("data-api-endpoint");
  
  if (!endpoint) {
    statusEl.textContent = "API not configured. Please try again later.";
    statusEl.classList.remove("success");
    return;
  }

  const payload = {
    businessName: businessName,
    name: name,
    email: email,
    phone: String(data.get("phone") || "").trim(),
    details: details
  };

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
    .then((res) => res.json())
    .then((json) => {
      if (json.success) {
        statusEl.textContent = "Inquiry sent! We'll contact you soon.";
        statusEl.classList.add("success");
        form.reset();
      } else {
        statusEl.textContent = json.error || "Something went wrong. Please try again.";
        statusEl.classList.remove("success");
      }
    })
    .catch((err) => {
      console.error("Submission error:", err);
      statusEl.textContent = "Error sending inquiry. Please try again.";
      statusEl.classList.remove("success");
    });
  });
}
