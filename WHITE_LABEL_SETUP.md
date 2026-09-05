# White-Label Setup Guide

This guide is for a **buyer** who has purchased a copy of this application and wants
to run it as **their own branded product** (their name, logo, colours, domain).
No coding is required for the main branding — it is all done from the admin panel.

> New to hosting? First follow **[DEPLOYMENT.md](./DEPLOYMENT.md)** to put the app
> online (database + backend + frontend, all on free tiers). Then come back here to
> make it your own.

---

## What you get

A complete study / exam platform: quizzes, test series, previous papers, an AI
question generator, online CBT exams, student and paying-"client" accounts,
subscriptions & payments, analytics, and an admin panel. Everything runs on
**your own accounts** — you are in full control of the data and the brand.

---

## Step 1 — Put your copy online

Follow **[DEPLOYMENT.md](./DEPLOYMENT.md)**. In short you will create three free accounts
and connect them:

1. **Database** — your MongoDB-compatible database (e.g. MongoDB Atlas or Oracle Autonomous DB).
2. **Backend API** — a server you control (e.g. an Oracle Cloud VM running the Docker image; see `backend/HOSTING.md`).
3. **Frontend** — a static host (e.g. Cloudflare Pages).

Use **your own** accounts everywhere. When finished you will have your own URL —
connect your own custom domain on the frontend host.

---

## Step 2 — Make it your brand (no code) ⭐

Log in as the admin, then open **Admin → Customization**. From here you can set,
and it instantly re-themes the whole site:

| Setting | What it changes |
|---|---|
| **Site name** | The app name shown in the header, browser tab, emails, payment popup, and the installed phone-app name. |
| **Tagline** | The short line shown beside/under the name. |
| **Logo** | Upload your logo — it replaces the icon in the header, the browser favicon, and the app icon. |
| **Primary colour** | The main brand colour used across buttons, links, highlights, and the payment popup. |
| **Accent colour** | The secondary highlight colour. |
| **Font** | The site-wide font. |
| **Navbar options** | Header height, brand size, font, etc. |

That's the core of white-labelling — **once you save, your brand appears everywhere**,
including:

- The browser tab title and icon
- The installed phone app (PWA) name, icon and colour
- The **Razorpay payment popup** on sign-up and renewal
- The verification-code and password-reset **emails**
- Social share previews

> You do **not** need to edit any code for the above.

---

## Step 3 — Connect your own services

Set these as **environment variables** on your backend server (and any build-time
vars on the frontend host). See `backend/.env.example` for the full list. The important ones:

### Payments (so subscription money goes to you) — Razorpay
- On the **backend server**, set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from your own
  [Razorpay](https://razorpay.com) account.
- If you leave these unset, paid sign-ups are disabled and only the free trial works.

### Emails (verification codes, password resets)
- Set SMTP details (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
  **or** a Brevo API key. Use your own email service.
- Set `NOTIFY_EMAIL` to the address where you want contact-form messages delivered.

### AI question generator (optional)
- Set `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` from your own AI provider
  (any OpenAI-compatible provider works). Leave unset to hide the feature.

### File/image uploads (optional but recommended)
- Set the `CLOUDINARY_*` keys from your own [Cloudinary](https://cloudinary.com) account.

### Admin account
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create your own admin login on first start.
- **Change the default password immediately** after first login.

---

## Step 4 — Set your plans and prices

In **Admin → Customization** (plans section) you can edit the subscription plans your
customers see on the **Pricing** page and at sign-up: the label, duration, price, and
each plan's AI generation limits. Your prices, your currency amounts.

---

## Step 5 (optional) — Perfect the SEO and app icons

The admin panel handles the *live* brand. These extra files only affect the very
first split-second of loading and how your link looks when shared / searched.
Edit them once, before deploying, for a flawless result on your own domain:

- **`frontend/index.html`** — update the `<title>`, `description`, `theme-color`,
  and the Open Graph / Twitter tags (site name, URL, image). Replace any
  `mystudyguide.in` URLs with your own domain.
- **`frontend/public/manifest.webmanifest`** — update `name`, `short_name`,
  `description`, and colours (the installed-app identity).
- **`frontend/public/`** — replace the brand image files with your own, keeping the
  same file names: `favicon.svg`, `apple-touch-icon.png`, `og-image.png`,
  `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`.
- **`frontend/public/robots.txt`** and **`sitemap.xml`** — update the domain.

> These are optional. If you skip them, the app still shows *your* brand everywhere
> once it loads — only search engines and link previews would briefly see the
> original template values.

---

## Checklist before you go live

- [ ] Site name, logo, and colours set in **Admin → Customization**
- [ ] Admin password changed from the default
- [ ] Razorpay keys added (if selling subscriptions)
- [ ] Email (SMTP/Brevo) working — test a password reset
- [ ] Plans and prices set on the Pricing page
- [ ] (Optional) Static SEO files and icons updated for your domain

Once these are done, the app is fully yours — your brand, your data, your revenue.
