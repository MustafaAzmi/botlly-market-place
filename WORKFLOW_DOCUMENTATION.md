# Botly WhatsApp Workflow Documentation

## Customer Flow Overview (الفلو المُبسّط — بدون موقع)

### Phase 1: Entry & Welcome
**Trigger**: New customer (no active session)

**Response**: "هلا بيك في Botly. شنو تحب تسوي؟" + Button: "أريد منتج معين"

---

### Phase 2: Product Query (`awaiting_product_query`)
**Trigger**: Customer presses "أريد منتج معين"، OR `ACTION_NEW_SEARCH`, OR session phase = start

**Response**: "شنو المنتج الي تدور عليه؟ اكتب الاسم أو اللون أو السعر التقريبي."

**What Changed (June 2026)**:
- 🗑️ **REMOVED**: the entire location step (`awaiting_location`) and the
  WhatsApp location-request message. The bot never asks for the customer's
  location anymore.
- ✅ Search is **open nationwide** — no 15km radius (or any radius). Most
  sales are delivery, so distance is irrelevant.

---

### Phase 3: Search & Results (`awaiting_selection`)
**Trigger**: Customer types product name (min 2 chars) in `awaiting_product_query`

**Process**:
1. Parse intent from customer text (AI: typo/dialect correction + synonyms)
2. Search ALL products from ALL visible merchants (no geographic filter)
3. Show top 3 results with **images & price**
4. Buttons: 1️⃣ 2️⃣ 3️⃣ [More Results]

**Buttons**:
- `ACTION_MORE_RESULTS`: Show next 3 products
- Product selection (1, 2, 3 or text parsing)

---

### Phase 4: Product Selection & Order (`awaiting_after_selection`)
**Trigger**: Customer selects a product

**Response**:
- Product details (title, price, merchant)
- Buttons:
  - "اكمال الشراء" → three-step order form (name → landmark → governorate)
  - "رسالة للتاجر" → `ACTION_MESSAGE_MERCHANT` (notify merchant)

**Order Flow**:
- Asks customer name
- Asks landmark (جامع، شارع معروف) — typed text, NOT a GPS location
- Asks governorate
- Confirms order → notifies delivery company (if configured) + merchant

---

## Workflow Phases Map

```
┌─────────────────────────────────────────────┐
│         Customer Sends Message              │
└──────────────┬──────────────────────────────┘
               │
        ┌──────▼──────────────┐
        │  Existing Session?  │
        └─────┬──────────┬────┘
             YES         NO
              │           │
              │      ┌────▼──────────┐
              │      │  Start Phase  │
              │      │ "شنو تحب تسوي؟"│
              │      └────┬──────────┘
              │           │ (button)
        ┌─────▼───────────▼─────────┐
        │  awaiting_product_query   │
        │  Request: اسم المنتج؟     │
        └─────┬─────────────────────┘
              │ (customer types name)
        ┌─────▼──────────────────────┐
        │ Search & Show 3 Results    │
        │ awaiting_selection         │
        │ (nationwide, no radius)    │
        └─────┬────────────────────┬─┘
              │                    │
        ┌─────▼──┐         ┌──────▼─────┐
        │Selected│         │More Results│
        │Product │         └──────┬─────┘
        └─────┬──┘                │
              │      ┌────────────┘
        ┌─────▼──────▼────────────┐
        │ awaiting_after_selection│
        │ Order Form / Message    │
        └─────────────────────────┘
```

---

## Key Changes (June 2026)

### Location step removed entirely
❌ **REMOVED**:
- `awaiting_location` phase
- WhatsApp `location_request_message` (sendWhatsAppLocationRequest)
- `CustomerLocation` type, haversine distance math, `distanceKm`
- `findLastKnownLocation` session lookup
- 15km radius filter in product search

✅ **Search is now open**: every visible merchant's products are searchable
from anywhere — ranked by match quality only.

### Why?
- Most sales are **delivery** and can be cross-city/cross-governorate.
- The location request was an extra step that stalled customers.
- The order form already collects landmark + governorate as typed text.

### Migration
- Old sessions parked in `awaiting_location` are transparently mapped to
  `awaiting_product_query` when read — no broken sessions.
- Old session payloads containing `customerLocation` are simply ignored.

---

## Debug: How to Test

### Test Case 1: New Customer
```
1. Send any message
→ Bot: "هلا بيك في Botly. شنو تحب تسوي؟" [أريد منتج معين]
2. Tap button
→ Bot: "شنو المنتج الي تدور عليه؟"
3. Type "تيشيرت أحمر"
→ Bot: 3 results + prices + merchant names (no distance shown)
```

### Test Case 2: Returning Customer
```
1. Send message (active session in awaiting_product_query)
2. Type "جاكيت"
→ Bot: 3 results with images
```

---

## Common Issues & Fixes

### Issue: Workflow stuck in "awaiting_product_query"
**Cause**: Empty message, or <2 character search
**Fix**:
- Bot responds: "اكتب اسم المنتج بشكل أوضح"
- Stays in same phase, re-prompts

### Issue: Search returns 0 results
**Cause**: No matching products anywhere
**Fix**:
- Bot: "ما لكيت نفس الطلب، تحب أبحثلك عن بديل؟"
- Buttons: "بحث عن بديل" OR "بحث جديد"

---

## Performance Notes

### Database Access
- **Session Storage**: `botly_customer_session` — stores phase + search context
- **Outbound Guard**: `botly_outbound_guard` — prevents duplicate message spam (10 min window)
- **Product Search**: `botly_product` — event-sourced product list

### Message Guard
- Messages are deduplicated by `wa_message_id` (WhatsApp message ID)
- Prevents double-processing webhook retries
- Silent 200 response if duplicate

### Search
- Nationwide: all visible merchants, no geographic filter
- Limit: 10 products in memory, show 3 at a time
- Ranking: AI-corrected keyword match score (pg_trgm RPC or direct fallback)

---

## Code References

**Main Handler**: `src/routes/api/whatsapp/webhook.ts:handleButtonWorkflow()`

**Key Functions**:
- `readCustomerSession()` — Load session state (maps legacy awaiting_location)
- `writeCustomerSession()` — Update phase & context
- `searchProducts()` — Open nationwide search
- `extractSearchIntent()` — Parse customer query
- `sendWhatsAppText/Buttons/Image()` — Send messages
