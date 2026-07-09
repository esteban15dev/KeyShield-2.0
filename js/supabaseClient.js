// js/supabaseClient.js
// Cliente global de Supabase v2 importado desde CDN en index.html

const SUPABASE_URL = 'https://kadbhmmwhxsmeiekibwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hZIk_TDQD_nV8hKoVm5dGw_Y4ZaJKcx';

const { createClient } = supabase;
window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
