# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **content-only repository** for DHABA Tallinn, an Asian Fusion street food startup in Tallinn, Estonia. There is no application code, build system, or test suite — the sole artifact is `README.md`, which serves as the public-facing business profile.

## Repository Structure

```
DHABA/
└── README.md    # Primary content: menu, location, hours, franchise info, social links
```

## Development Workflow

Since there is no code, all work is content editing via standard git:

```bash
git checkout -b <branch>          # create a feature branch
# edit README.md or add new files
git add README.md
git commit -m "descriptive message"
git push -u origin <branch>
```

The active development branch is `claude/add-claude-documentation-CSNGL`.

## README Content Conventions

- Business status banner (`🔴 TEMPORARILY CLOSED` / reopening notice) appears at the top after the tagline.
- Menu sections use emoji category headers (🥙 🍗 🌱 🍟 🥗).
- External links use the `→ URL` arrow format under delivery platform entries.
- Copyright line at the bottom follows the pattern: `© YYYY DHABA Tallinn - Asian Fusion Street Food Kiosk | Authentic Flavors, Modern Taste`.
- Contact: `info@dhaba-tallinn.ee` · Instagram/Facebook/TikTok all `@dhaba_tallinn`.

## Key Business Details (do not alter without confirmation)

| Field | Value |
|---|---|
| Location | Tallinn, Estonia |
| Hours (Mon–Fri) | 11:00–20:00 |
| Hours (Saturday) | 12:00–21:00 |
| Sunday | Closed |
| Wolt ordering | https://wolt.com/en/discovery |
| Bolt Food ordering | https://food.bolt.eu/en-us/ |
