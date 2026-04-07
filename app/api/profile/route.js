import { supabase } from '../../../lib/supabase'

// GET /api/profile?code=AIDE-XXXX
export async function GET(req) {
  const code = new URL(req.url).searchParams.get('code')

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', code)
    .single()

  if (!org) return Response.json({ profile: {} })

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', org.id)
    .single()

  return Response.json({ profile: profile || {} })
}

// POST /api/profile
export async function POST(req) {
  const { code, profile } = await req.json()

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', code)
    .single()

  if (!org) return Response.json({ error: 'Не найдено' }, { status: 404 })

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { org_id: org.id, ...profile, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    )

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
