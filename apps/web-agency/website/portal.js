/**
 * Angelorum Solutions — Customer Portal JavaScript
 * Handles login, dashboard, orders, invoices, payment methods, and settings.
 */

(function () {
  "use strict";

  // ── DOM Setup ──────────────────────────────────────
  const yearEl = document.getElementById("year");
  const mobileToggle = document.getElementById("mobile-toggle");
  const navLinks = document.getElementById("nav-links");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
  }

  // ── State ──────────────────────────────────────────
  let currentUser = null;
  const loginSection = document.getElementById("login-section");
  const dashboardSection = document.getElementById("dashboard-section");

  // ── Auto-Login Check ───────────────────────────────
  function checkSession() {
    try {
      const session = JSON.parse(localStorage.getItem("angelorum_session"));
      if (session && session.email) {
        currentUser = session;
        showDashboard();
        return;
      }
    } catch (e) {}

    // Check if redirected from confirmation with email
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    if (email) {
      currentUser = findUserByEmail(email);
      if (currentUser) {
        localStorage.setItem("angelorum_session", JSON.stringify(currentUser));
        showDashboard();
        return;
      }
    }

    showLogin();
  }

  function findUserByEmail(email) {
    const orders = JSON.parse(localStorage.getItem("angelorum_orders") || "[]");
    const order = orders.find((o) => o.customer && o.customer.email === email);
    if (order) {
      return {
        email: order.customer.email,
        fullName: order.customer.fullName,
        phone: order.customer.phone || "",
        businessName: order.customer.businessName || "",
      };
    }
    return null;
  }

  // ── Login ──────────────────────────────────────────
  function showLogin() {
    if (loginSection) loginSection.style.display = "";
    if (dashboardSection) dashboardSection.style.display = "none";
  }

  function showDashboard() {
    if (loginSection) loginSection.style.display = "none";
    if (dashboardSection) dashboardSection.style.display = "";
    populateDashboard();
  }

  // Login button handler
  const loginBtn = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      if (!email) {
        loginError.textContent = "Please enter your email address.";
        return;
      }

      // Check if user has any orders (simple auth stub)
      const user = findUserByEmail(email);
      if (user) {
        currentUser = user;
        localStorage.setItem("angelorum_session", JSON.stringify(currentUser));
        loginError.textContent = "";
        showDashboard();
      } else {
        // For demo: create a session anyway
        currentUser = {
          email,
          fullName: email.split("@")[0],
          phone: "",
          businessName: "",
        };
        localStorage.setItem("angelorum_session", JSON.stringify(currentUser));
        showDashboard();
      }
    });
  }

  // Order lookup toggle
  const orderLookupBtn = document.getElementById("login-order-lookup");
  const orderLookupField = document.getElementById("order-lookup-field");

  if (orderLookupBtn) {
    orderLookupBtn.addEventListener("click", () => {
      orderLookupField.style.display = orderLookupField.style.display === "none" ? "" : "none";
    });
  }

  const lookupBtn = document.getElementById("lookup-btn");
  if (lookupBtn) {
    lookupBtn.addEventListener("click", () => {
      const orderId = document.getElementById("lookup-order-id").value.trim().toUpperCase();
      const orders = JSON.parse(localStorage.getItem("angelorum_orders") || "[]");
      const order = orders.find((o) => o.orderId === orderId);
      if (order) {
        currentUser = {
          email: order.customer.email,
          fullName: order.customer.fullName,
          phone: order.customer.phone || "",
          businessName: order.customer.businessName || "",
        };
        localStorage.setItem("angelorum_session", JSON.stringify(currentUser));
        showDashboard();
      } else {
        loginError.textContent = "Order not found. Please check the Order ID.";
      }
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      currentUser = null;
      localStorage.removeItem("angelorum_session");
      showLogin();
    });
  }

  // ── Tab Navigation ─────────────────────────────────
  document.querySelectorAll(".portal-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".portal-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".portal-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById("panel-" + tab.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });

  // ── Dashboard Population ───────────────────────────
  function populateDashboard() {
    if (!currentUser) return;

    // User info
    const nameEl = document.getElementById("portal-user-name");
    const emailEl = document.getElementById("portal-user-email");
    if (nameEl) nameEl.textContent = currentUser.fullName || "Client";
    if (emailEl) emailEl.textContent = currentUser.email;

    // Settings
    const sName = document.getElementById("settings-name");
    const sEmail = document.getElementById("settings-email");
    const sPhone = document.getElementById("settings-phone");
    const sBusiness = document.getElementById("settings-business");
    if (sName) sName.value = currentUser.fullName || "";
    if (sEmail) sEmail.value = currentUser.email || "";
    if (sPhone) sPhone.value = currentUser.phone || "";
    if (sBusiness) sBusiness.value = currentUser.businessName || "";

    // Load orders
    const allOrders = JSON.parse(localStorage.getItem("angelorum_orders") || "[]");
    const userOrders = allOrders.filter(
      (o) => o.customer && o.customer.email === currentUser.email
    );

    // Stats
    const statOrders = document.getElementById("stat-orders");
    const statActive = document.getElementById("stat-active");
    const statSpent = document.getElementById("stat-spent");
    const statSubs = document.getElementById("stat-subscriptions");

    const totalSpent = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const activeProjects = userOrders.filter((o) => o.status === "confirmed" || o.status === "in-progress").length;
    const activeSubs = userOrders.reduce((count, o) => {
      return count + (o.addons || []).filter((a) => a.type === "monthly").length;
    }, 0);

    if (statOrders) statOrders.textContent = userOrders.length;
    if (statActive) statActive.textContent = activeProjects;
    if (statSpent) statSpent.textContent = "$" + totalSpent.toLocaleString("en-US", { minimumFractionDigits: 0 });
    if (statSubs) statSubs.textContent = activeSubs;

    // Orders table
    const tbody = document.getElementById("orders-tbody");
    const ordersEmpty = document.getElementById("orders-empty");
    const ordersTable = document.getElementById("orders-table");

    if (userOrders.length === 0) {
      if (ordersTable) ordersTable.style.display = "none";
      if (ordersEmpty) ordersEmpty.style.display = "";
    } else {
      if (ordersTable) ordersTable.style.display = "";
      if (ordersEmpty) ordersEmpty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = userOrders
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map((o) => {
            const date = new Date(o.createdAt).toLocaleDateString("en-US", {
              year: "numeric", month: "short", day: "numeric",
            });
            const statusClass = (o.status || "confirmed").replace(/\s/g, "-");
            return `
              <tr>
                <td><strong>${escapeHtml(o.orderId)}</strong></td>
                <td>${escapeHtml(o.packageName || o.package)}</td>
                <td>${escapeHtml(date)}</td>
                <td>$${(o.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td><span class="status-badge ${escapeHtml(statusClass)}">${escapeHtml(capitalize(o.status || "confirmed"))}</span></td>
              </tr>
            `;
          })
          .join("");
      }
    }

    // Invoices
    const invoicesList = document.getElementById("invoices-list");
    const invoicesEmpty = document.getElementById("invoices-empty");

    if (userOrders.length === 0) {
      if (invoicesList) invoicesList.style.display = "none";
      if (invoicesEmpty) invoicesEmpty.style.display = "";
    } else {
      if (invoicesList) invoicesList.style.display = "";
      if (invoicesEmpty) invoicesEmpty.style.display = "none";
      if (invoicesList) {
        invoicesList.innerHTML = userOrders
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map((o) => {
            const date = new Date(o.createdAt).toLocaleDateString("en-US", {
              year: "numeric", month: "short", day: "numeric",
            });
            return `
              <div class="invoice-card">
                <div class="invoice-info">
                  <span class="invoice-id">INV-${escapeHtml((o.orderId || "").replace("ORD-", ""))}</span>
                  <span class="invoice-date">${escapeHtml(date)} &bull; ${escapeHtml(o.packageName || o.package)}</span>
                </div>
                <div class="invoice-actions">
                  <span class="invoice-amount">$${(o.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <button class="btn btn-sm btn-ghost" onclick="alert('Invoice download will be available when Stripe is connected.')">Download</button>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    // Payment Methods (stub — show card ending from orders)
    const methodsList = document.getElementById("payment-methods-list");
    const methodsEmpty = document.getElementById("methods-empty");

    if (userOrders.length > 0) {
      if (methodsList) methodsList.style.display = "";
      if (methodsEmpty) methodsEmpty.style.display = "none";
      if (methodsList) {
        methodsList.innerHTML = `
          <div class="saved-card">
            <div class="card-display">
              <div class="card-icon">VISA</div>
              <div class="card-details">
                <strong>•••• •••• •••• 4242</strong>
                <span>Expires 12/28</span>
              </div>
            </div>
            <div style="display:flex;gap:.5rem">
              <span class="status-badge confirmed">Default</span>
              <button class="btn btn-sm btn-ghost" onclick="alert('Card management will be available when Stripe is connected.')">Edit</button>
            </div>
          </div>
        `;
      }
    } else {
      if (methodsList) methodsList.style.display = "none";
      if (methodsEmpty) methodsEmpty.style.display = "";
    }
  }

  // ── Save Settings ──────────────────────────────────
  const saveSettingsBtn = document.getElementById("save-settings");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      currentUser.fullName = document.getElementById("settings-name").value.trim();
      currentUser.email = document.getElementById("settings-email").value.trim();
      currentUser.phone = document.getElementById("settings-phone").value.trim();
      currentUser.businessName = document.getElementById("settings-business").value.trim();
      localStorage.setItem("angelorum_session", JSON.stringify(currentUser));

      const status = document.getElementById("settings-status");
      if (status) {
        status.textContent = "✓ Settings saved successfully.";
        setTimeout(() => { status.textContent = ""; }, 3000);
      }

      // Update display name
      const nameEl = document.getElementById("portal-user-name");
      const emailEl = document.getElementById("portal-user-email");
      if (nameEl) nameEl.textContent = currentUser.fullName;
      if (emailEl) emailEl.textContent = currentUser.email;
    });
  }

  // ── Add Payment Method Stub ────────────────────────
  const addMethodBtn = document.getElementById("add-payment-method");
  if (addMethodBtn) {
    addMethodBtn.addEventListener("click", () => {
      alert("Payment method management will be available when your Stripe account is connected.\n\nThis will use Stripe's SetupIntent to securely save payment methods.");
    });
  }

  // ── Utilities ──────────────────────────────────────
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str || ""));
    return div.innerHTML;
  }

  // ── Initialize ─────────────────────────────────────
  checkSession();

})();
