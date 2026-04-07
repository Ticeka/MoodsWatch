# Admin Dashboard PRD

## 1. Scope

เอกสารนี้เป็น PRD แยกสำหรับ `Admin Dashboard` ของ MoodToon โดยเฉพาะ

เป้าหมายคือออกแบบ dashboard ใหม่ให้:

- ใช้ข้อมูลที่ระบบมีอยู่แล้วให้คุ้มกว่าเดิม
- ช่วย admin/editor เห็น “สิ่งที่ต้องทำตอนนี้” ทันที
- ลดการใช้ dashboard แบบแค่หน้า summary counts
- เชื่อม dashboard เข้ากับ workflow จริงของ admin modules ที่มีอยู่แล้ว

เอกสารนี้อิงจากของที่มีจริงในระบบตอนนี้ เช่น:

- `canonical_titles`
- `user_profiles`
- `user_lists`
- `moods` / `title_moods`
- `editor_collections`
- `homepage_content_blocks`
- `content_reports`
- `duplicate_candidates`
- `discover_search_events`
- daily challenge / tierlist / party presets / links / recommendations surfaces

---

## 2. Current Problem

Dashboard ปัจจุบันใช้ข้อมูลได้ไม่คุ้ม เพราะส่วนใหญ่แสดงแค่:

- total users
- total titles
- total lists
- total moods
- total collections
- total homepage blocks
- open reports
- pending duplicates
- recent users
- cache status

ปัญหาคือ:

- เป็น `count dashboard` มากกว่า `decision dashboard`
- ยังไม่ตอบคำถามสำคัญว่า “วันนี้ทีมควรทำอะไรก่อน”
- ไม่ช่วยเห็น health ของ catalog, editorial, moderation, discovery, engagement
- ไม่ช่วยเชื่อมผู้ใช้ไปยัง admin page ที่ควร action ต่อแบบชัด ๆ
- ข้อมูลที่มีอยู่ใน `AdminAnalytics` ยังไม่ได้ถูกยกมาใช้ใน dashboard หน้าแรก

สรุป: dashboard ตอนนี้ “รู้เยอะขึ้นนิดหน่อย” แต่ยัง “ช่วยทำงานได้ไม่มาก”

---

## 3. Dashboard Job To Be Done

เมื่อ admin/editor เปิด dashboard ควรตอบคำถามเหล่านี้ได้ภายในไม่กี่วินาที:

1. วันนี้มีอะไรที่ต้องรีบจัดการ?
2. ระบบส่วนไหนผิดปกติหรือเริ่มมีความเสี่ยง?
3. editorial/homepage ตอนนี้อยู่ในสถานะไหน?
4. content/catalog โตขึ้นหรือมีช่องโหว่อะไร?
5. discovery / search / user activity กำลังไปทางไหน?
6. ควรกดไปหน้าไหนต่อเพื่อทำงานให้จบเร็วที่สุด?

---

## 4. Primary Users

### 4.1 Admin

Need:

- overview ทั้งระบบ
- moderation priority
- operational health
- growth + risk signals

### 4.2 Editor

Need:

- homepage/editorial status
- collection readiness
- recommendation preview signal
- content freshness

### 4.3 Catalog operator

Need:

- catalog completeness
- missing metadata / missing links
- duplicate queue
- title ingestion health

---

## 5. Design Principle

Dashboard ใหม่ต้องเปลี่ยนจาก:

- “สรุปจำนวน”

ไปเป็น:

- “mission control”

หลักคิด:

- action-first
- exception-driven
- trend-aware
- role-useful
- compact but readable

---

## 6. Information Architecture

แนะนำให้ dashboard แบ่งเป็น 6 zones

### Zone A: Global Header

ประกอบด้วย:

- page title
- current admin name/role
- date range control
- quick filters เช่น `Today / 7d / 30d`
- refresh state
- system status shortcuts

### Zone B: Attention / Action Queue

ส่วนที่สำคัญที่สุดบนหน้า

ต้องตอบว่า “ทำอะไรก่อน”

ตัวอย่าง cards:

- open reports
- pending duplicates
- unpublished homepage blocks
- collections missing items
- titles missing links
- daily challenge not scheduled
- recommendation preview anomalies

ทุก card ควรมี:

- count
- severity
- short explanation
- CTA ไปยังหน้าที่เกี่ยวข้อง

### Zone C: KPI Overview

แสดง high-level numbers แต่ต้องจัดเป็นกลุ่ม ไม่ใช่กองรวม

กลุ่มที่ควรมี:

- platform
- content
- editorial
- moderation

### Zone D: Operational Health

ดูสถานะระบบและความพร้อมของ data

เช่น:

- cache health
- search event availability
- records updated recently
- challenge coverage
- missing link coverage

### Zone E: Trends & Insights

ใช้ข้อมูล analytics ที่มีอยู่แล้วให้เกิดประโยชน์

เช่น:

- discover searches top terms
- top issue types from reports
- duplicate trend
- recent title additions
- top catalog types
- top editorial changes

### Zone F: Recent Activity / Shortcuts

เช่น:

- recent users
- recently created titles
- recently updated homepage blocks
- recently updated collections
- quick links ไป admin tools ยอดใช้บ่อย

---

## 7. Recommended Dashboard Sections

## 7.1 Priority Queue

### Purpose

ทำให้หน้า dashboard มี “next action” ชัดเจน

### Required widgets

- `Reports Needing Review`
- `Pending Duplicates`
- `Homepage Blocks in Draft`
- `Collections Missing Items`
- `Titles Missing Availability Links`
- `Daily Challenge Missing / Not Ready`

### UX requirement

- ใช้สีตาม severity
- แสดงเฉพาะ items ที่มี issue
- แต่ละ widget clickable ได้ทั้ง card
- ต้องอ่านจบภายใน 1 บรรทัด

---

## 7.2 Platform Snapshot

### Purpose

ให้ภาพรวมเร็วของ platform scale

### Suggested metrics

- total users
- total titles
- total user lists
- total public tierlists/templates
- total party presets
- total homepage blocks

### UX requirement

- metrics ต้องมี label ชัด
- มี delta/trend ถ้าทำได้ เช่น vs previous period
- อย่าใช้ style เดียวกับ action queue

---

## 7.3 Moderation Health

### Purpose

ให้ moderation team หรือ admin เห็น backlog และ pattern

### Suggested widgets

- open / in review / resolved reports
- top report issue types
- newest unresolved reports
- pending duplicate candidates
- oldest unresolved duplicate candidate

### Existing data source

- `content_reports`
- `duplicate_candidates`

### UX requirement

- ควรมี aging signal เช่น “oldest open for 6 days”
- แยก quantity กับ urgency

---

## 7.4 Editorial Health

### Purpose

ให้ editor รู้ว่า homepage และ collections พร้อมไหม

### Suggested widgets

- collections by status: draft / published / archived
- homepage blocks by status
- homepage blocks by type
- blocks scheduled to start/end soon
- collections with zero items
- featured collections count

### Existing data source

- `editor_collections`
- `homepage_content_blocks`
- `editor_collection_items`

### UX requirement

- ควรมี CTA ไปหน้า `Homepage` และ `Collections`
- ควรใช้ pill/status chips ชัดเจน

---

## 7.5 Catalog Health

### Purpose

ทำให้ catalog operator เห็น completeness และ freshness

### Suggested widgets

- total titles split by anime / manga / manhwa
- recent titles added
- titles missing links
- titles with no moods
- titles added recently but incomplete metadata
- top titles by score/popularity

### Existing data source

- `canonical_titles`
- `title_availability`
- `title_moods`

### UX requirement

- ไม่ควรเป็นแค่ count
- ต้องมี “what needs cleanup” ชัด

---

## 7.6 Discovery & Search Insight

### Purpose

ใช้ข้อมูลจาก discover behavior ให้ทีมเข้าใจ demand จริง

### Suggested widgets

- top search queries
- zero/low-result searches
- search volume over selected period
- popular search scopes
- trend tags/topics

### Existing data source

- `discover_search_events`

### UX requirement

- ถ้า table นี้ไม่มีหรือยังไม่พร้อม ต้องมี graceful fallback
- ควรมีข้อความชัดว่า “telemetry unavailable” ไม่ใช่ blank

---

## 7.7 User Activity Snapshot

### Purpose

ทำให้เห็น movement ของ user side แบบสั้น ๆ

### Suggested widgets

- recent users
- total user lists
- active profile completion trends
- public profile adoption
- recent social/community activity summary

### Existing data source

- `user_profiles`
- `user_lists`
- อาจต่อยอดจาก social tables ถ้ามีพร้อม

---

## 8. Data Utilization Spec

Dashboard ใหม่ควรดึง “derived insights” ไม่ใช่ raw count อย่างเดียว

### 8.1 Count

ตัวอย่าง:

- total users
- total titles
- total collections

### 8.2 Split

ตัวอย่าง:

- titles by type
- reports by status
- homepage blocks by type/status

### 8.3 Trend

ตัวอย่าง:

- created this week
- updated in last 7 days
- reports opened vs resolved

### 8.4 Exception

ตัวอย่าง:

- collections with zero items
- blocks still in draft
- titles with missing availability
- duplicate backlog over threshold

### 8.5 Actionable list

ตัวอย่าง:

- latest 5 unresolved reports
- latest 5 duplicate candidates
- latest 5 titles added
- latest 5 blocks updated

---

## 9. Suggested Dashboard Layout

### Desktop

ลำดับแนะนำ:

1. Header + quick filters
2. Attention queue row
3. KPI overview grid
4. Editorial + Moderation split row
5. Catalog + Discovery split row
6. Recent activity + shortcuts

### Tablet

- attention queue อยู่บนสุด
- KPI เป็น 2-column
- sections เป็น stacked cards

### Mobile

- ใช้ stacked cards ทั้งหมด
- attention queue มาก่อนเสมอ
- KPI ย่อเหลือเฉพาะ top-priority metrics
- tables เปลี่ยนเป็น compact list cards

---

## 10. Role-Aware Dashboard Behavior

ถ้าจะพัฒนาต่อ ควรมี role emphasis:

### For admin

- moderation + system + growth เท่ากัน

### For editor

- homepage + collections + recommendation + challenge เด่นกว่า

### For catalog operator

- titles + links + moods + duplicates เด่นกว่า

ตอนนี้แม้ยังไม่ personalizable เต็มรูปแบบ อย่างน้อยควรมี block arrangement ที่สื่อ use case เหล่านี้

---

## 11. Interaction Requirements

- ทุก widget ที่ actionable ต้องกดไปยังหน้าที่เกี่ยวข้องได้
- มี hover/focus/pressed state ครบ
- รองรับ loading / empty / error / partial data
- ถ้าบาง data source unavailable ต้องไม่พังทั้งหน้า
- ควรมี refresh pattern เดียวทั้งหน้า
- ควรมี date range control ที่กระทบ trend widgets อย่างสอดคล้องกัน

---

## 12. Visual Direction

Dashboard admin ควรยังอยู่ในแบรนด์ MoodToon แต่ลดความ playful ลงจาก consumer side

ควรเป็น:

- premium operational
- structured
- compact
- readable
- modern

ไม่ควรเป็น:

- dashboard สีจัดทุกจุด
- metric wall ที่น่าเบื่อ
- card จำนวนมากที่ไม่มี hierarchy

### Light mode

- ใช้ warm light admin surfaces ตามระบบหลัก
- accent ใช้พอดีเพื่อเน้น priority
- tables and forms ต้องอ่านง่าย

### Dark mode

- ใช้ dark elevated surfaces ที่อ่านง่าย
- หลีกเลี่ยง glow เยอะ
- status colors ต้องยัง distinguish ได้ดี

---

## 13. State Design

ทุก section ต้องมี state ชัดเจน:

- loading
- empty
- error
- stale / telemetry unavailable
- healthy
- requires action

ตัวอย่าง:

- search telemetry unavailable
- no urgent moderation items
- no recent users
- homepage healthy

---

## 14. Success Criteria

Dashboard ใหม่ถือว่าดีขึ้นถ้า:

- admin รู้ within 5-10 seconds ว่าวันนี้ต้องทำอะไรก่อน
- ลดการเข้า analytics/reports/homepage แบบ “เปิดไปดูเฉย ๆ”
- เพิ่มการคลิกจาก dashboard ไปยัง action pages ที่เกี่ยวข้อง
- ทีมรู้สึกว่าหน้านี้ช่วยตัดสินใจ ไม่ใช่แค่โชว์สถิติ

---

## 15. Recommended MVP

ถ้าจะทำเป็นเฟส แนะนำเริ่มจาก MVP นี้ก่อน:

### MVP widgets

- reports needing review
- pending duplicates
- homepage blocks by status
- collections with zero items
- titles missing links
- recent titles
- recent users
- top searches
- cache/system status

### Reuse from existing code

- counts/query patterns จาก `AdminDashboard.jsx`
- analytics derivation หลายส่วนจาก `AdminAnalytics.jsx`
- layout/sidebar จาก `AdminLayout.jsx`
- state panel pattern จาก `AdminStatePanel.jsx`

---

## 16. Figma Prompt Version

```txt
Design a new Admin Dashboard for MoodToon, an anime/manga/manhwa content platform. The current admin dashboard is underusing the available data. Right now it mostly shows basic counts like total users, total titles, total lists, total collections, homepage blocks, open reports, pending duplicates, and recent users. We want to redesign it into a true mission-control dashboard that helps admins and editors decide what to do next.

The dashboard should support these users:
1. Admin: wants platform-wide overview, moderation priority, and operational health
2. Editor: wants homepage/editorial readiness, collection status, recommendation context
3. Catalog operator: wants catalog completeness, duplicates, missing links, and freshness

Existing data available in the system includes:
- user_profiles
- canonical_titles
- user_lists
- moods and title_moods
- editor_collections
- editor_collection_items
- homepage_content_blocks
- content_reports
- duplicate_candidates
- discover_search_events
- daily challenge related content
- tierlist and party preset admin surfaces

Main dashboard goal:
- tell the team what needs attention now
- show platform health
- surface actionable insights, not just raw counts
- connect each widget to the correct admin workflow

Recommended dashboard structure:
1. Global header with admin identity, quick date range filters, refresh state
2. Attention queue row
3. KPI overview
4. Editorial health section
5. Moderation health section
6. Catalog health section
7. Discovery/search insight section
8. Recent activity and shortcuts

Important widgets to include:
- Reports needing review
- Pending duplicates
- Homepage blocks still in draft
- Collections with zero items
- Titles missing availability links
- Daily challenge missing / not ready
- Platform totals grouped by category
- Titles split by anime / manga / manhwa
- Open / in-review / resolved moderation counts
- Homepage blocks by type and status
- Top search queries
- Recent titles added
- Recent users
- Cache / telemetry / system health status

The design should feel:
- operational
- premium
- compact
- clear
- modern

It should not feel like:
- a generic analytics wall
- a boring metric-only dashboard
- an over-decorated consumer game UI

Keep it in the MoodToon brand family:
- warm surfaces
- strong hierarchy
- light and dark mode
- clean but slightly expressive cards
- clear status colors for healthy / warning / danger / draft / pending states

UX requirements:
- every actionable card should link to a relevant admin page
- loading, empty, error, stale-data, and healthy states must exist
- mobile and tablet behavior should remain usable
- tables may become compact lists/cards on smaller screens
- top priority items should always appear above generic KPIs

Please design:
- desktop and mobile admin dashboard
- attention queue patterns
- KPI cards
- operational insight widgets
- section hierarchy
- widget card system
- dashboard empty/error states
```
