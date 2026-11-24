(function () {
var cfg = window.BOOKD_CONFIG || {};
var lib = window.supabase;
var ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && lib && lib.createClient);
var hash = String(location.hash || '');
var arrived = /[#&]type=recovery\b/.test(hash) ? 'recovery' : (/[#&]type=invite\b/.test(hash) ? 'invite' : (/[#&]error(_code)?=/.test(hash) ? 'expired' : ''));
var query = String(location.search || '');
var linkToken = /[?&]token_hash=([A-Za-z0-9_-]{8,200})(?:&|$)/.exec(query);
var linkType = /[?&]type=(signup|email|recovery|invite|email_change)(?:&|$)/.exec(query);
var link = linkToken && linkType ? { token_hash: linkToken[1], type: linkType[1] } : null;
if (link && (link.type === 'recovery' || link.type === 'invite')) arrived = link.type;
var BOOKD = window.BOOKD = { ready: ready, arrived: arrived, who: null, auth: {}, contact: {}, apply: {}, next: {} };
var NEXT = 'bookd.next';
function nextOk(v) { return typeof v === 'string' && v.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._-]*(#[A-Za-z0-9._~%\/=&+-]*)?$/.test(v); }
BOOKD.next.set = function () {
var file = String(location.pathname || '').split('/').pop() || 'index.html', h = String(location.hash || '');
var v = file + (h.length > 1 ? h : '');
if (!nextOk(v)) v = nextOk(file) ? file : '';
if (!v || /^login(\.html)?$/i.test(file)) return '';
try { sessionStorage.setItem(NEXT, v); return sessionStorage.getItem(NEXT) === v ? v : ''; } catch (e) { return ''; }
};
BOOKD.next.take = function () {
var v = null;
try { v = sessionStorage.getItem(NEXT); sessionStorage.removeItem(NEXT); } catch (e) {}
return nextOk(v) ? v : '';
};
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
var landed = Promise.resolve({ ok: true });
if (link) {
var linkDone = function () { try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {} };
landed = sb.auth.verifyOtp(link).then(function (r) {
if (!r || !r.error) { linkDone(); return { ok: true }; }
var c = code(r.error);
if (c === 'offline') return { ok: false, code: c };
linkDone(); BOOKD.arrived = 'expired';
return { ok: false, code: 'expired' };
}, function (err) { return { ok: false, code: code(err) }; });
}
BOOKD.landed = landed;
var CLAIM = 'bookd.claim';
try { var cm = /[#&]claim=([0-9a-f]{16})(?![0-9a-f])/.exec(location.hash); if (cm) localStorage.setItem(CLAIM, cm[1]); } catch (e) {}
function claimCode() { try { var c = localStorage.getItem(CLAIM) || ''; return /^[0-9a-f]{16}$/.test(c) ? c : ''; } catch (e) { return ''; } }
var CLAIM_ASKED = 'bookd.claim.asked';
function dropClaim() { try { localStorage.removeItem(CLAIM); sessionStorage.removeItem(CLAIM_ASKED); } catch (e) {} }
function claimNow(user) {
var c = claimCode();
if (!c || !user) return Promise.resolve(false);
var asked = user.id + ':' + c;
try { if (sessionStorage.getItem(CLAIM_ASKED) === asked) return Promise.resolve(false); } catch (e) {}
return sb.rpc('claim_profile', { p_code: c }).then(function (r) {
if (!r || r.error) return false;
if (r.data === true) { dropClaim(); return true; }
try { sessionStorage.setItem(CLAIM_ASKED, asked); } catch (e) {}
return false;
}, function () { return false; });
}
BOOKD.auth.linkWaiting = function () { return !!claimCode(); };
function settle(me) { if (me && me.role === 'dj' && claimCode()) dropClaim(); return me; }
function page(file) { return location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '') + file; }
function code(err) {
if (!err) return 'unknown';
var c = String(err.code || ''), m = String(err.message || '').toLowerCase(), s = err.status || 0;
if (c === 'invalid_credentials' || m.indexOf('invalid login') >= 0) return 'badLogin';
if (c === 'email_not_confirmed' || m.indexOf('not confirmed') >= 0) return 'unconfirmed';
if (c === 'user_already_exists' || c === 'email_exists' || m.indexOf('already registered') >= 0) return 'taken';
if (c === 'same_password' || m.indexOf('different from the old') >= 0) return 'samePw';
if (c === 'weak_password' || m.indexOf('password should') >= 0) return 'weak';
if (s === 429 || c === 'BK429' || c.indexOf('rate_limit') >= 0 || m.indexOf('rate limit') >= 0) return 'rate';
if (c === '23514' || c === '23502' || c === '22001') return 'invalid';
if (c === 'otp_expired' || c === 'session_not_found' || m.indexOf('session missing') >= 0) return 'expired';
if (err.name === 'AuthRetryableFetchError' || err.status === 0 || s === 0 && err.name === 'TypeError') return 'offline';
if (m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0 || m.indexOf('fetch failed') >= 0 || m.indexOf('network') >= 0 || m.indexOf('internet connection') >= 0) return 'offline';
return 'unknown';
}
function fail(err) { return { ok: false, code: code(err) }; }
function guard(p) { return p.then(function (r) { return r; }, fail); }
function describe(user) {
if (!user) return Promise.resolve(remember(null));
var meta = user.user_metadata || {};
var me = { id: user.id, email: user.email || '', name: meta.name || '', role: 'host' };
return sb.from('profiles').select('role, display_name').eq('id', user.id).maybeSingle().then(function (r) {
if (!r || r.error) throw (r && r.error ? { code: r.error.code, message: r.error.message, status: r.status } : { message: 'no answer' });
if (r.data) { me.role = r.data.role || 'host'; me.name = r.data.display_name || me.name; }
return remember(me);
});
}
function arrive(user) {
return describe(user).then(function (me) {
if (!me || me.role !== 'host' || !claimCode()) return settle(me);
return claimNow(user).then(function (got) { return got ? describe(user) : me; });
});
}
BOOKD.auth.current = function () {
return guard(landed.then(function () { return sb.auth.getSession(); }).then(function (r) {
var u = r && r.data && r.data.session ? r.data.session.user : null;
return arrive(u).then(function (me) { return { ok: true, user: me }; });
}));
};
BOOKD.auth.signUp = function (o) {
o = o || {};
return guard(sb.auth.signUp({
email: o.email, password: o.password,
options: { data: claimCode() ? { name: o.name || '', claim: claimCode() } : { name: o.name || '' }, emailRedirectTo: page('login.html') }
}).then(function (r) {
if (r.error) return fail(r.error);
var u = r.data && r.data.user;
if (u && u.identities && u.identities.length === 0) return { ok: false, code: 'taken' };
if (!r.data.session) return { ok: true, needsConfirm: true };
return describe(u).then(function (me) { return { ok: true, needsConfirm: false, user: me }; });
}));
};
BOOKD.auth.signIn = function (o) {
o = o || {};
return guard(sb.auth.signInWithPassword({ email: o.email, password: o.password }).then(function (r) {
if (r.error) return fail(r.error);
return arrive(r.data.user).then(function (me) { return { ok: true, user: me }; });
}));
};
BOOKD.auth.signOut = function () {
remember(null);
return guard(sb.auth.signOut().then(function (r) { return r.error ? fail(r.error) : { ok: true }; }));
};
BOOKD.auth.sendReset = function (email) {
return guard(sb.auth.resetPasswordForEmail(email, { redirectTo: page('login.html') }).then(function (r) {
if (r.error) return fail(r.error);
return { ok: true };
}));
};
BOOKD.auth.setPassword = function (password) {
return guard(sb.auth.updateUser({ password: password }).then(function (r) {
if (r.error) return fail(r.error);
return describe(r.data.user).then(function (me) { return { ok: true, user: me }; });
}));
};
function add(table, row) {
return guard(sb.from(table).insert(row).then(function (r) {
if (!r.error) return { ok: true };
return fail({ code: r.error.code, message: r.error.message, status: r.status });
}));
}
function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function isEmail(v) { v = String(v == null ? '' : v); return v.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
BOOKD.contact.send = function (o) {
o = o || {};
return add('contact_messages', {
name: clip(o.name, 120) || 'No name given', email: clip(o.email, 200),
who: /^(host|dj|agent|other)$/.test(o.who) ? o.who : 'other', message: clip(o.message, 4000)
});
};
BOOKD.apply.send = function (o) {
o = o || {};
return add('dj_applications', {
name: clip(o.name, 120), email: clip(o.email, 200), set_links: clip(o.links, 2000),
home_city: clip(o.city, 120), upcoming: clip(o.next, 500), fee_range: clip(o.fee, 120)
});
};
BOOKD._ = { sb: sb, guard: guard, fail: fail, clip: clip, isEmail: isEmail, describe: describe,
BUCKET: 'dj-photos', forget: function () { remember(null); },
bad: function (r) { return r && r.error ? fail({ code: r.error.code, message: r.error.message, status: r.status }) : null; } };
BOOKD.auth.current();
})();
(function () {
var W = typeof window !== 'undefined' ? window : {};
var B = W.BOOKD = W.BOOKD || { ready: false };
var LIVE = !!(B.ready && B._ && B._.sb);
var MODE = LIVE ? 'database' : 'device';
var PREFIX = 'bookd.roster.v1';
var KEY = PREFIX + '.artists';
var PHOTO_DB = PREFIX, PHOTO_STORE = 'photos';
var BUCKET = LIVE ? B._.BUCKET : 'dj-photos';
var FILE = 'bookd-roster.json';
var GENRES = ['Afro / Amapiano', 'House / Tech house', 'Techno / EBM', 'Disco', 'R&B', 'Rap'];
var BGS = ['red', 'black', 'cream'];
var PLACES = [
{ key: 'nyc', names: ['new york', 'nyc', 'brooklyn', 'manhattan', 'queens', 'bronx', 'bushwick', 'williamsburg', 'greenpoint', 'bed stuy', 'harlem', 'soho', 'tribeca', 'astoria'] },
{ key: 'bos', names: ['boston', 'cambridge', 'somerville', 'allston', 'brookline'] },
{ key: 'atl', names: ['atlanta', 'atl', 'decatur', 'buckhead'] },
{ key: 'chi', names: ['chicago', 'chi', 'evanston', 'wicker park', 'logan square'] }
];
var L = { slug: 60, name: 120, first: 24, tag: 60, genres: 6, home: 120, alt: 200, bioParas: 8, bioChars: 2000,
sets: 4, setTitle: 120, url: 500, findLabel: 60, links: 8, linkLabel: 40, rider: 12, riderLine: 160, riderNote: 160 };
var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
var NEEDED = ['tag', 'home', 'img', 'bio'];
function str(v) { return v == null ? '' : String(v); }
function one(v) { return str(v).replace(/\s+/g, ' ').replace(/^ | $/g, ''); }
function homeKey(home) {
var q = ' ' + str(home).toLowerCase().replace(/[^a-z]+/g, ' ') + ' ', i, j;
for (i = 0; i < PLACES.length; i++) for (j = 0; j < PLACES[i].names.length; j++) if (q.indexOf(' ' + PLACES[i].names[j] + ' ') >= 0) return PLACES[i].key;
return '';
}
function https(v) {
var s = str(v).replace(/^\s+|\s+$/g, '');
if (!s || s.length > L.url || /[\s"'<>\\]/.test(s) || !/^https:\/\//i.test(s)) return '';
try { var u = new URL(s); if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return ''; } catch (e) { return ''; }
return s;
}
function isSoundCloud(url) {
try { var h = new URL(url).hostname.toLowerCase(); return h === 'soundcloud.com' || /\.soundcloud\.com$/.test(h); } catch (e) { return false; }
}
var EMOJI = null;
try { EMOJI = new RegExp('\\p{Extended_Pictographic}', 'u'); } catch (e) { EMOJI = /[\u2600-\u27bf\ud83c-\ud83e]/; }
function hints(field, text, out) {
if (!text) return;
if (/[\u2012-\u2015]|\s-{1,2}\s|--/.test(text)) out.push({ field: field, code: 'dash' });
if (EMOJI.test(text)) out.push({ field: field, code: 'emoji' });
if (/\bbooked\b/i.test(text)) out.push({ field: field, code: 'booked' });
}
function byName(a, b) {
var x = str(a.name), y = str(b.name), r = 0;
try { r = x.localeCompare(y, 'en', { sensitivity: 'base' }); } catch (e) { r = x.toLowerCase() < y.toLowerCase() ? -1 : x.toLowerCase() > y.toLowerCase() ? 1 : 0; }
return r || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}
function tidy(input, opt) {
opt = opt || {};
var strict = !!opt.strict, x = input || {}, bad = [], notes = [], a = {}, i, s, n;
function flag(field, why) { bad.push({ field: field, why: why }); }
function text(v, max, field) {
var t = one(v);
if (t.length > max) { if (strict) flag(field, 'long'); t = t.slice(0, max).replace(/ $/, ''); }
return t;
}
function link(v, field) {
var raw = str(v).replace(/^\s+|\s+$/g, ''), t = raw;
if (!raw) return '';
if (strict) { if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t; t = t.replace(/^http:\/\//i, 'https://'); }
var ok = https(t);
if (!ok && strict) flag(field, t.length > L.url ? 'long' : 'https');
return ok;
}
function rows(v) { return Array.isArray(v) ? v : []; }
a.slug = str(x.slug).replace(/^\s+|\s+$/g, '').toLowerCase();
if (a.slug && (!SLUG.test(a.slug) || a.slug.length > L.slug)) { flag('slug', 'format'); a.slug = ''; }
a.name = text(x.name, L.name, 'name');
if (!a.name) flag('name', 'required');
a.first = text(x.first, L.first, 'first') || a.name.split(' ')[0].slice(0, L.first);
a.tag = text(x.tag, L.tag, 'tag');
a.genres = [];
rows(x.genres).forEach(function (g) {
g = one(g).slice(0, 40);
if (!g || a.genres.indexOf(g) >= 0) return;
if (GENRES.indexOf(g) < 0 && strict) { flag('genres', 'choice'); return; }
if (a.genres.length < (strict ? L.genres : 12)) a.genres.push(g);
});
if (strict) a.genres.sort(function (p, q) { return GENRES.indexOf(p) - GENRES.indexOf(q); });
a.home = text(x.home, L.home, 'home');
a.homeKey = homeKey(a.home);
a.img = str(x.img).replace(/^\s+|\s+$/g, '');
a.alt = text(x.alt, L.alt, 'alt') || a.name;
s = /^(\d{1,3})% (\d{1,3})%$/.exec(one(x.pos));
if (s && +s[1] <= 100 && +s[2] <= 100) a.pos = (+s[1]) + '% ' + (+s[2]) + '%';
else { if (strict && one(x.pos)) flag('pos', 'format'); a.pos = '50% 50%'; }
var paras = (Array.isArray(x.bio) ? x.bio : str(x.bio).split(/\n\s*\n/)).map(one).filter(Boolean);
if (paras.length > L.bioParas) { if (strict) flag('bio', 'many'); paras = paras.slice(0, L.bioParas); }
var size = function (list) { return list.join('\n\n').length; };
if (size(paras) > L.bioChars) {
if (strict) flag('bio', 'long');
while (paras.length > 1 && size(paras) > L.bioChars) paras.pop();
if (size(paras) > L.bioChars) paras = [paras[0].slice(0, L.bioChars)];
}
a.bio = paras;
a.sets = [];
var over = false;
rows(x.sets).forEach(function (r, k) {
r = r || {};
var title = text(r.title, L.setTitle, 'sets.' + k + '.title'), raw = one(r.url);
if (!title && !raw) return;
var url = link(raw, 'sets.' + k + '.url');
if (!raw && strict) flag('sets.' + k + '.url', 'required');
if (url && !isSoundCloud(url)) { if (strict) flag('sets.' + k + '.url', 'soundcloud'); url = ''; }
if (!title && strict) flag('sets.' + k + '.title', 'required');
if (!title || !url) return;
if (a.sets.length >= L.sets) { if (strict && !over) { flag('sets', 'many'); over = true; } return; }
a.sets.push({ title: title, url: url });
});
a.find = null;
if (x.find && typeof x.find === 'object') {
var fl = text(x.find.label, L.findLabel, 'find.label'), fraw = one(x.find.url), fu = link(fraw, 'find.url');
if (fl && !fraw && strict) flag('find.url', 'required');
if (!fl && fraw && strict) flag('find.label', 'required');
if (fl && fu) a.find = { label: fl, url: fu };
}
a.links = [];
over = false;
rows(x.links).forEach(function (r, k) {
r = r || {};
var label = text(r.label, L.linkLabel, 'links.' + k + '.label'), raw = one(r.url);
if (!label && !raw) return;
var url = link(raw, 'links.' + k + '.url');
if (!raw && strict) flag('links.' + k + '.url', 'required');
if (!label && strict) flag('links.' + k + '.label', 'required');
if (!label || !url) return;
if (a.links.length >= L.links) { if (strict && !over) { flag('links', 'many'); over = true; } return; }
a.links.push({ label: label, url: url });
});
a.rider = [];
over = false;
(Array.isArray(x.rider) ? x.rider : str(x.rider).split('\n')).forEach(function (r, k) {
var line = text(r, L.riderLine, 'rider.' + k);
if (!line) return;
if (a.rider.length >= L.rider) { if (strict && !over) { flag('rider', 'many'); over = true; } return; }
a.rider.push(line);
});
a.riderNote = text(x.riderNote, L.riderNote, 'riderNote');
a.riderLink = link(x.riderLink, 'riderLink');
var lk = x.look && typeof x.look === 'object' ? x.look : {}, bg = one(lk.bg), sign = one(lk.sign);
if (bg && BGS.indexOf(bg) < 0) { if (strict) flag('look.bg', 'choice'); bg = ''; }
if (sign && sign !== 'left' && sign !== 'right') { if (strict) flag('look.sign', 'choice'); sign = ''; }
a.look = { bg: bg || 'red', image: str(lk.image).replace(/^\s+|\s+$/g, ''), record: str(lk.record).replace(/^\s+|\s+$/g, ''), sign: sign || 'left' };
s = one(x.status);
if (s && s !== 'live' && s !== 'draft') { if (strict) flag('status', 'choice'); s = ''; }
a.status = s || (strict ? 'draft' : 'live');
var missing = [];
for (i = 0; i < NEEDED.length; i++) if (!(NEEDED[i] === 'bio' ? a.bio.length : a[NEEDED[i]])) missing.push(NEEDED[i]);
if (strict && a.status === 'live') for (i = 0; i < missing.length; i++) flag(missing[i], 'required');
hints('tag', a.tag, notes); hints('alt', a.alt, notes); hints('riderNote', a.riderNote, notes);
for (i = 0; i < a.bio.length; i++) hints('bio.' + i, a.bio[i], notes);
for (i = 0; i < a.rider.length; i++) hints('rider.' + i, a.rider[i], notes);
if (a.find) hints('find.label', a.find.label, notes);
n = { artist: a, missing: missing, notes: notes };
if (bad.length) { n.ok = false; n.code = 'invalid'; n.field = bad[0].field; n.problems = bad; } else n.ok = true;
return n;
}
function plain(a) { return tidy(a).artist; }
function fixedList(fixed) {
var out = [], seen = {};
(Array.isArray(fixed) ? fixed : []).forEach(function (f) {
var t = tidy(f);
if (!t.ok || !t.artist.slug || seen[t.artist.slug]) return;
seen[t.artist.slug] = 1; out.push(t.artist);
});
return out.sort(byName);
}
function live(list) { return list.filter(function (a) { return a.status === 'live'; }); }
function noDates(list) { list.forEach(function (a) { a.dates = []; }); return list; }
function picId(v) { var m = /([0-9a-f]{32})/.exec(str(v)); return m ? m[1] : str(v); }
function canon(a) {
var c = plain(a);
c.img = picId(c.img); c.look.image = picId(c.look.image); c.look.record = picId(c.look.record);
return JSON.stringify(c);
}
function print(a) {
var s = canon(a), h = 2166136261, i;
for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
return ('0000000' + h.toString(16)).slice(-8);
}
function linesOf(row) {
var own = Array.isArray(row.rider_lines) ? row.rider_lines.filter(Boolean) : [];
if (own.length) return own;
return [row.plays_on, row.room_needs, row.table_needs, row.arrival, row.hospitality].map(one).filter(Boolean);
}
function fromRow(row, pic) {
row = row || {};
pic = pic || function (p) { return p || ''; };
var tracks = (row.dj_tracks || row.tracks || []).slice().sort(function (p, q) { return p.position - q.position; });
var links = Array.isArray(row.links) ? row.links.slice() : [];
if (!links.length) {
if (row.soundcloud_url) links.push({ label: 'SoundCloud', url: row.soundcloud_url });
if (row.mixcloud_url) links.push({ label: 'Mixcloud', url: row.mixcloud_url });
if (row.youtube_url) links.push({ label: 'YouTube', url: row.youtube_url });
}
var sets = [];
tracks.forEach(function (t) {
if (https(t.url) && isSoundCloud(t.url)) sets.push({ title: t.title, url: t.url });
else if (https(t.url)) links.push({ label: one(t.title).slice(0, L.linkLabel), url: t.url });
});
var t = tidy({
slug: row.slug, name: row.name, first: row.first_name, tag: row.sound, genres: row.genres, home: row.home_city,
img: pic(row.cover_path), alt: row.cover_alt, pos: row.cover_pos, bio: row.bio, sets: sets,
find: row.find_url ? { label: row.find_label, url: row.find_url } : null, links: links,
rider: linesOf(row), riderNote: row.rider_note, riderLink: row.rider_link,
look: { bg: row.look_bg, image: pic(row.look_image), record: pic(row.look_record), sign: row.look_sign },
status: row.status === 'live' ? 'live' : 'draft'
});
return t.ok && t.artist.slug ? t.artist : null;
}
function fail(code, more) { var o = { ok: false, code: code }; if (more) for (var k in more) o[k] = more[k]; return o; }
function isQuota(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }
function safe(p) {
return Promise.resolve(p).then(function (r) { return r; }, function (e) {
return fail(e && e.bookd ? e.bookd : isQuota(e) ? 'full' : 'unknown');
});
}
function oops(code) { var e = new Error(code); e.bookd = code; return e; }
function run(fn) { try { return safe(fn()); } catch (e) { return Promise.resolve(fail(e && e.bookd ? e.bookd : 'unknown')); } }
function within(p, ms, code) {
return new Promise(function (resolve, reject) {
var t = setTimeout(function () { reject(oops(code)); }, ms);
p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
});
}
var HANDED = {};
var URLS = {};
function box() { try { return W.localStorage || null; } catch (e) { return null; } }
function readStore() {
var st = box(), raw;
if (!st) return { ok: false, code: 'blocked', artists: {} };
try { raw = st.getItem(KEY); } catch (e) { return { ok: false, code: 'blocked', artists: {} }; }
if (!raw) return { ok: true, artists: {} };
try {
var d = JSON.parse(raw);
if (d && d.v === 1 && d.artists && typeof d.artists === 'object') return { ok: true, artists: d.artists };
} catch (e) {}
try { st.setItem(KEY + '.damaged', raw); st.removeItem(KEY); } catch (e) {}
return { ok: true, artists: {} };
}
var dbP = null;
function idb() {
if (dbP) return dbP;
var p = within(new Promise(function (resolve, reject) {
var f = null, rq;
try { f = W.indexedDB; } catch (e) {}
if (!f) return reject(oops('blocked'));
try { rq = f.open(PHOTO_DB, 1); } catch (e) { return reject(oops('blocked')); }
rq.onupgradeneeded = function () { if (!rq.result.objectStoreNames.contains(PHOTO_STORE)) rq.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' }); };
rq.onsuccess = function () { var d = rq.result; d.onversionchange = function () { try { d.close(); } catch (e) {} dbP = null; }; resolve(d); };
rq.onerror = function () { reject(oops(isQuota(rq.error) ? 'full' : 'blocked')); };
rq.onblocked = function () { reject(oops('blocked')); };
}), 5000, 'blocked');
dbP = p;
p.then(null, function () { if (dbP === p) dbP = null; });
return p;
}
function photos(mode, run) {
return idb().then(function (d) {
return new Promise(function (resolve, reject) {
var tx, rq = null;
try { tx = d.transaction(PHOTO_STORE, mode); rq = run(tx.objectStore(PHOTO_STORE)); }
catch (e) { return reject(oops(isQuota(e) ? 'full' : 'blocked')); }
tx.oncomplete = function () { resolve(rq ? rq.result : undefined); };
tx.onabort = tx.onerror = function () { reject(oops(isQuota(tx.error) || isQuota(rq && rq.error) ? 'full' : 'blocked')); };
});
});
}
function photoGet(id) { return photos('readonly', function (s) { return s.get(id); }); }
function urlOf(id, rec) {
if (URLS[id]) return URLS[id];
try { URLS[id] = W.URL.createObjectURL(new W.Blob([rec.bytes], { type: rec.type || 'image/jpeg' })); } catch (e) { return ''; }
HANDED[URLS[id]] = 'device:' + id;
return URLS[id];
}
function showDevice(ref) {
var m = /^device:([0-9a-f]{32})$/.exec(ref || '');
if (!m) return Promise.resolve(ref || '');
if (URLS[m[1]]) return Promise.resolve(URLS[m[1]]);
return photoGet(m[1]).then(function (rec) { return rec && rec.bytes ? urlOf(m[1], rec) : ''; }, function () { return ''; });
}
function storedPic(v) { return /^device:[0-9a-f]{32}$/.test(v) || /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) || /^\/_blob\/[0-9a-f]{32}$/.test(v) ? v : ''; }
function fromStore(r) {
var t = r && r.a && typeof r.a === 'object' ? tidy(r.a) : null;
if (!t || !t.ok) return null;
t.artist.img = storedPic(t.artist.img); t.artist.look.image = storedPic(t.artist.look.image); t.artist.look.record = storedPic(t.artist.look.record);
return t;
}
function merged(fixed) {
var fx = fixedList(fixed), st = readStore(), recs = st.artists, out = [], seen = {}, stale = [];
fx.forEach(function (f) {
seen[f.slug] = 1;
var r = recs[f.slug], t = fromStore(r);
if (t) {
t.artist.slug = f.slug;
if (canon(t.artist) !== canon(f)) {
var c = plain(t.artist); c.status = f.status;
out.push({ a: t.artist, fixed: f, origin: 'builtin', at: r.at || '',
changed: canon(c) === canon(f) && t.artist.status === 'draft' ? 'hidden' : 'edited',
siteChanged: !!(r.base && r.base !== print(f)) });
return;
}
stale.push(f.slug);
} else if (r) stale.push(f.slug);
out.push({ a: f, fixed: f, origin: 'builtin', changed: '', siteChanged: false, at: '' });
});
for (var slug in recs) {
if (seen[slug]) continue;
var r2 = recs[slug], t2 = fromStore(r2);
if (!t2 || !SLUG.test(slug)) continue;
t2.artist.slug = slug;
out.push({ a: t2.artist, fixed: null, origin: 'device', changed: 'added', siteChanged: false, at: r2.at || '' });
}
out.sort(function (p, q) { return byName(p.a, q.a); });
return { ok: st.ok, code: st.code, items: out, recs: recs, stale: stale };
}
function shown(item) {
var a = plain(item.a), f = item.fixed, lost = [];
return Promise.all([showDevice(a.img), showDevice(a.look.image), showDevice(a.look.record)]).then(function (u) {
if (a.img && !u[0]) { lost.push('img'); u[0] = f ? f.img : ''; }
if (a.look.image && !u[1]) { lost.push('look.image'); u[1] = f ? f.look.image : ''; }
if (a.look.record && !u[2]) { lost.push('look.record'); u[2] = f ? f.look.record : ''; }
a.img = u[0]; a.look.image = u[1]; a.look.record = u[2];
return { artist: a, lost: lost };
});
}
function hasChanges(m) { for (var i = 0; i < m.items.length; i++) if (m.items[i].changed) return true; return false; }
function deviceList(fixed) {
var m = merged(fixed);
if (!hasChanges(m)) return Promise.resolve({ ok: true, mode: MODE, source: 'fixed', artists: noDates(live(m.items.map(function (i) { return i.a; }))) });
return Promise.all(m.items.filter(function (i) { return i.a.status === 'live'; }).map(shown)).then(function (list) {
return { ok: true, mode: MODE, source: 'device', artists: noDates(list.map(function (s) { return s.artist; })) };
});
}
var sb = LIVE ? B._.sb : null;
var PUBLIC = 'name, slug, first_name, sound, genres, home_city, bio, cover_path, cover_alt, cover_pos, find_label, find_url, links, ' +
'rider_lines, rider_note, rider_link, plays_on, room_needs, table_needs, arrival, hospitality, soundcloud_url, mixcloud_url, youtube_url, ' +
'look_bg, look_image, look_record, look_sign, status, open_to_requests, dj_tracks(position, title, url), tour_dates(city, starts_on, ends_on)';
function showDb(path) {
if (!path) return '';
if (/^assets\//.test(path)) return path;
if (/^https:\/\//.test(path)) return '';
var url = '';
try { url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || ''; } catch (e) {}
if (url) HANDED[url] = path;
return url;
}
function err(r) { return B._.bad(r); }
function datesOf(row) {
var t = new Date(), today = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2), out = [];
(row.tour_dates || row.dates || []).forEach(function (d) {
var from = str(d.starts_on), to = str(d.ends_on || d.starts_on), city = one(d.city).slice(0, 120);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !city || to < today) return;
out.push({ city: city, from: from, to: to });
});
return out.sort(function (p, q) { return p.from < q.from ? -1 : p.from > q.from ? 1 : 0; }).slice(0, 60);
}
function dbList() {
return within(sb.from('djs').select(PUBLIC).eq('status', 'live').order('name').then(function (r) {
var b = err(r); if (b) return b;
var list = [];
(r.data || []).forEach(function (d) { var a = fromRow(d, showDb); if (a) { a.dates = datesOf(d); a.asks = d.open_to_requests === true; list.push(a); } });
return { ok: true, artists: list.sort(byName) };
}), 8000, 'offline');
}
function fallback(fixed, why) { return { ok: true, mode: MODE, source: 'fallback', why: why, artists: noDates(live(fixedList(fixed))) }; }
var A = B.artists = {
version: 1,
mode: MODE,
genres: GENRES.slice(),
backgrounds: BGS.slice(),
limits: L,
file: FILE,
storage: { prefix: PREFIX, text: KEY, photos: PHOTO_DB + ' / ' + PHOTO_STORE },
list: function (fixed) {
if (!LIVE) return run(function () { return deviceList(fixed); }).then(function (r) { return r.ok ? r : { ok: true, mode: MODE, source: 'fixed', artists: noDates(live(fixedList(fixed))) }; });
return run(dbList).then(function (r) { return r.ok ? { ok: true, mode: MODE, source: 'database', artists: r.artists } : fallback(fixed, r.code); });
},
get: function (slug, fixed) {
slug = str(slug).toLowerCase();
return A.list(fixed).then(function (r) {
var hit = null;
r.artists.forEach(function (a) { if (a.slug === slug) hit = a; });
return { ok: true, mode: r.mode, source: r.source, artist: hit };
});
},
peek: function (fixed) {
var base = noDates(live(fixedList(fixed)));
if (LIVE) return { final: false, artists: base };
try { return { final: !hasChanges(merged(fixed)), artists: base }; } catch (e) { return { final: false, artists: base }; }
},
_: { tidy: tidy, fixedList: fixedList, homeKey: homeKey, https: https, isSoundCloud: isSoundCloud,
picId: picId, canon: canon, fromRow: fromRow, byName: byName, PUBLIC: PUBLIC, NEEDED: NEEDED,
W: W, KEY: KEY, str: str, plain: plain, print: print, fail: fail, isQuota: isQuota, safe: safe, oops: oops, run: run,
HANDED: HANDED, box: box, photos: photos, photoGet: photoGet, urlOf: urlOf, merged: merged, shown: shown,
showDb: showDb, datesOf: datesOf }
};
})();
(function () {
var B = window.BOOKD; if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
B.me = {
city: function () {
return _.guard(sb.auth.getSession().then(function (r) {
var u = r && r.data && r.data.session ? r.data.session.user : null;
if (!u) return { ok: true, city: '' };
return sb.from('profiles').select('city').eq('id', u.id).maybeSingle().then(function (q) {
return _.bad(q) || { ok: true, city: (q.data && q.data.city) || '' };
});
}));
}
};
})();
(function () {
var B = window.BOOKD; if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
function whole(v) {
var m = /(\d[\d.,]*)\s*(k\b)?/i.exec(String(v == null ? '' : v));
if (!m) return null;
var t = m[1].replace(/[.,]+$/, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
var n = parseFloat(t);
if (!isFinite(n)) return null;
n = Math.round(m[2] ? n * 1000 : n);
return n >= 1 && n <= 10000000 ? n : null;
}
B.requests = {
whole: whole,
send: function (o) {
o = o || {};
return _.guard(sb.auth.getSession().then(function (s) {
var u = s && s.data && s.data.session ? s.data.session.user : null;
if (!u) return { ok: false, code: 'signedOut' };
var date = String(o.date || '');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !_.clip(o.where, 120) || !_.clip(o.slug, 60)) return { ok: false, code: 'invalid' };
return sb.from('booking_requests').insert({
dj_slug: _.clip(o.slug, 60).toLowerCase(), party_date: date, place: _.clip(o.where, 120),
guests: whole(o.guests), budget: whole(o.budget), note: _.clip(o.note, 2000)
}).select('id').single().then(function (r) {
if (!r.error) return { ok: true, id: r.data.id };
var c = String(r.error.code || ''), m = String(r.error.message || '');
if (c === '23505') return { ok: false, code: 'twice' };
if (c === 'BK409') return { ok: false, code: 'notYet' };
if (c === '42501' && /regular account/i.test(m)) return { ok: false, code: 'notHost' };
return _.bad(r);
});
}));
}
};
})();
(function () {
var B = window.BOOKD; if (!B || !B.ready) return;
var _ = B._, sb = _.sb;
B.waitlist = {
join: function (o) {
return _.guard(sb.rpc('join_waitlist', { p_email: _.clip(o && o.email, 200), p_who: o && o.who === 'dj' ? 'dj' : 'host' }).then(function (r) {
return _.bad(r) || { ok: true };
}));
}
};
})();