const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const yearEl = document.getElementById("year");

yearEl.textContent = new Date().getFullYear();

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
