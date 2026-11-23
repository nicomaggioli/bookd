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
var back = location.href.split('#')[0].split('?')[0].replace(/\/([A-Za-z0-9-]+)$/, '/$1.html');
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
var back = location.href.split('#')[0].split('?')[0].replace(/\/([A-Za-z0-9-]+)$/, '/$1.html');
return sb.auth.updateUser({ email: _.clip(email, 200).toLowerCase() }, { emailRedirectTo: back }).then(function (e) {
return e.error ? _.fail(e.error) : { ok: true };
});
}));
},
signOutEverywhere: function () {
_.forget();
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
_.forget();
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
try { return sb.storage.from(_.BUCKET).getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
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
function slugOf(name) { return B.artists._.slugOf(name); }
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
return sb.from('djs').delete().eq('id', djId).eq('status', 'draft').is('owner_id', null).select('id').then(function (r) {
var b = _.bad(r); if (b) return b;
return r.data && r.data.length ? { ok: true } : { ok: false, code: 'kept' };
});
}
var ART = 'id, owner_id, slug, name, first_name, sound, genres, home_city, bio, cover_path, cover_alt, cover_pos, find_label, find_url, links, ' +
'rider_lines, rider_note, rider_link, plays_on, room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url, ' +
'look_bg, look_image, look_record, look_sign, status, updated_at';
var ART_WRITE = ['name', 'first_name', 'sound', 'genres', 'home_city', 'bio', 'cover_path', 'cover_alt', 'cover_pos', 'find_label', 'find_url',
'links', 'rider_lines', 'rider_note', 'rider_link', 'plays_on', 'room_needs', 'table_needs', 'arrival', 'hospitality', 'look_bg', 'look_image', 'look_record', 'look_sign', 'soundcloud_url', 'mixcloud_url',
'youtube_url', 'status'];
var PHOTOS = _.BUCKET;
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
sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email, claim_code'),
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
sb.from('dj_private').select('dj_id, contact_email, agent_name, agent_email, claim_code').eq('dj_id', d.id),
sb.from('tour_dates').select('dj_id, city, starts_on, ends_on').eq('dj_id', d.id).order('starts_on')
]).then(function (x) {
var b2 = _.bad(x[0]) || _.bad(x[1]) || _.bad(x[2]); if (b2) return b2;
return { ok: true, row: withExtras([d], x[0].data, x[1].data, x[2].data)[0] };
});
}));
},
mine: function (userId) {
return _.guard(sb.from('djs').select(ART).eq('owner_id', String(userId || '')).order('created_at').limit(1).then(function (r) {
var b = _.bad(r); if (b) return b;
var d = r.data && r.data[0];
if (!d) return { ok: true, row: null };
return Promise.all([
sb.from('dj_tracks').select('dj_id, position, title, url').eq('dj_id', d.id).order('position'),
sb.from('tour_dates').select('dj_id, city, starts_on, ends_on').eq('dj_id', d.id).order('starts_on')
]).then(function (x) {
var b2 = _.bad(x[0]) || _.bad(x[1]); if (b2) return b2;
return { ok: true, row: withExtras([d], x[0].data, [], x[1].data)[0] };
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
tourDates: function (djId) { return _.guard(datesOf(djId)); },
addDate: function (djId, d) {
var row = { dj_id: djId, city: _.clip(d && d.city, 120), starts_on: d && d.starts_on, ends_on: (d && d.ends_on) || (d && d.starts_on), source: 'admin' };
return _.guard(sb.from('tour_dates').insert(row).then(function (r) { return _.bad(r) || datesOf(djId); }));
},
removeDate: function (djId, dateId) {
return _.guard(sb.from('tour_dates').delete().eq('dj_id', djId).eq('id', dateId).then(function (r) { return _.bad(r) || datesOf(djId); }));
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
plays_on: null, room_needs: null, table_needs: null, arrival: null, hospitality: null,
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
private: { contact_email: (p && p.contact_email) || '', agent_name: (p && p.agent_name) || '', agent_email: (p && p.agent_email) || '', claim_code: (p && p.claim_code) || '' } };
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
function dbSave(input, again) {
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
return B.admin.saveArtist({ id: IDS[a.slug] || null, row: r.row, tracks: r.tracks, private: priv });
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
}).then(function (r) { return r.ok ? (again ? again() : dbOne(r.slug)) : r; });
});
}
function mineRow() {
return B.auth.current().then(function (r) {
if (!r || !r.ok) return r || fail('unknown');
if (!r.user) return fail('signedOut');
if (r.user.role !== 'dj') return fail('forbidden');
if (!B.admin || !B.admin.mine) return fail('unsupported');
return B.admin.mine(r.user.id);
});
}
function mineOne() {
return mineRow().then(function (r) {
if (!r.ok) return r;
var a = r.row ? fromRow(r.row, showDb) : null;
if (!a) return { ok: true, mode: MODE, artist: null };
a = dbMeta(r.row, a);
a.meta.canRemove = false; delete a.meta.private;
return { ok: true, mode: MODE, artist: a };
});
}
function mineSave(input) {
return mineRow().then(function (m) {
if (!m.ok) return m;
if (!m.row) return fail('missing');
var a = {}, k;
for (k in (input || {})) if (k !== 'meta') a[k] = input[k];
a.slug = m.row.slug; a.status = m.row.status === 'live' ? 'live' : 'draft';
IDS[m.row.slug] = m.row.id;
return dbSave(a, mineOne);
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
var t = status === 'live' ? tidy(a, { strict: true }) : { ok: true };
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
mine: function () { return run(function () { return LIVE ? mineOne() : fail('unsupported'); }); },
saveMine: function (artist) { return run(function () { return LIVE ? mineSave(artist) : fail('unsupported'); }); },
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
try { return sb.storage.from(_.BUCKET).getPublicUrl(path).data.publicUrl || ''; } catch (e) { return ''; }
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
if ('agent_name' in o) { mine.agent_name = _.clip(o.agent_name, 120) || null; m++; }
if (!id || (!n && !m)) return Promise.resolve(INVALID);
var first = n ? sb.from('djs').update(patch).eq('id', id).select(COLS) : sb.from('djs').select(COLS).eq('id', id).limit(1);
return _.guard(first.then(function (r) {
var e = _.bad(r); if (e) return e;
var d = r.data && r.data[0];
if (!d) return { ok: false, code: 'unknown' };
var second = m
? sb.from('dj_private').update(mine).eq('dj_id', id).select('agent_name, fee_low, fee_high')
: sb.from('dj_private').select('agent_name, fee_low, fee_high').eq('dj_id', id).limit(1);
return second.then(function (p) {
var e2 = _.bad(p); if (e2) return e2;
var priv = p.data && p.data[0];
if (m && !priv) return { ok: false, code: 'unknown' };
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
(function () {
var W = typeof window !== 'undefined' ? window : {};
var B = W.BOOKD;
if (!B || !B.ready || !B.dj || !B.artists || !B.artists.manage || !B.artists.manage.mine) return;
var A = B.artists, M = A.manage, L = A.limits, tidy = A._.tidy;
var NB = String.fromCharCode(160);
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var PARTS = {
basics: { title: 'More details.', side: 'right', fields: ['first', 'genres'] },
photo: { title: 'Your photo.', side: 'left', fields: ['img', 'alt', 'pos'] },
about: { title: 'Your links.', side: 'right', fields: ['links'] },
sets: { title: 'Your sets.', side: 'right', fields: ['sets', 'find'] },
rider: { title: 'Your full rider.', side: 'left', fields: ['riderLink'] },
look: { title: 'How your page looks.', side: 'left', fields: ['look'] }
};
var PLACE = {
name: { label: 'Your DJ name', hint: 'Your DJ name' },
tag: { label: 'Your sound, in a few words', hint: 'Your sound, in a few words' },
home: { label: 'Your home city', hint: 'your city' },
riderNote: { label: 'A short note about what you need', hint: 'Or type one short note here' }
};
var LISTS = {
bio: { label: 'About you, paragraph ', hint: 'Write a few words about you. Press Enter for a new paragraph.', max: function () { return L.bioParas; } },
rider: { label: 'What you need, line ', hint: 'Type what you need. Press Enter for the next thing.', max: function () { return L.rider; } }
};
var NAMES = { name: 'your name', tag: 'your sound', home: 'your home city', bio: 'About', rider: 'what you need', riderNote: 'the note about what you need', first: 'your first name' };
var NEEDS = { tag: 'your sound', home: 'a home city', img: 'a photo', bio: 'a few words about you' };
var BG_NAMES = { red: 'Red', black: 'Black', cream: 'Cream' };
function str(v) { return v == null ? '' : String(v); }
function copy(o) { var n = {}, k; for (k in o) n[k] = o[k]; return n; }
function today() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
function day(iso) {
var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(iso)); if (!p) return str(iso);
var t = new Date(+p[1], +p[2] - 1, +p[3]);
return DOW[t.getDay()] + ', ' + MON[t.getMonth()] + NB + t.getDate();
}
function when(from, to) { return !to || to === from ? day(from) : day(from) + ' to ' + day(to); }
function and(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function tie(t) { var i = t.lastIndexOf(' '); return i < 0 ? t : t.slice(0, i) + NB + t.slice(i + 1); }
function formOf(a) {
var p = /^(\d{1,3})% (\d{1,3})%$/.exec(a.pos || '') || [0, 50, 50];
return {
name: a.name, first: a.first, tag: a.tag, genres: a.genres.filter(function (g) { return A.genres.indexOf(g) >= 0; }), home: a.home,
img: a.img, alt: a.alt === a.name ? '' : a.alt, px: +p[1], py: +p[2],
bio: a.bio.slice(), links: a.links.map(copy), sets: a.sets.map(copy),
findLabel: a.find ? a.find.label : '', findUrl: a.find ? a.find.url : '',
rider: a.rider.slice(), riderNote: a.riderNote, riderLink: a.riderLink,
bg: a.look.bg, image: a.look.image, record: a.look.record, sign: a.look.sign
};
}
function inputOf(f, saved) {
return {
slug: saved.slug, status: saved.status, name: f.name, first: f.first, tag: f.tag, genres: f.genres, home: f.home,
img: f.img, alt: f.alt, pos: f.px + '% ' + f.py + '%', bio: f.bio, sets: f.sets,
find: f.findLabel || f.findUrl ? { label: f.findLabel, url: f.findUrl } : null, links: f.links,
rider: f.rider, riderNote: f.riderNote, riderLink: f.riderLink,
look: { bg: f.bg, image: f.image, record: f.record, sign: f.sign }
};
}
function lean(f) { var n = copy(f); n.bio = f.bio.filter(Boolean); n.rider = f.rider.filter(Boolean); return n; }
function say(field, why) {
var row = /^(sets|links)\.\d+\.(title|label|url)$/.exec(field), k = row ? row[1] + '.' + row[2] : field, top = field.split('.')[0];
if (why === 'long') return tie(NAMES[top] ? 'Too long: ' + NAMES[top] + '. Make it a little shorter.' : 'Too long. Make it a little shorter.');
if (why === 'many') return top === 'bio' ? 'Too many paragraphs. Keep About to ' + L.bioParas + '.' : top === 'rider' ? 'Too many lines. Keep what you need to ' + L.rider + '.' : tie('That is more than fits. Take one out.');
if (why === 'soundcloud') return tie('Sets play from SoundCloud, so this has to be a SoundCloud link.');
if (why === 'https') return tie("That link doesn't look right. Mind checking it?");
if (why === 'required') {
if (k === 'name') return tie('Add your DJ name.');
if (k === 'sets.title') return tie('Give this set a title.');
if (k === 'sets.url') return tie('Add the SoundCloud link for this set.');
if (k === 'links.label') return tie('Name this link.');
if (k === 'links.url' || k === 'find.url') return tie('Add the link.');
if (k === 'find.label') return tie('Say what the link is.');
return tie('Your page is live, so it needs this.');
}
return tie('Pick one of the choices.');
}
function photoFail(code) {
if (code === 'tooBig') return tie('That file is too big. Pick one under 40 MB.');
if (code === 'offline') return tie("We couldn't reach BOOKD. Check your connection and try again.");
return tie("We couldn't read that picture. Try a JPG or a PNG.");
}
function fail(code) {
if (code === 'offline') return tie("We couldn't reach BOOKD. Check your connection and try again.");
if (code === 'rate') return tie('Too many tries. Give it a minute and try again.');
if (code === 'signedOut') return tie('You were logged out. Log in again, then save.');
if (code === 'forbidden' || code === 'missing') return tie("This account can't change that page.");
if (code === 'photo' || code === 'tooBig') return photoFail(code);
return tie('Something went wrong on our side. Try again.');
}
function textOf(el) { return str(el.innerText != null ? el.innerText : el.textContent).split(NB).join(' ').replace(/\r?\n/g, ' '); }
function caretOf(el) {
try {
var sel = W.getSelection(), r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
if (!r || !el.contains(r.startContainer)) return null;
var pre = W.document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
return { at: pre.toString().length, open: !r.collapsed };
} catch (e) { return null; }
}
function caretTo(el, at) {
try {
el.focus();
var sel = W.getSelection(), r = W.document.createRange(), n = el.firstChild;
if (n && n.nodeType === 3) r.setStart(n, Math.max(0, Math.min(at, n.nodeValue.length))); else r.selectNodeContents(el);
r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
} catch (e) {}
}
function isIn(el) { return !!el && W.document && W.document.activeElement === el; }
function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
function arm(el, label, hint) {
el.setAttribute('aria-label', label); el.setAttribute('data-ph', hint);
if (el.peArmed) return false;
el.peArmed = true;
try { el.contentEditable = 'plaintext-only'; } catch (e) {}
if (el.contentEditable !== 'plaintext-only') {
el.contentEditable = 'true';
el.addEventListener('paste', function (e) {
var t = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
e.preventDefault();
try { W.document.execCommand('insertText', false, t.replace(/\s+/g, ' ')); } catch (x) {}
});
}
el.setAttribute('role', 'textbox'); el.setAttribute('spellcheck', 'true');
return true;
}
function attach(page, links) {
links = links || {};
var s = {
phase: 'loading', code: '', user: null, id: '', saved: null, form: null, part: '', busy: false, msg: '', bad: false,
errs: {}, picking: '', flash: '',
dates: [], nd: { city: '', from: '', to: '' }, dateErr: '', dateBusy: false, dateMsg: '',
pv: { low: '', high: '', agent: '' }, pvBusy: false, pvMsg: '', pvBad: false
};
var gone = false, tick = 0, opener = null, flashT = null, wantHead = false;
var els = {}, rows = { bio: [], rider: [] }, refs = {}, rowRefs = { bio: [], rider: [] }, want = null;
function draw() { if (!gone) page.setState({ edTick: ++tick }); }
function shown() {
if (!s.saved || !s.form) return null;
var t = tidy(inputOf(s.form, s.saved), { strict: true }).artist;
t.slug = s.saved.slug; t.status = s.saved.status;
return t;
}
function put(first) {
var a = shown();
page.djs = a ? [a] : []; page.ready = true;
if (first) page.show({ dj: a, part: '' }, true); else draw();
}
function fresh() {
s.form = formOf(s.saved);
if (!s.form.bio.length) s.form.bio = [''];
if (!s.form.rider.length) s.form.rider = [''];
}
function dirty() { return !!(s.form && s.saved && !same(lean(s.form), formOf(s.saved))); }
function go(to) { try { W.location.replace(to); } catch (e) {} }
function clearMsg() { if (s.msg) { s.msg = ''; s.bad = false; } }
function load() {
s.phase = 'loading'; s.code = ''; draw();
B.dj.load().then(function (r) {
if (gone) return;
if (!r || !r.ok) { s.phase = 'failed'; s.code = (r && r.code) || 'unknown'; return draw(); }
if (!r.user) { try { B.next.set(); } catch (e) {} return go(links.login || 'login.html'); }
if (r.user.role !== 'dj') return go(links.account || 'account.html');
s.user = r.user;
if (!r.dj) { s.phase = 'none'; return draw(); }
s.id = r.dj.id; s.dates = (r.dates || []).slice();
s.pv = { low: r.dj.fee_low == null ? '' : str(r.dj.fee_low), high: r.dj.fee_high == null ? '' : str(r.dj.fee_high), agent: r.dj.agent_name || '' };
return M.mine().then(function (m) {
if (gone) return;
if (!m || !m.ok) { s.phase = 'failed'; s.code = (m && m.code) || 'unknown'; return draw(); }
if (!m.artist) { s.phase = 'none'; return draw(); }
s.saved = m.artist; fresh(); s.phase = 'ready';
put(true);
});
});
}
function flash(text) {
s.flash = text;
if (flashT) clearTimeout(flashT);
flashT = setTimeout(function () { flashT = null; s.flash = ''; draw(); }, 6000);
}
function edit(key, value) {
if (!s.form || s.form[key] === value) return;
s.form[key] = value;
if (s.errs[key]) delete s.errs[key];
clearMsg();
put();
}
function rowSet(list, i, key, value) {
var r = s.form[list]; if (!r[i] || r[i][key] === value) return;
r[i][key] = value;
delete s.errs[list + '.' + i];
clearMsg();
put();
}
function rowAdd(list) {
var max = list === 'sets' ? L.sets : L.links;
if (s.form[list].length >= max) return;
s.form[list].push(list === 'sets' ? { title: '', url: '' } : { label: '', url: '' });
put();
}
function rowRemove(list, i) { s.form[list].splice(i, 1); s.errs = {}; clearMsg(); put(); }
function pickFile(k, e) {
var input = e && e.target, file = input && input.files ? input.files[0] : null;
function clearBox() { if (input) { try { input.value = ''; } catch (x) {} } }
if (!file || s.picking || !s.form) return clearBox();
s.picking = k; delete s.errs[k]; draw();
M.photo(file, { max: k === 'record' ? 800 : 1600 }).then(function (p) {
clearBox();
if (gone || !s.form) return;
s.picking = '';
if (!p || !p.ok) { s.errs[k] = photoFail(p && p.code); return draw(); }
s.form[k] = p.url;
if (k === 'img') { s.form.px = 50; s.form.py = 30; }
clearMsg();
put();
});
}
function open(part, e) {
if (!PARTS[part] || s.phase !== 'ready' || s.busy) return;
opener = e && e.currentTarget ? e.currentTarget : null;
s.part = part; wantHead = true;
draw();
}
function close(back) {
s.part = ''; s.picking = '';
draw();
if (back && opener && opener.focus) { try { opener.focus(); } catch (e) {} }
opener = null;
}
function bind(key) {
if (refs[key]) return refs[key];
refs[key] = function (el) {
els[key] = el;
if (!el) return;
if (arm(el, PLACE[key].label, PLACE[key].hint)) {
el.addEventListener('input', function () { edit(key, textOf(el)); });
el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
}
if (!isIn(el)) setText(el, s.form ? str(s.form[key]) : '');
};
return refs[key];
}
function bindRow(list, i) {
if (rowRefs[list][i]) return rowRefs[list][i];
rowRefs[list][i] = function (el) {
rows[list][i] = el;
if (!el) return;
if (arm(el, LISTS[list].label + (i + 1), i === 0 ? LISTS[list].hint : '')) {
el.addEventListener('input', function () {
var r = s.form[list], t = textOf(el);
if (r[i] === t) return;
r[i] = t; delete s.errs[list]; clearMsg(); put();
});
el.addEventListener('keydown', function (e) {
var r = s.form[list], c, t;
if (e.key === 'Enter' && !e.isComposing) {
e.preventDefault();
if (r.length >= LISTS[list].max()) return;
c = caretOf(el); t = textOf(el);
var cut = c ? c.at : t.length;
r.splice(i, 1, t.slice(0, cut), t.slice(cut));
setText(el, r[i]);
want = { list: list, i: i + 1, at: 0 };
clearMsg(); put();
} else if (e.key === 'Backspace' && i > 0) {
c = caretOf(el);
if (!c || c.open || c.at !== 0) return;
e.preventDefault();
var before = r[i - 1];
r.splice(i - 1, 2, before + textOf(el));
want = { list: list, i: i - 1, at: before.length, text: r[i - 1] };
clearMsg(); put();
}
});
el.addEventListener('blur', function () {
var r = s.form[list];
if (want || r.length < 2 || r[i] || textOf(el)) return;
r.splice(i, 1); put();
});
}
if (!isIn(el)) setText(el, s.form && s.form[list][i] != null ? s.form[list][i] : '');
};
return rowRefs[list][i];
}
function painted() {
if (gone || !s.form) return;
var k, i, el, w = want;
if (w && rows[w.list][w.i]) {
want = null; el = rows[w.list][w.i];
setText(el, w.text != null ? w.text : str(s.form[w.list][w.i]));
caretTo(el, w.at);
}
for (k in els) if (els[k] && !isIn(els[k])) setText(els[k], str(s.form[k]));
for (k in rows) for (i = 0; i < rows[k].length; i++) {
el = rows[k][i];
if (el && !isIn(el) && s.form[k][i] != null) setText(el, s.form[k][i]);
}
}
function undo() {
if (s.busy || !s.saved) return;
var a = W.document && W.document.activeElement;
if (a && a.peArmed && a.blur) a.blur();
fresh(); s.errs = {}; s.msg = ''; s.bad = false; s.picking = ''; want = null;
put();
}
function save(e) {
if (e && e.preventDefault) e.preventDefault();
if (s.busy || !s.form || !dirty()) return;
s.busy = true; s.msg = ''; s.bad = false; s.errs = {}; draw();
M.saveMine(inputOf(lean(s.form), s.saved)).then(function (r) {
if (gone) return;
s.busy = false;
if (r && r.ok && r.artist) {
s.saved = r.artist; fresh();
flash('Saved.');
return put();
}
if (r && r.code === 'invalid') {
var needs = [], parts = [], first = '', to = '';
(r.problems || []).forEach(function (p) {
var top = p.field.split('.')[0], row = /^(sets|links)\.(\d+)\./.exec(p.field), key = row ? row[1] + '.' + row[2] : (top === 'find' ? p.field : top), k, name;
if (p.why === 'required' && NEEDS[top]) { if (needs.indexOf(NEEDS[top]) < 0) needs.push(NEEDS[top]); if (!to) to = top === 'img' ? '>photo' : top; return; }
if (!s.errs[key]) s.errs[key] = say(p.field, p.why);
if (PLACE[top] || LISTS[top]) { if (!first) first = s.errs[key]; if (!to) to = top; return; }
for (k in PARTS) if (PARTS[k].fields.indexOf(top) >= 0) { name = PARTS[k].title.replace(/\.$/, ''); if (parts.indexOf(name) < 0) parts.push(name); if (!to) to = '>' + k; }
});
s.bad = true;
s.msg = needs.length ? 'Your page is live, so it needs ' + and(needs) + '.'
: first ? first
: parts.length ? 'Something needs a look in ' + and(parts) + '.'
: fail('unknown');
if (to.charAt(0) === '>') { s.part = to.slice(1); wantHead = true; }
else if (els[to]) { try { els[to].focus(); } catch (x) {} }
else if (rows[to] && rows[to][0]) { try { rows[to][0].focus(); } catch (x) {} }
return draw();
}
s.bad = true; s.msg = fail(r && r.code);
draw();
});
}
function addDate(e) {
if (e && e.preventDefault) e.preventDefault();
if (s.dateBusy) return;
var city = str(s.nd.city).replace(/\s+/g, ' ').replace(/^ | $/g, ''), from = s.nd.from, to = s.nd.to || s.nd.from, now = today();
s.dateMsg = '';
if (!city) { s.dateErr = tie('Add the city.'); return draw(); }
if (!from) { s.dateErr = tie('Pick the first night.'); return draw(); }
if (from < now || to < now) { s.dateErr = tie('That night has passed. Pick one coming up.'); return draw(); }
if (to < from) { s.dateErr = tie('The last night is before the first one.'); return draw(); }
s.dateErr = ''; s.dateBusy = true; draw();
B.dj.addDate(s.id, { city: city, from: from, to: to }).then(function (r) {
if (gone) return;
s.dateBusy = false;
if (!r || !r.ok) { s.dateErr = r && r.code === 'invalid' ? tie("We couldn't save that date. Check the city and the nights.") : fail(r && r.code); return draw(); }
s.dates.push(r.date);
s.dates.sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
s.nd = { city: '', from: '', to: '' }; s.dateMsg = 'Added ' + city + '.';
draw();
});
}
function removeDate(id) {
if (s.dateBusy) return;
var was = s.dates.filter(function (d) { return d.id === id; })[0];
if (!was) return;
s.dateBusy = true; s.dateErr = ''; s.dateMsg = ''; draw();
B.dj.removeDate(id).then(function (r) {
if (gone) return;
s.dateBusy = false;
if (!r || !r.ok) { s.dateErr = fail(r && r.code); return draw(); }
s.dates = s.dates.filter(function (d) { return d.id !== id; });
s.dateMsg = 'Removed ' + was.city + '.';
draw();
});
}
function savePv(e) {
if (e && e.preventDefault) e.preventDefault();
if (s.pvBusy) return;
var num = function (v) { v = str(v).replace(/[$,\s]/g, ''); return v === '' ? null : (/^\d+$/.test(v) ? +v : NaN); };
var lo = num(s.pv.low), hi = num(s.pv.high);
if (lo !== lo || hi !== hi) { s.pvBad = true; s.pvMsg = tie('Type the fee as a number, like 1500.'); return draw(); }
if (lo != null && hi != null && lo > hi) { s.pvBad = true; s.pvMsg = tie('The first number is bigger than the second one.'); return draw(); }
s.pvBusy = true; s.pvMsg = ''; s.pvBad = false; draw();
B.dj.save(s.id, { fee_low: lo, fee_high: hi, agent_name: s.pv.agent }).then(function (r) {
if (gone) return;
s.pvBusy = false;
if (!r || !r.ok) { s.pvBad = true; s.pvMsg = fail(r && r.code); return draw(); }
s.pv = { low: r.dj.fee_low == null ? '' : str(r.dj.fee_low), high: r.dj.fee_high == null ? '' : str(r.dj.fee_high), agent: r.dj.agent_name || '' };
s.pvMsg = 'Saved.';
draw();
});
}
var set = {}, pick = {}, clear = {}, openers = {}, ndSet = {}, pvSet = {}, at = {};
['first', 'alt', 'findLabel', 'findUrl', 'riderLink'].forEach(function (k) {
set[k] = function (e) { edit(k, e && e.target ? e.target.value : ''); };
});
set.px = function (e) { edit('px', Math.max(0, Math.min(100, Math.round(+e.target.value || 0)))); };
set.py = function (e) { edit('py', Math.max(0, Math.min(100, Math.round(+e.target.value || 0)))); };
['img', 'image', 'record'].forEach(function (k) {
pick[k] = function (e) { pickFile(k, e); };
clear[k] = function () { if (!s.form) return; delete s.errs[k]; edit(k, ''); };
});
Object.keys(PARTS).forEach(function (k) { openers[k] = function (e) { open(k, e); }; });
Object.keys(PLACE).forEach(function (k) { at[k] = bind(k); });
['city', 'from', 'to'].forEach(function (k) { ndSet[k] = function (e) { s.nd[k] = e && e.target ? e.target.value : ''; if (s.dateErr) s.dateErr = ''; draw(); }; });
['low', 'high', 'agent'].forEach(function (k) { pvSet[k] = function (e) { s.pv[k] = e && e.target ? e.target.value : ''; s.pvMsg = ''; s.pvBad = false; draw(); }; });
var h = {
done: function (e) { if (e && e.preventDefault) e.preventDefault(); close(true); },
key: function (e) { if (e && (e.key === 'Escape' || e.key === 'Esc')) { e.stopPropagation(); close(true); } },
headRef: function (el) { if (el && wantHead) { wantHead = false; try { el.focus(); } catch (x) {} } },
spotAt: function (e) {
var r = e.currentTarget.getBoundingClientRect();
if (!r.width || !r.height || !s.form) return;
s.form.px = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
s.form.py = Math.max(0, Math.min(100, Math.round((e.clientY - r.top) / r.height * 100)));
put();
},
addLink: function () { rowAdd('links'); },
addSet: function () { rowAdd('sets'); },
retry: load,
logOut: function () { B.auth.signOut().then(function () { go(links.home || 'index.html'); }); },
addDate: addDate, savePv: savePv, save: save, undo: undo,
leave: function (e) { if (!dirty()) return undefined; e.preventDefault(); e.returnValue = ''; return ''; }
};
var OFF_PART = { basics: false, photo: false, about: false, sets: false, rider: false, look: false };
function vals() {
var ready = s.phase === 'ready' && !!s.saved, f = s.form || {}, live = ready && s.saved.status === 'live', part = s.part, P = PARTS[part] || null;
var is = copy(OFF_PART); if (P) is[part] = true;
var errs = s.errs, err = {}, inv = {}, k;
['img', 'image', 'record', 'alt', 'riderLink', 'find.label', 'find.url', 'sets', 'links', 'first'].forEach(function (key) {
var n = key.replace('.', '_'); err[n] = !!errs[key]; inv[n] = errs[key] ? 'true' : 'false';
});
var errText = {}; for (k in errs) errText[k.replace('.', '_')] = errs[k];
var list = function (name, a, b) {
return (f[name] || []).map(function (r, i) {
var o = { n: String(i + 1), bad: !!errs[name + '.' + i], err: errs[name + '.' + i] || '', inv: errs[name + '.' + i] ? 'true' : 'false',
remove: function () { rowRemove(name, i); }, removeAria: 'Remove ' + (r[a] || (name === 'sets' ? 'set ' : 'link ') + (i + 1)) };
o[a] = r[a]; o[b] = r[b];
o.setA = function (e) { rowSet(name, i, a, e.target.value); };
o.setB = function (e) { rowSet(name, i, b, e.target.value); };
return o;
});
};
var changed = ready && dirty(), lines = (f.rider || []).filter(Boolean);
return {
on: true,
dotCls: 'pe-dot0' + (live ? ' pe-live' : ''),
head: !ready ? 'Your dashboard.' : tie(live ? 'Your page is live.' : 'Your page is a draft.'),
line: s.flash || (!ready ? '' : tie(live ? 'This is what hosts see. Click any words to change them.' : "Hosts can't see it yet. Click any words to change them. BOOKD puts it live when it's ready.")),
canSee: live && typeof links.artistUrl === 'function', seeHref: live && typeof links.artistUrl === 'function' ? links.artistUrl(s.saved.slug) : '',
logOut: h.logOut,
waiting: s.phase === 'loading', failed: s.phase === 'failed', failText: fail(s.code), retry: h.retry, noPage: s.phase === 'none',
ready: ready,
at: at, hasTag: !!str(f.tag).replace(/\s+/g, ''),
bioRows: (f.bio || []).map(function (t, i) { return { ref: bindRow('bio', i) }; }),
riderRows: (f.rider || []).map(function (t, i) { return { ref: bindRow('rider', i) }; }),
hasLines: lines.length > 0, noLines: !lines.length,
open: openers, photoPill: ready && f.img ? 'Change photo' : 'Add a photo',
setsPill: ready && (f.sets || []).length ? 'Edit sets' : 'Add your sets', linksPill: ready && (f.links || []).length ? 'Edit links' : 'Add links',
riderPill: ready && f.riderLink ? 'Change the rider link' : 'Add a link to your full rider',
panel: !!P, side: P ? P.side : 'right', title: P ? P.title : '', is: is, key: h.key, headRef: h.headRef, done: h.done,
f: { first: f.first || '', alt: f.alt || '', img: f.img || '', px: f.px == null ? 50 : f.px, py: f.py == null ? 50 : f.py,
findLabel: f.findLabel || '', findUrl: f.findUrl || '', riderLink: f.riderLink || '' },
set: set, err: err, inv: inv, errText: errText,
genres: A.genres.map(function (g) {
var on = (f.genres || []).indexOf(g) >= 0;
return { label: g, on: on ? 'true' : 'false', flip: function () { var l = (s.form.genres || []).slice(), i = l.indexOf(g); if (i >= 0) l.splice(i, 1); else l.push(g); edit('genres', l); } };
}),
hasPhoto: !!f.img, noPhoto: !f.img, hasImage: !!f.image, hasRecord: !!f.record, spotAt: h.spotAt,
pick: pick, clear: clear,
pickBusy: { img: s.picking === 'img' ? 'true' : 'false', image: s.picking === 'image' ? 'true' : 'false', record: s.picking === 'record' ? 'true' : 'false' },
pickLabel: { img: s.picking === 'img' ? 'One sec' : (f.img ? 'Choose another photo' : 'Choose a photo'),
image: s.picking === 'image' ? 'One sec' : (f.image ? 'Choose another picture' : 'Choose a picture'),
record: s.picking === 'record' ? 'One sec' : (f.record ? 'Choose another picture' : 'Choose a picture') },
bgs: A.backgrounds.map(function (c) { return { key: c, label: BG_NAMES[c] || c, on: f.bg === c ? 'true' : 'false', pick: function () { edit('bg', c); } }; }),
signs: ['left', 'right'].map(function (c) { return { label: c === 'left' ? 'Left' : 'Right', on: f.sign === c ? 'true' : 'false', pick: function () { edit('sign', c); } }; }),
links: list('links', 'label', 'url'), addLink: h.addLink, canAddLink: (f.links || []).length < L.links,
sets: list('sets', 'title', 'url'), addSet: h.addSet, canAddSet: (f.sets || []).length < L.sets, noSetRows: !(f.sets || []).length,
bar: changed || s.busy || !!s.msg, barPanel: P ? P.side : 'no',
barText: s.msg || (s.busy ? 'Saving your page.' : tie('You have changes that are not saved yet.')), barCls: 'pe-bartext' + (s.bad ? ' pe-msgbad' : ''),
save: h.save, undo: h.undo, busy: s.busy ? 'true' : 'false', saveLabel: s.busy ? 'Saving' : 'Save',
dates: s.dates.map(function (d) { return { when: when(d.from, d.to), city: d.city, remove: function () { removeDate(d.id); }, removeAria: 'Remove ' + d.city + ', ' + when(d.from, d.to) }; }),
noDates: !s.dates.length, nd: s.nd, ndSet: ndSet, ndMin: today(), ndInv: s.dateErr ? 'true' : 'false',
addDate: h.addDate, addBusy: s.dateBusy ? 'true' : 'false', addLabel: s.dateBusy ? 'One sec' : 'Add the date',
hasDateErr: !!s.dateErr, dateErr: s.dateErr, hasDateMsg: !s.dateErr && !!s.dateMsg, dateMsg: s.dateMsg,
pv: s.pv, pvSet: pvSet, savePv: h.savePv, pvBusy: s.pvBusy ? 'true' : 'false', pvLabel: s.pvBusy ? 'Saving' : 'Save',
hasPvMsg: !!s.pvMsg, pvMsg: s.pvMsg, pvMsgCls: 'pe-msg' + (s.pvBad ? ' pe-msgbad' : '')
};
}
return {
start: function () { if (W.addEventListener) W.addEventListener('beforeunload', h.leave); load(); },
stop: function () { gone = true; if (flashT) clearTimeout(flashT); if (W.removeEventListener) W.removeEventListener('beforeunload', h.leave); },
vals: vals, painted: painted
};
}
B.pageEditor = { attach: attach };
})();