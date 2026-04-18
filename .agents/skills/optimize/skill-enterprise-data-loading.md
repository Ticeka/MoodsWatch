# skill.md — Large Data Loading, Realtime Data, API Fetching, and Performance-First Web Rules

## Purpose

เอกสารนี้เป็นมาตรฐานสำหรับ AI/Developer ในการออกแบบระบบโหลดข้อมูลบนเว็บให้ **เร็ว, เสถียร, scalable, และรักษา UX ที่ลื่น** เมื่อทำงานกับ:

- ข้อมูลจำนวนมากระดับหลายหมื่นถึงหลายแสน record
- ข้อมูลที่เปลี่ยนตลอดเวลา เช่น dashboard, chat, feed, market data, notification
- การดึงข้อมูลจาก API ภายนอก/ภายใน
- หน้าเว็บที่ต้อง balance ระหว่าง freshness กับ performance

เป้าหมายหลัก:

1. ลดจำนวน request ที่ไม่จำเป็น
2. ลดงานบน main thread
3. ลด re-render และ DOM ที่ใหญ่เกินไป
4. โหลดเฉพาะข้อมูลที่จำเป็นก่อน
5. ทำให้ผู้ใช้รู้สึกว่า “เร็ว” แม้ข้อมูลจริงจะใหญ่
6. ทำให้ระบบรองรับ traffic และ growth ได้ในอนาคต

---

# 1) Core Principles

## 1.1 Fetch as little as possible

ห้ามโหลดทุกอย่างตั้งแต่แรกถ้ายังไม่จำเป็น

ให้ใช้แนวคิดต่อไปนี้:

- โหลดเฉพาะ field ที่ต้องใช้จริง
- ทำ pagination / cursor pagination แทนการโหลดทั้ง dataset
- ใช้ filtering, sorting, search ที่ฝั่ง server ถ้า dataset ใหญ่
- ใช้ projection/select field เพื่อลด payload
- แยก “summary endpoint” กับ “detail endpoint”

ตัวอย่าง:

- หน้า list ใช้แค่ `id, title, status, updatedAt`
- หน้า detail ค่อยโหลด `description, logs, relations, attachments`

## 1.2 Prefer server-side work over client-side heavy work

ถ้าข้อมูลเยอะ:

- sort/filter/search/aggregate ที่ server ก่อน
- อย่าโยน raw dataset 50,000 records มาให้ browser แล้วค่อย filter เอง
- browser ควรรับข้อมูลที่ “พร้อมแสดงผล” มากที่สุด

## 1.3 Render less DOM

ปัญหาหลักของหน้าที่ช้าบ่อยครั้งไม่ใช่ fetch อย่างเดียว แต่เป็นการ render DOM จำนวนมากเกินไป

ดังนั้น:

- list ยาวมากต้องใช้ virtualization
- table ใหญ่ต้องใช้ windowing
- component หนักต้อง split/lazy load
- ซ่อน section ที่ยังไม่เห็นด้วย conditional render

## 1.4 Freshness must match business need

ห้ามรีเฟรชข้อมูลถี่เกินกว่าความจำเป็น

ตัวอย่างการกำหนด freshness:

- static content: revalidate ทุก 1 ชั่วโมง–1 วัน
- dashboard ทั่วไป: 15–60 วินาที
- operations screen: 3–10 วินาที
- chat/live feed: realtime via WebSocket/SSE
- stock ticker / multiplayer / presence-critical: realtime push หรือ polling ถี่แบบมีเหตุผล

## 1.5 Avoid duplicate fetching

ห้ามให้ component หลายตัวเรียก endpoint เดียวกันซ้ำโดยไม่จำเป็น

ต้องมี:

- shared cache layer
- request deduplication
- normalized query keys
- prefetch เฉพาะจุดสำคัญ

## 1.6 Optimize perceived performance, not only raw speed

ผู้ใช้รับรู้ความเร็วจากสิ่งที่เห็นบนจอ

ต้องมี:

- skeleton/loading placeholder
- progressive rendering
- stream/partial rendering
- optimistic update เมื่อเหมาะสม
- background refresh แทน blocking UI

---

# 2) Decision Matrix — เลือกวิธีโหลดข้อมูลแบบไหน

## 2.1 Static / rarely changing data

ใช้เมื่อ:

- FAQ
- landing content
- category list ที่แทบไม่เปลี่ยน
- config ที่ไม่ต้อง realtime

ควรใช้:

- Server rendering with cache
- Static generation
- Revalidation ตามรอบเวลา

ห้าม:

- fetch ทุกครั้งบน client ถ้าไม่จำเป็น

## 2.2 Dynamic but not realtime

ใช้เมื่อ:

- dashboard ปกติ
- report list
- order list
- admin table

ควรใช้:

- server-side fetch + cache
- client cache library
- polling เป็นช่วงเวลา
- invalidate/refetch เมื่อ user ทำ action

## 2.3 Realtime, one-way updates from server

ใช้เมื่อ:

- live notifications
- monitoring feed
- score stream
- event stream

ควรใช้:

- SSE (Server-Sent Events) ถ้าฝั่ง client mainly receive อย่างเดียว
- fallback polling เมื่อ network/proxy ไม่เหมาะกับ persistent stream

## 2.4 Realtime, two-way interaction

ใช้เมื่อ:

- chat
- collaboration
- live cursor/state sync
- game / bidding / presence

ควรใช้:

- WebSocket
- event batching
- reconnect strategy
- server authoritative state เมื่อ consistency สำคัญ

## 2.5 Massive list / table (10,000+ rows)

ควรใช้พร้อมกัน:

- cursor pagination หรือ infinite loading
- virtualization/windowing
- server-side sort/filter/search
- memoized row rendering
- sticky summary/toolbar แยกจาก list body

---

# 3) API Design Rules for High Performance

## 3.1 Design endpoints by screen use-case

อย่าออกแบบ API แบบ generic จน frontend ต้องโหลดเกินจำเป็น

ควรมี endpoint ตาม use-case เช่น:

- `GET /products?cursor=...&limit=20&sort=-updatedAt`
- `GET /products/:id`
- `GET /dashboard/summary`
- `GET /dashboard/metrics`

## 3.2 Use cursor pagination over offset for large mutable lists

ถ้า list ใหญ่และข้อมูลมีการ insert/delete ตลอด:

ให้ prefer **cursor pagination** เพราะเสถียรกว่า offset และเหมาะกับ infinite scroll

ใช้ offset ได้เมื่อ:

- dataset เล็ก
- หน้า report คงที่
- pagination แบบ page number สำคัญมาก

## 3.3 Return metadata needed for UI

API ควรคืนข้อมูลที่ frontend ต้องใช้ตัดสินใจต่อ เช่น:

```json
{
  "items": [],
  "nextCursor": "abc123",
  "hasMore": true,
  "total": 12453,
  "serverTime": "2026-04-08T12:00:00Z"
}
```

## 3.4 Support field selection when useful

เช่น:

- `?fields=id,name,status`
- GraphQL selection set
- backend projection

เพื่อไม่ส่ง payload หนักเกินไป

## 3.5 Compress responses

เปิดใช้:

- gzip หรือ brotli
- HTTP caching headers เมื่อเหมาะสม
- CDN สำหรับ public/cacheable endpoints

## 3.6 Separate hot data from cold data

ตัวอย่าง:

- hot: status, counters, live metrics
- cold: description, audit log, historical detail

โหลด hot ก่อน และ lazy-load cold ตาม interaction

---

# 4) Fetching Strategy Rules

## 4.1 Prefer framework/server fetching first

ถ้าใช้ modern framework ให้ใช้ data fetching ของ framework ก่อนการ fetch แบบ manual ใน component

เหตุผล:

- cache ได้ดีกว่า
- stream/SSR ได้
- ลด waterfall
- ลด loading state ซ้อนหลายชั้น

## 4.2 Do not fetch inside many nested child components blindly

ปัญหา:

- เกิด request waterfall
- debug ยาก
- cache key แตกกระจาย

แนวทางที่ดีกว่า:

- fetch ระดับ page/route/layout เมื่อเป็น shared data
- ให้ child รับ data ผ่าน props/context/query cache
- child fetch เองเฉพาะข้อมูลที่เฉพาะทางจริง ๆ

## 4.3 Always support cancellation

ทุก request ที่อาจหมดความจำเป็นระหว่างทางต้อง abort ได้ เช่น:

- user เปลี่ยนหน้า
- user พิมพ์ search ใหม่
- component unmount
- request ใหม่มาแทน request เก่า

## 4.4 Prevent race conditions

เช่น search box:

- request คำว่า `ap`
- ต่อด้วย `app`
- ต่อด้วย `apple`

ต้องมั่นใจว่า result เก่าจะไม่มา overwrite result ใหม่

วิธีทำ:

- AbortController
- query library ที่จัดการ state ให้
- sequence/token checking

## 4.5 Debounce user-driven fetch

ใช้ debounce กับ:

- search input
- autocomplete
- filter ที่พิมพ์ต่อเนื่อง

ค่าแนะนำ:

- search text: 250–400 ms
- expensive search/API ภายนอก: 400–800 ms

## 4.6 Throttle high-frequency refresh triggers

ใช้ throttle กับ:

- scroll-bound fetch trigger
- resize-driven recalculation
- metrics refresh ที่มาจาก interaction ถี่

---

# 5) Caching Rules

## 5.1 Every data source must have a freshness policy

ห้าม fetch โดยไม่มี policy

กำหนดทุก query ว่า:

- fresh ได้นานเท่าไร (`staleTime`)
- เก็บใน cache นานเท่าไร (`gcTime` / cache retention)
- refetch เมื่อไร
- invalidation เกิดจาก event อะไร

## 5.2 Suggested cache policy presets

### A) Static reference data

ตัวอย่าง: จังหวัด, หมวดหมู่, role list

- staleTime: 1 hour – 24 hours
- gcTime: หลายชั่วโมงถึงทั้ง session
- refetchOnWindowFocus: false

### B) Normal dashboard data

- staleTime: 15–60 seconds
- gcTime: 5–30 minutes
- refetchOnWindowFocus: false หรือ true เฉพาะจอสำคัญ

### C) Admin table/list

- staleTime: 30–120 seconds
- gcTime: 10–30 minutes
- invalidate หลัง create/update/delete

### D) User profile/session-scoped data

- staleTime: 5–15 minutes
- refetchOnWindowFocus: true ได้ถ้าส่งผลกับสิทธิ์/สถานะ

### E) Live metrics

- ไม่ควรพึ่ง cache อย่างเดียว
- ใช้ polling หรือ push channel
- ถ้ามี snapshot endpoint ให้ cache สั้นมาก เช่น 1–5 วินาที

## 5.3 Prefer stale-while-revalidate behavior

หลักการ:

- แสดงข้อมูล cache ทันที
- รีเฟรชเบื้องหลัง
- UI ไม่กระตุก

เหมาะกับเกือบทุกหน้า non-critical realtime

## 5.4 Invalidate with intent, not randomly

invalidate เมื่อ:

- user mutation สำเร็จ
- websocket event แจ้งว่าข้อมูลเปลี่ยน
- route change ไปบริบทใหม่
- auth/session เปลี่ยน

ห้าม:

- invalidate ทุกอย่างทุกครั้ง
- refetch ทั้งแอปหลัง action เล็กน้อย

---

# 6) Realtime Data Rules

## 6.1 Choose the right transport

### Use polling when:

- implement ง่าย
- ไม่ต้อง realtime ระดับวินาทีต่อวินาที
- infra ยังไม่พร้อมสำหรับ persistent connections
- ข้อมูลเปลี่ยนเป็นช่วง ๆ

### Use SSE when:

- server -> client one-way
- ต้องการ stream event ต่อเนื่อง
- implementation ต้องเบากว่า WebSocket

### Use WebSocket when:

- ต้องสื่อสารสองทาง
- latency สำคัญ
- ต้อง sync state ต่อเนื่อง

## 6.2 Polling rules

ห้าม polling แบบถี่ตลอดเวลาโดยไม่สนบริบท

ต้องมี:

- pause เมื่อ tab ไม่ active (ยกเว้นจอ critical)
- pause เมื่อ offline
- exponential backoff เมื่อ error
- jitter เพื่อลด thundering herd
- เปลี่ยน interval ตาม screen importance

ค่าตัวอย่าง:

- dashboard ปกติ: 30s
- ops dashboard: 5s
- order tracking: 3–10s
- analytics summary: 60–300s

## 6.3 Realtime connection rules

สำหรับ WebSocket/SSE:

- reconnect อัตโนมัติแบบ backoff
- แยก connection state: connecting / open / degraded / closed
- อย่าให้ event ทุกตัว trigger full refetch ทั้งหน้า
- patch cache เฉพาะส่วนที่เปลี่ยนเมื่อเป็นไปได้
- batch event ที่ถี่มาก
- limit frequency ของ UI state updates

## 6.4 Hybrid model is often best

แนวทางที่ดีมาก:

- initial snapshot จาก HTTP API
- update ต่อด้วย WebSocket/SSE
- fallback polling ถ้า socket หลุด

วิธีนี้ทำให้ initial load ง่ายและ recovery เสถียร

---

# 7) Large Dataset Rules (10k–100k+ items)

## 7.1 Never render all rows at once

ถ้า list/table ใหญ่ ห้าม render ทุก row พร้อมกัน

ต้องใช้:

- virtualization/windowing
- paginated fetch
- infinite loading แบบแบ่งหน้า

## 7.2 Search/filter/sort on server

สำหรับข้อมูลหลายหมื่น record:

- search บน server
- sort บน server
- filter บน server
- aggregate/count บน server

client-side only เมื่อ dataset เล็กจริงหรือเป็น subset ที่โหลดมาแล้ว

## 7.3 Keep row components extremely cheap

row component ควร:

- pure/memoized เมื่อจำเป็น
- ไม่สร้าง object/function ใหม่จำนวนมากทุก render
- ไม่มี expensive formatting ซ้ำ ๆ
- precompute value ที่ทำได้

## 7.4 Use progressive disclosure

อย่าโชว์ทุกอย่างในแต่ละแถว

ให้แสดงแค่:

- primary info
- secondary status
- action สำคัญ

ส่วน detail ให้ expand/lazy-load

## 7.5 Chunk expensive client processing

ถ้ามีงานหนัก เช่น parse, transform, aggregate:

- ทำฝั่ง server ก่อนถ้าได้
- หรือย้ายไป Web Worker
- หรือแบ่งงานเป็น chunk เพื่อไม่ block main thread

---

# 8) UI/UX Rules for Performance

## 8.1 Loading states must be specific

แยก loading state ให้ชัด:

- initial loading
- background refreshing
- loading next page
- mutation pending
- reconnecting realtime channel

ห้ามใช้ spinner เดียวแทนทุกสถานะ

## 8.2 Skeletons are preferred over layout shifts

ใช้ skeleton ที่มีขนาดใกล้ของจริง

หลีกเลี่ยง:

- content กระโดด
- table กระพริบหายทั้งก้อนเวลาระหว่าง refetch

## 8.3 Preserve old data during refetch

เมื่อ query key เปลี่ยนแบบใกล้เคียงกัน เช่น filter/page/search:

- เก็บข้อมูลเก่าไว้ชั่วคราวถ้า UX เหมาะสม
- แสดง transition state แทน blank screen

## 8.4 Infinite scroll is not always the best choice

ใช้ infinite scroll เมื่อ:

- feed/stream/content discovery

ใช้ pagination ชัดเจนเมื่อ:

- admin table
- audit logs
- หน้า report
- งานที่ผู้ใช้ต้องกลับมาหน้าเดิมหรือแชร์ตำแหน่งข้อมูล

## 8.5 Preload only what users are likely to need next

เช่น:

- prefetch หน้า next page เมื่อใกล้ scroll ถึงท้าย
- prefetch detail เมื่อ hover row/card (ถ้า cost ไม่สูง)
- prefetch route ที่ user มีแนวโน้มคลิกสูง

ห้าม prefetch ทุกอย่าง

---

# 9) Error Handling and Resilience

## 9.1 Distinguish error types

ต้องแยกอย่างน้อย:

- network error
- timeout
- unauthorized/forbidden
- validation error
- rate limit
- server error
- stale connection/realtime disconnect

## 9.2 Support retries intelligently

- GET/list/read: retry ได้
- mutation บางอย่าง: retry อย่างระวัง
- ใช้ exponential backoff
- อย่า retry ถี่จนกลายเป็น DDoS client-side

## 9.3 Handle rate limits gracefully

เมื่อเจอ 429 หรือ upstream throttle:

- อ่าน `Retry-After` ถ้ามี
- ลดความถี่ polling
- queue/reduce duplicate requests
- แจ้ง user แบบไม่ตื่นตกใจ

## 9.4 Offline-aware behavior

ควรมี:

- detect offline
- pause refetch ตอน offline
- resume เมื่อ online
- แสดง badge หรือ banner ว่าข้อมูลอาจไม่ล่าสุด

---

# 10) Mutation Rules

## 10.1 Mutations must update cache intentionally

หลัง create/update/delete ต้องเลือกอย่างใดอย่างหนึ่ง:

- optimistic update
- patch cache
- invalidate เฉพาะ query ที่เกี่ยวข้อง
- refetch เฉพาะส่วนจำเป็น

## 10.2 Prefer optimistic UI for fast-feeling interactions

เหมาะกับ:

- toggle status
- like/favorite
- append chat message
- local form edits บางประเภท

ไม่เหมาะเมื่อ:

- server validation complex มาก
- business rules อาจ reject สูง
- consistency ต้อง strict มาก

## 10.3 Avoid full-list refetch after tiny mutation if patching is easy

ตัวอย่าง:

- เปลี่ยน status row เดียว
- update cache row เดียวดีกว่า refetch 10,000 rows

---

# 11) Search, Filter, and Table Rules

## 11.1 Search strategy

### Small dataset in memory

ใช้ client-side search ได้

### Large dataset or remote source

ใช้ server-side search + debounce + cache by query key

## 11.2 Filter strategy

- filters ที่เปลี่ยนบ่อยควร map เป็น URL/search params
- query key ต้องรวม filter state ที่สำคัญ
- reset pagination เมื่อ filter เปลี่ยน

## 11.3 Table strategy

ถ้า table ใหญ่:

- virtualized rows
- sticky header
- fixed or predictable row height ถ้าทำได้
- server sorting/filtering
- export แยก endpoint อย่าดึงทั้งหมดมาบนหน้าเพื่อ export

---

# 12) Performance Budgets

ทุกโปรเจกต์ควรกำหนด budget คร่าว ๆ

ตัวอย่าง:

- initial critical API payload ต่อหน้า: ไม่เกิน 50–200 KB ถ้าเป็นไปได้
- initial visible rows: render เฉพาะที่เห็น + overscan เล็กน้อย
- main-thread heavy work ต่อ interaction: หลีกเลี่ยง long tasks
- number of simultaneous startup requests: จำกัดเท่าที่จำเป็น

---

# 13) Instrumentation and Monitoring

ต้องวัด ไม่ใช่เดา

เก็บ metrics อย่างน้อย:

- API latency p50 / p95 / p99
- payload size
- error rate
- cache hit ratio
- re-render frequency ของ component ใหญ่
- long tasks / responsiveness
- INP / LCP / CLS / TTFB ตามบริบท

ต้อง log event สำคัญ:

- query fail
- reconnect socket
- polling paused/resumed
- rate limit hit
- dropped events / duplicate events

---

# 14) Default Patterns by Use Case

## 14.1 Admin list (10k+ rows)

ใช้ pattern นี้:

- server-side pagination or cursor
- server-side sort/filter/search
- virtualized rows
- cache 30–120s
- preserve previous data when changing page/filter
- export via separate backend job/endpoint

## 14.2 Analytics dashboard

ใช้ pattern นี้:

- server-rendered summary where possible
- cache 30–300s ตาม widget
- widgets แยก query key
- polling เฉพาะ widget ที่จำเป็น
- chart data lazy-load เมื่อ widget เข้า viewport หรือ section เปิด

## 14.3 Chat / live feed

ใช้ pattern นี้:

- initial snapshot via HTTP
- live updates via WebSocket/SSE
- message/event batching
- virtualized message list
- optimistic send
- reconcile with server ack

## 14.4 Search page

ใช้ pattern นี้:

- debounce 250–400ms
- cancel previous request
- keep previous results while loading next query เมื่อเหมาะสม
- cache by normalized query params
- server-side ranking/filtering

## 14.5 Detail page with tabs

ใช้ pattern นี้:

- load critical summary first
- non-active tabs lazy fetch
- prefetch next likely tab if confidence สูง
- separate “activity log” endpoint from summary endpoint

---

# 15) Anti-Patterns — สิ่งที่ห้ามทำ

## 15.1 ห้าม fetch ในทุก component แบบกระจัดกระจายโดยไม่มี strategy
## 15.2 ห้ามโหลดทั้ง dataset หลายหมื่น record มา filter หน้า browser ถ้าไม่จำเป็น
## 15.3 ห้าม render DOM หลักหมื่น node พร้อมกัน
## 15.4 ห้าม refetch ทุกครั้งที่ window focus ถ้าจอไม่ได้ต้อง fresh มาก
## 15.5 ห้าม polling ทุก 1 วินาทีทั้งระบบโดยไม่มีเหตุผล
## 15.6 ห้าม invalidate ทั้ง cache หลัง mutation เล็กน้อย
## 15.7 ห้ามใช้ spinner ใหญ่ปิดทั้งหน้าเวลาทำ background refresh
## 15.8 ห้ามปล่อย request เก่า overwrite request ใหม่
## 15.9 ห้าม parse/transform ข้อมูลหนัก ๆ ใน render โดยตรง
## 15.10 ห้ามทำ realtime ผ่าน full refetch ทั้งหน้าในทุก event

---

# 16) Reference Implementation Rules for AI

เมื่อ AI สร้างระบบโหลดข้อมูล ให้ทำตาม checklist นี้:

## Fetching

- ใช้ framework-native/server fetching ก่อน
- ใช้ client query library สำหรับ cache/revalidation
- มี abort/cancel request
- มี timeout strategy
- แก้ race condition

## Data shape

- ใช้ paginated/cursor response เมื่อ list ใหญ่
- แยก summary vs detail
- ลด payload ให้เหลือ field ที่จำเป็น

## UI

- มี skeleton
- มี background refresh state
- มี empty state, error state, retry state
- preserve data เดิมระหว่าง refetch เมื่อ UX เหมาะ

## Large list

- ใช้ virtualization
- server-side sort/filter/search
- row component เบา

## Realtime

- เลือก polling/SSE/WebSocket ตาม use-case
- มี reconnect + backoff
- patch cache เฉพาะส่วนที่เปลี่ยน
- ไม่ full reload ทั้งหน้า

## Monitoring

- วัด latency, errors, cache hit, render cost
- log reconnect / rate limit / retries

---

# 17) Suggested Default Configs

## 17.1 TanStack Query style defaults

> ปรับตามความสำคัญของข้อมูลเสมอ

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
  },
});
```

### Suggested per-query overrides

```ts
useQuery({
  queryKey: ['reference-data'],
  queryFn: fetchReferenceData,
  staleTime: 60 * 60_000,
  gcTime: 6 * 60 * 60_000,
  refetchOnWindowFocus: false,
});

useQuery({
  queryKey: ['dashboard-summary'],
  queryFn: fetchDashboardSummary,
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  refetchInterval: 30_000,
});

useQuery({
  queryKey: ['search', normalizedParams],
  queryFn: () => searchApi(normalizedParams),
  staleTime: 15_000,
  gcTime: 10 * 60_000,
});
```

## 17.2 Abortable fetch helper

```ts
export async function fetchJSON<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

## 17.3 Debounced remote search

```ts
const [rawQuery, setRawQuery] = useState('');
const debouncedQuery = useDebounce(rawQuery, 300);

const query = useQuery({
  queryKey: ['users-search', debouncedQuery],
  queryFn: () => fetchUsers({ q: debouncedQuery }),
  enabled: debouncedQuery.trim().length >= 2,
  staleTime: 15_000,
});
```

## 17.4 Infinite query for large lists

```ts
const query = useInfiniteQuery({
  queryKey: ['orders', filters],
  queryFn: ({ pageParam }) => fetchOrders({ cursor: pageParam, ...filters }),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  staleTime: 30_000,
});
```

## 17.5 WebSocket hybrid model

```ts
// 1) Initial snapshot via HTTP
const snapshot = await fetchJSON('/api/room/123/messages?limit=50');

// 2) Subscribe for incremental updates
const ws = new WebSocket('wss://example.com/realtime');

ws.onmessage = (event) => {
  const patch = JSON.parse(event.data);
  // patch cache only where needed
};

ws.onclose = () => {
  // reconnect with exponential backoff
};
```

---

# 18) AI Output Requirements

เมื่อ AI สร้าง code/data layer ให้ยึดรูปแบบนี้:

1. อธิบายว่าข้อมูลแต่ละก้อนเป็น static, dynamic, หรือ realtime
2. ระบุว่าควรใช้ SSR/SSG/cache/client query/polling/WebSocket/SSE อะไร
3. ระบุ staleTime / gcTime / refetch policy
4. ระบุว่าต้อง pagination หรือ virtualization หรือไม่
5. ระบุ loading/error/empty/background-refresh UX
6. ระบุ mutation strategy: optimistic, patch, invalidate
7. ระบุ monitoring metrics ที่ควรเก็บ
8. หลีกเลี่ยง anti-pattern ข้างต้นทั้งหมด

---

# 19) One-Page Summary

ถ้าต้องการเว็บที่ performance ดีมาก ให้ยึดประโยคนี้:

- **โหลดให้น้อยที่สุด**
- **render ให้น้อยที่สุด**
- **cache อย่างมีนโยบาย**
- **realtime เท่าที่จำเป็น**
- **จัดการ request ซ้ำ, race condition, และ abort ให้ครบ**
- **ให้ server ทำงานหนักแทน browser เมื่อข้อมูลใหญ่**
- **ใช้ virtualization กับ list ใหญ่เสมอ**
- **วัดผลจริงด้วย metrics ไม่ใช่เดา**

---

# 20) References

หลักการในเอกสารนี้อิงจาก best practices ของ React, Next.js, TanStack Query, MDN และ web.dev เกี่ยวกับ:

- React data fetching / Effects
- Next.js data fetching, caching, revalidation, ISR
- TanStack Query defaults, refetch behavior, SSR/hydration
- MDN Fetch API, AbortController, WebSocket, Server-Sent Events
- web.dev เรื่อง virtualization, long tasks, responsiveness, INP

