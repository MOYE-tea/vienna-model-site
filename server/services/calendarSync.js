import { DAVClient } from 'tsdav';
import ical from 'ical-generator';

let clientPromise = null;

function credentialsConfigured() {
  return Boolean(process.env.ICLOUD_APPLE_ID && process.env.ICLOUD_APP_PASSWORD)
    && process.env.ICLOUD_APPLE_ID !== '_待填_'
    && process.env.ICLOUD_APP_PASSWORD !== '_待填_';
}

function getClient() {
  if (!credentialsConfigured()) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new DAVClient({
        serverUrl: 'https://caldav.icloud.com/',
        credentials: {
          username: process.env.ICLOUD_APPLE_ID,
          password: process.env.ICLOUD_APP_PASSWORD
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      });
      await client.login();
      return client;
    })();
    // if login fails, allow a later call to retry instead of caching a broken promise forever
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

async function getTargetCalendar(client) {
  const name = process.env.ICLOUD_CALENDAR_NAME || 'Vienna 拍攝';
  const calendars = await client.fetchCalendars();
  const found = calendars.find((c) => c.displayName === name);
  if (!found) {
    throw new Error(
      `iCloud 找不到名為「${name}」的行事曆 — 請先在 Calendar App 或 iCloud.com 手動建立一個同名的獨立行事曆，這個服務不會動到你其他既有的行事曆`
    );
  }
  return found;
}

function buildEventFields(booking, slot) {
  const typeText = booking.type === 'commission' ? '委託' : '互惠';
  const start = new Date(`${slot.date}T${slot.start_time}:00+08:00`);
  const end = new Date(`${slot.date}T${slot.end_time}:00+08:00`);
  const summary = `[拍攝] ${booking.photographer_name}（${typeText}）`;
  const description = [
    booking.style_category ? `風格：${booking.style_category}` : null,
    booking.purpose ? `用途：${booking.purpose}` : null,
    booking.photographer_contact ? `聯絡：${booking.photographer_contact}` : null,
    booking.quote_amount ? `報價：NT$ ${booking.quote_amount}` : null,
    booking.admin_notes || null
  ].filter(Boolean).join('\n');
  return { start, end, summary, description };
}

// Push a single accepted booking to the dedicated iCloud calendar.
// Never throws — failures are reported back as { synced: false, reason } so an
// unreachable/unconfigured calendar never blocks the local accept action.
export async function pushBookingToCalendar(booking, slot) {
  const clientP = getClient();
  if (!clientP) {
    return { synced: false, reason: 'not_configured' };
  }
  try {
    const client = await clientP;
    const calendar = await getTargetCalendar(client);
    const { start, end, summary, description } = buildEventFields(booking, slot);
    // the iCal UID conventionally looks like an email address, but the CalDAV
    // *filename* must stay free of characters iCloud percent-encodes (like "@")
    // or a later lookup-by-filename (delete/update) won't match its own URL.
    const uid = `vienna-booking-${booking.id}@vienna-model-site`;
    const filename = `vienna-booking-${booking.id}.ics`;

    const cal = ical({
      events: [{
        id: uid,
        start,
        end,
        timezone: 'Asia/Taipei',
        summary,
        location: booking.location || undefined,
        description: description || undefined
      }]
    });

    const res = await client.createCalendarObject({
      calendar,
      iCalString: cal.toString(),
      filename
    });

    if (!res.ok) throw new Error(`iCloud 回應狀態 ${res.status}`);
    return { synced: true, uid };
  } catch (err) {
    console.error('[calendarSync] push failed:', err.message);
    return { synced: false, reason: err.message };
  }
}

// Remove a previously-pushed event (used on cancellation and before re-pushing
// a rescheduled booking under the same UID). Never throws — a stale/missing
// event is not worth failing the caller's action over.
export async function deleteBookingFromCalendar(bookingId) {
  const clientP = getClient();
  if (!clientP) return { deleted: false, reason: 'not_configured' };
  try {
    const client = await clientP;
    const calendar = await getTargetCalendar(client);
    const filename = `vienna-booking-${bookingId}.ics`;
    const objects = await client.fetchCalendarObjects({ calendar, objectUrls: [`${calendar.url}${filename}`] });
    const match = objects.find((o) => o.url.endsWith(filename));
    if (!match) return { deleted: false, reason: 'not_found' };
    const res = await client.deleteCalendarObject({ calendarObject: match });
    if (!res.ok && res.status !== 404) throw new Error(`iCloud 回應狀態 ${res.status}`);
    return { deleted: true };
  } catch (err) {
    console.error('[calendarSync] delete failed:', err.message);
    return { deleted: false, reason: err.message };
  }
}

export async function testCalendarConnection() {
  if (!credentialsConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const client = await getClient();
    const calendar = await getTargetCalendar(client);
    return { ok: true, calendarName: calendar.displayName };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
