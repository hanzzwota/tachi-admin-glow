(() => {
  const api = async (path, options = {}) => {
    const response = await fetch(`/api/${path}`, { credentials: 'include', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal');
    return data;
  };
  const notify = (message) => window.toast?.(message);
  const refresh = async () => {
    const [{ deposits }, { users }, { settings }] = await Promise.all([api('admin/deposits'), api('admin/users'), api('settings')]);
    const data = (() => { try { return JSON.parse(localStorage.getItem('tachi69_db')) || {}; } catch { return {}; } })();
    data.settings = { rate: 4500, minTarik: 4000, fee: 0, campaignPass: 'sgsg1122', storOpen: true, tarikOpen: true, checkerOpen: true, dailyMax: 500, limit: 1, announcement: '', autoStockEnabled: false, gmailStock: [], ...(data.settings || {}), rate: Number(settings?.rate ?? 4500), minTarik: Number(settings?.min_withdrawal ?? 4000), fee: Number(settings?.fee ?? 0), campaignPass: settings?.campaign_password || 'sgsg1122', storOpen: settings?.store_open !== false, tarikOpen: settings?.withdraw_open !== false, dailyMax: Number(settings?.daily_limit ?? 500), limit: Number(settings?.batch_limit ?? 1), announcement: settings?.announcement || '', autoStockEnabled: settings?.auto_stock_enabled === true, gmailStock: Array.isArray(settings?.gmail_stock) ? settings.gmail_stock : [] };
    data.setoran = deposits.map((item) => ({ id: item.id, date: new Date(item.created_at).getTime(), user: item.profiles?.username || item.user_id, emails: item.emails || [], status: item.status, accepted: item.accepted_count, earned: item.earned, reason: item.reason }));
    data.users = users.map((item) => ({ username: item.username, password: '', saldo: item.balance, withdrawn: item.withdrawn, wallet: { name: '', dana: '' }, vip: false }));
    data.withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
    localStorage.setItem('tachi69_db', JSON.stringify(data));
    window.reloadAdminDb?.();
  };
  window.doLogin = async (event) => {
    event.preventDefault();
    try {
      const result = await api('auth/login', { method: 'POST', body: JSON.stringify({ username: lu.value.trim(), password: lp.value }) });
      if (result.user.role !== 'admin') throw new Error('Akun ini bukan admin');
      sessionStorage.setItem('adm', '1');
      await refresh();
      showApp();
    } catch (error) { lerr.textContent = error.message; lerr.classList.remove('hidden'); }
  };
  window.doAcc = async (id) => {
    try { const count = Number(document.getElementById('accN')?.value || 0); await api(`admin/deposits/${id}/approve`, { method: 'POST', body: JSON.stringify({ acceptedCount: count }) }); closeModal(); await refresh(); notify('Setoran diterima dan saldo user diperbarui'); } catch (error) { notify(error.message); }
  };
  window.doRej = async (id) => {
    try { const reason = document.querySelector('input[name="rr"]:checked')?.value || 'Ditolak admin'; await api(`admin/deposits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); closeModal(); await refresh(); notify('Setoran ditolak'); } catch (error) { notify(error.message); }
  };
  window.saveSettings = async (event) => {
    event.preventDefault();
    try {
      await api('admin/settings', { method: 'PATCH', body: JSON.stringify({ rate: cRate.value, minWithdrawal: cMin.value, fee: cFee.value, campaignPassword: cPass.value, storeOpen: true, withdrawOpen: true, dailyLimit: cDaily.value, batchLimit: cLimit.value, announcement: cAnn.value, autoStockEnabled: cAutoStock.checked, gmailStock: cStock.value.split(/\s+/).map((x) => x.trim()).filter(Boolean) }) });
      await refresh(); notify('Pengaturan tersimpan');
    } catch (error) { notify(error.message); }
  };
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const { user } = await api('auth/me');
      if (!user || user.role !== 'admin') {
        sessionStorage.removeItem('adm');
        window.top.location.href = '/login';
        return;
      }
      sessionStorage.setItem('adm', '1');
      sessionStorage.setItem('tachi_user', user.username);
      await refresh();
      showApp();
    } catch (error) { notify(error.message); }
  });
})();
