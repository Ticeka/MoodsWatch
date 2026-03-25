Deploy this function with:

```bash
supabase functions deploy pornhwadb-proxy
supabase secrets set PORNHWADB_API_KEY=your_key_here
```

The function verifies app users inside the handler and only allows callers whose `user_profiles.role` is `admin` or `editor`.
Make sure the project config keeps JWT gateway verification disabled for this function via `supabase/config.toml`.
