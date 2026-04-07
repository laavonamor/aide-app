import { supabase } from '../../../lib/supabase'

export async function POST(req) {
  const { code } = await req.json()
  if (!code) return Response.json({ error: 'Введите код' }, { status: 400 })

  if (code === process.env.ADMIN_SECRET_CODE) {
    return Response.json({ role: 'admin' })
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, code')
    .eq('code', code)
    .eq('active', true)
    .single()

  if (error || !org) {
    return Response.json({ error: 'Неверный или отключённый код доступа' }, { status: 403 })
  }

  return Response.json({ role: 'assistant', orgCode: org.code, orgName: org.name })
}
