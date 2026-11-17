# Admin Gold license setup

The admin-only signup and license portal live at `/reader/admin`; `/pricing` links to
`/reader/admin?signup=1`. Existing database administrators continue to use the same
portal. New admins enroll after a verified Supabase sign-in.

Before enabling purchases:

1. Deploy `koko-backend-gold` with migration `20261117_0046` applied, then deploy
   this frontend. The migration adds the yearly license pool and permits a student
   to redeem a fresh code after an earlier code expires.
2. In Supabase Auth URL Configuration, allow the production redirect
   `https://www.freereader.io/reader/admin?signup=1` (and the equivalent preview
   or localhost URL when testing). Keep the existing reader redirect URLs.
3. The backend needs its existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the frontend needs its existing
   Supabase public credentials and `KOKO_BACKEND_URL`. No new Stripe price ID is
   needed: Checkout creates a recurring USD $10/year price for each license.
4. Confirm the existing Stripe webhook destination sends
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, and
   `customer.subscription.pending_update_applied` to the backend billing webhook.
5. In Stripe test mode, sign up as an admin, buy two seats, and check that two
   redemption links appear only after payment. Redeem one as a student; add a
   third seat later and verify the Stripe invoice is prorated and all three codes
   have the same renewal date. Retry a webhook and confirm it does not create
   duplicate codes. Test a failed additional payment and confirm it issues no seat.

The quote for additional seats is an estimate. Stripe calculates the final
second-accurate proration at the existing subscription's annual renewal anchor.
