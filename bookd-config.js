// BOOKD's connection to its Supabase project. Both values are public by design
// (they ship to every browser); the database rules are what keep data safe.
// While these are empty the site runs as the design preview: nothing is saved or sent.
// NEVER put the service role key in this file.
window.BOOKD_CONFIG = {
  supabaseUrl: 'https://nmkfpsdmdibmrffpdjdv.supabase.co',
  supabaseAnonKey: 'sb_publishable_ylGCblUBE_zUlospoV_wVg_J7FIHAJd',
  // The made-up logged-in screens (Kaytran's inbox, the dashboards, requests, cancel, build a profile).
  // false: the site is built without them and the Log in page says accounts are not open yet.
  // true:  they are built too, for showing the designs. `npm run build:demo` does that without touching this line.
  demo: false
};
