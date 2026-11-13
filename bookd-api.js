// BOOKD's one doorway to the backend. Pages call window.BOOKD and never talk to
// Supabase themselves, so the pages stay simple and the provider can change later.
// Every call resolves to { ok: true, ... } or { ok: false, code } and never throws.
// Codes: badLogin, unconfirmed, taken, weak, samePw, rate, expired, invalid, offline, unknown.
// BOOKD.who is a small note of who is signed in ({ name, role }), there the moment a page loads, for the menu bar only.
// It is never proof of anything: the database checks every request itself.
(function () {
  var cfg = window.BOOKD_CONFIG || {};
  var lib = window.supabase;
  var ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && lib && lib.createClient);
  var hash = String(location.hash || '');
  // Set before the library reads and clears the address: which email link brought this person here.
  var arrived = /[#&]type=recovery\b/.test(hash) ? 'recovery' : (/[#&]type=invite\b/.test(hash) ? 'invite' : (/[#&]error(_code)?=/.test(hash) ? 'expired' : ''));
  var BOOKD = window.BOOKD = { ready: ready, arrived: arrived, who: null, auth: {}, contact: {}, apply: {} };
  if (!ready) return;

  var WHO = 'bookd.who';
  function remember(me) {
    BOOKD.who = me ? { name: me.name || '', role: me.role || 'host' } : null;
    try { if (BOOKD.who) localStorage.setItem(WHO, JSON.stringify(BOOKD.who)); else localStorage.removeItem(WHO); } catch (e) {}
    return me;
  }
  try { var w = JSON.parse(localStorage.getItem(WHO) || 'null'); if (w && typeof w.role === 'string') BOOKD.who = { name: String(w.name || ''), role: w.role }; } catch (e) {}

  var sb = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'bookd.auth' }
  });
  BOOKD.client = sb;

  function page(file) { return location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') + file; }

  function code(err) {
    if (!err) return 'unknown';
    var c = String(err.code || ''), m = String(err.message || '').toLowerCase(), s = err.status || 0;
    if (c === 'invalid_credentials' || m.indexOf('invalid login') >= 0) return 'badLogin';
    if (c === 'email_not_confirmed' || m.indexOf('not confirmed') >= 0) return 'unconfirmed';
    if (c === 'user_already_exists' || c === 'email_exists' || m.indexOf('already registered') >= 0) return 'taken';
    if (c === 'same_password' || m.indexOf('different from the old') >= 0) return 'samePw';
    if (c === 'weak_password' || m.indexOf('password should') >= 0) return 'weak';
    if (s === 429 || c.indexOf('rate_limit') >= 0 || m.indexOf('rate limit') >= 0) return 'rate';
    if (c === '23514' || c === '23502' || c === '22001') return 'invalid';
    if (c === 'otp_expired' || c === 'session_not_found' || m.indexOf('session missing') >= 0) return 'expired';
    if (err.name === 'AuthRetryableFetchError' || m.indexOf('failed to fetch') >= 0 || m.indexOf('network') >= 0 || s === 0 && err.name === 'TypeError') return 'offline';
    return 'unknown';
  }
  function fail(err) { return { ok: false, code: code(err) }; }
  function guard(p) { return p.then(function (r) { return r; }, fail); }

  // Who is this, as the rest of the site needs it: id, email, name, role (host, dj or admin).
  function describe(user) {
    if (!user) return Promise.resolve(remember(null));
    var meta = user.user_metadata || {};
    var me = { id: user.id, email: user.email || '', name: meta.name || '', role: 'host' };
    return sb.from('profiles').select('role, display_name').eq('id', user.id).maybeSingle().then(function (r) {
      if (r && r.data) { me.role = r.data.role || 'host'; me.name = r.data.display_name || me.name; }
      return remember(me);
    }, function () { return me; });
  }

  BOOKD.auth.current = function () {
    return guard(sb.auth.getSession().then(function (r) {
      var u = r && r.data && r.data.session ? r.data.session.user : null;
      return describe(u).then(function (me) { return { ok: true, user: me }; });
    }));
  };

  BOOKD.auth.signUp = function (o) {
    return guard(sb.auth.signUp({
      email: o.email, password: o.password,
      options: { data: { name: o.name || '' }, emailRedirectTo: page('login.html') }
    }).then(function (r) {
      if (r.error) return fail(r.error);
      var u = r.data && r.data.user;
      // Supabase answers a sign up for an email that already has an account with a look-alike user that has no identities.
      if (u && u.identities && u.identities.length === 0) return { ok: false, code: 'taken' };
      if (!r.data.session) return { ok: true, needsConfirm: true };
      return describe(u).then(function (me) { return { ok: true, needsConfirm: false, user: me }; });
    }));
  };

  BOOKD.auth.signIn = function (o) {
    return guard(sb.auth.signInWithPassword({ email: o.email, password: o.password }).then(function (r) {
      if (r.error) return fail(r.error);
      return describe(r.data.user).then(function (me) { return { ok: true, user: me }; });
    }));
  };

  BOOKD.auth.signOut = function () {
    remember(null);
    return guard(sb.auth.signOut().then(function (r) { return r.error ? fail(r.error) : { ok: true }; }));
  };

  // Always answers ok unless the request itself failed, so the page never reveals whether an email has an account.
  BOOKD.auth.sendReset = function (email) {
    return guard(sb.auth.resetPasswordForEmail(email, { redirectTo: page('login.html') }).then(function (r) {
      if (r.error && code(r.error) !== 'unknown') return fail(r.error);
      return { ok: true };
    }));
  };

  // For someone who arrived from a reset or invite email (they are signed in by the link).
  BOOKD.auth.setPassword = function (password) {
    return guard(sb.auth.updateUser({ password: password }).then(function (r) {
      if (r.error) return fail(r.error);
      return describe(r.data.user).then(function (me) { return { ok: true, user: me }; });
    }));
  };

  // The two forms anyone can send. The database only lets the public add a row, never read one back.
  function add(table, row) {
    return guard(sb.from(table).insert(row).then(function (r) {
      if (!r.error) return { ok: true };
      return fail({ code: r.error.code, message: r.error.message, status: r.status });
    }));
  }
  function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

  // "Send us a note" on the Contact page. o: name, email, who (host, dj, agent or other), message.
  BOOKD.contact.send = function (o) {
    return add('contact_messages', {
      name: clip(o.name, 120) || 'No name given', email: clip(o.email, 200),
      who: /^(host|dj|agent|other)$/.test(o.who) ? o.who : 'other', message: clip(o.message, 4000)
    });
  };

  // The application on the For artists page. o: name, email, links, city, next, fee.
  BOOKD.apply.send = function (o) {
    return add('dj_applications', {
      name: clip(o.name, 120), email: clip(o.email, 200), set_links: clip(o.links, 2000),
      home_city: clip(o.city, 120), upcoming: clip(o.next, 500), fee_range: clip(o.fee, 120)
    });
  };

  // For the other files in web/api/, which add one area each (roster, account, DJ dashboard, admin).
  // The build joins them onto the end of this file, so the site still loads one script.
  BOOKD._ = { sb: sb, guard: guard, fail: fail, clip: clip, describe: describe,
    // a database answer -> { ok: false, code } or null when it worked
    bad: function (r) { return r && r.error ? fail({ code: r.error.code, message: r.error.message, status: r.status }) : null; } };

  // Keep the menu bar's note honest: check the real session quietly on every page.
  BOOKD.auth.current();
})();

// The account page: the signed in person's own details, kept in the profiles table.
// The database only lets a person read and change their own row, and never their role.
(function () {
  var B = window.BOOKD;
  if (!B || !B.ready) return;
  var _ = B._, sb = _.sb;

  // The signed in person as the browser knows them, or null.
  function session() {
    return sb.auth.getSession().then(function (r) {
      return r && r.data && r.data.session ? r.data.session.user : null;
    });
  }
  var out = { ok: false, code: 'expired' };

  B.account = {
    // Everything the page shows. Resolves { ok: true, user: null } when nobody is signed in.
    // user: id, email, pendingEmail, name, phone, role, notifyText, notifyEmail
    load: function () {
      return _.guard(session().then(function (u) {
        if (!u) return { ok: true, user: null };
        return sb.from('profiles').select('role, display_name, phone, notify_text, notify_email').eq('id', u.id).maybeSingle().then(function (r) {
          var b = _.bad(r);
          if (b) return b;
          var p = r.data || {}, meta = u.user_metadata || {};
          return { ok: true, user: {
            id: u.id, email: u.email || '', pendingEmail: u.new_email || '',
            name: p.display_name || meta.name || '', phone: p.phone || '', role: p.role || 'host',
            notifyText: p.notify_text !== false, notifyEmail: p.notify_email !== false
          } };
        });
      }));
    },

    // Name and phone go to the profile. o: name, phone, email (leave email out, or the same, to keep it).
    // A new email is asked for after the rest is saved. Supabase emails a link to the new address and
    // the email only changes once that link is opened: then the answer has emailSent: true.
    // When the name and phone saved but the email was refused the answer is { ok: false, code, part: 'email', name, phone }.
    save: function (o) {
      return _.guard(session().then(function (u) {
        if (!u) return out;
        var row = { display_name: _.clip(o.name, 120), phone: _.clip(o.phone, 40) || null };
        return sb.from('profiles').update(row).eq('id', u.id).select('display_name, phone').maybeSingle().then(function (r) {
          var b = _.bad(r);
          if (b) return b;
          if (!r.data) return { ok: false, code: 'unknown' };
          var saved = { name: r.data.display_name || '', phone: r.data.phone || '' };
          // refresh the menu bar's note of who is signed in
          return _.describe(u).then(function () {
            var email = _.clip(o.email, 200).toLowerCase(), old = String(u.email || '');
            if (!email || email === old.toLowerCase()) return { ok: true, name: saved.name, phone: saved.phone, email: old, emailSent: false };
            var back = location.href.split('#')[0].split('?')[0];
            return sb.auth.updateUser({ email: email }, { emailRedirectTo: back }).then(function (e) {
              if (e.error) { var f = _.fail(e.error); f.part = 'email'; f.name = saved.name; f.phone = saved.phone; return f; }
              var now = e.data && e.data.user ? String(e.data.user.email || '') : old;
              var changed = now.toLowerCase() === email;
              return { ok: true, name: saved.name, phone: saved.phone, email: changed ? now : old, emailSent: !changed, pendingEmail: changed ? '' : email };
            });
          });
        });
      }));
    },

    // The two switches the database keeps: texts and emails. o: { text: true or false } and or { email: true or false }.
    setNotify: function (o) {
      return _.guard(session().then(function (u) {
        if (!u) return out;
        var row = {};
        if (typeof o.text === 'boolean') row.notify_text = o.text;
        if (typeof o.email === 'boolean') row.notify_email = o.email;
        return sb.from('profiles').update(row).eq('id', u.id).select('notify_text, notify_email').maybeSingle().then(function (r) {
          var b = _.bad(r);
          if (b) return b;
          if (!r.data) return { ok: false, code: 'unknown' };
          return { ok: true, notifyText: r.data.notify_text !== false, notifyEmail: r.data.notify_email !== false };
        });
      }));
    },

    // Checks the current password by logging in with it again, then saves the new one. o: current, next.
    // A wrong current password answers { ok: false, code: 'badLogin' }.
    changePassword: function (o) {
      return _.guard(session().then(function (u) {
        if (!u || !u.email) return out;
        return sb.auth.signInWithPassword({ email: u.email, password: String(o.current || '') }).then(function (r) {
          if (r.error) return _.fail(r.error);
          return sb.auth.updateUser({ password: String(o.next || '') }).then(function (p) {
            return p.error ? _.fail(p.error) : { ok: true };
          });
        });
      }));
    }
  };
})();

// Erika's dashboard (Admin6). Everything here only works for an admin: the database checks every call itself.
// Reads: the whole roster with drafts, each DJ's private contact details and tour dates, the artist applications, the contact notes.
// Writes: add or edit a DJ, put them live or back to draft, add and remove tour dates (source 'admin'), answer an application.
// Nothing here sends an email. A DJ claims a profile by signing up with the contact email saved on it.
(function () {
  var B = window.BOOKD;
  if (!B || !B.ready) return;
  var _ = B._, sb = _.sb;

  // A photo is a full address, a file that ships with the site, or a file in the dj-photos bucket (the same rule as the roster page).
  function photo(path) {
    if (!path) return '';
    if (/^(https:\/\/|assets\/)/.test(path)) return path;
    try { return sb.storage.from('dj-photos').getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
  }
  function nul(v, n) { var s = _.clip(v, n); return s ? s : null; }
  function money(v) { var n = parseInt(v, 10); return isFinite(n) && n >= 0 ? n : null; }
  function myId() {
    return sb.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session.user.id : null; });
  }
  // the profile's address on the site, made from the name: "Jude & Frank" -> jude-frank
  function slugOf(name) {
    var s = String(name || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return s || 'dj';
  }
  // the columns of djs this page edits; everything else on the row is left alone
  function djRow(o) {
    var lo = money(o.fee_low), hi = money(o.fee_high);
    if (lo != null && hi != null && lo > hi) { var t = lo; lo = hi; hi = t; }
    return {
      name: _.clip(o.name, 120), home_city: _.clip(o.home_city, 120), sound: _.clip(o.sound, 200), bio: _.clip(o.bio, 2000),
      fee_low: lo, fee_high: hi,
      soundcloud_url: nul(o.soundcloud_url, 500), mixcloud_url: nul(o.mixcloud_url, 500), youtube_url: nul(o.youtube_url, 500),
      status: o.status === 'live' ? 'live' : 'draft'
    };
  }
  // a new roster row; if the address is taken, try name-2, name-3 and so on
  function insertDj(row, n) {
    var base = slugOf(row.name), slug = n > 1 ? base + '-' + n : base;
    return sb.from('djs').insert(Object.assign({ slug: slug }, row)).select('id, slug').single().then(function (r) {
      if (r.error && r.error.code === '23505' && n < 9) return insertDj(row, n + 1);
      if (r.error && r.error.code === '23505') return { ok: false, code: 'taken' };
      return _.bad(r) || { ok: true, id: r.data.id, slug: r.data.slug };
    });
  }
  function datesOf(id) {
    return sb.from('tour_dates').select('id, dj_id, city, starts_on, ends_on, source').eq('dj_id', id).order('starts_on').then(function (r) {
      return _.bad(r) || { ok: true, dates: r.data || [] };
    });
  }
  // One DJ, start to finish: the roster row, then the private contact details, then the tour dates.
  // If a later step fails the answer still carries id and slug, so trying again updates the same DJ instead of adding a second one.
  function saveDj(o) {
    var row = djRow(o), id = o.id || null, slug = o.slug || null;
    function stop(x) { return { ok: false, code: x.code, id: id, slug: slug }; }
    var first = id
      ? sb.from('djs').update(row).eq('id', id).select('id, slug').then(function (r) {
          if (r.error) return _.bad(r);
          if (!r.data || !r.data.length) return { ok: false, code: 'unknown' };
          return { ok: true, id: r.data[0].id, slug: r.data[0].slug };
        })
      : insertDj(row, 1);
    return first.then(function (a) {
      if (!a.ok) return stop(a);
      id = a.id; slug = a.slug;
      return sb.from('dj_private').upsert({
        dj_id: id, contact_email: nul(o.contact_email, 200), agent_name: nul(o.agent_name, 120), agent_email: nul(o.agent_email, 200)
      }, { onConflict: 'dj_id' }).then(function (r) {
        var b = _.bad(r); if (b) return stop(b);
        var gone = (o.removeDates || []).filter(Boolean);
        return (gone.length ? sb.from('tour_dates').delete().eq('dj_id', id).in('id', gone) : Promise.resolve({})).then(function (r2) {
          var b2 = _.bad(r2); if (b2) return stop(b2);
          var add = (o.addDates || []).map(function (d) {
            return { dj_id: id, city: _.clip(d.city, 120), starts_on: d.starts_on, ends_on: d.ends_on || d.starts_on, source: 'admin' };
          });
          return (add.length ? sb.from('tour_dates').insert(add) : Promise.resolve({})).then(function (r3) {
            var b3 = _.bad(r3); if (b3) return stop(b3);
            return datesOf(id).then(function (d) {
              if (!d.ok) return stop(d);
              return { ok: true, id: id, slug: slug, dates: d.dates };
            });
          });
        });
      });
    });
  }
  // set an application's answer; pending clears who answered and when
  function answer(appId, status) {
    return myId().then(function (me) {
      var at = status === 'pending' ? null : new Date().toISOString();
      return sb.from('dj_applications').update({ status: status, reviewed_by: status === 'pending' ? null : me, reviewed_at: at })
        .eq('id', appId).select('id').then(function (r) {
          if (r.error) return _.bad(r);
          if (!r.data || !r.data.length) return { ok: false, code: 'unknown' };
          return { ok: true, reviewed_at: at };
        });
    });
  }
  // a draft nobody has claimed can be thrown away; anything live or owned stays
  function dropDraft(djId) {
    return sb.from('djs').delete().eq('id', djId).eq('status', 'draft').is('owner_id', null).then(function (r) {
      return _.bad(r) || { ok: true };
    });
  }

  B.admin = {
    // Everything the dashboard shows. DJs come back in name order, applications newest first. Nothing is ranked.
    load: function () {
      return _.guard(Promise.all([
        sb.from('djs').select('*').order('name'),
        sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email'),
        sb.from('tour_dates').select('id, dj_id, city, starts_on, ends_on, source').order('starts_on'),
        sb.from('dj_applications').select('*').order('created_at', { ascending: false })
      ]).then(function (rs) {
        for (var i = 0; i < rs.length; i++) { var b = _.bad(rs[i]); if (b) return b; }
        var priv = {}, dates = {};
        (rs[1].data || []).forEach(function (p) { priv[p.dj_id] = p; });
        (rs[2].data || []).forEach(function (t) { (dates[t.dj_id] = dates[t.dj_id] || []).push(t); });
        var djs = (rs[0].data || []).map(function (d) { return Object.assign({}, d, { photo: photo(d.cover_path), private: priv[d.id] || null, dates: dates[d.id] || [] }); });
        var apps = rs[3].data || [], ids = [];
        apps.forEach(function (a) { if (a.reviewed_by && ids.indexOf(a.reviewed_by) < 0) ids.push(a.reviewed_by); });
        var done = function (names) {
          return { ok: true, djs: djs, applications: apps.map(function (a) { return Object.assign({}, a, { reviewer: (a.reviewed_by && names[a.reviewed_by]) || '' }); }) };
        };
        if (!ids.length) return done({});
        // who answered each one; if the names will not load the list still does
        return sb.from('profiles').select('id, display_name').in('id', ids).then(function (r) {
          var names = {};
          if (r && !r.error) (r.data || []).forEach(function (p) { names[p.id] = p.display_name || ''; });
          return done(names);
        }, function () { return done({}); });
      }));
    },

    // The notes from the Contact page, newest first. Read only.
    notes: function () {
      return _.guard(sb.from('contact_messages').select('id, name, email, who, message, created_at').order('created_at', { ascending: false }).then(function (r) {
        return _.bad(r) || { ok: true, notes: r.data || [] };
      }));
    },

    // Add a DJ (no id) or save changes to one (id). o: id, slug, name, home_city, sound, fee_low, fee_high, bio,
    // soundcloud_url, mixcloud_url, youtube_url, status ('draft' or 'live'), contact_email, agent_name, agent_email,
    // removeDates (tour date ids), addDates ([{ city, starts_on, ends_on }]).
    // Answers { ok, id, slug, dates } with the DJ's full list of tour dates.
    saveDj: function (o) { return _.guard(saveDj(o || {})); },

    // Approve: make the draft with the applicant's email on it, then mark the application approved.
    // If the second step fails the draft is taken back out, so nothing is left half done.
    approve: function (appId, draft) {
      return _.guard(saveDj(Object.assign({}, draft, { id: null, status: 'draft' })).then(function (d) {
        if (!d.ok && d.id) return dropDraft(d.id).then(function () { return { ok: false, code: d.code }; }, function () { return { ok: false, code: d.code }; });
        if (!d.ok) return { ok: false, code: d.code };
        return answer(appId, 'approved').then(function (a) {
          if (a.ok) return { ok: true, id: d.id, slug: d.slug, dates: d.dates, reviewed_at: a.reviewed_at };
          return dropDraft(d.id).then(function () { return a; }, function () { return a; });
        });
      }));
    },

    // Pass: mark the application passed. No message goes to the DJ.
    pass: function (appId) { return _.guard(answer(appId, 'passed')); },

    // Undo: back to pending. After an approve, djId is the untouched draft that approve made, and it is removed first.
    reopen: function (appId, djId) {
      return _.guard((djId ? dropDraft(djId) : Promise.resolve({ ok: true })).then(function (d) {
        if (!d.ok) return d;
        return answer(appId, 'pending');
      }));
    }
  };
})();

// The DJ dashboard (DJ6): the signed in DJ's own roster profile, set links and tour dates.
// The database decides what is allowed: a DJ can change their own profile, tracks and dates, never who owns
// the profile or its address (slug). Every call resolves { ok: true, ... } or { ok: false, code } and never throws.
(function () {
  var B = window.BOOKD;
  if (!B || !B.ready) return;
  var _ = B._, sb = _.sb;

  var COLS = 'id, slug, name, sound, genres, home_city, agency, bio, cover_path, fee_low, fee_high, set_length, plays_on, ' +
    'room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url, status';
  // what a DJ may change on their own row, and the longest we send
  var TEXT = { name: 120, sound: 120, home_city: 120, bio: 2000, set_length: 200, plays_on: 400, room_needs: 400,
    table_needs: 400, arrival: 400, hospitality: 400, soundcloud_url: 300, mixcloud_url: 300, youtube_url: 300 };
  var EMPTY_OK = { name: false, sound: true, home_city: true, bio: true };   // these columns are not null, so '' not null

  function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
  function money(v) {
    if (v == null || v === '') return null;
    var n = Math.round(Number(v));
    return isFinite(n) && n >= 0 && n <= 100000000 ? n : NaN;
  }
  // A cover is a file in the dj-photos bucket; a full address or a site path is used as it is.
  function cover(path) {
    if (!path) return '';
    if (/^(https:\/\/|\/)/.test(path)) return path;
    try { return sb.storage.from('dj-photos').getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
  }
  function tidyDj(d, agent) {
    return {
      id: d.id, slug: d.slug, name: d.name || '', sound: d.sound || '', genres: d.genres || [], home_city: d.home_city || '',
      agency: d.agency || '', bio: d.bio || '', cover: cover(d.cover_path), fee_low: d.fee_low, fee_high: d.fee_high,
      set_length: d.set_length || '', plays_on: d.plays_on || '', room_needs: d.room_needs || '', table_needs: d.table_needs || '',
      arrival: d.arrival || '', hospitality: d.hospitality || '', soundcloud_url: d.soundcloud_url || '',
      mixcloud_url: d.mixcloud_url || '', youtube_url: d.youtube_url || '', status: d.status || 'draft', agent_name: agent || ''
    };
  }
  function tidyDate(t) { return { id: t.id, city: t.city, from: t.starts_on, to: t.ends_on, source: t.source }; }
  function tidyTrack(t) { return { position: t.position, title: t.title, url: t.url }; }
  var INVALID = { ok: false, code: 'invalid' };

  B.dj = {
    // Who is signed in, and their profile if they have one.
    // { ok, user: null } signed out. { ok, user, dj: null } no profile yet (or not a DJ). Else dj, tracks, dates.
    load: function () {
      return B.auth.current().then(function (a) {
        if (!a || !a.ok) return a || { ok: false, code: 'unknown' };
        var user = a.user;
        if (!user) return { ok: true, user: null, dj: null, tracks: [], dates: [] };
        if (user.role !== 'dj') return { ok: true, user: user, dj: null, tracks: [], dates: [] };
        return _.guard(sb.from('djs').select(COLS).eq('owner_id', user.id).order('created_at').limit(1).then(function (r) {
          var e = _.bad(r); if (e) return e;
          var d = r.data && r.data[0];
          if (!d) return { ok: true, user: user, dj: null, tracks: [], dates: [] };
          return Promise.all([
            sb.from('dj_tracks').select('position, title, url').eq('dj_id', d.id).order('position'),
            sb.from('tour_dates').select('id, city, starts_on, ends_on, source').eq('dj_id', d.id).order('starts_on'),
            sb.from('dj_private').select('agent_name').eq('dj_id', d.id).limit(1)
          ]).then(function (x) {
            var e2 = _.bad(x[0]) || _.bad(x[1]) || _.bad(x[2]); if (e2) return e2;
            var priv = x[2].data && x[2].data[0];
            return { ok: true, user: user, dj: tidyDj(d, priv && priv.agent_name),
              tracks: (x[0].data || []).map(tidyTrack), dates: (x[1].data || []).map(tidyDate) };
          });
        }));
      });
    },

    // Save profile edits. o holds only the fields to change: name, sound, genres, home_city, bio, fee_low, fee_high,
    // set_length, plays_on, room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url,
    // status ('draft' or 'live'), and agent_name (kept in dj_private). Resolves { ok, dj }.
    save: function (id, o) {
      o = o || {};
      var patch = {}, k, v, n = 0;
      for (k in TEXT) if (k in o) {
        v = _.clip(o[k], TEXT[k]);
        if (k === 'name' && !v) return Promise.resolve(INVALID);
        patch[k] = v || (k in EMPTY_OK ? '' : null); n++;
      }
      if ('genres' in o) {
        if (!Array.isArray(o.genres)) return Promise.resolve(INVALID);
        patch.genres = o.genres.map(function (g) { return _.clip(g, 40); }).filter(Boolean).slice(0, 12); n++;
      }
      if ('fee_low' in o) { patch.fee_low = money(o.fee_low); n++; }
      if ('fee_high' in o) { patch.fee_high = money(o.fee_high); n++; }
      if (patch.fee_low !== patch.fee_low || patch.fee_high !== patch.fee_high) return Promise.resolve(INVALID);
      if (patch.fee_low != null && patch.fee_high != null && patch.fee_low > patch.fee_high) return Promise.resolve(INVALID);
      if ('status' in o) { if (o.status !== 'draft' && o.status !== 'live') return Promise.resolve(INVALID); patch.status = o.status; n++; }
      var hasAgent = 'agent_name' in o, agent = hasAgent ? (_.clip(o.agent_name, 120) || null) : null;
      if (!id || (!n && !hasAgent)) return Promise.resolve(INVALID);

      var first = n ? sb.from('djs').update(patch).eq('id', id).select(COLS) : sb.from('djs').select(COLS).eq('id', id).limit(1);
      return _.guard(first.then(function (r) {
        var e = _.bad(r); if (e) return e;
        var d = r.data && r.data[0];
        // no row back means the database did not let this person touch that profile
        if (!d) return { ok: false, code: 'unknown' };
        var second = hasAgent
          ? sb.from('dj_private').upsert({ dj_id: id, agent_name: agent }, { onConflict: 'dj_id' }).select('agent_name')
          : sb.from('dj_private').select('agent_name').eq('dj_id', id).limit(1);
        return second.then(function (p) {
          var e2 = _.bad(p); if (e2) return e2;
          var priv = p.data && p.data[0];
          return { ok: true, dj: tidyDj(d, priv && priv.agent_name) };
        });
      }));
    },

    // Tour dates the DJ adds themselves (source 'dj'). o: city, from, to (YYYY-MM-DD; to may be left out for one night).
    addDate: function (djId, o) {
      o = o || {};
      var city = _.clip(o.city, 80), from = o.from, to = o.to || o.from;
      if (!djId || !city || !isDate(from) || !isDate(to) || to < from) return Promise.resolve(INVALID);
      return _.guard(sb.from('tour_dates').insert({ dj_id: djId, city: city, starts_on: from, ends_on: to, source: 'dj' })
        .select('id, city, starts_on, ends_on, source').then(function (r) {
          var e = _.bad(r); if (e) return e;
          return r.data && r.data[0] ? { ok: true, date: tidyDate(r.data[0]) } : { ok: false, code: 'unknown' };
        }));
    },
    updateDate: function (id, o) {
      o = o || {};
      var city = _.clip(o.city, 80), from = o.from, to = o.to || o.from;
      if (!id || !city || !isDate(from) || !isDate(to) || to < from) return Promise.resolve(INVALID);
      return _.guard(sb.from('tour_dates').update({ city: city, starts_on: from, ends_on: to }).eq('id', id)
        .select('id, city, starts_on, ends_on, source').then(function (r) {
          var e = _.bad(r); if (e) return e;
          return r.data && r.data[0] ? { ok: true, date: tidyDate(r.data[0]) } : { ok: false, code: 'unknown' };
        }));
    },
    removeDate: function (id) {
      if (!id) return Promise.resolve(INVALID);
      return _.guard(sb.from('tour_dates').delete().eq('id', id).then(function (r) { return _.bad(r) || { ok: true }; }));
    },

    // Set links ("Hear a set"): up to four, position 0 to 3, https only. Setting a taken position replaces it.
    setTrack: function (djId, position, o) {
      o = o || {};
      var pos = Number(position), title = _.clip(o.title, 120), url = _.clip(o.url, 500);
      if (!djId || !(pos === 0 || pos === 1 || pos === 2 || pos === 3) || !title || !/^https:\/\/\S+$/i.test(url)) return Promise.resolve(INVALID);
      return _.guard(sb.from('dj_tracks').upsert({ dj_id: djId, position: pos, title: title, url: url }, { onConflict: 'dj_id,position' })
        .select('position, title, url').then(function (r) {
          var e = _.bad(r); if (e) return e;
          return r.data && r.data[0] ? { ok: true, track: tidyTrack(r.data[0]) } : { ok: false, code: 'unknown' };
        }));
    },
    removeTrack: function (djId, position) {
      var pos = Number(position);
      if (!djId || !(pos >= 0 && pos <= 3)) return Promise.resolve(INVALID);
      return _.guard(sb.from('dj_tracks').delete().eq('dj_id', djId).eq('position', pos).then(function (r) { return _.bad(r) || { ok: true }; }));
    },

    signOut: function () { return B.auth.signOut(); }
  };
})();

// The roster page: every live DJ with their tour dates, in name order. BOOKD never ranks or recommends anyone.
(function () {
  var B = window.BOOKD; if (!B || !B.ready) return;
  var _ = B._, sb = _.sb;
  // A photo is a full address, a file that ships with the site, or a file in the dj-photos bucket.
  function photo(path) {
    if (!path) return '';
    if (/^(https:\/\/|assets\/)/.test(path)) return path;
    try { return sb.storage.from('dj-photos').getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
  }
  B.roster = {
    list: function () {
      return _.guard(sb.from('djs')
        .select('slug, name, sound, genres, home_city, cover_path, tour_dates(city, starts_on, ends_on)')
        .eq('status', 'live').order('name').then(function (r) {
          var bad = _.bad(r); if (bad) return bad;
          return { ok: true, djs: (r.data || []).map(function (d) {
            return { slug: d.slug, name: d.name, sound: d.sound || '', genres: d.genres || [], home: d.home_city || '',
              photo: photo(d.cover_path),
              dates: (d.tour_dates || []).map(function (t) { return { city: t.city, from: t.starts_on, to: t.ends_on }; }) };
          }) };
        }));
    }
  };
})();

// The waitlist page: add an email to the pre launch list. The public can only add; nobody but the admin reads it.
(function () {
  var B = window.BOOKD; if (!B || !B.ready) return;
  var _ = B._, sb = _.sb;
  B.waitlist = {
    // o: email, who ('host' or 'dj'). Joining twice is fine and looks the same as joining once.
    join: function (o) {
      return _.guard(sb.rpc('join_waitlist', { p_email: _.clip(o && o.email, 200), p_who: o && o.who === 'dj' ? 'dj' : 'host' }).then(function (r) {
        return _.bad(r) || { ok: true };
      }));
    }
  };
})();
