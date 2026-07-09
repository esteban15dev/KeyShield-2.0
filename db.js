const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('¡Atención! SUPABASE_URL o SUPABASE_KEY no están definidos en las variables de entorno.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
