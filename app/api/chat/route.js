import { supabase } from '../../../lib/supabase'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const TODAY = new Date().toISOString().split('T')[0]

let tokenCache = { token: null, expiresAt: 0 }

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token


  const res = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${process.env.GIGACHAT_AUTH_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': crypto.randomUUID(),
    },
    body: 'scope=GIGACHAT_API_PERS',
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GigaChat auth failed ${res.status}: ${txt}`)
  }

  const data = await res.json()
  tokenCache = { token: data.access_token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return tokenCache.token
}

async function callGigaChat(systemPrompt, messages) {
  const token = await getToken()

  const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      model: 'GigaChat-Pro',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1200,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GigaChat error ${res.status}: ${txt}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || '—'
}

function buildSystemPrompt(profile, orgName) {
  const FIELDS = ['name','allergies','diet','hotels','flights','schedule','contacts','notes']
  const LABELS = {
    name:'Имя и должность', allergies:'Аллергии', diet:'Питание',
    hotels:'Отели', flights:'Перелёты', schedule:'Расписание',
    contacts:'Контакты', notes:'Заметки',
  }
  const lines = FIELDS
    .map(k => profile?.[k] ? `• ${LABELS[k]}: ${profile[k]}` : null)
    .filter(Boolean).join('\n')

  return `Ты — ИИ-ассистент для персонального помощника руководителя.
Организация: ${orgName || '—'}
Сегодня: ${TODAY}

ПРОФИЛЬ РУКОВОДИТЕЛЯ:
${lines || '⚠️ Профиль не заполнен — напомни пользователю его заполнить.'}

ПРАВИЛА:
- Всегда учитывай профиль при каждом ответе
- Аллергии — критично учитывать при любых рекомендациях
- Отвечай по-русски, кратко и конкретно
- Давай реальные варианты, не общие советы

КАЛЕНДАРЬ: Когда просят добавить встречу — добавь в конец ответа:
[СОБЫТИЕ: название="...", дата="YYYY-MM-DD", время="HH:MM", длительность=60, описание="..."]
Дата относительная ("завтра", "в пятницу") — вычисли от ${TODAY}.`
}

export async function POST(req) {
  try {
    const { orgCode, orgName, message } = await req.json()

    const { data: org } = await supabase
      .from('organizations').select('id')
      .eq('code', orgCode).eq('active', true).single()

    if (!org) return Response.json({ error: 'Организация не найдена' }, { status: 403 })

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('org_id', org.id).single()

    const { data: history } = await supabase
      .from('messages').select('role, content')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })
      .limit(20)

    const messages = [...(history || []), { role: 'user', content: message }]

    await supabase.from('messages').insert({ org_id: org.id, role: 'user', content: message })

    const reply = await callGigaChat(buildSystemPrompt(profile, orgName), messages)

    await supabase.from('messages').insert({ org_id: org.id, role: 'assistant', content: reply })

    return Response.json({ reply })
  } catch (e) {
    console.error('Chat error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}