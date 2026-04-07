'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const THEMES = {
  dark: {
    bg:'#0c0c10', card:'#13131a', input:'#1a1a24', border:'#252530',
    text:'#e2e0db', muted:'#5a5868', faint:'#252530',
    gold:'#c8a84b', green:'#4caf82', red:'#cf6679',
    shadow:'rgba(0,0,0,.55)', bannerBg:'#1a150a', bannerBorder:'#3a2e10', bannerText:'#a08030',
    toggle:'☀️',
  },
  light: {
    bg:'#f5f3ef', card:'#ffffff', input:'#f0ede8', border:'#e2ddd5',
    text:'#1c1a16', muted:'#8a8070', faint:'#e0dbd0',
    gold:'#9a6f28', green:'#2a7a52', red:'#b04050',
    shadow:'rgba(0,0,0,.10)', bannerBg:'#fff8e8', bannerBorder:'#e8d898', bannerText:'#8a6010',
    toggle:'🌙',
  }
}

const QUICK_ACTIONS = [
  { id:'hotel',    icon:'🏨', label:'Отель',    prompt:'Подбери отель для командировки руководителя. Уточни: город и даты.' },
  { id:'email',    icon:'✉️', label:'Письмо',   prompt:'Напиши деловое письмо от имени руководителя. Кому и о чём?' },
  { id:'minutes',  icon:'📋', label:'Протокол', prompt:'Оформи протокол встречи. Опиши что обсуждалось.' },
  { id:'trip',     icon:'✈️', label:'Поездка',  prompt:'Спланируй командировку. Куда и на какие даты?' },
  { id:'gift',     icon:'🎁', label:'Подарок',  prompt:'Подбери подарок. Для кого и какой повод?' },
  { id:'research', icon:'🔍', label:'Ресёрч',   prompt:'Проведи исследование по теме:' },
  { id:'calendar', icon:'📅', label:'Встреча',  prompt:'Добавь встречу в календарь. Название, дата и время?' },
]

const PROFILE_FIELDS = [
  { key:'name',      label:'Имя и должность',          placeholder:'Иван Петров, CEO' },
  { key:'allergies', label:'Аллергии',                  placeholder:'Морепродукты, орехи, лактоза' },
  { key:'diet',      label:'Питание / диета',           placeholder:'Без глютена, вегетарианец...' },
  { key:'hotels',    label:'Предпочтения по отелям',    placeholder:'Marriott / Hyatt, 5★, высокий этаж' },
  { key:'flights',   label:'Предпочтения по перелётам', placeholder:'Бизнес-класс, место у окна, Emirates' },
  { key:'schedule',  label:'Расписание и ритм работы',  placeholder:'Встречи с 10:00, пятница без митингов' },
  { key:'contacts',  label:'Важные контакты',           placeholder:'Секретарь — Мария +7...' },
  { key:'notes',     label:'Заметки',                   placeholder:'ДР — 15 марта, не любит звонки без предупреждения' },
]

// ─── Calendar helpers ─────────────────────────────────────────────────────────
function parseCalEvent(text) {
  const m = text.match(/\[СОБЫТИЕ:\s*название="([^"]*)",\s*дата="([^"]*)",\s*время="([^"]*)",\s*длительность=(\d+),\s*описание="([^"]*)"\]/)
  if (!m) return null
  return { title:m[1], date:m[2], time:m[3], duration:parseInt(m[4])||60, description:m[5] }
}
function addMins(time, mins) {
  const [h,mn] = time.split(':').map(Number)
  const t = h*60+mn+mins
  return `${String(Math.floor(t/60)%24).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
}
function makeGoogleLink(ev) {
  const fmt = (d,t) => d.replace(/-/g,'')+'T'+t.replace(':','')+'00'
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${fmt(ev.date,ev.time)}/${fmt(ev.date,addMins(ev.time,ev.duration))}&details=${encodeURIComponent(ev.description)}`
}
function makeYandexLink(ev) {
  return `https://calendar.yandex.ru/event?title=${encodeURIComponent(ev.title)}&from=${encodeURIComponent(ev.date+'T'+ev.time+':00')}&to=${encodeURIComponent(ev.date+'T'+addMins(ev.time,ev.duration)+':00')}`
}
function stripCal(text) { return text.replace(/\[СОБЫТИЕ:[^\]]+\]/g,'').trim() }

// ─── Voice ────────────────────────────────────────────────────────────────────
function useVoice(onResult, onError) {
  const [listening, setL] = useState(false)
  const recRef = useRef(null)
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const start = useCallback(() => {
    if (!supported || listening) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new SR(); r.lang='ru-RU'; r.interimResults=false
    r.onstart  = () => setL(true)
    r.onend    = () => setL(false)
    r.onerror  = e => { setL(false); onError?.(e.error) }
    r.onresult = e => onResult(e.results[0][0].transcript)
    recRef.current = r; r.start()
  }, [supported, listening, onResult, onError])
  const stop = useCallback(() => recRef.current?.stop(), [])
  return { listening, start, stop, supported }
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Ошибка') }
  return res.json()
}

const GCS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif}
textarea,input{outline:none;-webkit-appearance:none}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{border-radius:4px;background:#3a3a4a}
@keyframes pdot{0%,100%{opacity:.25;transform:scale(.65)}50%{opacity:1;transform:scale(1)}}
@keyframes fin{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
.fin{animation:fin .22s ease}
`

// ─── Login ────────────────────────────────────────────────────────────────────
function Login({ onLogin, T }) {
  const [code, setCode] = useState('')
  const [err, setErr]   = useState('')
  const [loading, setL] = useState(false)

  const go = async () => {
    if (!code.trim()) { setErr('Введите код'); return }
    setL(true); setErr('')
    try { const d = await api('login', { body: { code: code.trim().toUpperCase() } }); onLogin(d) }
    catch(e) { setErr(e.message) }
    setL(false)
  }

  return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:360,padding:'44px 36px',background:T.card,border:`1px solid ${T.border}`,borderRadius:18,boxShadow:`0 24px 70px ${T.shadow}`}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:40,color:T.gold,letterSpacing:'-1px'}}>AIDE</div>
          <div style={{color:T.muted,fontSize:13,marginTop:7,lineHeight:1.55}}>ИИ-ассистент для помощников руководителей</div>
        </div>
        <input value={code} onChange={e=>{setCode(e.target.value);setErr('')}} onKeyDown={e=>e.key==='Enter'&&go()}
          placeholder='Код доступа' autoCapitalize='characters'
          style={{width:'100%',padding:'13px 16px',background:T.input,border:`1px solid ${err?T.red:T.border}`,borderRadius:10,color:T.text,fontSize:15,letterSpacing:'3px',fontFamily:'monospace',marginBottom:err?'8px':'14px'}}/>
        {err && <div style={{color:T.red,fontSize:12,marginBottom:10}}>{err}</div>}
        <button onClick={go} disabled={loading}
          style={{width:'100%',padding:'13px',background:T.gold,border:'none',borderRadius:10,color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer',opacity:loading?.7:1}}>
          {loading?'Проверка...':'Войти →'}
        </button>
      </div>
    </div>
  )
}

// ─── CalCard ──────────────────────────────────────────────────────────────────
function CalCard({ event, T }) {
  return (
    <div style={{marginTop:10,padding:'12px 16px',background:T.bannerBg,border:`1px solid ${T.bannerBorder}`,borderRadius:10}}>
      <div style={{fontSize:13,fontWeight:600,color:T.gold,marginBottom:6}}>📅 Событие готово</div>
      <div style={{fontSize:13,color:T.text,marginBottom:10}}>
        <b>{event.title}</b> · {event.date} в {event.time} ({event.duration} мин)
        {event.description && <div style={{color:T.muted,fontSize:12,marginTop:3}}>{event.description}</div>}
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <a href={makeGoogleLink(event)} target='_blank' rel='noreferrer'
          style={{padding:'7px 14px',background:'#1a73e8',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,textDecoration:'none'}}>
          🗓 Google Calendar
        </a>
        <a href={makeYandexLink(event)} target='_blank' rel='noreferrer'
          style={{padding:'7px 14px',background:'#fc3f1d',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,textDecoration:'none'}}>
          📆 Яндекс Календарь
        </a>
      </div>
    </div>
  )
}

// ─── Admin ────────────────────────────────────────────────────────────────────
function Admin({ T, toggleTheme }) {
  const [orgs, setOrgs]     = useState([])
  const [loading, setL]     = useState(true)
  const [newName, setNN]    = useState('')
  const [showAdd, setSA]    = useState(false)
  const [creating, setC]    = useState(false)
  const [copied, setCopied] = useState(null)
  const [modal, setModal]   = useState(null)
  const [mData, setMData]   = useState(null)
  const [tab, setTab]       = useState('clients')

  const loadOrgs = async () => {
    setL(true)
    try { const d = await api('admin?secret=AIDE_ADMIN'); setOrgs(d.orgs || []) }
    catch(e) { alert(e.message) }
    setL(false)
  }

  useEffect(() => { loadOrgs() }, [])

  const addOrg = async () => {
    if (!newName.trim()) return
    setC(true)
    try { await api('admin', { body:{ secret:'AIDE_ADMIN', action:'create', name:newName.trim() } }); setNN(''); setSA(false); loadOrgs() }
    catch(e) { alert(e.message) }
    setC(false)
  }

  const toggle = async id => { await api('admin', { body:{ secret:'AIDE_ADMIN', action:'toggle', orgId:id } }); loadOrgs() }
  const del    = async id => { if(!confirm('Удалить клиента?'))return; await api('admin', { body:{ secret:'AIDE_ADMIN', action:'delete', orgId:id } }); loadOrgs() }

  const openModal = async org => {
    setModal(org); setMData(null)
    const d = await api(`admin?secret=AIDE_ADMIN&org_id=${org.id}`)
    setMData(d)
  }

  const copy = code => {
    navigator.clipboard?.writeText(code)
    setCopied(code); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{minHeight:'100vh',background:T.bg,color:T.text}}>
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:'14px 24px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:T.gold}}>AIDE</span>
        <span style={{color:T.muted,fontSize:13}}>· Администратор</span>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {[['clients','Клиенты'],['stats','Активность']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',background:tab===t?T.gold:'transparent',border:`1px solid ${tab===t?T.gold:T.faint}`,borderRadius:6,color:tab===t?'#fff':T.muted,fontSize:13,cursor:'pointer',fontWeight:tab===t?600:400}}>{l}</button>
          ))}
          <button onClick={toggleTheme} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,fontSize:15,cursor:'pointer'}}>{T.toggle}</button>
        </div>
      </div>

      <div style={{padding:'28px 24px',maxWidth:860,margin:'0 auto'}}>
        {tab==='clients' && <>
          <div style={{display:'flex',alignItems:'center',marginBottom:22,flexWrap:'wrap',gap:12}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24}}>Организации</div>
            <button onClick={()=>setSA(!showAdd)} style={{marginLeft:'auto',padding:'9px 20px',background:T.gold,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Новый клиент</button>
          </div>

          {showAdd && (
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:16,marginBottom:16,display:'flex',gap:10,flexWrap:'wrap'}}>
              <input value={newName} onChange={e=>setNN(e.target.value)} placeholder='Название или имя клиента' onKeyDown={e=>e.key==='Enter'&&addOrg()}
                style={{flex:1,minWidth:200,padding:'10px 14px',background:T.input,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14}}/>
              <button onClick={addOrg} disabled={creating} style={{padding:'10px 20px',background:T.gold,border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>{creating?'...':'Создать'}</button>
              <button onClick={()=>setSA(false)} style={{padding:'10px 14px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:8,color:T.muted,fontSize:13,cursor:'pointer'}}>✕</button>
            </div>
          )}

          {loading ? (
            <div style={{textAlign:'center',padding:'60px 0',color:T.muted}}>Загрузка...</div>
          ) : orgs.length===0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:T.faint}}>
              <div style={{fontSize:40,marginBottom:10}}>🏢</div>Добавьте первого клиента
            </div>
          ) : orgs.map(org=>(
            <div key={org.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontWeight:500}}>{org.name}</div>
                <div style={{color:T.muted,fontSize:11,marginTop:2}}>
                  {new Date(org.created_at).toLocaleDateString('ru-RU')} · {org.msg_count} сообщений · {org.profile_filled?'✓ профиль':'○ профиль не заполнен'}
                </div>
              </div>
              <code style={{background:T.input,padding:'6px 12px',borderRadius:6,color:T.gold,fontSize:13,letterSpacing:'2px'}}>{org.code}</code>
              <button onClick={()=>copy(org.code)} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,color:copied===org.code?T.green:T.muted,fontSize:12,cursor:'pointer'}}>{copied===org.code?'✓':'📋'}</button>
              <div style={{width:7,height:7,borderRadius:'50%',background:org.active?T.green:T.faint}}/>
              <button onClick={()=>openModal(org)} style={{padding:'6px 12px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,color:T.muted,fontSize:12,cursor:'pointer'}}>Данные</button>
              <button onClick={()=>toggle(org.id)} style={{padding:'6px 12px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,color:org.active?T.red:T.green,fontSize:12,cursor:'pointer'}}>{org.active?'Откл.':'Вкл.'}</button>
              <button onClick={()=>del(org.id)} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,color:T.faint,fontSize:12,cursor:'pointer'}}>✕</button>
            </div>
          ))}
        </>}

        {tab==='stats' && (
          <div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,marginBottom:20}}>Активность</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:14}}>
              {orgs.map(org=>(
                <div key={org.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:22}}>
                  <div style={{fontWeight:500,marginBottom:3,fontSize:14}}>{org.name}</div>
                  <div style={{color:T.muted,fontSize:11,marginBottom:14}}>{org.code}</div>
                  <div style={{fontSize:32,fontFamily:"'DM Serif Display',serif",color:T.gold}}>{org.msg_count}</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:8}}>сообщений</div>
                  <div style={{fontSize:12,color:org.profile_filled?T.green:T.faint}}>{org.profile_filled?'✓ Профиль заполнен':'○ Не заполнен'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div onClick={()=>setModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:28,width:'100%',maxWidth:560,maxHeight:'80vh',overflow:'auto'}}>
            <div style={{display:'flex',alignItems:'center',marginBottom:20}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,flex:1}}>{modal.name}</div>
              <button onClick={()=>setModal(null)} style={{background:'transparent',border:'none',color:T.muted,fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {!mData ? <div style={{color:T.muted}}>Загрузка...</div> : <>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,color:T.muted,textTransform:'uppercase',letterSpacing:'1px',marginBottom:10}}>Профиль руководителя</div>
                {mData.profile && PROFILE_FIELDS.some(f=>mData.profile[f.key]) ? (
                  <div style={{background:T.input,borderRadius:10,padding:'14px 18px'}}>
                    {PROFILE_FIELDS.filter(f=>mData.profile[f.key]).map(f=>(
                      <div key={f.key} style={{marginBottom:7,fontSize:13}}><span style={{color:T.muted}}>{f.label}: </span><span>{mData.profile[f.key]}</span></div>
                    ))}
                  </div>
                ) : <div style={{color:T.faint,fontSize:13}}>Не заполнен</div>}
              </div>
              <div>
                <div style={{fontSize:11,color:T.muted,textTransform:'uppercase',letterSpacing:'1px',marginBottom:10}}>Последние запросы</div>
                {(mData.messages||[]).filter(m=>m.role==='user').slice(0,6).map((m,i)=>(
                  <div key={i} style={{background:T.input,borderRadius:8,padding:'9px 13px',marginBottom:6,fontSize:13,color:T.muted,borderLeft:`2px solid ${T.gold}`}}>
                    {m.content.slice(0,110)}{m.content.length>110?'…':''}
                  </div>
                ))}
                {!(mData.messages||[]).some(m=>m.role==='user') && <div style={{color:T.faint,fontSize:13}}>Запросов нет</div>}
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Assistant ────────────────────────────────────────────────────────────────
function Assistant({ orgCode, orgName, T, toggleTheme }) {
  const [tab, setTab]      = useState('chat')
  const [msgs, setMsgs]    = useState([])
  const [input, setInput]  = useState('')
  const [loading, setL]    = useState(false)
  const [profile, setProf] = useState({})
  const [draft, setDraft]  = useState({})
  const [saved, setSaved]  = useState(false)
  const [initLoad, setIL]  = useState(true)
  const [voiceErr, setVE]  = useState('')
  const bottomRef          = useRef(null)

  useEffect(() => {
    Promise.all([api(`history?code=${orgCode}`), api(`profile?code=${orgCode}`)])
      .then(([h, p]) => {
        setMsgs(h.messages || [])
        const prof = p.profile || {}
        setProf(prof); setDraft(prof)
      })
      .finally(() => setIL(false))
  }, [orgCode])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, loading])

  const voice = useVoice(
    text  => { setInput(p => (p ? p+' ' : '')+text); setVE('') },
    err   => { setVE(err==='not-allowed'?'Нет доступа к микрофону':err==='no-speech'?'Речь не распознана':'Ошибка'); setTimeout(()=>setVE(''),3000) }
  )

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMsgs(prev => [...prev, { id:Date.now(), role:'user', content:msg }])
    setL(true)
    try {
      const data = await api('chat', { body:{ orgCode, orgName, message:msg } })
      const calEvent = parseCalEvent(data.reply)
      const clean    = stripCal(data.reply)
      setMsgs(prev => [...prev, { id:Date.now()+1, role:'assistant', content:clean, calEvent }])
    } catch(e) {
      setMsgs(prev => [...prev, { id:Date.now()+1, role:'assistant', content:`⚠️ ${e.message}` }])
    }
    setL(false)
  }

  const savePro = async () => {
    try { await api('profile', { body:{ code:orgCode, profile:draft } }); setProf(draft); setSaved(true); setTimeout(()=>setSaved(false),2500) }
    catch(e) { alert(e.message) }
  }

  const clearChat = async () => {
    await api(`history?code=${orgCode}`, { method:'DELETE' })
    setMsgs([])
  }

  if (initLoad) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',color:T.muted}}>
      Загрузка...
    </div>
  )

  return (
    <div style={{height:'100vh',background:T.bg,color:T.text,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:'12px 20px',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:T.gold}}>AIDE</span>
        <span style={{color:T.faint}}>·</span>
        <span style={{fontSize:13,color:T.muted,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{orgName}</span>
        <div style={{marginLeft:'auto',display:'flex',gap:5}}>
          {[['chat','💬 Чат'],['profile','👤 Профиль']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'6px 14px',background:tab===t?T.gold:'transparent',border:`1px solid ${tab===t?T.gold:T.faint}`,borderRadius:6,color:tab===t?'#fff':T.muted,fontSize:13,cursor:'pointer',fontWeight:tab===t?600:400}}>{l}</button>
          ))}
          <button onClick={toggleTheme} style={{padding:'6px 10px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:6,fontSize:14,cursor:'pointer'}}>{T.toggle}</button>
        </div>
      </div>

      {tab==='chat' && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
          {!profile.name && (
            <div style={{background:T.bannerBg,borderBottom:`1px solid ${T.bannerBorder}`,padding:'9px 20px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <span style={{color:T.gold}}>⚡</span>
              <span style={{fontSize:12,color:T.bannerText,flex:1}}>Заполните профиль руководителя — ответы станут персонализированными</span>
              <button onClick={()=>setTab('profile')} style={{padding:'4px 12px',background:'transparent',border:`1px solid ${T.gold}`,borderRadius:5,color:T.gold,fontSize:12,cursor:'pointer',flexShrink:0}}>Заполнить</button>
            </div>
          )}

          <div style={{flex:1,overflowY:'auto',padding:'20px',minHeight:0}}>
            {msgs.length===0 && (
              <div style={{textAlign:'center',paddingTop:28}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:40,color:T.faint,marginBottom:6}}>AIDE</div>
                <div style={{color:T.muted,fontSize:14,marginBottom:24}}>Выберите действие или напишите запрос</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center'}}>
                  {QUICK_ACTIONS.map(q=>(
                    <button key={q.id} onClick={()=>send(q.prompt)} style={{padding:'10px 18px',background:T.card,border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:16}}>{q.icon}</span><span>{q.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map(m=>(
              <div key={m.id} className='fin' style={{marginBottom:14,display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',alignItems:'flex-start'}}>
                {m.role==='assistant' && (
                  <div style={{width:26,height:26,borderRadius:'50%',background:T.input,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,marginRight:8,flexShrink:0,marginTop:3,color:T.gold}}>A</div>
                )}
                <div style={{maxWidth:'74%'}}>
                  <div style={{padding:'12px 16px',borderRadius:m.role==='user'?'14px 14px 2px 14px':'14px 14px 14px 2px',background:m.role==='user'?T.gold:T.card,color:m.role==='user'?'#fff':T.text,fontSize:14,lineHeight:1.65,border:m.role==='assistant'?`1px solid ${T.border}`:'none',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                    {m.content}
                  </div>
                  {m.calEvent && <CalCard event={m.calEvent} T={T}/>}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:'flex',alignItems:'center',gap:6,paddingLeft:34}}>
                {[0,.15,.3].map((d,i)=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:T.gold,animation:`pdot 1s ${d}s infinite`}}/>)}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {msgs.length>0 && (
            <div style={{padding:'4px 20px 6px',display:'flex',gap:7,flexWrap:'nowrap',overflowX:'auto',flexShrink:0,scrollbarWidth:'none'}}>
              {QUICK_ACTIONS.map(q=>(
                <button key={q.id} onClick={()=>send(q.prompt)} style={{padding:'4px 11px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:20,color:T.faint,fontSize:12,cursor:'pointer',flexShrink:0}}>{q.icon} {q.label}</button>
              ))}
              <button onClick={clearChat} style={{padding:'4px 10px',background:'transparent',border:`1px solid ${T.faint}`,borderRadius:20,color:T.faint,fontSize:12,cursor:'pointer',flexShrink:0,marginLeft:'auto'}}>🗑</button>
            </div>
          )}

          {voiceErr && <div style={{padding:'4px 20px',fontSize:12,color:T.red,flexShrink:0}}>{voiceErr}</div>}

          <div style={{padding:'10px 20px 18px',display:'flex',gap:8,flexShrink:0,alignItems:'flex-end'}}>
            <div style={{flex:1,position:'relative'}}>
              <textarea value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }}
                placeholder={voice.listening?'Слушаю...':'Напишите задачу...  (Enter — отправить)'}
                rows={2}
                style={{width:'100%',padding:'12px 14px',paddingRight:voice.supported?'44px':'14px',background:T.card,border:`1px solid ${voice.listening?T.gold:T.border}`,borderRadius:12,color:T.text,fontSize:14,resize:'none',fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}/>
              {voice.supported && (
                <button onClick={voice.listening?voice.stop:voice.start}
                  style={{position:'absolute',right:10,bottom:10,width:28,height:28,borderRadius:'50%',background:voice.listening?T.red:'transparent',border:`1px solid ${voice.listening?T.red:T.faint}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:13}}>
                  {voice.listening?'⏹':'🎤'}
                </button>
              )}
            </div>
            <button onClick={()=>send()} disabled={loading||!input.trim()}
              style={{padding:'0 18px',background:loading||!input.trim()?T.input:T.gold,border:'none',borderRadius:12,color:loading||!input.trim()?T.faint:'#fff',fontSize:22,cursor:loading||!input.trim()?'default':'pointer',height:'52px',alignSelf:'stretch',flexShrink:0,transition:'background .15s'}}>↑</button>
          </div>
        </div>
      )}

      {tab==='profile' && (
        <div style={{flex:1,overflowY:'auto',padding:'28px 20px'}}>
          <div style={{maxWidth:620,margin:'0 auto'}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,marginBottom:6}}>Профиль руководителя</div>
            <div style={{color:T.muted,fontSize:13,marginBottom:26,lineHeight:1.55}}>Передаётся ИИ при каждом запросе. Чем подробнее — тем точнее ответы.</div>
            {PROFILE_FIELDS.map(f=>(
              <div key={f.key} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:11,color:T.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'.7px'}}>{f.label}</label>
                <textarea value={draft[f.key]||''} onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))} placeholder={f.placeholder} rows={2}
                  style={{width:'100%',padding:'11px 14px',background:T.card,border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,resize:'vertical',fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}/>
              </div>
            ))}
            <button onClick={savePro} style={{padding:'12px 32px',background:saved?T.input:T.gold,border:'none',borderRadius:10,color:saved?T.green:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',transition:'all .3s'}}>
              {saved?'✓ Сохранено!':'Сохранить профиль'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [screen, setScreen]   = useState('login')
  const [session, setSession] = useState(null)
  const [themeName, setTheme] = useState('dark')
  const T = THEMES[themeName]
  const toggleTheme = () => setTheme(n => n==='dark'?'light':'dark')

  return (
    <>
      <style>{GCS}</style>
      {screen==='login'     && <Login     onLogin={d=>{ setSession(d); setScreen(d.role) }} T={T}/>}
      {screen==='admin'     && <Admin     T={T} toggleTheme={toggleTheme}/>}
      {screen==='assistant' && <Assistant orgCode={session.orgCode} orgName={session.orgName} T={T} toggleTheme={toggleTheme}/>}
    </>
  )
}
