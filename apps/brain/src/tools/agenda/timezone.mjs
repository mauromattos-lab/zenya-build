export function zonedDateTimeToUtcIso({ date, time, timeZone }) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const offsetMs = timeZoneOffsetMs(new Date(utcGuess), timeZone)
  return new Date(utcGuess - offsetMs).toISOString()
}

export function calendarEventToPanelAppointment(event, timeZone) {
  const startIso = event.start?.dateTime
  const endIso = event.end?.dateTime
  if (typeof startIso !== 'string' || typeof endIso !== 'string') throw new Error('Google Calendar event missing dateTime')

  const startParts = zonedParts(new Date(startIso), timeZone)
  const end = new Date(endIso)
  const start = new Date(startIso)
  const privateProps = event.extendedProperties?.private ?? {}
  return {
    id: event.id,
    day: dayIndexMondayFirst(startParts.weekday),
    start: startParts.hour + (startParts.minute / 60),
    dur: Math.round((end.getTime() - start.getTime()) / 60_000),
    title: event.summary ?? '',
    client: privateProps.cliente ?? '',
    phone: privateProps.telefone ?? '',
    status: privateProps.status ?? 'aguardando',
    origin: privateProps.origin ?? 'manual',
    conversaId: privateProps.conversaId,
    notes: event.description ?? ''
  }
}

export function timeZoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    weekday: parts.weekday,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

function dayIndexMondayFirst(weekday) {
  return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday]
}
