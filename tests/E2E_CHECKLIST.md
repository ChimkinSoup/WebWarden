# WebWarden End-to-End Manual Test Checklist

- [ ] Install extension + companion; verify native port connects (service worker console)
- [ ] Create 2 categories with different limits; verify independent pools
- [ ] Spend time on category A; verify B unaffected
- [ ] Background audio on blocked site counts as consuming
- [ ] Laptop lock deducts time and pauses consumption
- [ ] Time-up redirects and blocks further navigation
- [ ] Restart grants extra time (companion uptime check)
- [ ] Emergency pause once/day, one category only
- [ ] Bedtime blocks all except productivity; challenge grants bonus
- [ ] Hardcore bedtime disables all bypasses
- [ ] Settings lock after first edit; site-add without friction; full edit requires restart + typing
- [ ] Allowlist mode + auth domains prevent lockout
- [ ] Disable incognito → full block until enabled
- [ ] Kill companion → full block until reconnect
