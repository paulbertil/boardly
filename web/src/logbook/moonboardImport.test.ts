import { describe, expect, it } from 'vitest'
import { RECIPIENT, buildGdprEmail, renderGdprEmailText } from './moonboardImport'

describe('buildGdprEmail', () => {
  it('addresses the request to Moon Climbing and names the account email', () => {
    const email = buildGdprEmail({ email: 'climber@example.com', username: 'crimpmaster' })
    expect(email.recipient).toBe(RECIPIENT)
    expect(email.recipient).toBe('moonboardsupport@moonclimbing.com')
    expect(email.subject).toContain('climber@example.com')
    expect(email.body).toContain('climber@example.com')
    expect(email.body).toContain('crimpmaster')
  })

  it('omits the username clause cleanly when no username is given', () => {
    const email = buildGdprEmail({ email: 'climber@example.com' })
    expect(email.body).toContain('account email: climber@example.com')
    // No dangling label, placeholder token, or undefined leakage.
    expect(email.body).not.toContain('username:')
    expect(email.body).not.toContain('undefined')
    expect(email.body).not.toMatch(/\[.*?\]/)
  })

  it('trims surrounding whitespace on inputs', () => {
    const email = buildGdprEmail({ email: '  climber@example.com  ', username: '  crimp  ' })
    expect(email.subject).toContain('climber@example.com')
    expect(email.subject).not.toContain(' climber@example.com ')
    expect(email.body).toContain('username: crimp')
  })

  it('treats a whitespace-only username as absent', () => {
    const email = buildGdprEmail({ email: 'climber@example.com', username: '   ' })
    expect(email.body).not.toContain('username:')
  })

  it('builds a mailto href that round-trips the encoded body', () => {
    const email = buildGdprEmail({ email: 'me+moon@x.com', username: 'a&b' })
    expect(email.mailtoHref.startsWith('mailto:moonboardsupport@moonclimbing.com?')).toBe(true)
    expect(email.mailtoHref).toContain('subject=')
    expect(email.mailtoHref).toContain('body=')

    // Percent-encoding: no raw spaces, and the `+` in the email / `&` in the username are
    // encoded inside the values rather than breaking the query structure.
    const bodyParam = new URL(email.mailtoHref).searchParams.get('body')
    const subjectParam = new URL(email.mailtoHref).searchParams.get('subject')
    expect(bodyParam).toBe(email.body)
    expect(subjectParam).toBe(email.subject)
    // The raw href must not contain unencoded spaces (they belong to the body prose).
    expect(email.mailtoHref).not.toMatch(/ /)
  })

  it('preserves the load-bearing GDPR wording (guards against template drift)', () => {
    const { body } = buildGdprEmail({ email: 'climber@example.com' })
    expect(body).toContain('Article 15')
    expect(body).toContain('Article 20')
    expect(body).toContain('CSV or JSON')
    expect(body).toContain('one calendar month')
  })

  it('requests the matcher-critical fields (board version, angle, time zone, identifier)', () => {
    const { body } = buildGdprEmail({ email: 'climber@example.com' })
    // Without board version + angle + timestamp, importer name-matching across the five
    // MoonBoard set versions is ambiguous — these must stay in the ask.
    expect(body).toContain('hold-set version')
    expect(body).toContain('angle')
    expect(body).toContain('time zone')
    // The id/holds are the opportunistic-booster ask.
    expect(body).toContain('unique')
    expect(body).toContain('hold/move layout')
  })
})

describe('renderGdprEmailText', () => {
  it('renders recipient, subject, and body as one pasteable block', () => {
    const email = buildGdprEmail({ email: 'climber@example.com' })
    const text = renderGdprEmailText(email)
    expect(text).toContain('To: moonboardsupport@moonclimbing.com')
    expect(text).toContain(`Subject: ${email.subject}`)
    expect(text).toContain(email.body)
  })
})
