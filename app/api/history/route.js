import { supabase } from '../../../lib/supabase'

// GET /api/history?code=AIDE-XXXX
export async function GET(req) {
  const code = new URL(req.url).searchParams.get('code')

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', code)
    .eq('active', true)
    .single()

  if (!org) return Response.json({ messages: [] })

  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: true })
    .limit(50)

  return Response.json({ messages: messages || [] })
}

// DELETE /api/history?code=AIDE-XXXX — очистить чат
export async function DELETE(req) {
  const code = new URL(req.url).searchParams.get('code')

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', code)
    .single()

  if (!org) return Response.json({ error: 'Не найдено' }, { status: 404 })

  await supabase.from('messages').delete().eq('org_id', org.id)
  return Response.json({ ok: true })
}
