/**
 * Admin Dashboard — Inquiry Management
 */

(function () {
  "use strict";

  let apiBase = null;
  let allInquiries = [];
  let currentFilter = 'all';

  // Load config and fetch inquiries
  fetch('./config.json')
    .then(r => r.ok ? r.json() : Promise.reject('No config'))
    .then(cfg => {
      apiBase = cfg.apiEndpoint.replace(/\/inquiries$/, '');
      return loadInquiries();
    })
    .catch(err => {
      console.error('Config error:', err);
      showError('Failed to load configuration');
    });

  // Load all inquiries
  async function loadInquiries() {
    const container = document.getElementById('inquiries-container');
    container.innerHTML = '<div class="loader"><div class="spinner"></div><p>Loading inquiries...</p></div>';

    try {
      const res = await fetch(`${apiBase}/inquiries/all`);
      const json = await res.json();

      if (json.success && json.data) {
        allInquiries = json.data;
        renderInquiries();
      } else {
        showError('Failed to load inquiries');
      }
    } catch (err) {
      console.error('Load error:', err);
      showError('Error loading inquiries');
    }
  }

  // Render inquiries based on filter
  function renderInquiries() {
    const container = document.getElementById('inquiries-container');
    
    let filtered = allInquiries;
    if (currentFilter !== 'all') {
      filtered = allInquiries.filter(i => i.status === currentFilter);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>No inquiries found.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(inquiry => `
        <div class="inquiry-card">
          <div class="inquiry-header">
            <div class="inquiry-name">${escapeHtml(inquiry.name)}</div>
            <span class="inquiry-status ${inquiry.status}">${inquiry.status}</span>
          </div>
          <div class="inquiry-details">
            <div class="inquiry-detail-row">
              <span class="inquiry-detail-label">Email:</span>
              <span><a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a></span>
            </div>
            <div class="inquiry-detail-row">
              <span class="inquiry-detail-label">Business:</span>
              <span>${escapeHtml(inquiry.businessName)}</span>
            </div>
            <div class="inquiry-detail-row">
              <span class="inquiry-detail-label">Phone:</span>
              <span>${inquiry.phone ? escapeHtml(inquiry.phone) : '—'}</span>
            </div>
            <div class="inquiry-message">${escapeHtml(inquiry.details)}</div>
          </div>
          <div class="inquiry-meta">
            <span>${(() => {
              const d = new Date(inquiry.createdAt);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            })()}</span>
            <div class="inquiry-actions">
              <button class="btn-sm btn-status" onclick="updateStatus('${inquiry.id}')">Mark Done</button>
              <button class="btn-sm btn-delete" onclick="deleteInquiry('${inquiry.id}')">Delete</button>
            </div>
          </div>
        </div>
      `)
      .join('');
  }

  // Update inquiry status
  window.updateStatus = async function(id) {
    const inquiry = allInquiries.find(i => i.id === id);
    if (!inquiry) return;

    const nextStatus = {
      'new': 'contacted',
      'contacted': 'in-progress',
      'in-progress': 'completed',
      'completed': 'new'
    }[inquiry.status] || 'contacted';

    try {
      const url = `${apiBase}/inquiries/${id}`;
      console.log('PUT request to:', url);
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      console.log('PUT response status:', res.status);

      const json = await res.json();
      console.log('PUT response data:', json);
      if (json.success) {
        inquiry.status = nextStatus;
        renderInquiries();
      } else {
        alert('Failed to update inquiry');
      }
    } catch (err) {
      console.error('Update error:', err);
      alert('Error updating inquiry');
    }
  };

  // Delete inquiry
  window.deleteInquiry = async function(id) {
    if (!confirm('Are you sure you want to delete this inquiry?')) return;

    try {
      const url = `${apiBase}/inquiries/${id}`;
      console.log('DELETE request to:', url);
      const res = await fetch(url, {
        method: 'DELETE'
      });
      console.log('DELETE response status:', res.status);

      const json = await res.json();
      console.log('DELETE response data:', json);
      if (json.success) {
        allInquiries = allInquiries.filter(i => i.id !== id);
        renderInquiries();
      } else {
        alert('Failed to delete inquiry');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error deleting inquiry');
    }
  };

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderInquiries();
    });
  });

  // Helpers
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function showError(msg) {
    document.getElementById('inquiries-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>${msg}</p>
      </div>
    `;
  }

})();
