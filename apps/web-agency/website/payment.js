/**
 * Angelorum Solutions — Payment Portal JavaScript
 * Handles checkout flow with Stripe Checkout Sessions (redirect).
 * 
 * Flow: Select Package → Enter Details → Review & Redirect to Stripe → Confirmation
 */

(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────
  let checkoutApiEndpoint = null;
  const STRIPE_PK = "pk_test_51TAfgDCKtiN3XTPMzaNtGeV7w6naR4p84uFiJuYZrZA5OfL5RG3sYR3zuns17dOadpmGK3sUqordSTI6HCJ7V3zL00a8Ba3kEB";
  const TAX_RATE = 0;

  // Initialize Stripe
  const stripe = window.Stripe ? window.Stripe(STRIPE_PK) : null;

  const PACKAGES = {
    hosting:      { name: "Managed Hosting",       price: 60,   type: "monthly", plan: "hosting" },
    premium:      { name: "Premium Website",        price: 2400, type: "one-time-plus-monthly", monthlyPrice: 40, plan: "premium" },
  };

  const ADDONS = {
    maintenance:  { name: "Monthly Maintenance & Support",  price: 99,  type: "monthly" },
    seo:          { name: "SEO Optimization Package",       price: 149, type: "monthly" },
    copywriting:  { name: "Professional Copywriting",       price: 350, type: "one-time" },
  };

  const PROMO_CODES = {
    "WELCOME10": { discount: 0.10, label: "10% Off" },
    "LAUNCH20":  { discount: 0.20, label: "20% Off" },
    "FRIEND50":  { discount: 50,   label: "$50 Off", isFlat: true },
  };

  // ── State ──────────────────────────────────────────
  let currentStep = 1;
  let selectedPackage = "professional";
  let selectedAddons = new Set();
  let appliedPromo = null;
  let customerData = {};
  let orderId = null;

  // ── DOM Elements ───────────────────────────────────
  const yearEl = document.getElementById("year");
  const mobileToggle = document.getElementById("mobile-toggle");
  const navLinks = document.getElementById("nav-links");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Load config
  fetch("./config.json")
    .then((r) => r.ok ? r.json() : Promise.reject())
    .then((cfg) => { if (cfg.paymentApiEndpoint) checkoutApiEndpoint = cfg.paymentApiEndpoint; })
    .catch(() => {});

  // ── Mobile Menu ────────────────────────────────────
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
  }

  // ── Step Navigation ────────────────────────────────
  function goToStep(step) {
    // Hide all steps
    document.querySelectorAll(".checkout-step").forEach((el) => {
      el.setAttribute("data-active", "false");
    });
    // Show target step
    const target = document.getElementById("step-" + step);
    if (target) target.setAttribute("data-active", "true");

    // Update step dots
    document.querySelectorAll(".step-dot").forEach((dot) => {
      const s = parseInt(dot.dataset.step);
      dot.classList.remove("active", "completed");
      if (s === step) dot.classList.add("active");
      else if (s < step) dot.classList.add("completed");
    });

    // Update step lines
    const lines = document.querySelectorAll(".step-line");
    lines.forEach((line, i) => {
      line.classList.remove("active", "completed");
      if (i < step - 1) line.classList.add("completed");
      if (i === step - 1) line.classList.add("active");
    });

    currentStep = step;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Package Selection ──────────────────────────────
  document.querySelectorAll('input[name="package"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      selectedPackage = e.target.value;
      updateSummary();
    });
  });

  // ── Add-on Selection ───────────────────────────────
  document.querySelectorAll('.addon-card input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedAddons.add(e.target.value);
      } else {
        selectedAddons.delete(e.target.value);
      }
      updateSummary();
    });
  });

  // ── Promo Code ─────────────────────────────────────
  const applyPromoBtn = document.getElementById("apply-promo");
  const promoInput = document.getElementById("promo-code");
  const promoStatus = document.getElementById("promo-status");

  if (applyPromoBtn) {
    applyPromoBtn.addEventListener("click", () => {
      const code = (promoInput.value || "").trim().toUpperCase();
      if (PROMO_CODES[code]) {
        appliedPromo = { code, ...PROMO_CODES[code] };
        promoStatus.textContent = "✓ " + PROMO_CODES[code].label + " applied!";
        promoStatus.className = "promo-status valid";
      } else if (code === "") {
        promoStatus.textContent = "Please enter a code.";
        promoStatus.className = "promo-status invalid";
      } else {
        appliedPromo = null;
        promoStatus.textContent = "Invalid promo code.";
        promoStatus.className = "promo-status invalid";
      }
      updateSummary();
    });
  }

  // ── Update Order Summary ───────────────────────────
  function updateSummary() {
    const pkg = PACKAGES[selectedPackage];
    if (!pkg) return;

    // Package
    const planName = document.getElementById("summary-plan-name");
    const planPrice = document.getElementById("summary-plan-price");
    if (planName) planName.textContent = pkg.name;
    if (planPrice) planPrice.textContent = formatCurrency(pkg.price);

    // Addons
    const addonsEl = document.getElementById("summary-addons");
    let oneTimeTotal = pkg.price;
    let monthlyTotal = pkg.monthlyPrice || 0;

    if (addonsEl) {
      addonsEl.innerHTML = "";
      selectedAddons.forEach((key) => {
        const addon = ADDONS[key];
        if (!addon) return;
        const row = document.createElement("div");
        row.className = "summary-row";
        row.innerHTML = `
          <span class="summary-label">${addon.name}</span>
          <span class="summary-value">${formatCurrency(addon.price)}${addon.type === "monthly" ? "/mo" : ""}</span>
        `;
        addonsEl.appendChild(row);

        if (addon.type === "monthly") {
          monthlyTotal += addon.price;
        } else {
          oneTimeTotal += addon.price;
        }
      });
    }

    // Discount
    let discountAmount = 0;
    const discountRow = document.getElementById("summary-discount-row");
    const discountCode = document.getElementById("summary-discount-code");
    const discountEl = document.getElementById("summary-discount-amount");

    if (appliedPromo) {
      if (appliedPromo.isFlat) {
        discountAmount = appliedPromo.discount;
      } else {
        discountAmount = Math.round(oneTimeTotal * appliedPromo.discount * 100) / 100;
      }
      if (discountRow) discountRow.style.display = "";
      if (discountCode) discountCode.textContent = appliedPromo.code;
      if (discountEl) discountEl.textContent = "-" + formatCurrency(discountAmount);
    } else {
      if (discountRow) discountRow.style.display = "none";
    }

    // Tax
    const subtotal = oneTimeTotal - discountAmount;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const taxEl = document.getElementById("summary-tax");
    if (taxEl) taxEl.textContent = formatCurrency(tax);

    // Total
    const total = subtotal + tax;
    const totalEl = document.getElementById("summary-total");
    if (totalEl) totalEl.textContent = formatCurrency(total);

    // Monthly recurring
    const recurringSection = document.getElementById("summary-recurring");
    const monthlyEl = document.getElementById("summary-monthly");
    if (monthlyTotal > 0) {
      if (recurringSection) recurringSection.style.display = "";
      if (monthlyEl) monthlyEl.textContent = formatCurrency(monthlyTotal) + "/mo";
    } else {
      if (recurringSection) recurringSection.style.display = "none";
    }
  }

  // ── Step 1 → Step 2 ───────────────────────────────
  const toStep2 = document.getElementById("to-step-2");
  if (toStep2) {
    toStep2.addEventListener("click", () => {
      if (!selectedPackage) {
        alert("Please select a package.");
        return;
      }
      goToStep(2);
    });
  }

  // ── Step 2 → Step 3 ───────────────────────────────
  const toStep3 = document.getElementById("to-step-3");
  if (toStep3) {
    toStep3.addEventListener("click", () => {
      // Validate details form
      const form = document.getElementById("details-form");
      const fullName = form.querySelector('[name="fullName"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      const businessName = form.querySelector('[name="businessName"]').value.trim();
      const industry = form.querySelector('[name="industry"]').value;
      const terms = form.querySelector('[name="termsAccepted"]').checked;

      if (!fullName || !email || !businessName || !industry) {
        alert("Please fill in all required fields.");
        return;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        alert("Please enter a valid email address.");
        return;
      }

      if (!terms) {
        alert("Please accept the Terms of Service and Privacy Policy.");
        return;
      }

      // Save customer data
      customerData = {
        fullName,
        email,
        phone: form.querySelector('[name="phone"]').value.trim(),
        businessName,
        industry,
        projectNotes: form.querySelector('[name="projectNotes"]').value.trim(),
      };

      // Populate review details in Step 3
      populateReview();

      goToStep(3);
    });
  }

  // ── Back Buttons ───────────────────────────────────
  const backTo1 = document.getElementById("back-to-1");
  const backTo2 = document.getElementById("back-to-2");
  if (backTo1) backTo1.addEventListener("click", () => goToStep(1));
  if (backTo2) backTo2.addEventListener("click", () => goToStep(2));

  // ══════════════════════════════════════════════════════
  // STRIPE CHECKOUT SESSION — Real Integration
  // ══════════════════════════════════════════════════════

  /**
   * Populates the review details box before Stripe redirect.
   */
  function populateReview() {
    const reviewEl = document.getElementById("review-details");
    if (!reviewEl) return;

    const pkg = PACKAGES[selectedPackage];
    const totals = calculateTotal();

    let html = `
      <div class="review-row"><span class="review-label">Package</span><span class="review-value">${pkg.name}</span></div>
      <div class="review-row"><span class="review-label">Price</span><span class="review-value">${formatCurrency(pkg.price)}${pkg.type === "monthly" ? "/mo" : ""}</span></div>
    `;

    selectedAddons.forEach((key) => {
      const addon = ADDONS[key];
      if (addon) {
        html += `<div class="review-row"><span class="review-label">${addon.name}</span><span class="review-value">${formatCurrency(addon.price)}${addon.type === "monthly" ? "/mo" : ""}</span></div>`;
      }
    });

    if (totals.discount > 0) {
      html += `<div class="review-row"><span class="review-label">Discount (${appliedPromo.code})</span><span class="review-value" style="color:var(--success)">-${formatCurrency(totals.discount)}</span></div>`;
    }

    html += `
      <div class="review-row" style="border-top:2px solid rgba(255,255,255,.12);padding-top:.8rem;margin-top:.4rem">
        <span class="review-label" style="font-weight:600">Total Due Today</span>
        <span class="review-value" style="font-size:1.15rem;color:var(--accent)">${formatCurrency(totals.total)}</span>
      </div>
    `;

    if (totals.monthly > 0) {
      html += `<div class="review-row"><span class="review-label">Monthly Recurring</span><span class="review-value">${formatCurrency(totals.monthly)}/mo</span></div>`;
    }

    html += `
      <div class="review-row"><span class="review-label">Business</span><span class="review-value">${escapeHtml(customerData.businessName)}</span></div>
      <div class="review-row"><span class="review-label">Email</span><span class="review-value">${escapeHtml(customerData.email)}</span></div>
    `;

    reviewEl.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════
  // PAYMENT SUBMISSION — Stripe Checkout Redirect
  // ══════════════════════════════════════════════════════

  const submitBtn = document.getElementById("submit-payment");
  const paymentError = document.getElementById("payment-error");

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (paymentError) paymentError.textContent = "";

      if (!stripe) {
        if (paymentError) paymentError.textContent = "Payment system not loaded. Please refresh the page.";
        return;
      }

      if (!checkoutApiEndpoint) {
        if (paymentError) paymentError.textContent = "Payment not configured. Please try again later.";
        return;
      }

      // Disable button, show processing
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="processing-spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Redirecting to Stripe...';

      try {
        const pkg = PACKAGES[selectedPackage];

        // Call our API to create a Stripe Checkout Session
        const res = await fetch(checkoutApiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: pkg.plan,
            email: customerData.email,
            businessName: customerData.businessName,
          }),
        });

        const json = await res.json();

        if (!json.success || !json.data?.sessionId) {
          throw new Error(json.error || "Failed to create checkout session");
        }

        // Save customer info locally before redirect
        try {
          localStorage.setItem("angelorum_checkout", JSON.stringify({
            package: selectedPackage,
            customer: customerData,
            timestamp: new Date().toISOString(),
          }));
        } catch (e) { /* ignore */ }

        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({
          sessionId: json.data.sessionId,
        });

        if (error) {
          throw new Error(error.message);
        }

      } catch (err) {
        console.error("Checkout error:", err);
        if (paymentError) paymentError.textContent = err.message || "An unexpected error occurred. Please try again.";
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Proceed to Secure Payment &rarr;';
      }
    });
  }

  // ── Calculate Totals ───────────────────────────────
  function calculateTotal() {
    const pkg = PACKAGES[selectedPackage];
    let oneTime = pkg ? pkg.price : 0;
    let monthly = 0;

    if (pkg && pkg.type === "monthly") {
      monthly += pkg.price;
      oneTime = 0;
    }

    selectedAddons.forEach((key) => {
      const addon = ADDONS[key];
      if (!addon) return;
      if (addon.type === "monthly") monthly += addon.price;
      else oneTime += addon.price;
    });

    let discount = 0;
    if (appliedPromo) {
      if (appliedPromo.isFlat) {
        discount = appliedPromo.discount;
      } else {
        discount = Math.round(oneTime * appliedPromo.discount * 100) / 100;
      }
    }

    const subtotal = oneTime - discount;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const total = subtotal + tax;

    return { oneTime, monthly, discount, tax, total, subtotal };
  }

  // ── Utilities ──────────────────────────────────────
  function formatCurrency(amount) {
    return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function generateId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── URL Param Pre-selection ────────────────────────
  // Allow linking from pricing section: payment.html?plan=hosting
  const urlParams = new URLSearchParams(window.location.search);
  const planParam = urlParams.get("plan");
  if (planParam && PACKAGES[planParam]) {
    selectedPackage = planParam;
    const radio = document.querySelector(`input[name="package"][value="${planParam}"]`);
    if (radio) radio.checked = true;
  }

  // ── Initialize ─────────────────────────────────────
  updateSummary();

})();
