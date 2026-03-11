/**
 * Angelorum Solutions — Payment Portal JavaScript
 * Handles checkout flow, Stripe stub, order summary, and auto-confirmation.
 * 
 * STRIPE STUB: All Stripe interactions are simulated. Replace the stripe* functions
 * with real Stripe.js integration when you have a Stripe account.
 */

(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────
  let apiEndpoint = null;
  const TAX_RATE = 0; // Set to 0; change when tax calculation is needed

  const PACKAGES = {
    starter:  { name: "Starter Package",  price: 900,  type: "one-time" },
    growth:   { name: "Growth Package",   price: 1900, type: "one-time" },
    premium:  { name: "Premium Package",  price: 3200, type: "one-time" },
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
  let selectedPackage = "growth";
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
    .then((cfg) => { if (cfg.paymentApiEndpoint) apiEndpoint = cfg.paymentApiEndpoint; })
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
    let monthlyTotal = 0;

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

  // ── Payment Method Toggle ──────────────────────────
  document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const cardForm = document.getElementById("card-form");
      const achForm = document.getElementById("ach-form");
      if (e.target.value === "card") {
        if (cardForm) cardForm.style.display = "";
        if (achForm) achForm.style.display = "none";
      } else {
        if (cardForm) cardForm.style.display = "none";
        if (achForm) achForm.style.display = "";
      }
    });
  });

  // ── Card Number Formatting ─────────────────────────
  const cardInput = document.getElementById("card-number");
  if (cardInput) {
    cardInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 16);
      val = val.replace(/(.{4})/g, "$1 ").trim();
      e.target.value = val;
    });
  }

  // ── Expiry Formatting ──────────────────────────────
  const expiryInput = document.getElementById("card-expiry");
  if (expiryInput) {
    expiryInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 4);
      if (val.length >= 3) {
        val = val.substring(0, 2) + " / " + val.substring(2);
      }
      e.target.value = val;
    });
  }

  // ── CVC Formatting ─────────────────────────────────
  const cvcInput = document.getElementById("card-cvc");
  if (cvcInput) {
    cvcInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4);
    });
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

      goToStep(3);
    });
  }

  // ── Back Buttons ───────────────────────────────────
  const backTo1 = document.getElementById("back-to-1");
  const backTo2 = document.getElementById("back-to-2");
  if (backTo1) backTo1.addEventListener("click", () => goToStep(1));
  if (backTo2) backTo2.addEventListener("click", () => goToStep(2));

  // ══════════════════════════════════════════════════════
  // STRIPE STUB — Replace with real Stripe integration
  // ══════════════════════════════════════════════════════

  /**
   * STUB: Simulates creating a Stripe PaymentIntent on the server.
   * In production, this would call your API which calls Stripe's API.
   * 
   * To integrate real Stripe:
   * 1. Include <script src="https://js.stripe.com/v3/"></script>
   * 2. Initialize: const stripe = Stripe('pk_live_your_key');
   * 3. Create a PaymentIntent via your backend API
   * 4. Use stripe.confirmCardPayment(clientSecret, { payment_method: { card: elements } })
   */
  async function stripeCreatePaymentIntent(orderData) {
    console.log("[STRIPE STUB] Creating PaymentIntent for:", orderData);
    
    // Simulate API call delay
    await sleep(800);

    // In production, POST to your API:
    // const res = await fetch(apiEndpoint + '/create-payment-intent', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(orderData)
    // });
    // return await res.json();

    return {
      clientSecret: "pi_stub_" + generateId() + "_secret_" + generateId(),
      paymentIntentId: "pi_stub_" + generateId(),
    };
  }

  /**
   * STUB: Simulates confirming a card payment with Stripe.
   * Returns a simulated successful payment result.
   */
  async function stripeConfirmCardPayment(clientSecret, cardDetails) {
    console.log("[STRIPE STUB] Confirming card payment...");
    console.log("[STRIPE STUB] Client secret:", clientSecret);
    console.log("[STRIPE STUB] Card (last 4):", cardDetails.cardNumber.slice(-4));
    
    // Simulate processing delay
    await sleep(1500);

    // Simulate validation
    const cardNum = cardDetails.cardNumber.replace(/\s/g, "");
    if (cardNum.length < 13) {
      return { error: { message: "Your card number is invalid." } };
    }
    if (cardDetails.expiry.replace(/\D/g, "").length < 4) {
      return { error: { message: "Your card's expiration date is invalid." } };
    }
    if (cardDetails.cvc.length < 3) {
      return { error: { message: "Your card's security code is invalid." } };
    }

    // Simulate declined card for testing
    if (cardNum === "4000000000000002") {
      return { error: { message: "Your card was declined. Please try a different card." } };
    }

    // Simulated success
    return {
      paymentIntent: {
        id: "pi_stub_" + generateId(),
        status: "succeeded",
        amount: calculateTotal().total * 100,
        currency: "usd",
        created: Math.floor(Date.now() / 1000),
        receipt_url: "#",
      },
    };
  }

  /**
   * STUB: Simulates confirming an ACH payment with Stripe.
   */
  async function stripeConfirmACHPayment(clientSecret, achDetails) {
    console.log("[STRIPE STUB] Confirming ACH payment...");
    
    await sleep(2000);

    if (!achDetails.routingNumber || achDetails.routingNumber.length < 9) {
      return { error: { message: "Invalid routing number." } };
    }
    if (!achDetails.accountNumber || achDetails.accountNumber.length < 6) {
      return { error: { message: "Invalid account number." } };
    }

    return {
      paymentIntent: {
        id: "pi_ach_stub_" + generateId(),
        status: "succeeded",
        amount: calculateTotal().total * 100,
        currency: "usd",
        created: Math.floor(Date.now() / 1000),
      },
    };
  }

  /**
   * STUB: Creates a Stripe subscription for recurring add-ons.
   */
  async function stripeCreateSubscription(customerId, priceIds) {
    console.log("[STRIPE STUB] Creating subscription for customer:", customerId);
    console.log("[STRIPE STUB] Price IDs:", priceIds);
    
    await sleep(500);

    return {
      subscriptionId: "sub_stub_" + generateId(),
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };
  }

  // ══════════════════════════════════════════════════════
  // PAYMENT SUBMISSION
  // ══════════════════════════════════════════════════════

  const submitBtn = document.getElementById("submit-payment");
  const paymentError = document.getElementById("payment-error");

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (paymentError) paymentError.textContent = "";

      // Validate billing address
      const address = document.getElementById("billing-address").value.trim();
      const city = document.getElementById("billing-city").value.trim();
      const state = document.getElementById("billing-state").value.trim();
      const zip = document.getElementById("billing-zip").value.trim();

      if (!address || !city || !state || !zip) {
        if (paymentError) paymentError.textContent = "Please fill in your complete billing address.";
        return;
      }

      const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

      // Validate payment details
      if (paymentMethod === "card") {
        const cardName = document.getElementById("card-name").value.trim();
        const cardNumber = document.getElementById("card-number").value.trim();
        const expiry = document.getElementById("card-expiry").value.trim();
        const cvc = document.getElementById("card-cvc").value.trim();

        if (!cardName || !cardNumber || !expiry || !cvc) {
          if (paymentError) paymentError.textContent = "Please fill in all card details.";
          return;
        }
      } else {
        const achName = document.getElementById("ach-name").value.trim();
        const achRouting = document.getElementById("ach-routing").value.trim();
        const achAccount = document.getElementById("ach-account").value.trim();

        if (!achName || !achRouting || !achAccount) {
          if (paymentError) paymentError.textContent = "Please fill in all bank account details.";
          return;
        }
      }

      // Disable button, show processing
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="processing-spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Processing...';

      try {
        // Calculate totals
        const totals = calculateTotal();
        orderId = "ORD-" + generateId().toUpperCase().substring(0, 8);

        // Step 1: Create PaymentIntent (Stripe Stub)
        const intentResult = await stripeCreatePaymentIntent({
          orderId,
          amount: totals.total,
          currency: "usd",
          customer: customerData,
          package: selectedPackage,
          addons: Array.from(selectedAddons),
          promoCode: appliedPromo ? appliedPromo.code : null,
        });

        // Step 2: Confirm payment (Stripe Stub)
        let result;
        if (paymentMethod === "card") {
          result = await stripeConfirmCardPayment(intentResult.clientSecret, {
            cardNumber: document.getElementById("card-number").value,
            expiry: document.getElementById("card-expiry").value,
            cvc: document.getElementById("card-cvc").value,
            name: document.getElementById("card-name").value,
          });
        } else {
          result = await stripeConfirmACHPayment(intentResult.clientSecret, {
            accountName: document.getElementById("ach-name").value,
            routingNumber: document.getElementById("ach-routing").value,
            accountNumber: document.getElementById("ach-account").value,
            accountType: document.getElementById("ach-type").value,
          });
        }

        if (result.error) {
          if (paymentError) paymentError.textContent = result.error.message;
          submitBtn.disabled = false;
          submitBtn.innerHTML = '🔒 Pay Now →';
          return;
        }

        // Step 3: Create subscriptions for monthly add-ons (Stripe Stub)
        const monthlyAddons = Array.from(selectedAddons).filter((k) => ADDONS[k] && ADDONS[k].type === "monthly");
        if (monthlyAddons.length > 0) {
          await stripeCreateSubscription("cust_stub_" + generateId(), monthlyAddons);
        }

        // Show processing step
        goToStep(4);

        // Step 4: Save order to backend
        await saveOrderToBackend({
          orderId,
          paymentIntentId: result.paymentIntent.id,
          customer: customerData,
          package: selectedPackage,
          packageName: PACKAGES[selectedPackage].name,
          packagePrice: PACKAGES[selectedPackage].price,
          addons: Array.from(selectedAddons).map((k) => ({
            key: k,
            name: ADDONS[k].name,
            price: ADDONS[k].price,
            type: ADDONS[k].type,
          })),
          promoCode: appliedPromo ? appliedPromo.code : null,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          monthlyRecurring: totals.monthly,
          billingAddress: { address, city, state, zip },
          paymentMethod,
          status: "confirmed",
          createdAt: new Date().toISOString(),
        });

        // Step 5: Send confirmation email (backend handles this)
        await sendConfirmationEmail(orderId, customerData.email);

        // Step 6: Redirect to confirmation page
        await sleep(1000);
        const params = new URLSearchParams({
          orderId,
          package: selectedPackage,
          total: totals.total.toFixed(2),
          email: customerData.email,
          name: customerData.fullName,
          business: customerData.businessName,
        });
        if (totals.monthly > 0) params.set("monthly", totals.monthly.toFixed(2));

        window.location.href = "confirmation.html?" + params.toString();

      } catch (err) {
        console.error("Payment error:", err);
        if (paymentError) paymentError.textContent = "An unexpected error occurred. Please try again.";
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🔒 Pay Now →';
        goToStep(3);
      }
    });
  }

  // ── Save Order to Backend ──────────────────────────
  async function saveOrderToBackend(orderData) {
    console.log("[ORDER] Saving order:", orderData);

    // Store locally as fallback
    try {
      const orders = JSON.parse(localStorage.getItem("angelorum_orders") || "[]");
      orders.push(orderData);
      localStorage.setItem("angelorum_orders", JSON.stringify(orders));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }

    // Send to API if configured
    if (apiEndpoint) {
      try {
        await fetch(apiEndpoint + "/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });
      } catch (e) {
        console.warn("API save failed, order saved locally:", e);
      }
    }

    return orderData;
  }

  // ── Send Confirmation Email ────────────────────────
  async function sendConfirmationEmail(orderId, email) {
    console.log("[EMAIL STUB] Sending confirmation to:", email, "for order:", orderId);

    // In production, your backend Lambda handles this via SES
    if (apiEndpoint) {
      try {
        await fetch(apiEndpoint + "/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, email }),
        });
      } catch (e) {
        console.warn("Confirmation email API call failed:", e);
      }
    }
  }

  // ── Calculate Totals ───────────────────────────────
  function calculateTotal() {
    const pkg = PACKAGES[selectedPackage];
    let oneTime = pkg ? pkg.price : 0;
    let monthly = 0;

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

  function generateId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── URL Param Pre-selection ────────────────────────
  // Allow linking from pricing section: payment.html?plan=starter
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
