# Chrome Web Store Listing — ClipClass

> Last Updated: 2026-05-31

## Store Listing

**Extension Name**
ClipClass

**Short Description**
Generate structured student worksheets and gamified team trivia reviews instantly from YouTube educational videos.

**Detailed Description**
ClipClass turns any educational YouTube video into a comprehensive ready-to-print classroom kit in seconds. Perfect for elementary, middle school, high school, and advanced college-level educators, ClipClass leverages advanced AI to transcribe video content and synthesize perfectly formatted, age-appropriate learning resources.

Key Features:
- Age-Appropriate Synthesis: Tailor worksheet reading levels instantly from Ages 5-7 all the way to College/University level (Ages 17+).
- Chronological Comprehension Questions: Synthesizes exactly 10 academic "exam-style" active-listening questions testing core factual lessons and factual causes explained in the video.
- Complete Teacher Answer Key: A confidential solution sheet complete with comprehensive model answers matching every student workbook question.
- Full Native Translation Support: Instantly translate the entire workbook (Summaries, 10 Questions, 10 Teacher Answers, and Classroom Trivia) into Spanish, French, German, Mandarin Chinese, Arabic, Hindi, or Vietnamese.
- Gamified Classroom Trivia: Engage the entire room by appending an interactive 5-round multiple-choice team trivia review complete with host scripts and question rationales.

How to Use:
1. Navigate to any educational video on YouTube.
2. Click the ClipClass action icon in your Chrome toolbar.
3. Select your target student age group and any language translation requirements.
4. Click "Generate Classroom Kit" and download your beautifully formatted, ready-to-print multi-page PDF workbook in seconds!

Privacy & Security:
We take your data protection seriously. ClipClass integrates secure authentication via Firebase and never stores or sells your personal information.

Support & Feedback:
Need assistance or want to request a feature? Contact us at support@clipclass.com or visit our help center.

**Category**
Productivity

**Single Purpose**
Generates ready-to-print learning worksheets and answer keys from educational YouTube videos.

**Primary Language**
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Created | `icons/icon-128.png` |
| Screenshot 1 (Dashboard) | 1280×800 | ✅ Created | `screenshots/dashboard.png` |
| Screenshot 2 (Generated PDF) | 1280×800 | ✅ Created | `screenshots/pdf-preview.png` |
| Small Promo Tile | 440×280 | ✅ Created | `promos/promo-small.png` |
| Marquee Promo Tile | 1400×560 | ✅ Created | `promos/promo-marquee.png` |

---

## Permissions Justification

The Chrome Web Store review team requires clean justifications for all permissions. Mismatches will result in review delays.

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Allows ClipClass to read the active YouTube URL when clicked by the user to safely extract the YouTube video ID for transcription. |
| `scripting` | permissions | Enables ClipClass to execute small content script injections to check subtitle tracks and parse active video details. |
| `https://*.youtube.com/*` | host_permissions | Necessary to communicate with YouTube API endpoints and scrape timed caption subtitle text tracks. |
| `http://localhost/*` | host_permissions | Allows communication with the local backend server (on Port 3001) for local developer testing and Stripe checkout redirecting. Note: Remove localhost before final production build. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Authentication info | Yes | Yes | Authenticates users to check worksheet generation quotas and subscription tiers via Firebase Auth. | No |
| User activity | Yes | Yes | Counts the number of translated workbooks generated to enforce free-tier usage limits. | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL**
`https://clipclass.com/privacy-policy`

---

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free (with paid subscription / lifetime one-time upgrade)

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-05-31 | Initial Release: YouTube transcription, full workbook translation, gamified trivia generator, and Stripe Pro payment integration. | Draft |

---

## 📦 Production Packaging & Bundling Guide

To package your extension into a clean `.zip` file ready for upload to the Chrome Web Store, run the following command in your terminal inside the `/Users/mohammedismail/Desktop` directory (or use a zip utility):

```bash
zip -r clipclass-extension.zip clipclass-extension -x "*.git*" -x "*node_modules*" -x "*.env*" -x "*CHROMEWEBSTORE.md*" -x "*test_workbook.pdf*"
```

This will bundle only the clean, client-side manifest, HTML, CSS, assets, and library scripts into a compressed bundle, fully protecting your server secrets and logs from public upload!
