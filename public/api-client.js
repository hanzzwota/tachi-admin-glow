(() => {
  const api = async (path, options = {}) => {
    const response = await fetch(`/api/${path}`, { credentials: 'include', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal');
    return data;
  };
  const toast = (message) => window.showToast?.(message);
  const localDb = () => {
    try { return JSON.parse(localStorage.getItem('tachi69_db')) || {}; } catch { return {}; }
  };
  const saveLocal = (data) => localStorage.setItem('tachi69_db', JSON.stringify(data));
  const format = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return 'Selamat pagi';
    if (hour >= 11 && hour < 15) return 'Selamat siang';
    if (hour >= 15 && hour < 18) return 'Selamat sore';
    return 'Selamat malam';
  };

  async function syncAppData() {
    const [{ user }, { settings }, { deposits }] = await Promise.all([api('auth/me'), api('settings'), api('deposits')]);
    if (!user) return null;
    sessionStorage.setItem('tachi_user', user.username);
    const data = localDb();
    data.settings = { ...(data.settings || {}), rate: settings.rate, minTarik: settings.min_withdrawal, fee: settings.fee, campaignPass: settings.campaign_password, storOpen: settings.store_open, tarikOpen: settings.withdraw_open, dailyMax: settings.daily_limit, limit: settings.batch_limit, announcement: settings.announcement };
    data.users = [...(data.users || []).filter((item) => item.username !== user.username), { username: user.username, password: '', saldo: user.balance, withdrawn: user.withdrawn, wallet: { name: '', dana: '' }, vip: false }];
    data.setoran = deposits.map((item) => ({ id: item.id, date: new Date(item.created_at).getTime(), user: user.username, emails: item.emails || [], status: item.status, accepted: item.accepted_count, earned: item.earned, reason: item.reason }));
    saveLocal(data);
    ['dashboardBalance', 'saldoBalance', 'withdrawAvailableBalance'].forEach((id) => { const element = document.getElementById(id); if (element) element.textContent = format(user.balance); });
    const profileBalance = document.getElementById('profileBalance');
    if (profileBalance) profileBalance.textContent = format(user.balance);
    const welcome = document.getElementById('welcomeGreeting');
    if (welcome) welcome.innerHTML = `${greeting()}, <span id="welcomeName" class="text-slate-800 font-bold"></span>`;
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) welcomeName.textContent = user.displayName || user.username;
    const profileName = document.getElementById('profileDisplayName');
    if (profileName) profileName.textContent = user.displayName || user.username;
    const profileUsername = document.getElementById('profileUsername');
    if (profileUsername) profileUsername.textContent = `Username: @${user.username}`;
    const password = document.getElementById('requiredPasswordText'); if (password) password.textContent = settings.campaign_password;
    return { user, settings, deposits };
  }

  window.handleAuthSubmit = async (event) => {
    event.preventDefault();
    const fields = [...event.target.querySelectorAll('input')];
    const isRegister = fields.length > 2;
    try {
      const payload = isRegister
        ? { displayName: fields[0].value, username: fields[1].value, password: fields[3].value }
        : { username: fields[0].value, password: fields[1].value };
      const result = await api(isRegister ? 'auth/register' : 'auth/login', { method: 'POST', body: JSON.stringify(payload) });
      if (result.user.role === 'admin') { location.href = '/admin'; return; }
      await syncAppData();
      toast(isRegister ? 'Akun berhasil dibuat' : 'Login berhasil');
      setTimeout(() => window.navigateTo?.('dashboard'), 250);
    } catch (error) { toast(error.message); }
  };

  window.submitGmailStoran = async () => {
    const input = document.getElementById('gmailListInput');
    const emails = input?.value.split(/\s+/).map((value) => value.trim().toLowerCase()).filter(Boolean) || [];
    try {
      const { settings } = await api('settings');
      await api('deposits', { method: 'POST', body: JSON.stringify({ emails, campaignPassword: settings.campaign_password }) });
      input.value = '';
      await syncAppData();
      toast('Setoran Gmail berhasil dikirim dan menunggu validasi admin');
      setTimeout(() => window.navigateTo?.('riwayat'), 300);
    } catch (error) { toast(error.message); }
  };

  window.copyCampaignPassword = async () => {
    try { const { settings } = await api('settings'); await navigator.clipboard.writeText(settings.campaign_password); toast('Password berhasil disalin'); } catch (error) { toast(error.message); }
  };

  window.logout = async () => {
    try { await api('auth/logout', { method: 'POST' }); } catch {}
    sessionStorage.removeItem('tachi_user');
    sessionStorage.removeItem('adm');
    location.href = '/login';
  };

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const { user } = await api('auth/me');
      const requestedView = new URLSearchParams(location.search).get('view');
      if (user) {
        await syncAppData();
        if (requestedView && !['login', 'register'].includes(requestedView)) setTimeout(() => window.navigateTo?.(requestedView), 0);
      } else if (!['login', 'register'].includes(requestedView || 'login')) window.navigateTo?.('login');
    } catch (error) { console.warn('Backend belum siap:', error.message); }
  });
})();
