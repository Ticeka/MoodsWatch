# PRD: Product Analytics Dashboard

## Document Info
- Product: Content / Social / Battle / Tierlist / Party Platform
- Document Name: `prdDashboard.md`
- Purpose: กำหนดสเปก Dashboard ที่จำเป็นสำหรับการติดตามสุขภาพของ product, user behavior, creator/community, content performance, และ feature retention โดยอิงจาก data domains ที่มีอยู่จริงในระบบ
- Primary Audience: Product Manager, Founder, Data Analyst, Designer, Frontend Engineer, Backend Engineer, AI Agent
- Source Basis: ออกแบบจาก data inventory ที่ประกอบด้วย user profile, consumption, search, social, battle, tierlist, party, editorial, moderation และ notification domains

---

## 1) Objective
Dashboard นี้ต้องตอบคำถามหลัก 6 ข้อให้ได้:

1. ผู้ใช้เข้ามาแล้วทำอะไรบ้าง และ feature ไหนถูกใช้งานจริง
2. ผู้ใช้ชอบอะไร เกลียดอะไร และกลับมาใช้งานเพราะอะไร
3. content/community แบบไหนสร้าง engagement สูงสุด
4. feature ไหนสร้าง retention มากที่สุด
5. funnel ตรงไหนมี drop-off สูง
6. มีปัญหาด้าน moderation, data quality หรือ operational health ตรงไหน

Dashboard ต้องไม่เป็นแค่หน้ารวมตัวเลข แต่ต้องเป็นระบบ decision-making สำหรับ product optimization

---

## 2) Product Questions to Answer

### Executive / Founder Questions
- MAU / WAU / DAU โตหรือไม่
- feature ไหนเป็นตัวดึง retention
- UGC ecosystem โตจริงไหม
- creator/community มีผลต่อ engagement แค่ไหน
- search, battle, tierlist, party, social ใครเป็นตัวนำ
- notification และ daily habit loops ทำงานหรือไม่

### Product Questions
- planned → active watching/reading → completed มี conversion เท่าไร
- search query ไหนคนค้นเยอะแต่ไม่คลิก
- battle deck ไหนคนเริ่มเล่นเยอะแต่เล่นไม่จบ
- tierlist template ไหนคนกดเล่นเยอะแต่ไม่ publish
- party room/create flow ตรงไหน friction สูง
- public profile / social adoption มีผลต่อ stickiness หรือไม่

### Ops / Trust Questions
- content report เพิ่มขึ้นผิดปกติไหม
- duplicate candidate / merge action backlog สูงไหม
- notification unread สูงเกินไปหรือไม่
- มี content hotspot ที่ toxic หรือ low-quality หรือไม่

---

## 3) Dashboard Architecture
แนะนำให้แบ่งเป็น 10 หน้าหลัก + 1 executive overview เพื่อให้ใช้จริงง่าย ไม่ยัดทุกอย่างไว้หน้าเดียว

1. Executive Overview
2. User & Retention Dashboard
3. Profile & Taste Dashboard
4. Watchlist & Consumption Dashboard
5. Search & Discovery Dashboard
6. Social & Creator Dashboard
7. Battle Dashboard
8. Tierlist Dashboard
9. Party / Multiplayer Dashboard
10. Notification & Re-engagement Dashboard
11. Trust, Moderation & Catalog Health Dashboard

---

## 4) Global Filters
ทุกหน้า dashboard ควรมี filter มาตรฐานร่วมกัน:

- Date range: Today / 7D / 28D / 90D / Custom
- Granularity: Hour / Day / Week / Month
- User segment:
  - New users
  - Returning users
  - Public profile users
  - Private profile users
  - Heavy consumers
  - Creators
  - Social users
  - Battle-first users
  - Tierlist-first users
  - Party-first users
- Platform: Web / Mobile Web / App (ถ้ามี)
- Region / locale (ถ้ามี)
- Title type / content type
- Traffic source / preset source / recommendation source (ถ้ามี)

---

## 5) KPI Framework

### North Star Candidates
ควรเลือกอย่างใดอย่างหนึ่งเป็น North Star หลัก:

- Weekly Engaged Users (ผู้ใช้ที่ทำ meaningful action อย่างน้อย 1 อย่างต่อสัปดาห์)
- Weekly Content Interaction Sessions
- Weekly Returning Active Users

### Core KPI Layers

#### Layer A: Reach
- New users
- DAU / WAU / MAU
- Activated users

#### Layer B: Engagement
- Sessions per active user
- Consumption sessions per active user
- Searches per active user
- Social actions per active user
- Battle/Tierlist/Party starts per active user

#### Layer C: Retention
- D1 / D7 / D30 retention
- Streak participation
- Repeat search behavior
- Repeat feature usage

#### Layer D: Quality
- Completion rate
- CTR
- Publish rate
- Like/comment rate
- Notification open/read rate

#### Layer E: Risk / Ops
- Report rate
- Duplicate rate
- Merge backlog
- Unread overload

---

# 6) Detailed Dashboard Specs

## 6.1 Executive Overview Dashboard

### Goal
ให้ผู้บริหารเห็นภาพรวมของ product ภายใน 30 วินาที

### Required Sections

#### A. Top KPI Cards
- DAU
- WAU
- MAU
- New users
- Returning users
- Weekly engaged users
- Total content interactions
- Retention D7

**Recommended graph type:**
- KPI Cards with delta vs previous period
- Mini sparkline in each card

**Why:** เหมาะกับตัวเลขสรุปที่ต้องดูเร็วและเทียบ trend

#### B. Product Activity Trend
- Daily active users
- Daily engagement events
- Daily content sessions
- Daily UGC creation

**Recommended graph type:**
- Multi-series line chart

**Why:** ดู movement ของหลาย metric ตามเวลาได้ดีที่สุด

#### C. Feature Mix
- สัดส่วนผู้ใช้ที่ engage กับ Search / Social / Battle / Tierlist / Party / Watchlist

**Recommended graph type:**
- Stacked bar chart by week
- Alternative: 100% stacked area chart

**Why:** ใช้ดู composition ว่า feature mix เปลี่ยนไปอย่างไร

#### D. Retention Driver Snapshot
- Daily challenges usage
- Saved searches repeat usage
- Social follow adoption
- Public profile adoption

**Recommended graph type:**
- Horizontal bar chart ranked by retention lift or repeat-user rate

**Why:** เปรียบเทียบผลกระทบของ habit features ได้ชัด

#### E. Risk Signals
- Content reports
- Duplicate candidates backlog
- Notification unread pressure

**Recommended graph type:**
- KPI cards + threshold status badges
- Small line chart for anomaly detection

---

## 6.2 User & Retention Dashboard

### Goal
ดู lifecycle ของผู้ใช้ตั้งแต่สมัครจนกลับมาใช้งานต่อเนื่อง

### Sections

#### A. User Lifecycle Funnel
- Signup / first seen
- Profile created
- First list action
- First content session
- First search
- First social action
- First battle/tierlist/party start

**Recommended graph type:**
- Funnel chart

**Why:** เหมาะสำหรับหาจุด drop-off ตามลำดับขั้น

#### B. Retention Cohorts
- D1 / D7 / D14 / D30 retention by signup cohort

**Recommended graph type:**
- Cohort heatmap

**Why:** เป็นมาตรฐานที่ดีที่สุดสำหรับ retention cohort

#### C. Returning Behavior
- Sessions per retained user
- Feature reuse per retained user
- Median days between sessions

**Recommended graph type:**
- Line chart + box plot

**Why:** line ใช้ดู trend, box plot ใช้ดู distribution และ outlier

#### D. Habit Loop Metrics
- Daily challenge streak participation
- Saved search reuse
- Repeated consumption sessions
- Repeat battle deck usage

**Recommended graph type:**
- Grouped bar chart

**Why:** เปรียบเทียบ repeat behavior ข้าม habit mechanism ได้ดี

#### E. Segment Comparison
- New vs returning
- Discovery users vs tracking users
- Public profile vs private profile

**Recommended graph type:**
- Clustered bar chart

**Why:** เห็นความต่างระหว่าง segment ชัดเจน

---

## 6.3 Profile & Taste Dashboard

### Goal
วัดว่าผู้ใช้เผยตัวตนและ preference ชัดแค่ไหน และสิ่งนี้มีผลต่อ product performance อย่างไร

### Sections

#### A. Profile Completeness
- avatar filled
- bio filled
- favorite_moods filled
- top_titles filled
- public profile enabled

**Recommended graph type:**
- Completion funnel
- Donut chart for profile completeness tiers

**Why:** funnel ใช้ดู step completion, donut ใช้ดูสัดส่วนระดับ completion

#### B. Public Profile Adoption
- % public profiles
- % allow comments
- % active profile commenters

**Recommended graph type:**
- KPI card + trend line

#### C. Taste Signals Strength
- users with favorites
- users with reviews
- users with scores
- users with hidden titles
- users with favorite_moods

**Recommended graph type:**
- Horizontal bar chart

**Why:** เปรียบเทียบ signal coverage ได้ง่าย

#### D. Recommendation Preference Settings
- hide_seen_by_default
- prioritize_unseen
- exclude_completed_from_recs
- exclude_dropped_from_recs

**Recommended graph type:**
- Stacked bar by segment

**Why:** เหมาะกับ boolean setting distribution หลายกลุ่ม

#### E. Preference → Retention Correlation
- retention by users with strong taste profile vs weak taste profile

**Recommended graph type:**
- Box plot or grouped bar

**Why:** ใช้เปรียบเทียบ retention across cohorts

---

## 6.4 Watchlist & Consumption Dashboard

### Goal
ดูว่าผู้ใช้ track content อย่างไร และ consume จริงมากแค่ไหน

### Sections

#### A. Watchlist Funnel by Status
- planned
- watching / reading
- paused
- dropped
- completed

**Recommended graph type:**
- Funnel chart or Sankey diagram

**Why:** funnel ดีสำหรับสถานะหลัก, sankey ดีเมื่ออยากเห็น flow ระหว่าง status

#### B. Status Distribution
- status mix per active user

**Recommended graph type:**
- 100% stacked bar chart

#### C. Progression Behavior
- average progress updates per user
- progress velocity
- completion time

**Recommended graph type:**
- Line chart for velocity trend
- Histogram for completion time distribution

**Why:** line ใช้ดู trend, histogram เหมาะกับเวลาหรือจำนวนที่มี distribution กว้าง

#### D. Consumption Sessions
- sessions per active user
- avg session duration
- binge sessions
- quick-progress sessions
- daily / weekly cadence

**Recommended graph type:**
- Line chart for sessions over time
- Histogram for duration
- Calendar heatmap for daily cadence

**Why:** calendar heatmap เหมาะมากกับ habit pattern รายวัน

#### E. Dropout Analysis
- top titles dropped
- drop after how much progress
- drop by title type

**Recommended graph type:**
- Pareto chart for top dropped titles
- Box plot for drop progress distribution

**Why:** Pareto ช่วยหา few critical titles ที่สร้างปัญหามากสุด

---

## 6.5 Search & Discovery Dashboard

### Goal
วัดคุณภาพของ discovery layer และ search relevance

### Sections

#### A. Search Volume & Intent
- searches per day
- unique queries
- saved searches created
- repeated queries

**Recommended graph type:**
- Line chart
- Treemap for top intent groups

**Why:** treemap เหมาะกับการดู query clusters / intent share

#### B. Search Funnel
- search issued
- results shown
- result clicked
- title added / opened / played

**Recommended graph type:**
- Funnel chart

#### C. Query Quality
- zero-result rate
- low-CTR queries
- high-volume low-success queries

**Recommended graph type:**
- Scatter plot

**Why:** scatter เหมาะกับ plot volume vs CTR vs zero-result เพื่อหา bad queries

#### D. Ranking Quality
- click by result rank
- CTR by rank position
- preset_source performance

**Recommended graph type:**
- Line chart for CTR by rank
- Grouped bar chart by preset source

#### E. Saved Search Conversion
- saved search → reuse
- saved search → downstream engagement

**Recommended graph type:**
- Conversion funnel + cohort table

---

## 6.6 Social & Creator Dashboard

### Goal
ดู network effects, creator health, community quality และ social value ของ user-generated activity

### Sections

#### A. Social Graph Growth
- follows created
- avg following per user
- avg followers per creator

**Recommended graph type:**
- Line chart
- Histogram for follower distribution

#### B. Content Creation Activity
- social posts created
- posts with title link
- comments created
- likes created
- profile comments created

**Recommended graph type:**
- Multi-series line chart

#### C. Creator Leaderboard
- creators by followers
- creators by engagement received
- creators by post/comment depth

**Recommended graph type:**
- Ranked horizontal bar chart

**Why:** เหมาะกับ leaderboard มากที่สุด

#### D. Engagement Quality
- likes per post
- comments per post
- comment-to-post ratio
- engagement by title-linked posts vs general posts

**Recommended graph type:**
- Box plot + grouped bar chart

#### E. Community Health
- % users who post
- % users who comment
- % users who get engagement
- profile comment toxicity/report rate (ถ้ามี)

**Recommended graph type:**
- KPI cards + stacked bar by user segment

---

## 6.7 Battle Dashboard

### Goal
ดูว่าระบบ battle ขับ engagement และ preference graph ได้ดีแค่ไหน

### Sections

#### A. Battle Session Funnel
- battle started
- first vote cast
- session completed
- result shared / saved (ถ้ามี)

**Recommended graph type:**
- Funnel chart

#### B. Session Quality
- completion rate
- avg comparisons per session
- median session time
- skip rate

**Recommended graph type:**
- KPI cards + line trend

#### C. Deck Performance
- most played public decks
- most completed decks
- completion rate by deck
- play_count to completion conversion

**Recommended graph type:**
- Bubble chart or scatter plot

**Why:** plot play_count vs completion_rate vs avg_votes to find high-scale/high-quality decks

#### D. Filter / Deck Type Analysis
- performance by filters, source_count, entity type, deck size

**Recommended graph type:**
- Heatmap

**Why:** เหมาะกับการวิเคราะห์หลายมิติแบบ category × metric

#### E. Title Competitiveness
- wins / losses / total_votes / win_rate / elo_score

**Recommended graph type:**
- Scatter plot

**Why:** plot elo_score vs vote volume เพื่อแยก “popular” ออกจาก “strong”

#### F. Matchup Quality
- pair frequency
- skip-heavy pairs
- polarizing pairs

**Recommended graph type:**
- Matrix heatmap

**Why:** pairwise data เหมาะกับ matrix มากที่สุด

---

## 6.8 Tierlist Dashboard

### Goal
ดู performance ของ template, creation flow, publish behavior และ remix ecosystem

### Sections

#### A. Template Popularity
- plays by template
- official vs user-made performance
- plays over time

**Recommended graph type:**
- Ranked horizontal bar chart + trend line

#### B. Create → Publish Funnel
- template opened
- list created
- rows modified
- list published
- public engagement received

**Recommended graph type:**
- Funnel chart

#### C. Remix Ecosystem
- template to derived lists
- remix rate
- publish rate from remix

**Recommended graph type:**
- Sankey diagram

**Why:** เหมาะกับ source → derivative flow

#### D. List Engagement
- play_count
- comments
- likes (ถ้ามีอนาคต)
- visibility split

**Recommended graph type:**
- Scatter plot with play_count vs comments vs publish status

#### E. Row Preference Analysis
- item density per row
- common top-row items
- drop-off in ranking depth

**Recommended graph type:**
- Stacked bar chart / heatmap

---

## 6.9 Party / Multiplayer Dashboard

### Goal
วัดความสนุกและ friction ของ multiplayer, rooms, presets และ quiz content

### Sections

#### A. Room Funnel
- room created
- join request sent
- member joined
- answer submitted
- room completed

**Recommended graph type:**
- Funnel chart

#### B. Room Health
- avg members per room
- host vs guest completion
- answer latency
- participation rate

**Recommended graph type:**
- KPI cards + box plot for latency

#### C. Preset / Template Performance
- party_song_presets usage
- party_song_templates usage
- likes to play conversion

**Recommended graph type:**
- Scatter plot

**Why:** ช่วยแยก content ที่คนชอบกับ content ที่คนเล่นจริง

#### D. Title Guess Set Quality
- play_count
- clue effectiveness
- completion rate
- question difficulty

**Recommended graph type:**
- Heatmap by set × metric
- Histogram for difficulty distribution

#### E. Private Room Friction
- join request approval rate
- time to join
- drop before answering

**Recommended graph type:**
- Funnel + line chart

---

## 6.10 Notification & Re-engagement Dashboard

### Goal
ดูว่า notification ช่วยดึงผู้ใช้กลับมาได้จริงหรือกำลังกดดันผู้ใช้เกินไป

### Sections

#### A. Notification Volume
- notifications sent/generated by type
- notifications per active user

**Recommended graph type:**
- Stacked area chart

**Why:** เห็นทั้ง volume และ composition by type พร้อมกัน

#### B. Read / Unread Health
- unread rate
- median unread count per user
- unread aging

**Recommended graph type:**
- KPI cards + histogram for unread aging

#### C. Re-engagement Performance
- users returning after notification
- engagement by notification type
- read-to-action rate

**Recommended graph type:**
- Funnel chart or grouped bar

#### D. Attention Pressure
- notification overload cohorts
- retention by unread bucket

**Recommended graph type:**
- Box plot / grouped bar

---

## 6.11 Trust, Moderation & Catalog Health Dashboard

### Goal
ดูคุณภาพ community และ catalog hygiene เพื่อให้ระบบโตได้อย่างปลอดภัย

### Sections

#### A. Content Reports
- reports created by content type
- report backlog
- report resolution time

**Recommended graph type:**
- Stacked bar + line trend

#### B. Hotspot Detection
- top reported posts
- top reported comments
- top reported profiles/lists

**Recommended graph type:**
- Ranked bar chart

#### C. Duplicate Hygiene
- duplicate candidates opened
- merge actions completed
- unresolved duplicate backlog

**Recommended graph type:**
- Burn-down chart

**Why:** backlog management ใช้ burn-down ดีมาก

#### D. Editorial Surface Health
- homepage block CTR
- collection item engagement
- manual boost performance

**Recommended graph type:**
- Grouped bar chart / line trend

---

# 7) Dashboard Priority Roadmap

## Phase 1: Must-have
ควรทำก่อนเพื่อให้ product ตัดสินใจได้ไว

1. Executive Overview
2. User & Retention
3. Watchlist & Consumption
4. Search & Discovery
5. Battle Dashboard
6. Notification & Re-engagement

## Phase 2: Strongly recommended
7. Social & Creator
8. Tierlist
9. Party / Multiplayer

## Phase 3: Ops / Scale
10. Profile & Taste
11. Trust / Moderation / Catalog Health

---

# 8) Metric Definitions

## Active User
ผู้ใช้ที่มีอย่างน้อย 1 meaningful event ในช่วงเวลาที่กำหนด เช่น search, list change, content session, social interaction, battle vote, tierlist creation, party answer

## Engaged User
ผู้ใช้ที่มีอย่างน้อย 2 meaningful actions หรือทำ action เชิงลึก เช่น consumption session, comment, vote, publish, room participation

## Battle Completion Rate
`completed battle sessions / started battle sessions`

## Search CTR
`search events with result click / search events with result shown`

## Saved Search Reuse Rate
`users who reused a saved search / users who created a saved search`

## Publish Rate (Tierlist)
`public tierlist lists / created tierlist lists`

## Party Participation Rate
`users submitting at least 1 answer / joined room members`

## Notification Read Rate
`notifications marked is_read = true / notifications generated`

## Public Profile Adoption Rate
`users with is_profile_public = true / total active users`

---

# 9) Drill-down Requirements
ทุกหน้า dashboard ต้อง drill-down ได้อย่างน้อย 3 ระดับ:

### Level 1: Executive Summary
ตัวเลขรวม + trend

### Level 2: Segment Breakdown
เช่น new vs returning, creators vs non-creators, public vs private

### Level 3: Entity Detail
เช่น title, deck, template, query, creator, notification type, report type

ตัวอย่าง:
- Search dashboard: query family → normalized query → result type/result rank
- Battle dashboard: deck family → individual deck → title matchup
- Party dashboard: preset type → template → question/clue level

---

# 10) Recommended Visualization Rules

## Use line chart when
- metric เปลี่ยนตามเวลา
- ต้องดู trend, spike, seasonality
- เช่น DAU, searches/day, sessions/day, reports/day

## Use bar chart when
- ต้องเปรียบเทียบ category
- เช่น top creators, top templates, notification types

## Use stacked bar when
- ต้องดู composition ของ category
- เช่น status mix, notification types, public/private split

## Use 100% stacked bar when
- สัดส่วนสำคัญกว่าปริมาณ
- เช่น list statuses by user segment

## Use funnel when
- เป็นขั้นตอนต่อเนื่องมี conversion/drop-off
- เช่น onboarding, search, battle session, room join

## Use Sankey when
- มี flow ข้าม state หรือ source → destination
- เช่น template → remix, planned → watching → completed

## Use heatmap when
- มี matrix/cross-dimension
- เช่น cohort retention, deck filter performance, title matchups

## Use scatter plot when
- อยากดูความสัมพันธ์ระหว่าง 2-3 ตัวแปร
- เช่น search volume vs CTR, deck play_count vs completion_rate

## Use histogram when
- อยากดู distribution ของ duration/latency/score
- เช่น session duration, answer latency, unread aging

## Use box plot when
- ต้องการ median, spread, outlier
- เช่น completion time, session duration by segment

## Use treemap when
- ต้องการดู share ของหลาย intent/category พร้อมกัน
- เช่น top search intents, content category share

## Use calendar heatmap when
- วัด habit รายวัน
- เช่น consumption cadence, streak activity

---

# 11) UI / UX Requirements for Dashboard

## Layout
- ใช้ 12-column grid
- KPI cards ด้านบน
- trends กลางหน้า
- breakdown + tables ด้านล่าง
- sticky filter bar ด้านบน

## Interaction
- hover tooltip ทุกกราฟ
- click to drill-down
- compare with previous period
- export CSV / PNG
- save view / save filters

## States
- loading skeleton
- no-data state พร้อม explanation
- partial data warning
- metric definition tooltip

## Performance
- lazy load charts below fold
- server-side aggregation สำหรับกราฟใหญ่
- precompute rollups สำหรับ executive metrics
- จำกัด default date range เป็น 28 วัน
- table ใหญ่ใช้ virtualization

---

# 12) Data Modeling & Aggregation Recommendations

## Recommended Aggregate Tables / Materialized Views
ควรมีเพื่อให้ dashboard เร็ว:

- daily_active_user_rollup
- daily_feature_usage_rollup
- user_retention_cohorts
- search_query_rollup
- search_rank_ctr_rollup
- battle_deck_performance_rollup
- battle_matchup_rollup
- tierlist_template_rollup
- party_template_rollup
- notification_type_rollup
- moderation_report_rollup

## Granularity
- Daily for most product dashboards
- Hourly for operational dashboards และ near-realtime monitoring
- Weekly for executive rollups และ long-term trends

---

# 13) Near Realtime vs Batch Update Guidance

## Near Realtime (refresh every 30s–5m)
เหมาะกับ:
- Executive live usage today
- Notifications generated/read
- Moderation report queue
- Active party rooms
- Live battle starts

## Hourly Refresh
เหมาะกับ:
- Feature usage
- Search funnel
- Social activity
- Content creation metrics

## Daily Batch
เหมาะกับ:
- Retention cohorts
- Creator leaderboard
- Template popularity trend
- Profile completeness by cohort
- Deep watchlist funnel

---

# 14) Alerting Recommendations
ควรมี threshold alerts สำหรับ:

- DAU drop > 20% day-over-day
- zero-result search rate spike
- battle completion rate drop
- party room join failure spike
- report volume spike
- duplicate backlog above threshold
- unread notification pressure above threshold

**Recommended graph type for alert widgets:**
- KPI card + threshold badge + sparkline

---

# 15) Final Dashboard Build Recommendation
ถ้าจะเริ่มทำจริง แนะนำเริ่มจากชุดนี้ก่อน:

## Dashboard V1
1. Executive Overview
2. User & Retention
3. Watchlist & Consumption
4. Search & Discovery
5. Battle
6. Notification & Re-engagement

## Dashboard V2
7. Social & Creator
8. Tierlist
9. Party

## Dashboard V3
10. Profile & Taste
11. Trust / Moderation / Catalog Health

---

# 16) Summary of Most Important Pages

## หน้า 1: Executive Overview
เอาไว้ดู health ของ product ทั้งระบบ

## หน้า 2: User & Retention
เอาไว้ตอบว่า users อยู่ต่อไหม และเพราะอะไร

## หน้า 3: Watchlist & Consumption
เอาไว้ตอบว่า users consume จริงไหม ไม่ใช่แค่กด add list

## หน้า 4: Search & Discovery
เอาไว้ตอบว่าระบบหา content เก่งไหม

## หน้า 5: Battle
เอาไว้ตอบว่า game-like comparison engine ทำงานดีไหม

## หน้า 6: Social & Creator
เอาไว้ตอบว่า community กำลังโตหรือไม่

## หน้า 7: Tierlist
เอาไว้ตอบว่า UGC ranking content ใช้งานจริงไหม

## หน้า 8: Party
เอาไว้ตอบว่า multiplayer fun + friction เป็นอย่างไร

## หน้า 9: Notification
เอาไว้ตอบว่า notification ดึงคนกลับมาได้จริงไหม

## หน้า 10: Trust / Moderation
เอาไว้คุมคุณภาพ community และ catalog

---

# 17) Hand-off Prompt for AI / Design / Engineering
ใช้ข้อความนี้ส่งต่อให้ AI หรือทีมต่อได้ทันที:

> ออกแบบ Product Analytics Dashboard ตาม PRD นี้ โดยเน้น 10 หน้าหลัก: Executive, User & Retention, Profile & Taste, Watchlist & Consumption, Search & Discovery, Social & Creator, Battle, Tierlist, Party, Notification, Trust/Moderation. ทุกหน้าต้องมี KPI summary, trend section, segment breakdown, drill-down table, metric definitions, export capability, compare-to-previous-period และเลือกกราฟตามชนิดข้อมูลที่ระบุใน PRD นี้อย่างเคร่งครัด หลีกเลี่ยงการใช้ pie chart หากข้อมูลมีหลาย category และให้เน้น readability, quick scanning, sticky filters, และ performance-friendly loading.

