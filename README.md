# BOOKD

DJs for private parties. This is the built site behind https://bookdplatform.com, published with GitHub Pages.
Nothing here is edited by hand: every file is written by the build in the project's source.

- `index.html` the homepage
- `roster.html` the roster, and a page for each artist (`julian-gjaci.html`, `kozlow.html`, `schloss.html`).
  `artist.html` is the same page for an artist added since the last build
- `artists.html` for DJs who want to join
- `login.html` log in and sign up, `account.html` a person's own account, `admin.html` the dashboard
- `waitlist.html` the waitlist, and `enter.html` the code page while the site is in closed beta
- `terms.html` terms and privacy, `contact.html` the contact form, `404.html` page not found
- `assets/` the photos and videos
- `bookd-config.js`, `bookd-api.js`, `bookd-manage.js` and `bookd-supabase.js` the connection to the database.
  The key in `bookd-config.js` is the public one, made to be in a browser. The database's own rules decide who can
  read and change what
- `dc-runtime.js` draws each page
