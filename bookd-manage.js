(function () {
var B = window.BOOKD;
if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
function session() {
return sb.auth.getSession().then(function (r) {
return r && r.data && r.data.session ? r.data.session.user : null;
});
}
var out = { ok: false, code: 'expired' };
B.account = {
load: function () {
return _.guard(session().then(function (u) {
if (!u) return { ok: true, user: null };
return sb.from('profiles').select('role, display_name, phone, notify_text, notify_email, photo, city').eq('id', u.id).maybeSingle().then(function (r) {
var b = _.bad(r);
if (b) return b;
var p = r.data || {}, meta = u.user_metadata || {};
return { ok: true, user: {
id: u.id, email: u.email || '', pendingEmail: u.new_email || '',
name: p.display_name || meta.name || '', phone: p.phone || '', role: p.role || 'host',
notifyText: p.notify_text !== false, notifyEmail: p.notify_email !== false, photo: p.photo || '', city: p.city || ''
} };
});
}));
},
save: function (o) {
return _.guard(session().then(function (u) {
if (!u) return out;
var row = { display_name: _.clip(o.name, 120), phone: _.clip(o.phone, 40) || null };
if (typeof o.city === 'string') row.city = _.clip(o.city, 80) || null;
return sb.from('profiles').update(row).eq('id', u.id).select('display_name, phone').maybeSingle().then(function (r) {
var b = _.bad(r);
if (b) return b;
if (!r.data) return { ok: false, code: 'unknown' };
var saved = { name: r.data.display_name || '', phone: r.data.phone || '' };
return _.describe(u).then(null, function () {}).then(function () {
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
setPhoto: function (photo) {
return _.guard(session().then(function (u) {
if (!u) return out;
var v = String(photo || '');
if (v && (v.length > 80000 || !/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+\/]+=*$/.test(v))) return { ok: false, code: 'invalid' };
return sb.from('profiles').update({ photo: v || null }).eq('id', u.id).select('photo').maybeSingle().then(function (r) {
var b = _.bad(r);
if (b) return b;
if (!r.data) return { ok: false, code: 'unknown' };
return { ok: true, photo: r.data.photo || '' };
});
}));
},
resendEmail: function (email) {
return _.guard(session().then(function (u) {
if (!u) return out;
var back = location.href.split('#')[0].split('?')[0];
return sb.auth.updateUser({ email: _.clip(email, 200).toLowerCase() }, { emailRedirectTo: back }).then(function (e) {
return e.error ? _.fail(e.error) : { ok: true };
});
}));
},
signOutEverywhere: function () {
try { localStorage.removeItem('bookd.who'); } catch (e) {}
B.who = null;
return _.guard(sb.auth.signOut({ scope: 'global' }).then(function (r) { return r.error ? _.fail(r.error) : { ok: true }; }));
},
remove: function (o) {
return _.guard(session().then(function (u) {
if (!u) return out;
return sb.rpc('delete_my_account', { p_reason: _.clip(o && o.reason, 40) || null, p_note: _.clip(o && o.note, 1000) || null }).then(function (r) {
if (r && r.error) {
if (/admin account/i.test(String(r.error.message || ''))) return { ok: false, code: 'admin' };
return _.bad(r);
}
try { localStorage.removeItem('bookd.who'); } catch (e) {}
B.who = null;
return sb.auth.signOut({ scope: 'local' }).then(function () { return { ok: true }; }, function () { return { ok: true }; });
});
}));
},
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
(function () {
var B = window.BOOKD;
if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
function photo(path) {
if (!path) return '';
if (/^(https:\/\/|assets\/)/.test(path)) return path;
try { return sb.storage.from('dj-photos').getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
}
function nul(v, n) { var s = _.clip(v, n); return s ? s : null; }
function badEmail(o) {
var ks = ['contact_email', 'agent_email'], i, v;
for (i = 0; i < ks.length; i++) { v = String(o && o[ks[i]] != null ? o[ks[i]] : '').trim(); if (v && !_.isEmail(v)) return ks[i]; }
return '';
}
function money(v) { var n = parseInt(v, 10); return isFinite(n) && n >= 0 ? n : null; }
function myId() {
return sb.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session.user.id : null; });
}
function slugOf(name) {
var s = String(name || '').toLowerCase();
try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
return s || 'dj';
}
function djRow(o) {
return {
name: _.clip(o.name, 120), home_city: _.clip(o.home_city, 120), sound: _.clip(o.sound, 200), bio: _.clip(o.bio, 2000),
soundcloud_url: nul(o.soundcloud_url, 500), mixcloud_url: nul(o.mixcloud_url, 500), youtube_url: nul(o.youtube_url, 500),
status: o.status === 'live' ? 'live' : 'draft'
};
}
function fees(o) {
var lo = money(o.fee_low), hi = money(o.fee_high);
if (lo != null && hi != null && lo > hi) { var t = lo; lo = hi; hi = t; }
return { fee_low: lo, fee_high: hi };
}
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
function saveDj(o) {
var row = djRow(o), id = o.id || null, slug = o.slug || null, wrong = badEmail(o);
function stop(x) { return { ok: false, code: x.code, id: id, slug: slug }; }
if (wrong) return Promise.resolve({ ok: false, code: 'invalid', field: wrong, id: id, slug: slug });
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
return sb.from('dj_private').upsert(Object.assign({
dj_id: id, contact_email: nul(o.contact_email, 200), agent_name: nul(o.agent_name, 120), agent_email: nul(o.agent_email, 200)
}, fees(o)), { onConflict: 'dj_id' }).then(function (r) {
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
function dropDraft(djId) {
return sb.from('djs').delete().eq('id', djId).eq('status', 'draft').is('owner_id', null).then(function (r) {
return _.bad(r) || { ok: true };
});
}
var ART = 'id, owner_id, slug, name, first_name, sound, genres, home_city, bio, cover_path, cover_alt, cover_pos, find_label, find_url, links, ' +
'rider_lines, rider_note, rider_link, plays_on, room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url, ' +
'look_bg, look_image, look_record, look_sign, status, updated_at';
var ART_WRITE = ['name', 'first_name', 'sound', 'genres', 'home_city', 'bio', 'cover_path', 'cover_alt', 'cover_pos', 'find_label', 'find_url',
'links', 'rider_lines', 'rider_note', 'rider_link', 'look_bg', 'look_image', 'look_record', 'look_sign', 'soundcloud_url', 'mixcloud_url',
'youtube_url', 'status'];
var PHOTOS = 'dj-photos';
function artRow(row) {
var out = {}, i, k;
for (i = 0; i < ART_WRITE.length; i++) { k = ART_WRITE[i]; if (row && k in row) out[k] = row[k]; }
if ('status' in out) out.status = out.status === 'live' ? 'live' : 'draft';
return out;
}
function insertArtist(row, base, n) {
var slug = n > 1 ? base + '-' + n : base;
return sb.from('djs').insert(Object.assign({ slug: slug }, row)).select('id, slug').single().then(function (r) {
if (r.error && r.error.code === '23505' && n < 9) return insertArtist(row, base, n + 1);
if (r.error && r.error.code === '23505') return { ok: false, code: 'taken' };
return _.bad(r) || { ok: true, id: r.data.id, slug: r.data.slug };
});
}
function setTracks(id, tracks) {
var rows = (tracks || []).slice(0, 4).map(function (t, i) { return { dj_id: id, position: i, title: _.clip(t.title, 120), url: _.clip(t.url, 500) }; });
return sb.from('dj_tracks').delete().eq('dj_id', id).gte('position', rows.length).then(function (r) {
var b = _.bad(r); if (b) return b;
if (!rows.length) return { ok: true };
return sb.from('dj_tracks').upsert(rows, { onConflict: 'dj_id,position' }).then(function (r2) { return _.bad(r2) || { ok: true }; });
});
}
function withExtras(rows, tracks, priv, dates) {
var t = {}, p = {}, w = {};
(tracks || []).forEach(function (x) { (t[x.dj_id] = t[x.dj_id] || []).push({ position: x.position, title: x.title, url: x.url }); });
(priv || []).forEach(function (x) { p[x.dj_id] = x; });
(dates || []).forEach(function (x) { (w[x.dj_id] = w[x.dj_id] || []).push({ city: x.city, starts_on: x.starts_on, ends_on: x.ends_on }); });
return rows.map(function (d) { return Object.assign({}, d, { tracks: t[d.id] || [], private: p[d.id] || null, dates: w[d.id] || [] }); });
}
function badFile(r) {
if (!r || !r.error) return null;
var e = r.error, s = Number(e.statusCode || e.status || 0), m = String(e.message || '').toLowerCase();
if (s === 413 || m.indexOf('exceeded the maximum') >= 0 || m.indexOf('too large') >= 0) return { ok: false, code: 'tooBig' };
if (s === 401 || s === 403 || m.indexOf('row-level security') >= 0 || m.indexOf('unauthorized') >= 0) return { ok: false, code: 'forbidden' };
if (s === 415 || m.indexOf('mime type') >= 0) return { ok: false, code: 'photo' };
return _.fail({ code: e.code, message: e.message, status: s, name: e.name });
}
B.admin = {
artists: function () {
return _.guard(Promise.all([
sb.from('djs').select(ART).order('name'),
sb.from('dj_tracks').select('dj_id, position, title, url').order('position'),
sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email'),
sb.from('tour_dates').select('dj_id, city, starts_on, ends_on').order('starts_on')
]).then(function (rs) {
for (var i = 0; i < rs.length; i++) { var b = _.bad(rs[i]); if (b) return b; }
return { ok: true, rows: withExtras(rs[0].data || [], rs[1].data, rs[2].data, rs[3].data) };
}));
},
artist: function (slug) {
return _.guard(sb.from('djs').select(ART).eq('slug', String(slug || '')).limit(1).then(function (r) {
var b = _.bad(r); if (b) return b;
var d = r.data && r.data[0];
if (!d) return { ok: true, row: null };
return Promise.all([
sb.from('dj_tracks').select('dj_id, position, title, url').eq('dj_id', d.id).order('position'),
sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email').eq('dj_id', d.id),
sb.from('tour_dates').select('dj_id, city, starts_on, ends_on').eq('dj_id', d.id).order('starts_on')
]).then(function (x) {
var b2 = _.bad(x[0]) || _.bad(x[1]) || _.bad(x[2]); if (b2) return b2;
return { ok: true, row: withExtras([d], x[0].data, x[1].data, x[2].data)[0] };
});
}));
},
saveArtist: function (o) {
o = o || {};
var row = artRow(o.row), id = o.id || null, slug = null, wrong = o.private ? badEmail(o.private) : '';
function stop(x) { return { ok: false, code: x.code, id: id, slug: slug }; }
if (wrong) return Promise.resolve({ ok: false, code: 'invalid', field: 'private.' + wrong, id: id, slug: slug });
var first = id
? sb.from('djs').update(row).eq('id', id).select('id, slug').then(function (r) {
if (r.error) return _.bad(r);
if (!r.data || !r.data.length) return { ok: false, code: 'forbidden' };
return { ok: true, id: r.data[0].id, slug: r.data[0].slug };
})
: insertArtist(row, slugOf(o.row && o.row.slug || row.name), 1);
return _.guard(first.then(function (a) {
if (!a.ok) return stop(a);
id = a.id; slug = a.slug;
return (o.tracks ? setTracks(id, o.tracks) : Promise.resolve({ ok: true })).then(function (t) {
if (!t.ok) return stop(t);
if (!o.private) return { ok: true, id: id, slug: slug };
return sb.from('dj_private').upsert({
dj_id: id, contact_email: nul(o.private.contact_email, 200), agent_name: nul(o.private.agent_name, 120), agent_email: nul(o.private.agent_email, 200)
}, { onConflict: 'dj_id' }).then(function (r) {
var b = _.bad(r); if (b) return stop(b);
return { ok: true, id: id, slug: slug };
});
});
}));
},
setStatus: function (id, status) {
return _.guard(sb.from('djs').update({ status: status === 'live' ? 'live' : 'draft' }).eq('id', id).select('id').then(function (r) {
if (r.error) return _.bad(r);
return r.data && r.data.length ? { ok: true } : { ok: false, code: 'forbidden' };
}));
},
removeArtist: function (id) {
return _.guard(sb.from('djs').delete().eq('id', id).select('id').then(function (r) {
if (r.error) return _.bad(r);
if (!r.data || !r.data.length) return { ok: false, code: 'forbidden' };
return B.admin.clearPhotos(id, []).then(function () { return { ok: true }; });
}));
},
uploadPhoto: function (djId, name, bytes, type) {
var ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
var path = String(djId) + '/' + String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64) + '.' + ext;
return _.guard(sb.storage.from(PHOTOS).upload(path, bytes, { contentType: type || 'image/jpeg', upsert: true, cacheControl: '31536000' }).then(function (r) {
return badFile(r) || { ok: true, path: path };
}));
},
clearPhotos: function (djId, keep) {
var tidy = { ok: true };
try {
return sb.storage.from(PHOTOS).list(String(djId), { limit: 100 }).then(function (r) {
if (!r || r.error || !r.data) return tidy;
var gone = r.data.map(function (f) { return String(djId) + '/' + f.name; }).filter(function (p) { return (keep || []).indexOf(p) < 0; });
if (!gone.length) return tidy;
return sb.storage.from(PHOTOS).remove(gone).then(function () { return tidy; }, function () { return tidy; });
}, function () { return tidy; });
} catch (e) { return Promise.resolve(tidy); }
},
load: function () {
return _.guard(Promise.all([
sb.from('djs').select('*').order('name'),
sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email, fee_low, fee_high'),
sb.from('tour_dates').select('id, dj_id, city, starts_on, ends_on, source').order('starts_on'),
sb.from('dj_applications').select('*').order('created_at', { ascending: false })
]).then(function (rs) {
for (var i = 0; i < rs.length; i++) { var b = _.bad(rs[i]); if (b) return b; }
var priv = {}, dates = {};
(rs[1].data || []).forEach(function (p) { priv[p.dj_id] = p; });
(rs[2].data || []).forEach(function (t) { (dates[t.dj_id] = dates[t.dj_id] || []).push(t); });
var djs = (rs[0].data || []).map(function (d) {
var p = priv[d.id] || null;
return Object.assign({}, d, { fee_low: p ? p.fee_low : null, fee_high: p ? p.fee_high : null, photo: photo(d.cover_path), private: p, dates: dates[d.id] || [] });
});
var apps = rs[3].data || [], ids = [];
apps.forEach(function (a) { if (a.reviewed_by && ids.indexOf(a.reviewed_by) < 0) ids.push(a.reviewed_by); });
var done = function (names) {
return { ok: true, djs: djs, applications: apps.map(function (a) { return Object.assign({}, a, { reviewer: (a.reviewed_by && names[a.reviewed_by]) || '' }); }) };
};
if (!ids.length) return done({});
return sb.from('profiles').select('id, display_name').in('id', ids).then(function (r) {
var names = {};
if (r && !r.error) (r.data || []).forEach(function (p) { names[p.id] = p.display_name || ''; });
return done(names);
}, function () { return done({}); });
}));
},
notes: function () {
return _.guard(sb.from('contact_messages').select('id, name, email, who, message, created_at').order('created_at', { ascending: false }).then(function (r) {
return _.bad(r) || { ok: true, notes: r.data || [] };
}));
},
saveDj: function (o) { return _.guard(saveDj(o || {})); },
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
pass: function (appId) { return _.guard(answer(appId, 'passed')); },
reopen: function (appId, djId) {
return _.guard((djId ? dropDraft(djId) : Promise.resolve({ ok: true })).then(function (d) {
if (!d.ok) return d;
return answer(appId, 'pending');
}));
}
};
})();
(function () {
var W = typeof window !== 'undefined' ? window : {};
var B = W.BOOKD, A = B && B.artists, I = A && A._;
if (!I || !I.merged || A.manage) return;
var LIVE = A.mode === 'database', MODE = A.mode, L = A.limits, FILE = A.file, KEY = I.KEY;
var str = I.str, tidy = I.tidy, plain = I.plain, byName = I.byName, canon = I.canon, print = I.print, fromRow = I.fromRow;
var fail = I.fail, isQuota = I.isQuota, safe = I.safe, oops = I.oops, run = I.run;
var HANDED = I.HANDED, box = I.box, photos = I.photos, photoGet = I.photoGet, urlOf = I.urlOf, merged = I.merged, shown = I.shown;
var showDb = I.showDb, datesOf = I.datesOf;
var PARTS = ['sets', 'about', 'needs', 'request'];
function slugOf(name) {
var s = str(name).toLowerCase();
try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
s = s.replace(/[\u00f8\u0153]/g, 'o').replace(/\u00e6/g, 'ae').replace(/\u00df/g, 'ss').replace(/[\u0111\u00f0]/g, 'd').replace(/\u0142/g, 'l');
s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, L.slug - 2).replace(/-+$/, '');
return s || 'dj';
}
function clash(a, b) {
if (a === b) return true;
for (var i = 0; i < PARTS.length; i++) if (a === b + '-' + PARTS[i] || b === a + '-' + PARTS[i]) return true;
return false;
}
function freeSlug(base, taken) {
for (var n = 1; n <= 9; n++) {
var s = n > 1 ? base + '-' + n : base, hit = false;
for (var i = 0; i < taken.length; i++) if (clash(s, taken[i])) { hit = true; break; }
if (!hit && PARTS.indexOf(s) < 0) return s;
}
return null;
}
function hostIs(url, name) {
try { var h = new URL(url).hostname.toLowerCase(); return h === name || h.slice(-name.length - 1) === '.' + name; } catch (e) { return false; }
}
var KMD5 = [], SMD5 = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
for (var kk = 0; kk < 64; kk++) KMD5[kk] = (Math.abs(Math.sin(kk + 1)) * 4294967296) | 0;
function md5(bytes) {
var n = bytes.length, w = new Int32Array((((n + 8) >>> 6) + 1) << 4), i, j, f, g, t, x, s;
for (i = 0; i < n; i++) w[i >> 2] |= bytes[i] << ((i % 4) << 3);
w[n >> 2] |= 0x80 << ((n % 4) << 3);
w[w.length - 2] = (n << 3) | 0;
w[w.length - 1] = (n / 536870912) | 0;
var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
for (i = 0; i < w.length; i += 16) {
var oa = a, ob = b, oc = c, od = d;
for (j = 0; j < 64; j++) {
if (j < 16) { f = (b & c) | (~b & d); g = j; }
else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
else { f = c ^ (b | ~d); g = (7 * j) % 16; }
t = d; d = c; c = b;
x = (a + f + KMD5[j] + w[i + g]) | 0;
s = SMD5[(j >> 4) * 4 + (j % 4)];
b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
a = t;
}
a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
}
var hex = '', v = [a, b, c, d];
for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) hex += ('0' + ((v[i] >>> (j * 8)) & 255).toString(16)).slice(-2);
return hex;
}
function toRow(a) {
function first(name) { for (var i = 0; i < a.links.length; i++) if (hostIs(a.links[i].url, name)) return a.links[i].url; return null; }
return {
row: {
slug: a.slug, name: a.name, first_name: a.first, sound: a.tag, genres: a.genres, home_city: a.home, bio: a.bio.join('\n\n'),
cover_path: a.img || null, cover_alt: a.alt, cover_pos: a.pos,
find_label: a.find ? a.find.label : '', find_url: a.find ? a.find.url : null,
links: a.links, rider_lines: a.rider, rider_note: a.riderNote, rider_link: a.riderLink || null,
look_bg: a.look.bg, look_image: a.look.image || null, look_record: a.look.record || null, look_sign: a.look.sign,
soundcloud_url: first('soundcloud.com'), mixcloud_url: first('mixcloud.com'), youtube_url: first('youtube.com'),
status: a.status
},
tracks: a.sets.map(function (s, i) { return { position: i, title: s.title, url: s.url }; })
};
}
function now() { return new Date().toISOString(); }
var PENDING = {};
function writeStore(artists) {
var st = box(), n = 0, k;
if (!st) return fail('blocked');
for (k in artists) n++;
try {
if (!n) { st.removeItem(KEY); return st.getItem(KEY) == null ? { ok: true } : fail('blocked'); }
var s = JSON.stringify({ v: 1, saved: now(), artists: artists });
st.setItem(KEY, s);
return st.getItem(KEY) === s ? { ok: true } : fail('blocked');
} catch (e) { return fail(isQuota(e) ? 'full' : 'blocked'); }
}
function photoKeys() { return photos('readonly', function (s) { return s.getAllKeys(); }); }
function photoDel(ids) { return ids.length ? photos('readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); return null; }) : Promise.resolve(); }
function photoPut(p) {
return photos('readwrite', function (s) { s.put({ id: p.id, bytes: p.bytes, type: p.type, width: p.width, height: p.height, size: p.bytes.byteLength, at: now() }); return null; })
.then(function () { return photoGet(p.id); })
.then(function (r) { if (!r || !r.bytes || r.bytes.byteLength !== p.bytes.byteLength) throw oops('blocked'); return r; });
}
function withMeta(item, s) {
var a = s.artist, t = tidy(a);
a.dates = [];
a.meta = { origin: item.origin, changed: item.changed, siteChanged: !!item.siteChanged, id: null, updated: item.at || '',
canRemove: item.origin === 'device', canReset: item.origin === 'builtin' && !!item.changed,
missing: t.missing, notes: t.notes, lostPhotos: s.lost };
return a;
}
function persisted() {
try {
var n = W.navigator && W.navigator.storage;
if (n && n.persisted) return n.persisted().then(function (v) { return !!v; }, function () { return null; });
} catch (e) {}
return Promise.resolve(null);
}
function deviceLoad(fixed) {
var m = merged(fixed);
return Promise.all([Promise.all(m.items.map(function (i) { return shown(i).then(function (s) { return withMeta(i, s); }); })), persisted()]).then(function (r) {
return { ok: true, mode: MODE, canWrite: m.ok, storage: m.ok ? { ok: true, persisted: r[1] } : { ok: false, code: m.code, persisted: r[1] },
pending: m.items.filter(function (i) { return !!i.changed; }).length, artists: r[0] };
});
}
function sweep(recs) {
var keep = {}, k, a;
for (k in recs) { a = recs[k].a || {}; [a.img, a.look && a.look.image, a.look && a.look.record].forEach(function (v) { var m = /^device:([0-9a-f]{32})$/.exec(v || ''); if (m) keep[m[1]] = 1; }); }
return photoKeys().then(function (ids) { return photoDel((ids || []).filter(function (id) { return !keep[id]; })); }).then(null, function () {});
}
function keepDevice(v, field) {
if (!v) return Promise.resolve('');
if (PENDING[v]) {
var p = PENDING[v];
return photoPut(p).then(function (rec) { urlOf(p.id, rec); HANDED[v] = 'device:' + p.id; return 'device:' + p.id; });
}
if (HANDED[v]) return Promise.resolve(HANDED[v]);
if (/^device:[0-9a-f]{32}$/.test(v) || /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) || /^\/_blob\/[0-9a-f]{32}$/.test(v)) return Promise.resolve(v);
var e = oops('invalid'); e.field = field; return Promise.reject(e);
}
function askToKeep() {
try { var n = W.navigator && W.navigator.storage; if (n && n.persist) n.persist().then(null, function () {}); } catch (e) {}
}
function deviceSave(input, fixed) {
var t = tidy(input, { strict: true });
if (!t.ok) return Promise.resolve(fail('invalid', { field: t.field, problems: t.problems, missing: t.missing, notes: t.notes }));
var m = merged(fixed), a = t.artist, item = null, i;
if (!m.ok) return Promise.resolve(fail(m.code));
if (a.slug) {
for (i = 0; i < m.items.length; i++) if (m.items[i].a.slug === a.slug) item = m.items[i];
if (!item) return Promise.resolve(fail('missing'));
} else {
a.slug = freeSlug(slugOf(a.name), m.items.map(function (x) { return x.a.slug; }));
if (!a.slug) return Promise.resolve(fail('taken'));
}
return Promise.all([keepDevice(a.img, 'img'), keepDevice(a.look.image, 'look.image'), keepDevice(a.look.record, 'look.record')]).then(function (refs) {
a.img = refs[0]; a.look.image = refs[1]; a.look.record = refs[2];
var recs = m.recs, old = recs[a.slug], f = item ? item.fixed : null, k;
for (k = 0; k < m.stale.length; k++) delete recs[m.stale[k]];
if (f && canon(a) === canon(f)) delete recs[a.slug];
else recs[a.slug] = { a: a, origin: f ? 'builtin' : 'device', base: f ? (old && old.base) || print(f) : null, at: now() };
var w = writeStore(recs);
if (!w.ok) return w;
askToKeep();
return sweep(recs).then(function () { return deviceOne(a.slug, fixed); });
}, function (e) { return fail(e && e.bookd ? e.bookd : 'unknown', e && e.field ? { field: e.field, problems: [{ field: e.field, why: 'format' }] } : null); });
}
function deviceOne(slug, fixed) {
var m = merged(fixed);
for (var i = 0; i < m.items.length; i++) if (m.items[i].a.slug === slug) {
return (function (it) { return shown(it).then(function (s) { return { ok: true, mode: MODE, artist: withMeta(it, s) }; }); })(m.items[i]);
}
return Promise.resolve(fail('missing'));
}
function deviceDrop(slug, fixed, want) {
var m = merged(fixed), item = null, i;
if (!m.ok) return Promise.resolve(fail(m.code));
for (i = 0; i < m.items.length; i++) if (m.items[i].a.slug === slug) item = m.items[i];
if (!item) return Promise.resolve(fail('missing'));
if (want === 'remove' && item.origin !== 'device') return Promise.resolve(fail('builtin'));
if (want === 'reset' && item.origin !== 'builtin') return Promise.resolve(fail('noOriginal'));
for (i = 0; i < m.stale.length; i++) delete m.recs[m.stale[i]];
delete m.recs[slug];
var w = writeStore(m.recs);
if (!w.ok) return Promise.resolve(w);
return sweep(m.recs).then(function () { return want === 'reset' ? deviceOne(slug, fixed) : { ok: true, mode: MODE }; });
}
function b64(bytes) {
var u = new Uint8Array(bytes), s = '', i;
for (i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
return W.btoa(s);
}
function pack(mode, entries, pics, lost) {
var out = { format: 'bookd-roster', version: 1, mode: mode, exported: now(), artists: entries, photos: pics };
var blob = new W.Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), n = 0, k;
for (k in pics) n++;
return { ok: true, mode: MODE, filename: FILE, blob: blob, count: entries.length, photos: n, bytes: blob.size, lost: lost };
}
function deviceExport(fixed) {
var m = merged(fixed), pics = {}, lost = [];
var todo = m.items.filter(function (i) { return !!i.changed; });
function pic(v, slug, field) {
var x = /^device:([0-9a-f]{32})$/.exec(v || '');
if (!x) return Promise.resolve(v || '');
return photoGet(x[1]).then(function (rec) {
if (!rec || !rec.bytes) { lost.push({ slug: slug, field: field }); return ''; }
pics[x[1]] = { type: rec.type || 'image/jpeg', width: rec.width || 0, height: rec.height || 0, bytes: rec.bytes.byteLength, data: b64(rec.bytes) };
return 'photo:' + x[1];
}, function () { lost.push({ slug: slug, field: field }); return ''; });
}
return Promise.all(todo.map(function (it) {
var a = plain(it.a);
return Promise.all([pic(a.img, a.slug, 'img'), pic(a.look.image, a.slug, 'look.image'), pic(a.look.record, a.slug, 'look.record')]).then(function (r) {
a.img = r[0]; a.look.image = r[1]; a.look.record = r[2];
a.origin = it.origin; a.change = it.changed;
return a;
});
})).then(function (entries) { return pack('device', entries, pics, lost); });
}
function shrink(img, max) {
var doc = W.document, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
if (!w || !h) throw oops('photo');
var k = Math.min(1, max / Math.max(w, h)), tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
var src = img, sw = w, sh = h, cv, cx;
while (sw / 2 >= tw * 1.5) {
var nw = Math.round(sw / 2), nh = Math.round(sh / 2);
cv = doc.createElement('canvas'); cv.width = nw; cv.height = nh;
cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, nw, nh); cx.drawImage(src, 0, 0, nw, nh);
src = cv; sw = nw; sh = nh;
}
cv = doc.createElement('canvas'); cv.width = tw; cv.height = th;
cx = cv.getContext('2d');
if (!cx) throw oops('photo');
cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, tw, th);
try { cx.imageSmoothingQuality = 'high'; } catch (e) {}
cx.drawImage(src, 0, 0, tw, th);
return cv;
}
function bytesOf(blob) {
if (blob.arrayBuffer) return blob.arrayBuffer();
return new Promise(function (resolve, reject) { var r = new W.FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(oops('photo')); }; r.readAsArrayBuffer(blob); });
}
function photo(file, opt) {
var max = opt && opt.max > 0 ? Math.min(Math.round(opt.max), 2400) : 1600;
return safe(new Promise(function (resolve, reject) {
if (!file || !W.document || !W.URL || !W.Image) return reject(oops('photo'));
if (file.size > 40 * 1024 * 1024) return reject(oops('tooBig'));
var src, img = new W.Image();
try { src = W.URL.createObjectURL(file); } catch (e) { return reject(oops('photo')); }
function done() { try { W.URL.revokeObjectURL(src); } catch (e) {} }
img.onerror = function () { done(); reject(oops('photo')); };
img.onload = function () {
var cv;
try { cv = shrink(img, max); } catch (e) { done(); return reject(oops('photo')); }
done();
try {
cv.toBlob(function (blob) {
if (!blob || blob.type !== 'image/jpeg') return reject(oops('photo'));
bytesOf(blob).then(function (buf) {
var id = md5(new Uint8Array(buf)), url = W.URL.createObjectURL(blob);
PENDING[url] = { id: id, bytes: buf, type: 'image/jpeg', width: cv.width, height: cv.height };
resolve({ ok: true, url: url, width: cv.width, height: cv.height, bytes: buf.byteLength });
}, reject);
}, 'image/jpeg', 0.82);
} catch (e) { reject(oops('photo')); }
};
img.src = src;
}));
}
var IDS = {};
function whoAmI() {
return B.auth.current().then(function (r) {
if (!r || !r.ok) return r || fail('unknown');
if (!r.user) return fail('signedOut');
return r.user.role === 'admin' ? { ok: true } : fail('forbidden');
});
}
function dbMeta(row, a) {
var t = tidy(a), p = row.private || null;
IDS[row.slug] = row.id;
a.dates = datesOf(row);
a.meta = { origin: 'database', changed: '', siteChanged: false, id: row.id, updated: row.updated_at || '', canRemove: true, canReset: false,
missing: t.missing, notes: t.notes, lostPhotos: [],
claimed: !!row.owner_id,
private: { contact_email: (p && p.contact_email) || '', agent_name: (p && p.agent_name) || '', agent_email: (p && p.agent_email) || '' } };
return a;
}
function dbLoad() {
return whoAmI().then(function (w) {
if (!w.ok) return w;
if (!B.admin || !B.admin.artists) return fail('unsupported');
return B.admin.artists().then(function (r) {
if (!r.ok) return r;
var list = [];
r.rows.forEach(function (row) { var a = fromRow(row, showDb); if (a) list.push(dbMeta(row, a)); });
return { ok: true, mode: MODE, canWrite: true, storage: { ok: true, persisted: true }, pending: 0, artists: list.sort(byName) };
});
});
}
function idOf(slug) {
if (IDS[slug]) return Promise.resolve({ ok: true, id: IDS[slug] });
return B.admin.artist(slug).then(function (r) {
if (!r.ok) return r;
if (!r.row) return fail('missing');
IDS[slug] = r.row.id;
return { ok: true, id: r.row.id };
});
}
function dbOne(slug) {
return B.admin.artist(slug).then(function (r) {
if (!r.ok) return r;
var a = r.row ? fromRow(r.row, showDb) : null;
if (!a) return fail('missing');
return { ok: true, mode: MODE, artist: dbMeta(r.row, a) };
});
}
function sortDb(v) {
if (!v) return { path: '' };
if (PENDING[v]) return { pending: PENDING[v], url: v };
if (HANDED[v] && !/^device:/.test(HANDED[v])) return { path: HANDED[v] };
if (/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)) return { path: v };
return { bad: true };
}
function privateProblems(p) {
var out = [];
if (!p) return out;
['contact_email', 'agent_email'].forEach(function (k) {
var v = str(p[k]).replace(/^\s+|\s+$/g, '');
if (v && !B._.isEmail(v)) out.push({ field: 'private.' + k, why: v.length > 200 ? 'long' : 'format' });
});
return out;
}
function dbSave(input) {
var t = tidy(input, { strict: true });
var priv = input && input.meta && input.meta.private ? input.meta.private : undefined, bad = (t.problems || []).concat(privateProblems(priv));
if (bad.length) return Promise.resolve(fail('invalid', { field: bad[0].field, problems: bad, missing: t.missing, notes: t.notes }));
var a = t.artist, isNew = !a.slug;
var pics = [sortDb(a.img), sortDb(a.look.image), sortDb(a.look.record)], names = ['img', 'look.image', 'look.record'], i;
for (i = 0; i < 3; i++) if (pics[i].bad) return Promise.resolve(fail('invalid', { field: names[i], problems: [{ field: names[i], why: 'format' }] }));
var waiting = pics.filter(function (p) { return !!p.pending; }).length;
function put(status) {
var c = plain(a), known = [], k;
c.img = pics[0].path || ''; c.look.image = pics[1].path || ''; c.look.record = pics[2].path || '';
if (status) c.status = status;
for (k in IDS) known.push(k);
if (!c.slug) c.slug = freeSlug(slugOf(c.name), known) || slugOf(c.name);
var r = toRow(c);
return B.admin.saveArtist({ id: IDS[a.slug] || null, isNew: isNew && !IDS[a.slug], row: r.row, tracks: r.tracks, private: priv });
}
function upload(id) {
return pics.reduce(function (chain, p) {
return chain.then(function (ok) {
if (!ok.ok || !p.pending) return ok;
return B.admin.uploadPhoto(id, p.pending.id, p.pending.bytes, p.pending.type).then(function (u) {
if (!u.ok) return u;
p.path = u.path; HANDED[p.url] = u.path;
return ok;
});
});
}, Promise.resolve({ ok: true }));
}
var start = isNew ? Promise.resolve({ ok: true }) : idOf(a.slug);
return start.then(function (s) {
if (!s.ok) return s;
var first = waiting && isNew ? put('draft') : (waiting ? Promise.resolve({ ok: true, id: s.id, slug: a.slug }) : put());
return first.then(function (r) {
if (!r.ok) return r;
a.slug = r.slug; IDS[r.slug] = r.id; isNew = false;
if (!waiting) return r;
return upload(r.id).then(function (u) {
if (!u.ok) return fail(u.code, { part: 'photo', slug: r.slug });
return put().then(function (r2) {
if (!r2.ok) return fail(r2.code, { part: 'photo', slug: r.slug });
B.admin.clearPhotos(r.id, pics.map(function (p) { return p.path; }).filter(Boolean));
return r2;
});
});
}).then(function (r) { return r.ok ? dbOne(r.slug) : r; });
});
}
function dbExport() {
return dbLoad().then(function (r) {
if (!r.ok) return r;
var pics = {}, lost = [];
function pic(url, slug, field) {
var path = HANDED[url];
if (!url || !path || /^assets\//.test(url)) return Promise.resolve(url || '');
var type = 'image/jpeg';
return W.fetch(url).then(function (x) {
if (!x.ok) throw 0;
var ct = str(x.headers && x.headers.get('content-type')).split(';')[0];
if (/^image\/(jpeg|png|webp)$/.test(ct)) type = ct;
return x.arrayBuffer();
}).then(function (buf) {
var id = md5(new Uint8Array(buf));
pics[id] = { type: type, width: 0, height: 0, bytes: buf.byteLength, data: b64(buf) };
return 'photo:' + id;
}).then(null, function () { lost.push({ slug: slug, field: field }); return ''; });
}
return Promise.all(r.artists.map(function (full) {
var a = plain(full);
return Promise.all([pic(a.img, a.slug, 'img'), pic(a.look.image, a.slug, 'look.image'), pic(a.look.record, a.slug, 'look.record')]).then(function (u) {
a.img = u[0]; a.look.image = u[1]; a.look.record = u[2];
a.origin = 'database'; a.change = 'saved';
return a;
});
})).then(function (entries) { return pack('database', entries, pics, lost); });
});
}
A.manage = {
mode: MODE,
load: function (fixed) { return run(function () { return LIVE ? dbLoad() : deviceLoad(fixed); }); },
save: function (artist, fixed) { return run(function () { return LIVE ? whoAmI().then(function (w) { return w.ok ? dbSave(artist) : w; }) : deviceSave(artist, fixed); }); },
setStatus: function (slug, status, fixed) {
status = status === 'live' ? 'live' : 'draft';
slug = str(slug).toLowerCase();
return run(function () {
return (LIVE ? whoAmI().then(function (w) { return w.ok ? dbOne(slug) : w; }) : deviceOne(slug, fixed)).then(function (r) {
if (!r.ok) return r;
var a = r.artist; a.status = status;
if (!LIVE) return deviceSave(a, fixed);
var t = tidy(a, { strict: true });
if (!t.ok) return fail('invalid', { field: t.field, problems: t.problems, missing: t.missing, notes: t.notes });
return B.admin.setStatus(a.meta.id, status).then(function (s) { return s.ok ? dbOne(slug) : s; });
});
});
},
remove: function (slug, fixed) {
slug = str(slug).toLowerCase();
if (!LIVE) return run(function () { return deviceDrop(slug, fixed, 'remove'); });
return run(function () {
return whoAmI().then(function (w) { return w.ok ? idOf(slug) : w; }).then(function (r) {
if (!r.ok) return r;
return B.admin.removeArtist(r.id).then(function (d) { if (d.ok) { delete IDS[slug]; d.mode = MODE; } return d; });
});
});
},
reset: function (slug, fixed) { return LIVE ? Promise.resolve(fail('unsupported')) : run(function () { return deviceDrop(str(slug).toLowerCase(), fixed, 'reset'); }); },
photo: photo,
exportFile: function (fixed) { return run(function () { return LIVE ? dbExport() : deviceExport(fixed); }); },
download: function (fixed) {
return A.manage.exportFile(fixed).then(function (r) {
if (!r.ok) return r;
try {
var url = W.URL.createObjectURL(r.blob), el = W.document.createElement('a');
el.href = url; el.download = r.filename; el.style.display = 'none';
W.document.body.appendChild(el); el.click(); W.document.body.removeChild(el);
setTimeout(function () { try { W.URL.revokeObjectURL(url); } catch (e) {} }, 60000);
} catch (e) { return fail('blocked'); }
return r;
});
}
};
I.slugOf = slugOf; I.freeSlug = freeSlug; I.md5 = md5; I.toRow = toRow;
})();
(function () {
var B = window.BOOKD;
if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
var COLS = 'id, slug, name, sound, genres, home_city, agency, bio, cover_path, set_length, plays_on, ' +
'room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url, status';
var TEXT = { name: 120, sound: 120, home_city: 120, bio: 2000, set_length: 200, plays_on: 400, room_needs: 400,
table_needs: 400, arrival: 400, hospitality: 400, soundcloud_url: 300, mixcloud_url: 300, youtube_url: 300 };
var EMPTY_OK = { name: false, sound: true, home_city: true, bio: true };
function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function money(v) {
if (v == null || v === '') return null;
var n = Math.round(Number(v));
return isFinite(n) && n >= 0 && n <= 100000000 ? n : NaN;
}
function cover(path) {
if (!path) return '';
if (/^(https:\/\/|\/|assets\/)/.test(path)) return path;
try { return sb.storage.from('dj-photos').getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
}
function tidyDj(d, priv) {
var agent = priv && priv.agent_name;
return {
id: d.id, slug: d.slug, name: d.name || '', sound: d.sound || '', genres: d.genres || [], home_city: d.home_city || '',
agency: d.agency || '', bio: d.bio || '', cover: cover(d.cover_path),
fee_low: priv && priv.fee_low != null ? priv.fee_low : null, fee_high: priv && priv.fee_high != null ? priv.fee_high : null,
set_length: d.set_length || '', plays_on: d.plays_on || '', room_needs: d.room_needs || '', table_needs: d.table_needs || '',
arrival: d.arrival || '', hospitality: d.hospitality || '', soundcloud_url: d.soundcloud_url || '',
mixcloud_url: d.mixcloud_url || '', youtube_url: d.youtube_url || '', status: d.status || 'draft', agent_name: agent || ''
};
}
function tidyDate(t) { return { id: t.id, city: t.city, from: t.starts_on, to: t.ends_on, source: t.source }; }
function tidyTrack(t) { return { position: t.position, title: t.title, url: t.url }; }
var INVALID = { ok: false, code: 'invalid' };
B.dj = {
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
sb.from('dj_private').select('agent_name, fee_low, fee_high').eq('dj_id', d.id).limit(1)
]).then(function (x) {
var e2 = _.bad(x[0]) || _.bad(x[1]) || _.bad(x[2]); if (e2) return e2;
var priv = x[2].data && x[2].data[0];
return { ok: true, user: user, dj: tidyDj(d, priv),
tracks: (x[0].data || []).map(tidyTrack), dates: (x[1].data || []).map(tidyDate) };
});
}));
});
},
save: function (id, o) {
o = o || {};
var patch = {}, mine = {}, k, v, n = 0, m = 0;
for (k in TEXT) if (k in o) {
v = _.clip(o[k], TEXT[k]);
if (k === 'name' && !v) return Promise.resolve(INVALID);
patch[k] = v || (k in EMPTY_OK ? '' : null); n++;
}
if ('genres' in o) {
if (!Array.isArray(o.genres)) return Promise.resolve(INVALID);
patch.genres = o.genres.map(function (g) { return _.clip(g, 40); }).filter(Boolean).slice(0, 12); n++;
}
if ('fee_low' in o) { mine.fee_low = money(o.fee_low); m++; }
if ('fee_high' in o) { mine.fee_high = money(o.fee_high); m++; }
if (mine.fee_low !== mine.fee_low || mine.fee_high !== mine.fee_high) return Promise.resolve(INVALID);
if (mine.fee_low != null && mine.fee_high != null && mine.fee_low > mine.fee_high) return Promise.resolve(INVALID);
if ('status' in o) { if (o.status !== 'draft' && o.status !== 'live') return Promise.resolve(INVALID); patch.status = o.status; n++; }
if ('agent_name' in o) { mine.agent_name = _.clip(o.agent_name, 120) || null; m++; }
if (!id || (!n && !m)) return Promise.resolve(INVALID);
var first = n ? sb.from('djs').update(patch).eq('id', id).select(COLS) : sb.from('djs').select(COLS).eq('id', id).limit(1);
return _.guard(first.then(function (r) {
var e = _.bad(r); if (e) return e;
var d = r.data && r.data[0];
if (!d) return { ok: false, code: 'unknown' };
var second = m
? sb.from('dj_private').upsert(Object.assign({ dj_id: id }, mine), { onConflict: 'dj_id' }).select('agent_name, fee_low, fee_high')
: sb.from('dj_private').select('agent_name, fee_low, fee_high').eq('dj_id', id).limit(1);
return second.then(function (p) {
var e2 = _.bad(p); if (e2) return e2;
var priv = p.data && p.data[0];
return { ok: true, dj: tidyDj(d, priv) };
});
}));
},
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