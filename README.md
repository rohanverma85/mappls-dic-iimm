# IIMM Platform

Integrated Infrastructure Management & Maintenance is a full-stack, role-aware prototype for configurable public-infrastructure operations. It follows PRD v1.2 and expands the supplied Digital India walkthrough into working, API-backed journeys.

## Included

- Public marketing website with product features, benefits, role model and accountability story
- Five seeded personas: Tenant Administrator, Authority, Maker, Checker and Citizen
- Multi-tenant provisioning with organisation hierarchy, configurable asset types, modules and SLAs
- Projects, assets, geo-fenced attendance, Joint/Requested inspections and offline-sync states
- Citizen duplicate detection, Checker validation, Maker ATR and Checker closure verification
- Maker → Checker → Authority payment approval enforcement
- Helpdesk, notifications, scoped search, CSV reports and activity/audit trail
- Responsive desktop, tablet and mobile layouts

## Run locally

```bash
npm install
npm run dev
```

The Vite client runs on `http://localhost:5173` and proxies `/api` to the Express server on port 3000.

For a production-style run:

```bash
npm run build
npm start
```

Open `http://localhost:3000`.

## Demo access

Choose any seeded persona on the login screen. Authentication is intentionally simplified for the prototype; production identity options described by the PRD are represented in the UI.

## Validation

```bash
npm run check
```

This runs TypeScript checks, workflow/API tests and the production build.

## Persistence

The Express service seeds `data/store.json` on first run and persists prototype mutations there. The generated store file is git-ignored so each environment starts from the canonical seed in `server/seed.ts`.
