import { supabase } from '../../../lib/supabase'
import https from 'https'

const TODAY = new Date().toISOString().split('T')[0]

// ─── Токен GigaChat (кэш на 25 минут) ────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 }

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const credentials = Buffer.from(
    `${process.env.GIGACHAT_CLIENT_ID}:${process.env.GIGACHAT_CLIENT_SECRET}`
  ).toString('base64')

  const agent = new https.Agent({ rejectUnauthorized: false })

  const res = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'RqUID': crypto.randomUUID(),
    },
    body: 'scope=GIGACHAT_API_PERS',
    agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GigaChat auth failed ${res.status}: ${txt}`)
  }

  const data = await res.json()
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + 25 * 60 * 1000,
  }
  return tokenCache.token
}

// ─── Вызов GigaChat ───────────────────────────────────────────────────────────
async function callGigaChat(systemPrompt, messages) {
  const token = await getToken()
  const agent = new https.Agent({ rejectUnauthorized: false })

  const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
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
    agent,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GigaChat error ${res.status}: ${txt}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || '—'
}

// ─── Системный промпт ─────────────────────────────────────────────────────────
function buildSystemPrompt(profile, orgName) {
  const FIELDS = ['name', 'allergies', 'diet', 'hotels', 'flights', 'schedule', 'contacts', 'notes']
  const LABELS = {
    name: 'Имя и должность',
    allergies: 'Аллергии',
    diet: 'Питание',
    hotels: 'Отели',
    flights: 'Перелёты',
    schedule: 'Расписание',
    contacts: 'Контакты',
    notes: 'Заметки',
  }

  const lines = FIELDS
    .map(k => profile?.[k] ? `• ${LABELS[k]}: ${profile[k]}` : null)
    .filter(Boolean)
    .join('\n')

  return `Ты — ИИ-ассистент для персонального помощника руководителя.
Организация: ${orgName || '—'}
Сегодня: ${TODAY}

ПРОФИЛЬ РУКОВОДИТЕЛЯ:
${lines || '⚠️ Профиль не заполнен — напомни пользователю его заполнить.'}

ПРАВИЛА:
• Всегда учитывай профиль при каждом ответе
• Аллергии — критично учитывать при любых рекомендациях еды, отелей, ресторанов
• Отвечай по-русски, кратко и конкретно
• Давай реальные варианты, не общие советы

КАЛЕНДАРЬ: Когда просят добавить встречу / событие / звонок — добавь в самый конец ответа блок ТОЧНО в таком формате (ничего лишнего):
[СОБЫТИЕ: название="...", дата="YYYY-MM-DD", время="HH:MM", длительность=60, описание="..."]
Дата относительная ("завтра", "в пятницу") — вычисли от сегодняшней даты ${TODAY}.`
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { orgCode, orgName, message } = await req.json()

    // Найти организацию
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('code', orgCode)
      .eq('active', true)
      .single()

    if (!org) return Response.json({ error: 'Организация не найдена' }, { status: 403 })

    // Загрузить профиль руководителя
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', org.id)
      .single()

    // Загрузить историю (последние 20 сообщений)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })
      .limit(20)

    const messages = [...(history || []), { role: 'user', content: message }]

    // Сохранить сообщение пользователя
    await supabase.from('messages').insert({ org_id: org.id, role: 'user', content: message })

    // Вызвать GigaChat
    const reply = await callGigaChat(buildSystemPrompt(profile, orgName), messages)

    // Сохранить ответ
    await supabase.from('messages').insert({ org_id: org.id, role: 'assistant', content: reply })

    return Response.json({ reply })
  } catch (e) {
    console.error('Chat error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
