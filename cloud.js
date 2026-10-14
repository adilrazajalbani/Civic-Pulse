(() => {
  const config = window.CIVICPULSE_CONFIG || {};
  const apiBaseUrl = (config.apiBaseUrl || 'http://localhost:3000/api').replace(/\/$/, '');
  const hasCredentials = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const client = hasCredentials && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  const knownReportIds = new Set();

  function normalizeLocalReport(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      location: row.location,
      area: row.area,
      priority: row.priority,
      score: row.score,
      status: row.status,
      reportedAt: Number(row.reportedAt ?? 0),
      department: row.department,
      reporter: row.reporter,
      image: row.image,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      duplicateOf: row.duplicateOf || null,
      resolution: row.resolution || null,
      resolutionImage: row.resolutionImage || null,
      resolvedAt: row.resolvedAt ? Number(row.resolvedAt) : undefined,
      history: Array.isArray(row.history) ? row.history : []
    };
  }

  function toReport(row) {
    if (row && Object.prototype.hasOwnProperty.call(row, 'reportedAt')) {
      return normalizeLocalReport(row);
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      location: row.location,
      area: row.area,
      priority: row.priority,
      score: row.score,
      status: row.status,
      reportedAt: new Date(row.reported_at).getTime(),
      department: row.department,
      reporter: row.reporter,
      image: row.image_url,
      lat: row.lat,
      lng: row.lng,
      duplicateOf: row.duplicate_of,
      resolution: row.resolution,
      resolutionImage: row.resolution_image_url,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
      history: row.history || []
    };
  }

  function toRow(report) {
    return {
      id: report.id,
      title: report.title,
      description: report.description,
      category: report.category,
      location: report.location,
      area: report.area,
      priority: report.priority,
      score: report.score,
      status: report.status,
      reported_at: new Date(report.reportedAt).toISOString(),
      department: report.department,
      reporter: report.reporter || 'Resident',
      image_url: report.image || null,
      lat: report.lat ?? null,
      lng: report.lng ?? null,
      duplicate_of: report.duplicateOf || null,
      resolution: report.resolution || null,
      resolution_image_url: report.resolutionImage || null,
      resolved_at: report.resolvedAt ? new Date(report.resolvedAt).toISOString() : null,
      history: report.history || []
    };
  }

  function normalizeReports(rows) {
    const reports = rows.map(toReport);
    return typeof window.localizePakistanDemoReports === 'function'
      ? window.localizePakistanDemoReports(reports)
      : reports;
  }

  async function apiRequest(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch (error) { payload = text; }
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && payload.error ? payload.error : `Request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function getStoredToken() {
    try {
      return localStorage.getItem('civicpulse-admin-token');
    } catch (error) {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (token) localStorage.setItem('civicpulse-admin-token', token);
      else localStorage.removeItem('civicpulse-admin-token');
    } catch (error) {
      // Ignore storage failures in private browsing or restricted environments.
    }
  }

  async function listReports() {
    if (!client) {
      const data = await apiRequest('/reports');
      const reports = normalizeReports(Array.isArray(data) ? data : []);
      knownReportIds.clear();
      reports.forEach(report => knownReportIds.add(report.id));
      return reports;
    }
    const { data, error } = await client.from('reports').select('*').order('reported_at', { ascending: false });
    if (error) throw error;
    const reports = normalizeReports(data);
    knownReportIds.clear();
    reports.forEach(report => knownReportIds.add(report.id));
    return reports;
  }

  async function saveReport(report) {
    if (!client) {
      const token = getStoredToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const exists = knownReportIds.has(report.id);
      const saved = await apiRequest(exists ? `/reports/${encodeURIComponent(report.id)}` : '/reports', {
        method: exists ? 'PUT' : 'POST',
        headers,
        body: report
      });
      knownReportIds.add(report.id);
      return toReport(saved);
    }
    const { error } = await client.from('reports').upsert(toRow(report));
    if (error) throw error;
    knownReportIds.add(report.id);
  }

  async function readRules() {
    if (!client) {
      const data = await apiRequest('/rules');
      return data || null;
    }
    const { data, error } = await client.from('priority_rules').select('rules').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.rules || null;
  }

  async function writeRules(rules) {
    if (!client) {
      const token = getStoredToken();
      if (!token) throw new Error('Administrator not signed in.');
      return apiRequest('/rules', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: rules });
    }
    const { error } = await client.from('priority_rules').upsert({ id: 1, rules });
    if (error) throw error;
  }

  async function uploadPhoto(file, reportId, purpose) {
    if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be under 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (!client) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not read the selected photo.'));
        reader.onerror = () => reject(new Error(`Could not read the ${purpose === 'reports' ? 'report' : 'resolution'} photo.`));
        reader.readAsDataURL(file);
      });
    }
    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${purpose}/${reportId}-${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from('civicpulse-evidence').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    return client.storage.from('civicpulse-evidence').getPublicUrl(path).data.publicUrl;
  }

  async function signIn(email, password) {
    if (!client) {
      const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
      setStoredToken(data.user?.token || null);
      return data.user || { email };
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user?.app_metadata?.civicpulse_admin !== true) {
      await client.auth.signOut();
      throw new Error('This account is not configured as a CivicPulse administrator.');
    }
    return data.user;
  }

  async function signOut() {
    const token = getStoredToken();
    if (!client && token) {
      try {
        await apiRequest('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch (error) {
        // Ignore logout network issues and clear local session anyway.
      }
      setStoredToken(null);
      return;
    }
    if (!client) {
      setStoredToken(null);
      return;
    }
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function currentUser() {
    if (!client) {
      const token = getStoredToken();
      if (!token) return null;
      try {
        const payload = await apiRequest('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        return payload && payload.email ? { email: payload.email, displayName: payload.displayName, role: 'admin' } : null;
      } catch (error) {
        setStoredToken(null);
        return null;
      }
    }
    const { data, error } = await client.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    return data.user?.app_metadata?.civicpulse_admin === true ? data.user : null;
  }

  function subscribeToReports(onChange) {
    if (!client) {
      let timer = null;
      const poll = async () => {
        try {
          const reports = await listReports();
          onChange(reports);
        } catch (error) {
          // Ignore polling failures; the UI will retry on the next tick.
        }
      };
      timer = setInterval(poll, 5000);
      poll();
      return { unsubscribe: () => clearInterval(timer) };
    }
    return client.channel('civicpulse-report-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, onChange)
      .subscribe();
  }

  window.CivicPulseCloud = {
    configured: Boolean(client || config.apiBaseUrl),
    configurationError: hasCredentials && !client ? 'Supabase SDK did not load. Check your connection and reload.' : '',
    listReports,
    saveReport,
    readRules,
    writeRules,
    uploadPhoto,
    signIn,
    signOut,
    currentUser,
    subscribeToReports
  };
})();
