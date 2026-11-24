// Supabase project for accounts and synced chips.
// Both values are public by design (the anon key only allows what the database rules in supabase/schema.sql allow).
// Leave them empty to run the site in guest-only mode.
window.OL_CONFIG = {
  supabaseUrl: 'https://ihjinpqtnptdflqmlajs.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamlucHF0bnB0ZGZscW1sYWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0ODI0OTIsImV4cCI6MjExMTA1ODQ5Mn0.C23nTwbwtmKXnEAtMLAZFk-9IC3kS70Y5BEA4lty9cI',
  // the coin pusher's owner code: put the SHA-256 hash of your code here (never the code itself). Empty = no code.
  pusherCodeHash: '635aee9290921b53afa822c5a126989c664d9f7c752df66d04c72d8b5381e105',
};
