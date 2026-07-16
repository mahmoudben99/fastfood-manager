export class NextResponse extends Response {
  constructor(body, init = {}) {
    super(body, init)
    this.cookies = {
      set: (name, value, options = {}) => {
        const attributes = [`${name}=${value}`]
        if (options.httpOnly) attributes.push('HttpOnly')
        if (options.secure) attributes.push('Secure')
        if (options.sameSite) attributes.push(`SameSite=${String(options.sameSite).replace(/^./, c => c.toUpperCase())}`)
        if (options.path) attributes.push(`Path=${options.path}`)
        if (typeof options.maxAge === 'number') attributes.push(`Max-Age=${options.maxAge}`)
        this.headers.append('set-cookie', attributes.join('; '))
      }
    }
  }

  static json(value, init = {}) {
    const headers = new Headers(init.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return new NextResponse(JSON.stringify(value), { ...init, headers })
  }

  static next() {
    return new NextResponse(null, { status: 204 })
  }

  static redirect(url) {
    return new NextResponse(null, { status: 307, headers: { location: String(url) } })
  }
}

// Imported as a value by the current login route even though it is only a
// TypeScript annotation. Exporting it keeps native type-stripped loading valid.
export class NextRequest extends Request {}
