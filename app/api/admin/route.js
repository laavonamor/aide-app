import { supabase } from '../../../lib/supabase'

function genCode() {
  return 'AIDE-' + Math.random().toString(36).slice(2, 6).toUpperCase()
}

function checkAdmin(secret) {
  return secret === process.env.ADMIN_SECRET_CODE
}

// GET /api/admin?secret=AIDE_ADMIN — список организаций
// GET /api/admin?secret=AIDE_ADMIN&org_id=xxx — данные по организации
export async function GET(req) {
  const url    = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const orgId  = url.searchParams.get('org_id')

  if (!checkAdmin(secret)) {
    return Response.json({ error: 'Нет доступа' }, { status: 401 })
  }

  // Данные конкретной организации
  if (orgId) {
    const [{ data: profile }, { data: msgs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('org_id', orgId).single(),
      supabase.from('messages').select('role, content, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(10),
    ])
    return Response.json({ profile: profile || {}, messages: msgs || [] })
  }

  // Список всех организаций
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, code, active, created_at')
    .order('created_at', { ascending: false })

  // Статистика по каждой организации
  const withStats = await Promise.all(
    (orgs || []).map(async org => {
      const [{ count }, { data: p }] = await Promise.all([
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('profiles').select('name').eq('org_id', org.id).single(),
      ])
      return { ...org, msg_count: count || 0, profile_filled: !!p?.name }
    })
  )

  return Response.json({ orgs: withStats })
}

// POST /api/admin
export async function POST(req) {
  const body = await req.json()
  const { secret, action } = body

  if (!checkAdmin(secret)) {
    return Response.json({ error: 'Нет доступа' }, { status: 401 })
  }

  // Создать организацию
  if (action === 'create') {
    const { name } = body
    const code = genCode()
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, code })
      .select()
      .single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ org: data })
  }

  // Включить / отключить
  if (action === 'toggle') {
    const { orgId } = body
    const { data: org } = await supabase.from('organizations').select('active').eq('id', orgId).single()
    await supabase.from('organizations').update({ active: !org.active }).eq('id', orgId)
    return Response.json({ ok: true })
  }

  // Удалить
  if (action === 'delete') {
    const { orgId } = body
    await supabase.from('organizations').delete().eq('id', orgId)
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Неизвестное действие' }, { status: 400 })
}
