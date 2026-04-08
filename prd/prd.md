# MoodToon UX/UI PRD

## 1. Scope

เอกสารนี้ครอบคลุม `ทั้งโปรเจกต์ MoodToon` ในมุม UX/UI ไม่ใช่เฉพาะระบบ Battle

ใช้เอกสารนี้เพื่อ:

- สรุป product structure ของระบบที่มีอยู่จริงในโค้ด
- อธิบาย user-facing modules หลักของทั้งเว็บ
- ระบุ design direction, theming, และ interaction expectations
- ใช้เป็น brief ให้ UX/UI designer หรือ Figma AI ทำงานต่อได้

เอกสารนี้อิงจาก current implementation ของแอป React + Vite + Supabase ใน repository นี้

---

## 2. Product Summary

MoodToon คือแพลตฟอร์มสำหรับค้นหา จัดการ และเล่นกับ content fandom โดยโฟกัสที่ anime, manga, manhwa และ content ที่เกี่ยวข้อง เช่น characters, songs, trailers, tier lists, party games และ community activity

ประสบการณ์หลักของโปรดักต์แบ่งได้เป็น 4 เสาหลัก:

- `Discovery`: หาเรื่องที่อยากดู/อ่าน
- `Personalization`: เก็บ watchlist, top picks, preferences, profile
- `Play`: battle, tier list, party room
- `Community`: public profiles, social feed, public decks/lists, leaderboard

ฝั่งระบบยังมี `Admin / Editorial / Moderation` สำหรับดูแล catalog, homepage, reports, collections, analytics, duplicates และ challenge content

---

## 3. Product Goals

- ช่วยให้ผู้ใช้ค้นพบ content ที่ตรงรสนิยมง่ายขึ้น
- เปลี่ยนการดู/อ่านให้เป็น experience ที่มีความเป็น personal identity
- เพิ่ม engagement ผ่าน game-like features เช่น battle, tier list, party
- สร้าง community loop ผ่าน feed, public profile, comments, and sharing
- ทำให้ทีมงานจัดการ catalog และ editorial surfaces ได้จาก admin tool

---

## 4. Core User Types

### 4.1 Casual browser

ผู้ใช้ที่เข้ามาเพื่อหาเรื่องดู/อ่านแบบเร็ว

Need:

- search ที่เร็ว
- discover ที่ไม่ซับซ้อน
- title detail ที่ตัดสินใจได้ง่าย

### 4.2 Personal tracker

ผู้ใช้ที่ใช้เว็บเพื่อจัด watchlist, progress, favorites, top picks, profile

Need:

- watchlist ที่จัดการง่าย
- progress tracking ที่ลื่น
- profile ที่สื่อ identity

### 4.3 Fandom player

ผู้ใช้ที่สนุกกับ battle, tier list, party, ranking

Need:

- playful UI
- loops ที่อยากเล่นซ้ำ
- แชร์ผลลัพธ์หรือเผยแพร่ของที่สร้างได้

### 4.4 Social/community user

ผู้ใช้ที่อยากตามคนอื่น ดู feed ดู public profile ดู tier lists/decks ของคนอื่น

Need:

- public identity surfaces
- social proof
- exploration ที่เชื่อมคนกับ content

### 4.5 Admin/editor

ทีมภายในที่ดูแล catalog, homepage, moderation, analytics

Need:

- tools ที่ชัด
- task-oriented layout
- ลดความเสี่ยงจากข้อมูลผิดหรือซ้ำ

---

## 5. Route / Module Map

### 5.1 Public + User Routes

- `/` Home
- `/discover`
- `/title/:slug`
- `/battle`
- `/battle/*`
- `/party`
- `/party/*`
- `/tierlist`
- `/tierlist/*`
- `/watchlist`
- `/profile`
- `/u/:username`
- `/feed`
- `/stats`
- `/login`

### 5.2 Admin Routes

- `/admin`
- `/admin/titles`
- `/admin/titles/:id`
- `/admin/moods`
- `/admin/users`
- `/admin/analytics`
- `/admin/reports`
- `/admin/duplicates`
- `/admin/collections`
- `/admin/homepage`
- `/admin/recommendations`
- `/admin/fetch`
- `/admin/links`
- `/admin/daily`
- `/admin/tierlists`
- `/admin/party-presets`
- `/admin/guide`

---

## 6. Product Architecture In UX Terms

MoodToon ไม่ใช่เว็บหน้าเดียว แต่เป็น ecosystem ที่มี flow เชื่อมกัน:

1. `Home` จุดเริ่มต้น
2. `Discover` หา content
3. `Title Detail` ตัดสินใจและลงมือทำ action
4. `Watchlist / Profile` เก็บ personal state
5. `Battle / Tierlist / Party` ทำให้ product สนุกและมี replay value
6. `Feed / Public Profile` เพิ่ม social layer
7. `Admin` คุม content, editorial, moderation

ดังนั้น designer ควรคิดเป็น `one platform, many modes` ไม่ใช่หน้าแยกที่ไม่มี relationship กัน

---

## 7. Main User-Facing Modules

## 7.1 Home

### Purpose

เป็นหน้า landing หลักของ product

### Current behavior

- hero section
- mood-based finder
- recommendation results
- editorial sections
- continue watching/reading
- trending
- random pick

### UX role

Home ต้องเป็นหน้าที่ทำให้ผู้ใช้ “เริ่มได้ทันที” โดยไม่ต้องรู้ระบบทั้งหมดก่อน

### Design goal

- ทำให้ Home รู้สึกเป็น warm entry point
- balance ระหว่าง curated content และ personal discovery
- มี CTA ไปยัง discover / watchlist / interactive features ที่ชัด

---

## 7.2 Discover

### Purpose

หน้า search + browse หลักของ platform

### Current behavior

- global search
- scopes: titles, posts, people, tierlists
- filters by type/tag/query
- autocomplete
- saved/recent searches
- curated lanes
- sorting and relevance explanation

### UX role

เป็น search experience หลักของแอป และเป็นทางเชื่อม content กับ social entities

### Design goal

- ทำให้ search ดูฉลาดแต่ไม่ซับซ้อน
- รองรับ both quick search และ exploratory discovery
- เชื่อมผลลัพธ์หลายชนิดโดยไม่งง

---

## 7.3 Title Detail

### Purpose

หน้า canonical detail ของแต่ละ title และเป็น action surface สำคัญที่สุดของ content

### Current behavior

- metadata, synopsis, aliases, platforms
- trailer
- theme songs
- cast/staff/stats tabs
- similar titles
- watchlist actions
- top title actions
- add external link
- report content
- reviews

### UX role

เป็นจุดตัดสินใจว่า “จะดู/อ่าน/เก็บ/แชร์/รายงาน/เล่นต่อยังไง”

### Design goal

- ข้อมูลเยอะ แต่ต้องยังอ่านง่าย
- CTA หลักต้องชัด
- media, metadata, and action layers ต้องมี hierarchy ดี

---

## 7.4 Watchlist

### Purpose

หน้าจัดการรายการที่ผู้ใช้อยากดู/อ่าน กำลังดู/อ่าน และจบแล้ว

### Current behavior

- status filtering
- sorting
- progress editing
- target setting
- score/rating
- favorites linkage
- mood journal
- share card

### UX role

เป็น productivity + reflection surface ของผู้ใช้

### Design goal

- ทำให้จัดรายการง่าย
- แสดง progress และ next action ชัด
- ไม่ให้กลายเป็น dense spreadsheet

---

## 7.5 Profile

### Purpose

หน้า personal hub ของผู้ใช้

### Current behavior

- overview
- editing profile
- avatar upload
- recommendation preferences
- hidden titles management
- profile visibility / share settings
- profile comments
- top 5 per type
- achievements
- theme/adult/profile settings

### UX role

เป็น identity center ของระบบ

### Design goal

- profile ต้องรู้สึก personal และมี ownership
- settings เยอะ แต่ต้องไม่ทำให้เหนื่อย
- แยก clearly ระหว่าง self-expression กับ system settings

---

## 7.6 Public Profile

### Purpose

หน้าสาธารณะสำหรับดูตัวตนของผู้ใช้อื่น

### Current behavior

- avatar, bio, favorite moods
- watch stats
- top titles by type
- comments/replies
- follow button
- watchlist overlap

### UX role

เป็นสะพานเชื่อมคนกับคนผ่าน taste

### Design goal

- ทำให้โปรไฟล์ดูมี character
- ชู overlap / follow / top picks ให้ชัด
- comments ต้องเป็นส่วนเสริม ไม่รบกวน profile identity

---

## 7.7 Social Feed

### Purpose

หน้ากิจกรรมของคนที่ผู้ใช้ติดตาม

### Current behavior

- activity feed
- social posts
- composer
- title-linked activity
- profile-linked actions

### UX role

เพิ่มความรู้สึกว่าแพลตฟอร์มมีชีวิตและผู้ใช้คนอื่นก็ active อยู่

### Design goal

- feed ต้องอ่านง่าย
- social post และ activity event ต้องแยก grammar ให้ชัด
- card density ต้องเหมาะกับ mobile

---

## 7.8 Stats

### Purpose

หน้าดูภาพรวมพฤติกรรมการดู/อ่านของผู้ใช้

### Current behavior

- summary metrics
- average score
- genre distribution
- activity heatmap

### UX role

เป็น reflective dashboard ส่วนตัว

### Design goal

- ทำให้ data ดูมี value โดยไม่ต้องซับซ้อนมาก
- เข้าใจเร็ว
- เหมาะกับการกลับมาดูซ้ำเป็นช่วง ๆ

---

## 7.9 Battle

### Purpose

game-like ranking system แบบ pairwise comparison

### Current surfaces

- Battle Hub
- Browse
- Builder
- Session
- Deck Library
- Daily Challenge
- Leaderboard

### UX role

เป็น feature ที่เพิ่ม engagement, replayability, and taste expression

### Design goal

- เข้าใจง่าย
- เล่นสนุก
- สร้าง deck และแชร์ได้
- รู้สึกเป็น game mode ของ product

หมายเหตุ: Battle มีรายละเอียดลึกระดับ feature PRD ได้แยกต่อได้อีก หากต้องการ

---

## 7.10 Tierlist

### Purpose

ระบบสำหรับ browse, create, remix, manage, และ play tier lists

### Current behavior

- browse public templates/lists
- create lists
- create from template
- manage own tierlists
- song-specific tierlist
- public/private visibility
- comments/community interactions บางส่วน

### UX role

เป็น creative ranking surface ที่ยืดหยุ่นกว่าระบบ Battle

### Design goal

- ทำให้สร้างง่ายแต่ยัง powerful
- browse ต้องรู้สึกมี community content
- editor ต้องไม่รกเกินไป

---

## 7.11 Party

### Purpose

real-time group play / party room system

### Current behavior

- create/join room
- public/private rooms
- room lobby setup
- presets/templates
- title guess mode / music quiz-like modes
- ready states
- countdown / reveal / final results
- live multiplayer flow

### UX role

เป็น social game mode ของแพลตฟอร์ม

### Design goal

- high-energy
- understandable in group settings
- room setup ต้องไม่ซับซ้อน
- in-room states ต้องชัดมาก

---

## 8. Admin / Internal Modules

Admin เป็นอีก product หนึ่งภายในระบบ และควรแยก visual/UX logic จากฝั่ง consumer บางส่วน

### Core admin jobs

- manage titles/catalog
- manage moods
- manage users
- moderation reports
- duplicate handling
- homepage/editorial curation
- recommendation preview
- fetch/import workflows
- daily challenge setup
- party presets
- analytics

### Admin design goal

- task-first
- dense but readable
- safe for operational workflows
- ลด cognitive load

Admin ไม่จำเป็นต้อง playful เท่าฝั่ง consumer แต่ยังควรอยู่ใน brand เดียวกัน

---

## 9. Shared System Behaviors

ระบบที่กระทบทั้งโปรเจกต์:

- authentication
- protected routes
- bilingual UI: Thai + English
- theme switching: light / dark
- age gate mode
- global search
- command palette
- toast feedback
- local persistence บางส่วน
- Supabase-backed sync/state

Designer ต้องคิดระบบเหล่านี้เป็น global patterns ไม่ใช่รายหน้า

---

## 10. Functional Constraints

- ผู้ใช้บางหน้าต้อง login ก่อนใช้งาน
- admin จำกัด role
- theme default ปัจจุบันคือ light
- ระบบมี age-gated content mode
- หลายหน้าต้องรองรับทั้งไทยและอังกฤษ
- title, user, post, tierlist เป็นคนละ entity แต่เชื่อมกันใน discover/feed/profile
- หลาย module มี public/private state
- บาง features มี local fallback และ remote sync

---

## 11. UX Principles For The Whole Product

- mobile-first but desktop-capable
- content-first: artwork และ title identity สำคัญมาก
- action clarity: หน้าควรตอบได้ว่าควรทำอะไรต่อ
- progressive complexity: เริ่มง่าย ขยายความลึกเมื่อ user พร้อม
- fandom personality: เว็บต้องมี character ไม่ใช่ utility app ทั่วไป
- cross-feature consistency: cards, chips, pills, filters, empty states ควรพูดภาษาเดียวกัน

---

## 12. Visual Style & Theme Guidance

## 12.1 Brand Personality

MoodToon ควรให้ความรู้สึก:

- warm
- fandom-driven
- energetic
- expressive
- collectible
- social
- playful แต่ไม่เด็กเกินไป

ควรเป็น hybrid ระหว่าง:

- content platform
- personal tracking app
- playful fandom playground

ไม่ควรออกไปทาง:

- enterprise dashboard
- sterile media database
- over-decorated neon game UI ที่อ่านยาก

## 12.2 Current Theme DNA From Implementation

จาก design tokens ปัจจุบัน ระบบใช้แนว:

- primary: rose/pink
- accent: amber/gold
- light surfaces: warm paper / cream / peach tint
- dark surfaces: warm dark / cinematic brown-black
- gradients, glow, glassy elevated surfaces
- rounded shapes
- modern friendly typography

## 12.3 Light Mode Direction

Light mode ควรเป็น:

- bright
- warm
- inviting
- editorial-friendly

แนวทาง:

- ใช้ warm light backgrounds
- elevated cards/panels ต้องเด่น
- accent colors ใช้เพื่อดึงสายตา ไม่ใช่ย้อมทั้งหน้า
- เหมาะกับ content reading, discover, title detail, watchlist

ควรหลีกเลี่ยง:

- ขาวโล่งแบบ SaaS tool
- สีอ่อนจน artwork ไม่เด่น
- card/surface contrast ต่ำ

## 12.4 Dark Mode Direction

Dark mode ควรเป็น:

- immersive
- premium
- cinematic
- slightly arcade-like ในหน้าเล่นเกม

แนวทาง:

- ใช้ dark warm-neutral backgrounds
- แยกชั้น surface ด้วย border/shadow/glow อย่างพอดี
- CTA และ accents ต้องเด่นแต่ไม่บาดตา
- เหมาะมากกับ battle, party, auth, media-heavy views

ควรหลีกเลี่ยง:

- pure black + random neon
- glow ทุก element
- secondary text contrast ต่ำ

## 12.5 Surface Roles

- `Hero`: dramatic, memorable
- `Content cards`: collectible, clean, image-led
- `Utility panels`: calmer, structured
- `Gameplay surfaces`: high-focus, high-contrast
- `Social cards`: conversational, human
- `Admin surfaces`: operational, denser, clearer

## 12.6 Semantic Colors

ควรมี role ชัดเจน:

- `Primary`: main CTA
- `Accent`: highlight / energy / progress
- `Success`: complete, synced, published
- `Warning`: caution, spoiler, incomplete
- `Danger`: destructive actions
- `Info/Neutral`: metadata, helper text, passive controls

---

## 13. Cross-Screen UX Requirements

- ทุก feature ต้องมี loading, empty, error, disabled, success states
- keyboard accessibility ต้องไม่พัง
- long Thai / English strings ต้องไม่ทำ layout พัง
- filters/search controls ต้องใช้งานง่ายบน mobile
- cards ควรมี component grammar ที่สอดคล้องกัน
- user ต้องรู้เสมอว่า current page มี purpose อะไรและ next action คืออะไร

---

## 14. Known Product-Level UX Challenges

- ระบบมีหลาย feature mode มาก จึงเสี่ยงต่อความไม่สอดคล้องกัน
- Discover, Battle, Tierlist, Party มี interaction model คนละแบบ ต้องคุมด้วย shared design language
- Profile/Watchlist/Stats ต้อง balance ระหว่าง utility กับ personality
- Social layer ยังต้องเชื่อมกับ content identity ให้แน่น
- Admin และ consumer UI อยู่ใน product เดียวกัน แต่มีงานคนละแบบ

---

## 15. What UX/UI Designer Should Deliver

- product-wide IA / navigation thinking
- refreshed design direction ของทั้งเว็บ
- light + dark mode guidance
- key screen redesign for:
  - Home
  - Discover
  - Title Detail
  - Watchlist
  - Profile
  - Public Profile
  - Feed
  - Stats
  - Battle hub/session/result
  - Tierlist browse/create/play
  - Party hub/lobby/room
- cross-feature component patterns
- responsive behavior
- shared state design patterns
- optional admin visual system refinement

---

## 16. Suggested Design Questions

- Home ควรพาผู้ใช้ใหม่เข้าสู่ระบบยังไงให้ไม่หลง?
- Discover ควรเป็น search-first หรือ exploration-first แค่ไหน?
- Title detail ควรจัดลำดับข้อมูลและ CTA ยังไงให้ตัดสินใจง่าย?
- Watchlist กับ Profile จะแยก utility vs identity อย่างไร?
- Battle, Tierlist, Party ควร share visual language ระดับไหน?
- Social layer จะทำให้รู้สึกมีชีวิตโดยไม่รบกวน content-focused users ได้อย่างไร?
- Admin จะต่างจาก consumer มากแค่ไหนแต่ยังอยู่แบรนด์เดียวกัน?

---

## 17. Final Note

เอกสารนี้เป็น `current-state whole-project UX/UI PRD` ใช้เป็นฐานสำหรับ redesign ทั้งแพลตฟอร์มได้เลย โดย designer สามารถตีความใหม่ได้ แต่ควรยึด product structure, route map, states, และ shared constraints ของระบบนี้ไว้เป็นหลัก เพื่อให้ implementation ย้อนกลับเข้าสู่ codebase ได้จริง

---

## 18. Figma Prompt Version (~5000 chars)

ใช้ข้อความด้านล่างเป็น prompt สำหรับ Figma AI / designer handoff ได้ทันที

```txt
Design a UX/UI redesign for a full web product called “MoodToon”. This is not just a single feature redesign. It is a content platform for anime, manga, manhwa, and related fandom experiences. The product combines content discovery, personal tracking, social identity, game-like ranking features, and admin/editorial tools.

Core product idea:
MoodToon helps users discover titles, track what they watch/read, express taste, and play with fandom content. It should feel like a hybrid of:
- content discovery platform
- personal watchlist/profile app
- fandom playground with game-like features

Main user-facing modules:
1. Home
2. Discover
3. Title Detail
4. Watchlist
5. Profile
6. Public Profile
7. Social Feed
8. Stats
9. Battle
10. Tierlist
11. Party Room / Party Games
12. Auth

There is also an internal Admin product for catalog, homepage/editorial, moderation, analytics, reports, duplicates, daily challenge, and content management.

Primary user types:
1. Casual browser: wants to search and find something to watch/read quickly
2. Personal tracker: uses watchlist, progress, ratings, favorites, and profile
3. Fandom player: uses battle, tierlist, and party features
4. Social/community user: explores public profiles, feed, public lists, rankings
5. Admin/editor: manages platform content and moderation

Key routes/modules:
- Home: landing page with hero, recommendation finder, editorial sections, continue watching, trending, random pick
- Discover: global search and exploration across titles, posts, people, and tierlists
- Title Detail: canonical content page with metadata, trailer, theme songs, cast/staff/stats, similar titles, watchlist actions, reviews, report tools
- Watchlist: personal library with status filtering, progress editing, target setting, scoring, mood journal, and sharing
- Profile: personal hub with profile editing, preferences, hidden titles, top titles, achievements, visibility settings
- Public Profile: public-facing identity page with top titles, watch stats, comments, overlap, and follow action
- Feed: activity feed and social posts
- Stats: personal analytics and viewing/reading heatmap
- Battle: game-like pairwise ranking flow with hub, browse, builder, session, result, deck library, daily challenge, leaderboard
- Tierlist: browse, create, manage, remix, and play tier lists and templates
- Party: create/join live rooms, setup in lobby, use presets/templates, play quiz/title-guess/music-based party modes
- Auth: login/signup/social auth

Important shared system behaviors:
- bilingual UI: Thai and English
- light and dark mode
- age-gated content mode
- global header navigation and search
- command palette
- public/private visibility in several modules
- authenticated and unauthenticated states
- local persistence + Supabase-backed sync in multiple features

Design goals for the whole product:
- create a coherent platform-level experience across many feature modes
- make Home feel welcoming and useful immediately
- make Discover feel smart, fast, and exploration-friendly
- make Title Detail the clearest action surface for any content
- make Watchlist and Profile feel both useful and personal
- make Battle, Tierlist, and Party feel playful and high-engagement without breaking the brand
- make public/social features feel human and connected to fandom identity
- keep the product mobile-first while still strong on desktop

Visual direction:
The product should feel warm, expressive, fandom-driven, energetic, and premium. It should not feel like a generic enterprise dashboard or a sterile media database.

Current theme DNA to preserve:
- rose/pink primary energy
- amber/gold accent moments
- warm paper-like light theme surfaces
- cinematic warm dark theme surfaces
- gradients, glow, elevated cards, and rounded shapes
- strong artwork/content cards

Light mode:
- bright, warm, inviting
- editorial-friendly and readable
- elevated cards and panels over soft warm backgrounds
- use accents to guide action and focus
- avoid plain white SaaS-like emptiness

Dark mode:
- immersive, premium, cinematic
- dark warm-neutral backgrounds
- layered surfaces with border/shadow/glow separation
- vivid but readable accents
- avoid pure black + random neon overload

Component tone:
- heroes: memorable and dramatic
- content cards: collectible and image-led
- utility panels: calmer and structured
- gameplay surfaces: high-focus and high-contrast
- social cards: human and conversational
- admin surfaces: operational, denser, but still on-brand

Cross-screen requirements:
- loading, empty, error, disabled, and success states must exist
- responsive mobile-first layouts
- keyboard accessibility and semantic structure
- support long Thai and English labels
- shared component grammar across cards, pills, filters, search, and actions

Please produce:
- a product-wide UX/UI direction
- desktop and mobile key screens
- shared component patterns across the platform
- strong navigation and IA thinking
- major screen concepts for Home, Discover, Title Detail, Watchlist, Profile, Public Profile, Feed, Stats, Battle, Tierlist, Party, and Auth
- optional admin visual direction as a secondary system
```
